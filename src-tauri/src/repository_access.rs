use crate::error::{AppError, AppErrorCode};
use crate::git::{self, CancellationToken, ExecutionPolicy};
use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread::ThreadId;
use std::time::Duration;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PathIdentity {
    backend_path: PathBuf,
    match_key: String,
    aliases: Vec<PathBuf>,
}

impl PathIdentity {
    pub(crate) fn new(path: &Path) -> Result<Self, AppError> {
        let absolute = path.canonicalize().map_err(|_| {
            AppError::new(AppErrorCode::PathUnusable, "That folder can't be resolved.")
                .with_remediation("Check the folder permissions and try again.")
        })?;
        let mut aliases = vec![absolute.clone()];
        if path.is_absolute() && path != absolute {
            aliases.push(path.to_path_buf());
        }
        aliases.sort();
        aliases.dedup();
        Ok(Self {
            match_key: comparison_key(&absolute),
            backend_path: display_backend_path(absolute),
            aliases,
        })
    }

    pub(crate) fn backend_path(&self) -> &Path {
        &self.backend_path
    }

    pub(crate) fn match_key(&self) -> &str {
        &self.match_key
    }

    #[allow(dead_code)]
    pub(crate) fn matches(&self, path: &Path) -> bool {
        self.aliases.iter().any(|alias| alias == path)
            || path
                .canonicalize()
                .is_ok_and(|canonical| comparison_key(&canonical) == self.match_key)
    }
}

#[cfg(target_os = "windows")]
fn display_backend_path(path: PathBuf) -> PathBuf {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = value.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path
    }
}

#[cfg(not(target_os = "windows"))]
fn display_backend_path(path: PathBuf) -> PathBuf {
    path
}

fn comparison_key(path: &Path) -> String {
    let value = display_backend_path(path.to_path_buf())
        .to_string_lossy()
        .replace('\\', "/");
    #[cfg(target_os = "windows")]
    {
        value.to_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        value
    }
}

#[derive(Clone, Debug)]
pub(crate) struct RepositoryContext {
    pub(crate) worktree_root: PathIdentity,
    pub(crate) git_dir: PathIdentity,
    pub(crate) common_git_dir: PathIdentity,
    pub(crate) bare: bool,
}

impl RepositoryContext {
    pub(crate) fn from_parts(
        worktree_root: &Path,
        git_dir: &Path,
        common_git_dir: &Path,
        bare: bool,
    ) -> Result<Self, AppError> {
        Ok(Self {
            worktree_root: PathIdentity::new(worktree_root)?,
            git_dir: PathIdentity::new(git_dir)?,
            common_git_dir: PathIdentity::new(common_git_dir)?,
            bare,
        })
    }

    pub(crate) fn discover(path: &Path) -> Result<Self, AppError> {
        let policy = ExecutionPolicy::repository_read("repository_context");
        let run = |args: &[&str]| -> Result<String, AppError> {
            let output = git::run(Some(path), args, policy, None)?;
            if !output.status.success() {
                return Err(AppError::new(
                    AppErrorCode::NotRepository,
                    "This folder isn't inside a Git project.",
                ));
            }
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        };
        let bare = run(&["rev-parse", "--is-bare-repository"])? == "true";
        let root = if bare {
            path.to_path_buf()
        } else {
            PathBuf::from(run(&["rev-parse", "--show-toplevel"])?)
        };
        let git_dir = PathBuf::from(run(&["rev-parse", "--absolute-git-dir"])?);
        let common_raw = PathBuf::from(run(&["rev-parse", "--git-common-dir"])?);
        let common = if common_raw.is_absolute() {
            common_raw
        } else {
            path.join(common_raw)
        };
        Self::from_parts(&root, &git_dir, &common, bare)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum AccessMode {
    Read,
    Write,
}

#[derive(Debug)]
struct Waiter {
    ticket: u64,
    mode: AccessMode,
    thread: ThreadId,
}

#[derive(Default, Debug)]
struct LockState {
    next_ticket: u64,
    readers: usize,
    writer: bool,
    queue: VecDeque<Waiter>,
}

#[derive(Default, Debug)]
struct FairLock {
    state: Mutex<LockState>,
    changed: Condvar,
}

thread_local! {
    static HELD_KEYS: RefCell<Vec<(String, AccessMode)>> = const { RefCell::new(Vec::new()) };
}

pub(crate) fn held_mode(key: &str) -> Option<AccessMode> {
    HELD_KEYS.with(|keys| {
        keys.borrow()
            .iter()
            .rev()
            .find_map(|(held, mode)| (held == key).then_some(*mode))
    })
}

impl FairLock {
    fn acquire(
        self: &Arc<Self>,
        key: &str,
        mode: AccessMode,
        cancellation: Option<&CancellationToken>,
    ) -> Result<AccessGuard, AppError> {
        let reentered = HELD_KEYS.with(|keys| keys.borrow().iter().any(|(held, _)| held == key));
        if reentered {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "GitOdrile detected a nested repository access request.",
            ));
        }
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let ticket = state.next_ticket;
        state.next_ticket += 1;
        state.queue.push_back(Waiter {
            ticket,
            mode,
            thread: std::thread::current().id(),
        });
        loop {
            if cancellation.is_some_and(CancellationToken::is_cancelled) {
                state.queue.retain(|waiter| waiter.ticket != ticket);
                self.changed.notify_all();
                return Err(AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "The repository operation was cancelled before it started.",
                ));
            }
            let position = state
                .queue
                .iter()
                .position(|waiter| waiter.ticket == ticket);
            let can_enter = match (position, mode) {
                (Some(0), AccessMode::Write) => !state.writer && state.readers == 0,
                (Some(index), AccessMode::Read) => {
                    !state.writer
                        && !state
                            .queue
                            .iter()
                            .take(index)
                            .any(|waiter| waiter.mode == AccessMode::Write)
                }
                _ => false,
            };
            if can_enter {
                let waiter = state.queue.remove(position.unwrap()).unwrap();
                debug_assert_eq!(waiter.thread, std::thread::current().id());
                match mode {
                    AccessMode::Read => state.readers += 1,
                    AccessMode::Write => state.writer = true,
                }
                HELD_KEYS.with(|keys| keys.borrow_mut().push((key.to_string(), mode)));
                return Ok(AccessGuard {
                    lock: Arc::clone(self),
                    key: key.to_string(),
                    mode,
                });
            }
            let (next, _) = self
                .changed
                .wait_timeout(state, Duration::from_millis(25))
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state = next;
        }
    }
}

pub(crate) struct AccessGuard {
    lock: Arc<FairLock>,
    key: String,
    mode: AccessMode,
}

impl Drop for AccessGuard {
    fn drop(&mut self) {
        let mut state = self
            .lock
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match self.mode {
            AccessMode::Read => state.readers -= 1,
            AccessMode::Write => state.writer = false,
        }
        HELD_KEYS.with(|keys| {
            let removed = keys.borrow_mut().pop();
            debug_assert_eq!(
                removed.as_ref().map(|(key, _)| key.as_str()),
                Some(self.key.as_str())
            );
        });
        self.lock.changed.notify_all();
    }
}

#[derive(Default)]
pub(crate) struct RepositoryAccessCoordinator {
    locks: Mutex<HashMap<String, Arc<FairLock>>>,
    contexts: Mutex<HashMap<String, RepositoryContext>>,
}

impl RepositoryAccessCoordinator {
    pub(crate) fn register(&self, context: RepositoryContext, aliases: &[&Path]) {
        let mut contexts = self
            .contexts
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        contexts.insert(
            context.worktree_root.match_key().to_string(),
            context.clone(),
        );
        for alias in aliases {
            if let Ok(identity) = PathIdentity::new(alias) {
                contexts.insert(identity.match_key().to_string(), context.clone());
            }
        }
    }

    pub(crate) fn context(&self, path: &Path) -> Result<RepositoryContext, AppError> {
        let identity = PathIdentity::new(path)?;
        if let Some(context) = self
            .contexts
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(identity.match_key())
            .cloned()
        {
            return Ok(context);
        }
        let context = RepositoryContext::discover(path)?;
        self.register(context.clone(), &[path]);
        Ok(context)
    }

    pub(crate) fn acquire(
        &self,
        context: &RepositoryContext,
        mode: AccessMode,
        cancellation: Option<&CancellationToken>,
    ) -> Result<AccessGuard, AppError> {
        let key = context.common_git_dir.match_key().to_string();
        let lock = self
            .locks
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .entry(key.clone())
            .or_default()
            .clone();
        lock.acquire(&key, mode, cancellation)
    }
}

pub(crate) fn global() -> &'static RepositoryAccessCoordinator {
    static COORDINATOR: OnceLock<RepositoryAccessCoordinator> = OnceLock::new();
    COORDINATOR.get_or_init(RepositoryAccessCoordinator::default)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Barrier;
    use std::thread;
    use std::time::Instant;

    fn repository(label: &str) -> (PathBuf, RepositoryContext) {
        let path = std::env::temp_dir().join(format!(
            "gitodrile-access-{label}-{}-{:?}",
            std::process::id(),
            thread::current().id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        assert!(Command::new("git")
            .arg("init")
            .arg("-q")
            .arg(&path)
            .status()
            .unwrap()
            .success());
        let context = RepositoryContext::discover(&path).unwrap();
        (path, context)
    }

    #[test]
    fn related_worktrees_share_a_write_lock() {
        let (path, main_context) = repository("worktrees");
        assert!(Command::new("git")
            .arg("-C")
            .arg(&path)
            .args([
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.test",
                "commit",
                "--allow-empty",
                "-m",
                "init",
                "-q"
            ])
            .status()
            .unwrap()
            .success());
        let linked = path.with_extension("linked");
        let _ = fs::remove_dir_all(&linked);
        assert!(Command::new("git")
            .arg("-C")
            .arg(&path)
            .args(["worktree", "add", "-q", "-b", "linked"])
            .arg(&linked)
            .status()
            .unwrap()
            .success());
        let linked_context = RepositoryContext::discover(&linked).unwrap();
        assert_eq!(
            main_context.common_git_dir.match_key(),
            linked_context.common_git_dir.match_key()
        );

        let coordinator = Arc::new(RepositoryAccessCoordinator::default());
        let first = coordinator
            .acquire(&main_context, AccessMode::Write, None)
            .unwrap();
        let acquired = Arc::new(AtomicBool::new(false));
        let acquired_thread = Arc::clone(&acquired);
        let coordinator_thread = Arc::clone(&coordinator);
        let handle = thread::spawn(move || {
            let _guard = coordinator_thread
                .acquire(&linked_context, AccessMode::Write, None)
                .unwrap();
            acquired_thread.store(true, Ordering::Release);
        });
        thread::sleep(Duration::from_millis(75));
        assert!(!acquired.load(Ordering::Acquire));
        drop(first);
        handle.join().unwrap();
        assert!(acquired.load(Ordering::Acquire));
        let _ = fs::remove_dir_all(linked);
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn unrelated_repositories_are_not_globally_serialized() {
        let (_one_path, one) = repository("one");
        let (_two_path, two) = repository("two");
        let coordinator = RepositoryAccessCoordinator::default();
        let _first = coordinator.acquire(&one, AccessMode::Write, None).unwrap();
        let started = Instant::now();
        let _second = coordinator.acquire(&two, AccessMode::Write, None).unwrap();
        assert!(started.elapsed() < Duration::from_millis(50));
    }

    #[test]
    fn queued_writer_is_not_starved_by_later_readers() {
        let (_path, context) = repository("fairness");
        let coordinator = Arc::new(RepositoryAccessCoordinator::default());
        let first_read = coordinator
            .acquire(&context, AccessMode::Read, None)
            .unwrap();
        let barrier = Arc::new(Barrier::new(2));
        let writer_entered = Arc::new(AtomicBool::new(false));
        let writer_coordinator = Arc::clone(&coordinator);
        let writer_context = context.clone();
        let writer_barrier = Arc::clone(&barrier);
        let writer_flag = Arc::clone(&writer_entered);
        let writer = thread::spawn(move || {
            writer_barrier.wait();
            let _guard = writer_coordinator
                .acquire(&writer_context, AccessMode::Write, None)
                .unwrap();
            writer_flag.store(true, Ordering::Release);
            thread::sleep(Duration::from_millis(40));
        });
        barrier.wait();
        thread::sleep(Duration::from_millis(30));
        let reader_coordinator = Arc::clone(&coordinator);
        let reader_context = context.clone();
        let reader_saw_writer = Arc::clone(&writer_entered);
        let reader = thread::spawn(move || {
            let _guard = reader_coordinator
                .acquire(&reader_context, AccessMode::Read, None)
                .unwrap();
            assert!(reader_saw_writer.load(Ordering::Acquire));
        });
        drop(first_read);
        writer.join().unwrap();
        reader.join().unwrap();
    }

    #[test]
    fn cancellation_removes_a_waiter() {
        let (_path, context) = repository("cancel");
        let coordinator = Arc::new(RepositoryAccessCoordinator::default());
        let _write = coordinator
            .acquire(&context, AccessMode::Write, None)
            .unwrap();
        let token = CancellationToken::default();
        let wait_token = token.clone();
        let wait_coordinator = Arc::clone(&coordinator);
        let wait_context = context.clone();
        let waiter = thread::spawn(move || {
            wait_coordinator
                .acquire(&wait_context, AccessMode::Read, Some(&wait_token))
                .err()
                .unwrap()
        });
        thread::sleep(Duration::from_millis(30));
        token.cancel();
        let error = waiter.join().unwrap();
        assert!(error.message.contains("cancelled"));
    }

    #[test]
    fn reentry_is_rejected_instead_of_deadlocking() {
        let (_path, context) = repository("reentry");
        let coordinator = RepositoryAccessCoordinator::default();
        let _guard = coordinator
            .acquire(&context, AccessMode::Read, None)
            .unwrap();
        let error = coordinator
            .acquire(&context, AccessMode::Read, None)
            .err()
            .unwrap();
        assert!(error.message.contains("nested"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_verbatim_and_normal_paths_share_a_comparison_key() {
        let normal = Path::new(r"C:\Users\Example\Project");
        let verbatim = Path::new(r"\\?\C:\Users\Example\Project");
        assert_eq!(comparison_key(normal), comparison_key(verbatim));
        assert_eq!(
            comparison_key(normal),
            comparison_key(Path::new(r"c:\users\example\project"))
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_var_alias_is_retained_for_event_matching() {
        let temporary = std::env::temp_dir();
        let selected = PathBuf::from(
            temporary
                .to_string_lossy()
                .replace("/private/var/", "/var/"),
        );
        let identity = PathIdentity::new(&selected).unwrap();
        assert!(identity.matches(&selected));
        assert!(identity.matches(&temporary));
    }
}

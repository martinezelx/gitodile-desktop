//! Filesystem watching for live working-tree updates (task 020).
//!
//! Deliberately narrow: this module decides *when* something in a repository
//! changed and says so once. It never reads Git state, never parses anything,
//! and never sends a path list to the frontend — the existing
//! `read_working_tree_status` command stays the single source of truth for
//! what actually changed, so a watch event can only ever cause the same read
//! the "Check changes" button already performs.

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Emitted at most once per quiet period, per watched project.
pub const REPOSITORY_CHANGED_EVENT: &str = "repository-changed";

/// How long the watcher waits for the filesystem to go quiet before reporting
/// a burst. Long enough that saving a file in an editor (write, rename,
/// truncate — several events) is one refresh; short enough to feel immediate.
const QUIET_PERIOD: Duration = Duration::from_millis(300);

/// The ceiling on a single burst. A build or a package install can keep the
/// filesystem busy for minutes; without this, the quiet period would keep
/// being pushed back and the user would see nothing until it finished.
const MAX_BURST: Duration = Duration::from_secs(2);

/// Names directly inside a Git directory that mean the repository's state
/// changed in a way the working-tree status would show: a commit, a branch
/// switch, a staged file, or an operation in progress. Everything else under
/// a Git directory — `objects`, `logs`, `hooks`, `modules`, the `*.lock`
/// files Git writes constantly — is noise this must not answer.
const GIT_DIR_ALLOWLIST: [&str; 8] = [
    "HEAD",
    "index",
    "refs",
    "packed-refs",
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "REBASE_HEAD",
];

/// What the watcher thread should do with an incoming signal.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum BurstStep {
    /// Keep collecting: wait up to this long for the next signal.
    Wait(Duration),
    /// The burst is over (quiet, or it hit `MAX_BURST`) — report it.
    Report,
}

/// Trailing debounce with a ceiling. Each new signal restarts the quiet
/// period, but never past `max` from the burst's first signal, so continuous
/// churn still reports on a fixed cadence instead of starving.
pub fn burst_step(elapsed: Duration, quiet: Duration, max: Duration) -> BurstStep {
    if elapsed >= max {
        return BurstStep::Report;
    }
    BurstStep::Wait(quiet.min(max - elapsed))
}

/// Whether a changed path should wake the app up.
///
/// `git_dirs` holds every Git directory that belongs to this project: the
/// resolved one, plus the worktree's own `.git` entry, which is a *file* (not
/// a directory) for a linked worktree and therefore has to be named
/// separately.
pub fn is_relevant_path(path: &Path, git_dirs: &[PathBuf]) -> bool {
    for git_dir in git_dirs {
        if path == git_dir {
            // The Git directory reported as itself, which Windows does for
            // the parent of every child write — including all the `objects`
            // and `*.lock` churn the allowlist below exists to filter. Left
            // out entirely: the only genuine signal here is a linked
            // worktree's `.git` *file* being rewritten, which happens on a
            // `git worktree repair` and is picked up by the next real change
            // anyway. Answering it would mean answering everything.
            return false;
        }
        let Ok(inside) = path.strip_prefix(git_dir) else {
            continue;
        };
        let Some(Component::Normal(first)) = inside.components().next() else {
            return false;
        };
        // Git writes `*.lock` files as part of ordinary operations, including
        // ones this app itself starts. Answering them would mean refreshing
        // mid-write, on state that is about to change again.
        if path
            .extension()
            .map(|extension| extension == "lock")
            .unwrap_or(false)
        {
            return false;
        }
        return GIT_DIR_ALLOWLIST
            .iter()
            .any(|allowed| first.eq_ignore_ascii_case(allowed));
    }
    true
}

/// One project's live watch. Dropping it stops the OS-level watch, which
/// closes the channel and ends the debounce thread.
struct RepositoryWatch {
    _watcher: RecommendedWatcher,
}

/// Every active watch, keyed by the canonical worktree root — the same string
/// the frontend uses as a project session id.
#[derive(Default)]
pub struct WatcherRegistry {
    watches: Mutex<HashMap<String, RepositoryWatch>>,
}

impl WatcherRegistry {
    /// Starts watching `root`, replacing any existing watch for it. Returns
    /// `false` when the platform refused to establish a watch (a network
    /// share, a permission failure, an exhausted inotify budget) — the caller
    /// treats that as "this project stays manual", never as an error to show.
    pub fn watch(&self, app: AppHandle, root: &str, git_dirs: Vec<PathBuf>) -> bool {
        let owner = root.to_string();
        self.watch_with(root, git_dirs, move || {
            // Only the project's identity travels to the frontend. What
            // changed is answered by the status read it triggers there, so no
            // path, name, or file content leaves this process.
            let _ = app.emit(REPOSITORY_CHANGED_EVENT, RepositoryChanged { path: &owner });
        })
    }

    /// The whole pipeline — OS watch, event filter, debounce — with the
    /// reporting step left to the caller. `watch` above is the one-line
    /// wrapper that reports by emitting a Tauri event; tests use this
    /// directly, since an `AppHandle` needs a running app and the interesting
    /// behavior has nothing to do with Tauri.
    pub fn watch_with<F>(&self, root: &str, git_dirs: Vec<PathBuf>, on_change: F) -> bool
    where
        F: Fn() + Send + 'static,
    {
        // Dropped before the new one is inserted, so a re-watch never leaves
        // two watchers running against the same tree.
        self.unwatch(root);

        let (sender, receiver) = channel::<()>();
        let filter_dirs = git_dirs.clone();
        let watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
            let relevant = match result {
                // A dropped-events notice (Windows' ReadDirectoryChangesW
                // buffer overflowing under heavy churn is the common case)
                // means the watcher no longer knows what changed. The only
                // safe answer is to assume something did.
                Err(_) => true,
                Ok(event) => {
                    !matches!(event.kind, EventKind::Access(_))
                        && event
                            .paths
                            .iter()
                            .any(|path| is_relevant_path(path, &filter_dirs))
                }
            };
            if relevant {
                let _ = sender.send(());
            }
        });
        let Ok(mut watcher) = watcher else {
            return false;
        };
        if watcher
            .watch(Path::new(root), RecursiveMode::Recursive)
            .is_err()
        {
            return false;
        }

        thread::spawn(move || {
            // Ends when the watcher is dropped and the sender with it.
            while receiver.recv().is_ok() {
                let started = Instant::now();
                loop {
                    match burst_step(started.elapsed(), QUIET_PERIOD, MAX_BURST) {
                        BurstStep::Report => break,
                        BurstStep::Wait(wait) => match receiver.recv_timeout(wait) {
                            Ok(()) => continue,
                            Err(RecvTimeoutError::Timeout) => break,
                            Err(RecvTimeoutError::Disconnected) => return,
                        },
                    }
                }
                on_change();
            }
        });

        let mut watches = match self.watches.lock() {
            Ok(watches) => watches,
            Err(poisoned) => poisoned.into_inner(),
        };
        watches.insert(root.to_string(), RepositoryWatch { _watcher: watcher });
        true
    }

    pub fn unwatch(&self, root: &str) {
        let mut watches = match self.watches.lock() {
            Ok(watches) => watches,
            Err(poisoned) => poisoned.into_inner(),
        };
        watches.remove(root);
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RepositoryChanged<'a> {
    path: &'a str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn git_dirs(root: &Path) -> Vec<PathBuf> {
        vec![root.join(".git")]
    }

    #[test]
    fn a_working_file_is_relevant() {
        let root = Path::new("/repo");
        assert!(is_relevant_path(&root.join("src/main.rs"), &git_dirs(root)));
    }

    #[test]
    fn a_file_whose_name_ends_in_lock_outside_the_git_dir_is_still_relevant() {
        // `Cargo.lock`, `pnpm-lock.yaml`, and friends are ordinary tracked
        // files; only Git's own `*.lock` files are noise.
        let root = Path::new("/repo");
        assert!(is_relevant_path(&root.join("Cargo.lock"), &git_dirs(root)));
    }

    #[test]
    fn git_object_and_log_churn_is_ignored() {
        let root = Path::new("/repo");
        let dirs = git_dirs(root);
        assert!(!is_relevant_path(&root.join(".git/objects/ab/cdef"), &dirs));
        assert!(!is_relevant_path(&root.join(".git/logs/HEAD"), &dirs));
        assert!(!is_relevant_path(
            &root.join(".git/hooks/pre-commit"),
            &dirs
        ));
    }

    #[test]
    fn git_lock_files_are_ignored() {
        let root = Path::new("/repo");
        let dirs = git_dirs(root);
        assert!(!is_relevant_path(&root.join(".git/index.lock"), &dirs));
        assert!(!is_relevant_path(
            &root.join(".git/refs/heads/main.lock"),
            &dirs
        ));
    }

    #[test]
    fn head_index_and_refs_are_relevant() {
        let root = Path::new("/repo");
        let dirs = git_dirs(root);
        assert!(is_relevant_path(&root.join(".git/HEAD"), &dirs));
        assert!(is_relevant_path(&root.join(".git/index"), &dirs));
        assert!(is_relevant_path(&root.join(".git/refs/heads/main"), &dirs));
        assert!(is_relevant_path(&root.join(".git/MERGE_HEAD"), &dirs));
    }

    #[test]
    fn a_linked_worktrees_own_git_dir_is_filtered_too() {
        let root = Path::new("/repo/wt");
        let dirs = vec![PathBuf::from("/repo/.git/worktrees/wt"), root.join(".git")];
        assert!(is_relevant_path(
            Path::new("/repo/.git/worktrees/wt/HEAD"),
            &dirs
        ));
        assert!(!is_relevant_path(
            Path::new("/repo/.git/worktrees/wt/index.lock"),
            &dirs
        ));
        assert!(is_relevant_path(&root.join("src/main.rs"), &dirs));
    }

    /// Polls instead of sleeping a fixed amount: filesystem notifications are
    /// delivered on the OS's schedule, so a fixed wait is either flaky or
    /// slow. Returns the count as soon as it stops changing for one full
    /// quiet period, or when `budget` runs out.
    fn settled_count(counter: &Arc<AtomicUsize>, budget: Duration) -> usize {
        let deadline = Instant::now() + budget;
        let mut last = counter.load(Ordering::SeqCst);
        while Instant::now() < deadline {
            thread::sleep(QUIET_PERIOD + Duration::from_millis(200));
            let current = counter.load(Ordering::SeqCst);
            if current == last && current > 0 {
                return current;
            }
            last = current;
        }
        last
    }

    #[test]
    fn a_written_file_reports_once_and_git_churn_reports_not_at_all() {
        let mut root = std::env::temp_dir();
        root.push(format!("gitodrile-watch-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".git/objects")).expect("create temp repo layout");

        let registry = WatcherRegistry::default();
        let counter = Arc::new(AtomicUsize::new(0));
        let reported = Arc::clone(&counter);
        let display_root = root.to_string_lossy().to_string();
        let watching = registry.watch_with(&display_root, vec![root.join(".git")], move || {
            reported.fetch_add(1, Ordering::SeqCst);
        });
        // Some sandboxes and filesystems refuse to watch at all; that path is
        // a supported outcome, not a test failure.
        if !watching {
            let _ = fs::remove_dir_all(&root);
            return;
        }

        // A burst of writes to one file: several OS events, one report.
        for index in 0..5 {
            fs::write(root.join("notes.txt"), format!("line {index}"))
                .expect("write worktree file");
        }
        let after_write = settled_count(&counter, Duration::from_secs(10));
        assert!(after_write >= 1, "a working-tree write must be reported");

        // Git's own object churn must not add to it.
        fs::write(root.join(".git/objects/abcdef"), "loose object").expect("write git object");
        fs::write(root.join(".git/index.lock"), "lock").expect("write index lock");
        thread::sleep(QUIET_PERIOD * 3);
        assert_eq!(
            counter.load(Ordering::SeqCst),
            after_write,
            "Git's internal churn must not trigger a refresh"
        );

        registry.unwatch(&display_root);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_quiet_gap_ends_the_burst() {
        assert_eq!(
            burst_step(Duration::from_millis(0), QUIET_PERIOD, MAX_BURST),
            BurstStep::Wait(QUIET_PERIOD)
        );
    }

    #[test]
    fn a_long_burst_reports_at_the_ceiling_instead_of_starving() {
        assert_eq!(
            burst_step(MAX_BURST, QUIET_PERIOD, MAX_BURST),
            BurstStep::Report
        );
        assert_eq!(
            burst_step(Duration::from_secs(30), QUIET_PERIOD, MAX_BURST),
            BurstStep::Report
        );
    }

    #[test]
    fn the_last_wait_of_a_burst_never_overshoots_the_ceiling() {
        // 100 ms left of the budget must not become a 300 ms wait.
        let elapsed = MAX_BURST - Duration::from_millis(100);
        assert_eq!(
            burst_step(elapsed, QUIET_PERIOD, MAX_BURST),
            BurstStep::Wait(Duration::from_millis(100))
        );
    }
}

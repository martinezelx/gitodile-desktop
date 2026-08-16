//! Tauri-independent application boundary for execution policy, cancellation
//! and repository authorization. Every registered IPC command enters a checked
//! command frame here before a domain workflow can reach Git; `lib.rs` owns
//! builder/registration and process/platform adapter wiring, not product
//! workflows.

use crate::error::{AppError, AppErrorCode};
use crate::git::{
    CancellationPolicy, CancellationToken, ConcurrencyClass, ExecutionPolicy, OperationClass,
    PromptPolicy, DEFAULT_STDERR_CAP, DEFAULT_STDOUT_CAP,
};
use crate::repository_access::{self, AccessGuard, AccessMode, RepositoryContext};
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const fn no_process(command: &'static str) -> ExecutionPolicy {
    no_process_with_class(command, OperationClass::ReadOnly)
}

const fn no_process_with_class(command: &'static str, class: OperationClass) -> ExecutionPolicy {
    ExecutionPolicy {
        command,
        class,
        stdout_cap: 0,
        stderr_cap: 0,
        timeout: Duration::ZERO,
        cancellation: CancellationPolicy::NotSupported,
        prompt: PromptPolicy::Disabled,
        concurrency: ConcurrencyClass::None,
    }
}

const fn global_process(
    command: &'static str,
    class: OperationClass,
    timeout_secs: u64,
) -> ExecutionPolicy {
    ExecutionPolicy {
        command,
        class,
        stdout_cap: DEFAULT_STDOUT_CAP,
        stderr_cap: DEFAULT_STDERR_CAP,
        timeout: Duration::from_secs(timeout_secs),
        cancellation: CancellationPolicy::KillProcess,
        prompt: PromptPolicy::Disabled,
        concurrency: ConcurrencyClass::None,
    }
}

const fn read(command: &'static str) -> ExecutionPolicy {
    ExecutionPolicy::repository_read(command)
}

pub(crate) const EXECUTION_INVENTORY: &[ExecutionPolicy] = &[
    no_process("app_status"),
    no_process("show_main_window"),
    read("open_repository"),
    read("read_working_tree_status"),
    read("read_file_diff"),
    read("read_file_lines"),
    read("read_working_tree_diffs"),
    read("plan_discard_changes"),
    ExecutionPolicy::repository_write("discard_changes", OperationClass::Destructive),
    read("get_discard_recovery"),
    ExecutionPolicy::repository_write("restore_discarded_changes", OperationClass::LocalMutation),
    global_process("git_diagnostics", OperationClass::ReadOnly, 15),
    global_process("install_git", OperationClass::PlatformMutation, 900),
    global_process("update_git", OperationClass::PlatformMutation, 900),
    global_process("check_git_update", OperationClass::ReadOnly, 15),
    global_process("get_git_identity", OperationClass::ReadOnly, 15),
    global_process("set_git_identity", OperationClass::LocalMutation, 30),
    read("plan_save_version"),
    ExecutionPolicy::repository_write("save_version", OperationClass::HistoryMutation),
    read("discover_remotes"),
    read("read_team_sync_status"),
    ExecutionPolicy::repository_write("check_team_changes", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("plan_get_team_changes", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("get_team_changes", OperationClass::HistoryMutation),
    read("list_unpublished_versions"),
    read("read_commit_file_changes"),
    read("read_commit_file_diff"),
    ExecutionPolicy::repository_write("plan_publish", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("publish", OperationClass::RemoteMutation),
    read("get_version_lines"),
    read("plan_create_version_line"),
    ExecutionPolicy::repository_write("create_version_line", OperationClass::LocalMutation),
    read("plan_switch_version_line"),
    ExecutionPolicy::repository_write("switch_version_line", OperationClass::LocalMutation),
    read("plan_delete_version_line"),
    ExecutionPolicy::repository_write("delete_version_line", OperationClass::Destructive),
    read("watch_repository"),
    no_process("unwatch_repository"),
    no_process_with_class("close_project_session", OperationClass::LocalMutation),
];

pub(crate) fn policy(command: &str) -> &'static ExecutionPolicy {
    let found = EXECUTION_INVENTORY
        .iter()
        .find(|item| item.command == command)
        .unwrap_or_else(|| panic!("registered command `{command}` is missing an execution policy"));
    debug_assert!(matches!(
        found.class,
        OperationClass::ReadOnly
            | OperationClass::LocalMutation
            | OperationClass::HistoryMutation
            | OperationClass::RemoteMutation
            | OperationClass::Destructive
            | OperationClass::PlatformMutation
    ));
    debug_assert!(
        found.cancellation == CancellationPolicy::NotSupported || !found.timeout.is_zero()
    );
    found
}

#[derive(Clone)]
struct CommandFrame {
    policy: ExecutionPolicy,
    cancellation: Option<CancellationToken>,
}

thread_local! {
    static POLICY_STACK: RefCell<Vec<CommandFrame>> = const { RefCell::new(Vec::new()) };
}

pub(crate) fn current_policy() -> Option<ExecutionPolicy> {
    POLICY_STACK.with(|stack| stack.borrow().last().map(|frame| frame.policy))
}

pub(crate) fn current_cancellation() -> Option<CancellationToken> {
    POLICY_STACK.with(|stack| {
        stack
            .borrow()
            .last()
            .and_then(|frame| frame.cancellation.clone())
    })
}

fn cancellations() -> &'static Mutex<HashMap<(String, &'static str), CancellationToken>> {
    static CANCELLATIONS: OnceLock<Mutex<HashMap<(String, &'static str), CancellationToken>>> =
        OnceLock::new();
    CANCELLATIONS.get_or_init(Mutex::default)
}

pub(crate) struct CommandAccess {
    _guard: Option<AccessGuard>,
    cancellation_key: Option<(String, &'static str)>,
    cancellation: Option<CancellationToken>,
}

impl Drop for CommandAccess {
    fn drop(&mut self) {
        if let (Some(key), Some(token)) = (&self.cancellation_key, &self.cancellation) {
            let mut active = cancellations()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if active
                .get(key)
                .is_some_and(|current| current.same_instance(token))
            {
                active.remove(key);
            }
        }
        POLICY_STACK.with(|stack| {
            stack.borrow_mut().pop();
        });
    }
}

pub(crate) fn enter(command: &'static str) -> CommandAccess {
    POLICY_STACK.with(|stack| {
        stack.borrow_mut().push(CommandFrame {
            policy: *policy(command),
            cancellation: None,
        })
    });
    CommandAccess {
        _guard: None,
        cancellation_key: None,
        cancellation: None,
    }
}

/// A command frame for test code that reads repository state to verify what a
/// workflow did — `git log -1`, `git ls-files`, `git show HEAD:file`.
///
/// Those calls are assertions, not product behavior, so they have no registered
/// command and must not borrow one: naming a real command here would let a test
/// pass under a policy the production path never uses. The policy is built
/// directly rather than taken from `EXECUTION_INVENTORY`, which stays exactly
/// the 35 registered commands.
///
/// This exists because `require_policy` in `lib.rs` has no fallback. Before
/// task 039 these calls silently received a default read policy, and so would
/// any production call that forgot its frame.
#[cfg(test)]
pub(crate) fn enter_test_frame() -> CommandAccess {
    POLICY_STACK.with(|stack| {
        stack.borrow_mut().push(CommandFrame {
            policy: ExecutionPolicy::repository_read("test_assertion"),
            cancellation: None,
        })
    });
    CommandAccess {
        _guard: None,
        cancellation_key: None,
        cancellation: None,
    }
}

pub(crate) fn authorize_repository(
    path: &str,
    command: &'static str,
    cancellation: Option<&CancellationToken>,
) -> Result<(RepositoryContext, CommandAccess), AppError> {
    let policy = *policy(command);
    let context = repository_access::global().context(Path::new(path))?;
    if context.bare {
        return Err(AppError::new(
            AppErrorCode::BareRepository,
            "Bare Git repositories aren't supported yet.",
        ));
    }
    let requested = match policy.concurrency {
        ConcurrencyClass::RepositoryRead => AccessMode::Read,
        ConcurrencyClass::RepositoryWrite => AccessMode::Write,
        ConcurrencyClass::None => {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "This command has no repository concurrency policy.",
            ))
        }
    };
    let repository_key = context.common_git_dir.match_key().to_string();
    let (guard, inherited_access) = match repository_access::held_mode(&repository_key) {
        Some(AccessMode::Write) => (None, true),
        Some(AccessMode::Read) if requested == AccessMode::Read => (None, true),
        Some(AccessMode::Read) => {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "A repository read cannot be upgraded to a mutation.",
            ))
        }
        None => (
            Some(repository_access::global().acquire(&context, requested, cancellation)?),
            false,
        ),
    };
    let (cancellation_key, command_cancellation) = if inherited_access {
        // A domain workflow may call another authorized helper while it owns
        // the repository permit. That helper is part of the same command, not
        // a newer equivalent renderer request. Reuse the parent's token so an
        // internal status read cannot cancel a concurrent visible status
        // refresh (or the workflow that called it).
        (None, current_cancellation())
    } else if requested == AccessMode::Read {
        let key = (repository_key, command);
        let token = CancellationToken::default();
        let mut active = cancellations()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(superseded) = active.insert(key.clone(), token.clone()) {
            superseded.cancel();
        }
        (Some(key), Some(token))
    } else {
        (None, cancellation.cloned())
    };
    POLICY_STACK.with(|stack| {
        stack.borrow_mut().push(CommandFrame {
            policy,
            cancellation: command_cancellation.clone(),
        })
    });
    Ok((
        context,
        CommandAccess {
            _guard: guard,
            cancellation_key,
            cancellation: command_cancellation,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;
    use std::sync::mpsc;
    use std::thread;
    const REGISTERED: &[&str] = &[
        "app_status",
        "show_main_window",
        "open_repository",
        "read_working_tree_status",
        "read_file_diff",
        "read_file_lines",
        "read_working_tree_diffs",
        "plan_discard_changes",
        "discard_changes",
        "get_discard_recovery",
        "restore_discarded_changes",
        "git_diagnostics",
        "install_git",
        "update_git",
        "check_git_update",
        "get_git_identity",
        "set_git_identity",
        "plan_save_version",
        "save_version",
        "discover_remotes",
        "read_team_sync_status",
        "check_team_changes",
        "plan_get_team_changes",
        "get_team_changes",
        "list_unpublished_versions",
        "read_commit_file_changes",
        "read_commit_file_diff",
        "plan_publish",
        "publish",
        "get_version_lines",
        "plan_create_version_line",
        "create_version_line",
        "plan_switch_version_line",
        "switch_version_line",
        "plan_delete_version_line",
        "delete_version_line",
        "watch_repository",
        "unwatch_repository",
        "close_project_session",
    ];

    #[test]
    fn every_registered_command_has_one_complete_policy() {
        assert_eq!(EXECUTION_INVENTORY.len(), REGISTERED.len());
        for command in REGISTERED {
            let matches: Vec<_> = EXECUTION_INVENTORY
                .iter()
                .filter(|item| item.command == *command)
                .collect();
            assert_eq!(matches.len(), 1, "policy inventory for {command}");
            if matches[0].cancellation != CancellationPolicy::NotSupported {
                assert!(matches[0].stdout_cap > 0 && matches[0].stderr_cap > 0);
                assert!(!matches[0].timeout.is_zero());
            }
        }
    }

    #[test]
    fn mutations_are_exclusive_and_preserve_git_prompts() {
        for command in [
            "save_version",
            "plan_publish",
            "check_team_changes",
            "plan_get_team_changes",
            "get_team_changes",
            "publish",
            "create_version_line",
            "switch_version_line",
            "delete_version_line",
            "discard_changes",
            "restore_discarded_changes",
        ] {
            assert_eq!(
                policy(command).concurrency,
                ConcurrencyClass::RepositoryWrite
            );
            assert_eq!(policy(command).prompt, PromptPolicy::PreserveGitBehavior);
        }
        assert_eq!(policy("plan_publish").class, OperationClass::LocalMutation);
        assert_eq!(
            policy("check_team_changes").class,
            OperationClass::LocalMutation
        );
        assert_eq!(
            policy("get_team_changes").class,
            OperationClass::HistoryMutation
        );
        assert_eq!(
            policy("close_project_session").class,
            OperationClass::LocalMutation
        );
        assert_eq!(
            policy("close_project_session").concurrency,
            ConcurrencyClass::None
        );
    }

    #[test]
    fn a_new_read_cancels_the_superseded_process_token() {
        let path = std::env::temp_dir().join(format!("gitodrile-supersede-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        assert!(Command::new("git")
            .arg("init")
            .arg("-q")
            .arg(&path)
            .status()
            .unwrap()
            .success());

        let path_text = path.to_string_lossy().to_string();
        let (ready_tx, ready_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let first_path = path_text.clone();
        let first = thread::spawn(move || {
            let (_context, _access) =
                authorize_repository(&first_path, "read_working_tree_status", None).unwrap();
            let token = current_cancellation().unwrap();
            ready_tx.send(token.clone()).unwrap();
            finish_rx.recv().unwrap();
            token.is_cancelled()
        });
        let first_token = ready_rx.recv().unwrap();
        let (_context, _access) =
            authorize_repository(&path_text, "read_working_tree_status", None).unwrap();
        assert!(first_token.is_cancelled());
        finish_tx.send(()).unwrap();
        assert!(first.join().unwrap());
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn an_inherited_read_does_not_supersede_an_independent_peer() {
        let path =
            std::env::temp_dir().join(format!("gitodrile-inherited-read-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        assert!(Command::new("git")
            .arg("init")
            .arg("-q")
            .arg(&path)
            .status()
            .unwrap()
            .success());

        let path_text = path.to_string_lossy().to_string();
        let (ready_tx, ready_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let peer_path = path_text.clone();
        let peer = thread::spawn(move || {
            let (_context, _access) =
                authorize_repository(&peer_path, "read_working_tree_status", None).unwrap();
            let token = current_cancellation().unwrap();
            ready_tx.send(token.clone()).unwrap();
            finish_rx.recv().unwrap();
            token.is_cancelled()
        });
        let peer_token = ready_rx.recv().unwrap();

        let (_context, _outer) =
            authorize_repository(&path_text, "list_unpublished_versions", None).unwrap();
        let outer_token = current_cancellation().unwrap();
        {
            let (_context, _nested) =
                authorize_repository(&path_text, "read_working_tree_status", None).unwrap();
            let nested_token = current_cancellation().unwrap();
            assert!(nested_token.same_instance(&outer_token));
            assert!(!peer_token.is_cancelled());
        }

        finish_tx.send(()).unwrap();
        assert!(!peer.join().unwrap());
        let _ = fs::remove_dir_all(path);
    }
}

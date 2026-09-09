//! Native pre-install ownership shared by the future updater lifecycle.
//!
//! This task deliberately stops before download or installer invocation. The
//! only public boundary here is the preparation guard that task 065-9-3 must
//! hold continuously through native handoff.

use crate::application::{self, InstallAdmission};
use crate::error::{AppError, AppErrorCode};
use crate::watch::{WatcherRegistry, WatcherSuspension};
use std::time::Duration;

const READ_DRAIN_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct DraftPreparation {
    /// Count proved by the renderer without forwarding owner IDs, whose local
    /// keys may contain a repository path.
    pub(crate) protected_count: usize,
    /// Owners that cannot safely persist their current contents. These names
    /// are bounded product identifiers, never draft text or repository paths.
    pub(crate) blockers: Vec<String>,
}

/// Must stay alive until the native installer has accepted handoff. Dropping
/// it (a blocker, failed revalidation or failed handoff) restores watchers
/// first and only then reopens application admission.
#[allow(dead_code)]
pub(crate) struct InstallPreparation {
    watchers: Option<WatcherSuspension>,
    admission: Option<InstallAdmission>,
}

impl Drop for InstallPreparation {
    fn drop(&mut self) {
        drop(self.watchers.take());
        drop(self.admission.take());
    }
}

/// Future updater code must call this after the renderer's draft registry has
/// flushed and inspected every registered owner. It never writes a repository,
/// Git configuration or user working file.
#[allow(dead_code)]
pub(crate) fn prepare_installation(
    watchers: &WatcherRegistry,
    drafts: &DraftPreparation,
) -> Result<InstallPreparation, AppError> {
    let admission = application::begin_install_admission(READ_DRAIN_TIMEOUT)?;
    finish_preparation(admission, watchers, drafts)
}

fn finish_preparation(
    admission: InstallAdmission,
    watchers: &WatcherRegistry,
    drafts: &DraftPreparation,
) -> Result<InstallPreparation, AppError> {
    if !drafts.blockers.is_empty() {
        return Err(AppError::new(
            AppErrorCode::InstallBlocked,
            "Some unfinished edits could not be protected for restart.",
        )
        .with_remediation(format!(
            "Save or discard the unfinished {} edit, then choose Install and restart again.",
            drafts.blockers[0]
        )));
    }
    let watcher_suspension = watchers.suspend_all();
    Ok(InstallPreparation {
        watchers: Some(watcher_suspension),
        admission: Some(admission),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::InstallAdmissionCoordinator;
    use crate::git::{CancellationToken, InstallAdmissionPolicy};
    use crate::test_support::unique_temp_dir;
    use crate::watch::WatchPaths;
    use std::fs;
    use std::process::Command;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Arc, Barrier};
    use std::thread;

    #[test]
    fn a_mutation_in_any_project_blocks_install_without_being_cancelled() {
        let coordinator = Arc::new(InstallAdmissionCoordinator::default());
        let cancellation = CancellationToken::default();
        let _other_project = coordinator.start_operation(
            "save_version",
            InstallAdmissionPolicy::Block,
            Some(cancellation.clone()),
        );

        let error = coordinator
            .begin_install(Duration::from_millis(50))
            .err()
            .unwrap();
        assert_eq!(error.code, AppErrorCode::InstallBlocked);
        assert!(!cancellation.is_cancelled());
        assert_eq!(coordinator.active_count(), 1);
    }

    #[test]
    fn installer_and_new_mutation_never_hold_admission_together() {
        let coordinator = Arc::new(InstallAdmissionCoordinator::default());
        let install = coordinator
            .begin_install(Duration::from_millis(50))
            .unwrap();
        let attempted = Arc::new(Barrier::new(2));
        let acquired = Arc::new(AtomicBool::new(false));
        let thread_coordinator = Arc::clone(&coordinator);
        let thread_attempted = Arc::clone(&attempted);
        let thread_acquired = Arc::clone(&acquired);
        let mutation = thread::spawn(move || {
            thread_attempted.wait();
            let _operation = thread_coordinator.start_operation(
                "clone_repository",
                InstallAdmissionPolicy::Block,
                None,
            );
            thread_acquired.store(true, Ordering::Release);
        });
        attempted.wait();
        thread::sleep(Duration::from_millis(30));
        assert!(!acquired.load(Ordering::Acquire));
        drop(install);
        mutation.join().unwrap();
        assert!(acquired.load(Ordering::Acquire));
    }

    #[test]
    fn reads_cancel_normally_and_drain_before_installation() {
        let coordinator = Arc::new(InstallAdmissionCoordinator::default());
        let token = CancellationToken::default();
        let (started_tx, started_rx) = mpsc::channel();
        let read_coordinator = Arc::clone(&coordinator);
        let read_token = token.clone();
        let read = thread::spawn(move || {
            let _activity = read_coordinator.start_operation(
                "read_working_tree_status",
                InstallAdmissionPolicy::Drain,
                Some(read_token.clone()),
            );
            started_tx.send(()).unwrap();
            while !read_token.is_cancelled() {
                thread::yield_now();
            }
        });
        started_rx.recv().unwrap();
        let install = coordinator.begin_install(Duration::from_secs(1)).unwrap();
        assert!(token.is_cancelled());
        assert_eq!(coordinator.active_count(), 0);
        drop(install);
        read.join().unwrap();
    }

    #[test]
    fn clone_create_and_global_helpers_are_explicit_install_blockers() {
        for command in [
            "clone_repository",
            "initialize_project",
            "install_git",
            "update_git",
            "set_git_identity",
            "set_line_endings",
            "set_default_branch",
        ] {
            assert_eq!(
                application::policy(command).install_admission,
                InstallAdmissionPolicy::Block,
                "{command}"
            );
        }
    }

    #[test]
    fn every_current_operation_has_the_expected_admission_shape() {
        for policy in application::EXECUTION_INVENTORY {
            let expected = match policy.command {
                "app_status" | "show_main_window" | "render_diagnostic_report" => {
                    InstallAdmissionPolicy::Allow
                }
                _ if policy.class == crate::git::OperationClass::ReadOnly => {
                    InstallAdmissionPolicy::Drain
                }
                _ => InstallAdmissionPolicy::Block,
            };
            assert_eq!(policy.install_admission, expected, "{}", policy.command);
        }
    }

    #[test]
    fn failed_draft_preparation_releases_admission() {
        let coordinator = Arc::new(InstallAdmissionCoordinator::default());
        let admission = coordinator
            .begin_install(Duration::from_millis(50))
            .unwrap();
        let failed = DraftPreparation {
            protected_count: 0,
            blockers: vec!["project ignore rules".to_string()],
        };
        let result = finish_preparation(admission, &WatcherRegistry::default(), &failed);
        let Err(error) = result else {
            panic!("draft blocker unexpectedly allowed installation");
        };
        assert_eq!(error.code, AppErrorCode::InstallBlocked);
        let _next =
            coordinator.start_operation("initialize_project", InstallAdmissionPolicy::Block, None);
        assert_eq!(coordinator.active_count(), 1);
    }

    #[test]
    fn watcher_suspension_uses_normal_drop_and_restores_every_project() {
        let registry = WatcherRegistry::default();
        let first = std::path::PathBuf::from(unique_temp_dir("install-watch-a"));
        let second = std::path::PathBuf::from(unique_temp_dir("install-watch-b"));
        for root in [&first, &second] {
            fs::create_dir_all(root.join(".git")).unwrap();
        }
        let paths = |root: &std::path::Path| WatchPaths {
            worktree: vec![root.to_path_buf()],
            git_dir: vec![root.join(".git")],
            common_git_dir: vec![root.join(".git")],
        };
        if !registry.watch_with("a", "ea", "ca", paths(&first), |_| {}) {
            return;
        }
        assert!(registry.watch_with("b", "eb", "cb", paths(&second), |_| {}));
        assert_eq!(registry.watch_count(), 2);
        let suspension = registry.suspend_all();
        assert_eq!(registry.watch_count(), 0);
        drop(suspension);
        assert_eq!(registry.watch_count(), 2);
        registry.unwatch("a", "ea");
        registry.unwatch("b", "eb");
        let _ = fs::remove_dir_all(first);
        let _ = fs::remove_dir_all(second);
    }

    #[test]
    fn preparation_does_not_touch_history_index_or_worktree_files() {
        let root = std::path::PathBuf::from(unique_temp_dir("install-preserves-repo"));
        fs::create_dir_all(&root).unwrap();
        let git = |args: &[&str]| {
            Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(args)
                .output()
                .unwrap()
        };
        assert!(git(&["init", "-b", "main"]).status.success());
        assert!(git(&["config", "user.name", "GitOdile Test"])
            .status
            .success());
        assert!(git(&["config", "user.email", "test@gitodile.invalid"])
            .status
            .success());
        fs::write(root.join("tracked.txt"), b"saved\n").unwrap();
        assert!(git(&["add", "tracked.txt"]).status.success());
        assert!(git(&["commit", "-m", "saved version"]).status.success());
        fs::write(root.join("tracked.txt"), b"unsaved tracked\n").unwrap();
        fs::write(root.join("untracked.txt"), b"unsaved untracked\n").unwrap();
        let before_head = git(&["rev-parse", "HEAD"]).stdout;
        let before_status = git(&["status", "--porcelain=v1", "-z"]).stdout;
        let before_index = fs::read(root.join(".git/index")).unwrap();

        let coordinator = Arc::new(InstallAdmissionCoordinator::default());
        let admission = coordinator
            .begin_install(Duration::from_millis(50))
            .unwrap();
        let preparation = finish_preparation(
            admission,
            &WatcherRegistry::default(),
            &DraftPreparation::default(),
        )
        .unwrap();
        drop(preparation);

        assert_eq!(git(&["rev-parse", "HEAD"]).stdout, before_head);
        assert_eq!(
            git(&["status", "--porcelain=v1", "-z"]).stdout,
            before_status
        );
        assert_eq!(fs::read(root.join(".git/index")).unwrap(), before_index);
        assert_eq!(
            fs::read(root.join("tracked.txt")).unwrap(),
            b"unsaved tracked\n"
        );
        assert_eq!(
            fs::read(root.join("untracked.txt")).unwrap(),
            b"unsaved untracked\n"
        );
        let _ = fs::remove_dir_all(root);
    }
}

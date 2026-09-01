//! Temporary-index infrastructure shared by safe repository mutations.

use crate::error::{AppError, AppErrorCode};
use crate::git_command::{git_stdout, run_git_with_env};
use crate::operation::truncate_detail;
use crate::repository::HeadState;
use crate::status::WorkingTreeEntry;
use std::path::PathBuf;
use std::process::Output;
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) struct PreparedIndex {
    pub(crate) path: PathBuf,
    pub(crate) tree: String,
}

impl Drop for PreparedIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
        let mut lock = self.path.as_os_str().to_os_string();
        lock.push(".lock");
        let _ = std::fs::remove_file(PathBuf::from(lock));
    }
}

/// Produces a process-unique temporary index path. The sequence is necessary
/// because Windows clock ticks are too coarse to make nanoseconds unique.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn selection_index_path() -> PathBuf {
    static INDEX_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let sequence = INDEX_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut index_path = std::env::temp_dir();
    index_path.push(format!(
        "gitodile-selection-index-{}-{nanos}-{sequence}",
        std::process::id()
    ));
    index_path
}

pub(crate) fn prepare_index(
    path: &str,
    head_state: &HeadState,
    selected_entries: Option<&[WorkingTreeEntry]>,
) -> Result<PreparedIndex, AppError> {
    let index_path = selection_index_path();
    let index_value = index_path.to_string_lossy().to_string();
    let envs = [("GIT_INDEX_FILE", index_value.as_str())];
    let read_tree_args = if *head_state == HeadState::Unborn {
        ["read-tree", "--empty"]
    } else {
        ["read-tree", "HEAD"]
    };
    let output =
        run_git_with_env(path, read_tree_args, &envs).map_err(|_| index_unavailable_error())?;
    if !output.status.success() {
        return Err(index_unavailable_error().with_detail(truncate_detail(&stderr_text(&output))));
    }

    let mut add_args = vec!["add".to_string(), "-A".to_string()];
    if let Some(entries) = selected_entries {
        add_args.push("--".to_string());
        for entry in entries {
            add_args.push(entry.path.clone());
            if let Some(original) = &entry.original_path {
                add_args.push(original.clone());
            }
        }
    }
    let output = run_git_with_env(path, &add_args, &envs).map_err(|_| index_unavailable_error())?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't prepare the selected changes.",
        )
        .with_remediation("Refresh the project and check that the selected files are readable.")
        .with_detail(truncate_detail(&stderr_text(&output))));
    }

    let output =
        run_git_with_env(path, ["write-tree"], &envs).map_err(|_| index_unavailable_error())?;
    if !output.status.success() {
        return Err(index_unavailable_error().with_detail(truncate_detail(&stderr_text(&output))));
    }

    Ok(PreparedIndex {
        path: index_path,
        tree: git_stdout(&output),
    })
}

pub(crate) fn index_unavailable_error() -> AppError {
    AppError::new(
        AppErrorCode::IndexUnavailable,
        "GitOdile couldn't safely prepare this project's Git index.",
    )
    .with_remediation("Check available disk space and file permissions (antivirus tools can lock this file on Windows), then try again.")
}

fn stderr_text(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).to_string()
}

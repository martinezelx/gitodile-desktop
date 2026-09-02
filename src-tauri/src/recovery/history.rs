//! Recovery records for history-rewriting workflows.
//!
//! A `get team changes` rebase moves the version line, so the pre-rewrite tip
//! is preserved as a hidden ref under `refs/gitodile/recovery/` per ADR 0008.
//! Records are owned per worktree and reconciled before a new one is reserved.
//! This is a separate owner from [`super::discard`]: the two share only the
//! clock.

use super::now_ms;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::run_git;
use crate::repository_access::RepositoryContext;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

const HISTORY_RECOVERY_SCHEMA_VERSION: u32 = 1;
pub(crate) const MAX_HISTORY_RECOVERY_RECORDS: usize = 20;
const HISTORY_RECOVERY_NAMESPACE: &str = "refs/gitodile/recovery/v1/get-team-changes";

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryRecoveryPreview {
    pub(crate) reference: String,
    pub(crate) explanation: String,
    pub(crate) retention: String,
    pub(crate) retention_limit: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryRecoveryRecord {
    pub(crate) schema_version: u32,
    pub(crate) recovery_id: String,
    pub(crate) reference: String,
    pub(crate) created_at_ms: u64,
    pub(crate) operation: String,
    pub(crate) owner_id: String,
    pub(crate) branch: String,
    pub(crate) previous_commit: String,
    pub(crate) target_commit: String,
    pub(crate) remote: String,
    pub(crate) destination_branch: String,
    pub(crate) tracking_ref: String,
    pub(crate) state_token: String,
    pub(crate) retention_limit: usize,
}

pub(crate) struct HistoryRecoveryMetadata {
    pub(crate) branch: String,
    pub(crate) previous_commit: String,
    pub(crate) target_commit: String,
    pub(crate) remote: String,
    pub(crate) destination_branch: String,
    pub(crate) tracking_ref: String,
    pub(crate) state_token: String,
}

fn stable_fnv1a(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn history_owner_id(repository: &RepositoryContext) -> String {
    let common = repository.common_git_dir.backend_path();
    let git_dir = repository.git_dir.backend_path();
    let relative = if git_dir == common {
        "main".to_string()
    } else {
        git_dir
            .strip_prefix(common)
            .unwrap_or(git_dir)
            .to_string_lossy()
            .replace('\\', "/")
    };
    #[cfg(target_os = "windows")]
    let relative = relative.to_lowercase();
    format!("worktree-{:016x}", stable_fnv1a(&relative))
}

fn unique_history_recovery_id() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    format!(
        "{}-{}-{}-0",
        now_ms(),
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

fn history_recovery_root(common_git_dir: &Path) -> PathBuf {
    common_git_dir
        .join("gitodile")
        .join("history-recovery")
        .join("v1")
}

fn history_record_path(common_git_dir: &Path, owner_id: &str, recovery_id: &str) -> PathBuf {
    history_recovery_root(common_git_dir)
        .join("get-team-changes")
        .join(owner_id)
        .join(format!("{recovery_id}.json"))
}

fn history_pending_path(common_git_dir: &Path, owner_id: &str, recovery_id: &str) -> PathBuf {
    history_recovery_root(common_git_dir)
        .join("pending")
        .join(format!("{owner_id}-{recovery_id}.json"))
}

pub(crate) fn plan_history_recovery(repository: &RepositoryContext) -> HistoryRecoveryPreview {
    let owner_id = history_owner_id(repository);
    let recovery_id = unique_history_recovery_id();
    HistoryRecoveryPreview {
        reference: format!(
            "{HISTORY_RECOVERY_NAMESPACE}/{owner_id}/{recovery_id}"
        ),
        explanation:
            "GitOdile will protect the current saved version with a verified local reference before changing history or files."
                .to_string(),
        retention: format!(
            "The recovery point stays local and is kept among the newest {MAX_HISTORY_RECOVERY_RECORDS} team-update recovery points for this project repository."
        ),
        retention_limit: MAX_HISTORY_RECOVERY_RECORDS,
    }
}

fn history_error(message: &str) -> AppError {
    AppError::new(AppErrorCode::RecoveryFailed, message).with_remediation(
        "No project files were intentionally changed. Check Git metadata permissions and disk space, then review the update again.",
    )
}

fn repo_path(repository: &RepositoryContext) -> String {
    repository
        .worktree_root
        .backend_path()
        .to_string_lossy()
        .to_string()
}

fn read_history_records(
    common_git_dir: &Path,
) -> Result<Vec<(PathBuf, HistoryRecoveryRecord)>, AppError> {
    let root = history_recovery_root(common_git_dir).join("get-team-changes");
    let Ok(owners) = fs::read_dir(&root) else {
        return Ok(Vec::new());
    };
    let mut records = Vec::new();
    for owner in owners.filter_map(Result::ok) {
        if !owner.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        let entries = fs::read_dir(owner.path()).map_err(|_| {
            history_error("GitOdile couldn't inspect existing history recovery records.")
        })?;
        for entry in entries.filter_map(Result::ok) {
            if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let bytes = fs::read(entry.path()).map_err(|_| {
                history_error("GitOdile couldn't read an existing history recovery record.")
            })?;
            let record: HistoryRecoveryRecord = serde_json::from_slice(&bytes).map_err(|_| {
                history_error("An existing history recovery record is unreadable; GitOdile kept it for inspection.")
            })?;
            if record.schema_version != HISTORY_RECOVERY_SCHEMA_VERSION {
                return Err(history_error(
                    "A history recovery record uses an unsupported format; GitOdile kept it for inspection.",
                ));
            }
            records.push((entry.path(), record));
        }
    }
    Ok(records)
}

fn list_history_refs(path: &str) -> Result<HashMap<String, String>, AppError> {
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)%09%(objectname)",
            HISTORY_RECOVERY_NAMESPACE,
        ],
    )?;
    if !output.status.success() {
        return Err(history_error(
            "GitOdile couldn't inspect existing history recovery references.",
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let (reference, commit) = line.split_once('\t')?;
            Some((reference.to_string(), commit.to_string()))
        })
        .collect())
}

fn delete_history_record(
    path: &str,
    manifest_path: &Path,
    record: &HistoryRecoveryRecord,
) -> Result<(), AppError> {
    let output = run_git(
        path,
        &[
            "update-ref",
            "-d",
            &record.reference,
            &record.previous_commit,
        ],
    )?;
    if !output.status.success() {
        return Err(history_error(
            "GitOdile couldn't remove an expired history recovery reference safely.",
        ));
    }
    let verification = run_git(path, &["rev-parse", "--verify", &record.reference])?;
    if verification.status.success() {
        return Err(history_error(
            "An expired history recovery reference did not disappear as expected.",
        ));
    }
    fs::remove_file(manifest_path).map_err(|_| {
        history_error("GitOdile couldn't finish cleaning an expired history recovery record.")
    })
}

fn reconcile_pending_history_records(
    repository: &RepositoryContext,
    refs: &mut HashMap<String, String>,
) -> Result<(), AppError> {
    let common = repository.common_git_dir.backend_path();
    let pending_root = history_recovery_root(common).join("pending");
    let Ok(entries) = fs::read_dir(&pending_root) else {
        return Ok(());
    };
    let path = repo_path(repository);
    for entry in entries.filter_map(Result::ok) {
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let bytes = fs::read(entry.path()).map_err(|_| {
            history_error("GitOdile couldn't read pending history recovery evidence.")
        })?;
        let record: HistoryRecoveryRecord = serde_json::from_slice(&bytes).map_err(|_| {
            history_error(
                "Pending history recovery evidence is unreadable; GitOdile kept it for inspection.",
            )
        })?;
        if record.schema_version != HISTORY_RECOVERY_SCHEMA_VERSION {
            return Err(history_error(
                "Pending history recovery evidence uses an unsupported format; GitOdile kept it for inspection.",
            ));
        }
        let final_path = history_record_path(common, &record.owner_id, &record.recovery_id);
        if final_path.is_file() {
            fs::remove_file(entry.path()).map_err(|_| {
                history_error("GitOdile couldn't remove duplicate pending recovery evidence.")
            })?;
            continue;
        }
        match refs.get(&record.reference) {
            None => {
                fs::remove_file(entry.path()).map_err(|_| {
                    history_error("GitOdile couldn't clean incomplete recovery metadata.")
                })?;
            }
            Some(commit) if commit == &record.previous_commit => {
                let deleted = run_git(
                    &path,
                    &[
                        "update-ref",
                        "-d",
                        &record.reference,
                        &record.previous_commit,
                    ],
                )?;
                if !deleted.status.success()
                    || run_git(&path, &["rev-parse", "--verify", &record.reference])?
                        .status
                        .success()
                {
                    return Err(history_error(
                        "GitOdile couldn't reconcile an incomplete history recovery reference safely.",
                    ));
                }
                refs.remove(&record.reference);
                fs::remove_file(entry.path()).map_err(|_| {
                    history_error("GitOdile couldn't finish reconciling pending recovery evidence.")
                })?;
            }
            Some(_) => {
                return Err(history_error(
                    "A pending history recovery reference moved unexpectedly; GitOdile kept it for inspection.",
                ));
            }
        }
    }
    Ok(())
}

fn reserve_history_recovery_slot(repository: &RepositoryContext) -> Result<(), AppError> {
    let common = repository.common_git_dir.backend_path();
    let path = repo_path(repository);
    let mut refs = list_history_refs(&path)?;
    reconcile_pending_history_records(repository, &mut refs)?;
    let mut records = read_history_records(common)?;

    // A manifest without its ref cannot protect a commit. Remove only that
    // manifest; refs without complete manifests remain counted and therefore
    // eventually block new creation rather than being guessed at or deleted.
    records.retain(|(manifest_path, record)| {
        if refs.get(&record.reference) == Some(&record.previous_commit) {
            true
        } else {
            let _ = fs::remove_file(manifest_path);
            false
        }
    });
    records.sort_by_key(|(_, record)| record.created_at_ms);
    while refs.len() >= MAX_HISTORY_RECOVERY_RECORDS {
        let Some((manifest_path, record)) = records.first().cloned() else {
            return Err(history_error(
                "History recovery contains incomplete records, so GitOdile couldn't guarantee its retention limit.",
            ));
        };
        delete_history_record(&path, &manifest_path, &record)?;
        refs.remove(&record.reference);
        records.remove(0);
    }
    Ok(())
}

fn object_zero_oid(path: &str) -> Result<String, AppError> {
    let output = run_git(path, &["rev-parse", "--show-object-format=storage"])?;
    let format = String::from_utf8_lossy(&output.stdout);
    Ok(if output.status.success() && format.trim() == "sha256" {
        "0".repeat(64)
    } else {
        "0".repeat(40)
    })
}

fn cleanup_partial_history_ref(path: &str, reference: &str, commit: &str) {
    let _ = run_git(path, &["update-ref", "-d", reference, commit]);
}

pub(crate) fn create_history_recovery(
    repository: &RepositoryContext,
    planned_reference: &str,
    metadata: HistoryRecoveryMetadata,
) -> Result<HistoryRecoveryRecord, AppError> {
    let owner_id = history_owner_id(repository);
    let prefix = format!("{HISTORY_RECOVERY_NAMESPACE}/{owner_id}/");
    let recovery_id = planned_reference
        .strip_prefix(&prefix)
        .filter(|value| {
            !value.is_empty()
                && !value.contains('/')
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
        .ok_or_else(|| history_error("That planned history recovery reference is invalid."))?
        .to_string();

    reserve_history_recovery_slot(repository)?;
    let common = repository.common_git_dir.backend_path();
    let pending = history_pending_path(common, &owner_id, &recovery_id);
    let final_path = history_record_path(common, &owner_id, &recovery_id);
    if let Some(parent) = pending.parent() {
        fs::create_dir_all(parent).map_err(|_| {
            history_error("GitOdile couldn't create its pending history recovery folder.")
        })?;
    }
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| history_error("GitOdile couldn't create its history recovery folder."))?;
    }

    let record = HistoryRecoveryRecord {
        schema_version: HISTORY_RECOVERY_SCHEMA_VERSION,
        recovery_id,
        reference: planned_reference.to_string(),
        created_at_ms: now_ms().min(u128::from(u64::MAX)) as u64,
        operation: "get-team-changes".to_string(),
        owner_id,
        branch: metadata.branch,
        previous_commit: metadata.previous_commit,
        target_commit: metadata.target_commit,
        remote: metadata.remote,
        destination_branch: metadata.destination_branch,
        tracking_ref: metadata.tracking_ref,
        state_token: metadata.state_token,
        retention_limit: MAX_HISTORY_RECOVERY_RECORDS,
    };
    let bytes = serde_json::to_vec_pretty(&record)
        .map_err(|_| history_error("GitOdile couldn't encode history recovery metadata."))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&pending)
        .map_err(|_| history_error("GitOdile couldn't reserve history recovery metadata."))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| {
            history_error("GitOdile couldn't finish writing history recovery metadata.")
        })?;
    drop(file);

    let path = repo_path(repository);
    let zero = object_zero_oid(&path)?;
    let created = run_git(
        &path,
        &[
            "update-ref",
            &record.reference,
            &record.previous_commit,
            &zero,
        ],
    )?;
    if !created.status.success() {
        let _ = fs::remove_file(&pending);
        return Err(AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't create the planned history recovery reference atomically.",
        )
        .with_remediation("Review the update again to allocate a new recovery point."));
    }
    let resolved = run_git(
        &path,
        &[
            "rev-parse",
            "--verify",
            &format!("{}^{{commit}}", record.reference),
        ],
    )?;
    if !resolved.status.success()
        || String::from_utf8_lossy(&resolved.stdout).trim() != record.previous_commit
    {
        cleanup_partial_history_ref(&path, &record.reference, &record.previous_commit);
        return Err(history_error(
            "The new history recovery reference could not be verified.",
        ));
    }

    if fs::rename(&pending, &final_path).is_err() {
        cleanup_partial_history_ref(&path, &record.reference, &record.previous_commit);
        return Err(history_error(
            "GitOdile couldn't publish the completed history recovery metadata atomically.",
        ));
    }
    let verified: HistoryRecoveryRecord = fs::read(&final_path)
        .ok()
        .and_then(|value| serde_json::from_slice(&value).ok())
        .ok_or_else(|| {
            history_error("The completed history recovery metadata could not be verified.")
        })?;
    if verified != record {
        return Err(history_error(
            "The completed history recovery metadata did not match the protected commit.",
        ));
    }
    Ok(record)
}

pub(crate) fn verify_history_recovery(
    path: &str,
    record: &HistoryRecoveryRecord,
) -> Result<(), AppError> {
    let output = run_git(
        path,
        &[
            "rev-parse",
            "--verify",
            &format!("{}^{{commit}}", record.reference),
        ],
    )?;
    if output.status.success()
        && String::from_utf8_lossy(&output.stdout).trim() == record.previous_commit
    {
        Ok(())
    } else {
        Err(history_error(
            "The history recovery point no longer resolves to the protected commit.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_storage_and_refs_use_the_canonical_product_namespace() {
        let common = Path::new("project").join(".git");
        let root = common.join("gitodile").join("history-recovery").join("v1");
        assert_eq!(
            HISTORY_RECOVERY_NAMESPACE,
            "refs/gitodile/recovery/v1/get-team-changes"
        );
        assert_eq!(
            history_record_path(&common, "worktree-main", "record-id"),
            root.join("get-team-changes")
                .join("worktree-main")
                .join("record-id.json")
        );
        assert_eq!(
            history_pending_path(&common, "worktree-main", "record-id"),
            root.join("pending").join("worktree-main-record-id.json")
        );
    }

    #[test]
    fn history_owner_hash_and_ids_are_stable_and_collision_resistant() {
        assert_eq!(stable_fnv1a("main"), stable_fnv1a("main"));
        assert_ne!(stable_fnv1a("main"), stable_fnv1a("worktrees/one"));
        assert_ne!(unique_history_recovery_id(), unique_history_recovery_id());
    }
}

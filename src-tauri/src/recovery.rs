//! Persistent recovery and safe discard workflows.
//!
//! Discard is destructive, so this module owns the complete
//! plan/revalidate/snapshot/mutate/verify contract described by ADR 0007.

use crate::application;
use crate::changes::validate_repo_relative_path;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{run_git, run_git_with_env};
use crate::operation::OperationKind;
use crate::repository::{resolve_head_state, HeadState};
use crate::repository_access::RepositoryContext;
use crate::status::{
    checked_status_records, ChangeCategory, RawStatusEntry, WorkingTreeCounts, STATUS_ARGS,
};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const RECOVERY_SCHEMA_VERSION: u32 = 1;
const MAX_RECOVERY_RECORDS: usize = 10;
const HISTORY_RECOVERY_SCHEMA_VERSION: u32 = 1;
pub(crate) const MAX_HISTORY_RECOVERY_RECORDS: usize = 20;
const HISTORY_RECOVERY_NAMESPACE: &str = "refs/gitodrile/recovery/v1/get-team-changes";

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiscardPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) state_token: String,
    pub(crate) file_count: usize,
    pub(crate) counts: WorkingTreeCounts,
    pub(crate) selected_path: Option<String>,
    pub(crate) affects_prepared_changes: bool,
    pub(crate) removes_untracked_files: bool,
    pub(crate) includes_conflicts: bool,
    pub(crate) is_unborn: bool,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiscardResult {
    pub(crate) discarded_files: usize,
    pub(crate) recovery: DiscardRecovery,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiscardRecovery {
    pub(crate) recovery_id: String,
    pub(crate) created_at_ms: u128,
    pub(crate) file_count: usize,
    pub(crate) selected_path: Option<String>,
    pub(crate) state_token: String,
}

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

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct RecoveryManifest {
    version: u32,
    recovery_id: String,
    created_at_ms: u128,
    selected_path: Option<String>,
    before_state_token: String,
    after_state_token: Option<String>,
    index_existed: bool,
    paths: Vec<RecoveryPath>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct RecoveryPath {
    path: String,
    state: RecoveryPathState,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum RecoveryPathState {
    Absent,
    Directory,
    File {
        payload: String,
        readonly: bool,
        #[cfg(unix)]
        mode: u32,
    },
    Symlink {
        target: String,
        target_is_directory: bool,
    },
}

struct ValidatedDiscard {
    entries: Vec<RawStatusEntry>,
    target_paths: Vec<String>,
    state_token: String,
    head_state: HeadState,
}

fn error(message: &str) -> AppError {
    AppError::new(AppErrorCode::RecoveryFailed, message).with_remediation(
        "No changes were intentionally left without a recovery copy. Check disk space and permissions, then try again.",
    )
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0)
}

fn unique_recovery_id() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    format!(
        "discard-{}-{}-{}",
        now_ms(),
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

fn recovery_root(git_dir: &Path) -> PathBuf {
    git_dir.join("gitodrile").join("recovery")
}

fn index_path(git_dir: &Path) -> PathBuf {
    git_dir.join("index")
}

fn hash_file(path: &Path, hasher: &mut impl Hasher) -> Result<(), AppError> {
    let mut file = File::open(path)
        .map_err(|_| error("GitOdrile couldn't read a file before creating recovery."))?;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| error("GitOdrile couldn't finish reading a file for recovery."))?;
        if read == 0 {
            break;
        }
        hasher.write(&buffer[..read]);
    }
    Ok(())
}

fn validate_target(root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    validate_repo_relative_path(relative)?;
    let root = root
        .canonicalize()
        .map_err(|_| error("The project folder can't be resolved."))?;
    let target = root.join(relative);
    let mut existing_parent = target.parent();
    while let Some(parent) = existing_parent {
        if parent.exists() {
            let canonical = parent
                .canonicalize()
                .map_err(|_| error("A changed file's parent folder can't be resolved safely."))?;
            if !canonical.starts_with(&root) {
                return Err(AppError::new(
                    AppErrorCode::PathInvalid,
                    "That changed path leaves the project through a symbolic link.",
                ));
            }
            break;
        }
        existing_parent = parent.parent();
    }
    Ok(target)
}

fn state_token(
    root: &Path,
    git_dir: &Path,
    status_output: &[u8],
    selected_path: Option<&str>,
) -> Result<String, AppError> {
    let records = checked_status_records(status_output)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    status_output.hash(&mut hasher);
    selected_path.hash(&mut hasher);
    let index = index_path(git_dir);
    index.exists().hash(&mut hasher);
    if index.exists() {
        hash_file(&index, &mut hasher)?;
    }
    for entry in records.entries {
        for relative in std::iter::once(entry.path).chain(entry.original_path) {
            relative.hash(&mut hasher);
            let path = validate_target(root, &relative)?;
            match fs::symlink_metadata(&path) {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    "symlink".hash(&mut hasher);
                    fs::read_link(&path)
                        .map_err(|_| error("GitOdrile couldn't read a changed symbolic link."))?
                        .hash(&mut hasher);
                }
                Ok(metadata) if metadata.is_file() => {
                    "file".hash(&mut hasher);
                    metadata.len().hash(&mut hasher);
                    hash_file(&path, &mut hasher)?;
                }
                Ok(_) => "unsupported".hash(&mut hasher),
                Err(value) if value.kind() == std::io::ErrorKind::NotFound => {
                    "absent".hash(&mut hasher)
                }
                Err(_) => return Err(error("GitOdrile couldn't inspect a changed path safely.")),
            }
        }
    }
    Ok(format!("{:016x}", hasher.finish()))
}

fn read_status(path: &str) -> Result<Vec<u8>, AppError> {
    let output = run_git(path, &STATUS_ARGS)?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't refresh the changed files for this operation.",
        ));
    }
    checked_status_records(&output.stdout)?;
    Ok(output.stdout)
}

fn validate_discard(
    path: &str,
    root: &Path,
    git_dir: &Path,
    selected_path: Option<String>,
) -> Result<ValidatedDiscard, AppError> {
    if let Some(value) = selected_path.as_deref() {
        validate_repo_relative_path(value)?;
    }
    let status_output = read_status(path)?;
    let records = checked_status_records(&status_output)?;
    let entries = match selected_path.as_deref() {
        Some(target) => records
            .entries
            .into_iter()
            .filter(|entry| entry.path == target)
            .collect::<Vec<_>>(),
        None => records.entries,
    };
    if entries.is_empty() {
        return Err(AppError::new(
            AppErrorCode::NothingToDiscard,
            "There are no matching unsaved changes to discard.",
        ));
    }
    let mut target_paths = Vec::new();
    for entry in &entries {
        for target in std::iter::once(&entry.path).chain(entry.original_path.as_ref()) {
            validate_target(root, target)?;
            if !target_paths.contains(target) {
                target_paths.push(target.clone());
            }
        }
    }
    let state_token = state_token(root, git_dir, &status_output, selected_path.as_deref())?;
    Ok(ValidatedDiscard {
        entries,
        target_paths,
        state_token,
        head_state: resolve_head_state(path, None)?.0,
    })
}

fn counts(entries: &[RawStatusEntry]) -> WorkingTreeCounts {
    let mut result = WorkingTreeCounts::default();
    for entry in entries {
        match entry.category {
            ChangeCategory::Changed => result.changed += 1,
            ChangeCategory::New => result.new_files += 1,
            ChangeCategory::Deleted => result.deleted += 1,
            ChangeCategory::Renamed => result.renamed += 1,
            ChangeCategory::Conflicted => result.conflicted += 1,
        }
        result.total += 1;
    }
    result
}

pub(crate) fn plan_discard_changes(
    path: String,
    selected_path: Option<String>,
) -> Result<DiscardPlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_discard_changes", None)?;
    let validated = validate_discard(
        &path,
        repository.worktree_root.backend_path(),
        repository.git_dir.backend_path(),
        selected_path.clone(),
    )?;
    let breakdown = counts(&validated.entries);
    Ok(DiscardPlan {
        operation_kind: OperationKind::Destructive,
        state_token: validated.state_token,
        file_count: validated.entries.len(),
        counts: breakdown,
        selected_path,
        affects_prepared_changes: validated.entries.iter().any(|entry| entry.is_prepared),
        removes_untracked_files: validated.entries.iter().any(|entry| entry.is_untracked),
        includes_conflicts: validated
            .entries
            .iter()
            .any(|entry| entry.category == ChangeCategory::Conflicted),
        is_unborn: validated.head_state == HeadState::Unborn,
        recovery: "GitOdrile will keep a private local recovery copy before changing any file."
            .to_string(),
        requires_confirmation: true,
    })
}

fn capture_path(
    root: &Path,
    record: &Path,
    relative: &str,
    index: usize,
) -> Result<RecoveryPath, AppError> {
    let path = validate_target(root, relative)?;
    let state = match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            let target = fs::read_link(&path)
                .map_err(|_| error("GitOdrile couldn't capture a changed symbolic link."))?;
            RecoveryPathState::Symlink {
                target: target.to_string_lossy().to_string(),
                // Git symlinks are file-like entries. Avoid following the
                // link merely to guess a Windows creation API.
                target_is_directory: false,
            }
        }
        Ok(metadata) if metadata.is_file() => {
            let payload = format!("files/{index}");
            fs::copy(&path, record.join(&payload))
                .map_err(|_| error("GitOdrile couldn't copy a changed file into recovery."))?;
            #[cfg(unix)]
            let mode = {
                use std::os::unix::fs::PermissionsExt;
                metadata.permissions().mode()
            };
            RecoveryPathState::File {
                payload,
                readonly: metadata.permissions().readonly(),
                #[cfg(unix)]
                mode,
            }
        }
        Ok(metadata) if metadata.is_dir() && !path.join(".git").exists() => {
            // A tracked file can temporarily become a directory. Its contents
            // are captured as their own exact status paths; this marker only
            // preserves the directory shape without recursively traversing it.
            RecoveryPathState::Directory
        }
        Ok(_) => {
            return Err(AppError::new(
                AppErrorCode::PathInvalid,
                "This changed path is a submodule or unsupported filesystem entry.",
            )
            .with_remediation("Handle submodules outside GitOdrile for now."))
        }
        Err(value) if value.kind() == std::io::ErrorKind::NotFound => RecoveryPathState::Absent,
        Err(_) => {
            return Err(error(
                "GitOdrile couldn't inspect a changed path for recovery.",
            ))
        }
    };
    Ok(RecoveryPath {
        path: relative.to_string(),
        state,
    })
}

fn write_manifest(record: &Path, manifest: &RecoveryManifest) -> Result<(), AppError> {
    let value = serde_json::to_vec_pretty(manifest)
        .map_err(|_| error("GitOdrile couldn't encode the recovery manifest."))?;
    let temporary = record.join("manifest.json.tmp");
    let final_path = record.join("manifest.json");
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|_| error("GitOdrile couldn't create the recovery manifest."))?;
    file.write_all(&value)
        .and_then(|_| file.sync_all())
        .map_err(|_| error("GitOdrile couldn't finish writing the recovery manifest."))?;
    drop(file);
    if final_path.exists() {
        fs::remove_file(&final_path)
            .map_err(|_| error("GitOdrile couldn't update recovery safely."))?;
    }
    fs::rename(&temporary, &final_path)
        .map_err(|_| error("GitOdrile couldn't publish the recovery manifest atomically."))
}

fn publish_latest(root: &Path, recovery_id: &str) -> Result<(), AppError> {
    let temporary = root.join("latest.tmp");
    let latest = root.join("latest");
    fs::write(&temporary, recovery_id)
        .map_err(|_| error("GitOdrile couldn't publish the recovery pointer."))?;
    if latest.exists() {
        fs::remove_file(&latest)
            .map_err(|_| error("GitOdrile couldn't update the recovery pointer."))?;
    }
    fs::rename(temporary, latest)
        .map_err(|_| error("GitOdrile couldn't publish the recovery pointer."))
}

fn create_snapshot(
    root: &Path,
    git_dir: &Path,
    validated: &ValidatedDiscard,
    selected_path: Option<String>,
) -> Result<(PathBuf, RecoveryManifest), AppError> {
    let recovery_root = recovery_root(git_dir);
    fs::create_dir_all(recovery_root.join("pending"))
        .map_err(|_| error("GitOdrile couldn't create its local recovery folder."))?;
    let recovery_id = unique_recovery_id();
    let pending = recovery_root.join("pending").join(&recovery_id);
    fs::create_dir_all(pending.join("files"))
        .map_err(|_| error("GitOdrile couldn't create a recovery record."))?;
    let index = index_path(git_dir);
    let index_existed = index.exists();
    if index_existed {
        fs::copy(&index, pending.join("index"))
            .map_err(|_| error("GitOdrile couldn't protect the project's prepared changes."))?;
    }
    let mut paths = Vec::new();
    for (sequence, relative) in validated.target_paths.iter().enumerate() {
        paths.push(capture_path(root, &pending, relative, sequence)?);
    }
    let manifest = RecoveryManifest {
        version: RECOVERY_SCHEMA_VERSION,
        recovery_id: recovery_id.clone(),
        created_at_ms: now_ms(),
        selected_path,
        before_state_token: validated.state_token.clone(),
        after_state_token: None,
        index_existed,
        paths,
    };
    write_manifest(&pending, &manifest)?;
    let complete = recovery_root.join(&recovery_id);
    fs::rename(&pending, &complete)
        .map_err(|_| error("GitOdrile couldn't publish the completed recovery record."))?;
    publish_latest(&recovery_root, &recovery_id)?;
    Ok((complete, manifest))
}

fn head_paths(
    path: &str,
    candidates: &[String],
    head_state: &HeadState,
) -> Result<HashSet<String>, AppError> {
    if *head_state == HeadState::Unborn {
        return Ok(HashSet::new());
    }
    let mut args = vec![
        "ls-tree".to_string(),
        "-r".to_string(),
        "-z".to_string(),
        "--name-only".to_string(),
        "HEAD".to_string(),
        "--".to_string(),
    ];
    args.extend(candidates.iter().cloned());
    let output = run_git_with_env(path, &args, &[])?;
    if !output.status.success() {
        return Err(error("Git couldn't inspect the latest saved file state."));
    }
    Ok(output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|value| !value.is_empty())
        .filter_map(|value| std::str::from_utf8(value).ok().map(str::to_string))
        .collect())
}

fn remove_worktree_path(root: &Path, relative: &str) -> Result<(), AppError> {
    let target = validate_target(root, relative)?;
    match fs::symlink_metadata(&target) {
        Ok(metadata) if metadata.is_file() || metadata.file_type().is_symlink() => {
            fs::remove_file(&target)
                .map_err(|_| error("GitOdrile couldn't remove an unsaved file."))
        }
        Ok(metadata) if metadata.is_dir() => fs::remove_dir(&target).map_err(|_| {
            AppError::new(
                AppErrorCode::PathInvalid,
                "GitOdrile refused to remove a non-empty directory while discarding changes.",
            )
        }),
        Ok(_) => Err(AppError::new(
            AppErrorCode::PathInvalid,
            "GitOdrile refused to remove an unsupported filesystem entry.",
        )),
        Err(value)
            if matches!(
                value.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory
            ) =>
        {
            Ok(())
        }
        Err(_) => Err(error(
            "GitOdrile couldn't inspect an unsaved file before removing it.",
        )),
    }
}

fn mutate_discard(path: &str, root: &Path, validated: &ValidatedDiscard) -> Result<(), AppError> {
    let in_head = head_paths(path, &validated.target_paths, &validated.head_state)?;
    let tracked = validated
        .target_paths
        .iter()
        .filter(|item| in_head.contains(*item))
        .cloned()
        .collect::<Vec<_>>();
    let new_paths = validated
        .target_paths
        .iter()
        .filter(|item| !in_head.contains(*item))
        .cloned()
        .collect::<Vec<_>>();
    if !new_paths.is_empty() {
        let mut args = vec![
            "rm".to_string(),
            "--cached".to_string(),
            "-f".to_string(),
            "--ignore-unmatch".to_string(),
            "--".to_string(),
        ];
        args.extend(new_paths.iter().cloned());
        let output = run_git_with_env(path, &args, &[])?;
        if !output.status.success() {
            return Err(error(
                "Git couldn't clear the prepared state for new files.",
            ));
        }
        for item in new_paths {
            remove_worktree_path(root, &item)?;
        }
    }
    // A tracked file may currently be an untracked directory. Its children
    // were exact status targets and have just been removed; only remove the
    // directory itself when it is now empty, never recursively.
    for item in &tracked {
        let target = validate_target(root, item)?;
        if fs::symlink_metadata(&target).is_ok_and(|metadata| metadata.is_dir())
            && fs::read_dir(&target).is_ok_and(|mut entries| entries.next().is_none())
        {
            fs::remove_dir(&target)
                .map_err(|_| error("GitOdrile couldn't clear an empty file-transition folder."))?;
        }
    }
    if !tracked.is_empty() {
        let mut args = vec![
            "restore".to_string(),
            "--source=HEAD".to_string(),
            "--staged".to_string(),
            "--worktree".to_string(),
            "--".to_string(),
        ];
        args.extend(tracked);
        let output = run_git_with_env(path, &args, &[])?;
        if !output.status.success() {
            return Err(error("Git couldn't restore the latest saved file state."));
        }
    }
    Ok(())
}

#[cfg(unix)]
fn create_symlink(target: &str, path: &Path, _directory: bool) -> std::io::Result<()> {
    std::os::unix::fs::symlink(target, path)
}

#[cfg(windows)]
fn create_symlink(target: &str, path: &Path, directory: bool) -> std::io::Result<()> {
    if directory {
        std::os::windows::fs::symlink_dir(target, path)
    } else {
        std::os::windows::fs::symlink_file(target, path)
    }
}

fn restore_snapshot(
    root: &Path,
    git_dir: &Path,
    record: &Path,
    manifest: &RecoveryManifest,
) -> Result<(), AppError> {
    // Remove exact targets deepest-first, so a captured file/directory
    // transition never requires a recursive delete.
    let mut targets = manifest.paths.iter().collect::<Vec<_>>();
    targets.sort_by_key(|item| std::cmp::Reverse(item.path.matches('/').count()));
    for item in targets {
        remove_worktree_path(root, &item.path)?;
    }
    for item in &manifest.paths {
        let target = validate_target(root, &item.path)?;
        match &item.state {
            RecoveryPathState::Absent => {}
            RecoveryPathState::Directory => {
                fs::create_dir_all(&target)
                    .map_err(|_| error("GitOdrile couldn't restore a recovered directory."))?;
            }
            RecoveryPathState::File {
                payload,
                readonly,
                #[cfg(unix)]
                mode,
            } => {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|_| {
                        error("GitOdrile couldn't recreate a parent folder during recovery.")
                    })?;
                }
                fs::copy(record.join(payload), &target)
                    .map_err(|_| error("GitOdrile couldn't restore a recovered file."))?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&target, fs::Permissions::from_mode(*mode))
                        .map_err(|_| error("GitOdrile couldn't restore a file's mode."))?;
                }
                #[cfg(not(unix))]
                {
                    let mut permissions = fs::metadata(&target)
                        .map_err(|_| error("GitOdrile couldn't inspect a restored file."))?
                        .permissions();
                    permissions.set_readonly(*readonly);
                    fs::set_permissions(&target, permissions)
                        .map_err(|_| error("GitOdrile couldn't restore a file's permissions."))?;
                }
                let _ = readonly;
            }
            RecoveryPathState::Symlink {
                target: link_target,
                target_is_directory,
            } => {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|_| {
                        error("GitOdrile couldn't recreate a symlink parent folder.")
                    })?;
                }
                create_symlink(link_target, &target, *target_is_directory)
                    .map_err(|_| error("GitOdrile couldn't restore a symbolic link."))?;
            }
        }
    }
    let index = index_path(git_dir);
    if manifest.index_existed {
        fs::copy(record.join("index"), &index)
            .map_err(|_| error("GitOdrile couldn't restore the project's prepared changes."))?;
    } else if index.exists() {
        fs::remove_file(index)
            .map_err(|_| error("GitOdrile couldn't restore the empty prepared state."))?;
    }
    Ok(())
}

fn read_manifest(record: &Path) -> Result<RecoveryManifest, AppError> {
    let bytes = fs::read(record.join("manifest.json")).map_err(|_| {
        AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "That discard recovery is no longer available.",
        )
    })?;
    let manifest: RecoveryManifest = serde_json::from_slice(&bytes)
        .map_err(|_| error("GitOdrile couldn't read the discard recovery manifest."))?;
    if manifest.version != RECOVERY_SCHEMA_VERSION {
        return Err(AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "This discard recovery uses an unsupported format.",
        ));
    }
    Ok(manifest)
}

fn latest_manifest(git_dir: &Path) -> Result<(PathBuf, RecoveryManifest), AppError> {
    let root = recovery_root(git_dir);
    let id = fs::read_to_string(root.join("latest")).map_err(|_| {
        AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "There is no discarded work to restore yet.",
        )
    })?;
    let record = root.join(id.trim());
    let manifest = read_manifest(&record)?;
    Ok((record, manifest))
}

fn cleanup_old_records(root: &Path, protected: &str) {
    let Ok(read) = fs::read_dir(root) else { return };
    let mut records = read
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().to_string();
            (id != "pending" && id != protected && entry.path().join("manifest.json").is_file())
                .then_some((id, entry.path()))
        })
        .collect::<Vec<_>>();
    records.sort_by(|left, right| right.0.cmp(&left.0));
    for (_, path) in records
        .into_iter()
        .skip(MAX_RECOVERY_RECORDS.saturating_sub(1))
    {
        let _ = fs::remove_dir_all(path);
    }
}

pub(crate) fn discard_changes(
    path: String,
    selected_path: Option<String>,
    state_token_value: String,
) -> Result<DiscardResult, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "discard_changes", None)?;
    let root = repository.worktree_root.backend_path();
    let git_dir = repository.git_dir.backend_path();
    let validated = validate_discard(&path, root, git_dir, selected_path.clone())?;
    if validated.state_token != state_token_value {
        return Err(AppError::new(
            AppErrorCode::StaleDiscardPlan,
            "The changed files moved since this discard preview was shown.",
        )
        .with_remediation("Review the updated discard plan before trying again."));
    }
    let (record, mut manifest) = create_snapshot(root, git_dir, &validated, selected_path)?;
    let mutation_result = mutate_discard(&path, root, &validated).and_then(|_| {
        let after_status = read_status(&path)?;
        let remaining = checked_status_records(&after_status)?.entries;
        let target_remains = if manifest.selected_path.is_some() {
            remaining.iter().any(|entry| {
                validated.target_paths.contains(&entry.path)
                    || entry
                        .original_path
                        .as_ref()
                        .is_some_and(|original| validated.target_paths.contains(original))
            })
        } else {
            !remaining.is_empty()
        };
        if target_remains {
            return Err(error(
                "Git reported success, but the confirmed changes were not fully discarded.",
            ));
        }
        state_token(
            root,
            git_dir,
            &after_status,
            manifest.selected_path.as_deref(),
        )
    });
    let after_state_token = match mutation_result {
        Ok(token) => token,
        Err(primary) => {
            return match restore_snapshot(root, git_dir, &record, &manifest) {
                Ok(()) => Err(primary.with_remediation(
                    "GitOdrile restored the protected files. Refresh and try again.",
                )),
                Err(restore) => Err(primary.with_detail(format!(
                    "Automatic recovery also failed: {}",
                    restore.message
                ))),
            };
        }
    };
    manifest.after_state_token = Some(after_state_token);
    write_manifest(&record, &manifest)?;
    publish_latest(&recovery_root(git_dir), &manifest.recovery_id)?;
    cleanup_old_records(&recovery_root(git_dir), &manifest.recovery_id);
    let after_state_token = manifest
        .after_state_token
        .clone()
        .ok_or_else(|| error("The discard completed, but its recovery token was not recorded."))?;
    Ok(DiscardResult {
        discarded_files: validated.entries.len(),
        recovery: DiscardRecovery {
            recovery_id: manifest.recovery_id,
            created_at_ms: manifest.created_at_ms,
            file_count: manifest.paths.len(),
            selected_path: manifest.selected_path,
            state_token: after_state_token,
        },
    })
}

pub(crate) fn get_discard_recovery(path: String) -> Result<DiscardRecovery, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "get_discard_recovery", None)?;
    let (_, manifest) = latest_manifest(repository.git_dir.backend_path())?;
    let token = manifest.after_state_token.clone().ok_or_else(|| {
        AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "That discard did not finish and cannot be restored automatically.",
        )
    })?;
    Ok(DiscardRecovery {
        recovery_id: manifest.recovery_id,
        created_at_ms: manifest.created_at_ms,
        file_count: manifest.paths.len(),
        selected_path: manifest.selected_path,
        state_token: token,
    })
}

pub(crate) fn restore_discarded_changes(
    path: String,
    recovery_id: String,
    state_token_value: String,
) -> Result<(), AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "restore_discarded_changes", None)?;
    let root = repository.worktree_root.backend_path();
    let git_dir = repository.git_dir.backend_path();
    let record = recovery_root(git_dir).join(&recovery_id);
    let manifest = read_manifest(&record)?;
    if manifest.recovery_id != recovery_id {
        return Err(AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "That recovery id is invalid.",
        ));
    }
    let expected = manifest.after_state_token.as_deref().ok_or_else(|| {
        AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "That discard cannot be restored automatically.",
        )
    })?;
    let current_status = read_status(&path)?;
    let current = state_token(
        root,
        git_dir,
        &current_status,
        manifest.selected_path.as_deref(),
    )?;
    if current != expected || state_token_value != expected {
        return Err(AppError::new(
            AppErrorCode::RecoveryConflict,
            "The project changed after this discard, so GitOdrile won't overwrite the newer work.",
        )
        .with_remediation(
            "Keep this recovery and review the current changes before restoring manually.",
        ));
    }
    restore_snapshot(root, git_dir, &record, &manifest)?;
    let restored_status = read_status(&path)?;
    let restored = state_token(
        root,
        git_dir,
        &restored_status,
        manifest.selected_path.as_deref(),
    )?;
    if restored != manifest.before_state_token {
        return Err(error("The recovered files were written, but their verification did not match the protected state."));
    }
    Ok(())
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
        .join("gitodrile")
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
            "GitOdrile will protect the current saved version with a verified local reference before changing history or files."
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
            history_error("GitOdrile couldn't inspect existing history recovery records.")
        })?;
        for entry in entries.filter_map(Result::ok) {
            if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let bytes = fs::read(entry.path()).map_err(|_| {
                history_error("GitOdrile couldn't read an existing history recovery record.")
            })?;
            let record: HistoryRecoveryRecord = serde_json::from_slice(&bytes).map_err(|_| {
                history_error("An existing history recovery record is unreadable; GitOdrile kept it for inspection.")
            })?;
            if record.schema_version != HISTORY_RECOVERY_SCHEMA_VERSION {
                return Err(history_error(
                    "A history recovery record uses an unsupported format; GitOdrile kept it for inspection.",
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
            "GitOdrile couldn't inspect existing history recovery references.",
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
            "GitOdrile couldn't remove an expired history recovery reference safely.",
        ));
    }
    let verification = run_git(path, &["rev-parse", "--verify", &record.reference])?;
    if verification.status.success() {
        return Err(history_error(
            "An expired history recovery reference did not disappear as expected.",
        ));
    }
    fs::remove_file(manifest_path).map_err(|_| {
        history_error("GitOdrile couldn't finish cleaning an expired history recovery record.")
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
            history_error("GitOdrile couldn't read pending history recovery evidence.")
        })?;
        let record: HistoryRecoveryRecord = serde_json::from_slice(&bytes).map_err(|_| {
            history_error(
                "Pending history recovery evidence is unreadable; GitOdrile kept it for inspection.",
            )
        })?;
        if record.schema_version != HISTORY_RECOVERY_SCHEMA_VERSION {
            return Err(history_error(
                "Pending history recovery evidence uses an unsupported format; GitOdrile kept it for inspection.",
            ));
        }
        let final_path = history_record_path(common, &record.owner_id, &record.recovery_id);
        if final_path.is_file() {
            fs::remove_file(entry.path()).map_err(|_| {
                history_error("GitOdrile couldn't remove duplicate pending recovery evidence.")
            })?;
            continue;
        }
        match refs.get(&record.reference) {
            None => {
                fs::remove_file(entry.path()).map_err(|_| {
                    history_error("GitOdrile couldn't clean incomplete recovery metadata.")
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
                        "GitOdrile couldn't reconcile an incomplete history recovery reference safely.",
                    ));
                }
                refs.remove(&record.reference);
                fs::remove_file(entry.path()).map_err(|_| {
                    history_error(
                        "GitOdrile couldn't finish reconciling pending recovery evidence.",
                    )
                })?;
            }
            Some(_) => {
                return Err(history_error(
                    "A pending history recovery reference moved unexpectedly; GitOdrile kept it for inspection.",
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
                "History recovery contains incomplete records, so GitOdrile couldn't guarantee its retention limit.",
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
            history_error("GitOdrile couldn't create its pending history recovery folder.")
        })?;
    }
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| history_error("GitOdrile couldn't create its history recovery folder."))?;
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
        .map_err(|_| history_error("GitOdrile couldn't encode history recovery metadata."))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&pending)
        .map_err(|_| history_error("GitOdrile couldn't reserve history recovery metadata."))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| {
            history_error("GitOdrile couldn't finish writing history recovery metadata.")
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
            "GitOdrile couldn't publish the completed history recovery metadata atomically.",
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
    fn recovery_ids_are_unique_and_sortable() {
        let first = unique_recovery_id();
        let second = unique_recovery_id();
        assert_ne!(first, second);
        assert!(first.starts_with("discard-"));
    }

    #[test]
    fn history_owner_hash_and_ids_are_stable_and_collision_resistant() {
        assert_eq!(stable_fnv1a("main"), stable_fnv1a("main"));
        assert_ne!(stable_fnv1a("main"), stable_fnv1a("worktrees/one"));
        assert_ne!(unique_history_recovery_id(), unique_history_recovery_id());
    }
}

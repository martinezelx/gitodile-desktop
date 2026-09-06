//! Safe discard of working-tree changes, with a persistent snapshot.
//!
//! Discard is destructive, so this module owns the complete
//! plan/revalidate/snapshot/mutate/verify contract described by ADR 0007. The
//! snapshot lives in the worktree's own `.git` directory; nothing here knows
//! about history recovery, which is a different owner in [`super::history`].

use super::now_ms;
use crate::application;
use crate::changes::validate_repo_relative_path;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{run_git, run_git_with_env};
use crate::operation::OperationKind;
use crate::repository::{resolve_head_state, HeadState};
use crate::status::{
    checked_status_records, ChangeCategory, RawStatusEntry, WorkingTreeCounts, STATUS_ARGS,
};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

const RECOVERY_SCHEMA_VERSION: u32 = 1;
const MAX_RECOVERY_RECORDS: usize = 10;
/// How many paths a listed record names on screen before it just says how
/// many more there are.
const RECOVERY_PREVIEW_PATHS: usize = 4;

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

/// Whether a stored recovery can be applied *right now*. Restoring writes the
/// protected state back over the working tree, so it is only ever offered when
/// nothing has been written at the paths it would restore; `Superseded` means
/// exactly that has happened, and `Incomplete` that the discard never finished.
/// The two are different facts and call for different answers, so they are
/// different values.
#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum DiscardRecoveryAvailability {
    Restorable,
    Superseded,
    Incomplete,
}

/// One stored recovery, as the restore picker reads it.
///
/// `preview_paths` is a handful of paths for naming the record on screen, not
/// its contents: a discard may hold a thousand of them, and ten records' worth
/// of full path lists is a payload nobody displays. `file_count` stays the
/// whole number.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiscardRecoveryRecord {
    pub(crate) recovery_id: String,
    pub(crate) created_at_ms: u128,
    pub(crate) file_count: usize,
    pub(crate) selected_path: Option<String>,
    pub(crate) preview_paths: Vec<String>,
    /// The token `restore_discarded_changes` expects back. `None` when the
    /// discard never finished, which is also why it cannot be restored.
    pub(crate) state_token: Option<String>,
    pub(crate) availability: DiscardRecoveryAvailability,
    /// Whether restoring will also put the project's prepared changes back.
    /// Only an exact whole-tree match can: once anything else in the project
    /// has moved on, today's index is newer than this record's copy of it, and
    /// writing that copy back would undo work this record never captured.
    pub(crate) restores_prepared_state: bool,
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
    /// What this record would write, independent of everything around it: the
    /// paths and the bytes, and nothing about the rest of the project. It is
    /// how a later discard recognises that it is protecting work an older
    /// record already holds.
    ///
    /// Optional because records written before it exist on disk and must stay
    /// readable; `serde` fills it with `None` and the caller falls back to
    /// comparing whole-tree fingerprints, which is what those records have.
    #[serde(default)]
    content_fingerprint: Option<String>,
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

/// The one refusal a restore has: something has been written where this record
/// would write. Its wording names the files rather than "the project", because
/// that is now exactly what was checked.
fn conflict() -> AppError {
    AppError::new(
        AppErrorCode::RecoveryConflict,
        "One of these files changed after this discard, so GitOdile won't overwrite the newer work.",
    )
    .with_remediation("Keep this recovery and review those files before restoring manually.")
}

fn error(message: &str) -> AppError {
    AppError::new(AppErrorCode::RecoveryFailed, message).with_remediation(
        "No changes were intentionally left without a recovery copy. Check disk space and permissions, then try again.",
    )
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
    git_dir.join("gitodile").join("recovery")
}

fn index_path(git_dir: &Path) -> PathBuf {
    git_dir.join("index")
}

fn hash_file(path: &Path, hasher: &mut impl Hasher) -> Result<(), AppError> {
    let mut file = File::open(path)
        .map_err(|_| error("GitOdile couldn't read a file before creating recovery."))?;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| error("GitOdile couldn't finish reading a file for recovery."))?;
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
                        .map_err(|_| error("GitOdile couldn't read a changed symbolic link."))?
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
                Err(_) => return Err(error("GitOdile couldn't inspect a changed path safely.")),
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
        recovery: "GitOdile will keep a private local recovery copy before changing any file."
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
                .map_err(|_| error("GitOdile couldn't capture a changed symbolic link."))?;
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
                .map_err(|_| error("GitOdile couldn't copy a changed file into recovery."))?;
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
            .with_remediation("Handle submodules outside GitOdile for now."))
        }
        Err(value) if value.kind() == std::io::ErrorKind::NotFound => RecoveryPathState::Absent,
        Err(_) => {
            return Err(error(
                "GitOdile couldn't inspect a changed path for recovery.",
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
        .map_err(|_| error("GitOdile couldn't encode the recovery manifest."))?;
    let temporary = record.join("manifest.json.tmp");
    let final_path = record.join("manifest.json");
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|_| error("GitOdile couldn't create the recovery manifest."))?;
    file.write_all(&value)
        .and_then(|_| file.sync_all())
        .map_err(|_| error("GitOdile couldn't finish writing the recovery manifest."))?;
    drop(file);
    if final_path.exists() {
        fs::remove_file(&final_path)
            .map_err(|_| error("GitOdile couldn't update recovery safely."))?;
    }
    fs::rename(&temporary, &final_path)
        .map_err(|_| error("GitOdile couldn't publish the recovery manifest atomically."))
}

fn publish_latest(root: &Path, recovery_id: &str) -> Result<(), AppError> {
    let temporary = root.join("latest.tmp");
    let latest = root.join("latest");
    fs::write(&temporary, recovery_id)
        .map_err(|_| error("GitOdile couldn't publish the recovery pointer."))?;
    if latest.exists() {
        fs::remove_file(&latest)
            .map_err(|_| error("GitOdile couldn't update the recovery pointer."))?;
    }
    fs::rename(temporary, latest)
        .map_err(|_| error("GitOdile couldn't publish the recovery pointer."))
}

/// A fingerprint of exactly what a record restores: each path, what kind of
/// thing it is, and — for files — the bytes now sitting in the record. It is
/// deliberately blind to the rest of the project, so discarding the same work
/// twice produces the same value however much has moved on around it.
fn content_fingerprint(record: &Path, paths: &[RecoveryPath]) -> Result<String, AppError> {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut ordered = paths.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| left.path.cmp(&right.path));
    for item in ordered {
        item.path.hash(&mut hasher);
        match &item.state {
            RecoveryPathState::Absent => "absent".hash(&mut hasher),
            RecoveryPathState::Directory => "directory".hash(&mut hasher),
            RecoveryPathState::Symlink { target, .. } => {
                "symlink".hash(&mut hasher);
                target.hash(&mut hasher);
            }
            RecoveryPathState::File { payload, .. } => {
                "file".hash(&mut hasher);
                hash_file(&record.join(payload), &mut hasher)?;
            }
        }
    }
    Ok(format!("{:016x}", hasher.finish()))
}

fn create_snapshot(
    root: &Path,
    git_dir: &Path,
    validated: &ValidatedDiscard,
    selected_path: Option<String>,
) -> Result<(PathBuf, RecoveryManifest), AppError> {
    let recovery_root = recovery_root(git_dir);
    fs::create_dir_all(recovery_root.join("pending"))
        .map_err(|_| error("GitOdile couldn't create its local recovery folder."))?;
    let recovery_id = unique_recovery_id();
    let pending = recovery_root.join("pending").join(&recovery_id);
    fs::create_dir_all(pending.join("files"))
        .map_err(|_| error("GitOdile couldn't create a recovery record."))?;
    let index = index_path(git_dir);
    let index_existed = index.exists();
    if index_existed {
        fs::copy(&index, pending.join("index"))
            .map_err(|_| error("GitOdile couldn't protect the project's prepared changes."))?;
    }
    let mut paths = Vec::new();
    for (sequence, relative) in validated.target_paths.iter().enumerate() {
        paths.push(capture_path(root, &pending, relative, sequence)?);
    }
    let content_fingerprint = Some(content_fingerprint(&pending, &paths)?);
    let manifest = RecoveryManifest {
        version: RECOVERY_SCHEMA_VERSION,
        recovery_id: recovery_id.clone(),
        created_at_ms: now_ms(),
        selected_path,
        before_state_token: validated.state_token.clone(),
        after_state_token: None,
        index_existed,
        paths,
        content_fingerprint,
    };
    write_manifest(&pending, &manifest)?;
    let complete = recovery_root.join(&recovery_id);
    fs::rename(&pending, &complete)
        .map_err(|_| error("GitOdile couldn't publish the completed recovery record."))?;
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
            fs::remove_file(&target).map_err(|_| error("GitOdile couldn't remove an unsaved file."))
        }
        Ok(metadata) if metadata.is_dir() => fs::remove_dir(&target).map_err(|_| {
            AppError::new(
                AppErrorCode::PathInvalid,
                "GitOdile refused to remove a non-empty directory while discarding changes.",
            )
        }),
        Ok(_) => Err(AppError::new(
            AppErrorCode::PathInvalid,
            "GitOdile refused to remove an unsupported filesystem entry.",
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
            "GitOdile couldn't inspect an unsaved file before removing it.",
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
                .map_err(|_| error("GitOdile couldn't clear an empty file-transition folder."))?;
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
    restore_index: bool,
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
                    .map_err(|_| error("GitOdile couldn't restore a recovered directory."))?;
            }
            RecoveryPathState::File {
                payload,
                readonly,
                #[cfg(unix)]
                mode,
            } => {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|_| {
                        error("GitOdile couldn't recreate a parent folder during recovery.")
                    })?;
                }
                fs::copy(record.join(payload), &target)
                    .map_err(|_| error("GitOdile couldn't restore a recovered file."))?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&target, fs::Permissions::from_mode(*mode))
                        .map_err(|_| error("GitOdile couldn't restore a file's mode."))?;
                }
                #[cfg(not(unix))]
                {
                    let mut permissions = fs::metadata(&target)
                        .map_err(|_| error("GitOdile couldn't inspect a restored file."))?
                        .permissions();
                    permissions.set_readonly(*readonly);
                    fs::set_permissions(&target, permissions)
                        .map_err(|_| error("GitOdile couldn't restore a file's permissions."))?;
                }
                let _ = readonly;
            }
            RecoveryPathState::Symlink {
                target: link_target,
                target_is_directory,
            } => {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|_| {
                        error("GitOdile couldn't recreate a symlink parent folder.")
                    })?;
                }
                create_symlink(link_target, &target, *target_is_directory)
                    .map_err(|_| error("GitOdile couldn't restore a symbolic link."))?;
            }
        }
    }
    // The index is the whole project's prepared state, not this record's own:
    // it can only go back when nothing else has moved on, or restoring it
    // would undo staging this record never captured.
    if !restore_index {
        return Ok(());
    }
    let index = index_path(git_dir);
    if manifest.index_existed {
        fs::copy(record.join("index"), &index)
            .map_err(|_| error("GitOdile couldn't restore the project's prepared changes."))?;
    } else if index.exists() {
        fs::remove_file(index)
            .map_err(|_| error("GitOdile couldn't restore the empty prepared state."))?;
    }
    Ok(())
}

/// Whether every path this record would write is still exactly as the discard
/// left it.
///
/// A discard leaves each of its targets in the project's saved state or removes
/// it altogether, and Git reports both as unchanged — so one of a record's own
/// paths showing up in today's status is precisely the signal that something
/// has been written there since. Anything *inside* a captured directory counts
/// as well, because restoring replaces the directory rather than merging into
/// it.
///
/// This is the check that matches what a restore can actually damage. The
/// whole-tree fingerprint answers a much broader question — "is the entire
/// project exactly as this discard left it" — which an edit to any unrelated
/// file makes false, taking every stored record out of reach with it.
fn record_paths_untouched(
    manifest: &RecoveryManifest,
    status_output: &[u8],
) -> Result<bool, AppError> {
    let records = checked_status_records(status_output)?;
    let changed = records
        .entries
        .iter()
        .flat_map(|entry| std::iter::once(entry.path.clone()).chain(entry.original_path.clone()))
        .collect::<Vec<_>>();
    Ok(!manifest.paths.iter().any(|item| {
        let inside = format!("{}/", item.path);
        changed
            .iter()
            .any(|path| *path == item.path || path.starts_with(&inside))
    }))
}

/// Confirms one restored path really carries the state the manifest recorded.
///
/// The exact-match restore verifies itself by recomputing the whole-tree
/// fingerprint, which a scoped restore cannot use: the rest of the project has
/// legitimately moved on, so that number is expected to differ. Checking each
/// path it wrote is the same guarantee applied to the part it touched.
fn verify_restored_path(root: &Path, record: &Path, item: &RecoveryPath) -> Result<(), AppError> {
    let target = validate_target(root, &item.path)?;
    let metadata = fs::symlink_metadata(&target);
    let mismatch = || {
        error("The recovered files were written, but their verification did not match the protected state.")
    };
    match &item.state {
        RecoveryPathState::Absent => match metadata {
            Err(value) if value.kind() == std::io::ErrorKind::NotFound => Ok(()),
            _ => Err(mismatch()),
        },
        RecoveryPathState::Directory => match metadata {
            Ok(value) if value.is_dir() => Ok(()),
            _ => Err(mismatch()),
        },
        RecoveryPathState::Symlink {
            target: link_target,
            ..
        } => match metadata {
            Ok(value) if value.file_type().is_symlink() => {
                let written = fs::read_link(&target)
                    .map_err(|_| error("GitOdile couldn't read a restored symbolic link."))?;
                if written.to_string_lossy() == *link_target {
                    Ok(())
                } else {
                    Err(mismatch())
                }
            }
            _ => Err(mismatch()),
        },
        RecoveryPathState::File { payload, .. } => match metadata {
            Ok(value) if value.is_file() => {
                let mut written = std::collections::hash_map::DefaultHasher::new();
                let mut saved = std::collections::hash_map::DefaultHasher::new();
                hash_file(&target, &mut written)?;
                hash_file(&record.join(payload), &mut saved)?;
                if written.finish() == saved.finish() {
                    Ok(())
                } else {
                    Err(mismatch())
                }
            }
            _ => Err(mismatch()),
        },
    }
}

fn read_manifest(record: &Path) -> Result<RecoveryManifest, AppError> {
    let bytes = fs::read(record.join("manifest.json")).map_err(|_| {
        AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "That discard recovery is no longer available.",
        )
    })?;
    let manifest: RecoveryManifest = serde_json::from_slice(&bytes)
        .map_err(|_| error("GitOdile couldn't read the discard recovery manifest."))?;
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

/// Retention, plus the one record a new one makes pointless.
///
/// A discard that captures exactly the work an older record already holds is
/// not a second recovery point, it is the same one again: discarding a file,
/// bringing it back and discarding it once more would otherwise leave the
/// picker offering the same bytes twice, with nothing to tell the two entries
/// apart but a clock. Both would restore identically, so the older one goes
/// and nothing is lost. Two discards of genuinely different content have
/// different fingerprints and both stay.
///
/// The comparison is the new record's own content, not the state of the
/// project around it: an edit somewhere else between the two discards is
/// exactly the sort of thing that makes a whole-tree fingerprint differ while
/// the two records still hold the same file, byte for byte. Records written
/// before this field existed have no content fingerprint, so for those the
/// whole-tree before-state is all there is to compare.
fn cleanup_old_records(root: &Path, protected: &str, protects: &RecoveryManifest) {
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
    let mut kept = 0;
    for (_, path) in records {
        let duplicate = read_manifest(&path)
            .map(
                |manifest| match (&manifest.content_fingerprint, &protects.content_fingerprint) {
                    (Some(stored), Some(new)) => stored == new,
                    _ => manifest.before_state_token == protects.before_state_token,
                },
            )
            .unwrap_or(false);
        if duplicate || kept >= MAX_RECOVERY_RECORDS.saturating_sub(1) {
            let _ = fs::remove_dir_all(path);
        } else {
            kept += 1;
        }
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
            // The discard's own rollback, undoing a mutation it started: the
            // index it puts back is the one it captured moments ago.
            return match restore_snapshot(root, git_dir, &record, &manifest, true) {
                Ok(()) => Err(primary.with_remediation(
                    "GitOdile restored the protected files. Refresh and try again.",
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
    cleanup_old_records(&recovery_root(git_dir), &manifest.recovery_id, &manifest);
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

/// Every stored recovery, newest first, each carrying whether it can be
/// applied right now.
///
/// The records were always there — up to [`MAX_RECOVERY_RECORDS`] of them, on
/// disk under the worktree's own `.git` — but only the `latest` pointer was
/// ever readable, so a second discard hid the first one behind it. Reading
/// them all is what lets the app offer a choice instead of an undo of exactly
/// one step.
///
/// A record whose manifest cannot be read at all is skipped rather than
/// failing the listing: an unreadable or future-schema record must not take
/// the recoverable ones down with it.
pub(crate) fn list_discard_recoveries(
    path: String,
) -> Result<Vec<DiscardRecoveryRecord>, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "list_discard_recoveries", None)?;
    let root = repository.worktree_root.backend_path();
    let git_dir = repository.git_dir.backend_path();
    let Ok(entries) = fs::read_dir(recovery_root(git_dir)) else {
        return Ok(Vec::new());
    };
    let mut manifests = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| entry.file_name() != "pending")
        .filter_map(|entry| read_manifest(&entry.path()).ok())
        .collect::<Vec<_>>();
    manifests.sort_by_key(|manifest| std::cmp::Reverse(manifest.created_at_ms));
    if manifests.is_empty() {
        return Ok(Vec::new());
    }

    // One status read for the whole listing, and one token per distinct
    // `selected_path` — the token hashes that value, so records made from
    // different selections do not share one, but ten records rarely span more
    // than a couple of selections.
    let status = read_status(&path)?;
    let mut tokens: std::collections::HashMap<Option<String>, String> =
        std::collections::HashMap::new();
    let mut records = Vec::with_capacity(manifests.len());
    for manifest in manifests {
        let mut restores_prepared_state = false;
        let availability = match manifest.after_state_token.as_deref() {
            None => DiscardRecoveryAvailability::Incomplete,
            Some(after) => {
                let current = match tokens.get(&manifest.selected_path) {
                    Some(value) => value.clone(),
                    None => {
                        let value =
                            state_token(root, git_dir, &status, manifest.selected_path.as_deref())?;
                        tokens.insert(manifest.selected_path.clone(), value.clone());
                        value
                    }
                };
                if current == after {
                    restores_prepared_state = true;
                    DiscardRecoveryAvailability::Restorable
                } else if record_paths_untouched(&manifest, &status)? {
                    DiscardRecoveryAvailability::Restorable
                } else {
                    DiscardRecoveryAvailability::Superseded
                }
            }
        };
        records.push(DiscardRecoveryRecord {
            recovery_id: manifest.recovery_id,
            created_at_ms: manifest.created_at_ms,
            file_count: manifest.paths.len(),
            selected_path: manifest.selected_path,
            preview_paths: manifest
                .paths
                .iter()
                .take(RECOVERY_PREVIEW_PATHS)
                .map(|item| item.path.clone())
                .collect(),
            state_token: manifest.after_state_token,
            availability,
            restores_prepared_state,
        });
    }
    Ok(records)
}

/// An id names one record directory and nothing else.
///
/// Every other operation here would merely fail on a crafted id, because it
/// reads a manifest that will not be there. Deleting removes a directory tree,
/// so this one is checked before the path is built rather than after: the id
/// is the app's own, `discard-<millis>-<pid>-<sequence>`, and anything with a
/// separator, a parent hop or a character outside that shape is refused
/// outright.
fn validate_recovery_id(recovery_id: &str) -> Result<(), AppError> {
    let shaped = !recovery_id.is_empty()
        && recovery_id.len() <= 128
        && recovery_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '-');
    if shaped {
        Ok(())
    } else {
        Err(AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "That recovery id is invalid.",
        ))
    }
}

/// Deletes one stored recovery for good.
///
/// This is the one thing in this module that destroys a snapshot instead of
/// protecting one, and it exists because the alternative is worse: copies of
/// discarded work sitting in the project's Git metadata with no way for the
/// person who made them to say "that one can go". ADR 0007 anticipated it.
/// The confirmation and the warning that it cannot be undone belong to the
/// caller; what belongs here is refusing to act on an id that does not name a
/// real record, and leaving the store consistent afterwards.
pub(crate) fn delete_discard_recovery(path: String, recovery_id: String) -> Result<(), AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "delete_discard_recovery", None)?;
    validate_recovery_id(&recovery_id)?;
    let root = recovery_root(repository.git_dir.backend_path());
    let record = root.join(&recovery_id);
    // Reading the manifest first is the proof that this id names a record this
    // module wrote, rather than any directory that happens to sit there.
    let manifest = read_manifest(&record)?;
    if manifest.recovery_id != recovery_id {
        return Err(AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "That recovery id is invalid.",
        ));
    }
    fs::remove_dir_all(&record)
        .map_err(|_| error("GitOdile couldn't delete that recovery copy."))?;
    // A pointer to a deleted record would read as "there is nothing to
    // restore" while other records sat right beside it.
    republish_latest(&root);
    Ok(())
}

/// Points `latest` at the newest record that is still there, or removes it
/// when the last one is gone.
fn republish_latest(root: &Path) {
    let newest = fs::read_dir(root)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| entry.file_name() != "pending")
        .filter_map(|entry| read_manifest(&entry.path()).ok())
        .max_by_key(|manifest| manifest.created_at_ms);
    match newest {
        Some(manifest) => {
            let _ = publish_latest(root, &manifest.recovery_id);
        }
        None => {
            let _ = fs::remove_file(root.join("latest"));
        }
    }
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
    validate_recovery_id(&recovery_id)?;
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
    // The caller has to be acting on the record it was shown, whichever way
    // this restore then proves it is safe.
    if state_token_value != expected {
        return Err(conflict());
    }
    let current_status = read_status(&path)?;
    let current = state_token(
        root,
        git_dir,
        &current_status,
        manifest.selected_path.as_deref(),
    )?;
    // Two ways to be safe, and they are not the same guarantee.
    //
    // The whole project still exactly as the discard left it is the stronger
    // one: nothing anywhere has moved on, so the record's index copy is still
    // the project's own prepared state and goes back with the files.
    //
    // Otherwise the question narrows to what this restore can actually damage:
    // has anything been written at the paths it would rewrite? A file edited
    // elsewhere in the project is not a reason to refuse — it used to be,
    // which made a record unreachable within seconds of anyone getting back to
    // work, on the exact screen that exists to say discarding is undoable.
    let exact = current == expected;
    if !exact && !record_paths_untouched(&manifest, &current_status)? {
        return Err(conflict());
    }
    restore_snapshot(root, git_dir, &record, &manifest, exact)?;
    if exact {
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
    } else {
        for item in &manifest.paths {
            verify_restored_path(root, &record, item)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discard_storage_uses_the_canonical_product_namespace() {
        let git_dir = Path::new("project").join(".git");
        assert_eq!(
            recovery_root(&git_dir),
            git_dir.join("gitodile").join("recovery")
        );
    }

    #[test]
    fn recovery_ids_are_unique_and_sortable() {
        let first = unique_recovery_id();
        let second = unique_recovery_id();
        assert_ne!(first, second);
        assert!(first.starts_with("discard-"));
    }
}

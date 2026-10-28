//! The durable snapshot of a paused operation, taken before its first change.
//!
//! ADR 0041 fixes the format: per worktree under
//! `<git-dir>/gitodile/conflicts/v1/<session-id>/`, a versioned manifest of
//! every unmerged stage plus each path's working content, published by a
//! rename, and a hidden ref in the common repository pinning the stage blobs
//! so `gc` cannot prune an original side after it is resolved. The first
//! snapshot of a session is the original and is never replaced. This slice
//! creates and verifies snapshots; restoring from one belongs to task 037-6.

use super::{now_ms, worktree_owner_id};
use crate::changes::validate_repo_relative_path;
use crate::conflicts::{
    is_object_id, read_session, working_fingerprint, ConflictOrigin, PausedOperationKind,
    WorkingKind,
};
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{run_git, run_git_with_input_capped};
use crate::repository_access::{self, AccessMode, RepositoryContext};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) const CONFLICT_SNAPSHOT_SCHEMA_VERSION: u32 = 1;
/// Working bytes one snapshot may copy; a path past it is `omitted`.
pub(crate) const MAX_CONFLICT_SNAPSHOT_BYTES: u64 = 512 * 1024 * 1024;
/// Ended sessions' snapshots kept per worktree, newest first.
const MAX_ENDED_SNAPSHOTS: usize = 10;
const ENDED_SNAPSHOT_RETENTION_MS: u128 = 30 * 24 * 60 * 60 * 1000;
/// A pending folder this old belongs to a creation that cannot still run.
const PENDING_ABANDONED_MS: u128 = 60 * 60 * 1000;
const PENDING_PREFIX: &str = ".pending-";

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotStageEntry {
    pub(crate) path: String,
    pub(crate) stage: u8,
    pub(crate) mode: String,
    pub(crate) object_id: String,
}

/// What the working tree held at a path. `Unreadable` and `Omitted` are
/// recorded evidence gaps, never silently dropped.
#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum SnapshotWorking {
    Absent,
    File {
        sequence: usize,
        executable: bool,
        sha256: String,
    },
    SymbolicLink {
        target: String,
    },
    Directory,
    Unreadable,
    Omitted,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotPath {
    pub(crate) path: String,
    pub(crate) working: SnapshotWorking,
    pub(crate) size: u64,
    pub(crate) modified_ns: u128,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictSnapshotManifest {
    pub(crate) schema_version: u32,
    pub(crate) session_id: String,
    pub(crate) origin: ConflictOrigin,
    pub(crate) operation: PausedOperationKind,
    pub(crate) head: Option<String>,
    pub(crate) operation_heads: Vec<String>,
    pub(crate) created_at_ms: u128,
    /// False when the unmerged listing hit its bound.
    pub(crate) listing_complete: bool,
    /// False when any evidence is missing: a bounded listing, a path that is
    /// not UTF-8, an unreadable or omitted working path, or no pin.
    pub(crate) complete: bool,
    pub(crate) pin_reference: Option<String>,
    pub(crate) entries: Vec<SnapshotStageEntry>,
    pub(crate) paths: Vec<SnapshotPath>,
}

fn failed(message: &str) -> AppError {
    AppError::new(AppErrorCode::RecoveryFailed, message)
        .with_remediation("Nothing was changed. Check disk space and permissions, then try again.")
}

fn stale() -> AppError {
    AppError::new(
        AppErrorCode::StaleConflictSession,
        "The overlapping changes changed while GitOdile was preserving them.",
    )
    .with_remediation("Review the overlapping files again, then retry.")
}

pub(crate) fn conflict_snapshot_root(git_dir: &Path) -> PathBuf {
    git_dir.join("gitodile").join("conflicts").join("v1")
}

/// Session IDs are GitOdile's own (`<operation>-<hex>`); anything else in the
/// folder is not a snapshot and is never read or removed.
fn valid_session_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn read_manifest(record: &Path) -> Option<ConflictSnapshotManifest> {
    let bytes = fs::read(record.join("manifest.json")).ok()?;
    let manifest: ConflictSnapshotManifest = serde_json::from_slice(&bytes).ok()?;
    (manifest.schema_version == CONFLICT_SNAPSHOT_SCHEMA_VERSION).then_some(manifest)
}

/// The published snapshot of `session_id`, if one exists and is readable.
pub(crate) fn read_conflict_snapshot(
    git_dir: &Path,
    session_id: &str,
) -> Option<ConflictSnapshotManifest> {
    if !valid_session_id(session_id) {
        return None;
    }
    read_manifest(&conflict_snapshot_root(git_dir).join(session_id))
        .filter(|manifest| manifest.session_id == session_id)
}

fn unique_pending_name() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    format!(
        "{PENDING_PREFIX}{}-{}-{}",
        now_ms(),
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

/// Refuses a path that leaves the project through a symbolic link before its
/// bytes are copied into the snapshot.
fn contained_target(root: &Path, relative: &str) -> Option<PathBuf> {
    validate_repo_relative_path(relative).ok()?;
    let root = root.canonicalize().ok()?;
    let target = root.join(relative);
    let mut parent = target.parent();
    while let Some(candidate) = parent {
        if candidate.exists() {
            return candidate
                .canonicalize()
                .ok()
                .filter(|canonical| canonical.starts_with(&root))
                .map(|_| target);
        }
        parent = candidate.parent();
    }
    None
}

fn copy_file(source: &Path, destination: &Path) -> std::io::Result<String> {
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        output.write_all(&buffer[..read])?;
    }
    output.sync_all()?;
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(unix)]
fn is_executable(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(_metadata: &fs::Metadata) -> bool {
    false
}

fn capture_working(
    root: &Path,
    record: &Path,
    relative: &str,
    sequence: usize,
    budget: &mut u64,
) -> SnapshotWorking {
    let Some(target) = contained_target(root, relative) else {
        return SnapshotWorking::Unreadable;
    };
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return SnapshotWorking::Absent
        }
        Err(_) => return SnapshotWorking::Unreadable,
    };
    if metadata.file_type().is_symlink() {
        return match fs::read_link(&target) {
            Ok(link) => match link.to_str() {
                Some(text) => SnapshotWorking::SymbolicLink {
                    target: text.replace('\\', "/"),
                },
                None => SnapshotWorking::Unreadable,
            },
            Err(_) => SnapshotWorking::Unreadable,
        };
    }
    if metadata.is_dir() {
        return SnapshotWorking::Directory;
    }
    if !metadata.is_file() {
        return SnapshotWorking::Unreadable;
    }
    if metadata.len() > *budget {
        return SnapshotWorking::Omitted;
    }
    match copy_file(&target, &record.join("files").join(sequence.to_string())) {
        Ok(sha256) => {
            *budget -= metadata.len();
            SnapshotWorking::File {
                sequence,
                executable: is_executable(&metadata),
                sha256,
            }
        }
        Err(_) => SnapshotWorking::Unreadable,
    }
}

fn pin_reference_name(repository: &RepositoryContext, session_id: &str) -> String {
    format!(
        "refs/gitodile/recovery/v1/conflict/{}/{session_id}",
        worktree_owner_id(repository)
    )
}

/// Pins every stage blob with a tree under a hidden ref. A tree needs no
/// identity and never appears in history; gitlinks are recorded but not
/// pinned, because their commits live in another repository.
fn pin_stage_objects(
    path: &str,
    repository: &RepositoryContext,
    session_id: &str,
    entries: &[SnapshotStageEntry],
) -> Option<String> {
    let mut blobs = entries
        .iter()
        .filter(|entry| entry.mode != "160000")
        .map(|entry| entry.object_id.as_str())
        .collect::<Vec<_>>();
    blobs.sort_unstable();
    blobs.dedup();
    if blobs.is_empty() {
        return None;
    }
    let mut input = Vec::new();
    for (index, object_id) in blobs.iter().enumerate() {
        input.extend_from_slice(format!("100644 blob {object_id}\ts{index:06}\0").as_bytes());
    }
    let output = run_git_with_input_capped(path, &["mktree", "-z"], &input, 1024).ok()?;
    let tree = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() || !is_object_id(&tree) {
        return None;
    }
    let reference = pin_reference_name(repository, session_id);
    run_git(path, &["update-ref", &reference, &tree])
        .ok()
        .filter(|result| result.status.success())
        .map(|_| reference)
}

fn write_manifest(record: &Path, manifest: &ConflictSnapshotManifest) -> Result<(), AppError> {
    let value = serde_json::to_vec_pretty(manifest)
        .map_err(|_| failed("GitOdile couldn't encode the overlap snapshot."))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(record.join("manifest.json"))
        .map_err(|_| failed("GitOdile couldn't create the overlap snapshot."))?;
    file.write_all(&value)
        .and_then(|_| file.sync_all())
        .map_err(|_| failed("GitOdile couldn't finish writing the overlap snapshot."))
}

fn pending_age_ms(name: &str, now: u128) -> Option<u128> {
    let created = name
        .strip_prefix(PENDING_PREFIX)?
        .split('-')
        .next()?
        .parse::<u128>()
        .ok()?;
    Some(now.saturating_sub(created))
}

/// Removes abandoned pending folders and the snapshots of ended sessions past
/// their retention, with their refs. The live session's snapshot is never
/// touched, and nothing that is not GitOdile's own is read or removed.
fn trim(path: &str, root: &Path, live_session: &str) {
    let Ok(children) = fs::read_dir(root) else {
        return;
    };
    let now = now_ms();
    let mut ended = Vec::new();
    for child in children.filter_map(Result::ok) {
        let name = child.file_name().to_string_lossy().to_string();
        if pending_age_ms(&name, now).is_some_and(|age| age > PENDING_ABANDONED_MS) {
            let _ = fs::remove_dir_all(child.path());
            continue;
        }
        if name == live_session || !valid_session_id(&name) {
            continue;
        }
        if let Some(manifest) = read_manifest(&child.path()) {
            ended.push((manifest.created_at_ms, child.path(), manifest.pin_reference));
        }
    }
    ended.sort_by_key(|item| std::cmp::Reverse(item.0));
    for (index, (created_at_ms, folder, pin)) in ended.into_iter().enumerate() {
        let expired = now.saturating_sub(created_at_ms) > ENDED_SNAPSHOT_RETENTION_MS;
        if index >= MAX_ENDED_SNAPSHOTS || expired {
            if let Some(reference) = pin {
                let _ = run_git(path, &["update-ref", "-d", &reference]);
            }
            let _ = fs::remove_dir_all(folder);
        }
    }
}

/// Creates the session's durable snapshot, or returns the one that already
/// exists: the first snapshot is the original and is never replaced.
///
/// The caller holds the repository write lock — this is the first step of a
/// mutation, never a read — and passes the state token its plan was made
/// with. The token is revalidated before and after capture, so what is
/// preserved is exactly what the plan described. Its first caller is the
/// resolution workflow of task 037-6.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn create_conflict_snapshot(
    path: &str,
    repository: &RepositoryContext,
    state_token: &str,
    origin: ConflictOrigin,
) -> Result<ConflictSnapshotManifest, AppError> {
    create_snapshot(
        path,
        repository,
        state_token,
        origin,
        MAX_CONFLICT_SNAPSHOT_BYTES,
    )
}

/// [`create_conflict_snapshot`] with a smaller byte budget, so tests can
/// prove that an omitted path is recorded without writing 512 MiB.
#[cfg(test)]
pub(crate) fn create_conflict_snapshot_within(
    path: &str,
    repository: &RepositoryContext,
    state_token: &str,
    budget: u64,
) -> Result<ConflictSnapshotManifest, AppError> {
    create_snapshot(
        path,
        repository,
        state_token,
        ConflictOrigin::External,
        budget,
    )
}

#[cfg_attr(not(test), allow(dead_code))]
fn create_snapshot(
    path: &str,
    repository: &RepositoryContext,
    state_token: &str,
    origin: ConflictOrigin,
    budget: u64,
) -> Result<ConflictSnapshotManifest, AppError> {
    if repository_access::held_mode(repository.common_git_dir.match_key())
        != Some(AccessMode::Write)
    {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdile tried to preserve overlapping changes without holding the project.",
        )
        .with_remediation("Restart GitOdile, and please report this if it happens again."));
    }
    let read = read_session(path, repository)?.ok_or_else(stale)?;
    if read.state_token != state_token {
        return Err(stale());
    }
    let git_dir = repository.git_dir.backend_path();
    if let Some(existing) = read.snapshot.clone() {
        return Ok(existing);
    }
    let root = conflict_snapshot_root(git_dir);
    fs::create_dir_all(&root)
        .map_err(|_| failed("GitOdile couldn't create the overlap snapshot folder."))?;
    trim(path, &root, &read.session_id);

    let pending = root.join(unique_pending_name());
    fs::create_dir_all(pending.join("files"))
        .map_err(|_| failed("GitOdile couldn't create the overlap snapshot folder."))?;
    let result = capture(path, repository, &read, &pending, origin, budget).and_then(|manifest| {
        let fresh = read_session(path, repository)?.ok_or_else(stale)?;
        if fresh.state_token != state_token {
            return Err(stale());
        }
        write_manifest(&pending, &manifest)?;
        Ok(manifest)
    });
    let manifest = match result {
        Ok(manifest) => manifest,
        Err(error) => {
            let _ = fs::remove_dir_all(&pending);
            // A pin with no published manifest would never be trimmed. Keep
            // it only if another process published this session meanwhile,
            // since the ref name is the same.
            let published = read_conflict_snapshot(git_dir, &read.session_id).is_some();
            if !published {
                let _ = run_git(
                    path,
                    &[
                        "update-ref",
                        "-d",
                        &pin_reference_name(repository, &read.session_id),
                    ],
                );
            }
            return Err(error);
        }
    };
    let final_path = root.join(&read.session_id);
    if fs::rename(&pending, &final_path).is_err() {
        let _ = fs::remove_dir_all(&pending);
        // Another GitOdile process published this session's snapshot first;
        // that one is the original.
        return read_conflict_snapshot(git_dir, &read.session_id)
            .ok_or_else(|| failed("GitOdile couldn't publish the overlap snapshot."));
    }
    Ok(manifest)
}

fn capture(
    path: &str,
    repository: &RepositoryContext,
    read: &crate::conflicts::SessionRead,
    record: &Path,
    origin: ConflictOrigin,
    mut budget: u64,
) -> Result<ConflictSnapshotManifest, AppError> {
    let root = repository.worktree_root.backend_path();
    let mut entries = Vec::new();
    let mut paths = Vec::new();
    let mut complete = read.listing.complete;
    for (sequence, unmerged) in read.listing.paths.iter().enumerate() {
        let Ok(relative) = std::str::from_utf8(&unmerged.path) else {
            complete = false;
            continue;
        };
        for (stage, value) in [
            (1, &unmerged.base),
            (2, &unmerged.current),
            (3, &unmerged.incoming),
        ] {
            if let Some(value) = value {
                entries.push(SnapshotStageEntry {
                    path: relative.to_string(),
                    stage,
                    mode: value.mode.clone(),
                    object_id: value.object_id.clone(),
                });
            }
        }
        let fingerprint = working_fingerprint(root, relative);
        let working = capture_working(root, record, relative, sequence, &mut budget);
        if matches!(
            working,
            SnapshotWorking::Unreadable | SnapshotWorking::Omitted
        ) {
            complete = false;
        }
        let (size, modified_ns) = if fingerprint.kind == WorkingKind::Absent {
            (0, 0)
        } else {
            (fingerprint.size, fingerprint.modified_ns)
        };
        paths.push(SnapshotPath {
            path: relative.to_string(),
            working,
            size,
            modified_ns,
        });
    }
    let pin_reference = pin_stage_objects(path, repository, &read.session_id, &entries);
    let needs_pin = entries.iter().any(|entry| entry.mode != "160000");
    if needs_pin && pin_reference.is_none() {
        complete = false;
    }
    Ok(ConflictSnapshotManifest {
        schema_version: CONFLICT_SNAPSHOT_SCHEMA_VERSION,
        session_id: read.session_id.clone(),
        origin,
        operation: read.operation.kind,
        head: read.head.clone(),
        operation_heads: read.operation.operation_heads.clone(),
        created_at_ms: now_ms(),
        listing_complete: read.listing.complete,
        complete,
        pin_reference,
        entries,
        paths,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_gitodile_session_ids_name_a_snapshot() {
        assert!(valid_session_id("merge-0123456789abcdef01234567"));
        for bad in ["", "../escape", "Merge-ABC", "merge/one", &"a".repeat(65)] {
            assert!(!valid_session_id(bad), "{bad}");
        }
    }

    #[test]
    fn pending_folders_age_from_their_own_name() {
        assert_eq!(pending_age_ms(".pending-1000-7-0", 5000), Some(4000));
        assert_eq!(pending_age_ms("merge-abc", 5000), None);
        assert_eq!(pending_age_ms(".pending-notanumber", 5000), None);
        assert_ne!(unique_pending_name(), unique_pending_name());
    }
}

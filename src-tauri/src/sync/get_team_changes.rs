//! Getting the remote's saved versions into this version line.
//!
//! One analysis serves three callers: the forecast every team-sync read carries
//! (what pressing Get would do), the plan the dialog shows, and the execution
//! that revalidates that plan. The analysis never changes files, the index or
//! refs. It reads status, compares every incoming path with local work, and
//! asks `git merge-tree` for the tree a combination would produce — for saved
//! versions on both sides, and for unsaved edits to a file that also changes
//! on the remote (ADR 0030).
//!
//! Execution then works in checked steps: build the merge version from the
//! predicted tree (hooks and signing included) before anything moves, keep a
//! recovery point (plus a snapshot of any unsaved content it combines), move
//! files and index with a two-tree `read-tree`, move the branch with a
//! compare-and-swap `update-ref`, write combined unsaved content back, and
//! verify. It never fetches: it applies exactly the remote commit the plan
//! showed.
//!
//! Everything below the entry points is private on purpose — the collision
//! rules, the combination of unsaved edits and the state-token evidence are only
//! meaningful together, and the read model in [`super`] reaches them only
//! through [`forecast_incoming`].

use super::{
    classify_sync, list_configured_remotes, read_team_sync_status_inner, relation_state,
    resolve_commit, resolve_upstream, ResolvedUpstream, SyncKnowledge, SyncRelation, SyncTarget,
    SyncWarning, TeamSyncState, TeamSyncStatus,
};
use crate::application;
use crate::changes::validate_repo_relative_path;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{checked_git_stdout, git_stdout, run_git, run_git_with_env};
use crate::index::{copy_project_index, prepare_tree_index};
use crate::operation::truncate_detail;
use crate::operation::OperationKind;
use crate::recovery::{
    create_history_recovery, plan_history_recovery, verify_history_recovery,
    HistoryRecoveryMetadata, HistoryRecoveryPreview, HistoryRecoveryRecord,
};
use crate::repository::{
    git_operation_in_progress, resolve_head_state, validate_branch_ref_name, HeadState,
};
use crate::status::{git_log_summaries, read_working_tree_status, SavedVersionSummary};
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const MAX_INCOMING_VERSIONS: usize = 25;
pub(crate) const MAX_INCOMING_FILES: usize = 100;
/// How many overlapping or combined paths cross IPC; the totals stay exact.
pub(crate) const MAX_FORECAST_PATHS: usize = 20;
const MAX_FORECAST_AUTHORS: usize = 3;
/// Authors are read from at most this many incoming versions.
const AUTHOR_SAMPLE: &str = "200";
/// Unpublished local versions a merge plan names; the count stays exact.
const MAX_LOCAL_VERSIONS: usize = 10;

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum GetTeamChangesPhase {
    CheckingLocalSafety,
    CombiningVersions,
    CreatingRecovery,
    UpdatingFilesAndHistory,
    Verifying,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum IncomingFileCategory {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IncomingFile {
    pub(crate) path: String,
    pub(crate) original_path: Option<String>,
    pub(crate) category: IncomingFileCategory,
    pub(crate) binary: bool,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IncomingFileCounts {
    pub(crate) added: usize,
    pub(crate) modified: usize,
    pub(crate) deleted: usize,
    pub(crate) renamed: usize,
    pub(crate) binary: usize,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IncomingFileImpact {
    pub(crate) total_count: usize,
    pub(crate) counts: IncomingFileCounts,
    pub(crate) files: Vec<IncomingFile>,
    pub(crate) is_truncated: bool,
}

/// How the version line reaches the remote commit: it simply advances, or
/// both sides have saved versions and a merge version joins them.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy, Hash)]
#[serde(rename_all = "camelCase")]
pub(crate) enum IntegrationKind {
    FastForward,
    Merge,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ForecastOutcome {
    /// Nothing local is in the way; Get can go ahead.
    Clear,
    /// Local work and incoming work change the same lines.
    Overlap,
    /// Something other than an overlap stops the update.
    Blocked,
}

/// Where the local side of an overlap lives.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum OverlapSide {
    Saved,
    Unsaved,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForecastOverlap {
    pub(crate) path: String,
    pub(crate) side: OverlapSide,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ForecastBlockerKind {
    /// An untracked or ignored local path would be overwritten.
    UntrackedCollision,
    /// A prepared (staged) change touches a file that also changes; its
    /// prepared state could not be kept apart from the incoming edit.
    PreparedOverlap,
    /// Git could not prove it can carry the unsaved changes across.
    CarryFailed,
    /// This Git cannot predict a combination (`merge-tree` is too old).
    GitTooOld,
    OperationInProgress,
    UnresolvedConflicts,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForecastBlocker {
    pub(crate) kind: ForecastBlockerKind,
    pub(crate) path: Option<String>,
}

/// What getting the remote's versions would do, predicted on this computer.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IncomingForecast {
    pub(crate) outcome: ForecastOutcome,
    pub(crate) integration: IntegrationKind,
    /// The remote commit this forecast is about.
    pub(crate) remote_commit: String,
    pub(crate) incoming_count: u32,
    pub(crate) local_count: u32,
    pub(crate) incoming_file_count: u32,
    pub(crate) authors: Vec<String>,
    pub(crate) author_count: u32,
    /// Unsaved tracked files the update leaves exactly as they are.
    pub(crate) carried_unsaved_count: u32,
    /// Unsaved files that also change on the remote, on other lines: their
    /// edits are combined with the incoming ones and stay unsaved.
    pub(crate) combined_unsaved: Vec<String>,
    pub(crate) combined_unsaved_count: u32,
    pub(crate) overlaps: Vec<ForecastOverlap>,
    pub(crate) overlap_count: u32,
    pub(crate) blocker: Option<ForecastBlocker>,
}

/// One incoming version as the plan lists it.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IncomingVersion {
    #[serde(flatten)]
    pub(crate) version: SavedVersionSummary,
    pub(crate) file_count: u32,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetTeamChangesPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) requires_confirmation: bool,
    pub(crate) project_id: String,
    pub(crate) session_epoch: String,
    pub(crate) state_token: String,
    pub(crate) branch: String,
    pub(crate) target: SyncTarget,
    pub(crate) tracking_ref: String,
    pub(crate) local_commit: String,
    pub(crate) remote_commit: String,
    pub(crate) integration: IntegrationKind,
    pub(crate) incoming_count: u32,
    pub(crate) incoming_versions: Vec<IncomingVersion>,
    pub(crate) versions_truncated: bool,
    pub(crate) local_count: u32,
    pub(crate) local_versions: Vec<SavedVersionSummary>,
    pub(crate) file_impact: IncomingFileImpact,
    pub(crate) forecast: IncomingForecast,
    /// The message the merge version will carry, before the project's hooks
    /// see it. `None` for a fast-forward.
    pub(crate) merge_message: Option<String>,
    pub(crate) recovery: HistoryRecoveryPreview,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum GetTeamChangesOutcome {
    Completed,
    Uncertain,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetTeamChangesResult {
    pub(crate) outcome: GetTeamChangesOutcome,
    pub(crate) project_id: String,
    pub(crate) session_epoch: String,
    pub(crate) branch: String,
    pub(crate) target: SyncTarget,
    pub(crate) tracking_ref: String,
    pub(crate) integration: IntegrationKind,
    pub(crate) previous_commit: String,
    pub(crate) resulting_commit: Option<String>,
    pub(crate) observed_head: Option<String>,
    pub(crate) received_count: u32,
    pub(crate) combined_unsaved_count: u32,
    pub(crate) recovery: HistoryRecoveryRecord,
    pub(crate) sync_status: Option<TeamSyncStatus>,
    pub(crate) warnings: Vec<SyncWarning>,
    pub(crate) inspection_instructions: Option<String>,
}

/// One prepared or unsaved tracked change, from `git status --porcelain=v2`.
#[derive(Debug, Clone)]
struct TrackedChange {
    path: String,
    original_path: Option<String>,
    /// The `X` and `Y` of the status record: `.` means unchanged.
    index_status: u8,
    worktree_status: u8,
    /// An ordinary (`1`) record, not a rename or copy.
    ordinary: bool,
    record: Vec<u8>,
}

impl TrackedChange {
    fn paths(&self) -> impl Iterator<Item = &str> {
        std::iter::once(self.path.as_str()).chain(self.original_path.as_deref())
    }
}

#[derive(Debug, Clone, Default)]
struct LocalSafetyState {
    raw: Vec<u8>,
    tracked: Vec<TrackedChange>,
    tracked_worktree_fingerprint: u64,
    untracked: Vec<String>,
    ignored: Vec<String>,
}

impl LocalSafetyState {
    /// The tracked records and content the update must leave exactly as they
    /// are: everything except the files it combines.
    fn carried(&self, combined: &HashSet<&str>) -> (Vec<Vec<u8>>, Vec<String>) {
        let mut records = Vec::new();
        let mut paths = Vec::new();
        for change in &self.tracked {
            if combined.contains(change.path.as_str()) {
                continue;
            }
            records.push(change.record.clone());
            paths.extend(change.paths().map(str::to_string));
        }
        (records, paths)
    }
}

/// Unsaved edits that also change on the remote, combined with the incoming
/// ones line by line.
#[derive(Debug, Clone)]
struct UnsavedCombination {
    paths: Vec<String>,
    /// `HEAD`'s tree with the unsaved content of `paths`.
    worktree_tree: String,
    /// The incoming tree with those unsaved edits applied on top.
    combined_tree: String,
}

/// What getting would do. Built without changing files, the index or refs.
#[derive(Debug)]
struct Analysis {
    kind: IntegrationKind,
    /// The tree the files move to; `None` when saved versions overlap.
    target_tree: Option<String>,
    incoming: Vec<IncomingFile>,
    safety: LocalSafetyState,
    combination: Option<UnsavedCombination>,
    overlaps: Vec<ForecastOverlap>,
    blocker: Option<ForecastBlocker>,
    authors: Vec<String>,
    author_count: u32,
}

impl Analysis {
    fn outcome(&self) -> ForecastOutcome {
        if self.blocker.is_some() {
            ForecastOutcome::Blocked
        } else if !self.overlaps.is_empty() {
            ForecastOutcome::Overlap
        } else {
            ForecastOutcome::Clear
        }
    }

    fn forecast(&self, remote_commit: &str, relation: &SyncRelation) -> IncomingForecast {
        let combined = self
            .combination
            .as_ref()
            .map(|value| value.paths.clone())
            .unwrap_or_default();
        let unique_tracked = self
            .safety
            .tracked
            .iter()
            .map(|change| change.path.as_str())
            .collect::<HashSet<_>>()
            .len();
        IncomingForecast {
            outcome: self.outcome(),
            integration: self.kind,
            remote_commit: remote_commit.to_string(),
            incoming_count: relation.behind,
            local_count: relation.ahead,
            incoming_file_count: self.incoming.len().min(u32::MAX as usize) as u32,
            authors: self.authors.clone(),
            author_count: self.author_count,
            carried_unsaved_count: unique_tracked.saturating_sub(combined.len()) as u32,
            combined_unsaved_count: combined.len() as u32,
            combined_unsaved: combined.into_iter().take(MAX_FORECAST_PATHS).collect(),
            overlap_count: self.overlaps.len().min(u32::MAX as usize) as u32,
            overlaps: self
                .overlaps
                .iter()
                .take(MAX_FORECAST_PATHS)
                .cloned()
                .collect(),
            blocker: self.blocker.clone(),
        }
    }
}

#[derive(Debug)]
struct ValidatedGetTeamChanges {
    branch: String,
    target: ResolvedUpstream,
    local_commit: String,
    remote_commit: String,
    relation: SyncRelation,
    analysis: Analysis,
    state_token: String,
}

impl ValidatedGetTeamChanges {
    fn sync_target(&self) -> SyncTarget {
        SyncTarget {
            remote: self.target.remote.clone(),
            destination_branch: self.target.destination_branch.clone(),
        }
    }
}

enum TreeMerge {
    Clean(String),
    Conflicts(Vec<String>),
    /// This Git does not have `merge-tree --write-tree` (or `--merge-base`).
    Unsupported,
}

fn checked_dynamic_output(path: &str, args: Vec<String>) -> Result<Vec<u8>, AppError> {
    let output = run_git_with_env(path, &args, &[])?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect the incoming project changes safely.",
        )
        .with_detail(truncate_detail(&String::from_utf8_lossy(&output.stderr))))
    }
}

fn tracked_worktree_fingerprint(root: &Path, tracked: &[&str]) -> Result<u64, AppError> {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut seen = HashSet::new();
    for relative in tracked {
        if !seen.insert(*relative) {
            continue;
        }
        validate_repo_relative_path(relative)?;
        relative.hash(&mut hasher);
        let full_path = root.join(relative);
        match std::fs::symlink_metadata(&full_path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                "symlink".hash(&mut hasher);
                std::fs::read_link(&full_path)
                    .map_err(|_| {
                        AppError::new(
                            AppErrorCode::GitCommandFailed,
                            "GitOdile couldn't read a changed symbolic link safely.",
                        )
                    })?
                    .hash(&mut hasher);
            }
            Ok(metadata) if metadata.is_file() => {
                "file".hash(&mut hasher);
                metadata.len().hash(&mut hasher);
                let mut file = std::fs::File::open(&full_path).map_err(|_| {
                    AppError::new(
                        AppErrorCode::GitCommandFailed,
                        "GitOdile couldn't read a changed file safely.",
                    )
                })?;
                let mut buffer = [0_u8; 64 * 1024];
                loop {
                    let read = file.read(&mut buffer).map_err(|_| {
                        AppError::new(
                            AppErrorCode::GitCommandFailed,
                            "GitOdile couldn't finish reading a changed file safely.",
                        )
                    })?;
                    if read == 0 {
                        break;
                    }
                    hasher.write(&buffer[..read]);
                }
            }
            Ok(_) => {
                return Err(AppError::new(
                    AppErrorCode::IncomingTrackedChangeCollision,
                    "A changed tracked path is not a regular file or symbolic link.",
                )
                .with_remediation(
                    "Save or move that path outside GitOdile, then review the update again.",
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                "absent".hash(&mut hasher);
            }
            Err(_) => {
                return Err(AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "GitOdile couldn't inspect a changed path safely.",
                ));
            }
        }
    }
    Ok(hasher.finish())
}

fn path_encoding_error() -> AppError {
    AppError::new(
        AppErrorCode::PathEncodingUnsupported,
        "This project contains a path GitOdile can't compare safely.",
    )
}

fn incomplete_status_error() -> AppError {
    AppError::new(
        AppErrorCode::GitCommandFailed,
        "Git returned an incomplete local-change record.",
    )
}

fn read_local_safety(path: &str) -> Result<LocalSafetyState, AppError> {
    let args = vec![
        "status".to_string(),
        "--porcelain=v2".to_string(),
        "--untracked-files=all".to_string(),
        "--ignored=matching".to_string(),
        "--renames".to_string(),
        "-z".to_string(),
    ];
    let raw = checked_dynamic_output(path, args)?;
    let fields = raw
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    let mut tracked = Vec::new();
    let mut untracked = Vec::new();
    let mut ignored = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let field = std::str::from_utf8(fields[index]).map_err(|_| path_encoding_error())?;
        if let Some(path) = field.strip_prefix("? ") {
            untracked.push(path.to_string());
        } else if let Some(path) = field.strip_prefix("! ") {
            ignored.push(path.trim_end_matches('/').to_string());
        } else if field.starts_with("1 ") || field.starts_with("2 ") {
            let ordinary = field.starts_with("1 ");
            let xy = field
                .as_bytes()
                .get(2..4)
                .ok_or_else(incomplete_status_error)?;
            let (index_status, worktree_status) = (xy[0], xy[1]);
            let changed_path = if ordinary {
                field.splitn(9, ' ').nth(8)
            } else {
                field.splitn(10, ' ').nth(9)
            }
            .ok_or_else(incomplete_status_error)?;
            let mut record = fields[index].to_vec();
            let original_path = if ordinary {
                None
            } else {
                let original = fields.get(index + 1).ok_or_else(|| {
                    AppError::new(
                        AppErrorCode::GitCommandFailed,
                        "Git returned a local rename without its original path.",
                    )
                })?;
                record.push(0);
                record.extend_from_slice(original);
                index += 1;
                Some(
                    std::str::from_utf8(original)
                        .map_err(|_| path_encoding_error())?
                        .to_string(),
                )
            };
            tracked.push(TrackedChange {
                path: changed_path.to_string(),
                original_path,
                index_status,
                worktree_status,
                ordinary,
                record,
            });
        } else if field.starts_with("u ") {
            return Err(AppError::new(
                AppErrorCode::UnresolvedConflicts,
                "This project contains unresolved overlapping changes.",
            )
            .with_remediation(
                "Resolve or abort the current Git operation before getting project changes.",
            ));
        }
        index += 1;
    }
    let paths = tracked
        .iter()
        .flat_map(TrackedChange::paths)
        .collect::<Vec<_>>();
    let tracked_worktree_fingerprint = tracked_worktree_fingerprint(Path::new(path), &paths)?;
    Ok(LocalSafetyState {
        raw,
        tracked,
        tracked_worktree_fingerprint,
        untracked,
        ignored,
    })
}

fn parse_binary_paths(output: &[u8]) -> Result<HashSet<String>, AppError> {
    let fields = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    let mut binary = HashSet::new();
    let mut index = 0;
    while index < fields.len() {
        let field = std::str::from_utf8(fields[index]).map_err(|_| {
            AppError::new(
                AppErrorCode::PathEncodingUnsupported,
                "An incoming file path can't be represented safely.",
            )
        })?;
        if let Some(path) = field.strip_prefix("-\t-\t") {
            if path.is_empty() {
                let target = fields.get(index + 2).ok_or_else(|| {
                    AppError::new(
                        AppErrorCode::GitCommandFailed,
                        "Git returned an incomplete renamed-file summary.",
                    )
                })?;
                binary.insert(
                    std::str::from_utf8(target)
                        .map_err(|_| {
                            AppError::new(
                                AppErrorCode::PathEncodingUnsupported,
                                "An incoming renamed path can't be represented safely.",
                            )
                        })?
                        .to_string(),
                );
                index += 2;
            } else {
                binary.insert(path.to_string());
            }
        }
        index += 1;
    }
    Ok(binary)
}

fn diff_args(kind: &str, revisions: &[&str]) -> Vec<String> {
    let mut args = vec![
        "diff".to_string(),
        kind.to_string(),
        "-z".to_string(),
        "--find-renames".to_string(),
    ];
    args.extend(revisions.iter().map(|value| value.to_string()));
    args.push("--".to_string());
    args
}

/// Every path the update changes, uncapped: collisions are decided against all
/// of them, and only what crosses IPC is capped later.
fn incoming_files(path: &str, revisions: &[&str]) -> Result<Vec<IncomingFile>, AppError> {
    let name_status = checked_dynamic_output(path, diff_args("--name-status", revisions))?;
    let fields = name_status
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    let utf8 = |value: &[u8]| -> Result<String, AppError> {
        std::str::from_utf8(value).map(str::to_string).map_err(|_| {
            AppError::new(
                AppErrorCode::PathEncodingUnsupported,
                "An incoming file path can't be represented safely.",
            )
        })
    };
    let mut all = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let status_code = fields[index].first().copied().unwrap_or_default();
        let (original_path, path_index, consumed, category) = match status_code {
            b'R' | b'C' => {
                let original = fields.get(index + 1).ok_or_else(|| {
                    AppError::new(
                        AppErrorCode::GitCommandFailed,
                        "Git returned an incomplete rename.",
                    )
                })?;
                (
                    Some(utf8(original)?),
                    index + 2,
                    3,
                    IncomingFileCategory::Renamed,
                )
            }
            b'A' => (None, index + 1, 2, IncomingFileCategory::Added),
            b'D' => (None, index + 1, 2, IncomingFileCategory::Deleted),
            _ => (None, index + 1, 2, IncomingFileCategory::Modified),
        };
        let value = fields.get(path_index).ok_or_else(|| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git returned an incomplete file summary.",
            )
        })?;
        all.push(IncomingFile {
            path: utf8(value)?,
            original_path,
            category,
            binary: false,
        });
        index += consumed;
    }
    Ok(all)
}

fn file_impact(
    path: &str,
    revisions: &[&str],
    incoming: &[IncomingFile],
) -> Result<IncomingFileImpact, AppError> {
    let binary_paths = parse_binary_paths(&checked_dynamic_output(
        path,
        diff_args("--numstat", revisions),
    )?)?;
    let mut counts = IncomingFileCounts::default();
    let mut files = Vec::new();
    for file in incoming {
        let binary = binary_paths.contains(&file.path);
        match file.category {
            IncomingFileCategory::Added => counts.added += 1,
            IncomingFileCategory::Modified => counts.modified += 1,
            IncomingFileCategory::Deleted => counts.deleted += 1,
            IncomingFileCategory::Renamed => counts.renamed += 1,
        }
        if binary {
            counts.binary += 1;
        }
        if files.len() < MAX_INCOMING_FILES {
            files.push(IncomingFile {
                binary,
                ..file.clone()
            });
        }
    }
    Ok(IncomingFileImpact {
        total_count: incoming.len(),
        counts,
        is_truncated: incoming.len() > files.len(),
        files,
    })
}

fn paths_overlap(left: &str, right: &str) -> bool {
    let left = left.trim_end_matches('/');
    let right = right.trim_end_matches('/');
    left == right
        || left
            .strip_prefix(right)
            .is_some_and(|suffix| suffix.starts_with('/'))
        || right
            .strip_prefix(left)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

/// `git merge-tree --write-tree` in memory: no file, index or ref changes. It
/// writes the result's objects, which nothing references until a commit does
/// and `git gc` removes otherwise.
fn merge_trees(
    path: &str,
    merge_base: Option<&str>,
    ours: &str,
    theirs: &str,
) -> Result<TreeMerge, AppError> {
    let mut args = vec![
        "merge-tree".to_string(),
        "--write-tree".to_string(),
        "--name-only".to_string(),
        "--no-messages".to_string(),
        "-z".to_string(),
    ];
    if let Some(base) = merge_base {
        args.push(format!("--merge-base={base}"));
    }
    args.push(ours.to_string());
    args.push(theirs.to_string());
    let output = run_git_with_env(path, &args, &[])?;
    let mut fields = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    match output.status.code() {
        Some(0) => {
            let tree = fields
                .next()
                .and_then(|value| std::str::from_utf8(value).ok())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    AppError::new(
                        AppErrorCode::GitCommandFailed,
                        "Git didn't return the combined result.",
                    )
                })?;
            Ok(TreeMerge::Clean(tree))
        }
        Some(1) => {
            let _tree = fields.next();
            let mut seen = HashSet::new();
            let mut paths = Vec::new();
            for field in fields {
                let value = std::str::from_utf8(field).map_err(|_| path_encoding_error())?;
                if seen.insert(value.to_string()) {
                    paths.push(value.to_string());
                }
            }
            Ok(TreeMerge::Conflicts(paths))
        }
        // A usage error: this Git predates the form used here.
        Some(129) => Ok(TreeMerge::Unsupported),
        _ => Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't work out how the two sides combine.",
        )
        .with_detail(truncate_detail(&String::from_utf8_lossy(&output.stderr)))),
    }
}

fn incoming_authors(
    path: &str,
    local_commit: &str,
    remote_commit: &str,
) -> Result<(Vec<String>, u32), AppError> {
    let range = format!("{local_commit}..{remote_commit}");
    let text = checked_git_stdout(run_git(
        path,
        &["log", "-n", AUTHOR_SAMPLE, "--format=%an", &range],
    )?)?;
    let mut seen = HashSet::new();
    let mut authors = Vec::new();
    for name in text.lines().map(str::trim).filter(|name| !name.is_empty()) {
        if seen.insert(name.to_string()) {
            authors.push(name.to_string());
        }
    }
    let count = authors.len().min(u32::MAX as usize) as u32;
    authors.truncate(MAX_FORECAST_AUTHORS);
    Ok((authors, count))
}

fn is_regular_file(root: &Path, relative: &str) -> bool {
    std::fs::symlink_metadata(root.join(relative))
        .map(|metadata| metadata.file_type().is_file())
        .unwrap_or(false)
}

/// Asks Git whether the two-tree update can carry the unsaved changes. The
/// dry run would take `index.lock`, and the plan runs beside other reads, so
/// it runs against a copy of the index and can't collide with a status
/// refresh. It still costs a copy and a process, so only the plan and the
/// execution ask; the forecast in every status read relies on the path
/// comparison alone.
fn can_carry(path: &str, local_commit: &str, target: &str) -> Result<bool, AppError> {
    let index = copy_project_index(path)?;
    let index_value = index.path.to_string_lossy().to_string();
    let output = run_git_with_env(
        path,
        ["read-tree", "--dry-run", "-u", "-m", local_commit, target],
        &[("GIT_INDEX_FILE", index_value.as_str())],
    )?;
    Ok(output.status.success())
}

fn analyze(
    path: &str,
    local_commit: &str,
    remote_commit: &str,
    relation: &SyncRelation,
    strict: bool,
) -> Result<Analysis, AppError> {
    let kind = if relation.ahead == 0 {
        IntegrationKind::FastForward
    } else {
        IntegrationKind::Merge
    };
    let (authors, author_count) = incoming_authors(path, local_commit, remote_commit)?;
    let mut analysis = Analysis {
        kind,
        target_tree: None,
        incoming: Vec::new(),
        safety: LocalSafetyState::default(),
        combination: None,
        overlaps: Vec::new(),
        blocker: None,
        authors,
        author_count,
    };

    analysis.target_tree = match kind {
        IntegrationKind::FastForward => Some(checked_git_stdout(run_git(
            path,
            &[
                "rev-parse",
                "--verify",
                &format!("{remote_commit}^{{tree}}"),
            ],
        )?)?),
        IntegrationKind::Merge => match merge_trees(path, None, local_commit, remote_commit)? {
            TreeMerge::Clean(tree) => Some(tree),
            TreeMerge::Conflicts(paths) => {
                analysis
                    .overlaps
                    .extend(paths.into_iter().map(|path| ForecastOverlap {
                        path,
                        side: OverlapSide::Saved,
                    }));
                None
            }
            TreeMerge::Unsupported => {
                analysis.blocker = Some(ForecastBlocker {
                    kind: ForecastBlockerKind::GitTooOld,
                    path: None,
                });
                None
            }
        },
    };
    // What changes in the files: towards the target tree when there is one,
    // otherwise what the remote changed since the two sides parted.
    analysis.incoming = match &analysis.target_tree {
        Some(tree) => incoming_files(path, &[local_commit, tree.as_str()])?,
        None => incoming_files(
            path,
            &[format!("{local_commit}...{remote_commit}").as_str()],
        )?,
    };

    analysis.safety = match read_local_safety(path) {
        Ok(safety) => safety,
        Err(error) if error.code == AppErrorCode::UnresolvedConflicts => {
            analysis.blocker = Some(ForecastBlocker {
                kind: ForecastBlockerKind::UnresolvedConflicts,
                path: None,
            });
            return Ok(analysis);
        }
        Err(error) => return Err(error),
    };
    let Some(target_tree) = analysis.target_tree.clone() else {
        return Ok(analysis);
    };
    if analysis.blocker.is_some() {
        return Ok(analysis);
    }

    let incoming_paths = analysis
        .incoming
        .iter()
        .flat_map(|file| std::iter::once(file.path.as_str()).chain(file.original_path.as_deref()))
        .collect::<Vec<_>>();
    let touches = |candidate: &str| {
        incoming_paths
            .iter()
            .any(|path| paths_overlap(candidate, path))
    };

    if let Some(collision) = analysis
        .safety
        .untracked
        .iter()
        .chain(&analysis.safety.ignored)
        .find(|candidate| touches(candidate.as_str()))
    {
        analysis.blocker = Some(ForecastBlocker {
            kind: ForecastBlockerKind::UntrackedCollision,
            path: Some(collision.clone()),
        });
        return Ok(analysis);
    }

    let root = Path::new(path);
    let mut combine = Vec::new();
    for change in &analysis.safety.tracked {
        if !change.paths().any(&touches) {
            continue;
        }
        if change.index_status != b'.' {
            analysis.blocker = Some(ForecastBlocker {
                kind: ForecastBlockerKind::PreparedOverlap,
                path: Some(change.path.clone()),
            });
            return Ok(analysis);
        }
        // Only a plain edit of a regular file the remote also edits in place
        // can be combined line by line. Anything else — a local deletion, an
        // incoming rename or deletion, a folder over a file — overlaps.
        let edited_in_place = analysis.incoming.iter().any(|file| {
            file.path == change.path
                && file.original_path.is_none()
                && file.category == IncomingFileCategory::Modified
        });
        if change.ordinary
            && change.worktree_status == b'M'
            && edited_in_place
            && is_regular_file(root, &change.path)
        {
            combine.push(change.path.clone());
        } else {
            analysis.overlaps.push(ForecastOverlap {
                path: change.path.clone(),
                side: OverlapSide::Unsaved,
            });
        }
    }
    if !analysis.overlaps.is_empty() {
        return Ok(analysis);
    }

    if combine.is_empty() {
        if strict
            && !analysis.safety.tracked.is_empty()
            && !can_carry(path, local_commit, &target_tree)?
        {
            analysis.blocker = Some(ForecastBlocker {
                kind: ForecastBlockerKind::CarryFailed,
                path: None,
            });
        }
        return Ok(analysis);
    }

    let worktree = prepare_tree_index(path, local_commit, &combine)?;
    match merge_trees(path, Some(local_commit), &worktree.tree, &target_tree)? {
        TreeMerge::Clean(combined_tree) => {
            analysis.combination = Some(UnsavedCombination {
                paths: combine,
                worktree_tree: worktree.tree.clone(),
                combined_tree,
            });
        }
        TreeMerge::Conflicts(paths) => {
            analysis
                .overlaps
                .extend(paths.into_iter().map(|path| ForecastOverlap {
                    path,
                    side: OverlapSide::Unsaved,
                }));
        }
        TreeMerge::Unsupported => {
            analysis.blocker = Some(ForecastBlocker {
                kind: ForecastBlockerKind::GitTooOld,
                path: None,
            });
        }
    }
    Ok(analysis)
}

/// The forecast a team-sync read carries for a line with versions waiting on
/// its remote. `None` when nothing is waiting, or when the forecast itself
/// couldn't be computed: the card then falls back to offering a review.
pub(crate) fn forecast_incoming(
    path: &str,
    local_commit: &str,
    remote_commit: &str,
    relation: &SyncRelation,
) -> Option<IncomingForecast> {
    if relation.behind == 0 {
        return None;
    }
    let in_progress = git_operation_in_progress(path).ok()?;
    if in_progress.is_some() {
        let mut analysis = Analysis {
            kind: if relation.ahead == 0 {
                IntegrationKind::FastForward
            } else {
                IntegrationKind::Merge
            },
            target_tree: None,
            incoming: Vec::new(),
            safety: LocalSafetyState::default(),
            combination: None,
            overlaps: Vec::new(),
            blocker: None,
            authors: Vec::new(),
            author_count: 0,
        };
        analysis.blocker = Some(ForecastBlocker {
            kind: ForecastBlockerKind::OperationInProgress,
            path: None,
        });
        return Some(analysis.forecast(remote_commit, relation));
    }
    analyze(path, local_commit, remote_commit, relation, false)
        .ok()
        .map(|analysis| analysis.forecast(remote_commit, relation))
}

struct GetTeamChangesTokenEvidence<'a> {
    repository_identity: &'a str,
    session_epoch: &'a str,
    branch: &'a str,
    local_commit: &'a str,
    target: &'a ResolvedUpstream,
    remote_commit: &'a str,
    recovery_reference: &'a str,
    analysis: &'a Analysis,
}

fn compute_get_team_changes_state_token(evidence: GetTeamChangesTokenEvidence<'_>) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    evidence.repository_identity.hash(&mut hasher);
    evidence.session_epoch.hash(&mut hasher);
    evidence.branch.hash(&mut hasher);
    evidence.local_commit.hash(&mut hasher);
    evidence.target.remote.hash(&mut hasher);
    evidence.target.destination_branch.hash(&mut hasher);
    evidence.target.tracking_ref.hash(&mut hasher);
    evidence.remote_commit.hash(&mut hasher);
    evidence.recovery_reference.hash(&mut hasher);
    evidence.analysis.kind.hash(&mut hasher);
    evidence.analysis.target_tree.hash(&mut hasher);
    evidence.analysis.safety.raw.hash(&mut hasher);
    evidence
        .analysis
        .safety
        .tracked_worktree_fingerprint
        .hash(&mut hasher);
    if let Some(combination) = &evidence.analysis.combination {
        combination.paths.hash(&mut hasher);
        combination.worktree_tree.hash(&mut hasher);
        combination.combined_tree.hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

fn get_relation_blocker(state: TeamSyncState) -> AppError {
    match state {
        TeamSyncState::UpToDate => AppError::new(
            AppErrorCode::NothingToGet,
            "This project already includes the latest version on its remote.",
        ),
        TeamSyncState::Ahead => AppError::new(
            AppErrorCode::NothingToGet,
            "This version line is no longer behind its remote.",
        )
        .with_remediation("Check the remote again before choosing another action."),
        _ => AppError::new(
            AppErrorCode::NothingToGet,
            "There are no new versions on the remote to get.",
        ),
    }
}

fn validate_get_team_changes(
    path: &str,
    session_epoch: &str,
    repository_identity: &str,
    recovery_reference: &str,
) -> Result<ValidatedGetTeamChanges, AppError> {
    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation before getting project changes."));
    }
    let working = read_working_tree_status(path.to_string())?;
    let branch = working.upstream.branch.clone();
    let (head_state, local_commit) = resolve_head_state(path, branch.clone())?;
    if head_state == HeadState::Detached {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a version line right now.",
        )
        .with_remediation("Switch to a version line before getting project changes."));
    }
    if head_state == HeadState::Unborn {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "There is no saved local version to advance.",
        ));
    }
    let branch = branch.expect("a born named head has a branch");
    let local_commit = local_commit.expect("a born head has a commit");
    validate_branch_ref_name(path, &branch)?;
    let remotes = list_configured_remotes(path)?;
    if remotes.is_empty() {
        return Err(AppError::new(
            AppErrorCode::NoRemoteConfigured,
            "This project has no configured remote project.",
        ));
    }
    let target = resolve_upstream(path, &branch, &remotes)?.ok_or_else(|| {
        AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "This version line has no configured upstream destination.",
        )
    })?;
    // The remote as of the last check. Nothing here contacts the network:
    // the plan shows, and the execution applies, exactly this commit.
    let remote_commit = resolve_commit(path, &target.tracking_ref)?.ok_or_else(|| {
        AppError::new(
            AppErrorCode::RemoteRefMissing,
            "The remote hasn't been checked on this computer yet.",
        )
        .with_remediation("Check the remote, then get its changes.")
    })?;
    let relation = classify_sync(path, &local_commit, Some(&remote_commit))?;
    if relation.behind == 0 {
        return Err(get_relation_blocker(relation_state(&relation)));
    }
    let analysis = analyze(path, &local_commit, &remote_commit, &relation, true)?;
    let state_token = compute_get_team_changes_state_token(GetTeamChangesTokenEvidence {
        repository_identity,
        session_epoch,
        branch: &branch,
        local_commit: &local_commit,
        target: &target,
        remote_commit: &remote_commit,
        recovery_reference,
        analysis: &analysis,
    });
    Ok(ValidatedGetTeamChanges {
        branch,
        target,
        local_commit,
        remote_commit,
        relation,
        analysis,
        state_token,
    })
}

fn merge_message(target: &ResolvedUpstream, branch: &str) -> String {
    let source = format!("{}/{}", target.remote, target.destination_branch);
    // Git's own wording, so history reads the same as a merge made anywhere
    // else; it names the destination only when it isn't the same line.
    if branch == target.destination_branch {
        format!("Merge remote-tracking branch '{source}'")
    } else {
        format!("Merge remote-tracking branch '{source}' into {branch}")
    }
}

fn incoming_versions(
    path: &str,
    local_commit: &str,
    remote_commit: &str,
) -> Result<Vec<IncomingVersion>, AppError> {
    let range = format!("{local_commit}..{remote_commit}");
    let mut summaries = git_log_summaries(path, &[&range])?;
    summaries.truncate(MAX_INCOMING_VERSIONS);
    let cap = MAX_INCOMING_VERSIONS.to_string();
    let stats = checked_git_stdout(run_git(
        path,
        &["log", "-n", &cap, "--format=%x1e%H", "--shortstat", &range],
    )?)?;
    let mut file_counts = HashMap::new();
    for entry in stats
        .split('\u{1e}')
        .filter(|entry| !entry.trim().is_empty())
    {
        let mut lines = entry.lines();
        let Some(commit) = lines.next().map(str::trim) else {
            continue;
        };
        let count = lines
            .find_map(|line| line.split_whitespace().next()?.parse::<u32>().ok())
            .unwrap_or(0);
        file_counts.insert(commit.to_string(), count);
    }
    Ok(summaries
        .into_iter()
        .map(|version| IncomingVersion {
            file_count: file_counts.get(&version.commit).copied().unwrap_or(0),
            version,
        })
        .collect())
}

pub(crate) fn plan_get_team_changes(
    path: String,
    session_epoch: String,
) -> Result<GetTeamChangesPlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_get_team_changes", None)?;
    let recovery = plan_history_recovery(&repository);
    let identity = repository.common_git_dir.match_key().to_string();
    let validated =
        validate_get_team_changes(&path, &session_epoch, &identity, &recovery.reference)?;
    let revisions = match &validated.analysis.target_tree {
        Some(tree) => vec![validated.local_commit.clone(), tree.clone()],
        None => vec![format!(
            "{}...{}",
            validated.local_commit, validated.remote_commit
        )],
    };
    let revisions = revisions.iter().map(String::as_str).collect::<Vec<_>>();
    let file_impact = file_impact(&path, &revisions, &validated.analysis.incoming)?;
    let incoming_versions =
        incoming_versions(&path, &validated.local_commit, &validated.remote_commit)?;
    let mut local_versions = if validated.relation.ahead > 0 {
        git_log_summaries(
            &path,
            &[&format!(
                "{}..{}",
                validated.remote_commit, validated.local_commit
            )],
        )?
    } else {
        Vec::new()
    };
    local_versions.truncate(MAX_LOCAL_VERSIONS);
    let forecast = validated
        .analysis
        .forecast(&validated.remote_commit, &validated.relation);
    Ok(GetTeamChangesPlan {
        operation_kind: OperationKind::HistoryMutation,
        requires_confirmation: true,
        project_id: repository
            .worktree_root
            .backend_path()
            .to_string_lossy()
            .to_string(),
        session_epoch,
        state_token: validated.state_token.clone(),
        target: validated.sync_target(),
        tracking_ref: validated.target.tracking_ref.clone(),
        integration: validated.analysis.kind,
        incoming_count: validated.relation.behind,
        versions_truncated: validated.relation.behind as usize > incoming_versions.len(),
        incoming_versions,
        local_count: validated.relation.ahead,
        local_versions,
        file_impact,
        forecast,
        merge_message: (validated.analysis.kind == IntegrationKind::Merge)
            .then(|| merge_message(&validated.target, &validated.branch)),
        recovery,
        branch: validated.branch,
        local_commit: validated.local_commit,
        remote_commit: validated.remote_commit,
    })
}

fn observed_head(path: &str) -> Option<String> {
    run_git(path, &["rev-parse", "--verify", "HEAD"])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| git_stdout(&output))
}

fn uncertain_get_result(
    project_id: String,
    session_epoch: String,
    validated: &ValidatedGetTeamChanges,
    recovery: HistoryRecoveryRecord,
    warning: String,
) -> GetTeamChangesResult {
    let observed = observed_head(&project_id);
    GetTeamChangesResult {
        outcome: GetTeamChangesOutcome::Uncertain,
        project_id,
        session_epoch,
        branch: validated.branch.clone(),
        target: validated.sync_target(),
        tracking_ref: validated.target.tracking_ref.clone(),
        integration: validated.analysis.kind,
        previous_commit: validated.local_commit.clone(),
        resulting_commit: None,
        observed_head: observed,
        received_count: validated.relation.behind,
        combined_unsaved_count: validated
            .analysis
            .combination
            .as_ref()
            .map(|value| value.paths.len() as u32)
            .unwrap_or(0),
        recovery,
        sync_status: None,
        warnings: vec![SyncWarning {
            code: "localUpdateUncertain".to_string(),
            message: warning,
        }],
        inspection_instructions: Some(
            "Keep the project open, inspect its current files and HEAD, and keep the reported recovery reference. Do not retry until the observed state is understood."
                .to_string(),
        ),
    }
}

/// A file outside the project for text Git reads from a path: the merge
/// message the hooks may edit. Removed when dropped.
struct TemporaryFile(PathBuf);

impl TemporaryFile {
    fn new(prefix: &str, contents: &str) -> Result<Self, AppError> {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        let mut path = std::env::temp_dir();
        path.push(format!(
            "gitodile-{prefix}-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::write(&path, contents).map_err(|_| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "GitOdile couldn't prepare the merge version's message.",
            )
        })?;
        Ok(Self(path))
    }

    fn arg(&self) -> String {
        self.0.to_string_lossy().to_string()
    }
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Trailing whitespace and blank edges go, as Git's `whitespace` cleanup does
/// for a merge message nobody edits; comment lines a hook added stay text.
fn clean_message(message: &str) -> String {
    let lines = message.lines().map(str::trim_end).collect::<Vec<_>>();
    let start = lines.iter().position(|line| !line.is_empty());
    let end = lines.iter().rposition(|line| !line.is_empty());
    match (start, end) {
        (Some(start), Some(end)) => {
            let mut cleaned = Vec::new();
            let mut blank = false;
            for line in &lines[start..=end] {
                if line.is_empty() {
                    if !blank {
                        cleaned.push("");
                    }
                    blank = true;
                } else {
                    cleaned.push(line);
                    blank = false;
                }
            }
            format!("{}\n", cleaned.join("\n"))
        }
        _ => String::new(),
    }
}

fn commit_signing_enabled(path: &str) -> Result<bool, AppError> {
    let output = run_git(path, &["config", "--bool", "--get", "commit.gpgSign"])?;
    Ok(output.status.success() && git_stdout(&output) == "true")
}

fn classify_merge_version_failure(stderr: &str) -> AppError {
    let lowered = stderr.to_lowercase();
    if lowered.contains("please tell me who you are")
        || lowered.contains("empty ident")
        || lowered.contains("unable to auto-detect email")
    {
        return AppError::new(
            AppErrorCode::MissingIdentity,
            "Git doesn't know who you are, so it can't record the merge version.",
        )
        .with_remediation("Set your name and email in Settings, then try again.")
        .with_detail(truncate_detail(stderr));
    }
    if lowered.contains("gpg failed to sign")
        || lowered.contains("unable to sign")
        || (lowered.contains("sign") && lowered.contains("fail"))
    {
        return AppError::new(
            AppErrorCode::SigningFailed,
            "Git couldn't sign the merge version.",
        )
        .with_remediation("Check your Git commit-signing setup (GPG or SSH key), then try again.")
        .with_detail(truncate_detail(stderr));
    }
    AppError::new(
        AppErrorCode::GitCommandFailed,
        "Git couldn't record the merge version.",
    )
    .with_remediation("Check the project's Git configuration and try again.")
    .with_detail(truncate_detail(stderr))
}

/// Builds the merge version from the predicted tree before anything in the
/// project moves. The hooks Git runs for a merge commit run here, against a
/// temporary index holding the merge result, unless the user turned hooks off
/// in Settings; a rejection leaves the project untouched.
fn create_merge_version(
    path: &str,
    tree: &str,
    local_commit: &str,
    remote_commit: &str,
    message: &str,
    run_hooks: bool,
) -> Result<String, AppError> {
    let message_file = TemporaryFile::new("merge-message", &format!("{message}\n"))?;
    if run_hooks {
        let index = prepare_tree_index(path, tree, &[])?;
        let index_value = index.path.to_string_lossy().to_string();
        let envs = [
            ("GIT_INDEX_FILE", index_value.as_str()),
            ("GIT_EDITOR", ":"),
        ];
        let file = message_file.arg();
        for (hook, args) in [
            ("pre-merge-commit", vec![]),
            ("prepare-commit-msg", vec![file.as_str(), "merge"]),
            ("commit-msg", vec![file.as_str()]),
        ] {
            let mut hook_args = vec!["hook", "run", "--ignore-missing", hook];
            if !args.is_empty() {
                hook_args.push("--");
                hook_args.extend(args);
            }
            let output = run_git_with_env(path, &hook_args, &envs)?;
            if !output.status.success() {
                return Err(AppError::new(
                    AppErrorCode::HookRejected,
                    format!("The project's {hook} hook stopped the merge version."),
                )
                .with_remediation(
                    "Nothing was changed. Check the hook's output, address what it's flagging, then try again.",
                )
                .with_detail(truncate_detail(&String::from_utf8_lossy(&output.stderr))));
            }
        }
    }
    let edited = std::fs::read_to_string(&message_file.0).unwrap_or_default();
    let cleaned = clean_message(&edited);
    let final_message = if cleaned.is_empty() {
        format!("{message}\n")
    } else {
        cleaned
    };
    std::fs::write(&message_file.0, final_message).map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdile couldn't prepare the merge version's message.",
        )
    })?;
    let file = message_file.arg();
    let mut args = vec!["commit-tree", tree, "-p", local_commit, "-p", remote_commit];
    // `commit-tree` ignores `commit.gpgSign` on its own; a merge made by
    // `git merge` would honour it, so this does too.
    if commit_signing_enabled(path)? {
        args.push("-S");
    }
    args.push("-F");
    args.push(&file);
    let output = run_git(path, &args)?;
    if !output.status.success() {
        return Err(classify_merge_version_failure(&String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    Ok(git_stdout(&output))
}

/// A commit holding the unsaved content about to be combined, so it can be
/// recovered if anything goes wrong. GitOdile's own record, not the user's
/// history: it carries a fixed identity and is never signed.
fn unsaved_snapshot_commit(
    path: &str,
    worktree_tree: &str,
    parent: &str,
) -> Result<String, AppError> {
    let identity = [
        ("GIT_AUTHOR_NAME", "GitOdile"),
        ("GIT_AUTHOR_EMAIL", "recovery@gitodile.invalid"),
        ("GIT_COMMITTER_NAME", "GitOdile"),
        ("GIT_COMMITTER_EMAIL", "recovery@gitodile.invalid"),
    ];
    let output = run_git_with_env(
        path,
        [
            "commit-tree",
            worktree_tree,
            "-p",
            parent,
            "-m",
            "GitOdile: unsaved changes kept before getting project changes",
        ],
        &identity,
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::RecoveryFailed,
            "GitOdile couldn't keep a copy of your unsaved changes.",
        )
        .with_remediation("Nothing was changed. Try again, or save your changes first.")
        .with_detail(truncate_detail(&String::from_utf8_lossy(&output.stderr))));
    }
    Ok(git_stdout(&output))
}

/// Writes the content of `tree:<path>` into each working file, through Git's
/// smudge filters and line-ending rules for that path.
fn write_tree_content(path: &str, tree: &str, files: &[String]) -> Result<(), AppError> {
    let root = Path::new(path);
    for file in files {
        validate_repo_relative_path(file)?;
        let output = run_git(path, &["cat-file", "--filters", &format!("{tree}:{file}")])?;
        if !output.status.success() {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git couldn't produce a combined file.",
            )
            .with_detail(truncate_detail(&String::from_utf8_lossy(&output.stderr))));
        }
        std::fs::write(root.join(file), &output.stdout).map_err(|_| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "GitOdile couldn't write a combined file.",
            )
            .with_remediation("Check that the file isn't open or locked in another program.")
        })?;
    }
    Ok(())
}

/// The blob each path holds in `tree`, and what each working file hashes to.
fn blobs_match_worktree(path: &str, tree: &str, files: &[String]) -> Result<bool, AppError> {
    if files.is_empty() {
        return Ok(true);
    }
    let mut expected_args = vec!["rev-parse".to_string()];
    expected_args.extend(files.iter().map(|file| format!("{tree}:{file}")));
    let expected = checked_git_stdout(run_git_with_env(path, &expected_args, &[])?)?;
    let mut actual_args = vec!["hash-object".to_string(), "--".to_string()];
    actual_args.extend(files.iter().cloned());
    let actual = checked_git_stdout(run_git_with_env(path, &actual_args, &[])?)?;
    Ok(expected.lines().collect::<Vec<_>>() == actual.lines().collect::<Vec<_>>())
}

/// Hands each combined file back to its saved content (the index entry, which
/// matches `HEAD` for an unsaved-only edit) so the two-tree update can move it.
/// Its unsaved content is in the recovery snapshot by now.
fn release_combined_files(path: &str, files: &[String]) -> Result<bool, AppError> {
    let mut args = vec![
        "checkout-index".to_string(),
        "-f".to_string(),
        "-u".to_string(),
        "--".to_string(),
    ];
    args.extend(files.iter().cloned());
    Ok(run_git_with_env(path, &args, &[])?.status.success())
}

pub(crate) fn get_team_changes(
    path: String,
    session_epoch: String,
    state_token: String,
    recovery_reference: String,
    run_hooks: bool,
    mut progress: impl FnMut(GetTeamChangesPhase),
) -> Result<GetTeamChangesResult, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "get_team_changes", None)?;
    let project_id = repository
        .worktree_root
        .backend_path()
        .to_string_lossy()
        .to_string();
    let identity = repository.common_git_dir.match_key().to_string();
    progress(GetTeamChangesPhase::CheckingLocalSafety);
    let validated =
        validate_get_team_changes(&path, &session_epoch, &identity, &recovery_reference)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleGetTeamChangesPlan,
            "The project or its remote changed since this update was reviewed.",
        )
        .with_remediation("Review the updated changes before trying again."));
    }
    let target_tree = match (
        validated.analysis.outcome(),
        validated.analysis.target_tree.clone(),
    ) {
        (ForecastOutcome::Clear, Some(tree)) => tree,
        _ => {
            return Err(AppError::new(
                AppErrorCode::IncomingTrackedChangeCollision,
                "Something on this computer overlaps the incoming changes.",
            )
            .with_remediation("Review the update to see which files overlap."));
        }
    };
    let combination = validated.analysis.combination.clone();
    let combined_paths = combination
        .as_ref()
        .map(|value| value.paths.clone())
        .unwrap_or_default();
    let combined_set = combined_paths
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let (carried_records, carried_paths) = validated.analysis.safety.carried(&combined_set);
    let carried_path_refs = carried_paths.iter().map(String::as_str).collect::<Vec<_>>();
    let carried_fingerprint = tracked_worktree_fingerprint(Path::new(&path), &carried_path_refs)?;

    let new_commit = match validated.analysis.kind {
        IntegrationKind::FastForward => validated.remote_commit.clone(),
        IntegrationKind::Merge => {
            progress(GetTeamChangesPhase::CombiningVersions);
            create_merge_version(
                &path,
                &target_tree,
                &validated.local_commit,
                &validated.remote_commit,
                &merge_message(&validated.target, &validated.branch),
                run_hooks,
            )?
        }
    };

    progress(GetTeamChangesPhase::CreatingRecovery);
    let unsaved_snapshot = match &combination {
        Some(value) => Some(unsaved_snapshot_commit(
            &path,
            &value.worktree_tree,
            &validated.local_commit,
        )?),
        None => None,
    };
    let recovery = create_history_recovery(
        &repository,
        &recovery_reference,
        HistoryRecoveryMetadata {
            branch: validated.branch.clone(),
            previous_commit: validated.local_commit.clone(),
            target_commit: new_commit.clone(),
            remote: validated.target.remote.clone(),
            destination_branch: validated.target.destination_branch.clone(),
            tracking_ref: validated.target.tracking_ref.clone(),
            state_token: validated.state_token.clone(),
            unsaved_snapshot,
        },
    )?;

    progress(GetTeamChangesPhase::UpdatingFilesAndHistory);
    if let Some(value) = &combination {
        // From here the combined files hold their saved content, so any
        // failure, an error included, must put the unsaved content back
        // before it is reported: `?` would return with it still swapped out.
        let released = release_combined_files(&path, &value.paths).unwrap_or(false);
        let carried =
            released && can_carry(&path, &validated.local_commit, &new_commit).unwrap_or(false);
        if !carried {
            // Nothing has moved yet: put the unsaved content back and stop.
            if write_tree_content(&path, &value.worktree_tree, &value.paths).is_ok()
                && blobs_match_worktree(&path, &value.worktree_tree, &value.paths).unwrap_or(false)
            {
                return Err(AppError::new(
                    AppErrorCode::IncomingTrackedChangeCollision,
                    "Git couldn't carry your unsaved changes across this update.",
                )
                .with_remediation(
                    "Nothing was changed. Save your changes first, then get the project changes.",
                ));
            }
            return Ok(uncertain_get_result(
                project_id,
                session_epoch,
                &validated,
                recovery,
                "Your unsaved changes may not have been put back; their copy is in the recovery point."
                    .to_string(),
            ));
        }
    }
    let read_tree = run_git(
        &path,
        &[
            "read-tree",
            "-u",
            "-m",
            &validated.local_commit,
            &new_commit,
        ],
    );
    if !read_tree
        .as_ref()
        .is_ok_and(|output| output.status.success())
    {
        return Ok(uncertain_get_result(
            project_id,
            session_epoch,
            &validated,
            recovery,
            "Git could not confirm whether every working file and index entry stayed unchanged during the update."
                .to_string(),
        ));
    }
    let branch_ref = format!("refs/heads/{}", validated.branch);
    let update_ref = run_git(
        &path,
        &[
            "update-ref",
            &branch_ref,
            &new_commit,
            &validated.local_commit,
        ],
    );
    if !update_ref
        .as_ref()
        .is_ok_and(|output| output.status.success())
    {
        return Ok(uncertain_get_result(
            project_id,
            session_epoch,
            &validated,
            recovery,
            "The files and index may have advanced, but Git could not confirm the active version-line reference."
                .to_string(),
        ));
    }
    if let Some(value) = &combination {
        if write_tree_content(&path, &value.combined_tree, &value.paths).is_err() {
            return Ok(uncertain_get_result(
                project_id,
                session_epoch,
                &validated,
                recovery,
                "The update finished, but some of your combined unsaved changes may not have been written back; their copy is in the recovery point."
                    .to_string(),
            ));
        }
    }

    progress(GetTeamChangesPhase::Verifying);
    let verification = (|| -> Result<TeamSyncStatus, AppError> {
        let uncertain = |message: &str| {
            AppError::new(AppErrorCode::GetTeamChangesUncertain, message.to_string())
        };
        let head = observed_head(&path)
            .ok_or_else(|| uncertain("The resulting HEAD could not be read."))?;
        let branch = checked_git_stdout(run_git(&path, &["symbolic-ref", "--short", "HEAD"])?)?;
        if head != new_commit || branch != validated.branch {
            return Err(uncertain(
                "The resulting branch or saved version did not match the reviewed target.",
            ));
        }
        let safety = read_local_safety(&path)?;
        let (records_after, paths_after) = safety.carried(&combined_set);
        let path_refs_after = paths_after.iter().map(String::as_str).collect::<Vec<_>>();
        if records_after != carried_records
            || tracked_worktree_fingerprint(Path::new(&path), &path_refs_after)?
                != carried_fingerprint
        {
            return Err(uncertain(
                "Prepared or unsaved changes no longer match the reviewed local state.",
            ));
        }
        if let Some(value) = &combination {
            if !blobs_match_worktree(&path, &value.combined_tree, &value.paths)? {
                return Err(uncertain(
                    "A combined file doesn't hold the reviewed combination of your edits and the incoming ones.",
                ));
            }
        }
        if safety.untracked.iter().any(|item| {
            validated
                .analysis
                .incoming
                .iter()
                .any(|incoming| paths_overlap(item, &incoming.path))
        }) {
            return Err(uncertain(
                "A local untracked path overlaps the resulting project files.",
            ));
        }
        verify_history_recovery(&path, &recovery)?;
        let relation = classify_sync(&path, &head, Some(&validated.remote_commit))?;
        let expected_ahead = match validated.analysis.kind {
            IntegrationKind::FastForward => 0,
            IntegrationKind::Merge => validated.relation.ahead + 1,
        };
        if relation.behind != 0 || relation.ahead != expected_ahead {
            return Err(uncertain(
                "The resulting version line doesn't contain the reviewed remote version as expected.",
            ));
        }
        let mut sync = read_team_sync_status_inner(
            &path,
            &session_epoch,
            SyncKnowledge::Fresh,
            false,
            &identity,
        )?;
        sync.checked_at = Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
                .min(u128::from(u64::MAX)) as u64,
        );
        Ok(sync)
    })();
    let sync_status = match verification {
        Ok(status) => status,
        Err(error) => {
            return Ok(uncertain_get_result(
                project_id,
                session_epoch,
                &validated,
                recovery,
                error.message,
            ))
        }
    };

    Ok(GetTeamChangesResult {
        outcome: GetTeamChangesOutcome::Completed,
        project_id,
        session_epoch,
        target: validated.sync_target(),
        tracking_ref: validated.target.tracking_ref.clone(),
        integration: validated.analysis.kind,
        previous_commit: validated.local_commit.clone(),
        resulting_commit: Some(new_commit.clone()),
        observed_head: Some(new_commit),
        received_count: validated.relation.behind,
        combined_unsaved_count: combined_paths.len() as u32,
        recovery,
        sync_status: Some(sync_status),
        warnings: Vec::new(),
        inspection_instructions: None,
        branch: validated.branch,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collision_matching_is_component_aware_and_conservative() {
        assert!(paths_overlap("cache", "cache/generated.bin"));
        assert!(paths_overlap("src/new.ts", "src/new.ts"));
        assert!(paths_overlap("assets/icon", "assets/icon/data"));
        assert!(!paths_overlap("cache-a", "cache/generated.bin"));
        assert!(!paths_overlap("src/one.ts", "src/two.ts"));
    }

    #[test]
    fn binary_numstat_parser_handles_plain_and_renamed_paths() {
        let parsed = parse_binary_paths(b"-\t-\tplain.bin\0-\t-\t\0old.bin\0new.bin\0").unwrap();
        assert!(parsed.contains("plain.bin"));
        assert!(parsed.contains("new.bin"));
        assert!(!parsed.contains("old.bin"));
    }

    #[test]
    fn merge_messages_use_git_wording_and_name_a_different_destination() {
        let target = ResolvedUpstream {
            remote: "origin".to_string(),
            destination_branch: "main".to_string(),
            tracking_ref: "refs/remotes/origin/main".to_string(),
            fetch_refspec: "+refs/heads/main:refs/remotes/origin/main".to_string(),
        };
        assert_eq!(
            merge_message(&target, "main"),
            "Merge remote-tracking branch 'origin/main'"
        );
        assert_eq!(
            merge_message(&target, "feature"),
            "Merge remote-tracking branch 'origin/main' into feature"
        );
    }

    #[test]
    fn hook_edited_messages_are_cleaned_like_an_unedited_merge() {
        assert_eq!(
            clean_message("\n\nMerge x  \n\n\n\nBody \n\n"),
            "Merge x\n\nBody\n"
        );
        assert_eq!(clean_message("  \n\n"), "");
        assert_eq!(clean_message("# kept\n"), "# kept\n");
    }

    #[test]
    fn a_forecast_caps_paths_but_keeps_exact_totals() {
        let overlaps = (0..MAX_FORECAST_PATHS + 3)
            .map(|index| ForecastOverlap {
                path: format!("f{index}.txt"),
                side: OverlapSide::Saved,
            })
            .collect::<Vec<_>>();
        let analysis = Analysis {
            kind: IntegrationKind::Merge,
            target_tree: None,
            incoming: Vec::new(),
            safety: LocalSafetyState::default(),
            combination: None,
            overlaps,
            blocker: None,
            authors: vec!["Ana".to_string()],
            author_count: 1,
        };
        let forecast = analysis.forecast(
            "abc",
            &SyncRelation {
                ahead: 1,
                behind: 2,
                diverged: true,
            },
        );
        assert_eq!(forecast.outcome, ForecastOutcome::Overlap);
        assert_eq!(forecast.overlaps.len(), MAX_FORECAST_PATHS);
        assert_eq!(forecast.overlap_count as usize, MAX_FORECAST_PATHS + 3);
        assert_eq!(forecast.local_count, 1);
        assert_eq!(forecast.incoming_count, 2);
    }
}

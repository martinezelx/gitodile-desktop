//! Getting the team's saved versions into this version line.
//!
//! One workflow, in three checked steps: validate that the local worktree can
//! carry the incoming change, record a recovery ref for the pre-update tip, then
//! fast-forward. Everything below the two entry points is private to this file
//! on purpose — the safety checks, the collision rules and the state-token
//! evidence are only meaningful together, and the sync status read model in
//! [`super`] must not be able to reach past them.

use super::{
    classify_sync, fetch_remote_target, list_configured_remotes, read_team_sync_status_inner,
    relation_state, resolve_commit, resolve_upstream, SyncKnowledge, SyncRelation, SyncTarget,
    SyncWarning, TeamSyncState, TeamSyncStatus,
};
use crate::application;
use crate::changes::validate_repo_relative_path;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{checked_git_stdout, git_stdout, run_git, run_git_with_env};
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
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const MAX_INCOMING_VERSIONS: usize = 25;
pub(crate) const MAX_INCOMING_FILES: usize = 100;

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum GetTeamChangesPhase {
    CheckingTeam,
    CheckingLocalSafety,
    CreatingRecovery,
    UpdatingFilesAndHistory,
    Verifying,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
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

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetTeamChangesGuarantees {
    pub(crate) fast_forward_only: bool,
    pub(crate) no_merge: bool,
    pub(crate) no_rebase: bool,
    pub(crate) no_stash: bool,
    pub(crate) no_force: bool,
    pub(crate) no_automatic_conflict_resolution: bool,
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
    pub(crate) incoming_count: u32,
    pub(crate) incoming_versions: Vec<SavedVersionSummary>,
    pub(crate) versions_truncated: bool,
    pub(crate) file_impact: IncomingFileImpact,
    pub(crate) consequences: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) steps: Vec<String>,
    pub(crate) verification: String,
    pub(crate) recovery: HistoryRecoveryPreview,
    pub(crate) guarantees: GetTeamChangesGuarantees,
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
    pub(crate) previous_commit: String,
    pub(crate) resulting_commit: Option<String>,
    pub(crate) observed_head: Option<String>,
    pub(crate) received_count: u32,
    pub(crate) recovery: HistoryRecoveryRecord,
    pub(crate) sync_status: Option<TeamSyncStatus>,
    pub(crate) warnings: Vec<SyncWarning>,
    pub(crate) inspection_instructions: Option<String>,
}

#[derive(Debug, Clone)]
struct LocalSafetyState {
    raw: Vec<u8>,
    tracked: Vec<String>,
    tracked_snapshot: Vec<Vec<u8>>,
    tracked_worktree_fingerprint: u64,
    untracked: Vec<String>,
    ignored: Vec<String>,
}

#[derive(Debug)]
struct ValidatedGetTeamChanges {
    branch: String,
    target: SyncTarget,
    tracking_ref: String,
    local_commit: String,
    remote_commit: String,
    relation: SyncRelation,
    state_token: String,
    incoming_versions: Vec<SavedVersionSummary>,
    versions_truncated: bool,
    file_impact: IncomingFileImpact,
    safety: LocalSafetyState,
}

fn checked_dynamic_output(path: &str, args: Vec<String>) -> Result<Vec<u8>, AppError> {
    let output = run_git_with_env(path, &args, &[])?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect the incoming team changes safely.",
        )
        .with_detail(truncate_detail(&String::from_utf8_lossy(&output.stderr))))
    }
}

fn tracked_worktree_fingerprint(root: &Path, tracked: &[String]) -> Result<u64, AppError> {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut seen = HashSet::new();
    for relative in tracked {
        if !seen.insert(relative) {
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
                    "Save or move that path outside GitOdile, then review the team update again.",
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
    let mut tracked_snapshot = Vec::new();
    let mut untracked = Vec::new();
    let mut ignored = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let field = std::str::from_utf8(fields[index]).map_err(|_| {
            AppError::new(
                AppErrorCode::PathEncodingUnsupported,
                "This project contains a path GitOdile can't compare safely.",
            )
        })?;
        if let Some(path) = field.strip_prefix("? ") {
            untracked.push(path.to_string());
        } else if let Some(path) = field.strip_prefix("! ") {
            ignored.push(path.trim_end_matches('/').to_string());
        } else if field.starts_with("1 ") {
            let path = field.splitn(9, ' ').nth(8).ok_or_else(|| {
                AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "Git returned an incomplete local-change record.",
                )
            })?;
            tracked.push(path.to_string());
            tracked_snapshot.push(fields[index].to_vec());
        } else if field.starts_with("2 ") {
            let path = field.splitn(10, ' ').nth(9).ok_or_else(|| {
                AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "Git returned an incomplete local-rename record.",
                )
            })?;
            let original = fields.get(index + 1).ok_or_else(|| {
                AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "Git returned a local rename without its original path.",
                )
            })?;
            let original_path = std::str::from_utf8(original).map_err(|_| {
                AppError::new(
                    AppErrorCode::PathEncodingUnsupported,
                    "This project contains a path GitOdile can't compare safely.",
                )
            })?;
            tracked.push(path.to_string());
            tracked.push(original_path.to_string());
            let mut snapshot = fields[index].to_vec();
            snapshot.push(0);
            snapshot.extend_from_slice(original);
            tracked_snapshot.push(snapshot);
            index += 1;
        } else if field.starts_with("u ") {
            return Err(AppError::new(
                AppErrorCode::UnresolvedConflicts,
                "This project contains unresolved overlapping changes.",
            )
            .with_remediation(
                "Resolve or abort the current Git operation before getting team changes.",
            ));
        }
        index += 1;
    }
    let tracked_worktree_fingerprint = tracked_worktree_fingerprint(Path::new(path), &tracked)?;
    Ok(LocalSafetyState {
        raw,
        tracked,
        tracked_snapshot,
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

fn incoming_file_impact(
    path: &str,
    local_commit: &str,
    remote_commit: &str,
) -> Result<IncomingFileImpact, AppError> {
    let name_status = checked_dynamic_output(
        path,
        vec![
            "diff".to_string(),
            "--name-status".to_string(),
            "-z".to_string(),
            "--find-renames".to_string(),
            local_commit.to_string(),
            remote_commit.to_string(),
            "--".to_string(),
        ],
    )?;
    let numstat = checked_dynamic_output(
        path,
        vec![
            "diff".to_string(),
            "--numstat".to_string(),
            "-z".to_string(),
            "--find-renames".to_string(),
            local_commit.to_string(),
            remote_commit.to_string(),
            "--".to_string(),
        ],
    )?;
    let binary_paths = parse_binary_paths(&numstat)?;
    let fields = name_status
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    let mut all = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let status = std::str::from_utf8(fields[index]).map_err(|_| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git returned an unreadable file status.",
            )
        })?;
        let status_code = status.as_bytes().first().copied().unwrap_or_default();
        let (original_path, path_index, consumed, category) = match status_code {
            b'R' | b'C' => {
                let original = fields.get(index + 1).ok_or_else(|| {
                    AppError::new(
                        AppErrorCode::GitCommandFailed,
                        "Git returned an incomplete rename.",
                    )
                })?;
                (
                    Some(
                        std::str::from_utf8(original)
                            .map_err(|_| {
                                AppError::new(
                                    AppErrorCode::PathEncodingUnsupported,
                                    "An incoming original path can't be represented safely.",
                                )
                            })?
                            .to_string(),
                    ),
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
        let file_path = std::str::from_utf8(value)
            .map_err(|_| {
                AppError::new(
                    AppErrorCode::PathEncodingUnsupported,
                    "An incoming file path can't be represented safely.",
                )
            })?
            .to_string();
        all.push(IncomingFile {
            binary: binary_paths.contains(&file_path),
            path: file_path,
            original_path,
            category,
        });
        index += consumed;
    }
    let mut counts = IncomingFileCounts::default();
    for file in &all {
        match file.category {
            IncomingFileCategory::Added => counts.added += 1,
            IncomingFileCategory::Modified => counts.modified += 1,
            IncomingFileCategory::Deleted => counts.deleted += 1,
            IncomingFileCategory::Renamed => counts.renamed += 1,
        }
        if file.binary {
            counts.binary += 1;
        }
    }
    let total_count = all.len();
    all.truncate(MAX_INCOMING_FILES);
    Ok(IncomingFileImpact {
        total_count,
        counts,
        is_truncated: total_count > all.len(),
        files: all,
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

fn ensure_no_local_collisions(
    safety: &LocalSafetyState,
    impact: &IncomingFileImpact,
) -> Result<(), AppError> {
    let incoming = impact
        .files
        .iter()
        .flat_map(|file| std::iter::once(&file.path).chain(file.original_path.as_ref()))
        .collect::<Vec<_>>();
    let tracked_collision = safety
        .tracked
        .iter()
        .find(|candidate| incoming.iter().any(|path| paths_overlap(candidate, path)));
    if let Some(path) = tracked_collision {
        return Err(AppError::new(
            AppErrorCode::IncomingTrackedChangeCollision,
            format!("A prepared or unsaved change overlaps the team update: {path}"),
        )
        .with_remediation(
            "Save, move, or discard that change yourself, then review the team update again.",
        ));
    }
    let collision = safety
        .untracked
        .iter()
        .chain(&safety.ignored)
        .find(|candidate| incoming.iter().any(|path| paths_overlap(candidate, path)));
    if let Some(path) = collision {
        return Err(AppError::new(
            AppErrorCode::IncomingPathCollision,
            format!("A local untracked or ignored path could be overwritten: {path}"),
        )
        .with_remediation(
            "Move, save, or remove that local path yourself, then review the team update again.",
        ));
    }
    if impact.is_truncated && !safety.tracked.is_empty() {
        return Err(AppError::new(
            AppErrorCode::IncomingTrackedChangeCollision,
            "GitOdile couldn't prove that every prepared or unsaved change is outside the bounded incoming file list.",
        )
        .with_remediation(
            "Save or move tracked changes outside the project, then review the team update again.",
        ));
    }
    if impact.is_truncated && (!safety.untracked.is_empty() || !safety.ignored.is_empty()) {
        return Err(AppError::new(
            AppErrorCode::IncomingPathCollision,
            "GitOdile couldn't prove that every local untracked or ignored path is outside the bounded incoming file list.",
        )
        .with_remediation(
            "Move untracked or ignored content outside the project, then review the team update again.",
        ));
    }
    Ok(())
}

fn ensure_tracked_changes_can_be_carried(
    path: &str,
    safety: &LocalSafetyState,
    local_commit: &str,
    remote_commit: &str,
) -> Result<(), AppError> {
    if safety.tracked.is_empty() {
        return Ok(());
    }
    let output = run_git(
        path,
        &[
            "read-tree",
            "--dry-run",
            "-u",
            "-m",
            local_commit,
            remote_commit,
        ],
    )?;
    if output.status.success() {
        return Ok(());
    }
    Err(AppError::new(
        AppErrorCode::IncomingTrackedChangeCollision,
        "Git could not carry every prepared or unsaved change across this team update.",
    )
    .with_remediation(
        "Save, move, or discard the affected changes yourself, then review the team update again.",
    )
    .with_detail(truncate_detail(&String::from_utf8_lossy(&output.stderr))))
}

struct GetTeamChangesTokenEvidence<'a> {
    repository_identity: &'a str,
    session_epoch: &'a str,
    branch: &'a str,
    local_commit: &'a str,
    target: &'a SyncTarget,
    tracking_ref: &'a str,
    remote_commit: &'a str,
    recovery_reference: &'a str,
    safety: &'a LocalSafetyState,
}

fn compute_get_team_changes_state_token(evidence: GetTeamChangesTokenEvidence<'_>) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    evidence.repository_identity.hash(&mut hasher);
    evidence.session_epoch.hash(&mut hasher);
    evidence.branch.hash(&mut hasher);
    evidence.local_commit.hash(&mut hasher);
    evidence.target.remote.hash(&mut hasher);
    evidence.target.destination_branch.hash(&mut hasher);
    evidence.tracking_ref.hash(&mut hasher);
    evidence.remote_commit.hash(&mut hasher);
    evidence.recovery_reference.hash(&mut hasher);
    evidence.safety.raw.hash(&mut hasher);
    evidence
        .safety
        .tracked_worktree_fingerprint
        .hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn get_relation_blocker(state: TeamSyncState) -> AppError {
    match state {
        TeamSyncState::UpToDate => AppError::new(
            AppErrorCode::NothingToGet,
            "This project already includes the latest team version.",
        ),
        TeamSyncState::Ahead => AppError::new(
            AppErrorCode::NothingToGet,
            "This version line is no longer behind the team destination.",
        )
        .with_remediation("Check the team status again before choosing another action."),
        TeamSyncState::Diverged => AppError::new(
            AppErrorCode::DivergedHistories,
            "Both the local and team version lines contain different saved versions.",
        )
        .with_remediation(
            "Guided integration is not available yet. Review both sides without retrying this fast-forward.",
        ),
        _ => AppError::new(
            AppErrorCode::NothingToGet,
            "The configured team version cannot be applied as a strict fast-forward.",
        ),
    }
}

fn validate_get_team_changes(
    path: &str,
    session_epoch: &str,
    repository_identity: &str,
    recovery_reference: &str,
    progress: &mut impl FnMut(GetTeamChangesPhase),
) -> Result<ValidatedGetTeamChanges, AppError> {
    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation before getting team changes."));
    }
    let before = read_working_tree_status(path.to_string())?;
    let before_branch = before.upstream.branch.clone();
    let (before_head_state, before_head) = resolve_head_state(path, before_branch.clone())?;
    if before_head_state == HeadState::Detached {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a version line right now.",
        )
        .with_remediation("Switch to a version line before getting team changes."));
    }
    if before_head_state == HeadState::Unborn {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "There is no saved local version to advance.",
        ));
    }
    let before_branch = before_branch.expect("a born named head has a branch");
    let before_head = before_head.expect("a born head has a commit");
    let remotes = list_configured_remotes(path)?;
    if remotes.is_empty() {
        return Err(AppError::new(
            AppErrorCode::NoRemoteConfigured,
            "This project has no configured remote project.",
        ));
    }
    let before_target = resolve_upstream(path, &before_branch, &remotes)?.ok_or_else(|| {
        AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "This version line has no configured upstream destination.",
        )
    })?;

    progress(GetTeamChangesPhase::CheckingTeam);
    let fetched = fetch_remote_target(path, &before_target.remote, &before_target.fetch_refspec)?;
    progress(GetTeamChangesPhase::CheckingLocalSafety);

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} started while the team state was being checked."),
        ));
    }
    let working = read_working_tree_status(path.to_string())?;
    let branch = working.upstream.branch.clone();
    let (head_state, local_commit) = resolve_head_state(path, branch.clone())?;
    if head_state != HeadState::Branch
        || branch.as_deref() != Some(&before_branch)
        || local_commit.as_deref() != Some(&before_head)
    {
        return Err(AppError::new(
            AppErrorCode::StaleGetTeamChangesPlan,
            "The active version line or saved version changed while checking the team.",
        )
        .with_remediation("Review the team update again."));
    }
    let branch = branch.expect("validated branch");
    validate_branch_ref_name(path, &branch)?;
    let local_commit = local_commit.expect("validated head");
    let current_remotes = list_configured_remotes(path)?;
    let target = resolve_upstream(path, &branch, &current_remotes)?.ok_or_else(|| {
        AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "The upstream destination disappeared while checking the team.",
        )
    })?;
    if target.remote != before_target.remote
        || target.destination_branch != before_target.destination_branch
        || target.tracking_ref != before_target.tracking_ref
        || target.fetch_refspec != before_target.fetch_refspec
    {
        return Err(AppError::new(
            AppErrorCode::StaleGetTeamChangesPlan,
            "The upstream destination changed while checking the team.",
        )
        .with_remediation("Review the updated team destination."));
    }
    let remote_commit = resolve_commit(path, &target.tracking_ref)?.ok_or_else(|| {
        AppError::new(
            AppErrorCode::RemoteRefMissing,
            "The fetched upstream commit is no longer available locally.",
        )
    })?;
    if remote_commit != fetched {
        return Err(AppError::new(
            AppErrorCode::StaleGetTeamChangesPlan,
            "The configured tracking reference changed during the fresh fetch.",
        )
        .with_remediation("Review the team update again."));
    }
    let relation = classify_sync(path, &local_commit, Some(&remote_commit))?;
    let relation_kind = relation_state(&relation);
    if relation_kind != TeamSyncState::Behind || relation.ahead != 0 || relation.behind == 0 {
        return Err(get_relation_blocker(relation_kind));
    }

    let safety = read_local_safety(path)?;
    let file_impact = incoming_file_impact(path, &local_commit, &remote_commit)?;
    ensure_no_local_collisions(&safety, &file_impact)?;
    ensure_tracked_changes_can_be_carried(path, &safety, &local_commit, &remote_commit)?;
    let range = format!("{local_commit}..{remote_commit}");
    let mut incoming_versions = git_log_summaries(path, &range)?;
    incoming_versions.truncate(MAX_INCOMING_VERSIONS);
    let versions_truncated = relation.behind as usize > incoming_versions.len();
    let sync_target = SyncTarget {
        remote: target.remote,
        destination_branch: target.destination_branch,
    };
    let state_token = compute_get_team_changes_state_token(GetTeamChangesTokenEvidence {
        repository_identity,
        session_epoch,
        branch: &branch,
        local_commit: &local_commit,
        target: &sync_target,
        tracking_ref: &target.tracking_ref,
        remote_commit: &remote_commit,
        recovery_reference,
        safety: &safety,
    });
    Ok(ValidatedGetTeamChanges {
        branch,
        target: sync_target,
        tracking_ref: target.tracking_ref,
        local_commit,
        remote_commit,
        relation,
        state_token,
        incoming_versions,
        versions_truncated,
        file_impact,
        safety,
    })
}

pub(crate) fn plan_get_team_changes(
    path: String,
    session_epoch: String,
    mut progress: impl FnMut(GetTeamChangesPhase),
) -> Result<GetTeamChangesPlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_get_team_changes", None)?;
    let recovery = plan_history_recovery(&repository);
    let identity = repository.common_git_dir.match_key().to_string();
    let validated = validate_get_team_changes(
        &path,
        &session_epoch,
        &identity,
        &recovery.reference,
        &mut progress,
    )?;
    Ok(GetTeamChangesPlan {
        operation_kind: OperationKind::HistoryMutation,
        requires_confirmation: true,
        project_id: repository
            .worktree_root
            .backend_path()
            .to_string_lossy()
            .to_string(),
        session_epoch,
        state_token: validated.state_token,
        branch: validated.branch,
        target: validated.target,
        tracking_ref: validated.tracking_ref,
        local_commit: validated.local_commit,
        remote_commit: validated.remote_commit,
        incoming_count: validated.relation.behind,
        incoming_versions: validated.incoming_versions,
        versions_truncated: validated.versions_truncated,
        file_impact: validated.file_impact,
        consequences: vec![
            "The active version line and incoming tracked files advance to the reviewed team commit."
                .to_string(),
            "Prepared, unsaved, untracked, and ignored content proven not to collide stays local and untouched."
                .to_string(),
        ],
        risks: vec![
            "Files open in another program may prevent the update and leave the local result uncertain."
                .to_string(),
        ],
        steps: vec![
            "Fetch and revalidate the exact configured upstream.".to_string(),
            "Create and verify a durable local recovery reference.".to_string(),
            "Advance files, index, and the active version line without combining histories."
                .to_string(),
            "Verify the branch, commit, files, upstream relation, and recovery reference."
                .to_string(),
        ],
        verification: "Success is reported only when HEAD exactly matches the freshly fetched upstream, the reviewed local-change snapshot is preserved, and recovery still resolves to the previous commit."
            .to_string(),
        recovery,
        guarantees: GetTeamChangesGuarantees {
            fast_forward_only: true,
            no_merge: true,
            no_rebase: true,
            no_stash: true,
            no_force: true,
            no_automatic_conflict_resolution: true,
        },
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
        target: validated.target.clone(),
        tracking_ref: validated.tracking_ref.clone(),
        previous_commit: validated.local_commit.clone(),
        resulting_commit: None,
        observed_head: observed,
        received_count: validated.relation.behind,
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

pub(crate) fn get_team_changes(
    path: String,
    session_epoch: String,
    state_token: String,
    recovery_reference: String,
    mut progress: impl FnMut(GetTeamChangesPhase),
) -> Result<GetTeamChangesResult, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "get_team_changes", None)?;
    let project_id = repository
        .worktree_root
        .backend_path()
        .to_string_lossy()
        .to_string();
    let identity = repository.common_git_dir.match_key().to_string();
    let validated = validate_get_team_changes(
        &path,
        &session_epoch,
        &identity,
        &recovery_reference,
        &mut progress,
    )?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleGetTeamChangesPlan,
            "The project or upstream changed since this update was reviewed.",
        )
        .with_remediation("Review the updated team changes before trying again."));
    }

    progress(GetTeamChangesPhase::CreatingRecovery);
    let recovery = create_history_recovery(
        &repository,
        &recovery_reference,
        HistoryRecoveryMetadata {
            branch: validated.branch.clone(),
            previous_commit: validated.local_commit.clone(),
            target_commit: validated.remote_commit.clone(),
            remote: validated.target.remote.clone(),
            destination_branch: validated.target.destination_branch.clone(),
            tracking_ref: validated.tracking_ref.clone(),
            state_token: validated.state_token.clone(),
        },
    )?;

    progress(GetTeamChangesPhase::UpdatingFilesAndHistory);
    let read_tree = run_git(
        &path,
        &[
            "read-tree",
            "-u",
            "-m",
            &validated.local_commit,
            &validated.remote_commit,
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
            "Git could not confirm whether every working file and index entry stayed unchanged during the fast-forward update."
                .to_string(),
        ));
    }
    let branch_ref = format!("refs/heads/{}", validated.branch);
    let update_ref = run_git(
        &path,
        &[
            "update-ref",
            &branch_ref,
            &validated.remote_commit,
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

    progress(GetTeamChangesPhase::Verifying);
    let verification = (|| -> Result<TeamSyncStatus, AppError> {
        let head = observed_head(&path).ok_or_else(|| {
            AppError::new(
                AppErrorCode::GetTeamChangesUncertain,
                "The resulting HEAD could not be read.",
            )
        })?;
        let branch = checked_git_stdout(run_git(&path, &["symbolic-ref", "--short", "HEAD"])?)?;
        if head != validated.remote_commit || branch != validated.branch {
            return Err(AppError::new(
                AppErrorCode::GetTeamChangesUncertain,
                "The resulting branch or saved version did not match the reviewed target.",
            ));
        }
        let safety = read_local_safety(&path)?;
        if safety.tracked_snapshot != validated.safety.tracked_snapshot
            || safety.tracked_worktree_fingerprint != validated.safety.tracked_worktree_fingerprint
        {
            return Err(AppError::new(
                AppErrorCode::GetTeamChangesUncertain,
                "Prepared or unsaved changes no longer match the reviewed local state.",
            ));
        }
        if !safety.untracked.iter().all(|item| {
            !validated
                .file_impact
                .files
                .iter()
                .any(|incoming| paths_overlap(item, &incoming.path))
        }) {
            return Err(AppError::new(
                AppErrorCode::GetTeamChangesUncertain,
                "A local untracked path overlaps the resulting team tree.",
            ));
        }
        verify_history_recovery(&path, &recovery)?;
        let relation = classify_sync(&path, &head, Some(&validated.remote_commit))?;
        if relation.ahead != 0 || relation.behind != 0 {
            return Err(AppError::new(
                AppErrorCode::GetTeamChangesUncertain,
                "The resulting version line is not exactly aligned with its upstream.",
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
        branch: validated.branch,
        target: validated.target,
        tracking_ref: validated.tracking_ref,
        previous_commit: validated.local_commit,
        resulting_commit: Some(validated.remote_commit.clone()),
        observed_head: Some(validated.remote_commit),
        received_count: validated.relation.behind,
        recovery,
        sync_status: Some(sync_status),
        warnings: Vec::new(),
        inspection_instructions: None,
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
        let parsed = parse_binary_paths(b"-	-	plain.bin -	-	 old.bin new.bin ").unwrap();
        assert!(parsed.contains("plain.bin"));
        assert!(parsed.contains("new.bin"));
        assert!(!parsed.contains("old.bin"));
    }
}

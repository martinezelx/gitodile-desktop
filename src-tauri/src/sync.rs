//! Provider-neutral remote knowledge and team-sync status.
//!
//! This domain owns configured remotes, upstream resolution, bounded network
//! Git execution, privacy-safe diagnostics and ancestry classification. It is
//! shared by the explicit team check and Publish; it never chooses an inbound
//! target for a branch without an upstream.

use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git;
use crate::git_command::{checked_git_stdout, git_stdout, run_git};
use crate::operation::truncate_detail;
use crate::repository::{resolve_head_state, validate_branch_ref_name, HeadState};
use crate::status::read_working_tree_status;
use std::path::Path;
use std::process::ExitStatus;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub(crate) const NETWORK_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_WARNINGS: usize = 4;

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteInfo {
    pub(crate) name: String,
    /// Presentation-only value. The raw configured URL never crosses IPC.
    pub(crate) url: String,
}

#[derive(Debug, Clone)]
struct ConfiguredRemote {
    info: RemoteInfo,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteDiscovery {
    pub(crate) remotes: Vec<RemoteInfo>,
    pub(crate) branch: Option<String>,
    pub(crate) upstream: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncTarget {
    pub(crate) remote: String,
    pub(crate) destination_branch: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum TeamSyncState {
    NoRemote,
    NoUpstream,
    Unborn,
    Detached,
    UpToDate,
    Ahead,
    Behind,
    Diverged,
    Unknown,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SyncKnowledge {
    Cached,
    Fresh,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncWarning {
    pub(crate) code: String,
    pub(crate) message: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SyncNextAction {
    CheckAgain,
    PublishChanges,
    ReviewAndGet,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TeamSyncStatus {
    pub(crate) state: TeamSyncState,
    pub(crate) local_branch: Option<String>,
    pub(crate) local_commit: Option<String>,
    pub(crate) upstream_remote: Option<String>,
    pub(crate) destination_branch: Option<String>,
    pub(crate) tracking_ref: Option<String>,
    pub(crate) remote_commit: Option<String>,
    pub(crate) ahead: u32,
    pub(crate) behind: u32,
    pub(crate) knowledge: SyncKnowledge,
    /// Unix milliseconds, present only after a successful explicit fetch and
    /// ancestry classification in this application session.
    pub(crate) checked_at: Option<u64>,
    pub(crate) warnings: Vec<SyncWarning>,
    pub(crate) next_actions: Vec<SyncNextAction>,
    pub(crate) state_token: String,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SyncRelation {
    pub(crate) ahead: u32,
    pub(crate) behind: u32,
    pub(crate) diverged: bool,
}

#[derive(Debug)]
pub(crate) struct NetworkOutput {
    pub(crate) status: Option<ExitStatus>,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) timed_out: bool,
}

#[derive(Debug, Clone)]
struct ResolvedUpstream {
    remote: String,
    destination_branch: String,
    tracking_ref: String,
    fetch_refspec: String,
}

/// Removes URL userinfo plus query/fragment components before a configured
/// value can be serialized or copied into an error. SCP-like SSH and local
/// paths remain readable; their raw values are never used as display data.
pub(crate) fn redact_remote_url(url: &str) -> String {
    let without_suffix = url.split(['?', '#']).next().unwrap_or_default();
    let Some(scheme_end) = without_suffix.find("://") else {
        return without_suffix.to_string();
    };
    let authority_start = scheme_end + 3;
    let tail = &without_suffix[authority_start..];
    let authority_end = tail.find('/').unwrap_or(tail.len());
    let authority = &tail[..authority_end];
    match authority.rfind('@') {
        Some(at) => format!("{}{}", &without_suffix[..authority_start], &tail[at + 1..]),
        None => without_suffix.to_string(),
    }
}

pub(crate) fn parse_remote_v_output(output: &str) -> Vec<RemoteInfo> {
    let mut remotes = Vec::new();
    for line in output.lines() {
        let Some((name, rest)) = line.split_once('\t') else {
            continue;
        };
        let Some(url) = rest.strip_suffix(" (fetch)") else {
            continue;
        };
        remotes.push(RemoteInfo {
            name: name.to_string(),
            url: redact_remote_url(url),
        });
    }
    remotes
}

fn list_configured_remotes(path: &str) -> Result<Vec<ConfiguredRemote>, AppError> {
    let output = checked_git_stdout(run_git(path, &["remote", "-v"])?)?;
    Ok(parse_remote_v_output(&output)
        .into_iter()
        .map(|info| ConfiguredRemote { info })
        .collect())
}

pub(crate) fn list_remotes(path: &str) -> Result<Vec<RemoteInfo>, AppError> {
    Ok(list_configured_remotes(path)?
        .into_iter()
        .map(|remote| remote.info)
        .collect())
}

pub(crate) fn discover_remotes(path: String) -> Result<RemoteDiscovery, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "discover_remotes", None)?;
    let status = read_working_tree_status(path.clone())?;
    Ok(RemoteDiscovery {
        remotes: list_remotes(&path)?,
        branch: status.upstream.branch,
        upstream: status.upstream.upstream,
    })
}

/// Publish may propose its single configured remote. Team checking never calls
/// this function: inbound sync requires the exact configured upstream below.
pub(crate) fn resolve_remote_selection(
    remotes: &[RemoteInfo],
    upstream: Option<&str>,
    requested: Option<&str>,
) -> Result<String, AppError> {
    if let Some(name) = requested {
        return if remotes.iter().any(|remote| remote.name == name) {
            Ok(name.to_string())
        } else {
            Err(AppError::new(
                AppErrorCode::NoRemoteConfigured,
                "That remote isn't configured for this project anymore.",
            )
            .with_remediation("Refresh and choose a remote again."))
        };
    }
    if let Some(upstream_ref) = upstream {
        if let Some(remote) = remotes
            .iter()
            .filter(|remote| upstream_ref.starts_with(&format!("{}/", remote.name)))
            .max_by_key(|remote| remote.name.len())
        {
            return Ok(remote.name.clone());
        }
    }
    match remotes.len() {
        0 => Err(AppError::new(
            AppErrorCode::NoRemoteConfigured,
            "This project has no remote project configured yet.",
        )
        .with_remediation("Add a remote in Git, then try publishing again.")),
        1 => Ok(remotes[0].name.clone()),
        _ => Err(AppError::new(
            AppErrorCode::RemoteSelectionRequired,
            "This project has more than one remote project. Choose which one to publish to.",
        )),
    }
}

pub(crate) fn validate_remote_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.starts_with('-') || name.chars().any(char::is_control) {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That remote project has an unsafe name.",
        )
        .with_remediation("Rename the remote in Git, then try again."));
    }
    Ok(())
}

pub(crate) fn destination_for_remote(
    upstream: Option<&str>,
    remote: &str,
    local_branch: &str,
) -> String {
    upstream
        .and_then(|upstream| upstream.strip_prefix(&format!("{remote}/")))
        .filter(|branch| !branch.is_empty())
        .unwrap_or(local_branch)
        .to_string()
}

pub(crate) fn run_git_networked(
    repo_path: &str,
    args: &[String],
    timeout: Duration,
) -> Result<NetworkOutput, AppError> {
    let mut policy = application::current_policy()
        .unwrap_or_else(|| git::ExecutionPolicy::repository_read("network_git"));
    policy.timeout = timeout;
    let cancellation = application::current_cancellation();
    match git::run_with_env(
        Some(Path::new(repo_path)),
        args,
        &[("GIT_TERMINAL_PROMPT", "0")],
        policy,
        cancellation.as_ref(),
    ) {
        Ok(output) => Ok(NetworkOutput {
            status: Some(output.status),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            timed_out: false,
        }),
        Err(error) if error.message.contains("too long") => Ok(NetworkOutput {
            status: None,
            stdout: String::new(),
            stderr: String::new(),
            timed_out: true,
        }),
        Err(error) if error.message.contains("cancelled") => Err(AppError::new(
            AppErrorCode::OperationCancelled,
            "The remote check was cancelled.",
        )),
        Err(error) => Err(error),
    }
}

pub(crate) fn looks_like_authentication_failure(stderr_lower: &str) -> bool {
    stderr_lower.contains("authentication failed")
        || stderr_lower.contains("could not read username")
        || stderr_lower.contains("could not read password")
        || stderr_lower.contains("permission denied (publickey")
        || stderr_lower.contains("terminal prompts disabled")
        || stderr_lower.contains("403")
        || stderr_lower.contains("401")
}

pub(crate) fn looks_like_missing_remote_ref(stderr_lower: &str) -> bool {
    stderr_lower.contains("couldn't find remote ref")
        || stderr_lower.contains("couldn't find remote branch")
}

pub(crate) fn classify_remote_failure(stderr: &str) -> AppError {
    let lower = stderr.to_lowercase();
    if looks_like_missing_remote_ref(&lower) {
        return AppError::new(
            AppErrorCode::RemoteRefMissing,
            "The configured team version line no longer exists on the remote project.",
        )
        .with_remediation("Check the remote setup before trying again.");
    }
    if looks_like_authentication_failure(&lower) {
        return AppError::new(
            AppErrorCode::AuthenticationFailed,
            "GitOdrile couldn't sign in to the remote project.",
        )
        .with_remediation("Check your Git credentials for this remote, then try again.")
        .with_detail(truncate_detail(stderr));
    }
    AppError::new(
        AppErrorCode::GitCommandFailed,
        "GitOdrile couldn't check the remote project's latest state.",
    )
    .with_remediation("Check your connection and the remote project, then try again.")
    .with_detail(truncate_detail(stderr))
}

pub(crate) fn classify_sync(
    path: &str,
    local_sha: &str,
    remote_sha: Option<&str>,
) -> Result<SyncRelation, AppError> {
    let Some(remote_sha) = remote_sha else {
        return Ok(SyncRelation {
            ahead: 0,
            behind: 0,
            diverged: false,
        });
    };
    let range = format!("{local_sha}...{remote_sha}");
    let output = checked_git_stdout(run_git(
        path,
        &["rev-list", "--left-right", "--count", &range],
    )?)?;
    let mut parts = output.split_whitespace();
    let ahead = parts.next().and_then(|value| value.parse().ok());
    let behind = parts.next().and_then(|value| value.parse().ok());
    match (ahead, behind, parts.next()) {
        (Some(ahead), Some(behind), None) => Ok(SyncRelation {
            ahead,
            behind,
            diverged: ahead > 0 && behind > 0,
        }),
        _ => Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git returned an unreadable team-change comparison.",
        )),
    }
}

fn read_config_value(path: &str, key: &str) -> Result<Option<String>, AppError> {
    let output = run_git(path, &["config", "--get", key])?;
    if output.status.success() {
        Ok(Some(git_stdout(&output)))
    } else {
        Ok(None)
    }
}

fn read_config_values(path: &str, key: &str) -> Result<Vec<String>, AppError> {
    let output = run_git(path, &["config", "--get-all", key])?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::to_string)
        .collect())
}

fn map_fetch_refspec(refspec: &str, source_ref: &str) -> Option<String> {
    if refspec.starts_with('^') || refspec.starts_with('-') {
        return None;
    }
    let spec = refspec.strip_prefix('+').unwrap_or(refspec);
    let (source, destination) = spec.split_once(':')?;
    if source == source_ref {
        return Some(destination.to_string());
    }
    let (source_prefix, source_suffix) = source.split_once('*')?;
    let (destination_prefix, destination_suffix) = destination.split_once('*')?;
    let captured = source_ref
        .strip_prefix(source_prefix)?
        .strip_suffix(source_suffix)?;
    Some(format!(
        "{destination_prefix}{captured}{destination_suffix}"
    ))
}

fn resolve_upstream(
    path: &str,
    branch: &str,
    remotes: &[ConfiguredRemote],
) -> Result<Option<ResolvedUpstream>, AppError> {
    let remote_key = format!("branch.{branch}.remote");
    let merge_key = format!("branch.{branch}.merge");
    let (Some(remote), Some(merge_ref)) = (
        read_config_value(path, &remote_key)?,
        read_config_value(path, &merge_key)?,
    ) else {
        return Ok(None);
    };
    if remote == "."
        || !remotes
            .iter()
            .any(|candidate| candidate.info.name == remote)
    {
        return Err(AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "The configured upstream doesn't identify a usable remote project.",
        )
        .with_remediation("Repair this version line's upstream configuration in Git."));
    }
    validate_remote_name(&remote)?;
    let destination_branch = merge_ref
        .strip_prefix("refs/heads/")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::new(
                AppErrorCode::InvalidRemoteConfiguration,
                "The configured upstream branch is invalid.",
            )
            .with_remediation("Repair this version line's upstream configuration in Git.")
        })?
        .to_string();
    validate_branch_ref_name(path, &destination_branch)?;
    let refspecs = read_config_values(path, &format!("remote.{remote}.fetch"))?;
    let (configured_refspec, tracking_ref) = refspecs
        .iter()
        .find_map(|refspec| {
            map_fetch_refspec(refspec, &merge_ref).map(|tracking| (refspec, tracking))
        })
        .ok_or_else(|| {
            AppError::new(
                AppErrorCode::InvalidRemoteConfiguration,
                "The configured upstream isn't covered by this remote's fetch mapping.",
            )
            .with_remediation("Repair this remote's fetch mapping in Git.")
        })?;
    if !tracking_ref.starts_with("refs/") || tracking_ref.chars().any(char::is_control) {
        return Err(AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "The configured tracking reference is invalid.",
        ));
    }
    let exact_fetch_refspec = format!(
        "{}{}:{}",
        if configured_refspec.starts_with('+') {
            "+"
        } else {
            ""
        },
        merge_ref,
        tracking_ref
    );
    Ok(Some(ResolvedUpstream {
        remote,
        destination_branch,
        tracking_ref,
        fetch_refspec: exact_fetch_refspec,
    }))
}

fn resolve_commit(path: &str, reference: &str) -> Result<Option<String>, AppError> {
    let output = run_git(
        path,
        &["rev-parse", "--verify", &format!("{reference}^{{commit}}")],
    )?;
    Ok(output.status.success().then(|| git_stdout(&output)))
}

/// The one shared fetch implementation. An upstream check passes its exact
/// configured fetch refspec so the intended tracking ref is updated. Publish
/// without tracking passes the destination source ref and reads FETCH_HEAD.
pub(crate) fn fetch_remote_target(
    path: &str,
    remote: &str,
    refspec: &str,
) -> Result<String, AppError> {
    validate_remote_name(remote)?;
    if refspec.is_empty() || refspec.starts_with('-') || refspec.chars().any(char::is_control) {
        return Err(AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "The configured remote branch mapping is invalid.",
        ));
    }
    let args = vec![
        "fetch".to_string(),
        "--no-prune".to_string(),
        "--no-prune-tags".to_string(),
        remote.to_string(),
        refspec.to_string(),
    ];
    let output = run_git_networked(path, &args, NETWORK_TIMEOUT)?;
    if output.timed_out {
        return Err(AppError::new(
            AppErrorCode::NetworkTimeout,
            "GitOdrile couldn't reach the remote project in time.",
        )
        .with_remediation("Check your connection and try again."));
    }
    let status = output.status.ok_or_else(|| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdrile couldn't confirm the remote check.",
        )
    })?;
    if !status.success() {
        return Err(classify_remote_failure(&output.stderr));
    }
    checked_git_stdout(run_git(path, &["rev-parse", "FETCH_HEAD"])?)
}

fn relation_state(relation: &SyncRelation) -> TeamSyncState {
    match (relation.ahead, relation.behind) {
        (0, 0) => TeamSyncState::UpToDate,
        (_, 0) => TeamSyncState::Ahead,
        (0, _) => TeamSyncState::Behind,
        _ => TeamSyncState::Diverged,
    }
}

fn actions_for(state: TeamSyncState, knowledge: SyncKnowledge) -> Vec<SyncNextAction> {
    let mut actions = match state {
        TeamSyncState::Ahead => vec![SyncNextAction::PublishChanges],
        TeamSyncState::Behind => vec![SyncNextAction::ReviewAndGet],
        _ => Vec::new(),
    };
    if knowledge == SyncKnowledge::Cached
        || matches!(
            state,
            TeamSyncState::UpToDate
                | TeamSyncState::Unknown
                | TeamSyncState::NoRemote
                | TeamSyncState::NoUpstream
        )
    {
        actions.push(SyncNextAction::CheckAgain);
    }
    actions
}

fn compute_team_sync_state_token(
    repository_identity: &str,
    session_epoch: &str,
    branch: Option<&str>,
    local_commit: Option<&str>,
    target: Option<&ResolvedUpstream>,
    remote_commit: Option<&str>,
) -> String {
    use std::hash::{Hash, Hasher};
    let fingerprint = format!(
        "repository:{repository_identity}|epoch:{session_epoch}|branch:{}|local:{}|remote:{}|destination:{}|tracking:{}|remote_commit:{}|",
        branch.unwrap_or("none"),
        local_commit.unwrap_or("none"),
        target.map(|value| value.remote.as_str()).unwrap_or("none"),
        target
            .map(|value| value.destination_branch.as_str())
            .unwrap_or("none"),
        target
            .map(|value| value.tracking_ref.as_str())
            .unwrap_or("none"),
        remote_commit.unwrap_or("none")
    );
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    fingerprint.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn base_status(
    repository_identity: &str,
    session_epoch: &str,
    state: TeamSyncState,
    branch: Option<String>,
    local_commit: Option<String>,
    knowledge: SyncKnowledge,
) -> TeamSyncStatus {
    TeamSyncStatus {
        state,
        local_branch: branch.clone(),
        local_commit: local_commit.clone(),
        upstream_remote: None,
        destination_branch: None,
        tracking_ref: None,
        remote_commit: None,
        ahead: 0,
        behind: 0,
        knowledge,
        checked_at: None,
        warnings: Vec::new(),
        next_actions: actions_for(state, knowledge),
        state_token: compute_team_sync_state_token(
            repository_identity,
            session_epoch,
            branch.as_deref(),
            local_commit.as_deref(),
            None,
            None,
        ),
    }
}

fn read_team_sync_status_inner(
    path: &str,
    session_epoch: &str,
    knowledge: SyncKnowledge,
    perform_fetch: bool,
    repository_identity: &str,
) -> Result<TeamSyncStatus, AppError> {
    let working = read_working_tree_status(path.to_string())?;
    let branch = working.upstream.branch.clone();
    let (head_state, local_commit) = resolve_head_state(path, branch.clone())?;
    // Until an actual fetch and ancestry comparison succeeds, the answer is
    // local knowledge even when reached from the explicit check command.
    let local_knowledge = SyncKnowledge::Cached;
    if head_state == HeadState::Detached {
        return Ok(base_status(
            repository_identity,
            session_epoch,
            TeamSyncState::Detached,
            None,
            local_commit,
            local_knowledge,
        ));
    }
    if head_state == HeadState::Unborn {
        return Ok(base_status(
            repository_identity,
            session_epoch,
            TeamSyncState::Unborn,
            branch,
            None,
            local_knowledge,
        ));
    }
    let branch = branch.expect("a named non-detached head has a branch");
    let local_commit = local_commit.expect("a non-unborn head has a commit");
    let remotes = list_configured_remotes(path)?;
    if remotes.is_empty() {
        return Ok(base_status(
            repository_identity,
            session_epoch,
            TeamSyncState::NoRemote,
            Some(branch),
            Some(local_commit),
            local_knowledge,
        ));
    }
    let Some(target) = resolve_upstream(path, &branch, &remotes)? else {
        return Ok(base_status(
            repository_identity,
            session_epoch,
            TeamSyncState::NoUpstream,
            Some(branch),
            Some(local_commit),
            local_knowledge,
        ));
    };

    let fetched_commit = if perform_fetch {
        Some(fetch_remote_target(
            path,
            &target.remote,
            &target.fetch_refspec,
        )?)
    } else {
        None
    };
    let remote_commit = match resolve_commit(path, &target.tracking_ref)? {
        Some(commit) => Some(commit),
        None => fetched_commit,
    };
    let mut warnings = Vec::new();
    let (state, relation) = if let Some(remote_commit) = remote_commit.as_deref() {
        let relation = classify_sync(path, &local_commit, Some(remote_commit))?;
        (relation_state(&relation), relation)
    } else {
        warnings.push(SyncWarning {
            code: "trackingRefUnavailable".to_string(),
            message: "The configured team version has not been recorded locally yet.".to_string(),
        });
        (
            TeamSyncState::Unknown,
            SyncRelation {
                ahead: 0,
                behind: 0,
                diverged: false,
            },
        )
    };
    warnings.truncate(MAX_WARNINGS);
    let checked_at = perform_fetch.then(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64
    });
    Ok(TeamSyncStatus {
        state,
        local_branch: Some(branch.clone()),
        local_commit: Some(local_commit.clone()),
        upstream_remote: Some(target.remote.clone()),
        destination_branch: Some(target.destination_branch.clone()),
        tracking_ref: Some(target.tracking_ref.clone()),
        remote_commit: remote_commit.clone(),
        ahead: relation.ahead,
        behind: relation.behind,
        knowledge,
        checked_at,
        warnings,
        next_actions: actions_for(state, knowledge),
        state_token: compute_team_sync_state_token(
            repository_identity,
            session_epoch,
            Some(&branch),
            Some(&local_commit),
            Some(&target),
            remote_commit.as_deref(),
        ),
    })
}

pub(crate) fn read_team_sync_status(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_team_sync_status", None)?;
    let identity = repository.common_git_dir.match_key().to_string();
    read_team_sync_status_inner(
        &path,
        &session_epoch,
        SyncKnowledge::Cached,
        false,
        &identity,
    )
}

pub(crate) fn check_team_changes(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "check_team_changes", None)?;
    let identity = repository.common_git_dir.match_key().to_string();
    read_team_sync_status_inner(&path, &session_epoch, SyncKnowledge::Fresh, true, &identity)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetch_refspec_mapping_is_exact_and_wildcard_aware() {
        assert_eq!(
            map_fetch_refspec(
                "+refs/heads/*:refs/remotes/team/*",
                "refs/heads/feature/niño"
            ),
            Some("refs/remotes/team/feature/niño".to_string())
        );
        assert_eq!(
            map_fetch_refspec(
                "refs/heads/main:refs/remotes/review/main",
                "refs/heads/main"
            ),
            Some("refs/remotes/review/main".to_string())
        );
        assert_eq!(
            map_fetch_refspec("^refs/heads/private", "refs/heads/private"),
            None
        );
    }

    #[test]
    fn display_redaction_handles_supported_and_malformed_remote_forms() {
        assert_eq!(
            redact_remote_url("https://alice:secret@example.test/repo.git?token=abc#fragment"),
            "https://example.test/repo.git"
        );
        assert_eq!(
            redact_remote_url("ssh://key@example.test/repo.git#private"),
            "ssh://example.test/repo.git"
        );
        assert_eq!(
            redact_remote_url("git@example.test:org/répô.git"),
            "git@example.test:org/répô.git"
        );
        assert_eq!(
            redact_remote_url("file:///tmp/repo.git?credential=hidden"),
            "file:///tmp/repo.git"
        );
        assert_eq!(
            redact_remote_url("C:/repos/local.git#token"),
            "C:/repos/local.git"
        );
    }

    #[test]
    fn remote_failure_classification_is_bounded_and_secret_safe() {
        let auth = classify_remote_failure(
            "fatal: Authentication failed for https://user:secret@example.test/a?token=x",
        );
        assert_eq!(auth.code, AppErrorCode::AuthenticationFailed);
        let detail = auth.detail.unwrap_or_default();
        assert!(!detail.contains("secret"));
        assert!(!detail.contains("token"));
        assert_eq!(
            classify_remote_failure("fatal: couldn't find remote ref main").code,
            AppErrorCode::RemoteRefMissing
        );
    }

    #[test]
    fn relation_state_covers_all_ancestry_outcomes() {
        let state = |ahead, behind| {
            relation_state(&SyncRelation {
                ahead,
                behind,
                diverged: ahead > 0 && behind > 0,
            })
        };
        assert_eq!(state(0, 0), TeamSyncState::UpToDate);
        assert_eq!(state(2, 0), TeamSyncState::Ahead);
        assert_eq!(state(0, 3), TeamSyncState::Behind);
        assert_eq!(state(1, 1), TeamSyncState::Diverged);
    }

    #[test]
    fn a_fresh_up_to_date_result_can_always_be_checked_again() {
        assert_eq!(
            actions_for(TeamSyncState::UpToDate, SyncKnowledge::Fresh),
            vec![SyncNextAction::CheckAgain]
        );
    }

    #[test]
    fn status_token_changes_with_epoch_target_and_observed_remote_commit() {
        let target = ResolvedUpstream {
            remote: "origin".to_string(),
            destination_branch: "main".to_string(),
            tracking_ref: "refs/remotes/origin/main".to_string(),
            fetch_refspec: "+refs/heads/*:refs/remotes/origin/*".to_string(),
        };
        let first = compute_team_sync_state_token(
            "repo",
            "epoch-a",
            Some("main"),
            Some("aaa"),
            Some(&target),
            Some("bbb"),
        );
        assert_ne!(
            first,
            compute_team_sync_state_token(
                "repo",
                "epoch-b",
                Some("main"),
                Some("aaa"),
                Some(&target),
                Some("bbb"),
            )
        );
        assert_ne!(
            first,
            compute_team_sync_state_token(
                "repo",
                "epoch-a",
                Some("main"),
                Some("aaa"),
                Some(&target),
                Some("ccc"),
            )
        );
    }
}

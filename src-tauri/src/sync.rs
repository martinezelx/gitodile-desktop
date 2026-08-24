//! Provider-neutral remote knowledge and team-sync status.
//!
//! This domain owns configured remotes, upstream resolution, bounded network
//! Git execution, privacy-safe diagnostics and ancestry classification. It is
//! shared by the explicit team check and Publish; it never chooses an inbound
//! target for a branch without an upstream.

use crate::application;
use crate::changes::validate_repo_relative_path;
use crate::error::{AppError, AppErrorCode};
use crate::git;
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
use std::process::ExitStatus;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub(crate) const NETWORK_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_WARNINGS: usize = 4;
pub(crate) const MAX_INCOMING_VERSIONS: usize = 25;
pub(crate) const MAX_INCOMING_FILES: usize = 100;

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteInfo {
    pub(crate) name: String,
    /// Presentation-only value. The raw configured URL never crosses IPC.
    pub(crate) url: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ConfiguredRemote {
    info: RemoteInfo,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteDiscovery {
    pub(crate) remotes: Vec<RemoteInfo>,
    pub(crate) branch: Option<String>,
    pub(crate) upstream: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ConnectRemoteCredentialExpectation {
    None,
    GitCredentialHelper,
    SshAgentOrKey,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectRemotePlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) requires_confirmation: bool,
    pub(crate) project_id: String,
    pub(crate) session_epoch: String,
    pub(crate) state_token: String,
    pub(crate) remote_name: String,
    /// Rust-redacted display values. User-info, query and fragment never cross IPC.
    pub(crate) fetch_url_display: String,
    pub(crate) push_url_display: String,
    pub(crate) credential_expectation: ConnectRemoteCredentialExpectation,
    pub(crate) contacts_network: bool,
    pub(crate) future_network_access: bool,
    pub(crate) changes_remote: bool,
    pub(crate) preserves_existing_config: bool,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectRemoteResult {
    pub(crate) project_id: String,
    pub(crate) session_epoch: String,
    pub(crate) remote_name: String,
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
pub(crate) struct ResolvedUpstream {
    pub(crate) remote: String,
    pub(crate) destination_branch: String,
    pub(crate) tracking_ref: String,
    fetch_refspec: String,
}

#[derive(Debug, Clone)]
struct NormalizedConnectionUrl {
    persisted: String,
    safe_display: String,
    credential_expectation: ConnectRemoteCredentialExpectation,
    contacts_network: bool,
}

fn connect_remote_error(code: AppErrorCode, message: &str, remediation: &str) -> AppError {
    AppError::new(code, message).with_remediation(remediation)
}

fn normalize_connection_url(raw: &str) -> Result<NormalizedConnectionUrl, AppError> {
    let raw = raw.trim();
    if raw.is_empty() || raw.chars().any(char::is_control) {
        return Err(connect_remote_error(
            AppErrorCode::InvalidRemoteUrl,
            "Enter a complete remote Git URL.",
            "Use an HTTPS, SSH, Git, or file URL.",
        ));
    }
    let without_suffix = raw.split(['?', '#']).next().unwrap_or_default();
    if let Some((raw_scheme, rest)) = without_suffix.split_once("://") {
        let scheme = raw_scheme.to_ascii_lowercase();
        if !matches!(scheme.as_str(), "https" | "ssh" | "git" | "file") {
            return Err(connect_remote_error(
                AppErrorCode::InvalidRemoteUrl,
                "That remote protocol isn't supported.",
                "Use an HTTPS, SSH, Git, or file URL.",
            ));
        }
        let authority_end = rest.find('/').unwrap_or(rest.len());
        let authority = &rest[..authority_end];
        let remote_path = &rest[authority_end..];
        if scheme != "file" && authority.is_empty() {
            return Err(connect_remote_error(
                AppErrorCode::InvalidRemoteUrl,
                "The remote URL has no host.",
                "Enter a complete remote Git URL.",
            ));
        }
        if remote_path.trim_matches('/').is_empty() {
            return Err(connect_remote_error(
                AppErrorCode::InvalidRemoteUrl,
                "The remote URL has no project path.",
                "Enter a URL that identifies a Git repository.",
            ));
        }
        let (safe_authority, persisted_authority) = match authority.rsplit_once('@') {
            Some((userinfo, host)) if !host.is_empty() => {
                let persisted = if scheme == "ssh" {
                    let username = userinfo.split(':').next().unwrap_or_default();
                    if username.is_empty() {
                        host.to_string()
                    } else {
                        format!("{username}@{host}")
                    }
                } else {
                    host.to_string()
                };
                (host.to_string(), persisted)
            }
            Some(_) => {
                return Err(connect_remote_error(
                    AppErrorCode::InvalidRemoteUrl,
                    "The remote URL has no host.",
                    "Enter a complete remote Git URL.",
                ))
            }
            None => (authority.to_string(), authority.to_string()),
        };
        return Ok(NormalizedConnectionUrl {
            persisted: format!("{scheme}://{persisted_authority}{remote_path}"),
            safe_display: format!("{scheme}://{safe_authority}{remote_path}"),
            credential_expectation: match scheme.as_str() {
                "https" => ConnectRemoteCredentialExpectation::GitCredentialHelper,
                "ssh" => ConnectRemoteCredentialExpectation::SshAgentOrKey,
                _ => ConnectRemoteCredentialExpectation::None,
            },
            contacts_network: scheme != "file"
                || (!authority.is_empty() && !authority.eq_ignore_ascii_case("localhost")),
        });
    }

    let looks_like_windows_drive = raw.as_bytes().get(1) == Some(&b':')
        && raw.as_bytes().first().is_some_and(u8::is_ascii_alphabetic);
    if !looks_like_windows_drive {
        if let Some((authority, remote_path)) = without_suffix.split_once(':') {
            let recognizable_ssh_location = authority.contains('@')
                || authority.contains('.')
                || authority.eq_ignore_ascii_case("localhost")
                || remote_path.contains('/');
            if recognizable_ssh_location
                && !authority.is_empty()
                && !remote_path.is_empty()
                && !authority.contains(['/', '\\'])
            {
                let (persisted_authority, host) = authority.rsplit_once('@').map_or_else(
                    || (authority.to_string(), authority),
                    |(userinfo, host)| {
                        let username = userinfo.split(':').next().unwrap_or_default();
                        let persisted = if username.is_empty() {
                            host.to_string()
                        } else {
                            format!("{username}@{host}")
                        };
                        (persisted, host)
                    },
                );
                if host.is_empty() {
                    return Err(connect_remote_error(
                        AppErrorCode::InvalidRemoteUrl,
                        "The SSH remote has no host.",
                        "Enter a complete SSH Git location.",
                    ));
                }
                return Ok(NormalizedConnectionUrl {
                    persisted: format!("{persisted_authority}:{remote_path}"),
                    safe_display: format!("{host}:{remote_path}"),
                    credential_expectation: ConnectRemoteCredentialExpectation::SshAgentOrKey,
                    contacts_network: true,
                });
            }
        }
    }
    Err(connect_remote_error(
        AppErrorCode::InvalidRemoteUrl,
        "That value isn't a supported remote Git URL.",
        "Use an HTTPS, SSH, Git, file, or SCP-like SSH URL.",
    ))
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

pub(crate) fn list_configured_remotes(path: &str) -> Result<Vec<ConfiguredRemote>, AppError> {
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

fn validate_new_remote_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 80
        || name.starts_with(['-', '.'])
        || name.ends_with('.')
        || name == ".."
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(connect_remote_error(
            AppErrorCode::InvalidRemoteConfiguration,
            "That remote name isn't safe.",
            "Use letters, numbers, dots, dashes, or underscores; origin is the usual name.",
        ));
    }
    Ok(name.to_string())
}

fn local_remote_config_snapshot(path: &str) -> Result<Vec<u8>, AppError> {
    let output = run_git(
        path,
        &["config", "--local", "--null", "--get-regexp", "^remote\\."],
    )?;
    if output.status.success() || output.status.code() == Some(1) {
        Ok(output.stdout)
    } else {
        Err(connect_remote_error(
            AppErrorCode::InvalidRemoteConfiguration,
            "GitOdrile couldn't inspect the project's existing remote configuration.",
            "Check .git/config and try again.",
        ))
    }
}

fn configured_remote_names(path: &str) -> Result<Vec<String>, AppError> {
    let output = run_git(path, &["remote"])?;
    if !output.status.success() {
        return Err(connect_remote_error(
            AppErrorCode::InvalidRemoteConfiguration,
            "GitOdrile couldn't inspect this project's remotes.",
            "Check the repository configuration and try again.",
        ));
    }
    Ok(git_stdout(&output)
        .lines()
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .collect())
}

#[derive(Debug)]
struct ValidatedConnectRemote {
    remote_name: String,
    url: NormalizedConnectionUrl,
    state_token: String,
}

fn validate_connect_remote(
    path: &str,
    session_epoch: &str,
    repository_identity: &str,
    remote_name: &str,
    remote_url: &str,
) -> Result<ValidatedConnectRemote, AppError> {
    let remote_name = validate_new_remote_name(remote_name)?;
    let url = normalize_connection_url(remote_url)?;
    let names = configured_remote_names(path)?;
    if names
        .iter()
        .any(|name| name.eq_ignore_ascii_case(&remote_name))
    {
        return Err(connect_remote_error(
            AppErrorCode::RemoteNameExists,
            "A remote with this name already exists or differs only by letter case.",
            "Keep the existing configuration unchanged or choose another remote name.",
        ));
    }
    let snapshot = local_remote_config_snapshot(path)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    repository_identity.hash(&mut hasher);
    session_epoch.hash(&mut hasher);
    remote_name.hash(&mut hasher);
    url.persisted.hash(&mut hasher);
    snapshot.hash(&mut hasher);
    Ok(ValidatedConnectRemote {
        remote_name,
        url,
        state_token: format!("{:016x}", hasher.finish()),
    })
}

pub(crate) fn plan_connect_remote(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
) -> Result<ConnectRemotePlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_connect_remote", None)?;
    let validated = validate_connect_remote(
        &path,
        &session_epoch,
        repository.common_git_dir.match_key(),
        &remote_name,
        &remote_url,
    )?;
    Ok(ConnectRemotePlan {
        operation_kind: OperationKind::LocalMutation,
        requires_confirmation: true,
        project_id: path,
        session_epoch,
        state_token: validated.state_token,
        remote_name: validated.remote_name,
        fetch_url_display: validated.url.safe_display.clone(),
        push_url_display: validated.url.safe_display,
        credential_expectation: validated.url.credential_expectation,
        contacts_network: false,
        future_network_access: validated.url.contacts_network,
        changes_remote: false,
        preserves_existing_config: true,
    })
}

pub(crate) fn connect_remote(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
    state_token: String,
) -> Result<ConnectRemoteResult, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "connect_remote", None)?;
    let validated = validate_connect_remote(
        &path,
        &session_epoch,
        repository.common_git_dir.match_key(),
        &remote_name,
        &remote_url,
    )?;
    if validated.state_token != state_token {
        return Err(connect_remote_error(
            AppErrorCode::StaleConnectRemotePlan,
            "The project, remote name, or URL changed after the preview.",
            "Review the remote connection again.",
        ));
    }
    let added = run_git(
        &path,
        &[
            "remote",
            "add",
            &validated.remote_name,
            &validated.url.persisted,
        ],
    )?;
    if !added.status.success() {
        return Err(connect_remote_error(
            AppErrorCode::RemoteConnectFailed,
            "Git could not add this remote configuration.",
            "No network request was made. Check .git/config and review the connection again.",
        ));
    }
    let key = format!("remote.{}.url", validated.remote_name);
    let observed = run_git(&path, &["config", "--local", "--get-all", &key])?;
    let observed_text = git_stdout(&observed);
    let observed_urls: Vec<_> = observed_text.lines().collect();
    if !observed.status.success() || observed_urls != [validated.url.persisted.as_str()] {
        return Err(connect_remote_error(
            AppErrorCode::RemoteConnectUncertain,
            "Git added remote configuration, but GitOdrile could not verify its exact URL.",
            "Inspect .git/config before editing or retrying this remote. GitOdrile did not contact the network.",
        ));
    }
    Ok(ConnectRemoteResult {
        project_id: path,
        session_epoch,
        remote_name: validated.remote_name,
    })
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

pub(crate) fn resolve_upstream(
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

pub(crate) fn resolve_commit(path: &str, reference: &str) -> Result<Option<String>, AppError> {
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
                            "GitOdrile couldn't read a changed symbolic link safely.",
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
                        "GitOdrile couldn't read a changed file safely.",
                    )
                })?;
                let mut buffer = [0_u8; 64 * 1024];
                loop {
                    let read = file.read(&mut buffer).map_err(|_| {
                        AppError::new(
                            AppErrorCode::GitCommandFailed,
                            "GitOdrile couldn't finish reading a changed file safely.",
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
                    "Save or move that path outside GitOdrile, then review the team update again.",
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                "absent".hash(&mut hasher);
            }
            Err(_) => {
                return Err(AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "GitOdrile couldn't inspect a changed path safely.",
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
                "This project contains a path GitOdrile can't compare safely.",
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
                    "This project contains a path GitOdrile can't compare safely.",
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
            "GitOdrile couldn't prove that every prepared or unsaved change is outside the bounded incoming file list.",
        )
        .with_remediation(
            "Save or move tracked changes outside the project, then review the team update again.",
        ));
    }
    if impact.is_truncated && (!safety.untracked.is_empty() || !safety.ignored.is_empty()) {
        return Err(AppError::new(
            AppErrorCode::IncomingPathCollision,
            "GitOdrile couldn't prove that every local untracked or ignored path is outside the bounded incoming file list.",
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
}

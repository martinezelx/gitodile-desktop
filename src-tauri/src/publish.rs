use crate::application;
use crate::changes::validate_commit_ish;
use crate::error::{AppError, AppErrorCode};
use crate::git;
use crate::git_command::{checked_git_stdout, git_stdout, run_git};
use crate::operation::{truncate_detail, OperationKind};
use crate::repository::{resolve_head_state, validate_branch_ref_name, HeadState};
use crate::status::{git_log_summaries, read_working_tree_status, SavedVersionSummary};
use std::{path::Path, process::ExitStatus, time::Duration};

// ---- Publish planning and execution (task 011) ----
//
// Mirrors the save-version split: a read-only discovery/plan half and a
// narrow execution half, sharing one validation core the same way
// `validate_and_prepare_save` avoids double-spawning Git for save-version.
// Unlike save-version, `git push` never touches the index or working tree,
// so none of the temporary-index machinery applies here.

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteInfo {
    pub(crate) name: String,
    /// Embedded credentials (`user:pass@`/token-in-URL) are stripped before
    /// this ever leaves Rust; nothing upstream of this struct should see them.
    pub(crate) url: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishTarget {
    pub(crate) remote: String,
    pub(crate) destination_branch: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteDiscovery {
    pub(crate) remotes: Vec<RemoteInfo>,
    pub(crate) branch: Option<String>,
    /// The full `remote/branch` tracking ref, when one is configured.
    pub(crate) upstream: Option<String>,
}

/// Strips embedded credentials (`user:pass@host`, `token@host`) from a remote
/// URL before it's ever serialized to the frontend. SSH's `user@host:path`
/// shorthand has no `://` and is left untouched — the account name there
/// isn't a secret the way an embedded password or token is.
pub(crate) fn redact_remote_url(url: &str) -> String {
    let Some(scheme_end) = url.find("://") else {
        return url.to_string();
    };
    let (scheme, rest) = url.split_at(scheme_end + 3);
    let authority_end = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    let redacted = match authority.rfind('@') {
        Some(at_pos) => format!("{scheme}{}", &rest[at_pos + 1..]),
        None => url.to_string(),
    };
    // Query strings and fragments are presentation-irrelevant and may carry
    // access tokens in signed HTTPS remote URLs.
    redacted
        .split(['?', '#'])
        .next()
        .unwrap_or(&redacted)
        .to_string()
}

/// Parses `git remote -v` output (`name\turl (fetch|push)`), keeping only
/// the fetch URL per remote (push and fetch URLs are normally identical, and
/// the UI only needs one representative value).
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

fn list_remotes(path: &str) -> Result<Vec<RemoteInfo>, AppError> {
    let output = checked_git_stdout(run_git(path, &["remote", "-v"])?)?;
    Ok(parse_remote_v_output(&output))
}

pub(crate) fn discover_remotes(path: String) -> Result<RemoteDiscovery, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "discover_remotes", None)?;
    let status = read_working_tree_status(path.clone())?;
    let remotes = list_remotes(&path)?;
    Ok(RemoteDiscovery {
        remotes,
        branch: status.upstream.branch,
        upstream: status.upstream.upstream,
    })
}

/// Remote selection rules from task 011: an explicit request always wins (if
/// it names a configured remote); otherwise the configured upstream's remote
/// wins; otherwise exactly one remote can be proposed; two or more remotes
/// with no upstream require the user to choose.
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

fn destination_for_remote(upstream: Option<&str>, remote: &str, local_branch: &str) -> String {
    upstream
        .and_then(|upstream| upstream.strip_prefix(&format!("{remote}/")))
        .filter(|branch| !branch.is_empty())
        .unwrap_or(local_branch)
        .to_string()
}

/// How long GitOdrile waits on a single network-touching Git call (`fetch` or
/// `push`) before treating it as timed out. There is no existing timeout
/// primitive for `git` calls anywhere else in the file to reuse — only the
/// Windows-only winget update-check loop follows this spawn/poll/kill shape.
const NETWORK_TIMEOUT: Duration = Duration::from_secs(30);

struct NetworkOutput {
    /// `None` only when the process was killed after timing out.
    status: Option<ExitStatus>,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

/// Runs a network-touching Git command (`fetch`/`push`) with a wall-clock
/// timeout, following the same spawn -> poll `try_wait` -> kill-on-timeout
/// shape as `run_winget_update_check`. `GIT_TERMINAL_PROMPT=0` makes Git fail
/// fast instead of blocking forever on a terminal credential prompt GitOdrile
/// (a GUI app with no TTY) could never answer; real credential helpers (Git
/// Credential Manager, the macOS/GNOME keychains, SSH agents/askpass) run as
/// separate processes and are unaffected by this setting.
fn run_git_networked(
    repo_path: &str,
    args: &[&str],
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
        Err(error) => Err(error),
    }
}

fn looks_like_authentication_failure(stderr_lower: &str) -> bool {
    stderr_lower.contains("authentication failed")
        || stderr_lower.contains("could not read username")
        || stderr_lower.contains("could not read password")
        || stderr_lower.contains("permission denied (publickey")
        || stderr_lower.contains("terminal prompts disabled")
        || stderr_lower.contains("403")
        || stderr_lower.contains("401")
}

fn looks_like_missing_remote_ref(stderr_lower: &str) -> bool {
    stderr_lower.contains("couldn't find remote ref")
        || stderr_lower.contains("couldn't find remote branch")
}

/// `git rev-list --left-right --count local...remote` reports ahead/behind as
/// two tab-separated counts in one call; a diverged history is simply both
/// counts being nonzero.
fn classify_sync(
    path: &str,
    local_sha: &str,
    remote_sha: Option<&str>,
) -> Result<(u32, u32, bool), AppError> {
    let Some(remote_sha) = remote_sha else {
        return Ok((0, 0, false));
    };
    let range = format!("{local_sha}...{remote_sha}");
    let output = checked_git_stdout(run_git(
        path,
        &["rev-list", "--left-right", "--count", &range],
    )?)?;
    let mut parts = output.split_whitespace();
    let ahead: u32 = parts
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let behind: u32 = parts
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    Ok((ahead, behind, ahead > 0 && behind > 0))
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    /// Opaque fingerprint of local + freshly observed remote state. Execution
    /// must refuse to proceed if a freshly computed token no longer matches.
    pub(crate) state_token: String,
    pub(crate) target: PublishTarget,
    pub(crate) local_branch: String,
    pub(crate) will_create_upstream: bool,
    pub(crate) commit_count: u32,
    pub(crate) commit_summary: Vec<SavedVersionSummary>,
    pub(crate) has_unsaved_files: bool,
    /// How many more pending saved versions (newer than what this plan
    /// covers) would still remain unpublished after it — always `0` unless
    /// `upTo` was requested and it isn't the newest pending version.
    pub(crate) remaining_after_publish: u32,
    pub(crate) remaining_commit_summary: Vec<SavedVersionSummary>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishResult {
    pub(crate) target: PublishTarget,
    pub(crate) local_branch: String,
    pub(crate) previous_remote_commit: Option<String>,
    pub(crate) published_commit: String,
    pub(crate) published_count: u32,
    pub(crate) created_upstream: bool,
    pub(crate) remaining_after_publish: u32,
}

/// Everything a fresh plan/execution pass needs, produced by exactly one
/// fetch preflight — the same "shared validation core, called once per
/// command" shape as `ValidatedSave`. Unlike save-version, `plan_publish` and
/// `publish` are each expected to run their *own* independent fetch (the
/// whole point of "revalidate immediately before push" is that time passes
/// while the user reads the confirmation), so this isn't shared across the
/// two commands the way the temporary index is for save-version — only
/// within a single command's own call.
struct ValidatedPublish {
    target: PublishTarget,
    local_branch: String,
    /// The commit that will actually be pushed: `HEAD` normally, or a
    /// specific ancestor of `HEAD` when `upTo` narrowed the publish to a
    /// checkpoint. Publishing a specific ancestor is always a fast-forward
    /// for the remote (never a force-push) — it just means later local
    /// commits stay unpublished for now.
    target_sha: String,
    remote_sha: Option<String>,
    will_create_upstream: bool,
    commit_count: u32,
    remaining_after_publish: u32,
    has_unsaved_files: bool,
    state_token: String,
}

/// Validates and resolves an explicit `upTo` request: it must name a real
/// commit, that commit must be an ancestor of (or equal to) `HEAD` — GitOdrile
/// never publishes something outside this version line's own history — and it
/// must not already be reachable from the remote's last known position, or
/// there would be nothing new to send.
fn resolve_up_to_target(
    path: &str,
    up_to: &str,
    local_sha: &str,
    remote_sha: Option<&str>,
) -> Result<String, AppError> {
    validate_commit_ish(up_to)?;
    let rev_output = run_git(
        path,
        &["rev-parse", "--verify", &format!("{up_to}^{{commit}}")],
    )?;
    if !rev_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version couldn't be identified.",
        ));
    }
    let resolved = git_stdout(&rev_output);

    let is_ancestor_of_head =
        run_git(path, &["merge-base", "--is-ancestor", &resolved, local_sha])?;
    if !is_ancestor_of_head.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version isn't part of this version line anymore.",
        )
        .with_remediation("Refresh and try again."));
    }

    if let Some(remote_sha) = remote_sha {
        let already_published = run_git(
            path,
            &["merge-base", "--is-ancestor", &resolved, remote_sha],
        )?;
        if already_published.status.success() {
            return Err(AppError::new(
                AppErrorCode::NothingToPublish,
                "That saved version is already published.",
            ));
        }
    }

    Ok(resolved)
}

pub(crate) fn compute_publish_state_token(
    local_sha: &str,
    target: &PublishTarget,
    remote_sha: Option<&str>,
    branch: &str,
    has_unsaved_files: bool,
) -> String {
    use std::hash::{Hash, Hasher};
    let fingerprint = format!(
        "local:{local_sha}|remote:{}|destination:{}|remote_sha:{}|branch:{branch}|unsaved:{has_unsaved_files}|",
        target.remote,
        target.destination_branch,
        remote_sha.unwrap_or("none")
    );
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    fingerprint.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn validate_and_prepare_publish(
    path: &str,
    requested_remote: Option<String>,
    up_to: Option<String>,
) -> Result<ValidatedPublish, AppError> {
    let status = read_working_tree_status(path.to_string())?;
    let branch = status.upstream.branch.clone();
    let (head_state, head_sha) = resolve_head_state(path, branch.clone())?;

    if head_state == HeadState::Detached {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a version line right now.",
        )
        .with_remediation("Switch to a version line before publishing."));
    }
    if head_state == HeadState::Unborn {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "There's no saved version on this version line yet.",
        )
        .with_remediation("Save a version first, then publish it."));
    }
    let local_branch = branch.expect("a non-detached, non-unborn head has a branch name");
    let local_sha = head_sha.expect("a non-unborn head has a commit");
    validate_branch_ref_name(path, &local_branch)?;

    let remotes = list_remotes(path)?;
    let remote = resolve_remote_selection(
        &remotes,
        status.upstream.upstream.as_deref(),
        requested_remote.as_deref(),
    )?;
    validate_remote_name(&remote)?;
    let destination_branch =
        destination_for_remote(status.upstream.upstream.as_deref(), &remote, &local_branch);
    validate_branch_ref_name(path, &destination_branch)?;
    let target = PublishTarget {
        remote,
        destination_branch,
    };
    let configured_target = format!("{}/{}", target.remote, target.destination_branch);
    let will_create_upstream = status.upstream.upstream.as_deref() != Some(&configured_target);

    let fetch = run_git_networked(
        path,
        &["fetch", &target.remote, &target.destination_branch],
        NETWORK_TIMEOUT,
    )?;
    if fetch.timed_out {
        return Err(AppError::new(
            AppErrorCode::NetworkTimeout,
            "GitOdrile couldn't reach the remote project in time.",
        )
        .with_remediation("Check your connection and try again."));
    }
    let fetch_succeeded = fetch.status.map(|status| status.success()).unwrap_or(false);
    let remote_sha = if fetch_succeeded {
        Some(checked_git_stdout(run_git(
            path,
            &["rev-parse", "FETCH_HEAD"],
        )?)?)
    } else {
        let stderr_lower = fetch.stderr.to_lowercase();
        if looks_like_missing_remote_ref(&stderr_lower) {
            None
        } else if looks_like_authentication_failure(&stderr_lower) {
            return Err(AppError::new(
                AppErrorCode::AuthenticationFailed,
                "GitOdrile couldn't sign in to the remote project.",
            )
            .with_remediation("Check your Git credentials for this remote, then try again.")
            .with_detail(truncate_detail(&fetch.stderr)));
        } else {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "GitOdrile couldn't check the remote project's latest state.",
            )
            .with_remediation("Check your connection and the remote project, then try again.")
            .with_detail(truncate_detail(&fetch.stderr)));
        }
    };

    let (ahead, behind, diverged) = classify_sync(path, &local_sha, remote_sha.as_deref())?;
    if remote_sha.is_some() {
        if diverged {
            return Err(AppError::new(
                AppErrorCode::DivergedHistories,
                "This version line and the remote project have both moved apart.",
            )
            .with_remediation("Get the team's changes first, then publish again."));
        }
        if behind > 0 {
            return Err(AppError::new(
                AppErrorCode::BehindRemote,
                "The remote project has newer versions this project doesn't have yet.",
            )
            .with_remediation("Get the team's changes first, then publish again."));
        }
        if ahead == 0 {
            return Err(AppError::new(
                AppErrorCode::NothingToPublish,
                "Every saved version is already published.",
            ));
        }
    }

    let target_sha = match up_to {
        Some(up_to) => resolve_up_to_target(path, &up_to, &local_sha, remote_sha.as_deref())?,
        None => local_sha.clone(),
    };

    let commit_count = match &remote_sha {
        Some(remote_sha) => checked_git_stdout(run_git(
            path,
            &[
                "rev-list",
                "--count",
                &format!("{remote_sha}..{target_sha}"),
            ],
        )?)?
        .parse()
        .unwrap_or(0),
        None => checked_git_stdout(run_git(path, &["rev-list", "--count", &target_sha])?)?
            .parse()
            .unwrap_or(1),
    };
    let remaining_after_publish = if target_sha == local_sha {
        0
    } else {
        checked_git_stdout(run_git(
            path,
            &["rev-list", "--count", &format!("{target_sha}..{local_sha}")],
        )?)?
        .parse()
        .unwrap_or(0)
    };

    let has_unsaved_files = !status.is_clean;
    let state_token = compute_publish_state_token(
        &target_sha,
        &target,
        remote_sha.as_deref(),
        &local_branch,
        has_unsaved_files,
    );

    Ok(ValidatedPublish {
        target,
        local_branch,
        target_sha,
        remote_sha,
        will_create_upstream,
        commit_count,
        remaining_after_publish,
        has_unsaved_files,
        state_token,
    })
}

fn commit_summary_entries(
    path: &str,
    local_sha: &str,
    remote_sha: Option<&str>,
) -> Vec<SavedVersionSummary> {
    let range = match remote_sha {
        Some(remote_sha) => format!("{remote_sha}..{local_sha}"),
        None => local_sha.to_string(),
    };
    git_log_summaries(path, &range).unwrap_or_default()
}

pub(crate) fn plan_publish(
    path: String,
    remote: Option<String>,
    up_to: Option<String>,
) -> Result<PublishPlan, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "plan_publish", None)?;
    let validated = validate_and_prepare_publish(&path, remote, up_to)?;
    let commit_summary = commit_summary_entries(
        &path,
        &validated.target_sha,
        validated.remote_sha.as_deref(),
    );
    let remaining_commit_summary = if validated.remaining_after_publish > 0 {
        commit_summary_entries(&path, &validated.local_branch, Some(&validated.target_sha))
    } else {
        Vec::new()
    };

    let summary = if validated.remote_sha.is_none() {
        format!(
            "This publishes this version line to \"{}\" for the first time.",
            validated.target.remote
        )
    } else {
        format!(
            "This sends {} saved version(s) to \"{}\".",
            validated.commit_count, validated.target.remote
        )
    };

    let mut steps = vec![format!(
        "Send the confirmed saved versions to \"{}\" ({}).",
        validated.target.remote, validated.target.destination_branch
    )];
    if validated.will_create_upstream {
        steps.push("Set this version line to track the remote branch going forward.".to_string());
    }
    if validated.has_unsaved_files {
        steps.push("Leave unsaved files on this computer only.".to_string());
    }
    if validated.remaining_after_publish > 0 {
        steps.push(format!(
            "Leave {} more saved version(s) unpublished for now.",
            validated.remaining_after_publish
        ));
    }

    let recovery = match &validated.remote_sha {
        Some(sha) => format!(
            "If this needs to be undone, the remote project's previous position ({}) is known.",
            &sha[..sha.len().min(12)]
        ),
        None => {
            "This is the first publish to this remote, so there's no earlier remote position to recover.".to_string()
        }
    };

    Ok(PublishPlan {
        operation_kind: OperationKind::RemoteMutation,
        summary,
        steps,
        risks: vec![
            "Teammates with access to this remote project will be able to see the published history.".to_string(),
        ],
        recovery,
        requires_confirmation: true,
        state_token: validated.state_token,
        target: validated.target,
        local_branch: validated.local_branch.clone(),
        will_create_upstream: validated.will_create_upstream,
        commit_count: validated.commit_count,
        commit_summary,
        has_unsaved_files: validated.has_unsaved_files,
        remaining_after_publish: validated.remaining_after_publish,
        remaining_commit_summary,
    })
}

/// Best-effort classification of a failed `git push`, mirroring
/// `classify_commit_failure`'s approach: Git gives no structured reason for a
/// rejected push beyond porcelain flags and free-text stderr.
pub(crate) fn classify_push_failure(porcelain_stdout: &str, stderr: &str) -> AppError {
    let stderr_lower = stderr.to_lowercase();
    if looks_like_authentication_failure(&stderr_lower) {
        return AppError::new(
            AppErrorCode::AuthenticationFailed,
            "GitOdrile couldn't sign in to the remote project.",
        )
        .with_remediation("Check your Git credentials for this remote, then try again.")
        .with_detail(truncate_detail(stderr));
    }
    if porcelain_stdout.contains("[remote rejected]")
        || stderr_lower.contains("pre-receive")
        || stderr_lower.contains("hook declined")
    {
        return AppError::new(
            AppErrorCode::RemoteRejected,
            "The remote project rejected this publish.",
        )
        .with_remediation("Check the remote project's rules for this branch, then try again.")
        .with_detail(truncate_detail(stderr));
    }
    if porcelain_stdout.contains("[rejected]")
        || stderr_lower.contains("non-fast-forward")
        || stderr_lower.contains("fetch first")
    {
        return AppError::new(
            AppErrorCode::DivergedHistories,
            "The remote project moved since this was checked. GitOdrile never force-publishes.",
        )
        .with_remediation("Get the team's changes first, then publish again.");
    }
    AppError::new(
        AppErrorCode::GitCommandFailed,
        "GitOdrile couldn't publish this version line.",
    )
    .with_remediation("Check your connection and the remote project, then try again.")
    .with_detail(truncate_detail(stderr))
}

fn publish_selection(
    path: String,
    remote: String,
    state_token: String,
    up_to: Option<String>,
) -> Result<PublishResult, AppError> {
    // Revalidates everything (remote choice, local/remote state, ahead/behind,
    // and the `upTo` target if one was requested) against a *fresh* fetch,
    // immediately before mutating anything — the same safety property
    // save-version's execution keeps for the index.
    let validated = validate_and_prepare_publish(&path, Some(remote), up_to)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StalePublishPlan,
            "This project or the remote project changed since the preview was shown.",
        )
        .with_remediation("Review the updated plan, then try publishing again."));
    }

    // The source side is always the resolved commit itself, never a branch
    // name — a raw commit is just as valid there and works identically
    // whether it happens to be the current `HEAD` or an earlier checkpoint,
    // so there is only one code path to reason about instead of two.
    let refspec = format!(
        "{}:refs/heads/{}",
        validated.target_sha, validated.target.destination_branch
    );
    let args: Vec<&str> = vec!["push", "--porcelain", &validated.target.remote, &refspec];

    let result = run_git_networked(&path, &args, NETWORK_TIMEOUT)?;
    if result.timed_out {
        return Err(AppError::new(
            AppErrorCode::PublishUncertain,
            "GitOdrile lost the connection while publishing. It's unknown whether the remote project received it.",
        )
        .with_remediation("Refresh and check whether this version was published before trying again."));
    }
    let status = result.status.ok_or_else(|| {
        AppError::new(
            AppErrorCode::PublishUncertain,
            "GitOdrile couldn't confirm whether this publish finished.",
        )
        .with_remediation(
            "Refresh and check whether this version was published before trying again.",
        )
    })?;
    if !status.success() {
        return Err(classify_push_failure(&result.stdout, &result.stderr));
    }

    // A raw commit source means `git push -u` can't reliably infer which
    // local branch to track, so upstream creation is a separate, explicit
    // step after a successful push rather than a push flag — and its actual
    // success (not just the original intent) is what gets reported.
    let created_upstream = if validated.will_create_upstream {
        let upstream_ref = format!(
            "{}/{}",
            validated.target.remote, validated.target.destination_branch
        );
        run_git(
            &path,
            &[
                "branch",
                "--set-upstream-to",
                &upstream_ref,
                &validated.local_branch,
            ],
        )
        .map(|output| output.status.success())
        .unwrap_or(false)
    } else {
        false
    };

    Ok(PublishResult {
        target: validated.target,
        local_branch: validated.local_branch.clone(),
        previous_remote_commit: validated.remote_sha,
        published_commit: validated.target_sha,
        published_count: validated.commit_count,
        created_upstream,
        remaining_after_publish: validated.remaining_after_publish,
    })
}

pub(crate) fn publish(
    path: String,
    remote: String,
    state_token: String,
    up_to: Option<String>,
) -> Result<PublishResult, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "publish", None)?;
    publish_selection(path, remote, state_token, up_to)
}

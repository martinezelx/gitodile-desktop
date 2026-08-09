#![allow(linker_messages)]

mod application;
#[cfg(test)]
mod architecture;
mod changes;
mod error;
mod git;
mod ipc;
mod repository;
mod repository_access;
mod session;
mod status;
mod watch;

use changes::*;
use repository::*;
use status::*;

use error::{AppError, AppErrorCode};

use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
#[cfg(any(test, target_os = "windows"))]
use std::process::Command;
#[cfg(target_os = "windows")]
use std::process::Stdio;
use std::process::{ExitStatus, Output};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(target_os = "windows")]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

#[cfg(test)]
fn base_git_command() -> Command {
    git::command()
}

#[cfg(test)]
fn git_command(repo_path: &str) -> Command {
    let mut command = base_git_command();
    command.arg("-C").arg(repo_path);
    command
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<Output, AppError> {
    run_git_with_env(repo_path, args, &[])
}

fn run_git_with_env<I, S>(
    repo_path: &str,
    args: I,
    envs: &[(&str, &str)],
) -> Result<Output, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let policy = application::current_policy()
        .unwrap_or_else(|| git::ExecutionPolicy::repository_read("compatibility_git_read"));
    let cancellation = application::current_cancellation();
    let output = git::run_with_env(
        Some(Path::new(repo_path)),
        args,
        envs,
        policy,
        cancellation.as_ref(),
    )?;
    let _diagnostics_were_truncated = output.stderr_truncated;
    Ok(Output {
        status: output.status,
        stdout: output.stdout,
        stderr: output.stderr,
    })
}

fn run_global_git_with_env<I, S>(args: I, envs: &[(&str, &str)]) -> Result<Output, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let policy = application::current_policy()
        .unwrap_or_else(|| git::ExecutionPolicy::repository_read("compatibility_global_git"));
    let cancellation = application::current_cancellation();
    let output = git::run_with_env(None, args, envs, policy, cancellation.as_ref())?;
    Ok(Output {
        status: output.status,
        stdout: output.stdout,
        stderr: output.stderr,
    })
}

struct CappedOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    limit_exceeded: bool,
}

fn run_git_capped(repo_path: &str, args: &[&str], limit: usize) -> Result<CappedOutput, AppError> {
    let mut policy = application::current_policy()
        .unwrap_or_else(|| git::ExecutionPolicy::repository_read("compatibility_capped_git_read"));
    policy.stdout_cap = limit;
    let cancellation = application::current_cancellation();
    let output = git::run(
        Some(Path::new(repo_path)),
        args,
        policy,
        cancellation.as_ref(),
    )?;
    Ok(CappedOutput {
        status: output.status,
        stdout: output.stdout,
        limit_exceeded: output.stdout_truncated,
    })
}

fn git_stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn checked_git_stdout(output: Output) -> Result<String, AppError> {
    if output.status.success() {
        Ok(git_stdout(&output))
    } else {
        Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."))
    }
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct GitDiagnostics {
    state: GitDiagnosticState,
    version: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
enum GitDiagnosticState {
    Available,
    Missing,
    Unusable,
    CheckFailed,
}

enum ProcessAttempt {
    Missing,
    FailedToStart,
    Completed { success: bool, stdout: String },
}

fn parse_git_version(raw_version_output: &str) -> String {
    raw_version_output
        .trim()
        .strip_prefix("git version ")
        .unwrap_or(raw_version_output.trim())
        .to_string()
}

fn git_diagnostics_from_attempt(attempt: ProcessAttempt) -> GitDiagnostics {
    match attempt {
        ProcessAttempt::Completed {
            success: true,
            stdout,
        } => GitDiagnostics {
            state: GitDiagnosticState::Available,
            version: Some(parse_git_version(&stdout)),
        },
        ProcessAttempt::Missing => GitDiagnostics {
            state: GitDiagnosticState::Missing,
            version: None,
        },
        ProcessAttempt::Completed { success: false, .. } => GitDiagnostics {
            state: GitDiagnosticState::Unusable,
            version: None,
        },
        ProcessAttempt::FailedToStart => GitDiagnostics {
            state: GitDiagnosticState::CheckFailed,
            version: None,
        },
    }
}

fn app_status() -> &'static str {
    "GitOdrile is ready"
}

/// The main window starts hidden (see `tauri.conf.json`) so the OS-level
/// window never appears blank while the webview loads and React mounts.
/// The frontend calls this once the first frame has actually painted.
fn show_main_window(window: tauri::Window) {
    if let Some(main) = window.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

fn git_diagnostics() -> GitDiagnostics {
    let _command = application::enter("git_diagnostics");
    let attempt = match run_global_git_with_env(["--version"], &[]) {
        Ok(output) => ProcessAttempt::Completed {
            success: output.status.success(),
            stdout: git_stdout(&output),
        },
        Err(error) if error.code == AppErrorCode::GitMissing => ProcessAttempt::Missing,
        Err(_) => ProcessAttempt::FailedToStart,
    };
    git_diagnostics_from_attempt(attempt)
}

const GIT_WINDOWS_DOWNLOAD_URL: &str = "https://git-scm.com/download/win";
const GIT_MACOS_DOWNLOAD_URL: &str = "https://git-scm.com/download/mac";
const GIT_LINUX_DOWNLOAD_URL: &str = "https://git-scm.com/download/linux";
static INSTALL_STARTING: AtomicBool = AtomicBool::new(false);
static UPDATE_CHECK_RUNNING: AtomicBool = AtomicBool::new(false);
static UPDATE_STARTING: AtomicBool = AtomicBool::new(false);
static UPDATE_CACHE: Mutex<Option<CachedGitUpdate>> = Mutex::new(None);
#[cfg(target_os = "windows")]
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(20);
const UPDATE_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
#[cfg(any(target_os = "windows", test))]
const GIT_UPDATE_CHECK_ARGS: [&str; 7] = [
    "list",
    "--id",
    "Git.Git",
    "-e",
    "--upgrade-available",
    "--accept-source-agreements",
    "--disable-interactivity",
];

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct GitInstallationResult {
    outcome: GitInstallationOutcome,
    platform: GitInstallationPlatform,
    guidance_url: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
enum GitInstallationOutcome {
    Started,
    Guidance,
    AlreadyStarting,
    Failed,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
// Every variant is used in a supported target build, but a single-platform
// clippy run cannot see the constructors behind the other targets' cfgs.
#[allow(dead_code)]
enum GitInstallationPlatform {
    Windows,
    Macos,
    Linux,
    Unsupported,
}

#[derive(Clone, Copy)]
// Every variant is constructed by `spawn_git_installer`, which only exists
// under `#[cfg(target_os = "windows")]`; a single-platform clippy run on
// another target sees none of those constructors.
#[allow(dead_code)]
enum InstallSpawnResult {
    Started,
    Missing,
    Failed,
}

fn installation_result(
    platform: GitInstallationPlatform,
    spawn_result: Option<InstallSpawnResult>,
) -> GitInstallationResult {
    match platform {
        GitInstallationPlatform::Windows => match spawn_result {
            Some(InstallSpawnResult::Started) => GitInstallationResult {
                outcome: GitInstallationOutcome::Started,
                platform,
                guidance_url: None,
            },
            Some(InstallSpawnResult::Missing) => GitInstallationResult {
                outcome: GitInstallationOutcome::Guidance,
                platform,
                guidance_url: Some(GIT_WINDOWS_DOWNLOAD_URL.to_string()),
            },
            Some(InstallSpawnResult::Failed) | None => GitInstallationResult {
                outcome: GitInstallationOutcome::Failed,
                platform,
                guidance_url: Some(GIT_WINDOWS_DOWNLOAD_URL.to_string()),
            },
        },
        GitInstallationPlatform::Macos => GitInstallationResult {
            outcome: GitInstallationOutcome::Guidance,
            platform,
            guidance_url: Some(GIT_MACOS_DOWNLOAD_URL.to_string()),
        },
        GitInstallationPlatform::Linux => GitInstallationResult {
            outcome: GitInstallationOutcome::Guidance,
            platform,
            guidance_url: Some(GIT_LINUX_DOWNLOAD_URL.to_string()),
        },
        GitInstallationPlatform::Unsupported => GitInstallationResult {
            outcome: GitInstallationOutcome::Failed,
            platform,
            guidance_url: None,
        },
    }
}

fn current_installation_platform() -> GitInstallationPlatform {
    #[cfg(target_os = "windows")]
    {
        GitInstallationPlatform::Windows
    }
    #[cfg(target_os = "macos")]
    {
        GitInstallationPlatform::Macos
    }
    #[cfg(target_os = "linux")]
    {
        GitInstallationPlatform::Linux
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        GitInstallationPlatform::Unsupported
    }
}

#[cfg(target_os = "windows")]
fn spawn_git_installer() -> InstallSpawnResult {
    let mut command = Command::new("winget");
    command
        .args([
            "install",
            "--id",
            "Git.Git",
            "-e",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ])
        .creation_flags(CREATE_NEW_CONSOLE);
    match command.spawn() {
        Ok(_) => InstallSpawnResult::Started,
        Err(error) if error.kind() == ErrorKind::NotFound => InstallSpawnResult::Missing,
        Err(_) => InstallSpawnResult::Failed,
    }
}

fn install_git() -> GitInstallationResult {
    let _command = application::enter("install_git");
    if INSTALL_STARTING.swap(true, Ordering::AcqRel) {
        return GitInstallationResult {
            outcome: GitInstallationOutcome::AlreadyStarting,
            platform: current_installation_platform(),
            guidance_url: None,
        };
    }

    let platform = current_installation_platform();
    #[cfg(target_os = "windows")]
    let result = installation_result(platform, Some(spawn_git_installer()));
    #[cfg(not(target_os = "windows"))]
    let result = installation_result(platform, None);

    INSTALL_STARTING.store(false, Ordering::Release);
    result
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct GitUpdateLaunchResult {
    outcome: GitUpdateLaunchOutcome,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
// `Failed` is only constructed by `spawn_git_update`, which only exists
// under `#[cfg(target_os = "windows")]`; a single-platform clippy run on
// another target cannot see that constructor.
#[allow(dead_code)]
enum GitUpdateLaunchOutcome {
    Started,
    AlreadyStarting,
    Unavailable,
    Failed,
}

#[cfg(target_os = "windows")]
fn spawn_git_update() -> GitUpdateLaunchOutcome {
    let mut command = Command::new("winget");
    command
        .args([
            "upgrade",
            "--id",
            "Git.Git",
            "-e",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ])
        .creation_flags(CREATE_NEW_CONSOLE);
    match command.spawn() {
        Ok(_) => GitUpdateLaunchOutcome::Started,
        Err(error) if error.kind() == ErrorKind::NotFound => GitUpdateLaunchOutcome::Unavailable,
        Err(_) => GitUpdateLaunchOutcome::Failed,
    }
}

fn update_git() -> GitUpdateLaunchResult {
    let _command = application::enter("update_git");
    if UPDATE_STARTING.swap(true, Ordering::AcqRel) {
        return GitUpdateLaunchResult {
            outcome: GitUpdateLaunchOutcome::AlreadyStarting,
        };
    }

    #[cfg(target_os = "windows")]
    let outcome = spawn_git_update();
    #[cfg(not(target_os = "windows"))]
    let outcome = GitUpdateLaunchOutcome::Unavailable;

    UPDATE_STARTING.store(false, Ordering::Release);
    if outcome == GitUpdateLaunchOutcome::Started {
        if let Ok(mut cache) = UPDATE_CACHE.lock() {
            *cache = None;
        }
    }
    GitUpdateLaunchResult { outcome }
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
struct GitUpdateStatus {
    state: GitUpdateState,
    cached: bool,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
enum GitUpdateState {
    Checking,
    Unavailable,
    UpToDate,
    UpdateAvailable,
    Failed,
    TimedOut,
}

#[derive(Clone, Copy)]
struct CachedGitUpdate {
    checked_at: Instant,
    state: GitUpdateState,
}

#[allow(dead_code)]
enum UpdateCheckAttempt {
    Unavailable,
    FailedToStart,
    TimedOut,
    Completed { success: bool, output: String },
}

fn update_status_from_attempt(attempt: UpdateCheckAttempt) -> GitUpdateStatus {
    let state = match attempt {
        UpdateCheckAttempt::Unavailable => GitUpdateState::Unavailable,
        UpdateCheckAttempt::FailedToStart => GitUpdateState::Failed,
        UpdateCheckAttempt::TimedOut => GitUpdateState::TimedOut,
        UpdateCheckAttempt::Completed { output, .. } if output.contains("Git.Git") => {
            GitUpdateState::UpdateAvailable
        }
        UpdateCheckAttempt::Completed { success: true, .. } => GitUpdateState::UpToDate,
        UpdateCheckAttempt::Completed { success: false, .. } => GitUpdateState::Failed,
    };
    GitUpdateStatus {
        state,
        cached: false,
    }
}

fn cached_update_status(now: Instant) -> Option<GitUpdateStatus> {
    let cache = UPDATE_CACHE.lock().ok()?;
    let cached = cache.as_ref()?;
    if now.duration_since(cached.checked_at) >= UPDATE_CACHE_TTL {
        return None;
    }
    Some(GitUpdateStatus {
        state: cached.state,
        cached: true,
    })
}

fn cache_update_status(status: GitUpdateStatus, now: Instant) {
    if !matches!(
        status.state,
        GitUpdateState::UpToDate | GitUpdateState::UpdateAvailable
    ) {
        return;
    }
    if let Ok(mut cache) = UPDATE_CACHE.lock() {
        *cache = Some(CachedGitUpdate {
            checked_at: now,
            state: status.state,
        });
    }
}

#[cfg(target_os = "windows")]
fn run_winget_update_check(timeout: Duration) -> UpdateCheckAttempt {
    let mut command = Command::new("winget");
    command
        .args(GIT_UPDATE_CHECK_ARGS)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return UpdateCheckAttempt::Unavailable;
        }
        Err(_) => return UpdateCheckAttempt::FailedToStart,
    };
    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => match child.wait_with_output() {
                Ok(output) => {
                    let text = format!(
                        "{}\n{}",
                        String::from_utf8_lossy(&output.stdout),
                        String::from_utf8_lossy(&output.stderr)
                    );
                    return UpdateCheckAttempt::Completed {
                        success: output.status.success(),
                        output: text,
                    };
                }
                Err(_) => return UpdateCheckAttempt::FailedToStart,
            },
            Ok(None) if started_at.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return UpdateCheckAttempt::TimedOut;
            }
            Err(_) => return UpdateCheckAttempt::FailedToStart,
        }
    }
}

fn check_git_update() -> GitUpdateStatus {
    let _command = application::enter("check_git_update");
    let now = Instant::now();
    if let Some(cached) = cached_update_status(now) {
        return cached;
    }
    if UPDATE_CHECK_RUNNING.swap(true, Ordering::AcqRel) {
        return GitUpdateStatus {
            state: GitUpdateState::Checking,
            cached: false,
        };
    }

    #[cfg(target_os = "windows")]
    let status = update_status_from_attempt(run_winget_update_check(UPDATE_CHECK_TIMEOUT));
    #[cfg(not(target_os = "windows"))]
    let status = update_status_from_attempt(UpdateCheckAttempt::Unavailable);

    UPDATE_CHECK_RUNNING.store(false, Ordering::Release);
    cache_update_status(status, now);
    status
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct GitIdentity {
    name: Option<String>,
    email: Option<String>,
}

// `config_override`, when set, points git at an alternate global config file
// via `GIT_CONFIG_GLOBAL` (a real git env var, supported since Git 2.32).
// Production calls always pass `None` (the user's real global config); tests
// pass a temporary file so they never touch the machine's real Git identity.
fn read_global_git_config(key: &str, config_override: Option<&str>) -> Option<String> {
    let envs = config_override
        .map(|path| vec![("GIT_CONFIG_GLOBAL", path)])
        .unwrap_or_default();
    let output = run_global_git_with_env(["config", "--global", "--get", key], &envs).ok()?;
    if !output.status.success() {
        return None;
    }
    let value = git_stdout(&output);
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn write_global_git_config(
    key: &str,
    value: &str,
    config_override: Option<&str>,
) -> Result<(), AppError> {
    let envs = config_override
        .map(|path| vec![("GIT_CONFIG_GLOBAL", path)])
        .unwrap_or_default();
    let output = run_global_git_with_env(["config", "--global", key, value], &envs)?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitConfigWriteFailed,
            format!("Git couldn't save {key}."),
        )
        .with_remediation("Check the global Git configuration and try again."));
    }
    Ok(())
}

fn set_git_identity_with_override(
    name: &str,
    email: &str,
    config_override: Option<&str>,
) -> Result<(), AppError> {
    let name = name.trim();
    let email = email.trim();
    if name.is_empty() || email.is_empty() {
        return Err(AppError::new(
            AppErrorCode::InvalidIdentity,
            "Enter both a name and an email.",
        ));
    }

    write_global_git_config("user.name", name, config_override)?;
    write_global_git_config("user.email", email, config_override)?;
    Ok(())
}

fn get_git_identity() -> GitIdentity {
    let _command = application::enter("get_git_identity");
    GitIdentity {
        name: read_global_git_config("user.name", None),
        email: read_global_git_config("user.email", None),
    }
}

fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
    let _command = application::enter("set_git_identity");
    set_git_identity_with_override(&name, &email, None)
}

// ---- Save version planning (task 010) ----
//
// This is the read-only preview half of the save-version flow. It never
// mutates the repository; `save_version` (execution) is a separate, narrower
// command so the risky, history-mutating code path stays small and auditable
// on its own.

/// Shared by every planned operation, so the frontend can classify any
/// GitOdrile operation from one field without a lookup table.
#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
enum OperationKind {
    HistoryMutation,
    RemoteMutation,
    LocalMutation,
    Destructive,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SaveVersionPlan {
    operation_kind: OperationKind,
    summary: String,
    steps: Vec<String>,
    risks: Vec<String>,
    recovery: String,
    requires_confirmation: bool,
    /// Opaque fingerprint of everything that would change the outcome of a
    /// save. Execution must refuse to proceed if a freshly computed token no
    /// longer matches this one.
    state_token: String,
    branch: Option<String>,
    is_first_version: bool,
    total_files: usize,
    remaining_files: usize,
    is_partial: bool,
    has_prepared_changes: bool,
    counts: WorkingTreeCounts,
}

/// Resolves branch/detached/unborn state and the current HEAD sha for a
/// project whose branch name is *already known* — the status call
/// `validate_and_prepare_save` already made (`--branch` reports `#
/// branch.head <name-or-"(detached)">`, parsed into exactly this same
/// `Option<String>` shape) says exactly what `git symbolic-ref` would, so
/// resolving it again here would just be the same Git process a second
/// time. Only one further call (`rev-parse --verify HEAD`) is needed, to
/// tell an unborn branch (no commits yet) apart from a real one, and its
/// stdout doubles as the sha the state-token fingerprint needs — a second
/// `resolve_head_sha` call used to read that same output again separately.
fn resolve_head_state(
    path: &str,
    branch: Option<String>,
) -> Result<(HeadState, Option<String>), AppError> {
    let verified_head = run_git(path, &["rev-parse", "--verify", "HEAD"])?;
    let head_sha = verified_head
        .status
        .success()
        .then(|| git_stdout(&verified_head));

    let head_state = if branch.is_some() {
        if head_sha.is_some() {
            HeadState::Branch
        } else {
            HeadState::Unborn
        }
    } else if head_sha.is_some() {
        HeadState::Detached
    } else {
        HeadState::Unborn
    };
    Ok((head_state, head_sha))
}

/// Detects an in-progress merge, rebase, cherry-pick, revert, or bisect by
/// the marker files/directories Git itself uses, rather than parsing porcelain
/// status (which reports the resulting conflicts but not *why* they exist).
fn git_operation_in_progress(path: &str) -> Result<Option<&'static str>, AppError> {
    let git_dir_raw = checked_git_stdout(run_git(path, &["rev-parse", "--absolute-git-dir"])?)?;
    let git_dir = Path::new(&git_dir_raw);
    if git_dir.join("MERGE_HEAD").is_file() {
        return Ok(Some("merge"));
    }
    if git_dir.join("CHERRY_PICK_HEAD").is_file() {
        return Ok(Some("cherry-pick"));
    }
    if git_dir.join("REVERT_HEAD").is_file() {
        return Ok(Some("revert"));
    }
    if git_dir.join("rebase-merge").is_dir() || git_dir.join("rebase-apply").is_dir() {
        return Ok(Some("rebase"));
    }
    if git_dir.join("BISECT_LOG").is_file() {
        return Ok(Some("bisect"));
    }
    Ok(None)
}

/// Same env-override pattern as `write_global_git_config`: production always
/// passes `None` (the user's real global config); tests point `GIT_CONFIG_GLOBAL`
/// at a temporary file so they never depend on, or mutate, the machine's real
/// Git identity.
fn run_git_with_global_override(
    repo_path: &str,
    args: &[&str],
    config_override: Option<&str>,
) -> Result<Output, AppError> {
    let envs = config_override
        .map(|global| vec![("GIT_CONFIG_GLOBAL", global)])
        .unwrap_or_default();
    run_git_with_env(repo_path, args, &envs)
}

/// Checks the *effective* identity (local config overriding global, exactly
/// like `git commit` resolves it), not just the global identity `get_git_identity`
/// exposes in Settings. A single `--get-regexp` call resolves both keys at
/// once — same effective-value precedence as two separate `--get` calls,
/// one fewer Git process on a path that runs on every plan and save.
fn identity_configured(path: &str, config_override: Option<&str>) -> Result<bool, AppError> {
    let output = run_git_with_global_override(
        path,
        &["config", "--get-regexp", "^user\\.(name|email)$"],
        config_override,
    )?;
    if !output.status.success() {
        // A nonzero exit means no matching keys at all (git's convention for
        // `--get`/`--get-regexp` when nothing matches), not a real failure.
        return Ok(false);
    }

    let mut has_name = false;
    let mut has_email = false;
    for line in git_stdout(&output).lines() {
        let Some((key, value)) = line.split_once(' ') else {
            continue;
        };
        if value.trim().is_empty() {
            continue;
        }
        match key {
            "user.name" => has_name = true,
            "user.email" => has_email = true,
            _ => {}
        }
    }
    Ok(has_name && has_email)
}

/// A compact fingerprint of everything that would change the outcome of a
/// save between preview and execution. Counts are folded in alongside the
/// (possibly capped) entry list, so drift beyond the reported-entries cap on
/// a very large changeset still invalidates the token. This only needs to
/// detect drift, not to be reversible or collision-proof, so a non-cryptographic
/// hash of a deterministic string is enough — no extra crate required.
fn compute_state_token(
    head: Option<&str>,
    branch: Option<&str>,
    tree: &str,
    selected_paths: Option<&[String]>,
) -> String {
    use std::hash::{Hash, Hasher};

    let mut fingerprint = format!(
        "head:{}|branch:{}|tree:{}|selection:{}|",
        head.unwrap_or("unborn"),
        branch.unwrap_or("detached"),
        tree,
        if selected_paths.is_some() {
            "partial"
        } else {
            "all"
        },
    );
    if let Some(paths) = selected_paths {
        for path in paths {
            fingerprint.push_str(path);
            fingerprint.push('\0');
        }
    }

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    fingerprint.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

struct PreparedIndex {
    path: PathBuf,
    tree: String,
}

impl Drop for PreparedIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
        let mut lock = self.path.as_os_str().to_os_string();
        lock.push(".lock");
        let _ = std::fs::remove_file(PathBuf::from(lock));
    }
}

fn prepare_index(
    path: &str,
    head_state: &HeadState,
    selected_entries: Option<&[WorkingTreeEntry]>,
) -> Result<PreparedIndex, AppError> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let mut index_path = std::env::temp_dir();
    index_path.push(format!(
        "gitodrile-selection-index-{}-{nanos}",
        std::process::id()
    ));

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

fn counts_for_entries(entries: &[WorkingTreeEntry]) -> WorkingTreeCounts {
    let mut counts = WorkingTreeCounts::default();
    for entry in entries {
        match entry.category {
            ChangeCategory::Changed => counts.changed += 1,
            ChangeCategory::New => counts.new_files += 1,
            ChangeCategory::Deleted => counts.deleted += 1,
            ChangeCategory::Renamed => counts.renamed += 1,
            ChangeCategory::Conflicted => counts.conflicted += 1,
        }
        counts.total += 1;
    }
    counts
}

struct ResolvedSelection {
    paths: Option<Vec<String>>,
    entries: Option<Vec<WorkingTreeEntry>>,
}

fn resolve_selection(
    status: &WorkingTreeStatus,
    selected_paths: Option<Vec<String>>,
) -> Result<ResolvedSelection, AppError> {
    let Some(mut paths) = selected_paths else {
        return Ok(ResolvedSelection {
            paths: None,
            entries: None,
        });
    };
    paths.sort();
    paths.dedup();
    if paths.is_empty() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "Choose at least one file to save.",
        ));
    }

    let mut entries = Vec::with_capacity(paths.len());
    for selected in &paths {
        let Some(entry) = status.entries.iter().find(|entry| entry.path == *selected) else {
            return Err(AppError::new(
                AppErrorCode::StalePreview,
                "The selected files changed since they were shown.",
            )
            .with_remediation("Refresh the changes and choose the files again."));
        };
        entries.push(entry.clone());
    }
    Ok(ResolvedSelection {
        paths: Some(paths),
        entries: Some(entries),
    })
}

/// Everything a fresh plan/execution pass needs, plus the live temporary
/// index (`prepared`) that produced its tree hash. Both `plan_save_version`
/// and `save_version` call `validate_and_prepare_save` exactly once each —
/// they used to run this whole sequence independently (execution re-checked
/// every blocker *and* rebuilt a second temporary index from scratch after
/// already calling the full planning function once), doubling roughly ten
/// Git process spawns into twenty for a single save. Sharing one function
/// keeps the safety property ("execution revalidates everything fresh
/// immediately before mutating") while only ever doing that validation once
/// per call.
struct ValidatedSave {
    branch: Option<String>,
    is_first_version: bool,
    selected_counts: WorkingTreeCounts,
    remaining_files: usize,
    is_partial: bool,
    has_prepared_changes: bool,
    state_token: String,
    prepared: PreparedIndex,
}

fn validate_and_prepare_save(
    path: &str,
    selected_paths: Option<Vec<String>>,
    identity_override: Option<&str>,
) -> Result<ValidatedSave, AppError> {
    // Reuses task 007's status command for path/repository validation and for
    // the same categorized counts the Changes screen already shows, so both
    // surfaces can never disagree about what "current changes" means.
    let status = read_working_tree_status(path.to_string())?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation(
            "Finish or abort that operation in Git, then try saving a version again.",
        ));
    }

    let branch = status.upstream.branch.clone();
    let (head_state, head) = resolve_head_state(path, branch.clone())?;
    if head_state == HeadState::Detached {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a version line right now.",
        )
        .with_remediation("Switch to a version line before saving a version."));
    }

    if status.counts.conflicted > 0 {
        return Err(AppError::new(
            AppErrorCode::UnresolvedConflicts,
            "Some files have overlapping changes that need to be resolved first.",
        )
        .with_remediation("Resolve the overlapping changes, then try saving again."));
    }

    if status.is_clean {
        return Err(AppError::new(
            AppErrorCode::NothingToSave,
            "There's nothing to save right now.",
        )
        .with_remediation("Make some changes, then come back to save a version."));
    }

    if !identity_configured(path, identity_override)? {
        return Err(AppError::new(
            AppErrorCode::MissingIdentity,
            "GitOdrile doesn't know who is saving this version yet.",
        )
        .with_remediation("Add a name and email for Git, then try again."));
    }

    let selection = resolve_selection(&status, selected_paths)?;
    let selected_paths = selection.paths;
    let selected_entries = selection.entries;
    let selected_counts = selected_entries
        .as_deref()
        .map(counts_for_entries)
        .unwrap_or_else(|| status.counts.clone());
    if selected_counts.conflicted > 0 {
        return Err(AppError::new(
            AppErrorCode::UnresolvedConflicts,
            "Some selected files have overlapping changes that need to be resolved first.",
        )
        .with_remediation("Resolve the overlapping changes, then try saving again."));
    }

    let is_first_version = head_state == HeadState::Unborn;
    let prepared = prepare_index(path, &head_state, selected_entries.as_deref())?;
    let state_token = compute_state_token(
        head.as_deref(),
        branch.as_deref(),
        &prepared.tree,
        selected_paths.as_deref(),
    );
    let is_partial = selected_paths.is_some() && selected_counts.total < status.counts.total;
    let remaining_files = status.counts.total.saturating_sub(selected_counts.total);
    let has_prepared_changes = selected_entries
        .as_deref()
        .map(|entries| entries.iter().any(|entry| entry.is_prepared))
        .unwrap_or(status.has_prepared_changes);

    Ok(ValidatedSave {
        branch,
        is_first_version,
        selected_counts,
        remaining_files,
        is_partial,
        has_prepared_changes,
        state_token,
        prepared,
    })
}

fn plan_save_version_selection_with_identity_override(
    path: String,
    selected_paths: Option<Vec<String>>,
    identity_override: Option<&str>,
) -> Result<SaveVersionPlan, AppError> {
    let validated = validate_and_prepare_save(&path, selected_paths, identity_override)?;
    let is_first_version = validated.is_first_version;
    let is_partial = validated.is_partial;

    let summary = if is_first_version {
        if is_partial {
            "This creates the project's first saved version from the selected changes."
        } else {
            "This creates the project's first saved version from every current change."
        }
    } else if is_partial {
        "This saves the selected changes as one new version."
    } else {
        "This saves every current change as one new version."
    }
    .to_string();

    let mut steps = vec![
        if is_partial {
            "Include only the selected changed, new, deleted, renamed, and copied files."
                .to_string()
        } else {
            "Include every changed, new, deleted, renamed, and copied file that isn't ignored."
                .to_string()
        },
        "Create one new saved version with the description you write.".to_string(),
    ];
    if !is_first_version {
        steps.push("Keep the project's earlier saved version reachable for recovery.".to_string());
    }

    let recovery = if is_first_version {
        "This is the first saved version, so there's no earlier version to recover.".to_string()
    } else {
        "The save is additive: the earlier saved version stays reachable through Git's history if you need to go back."
            .to_string()
    };

    Ok(SaveVersionPlan {
        operation_kind: OperationKind::HistoryMutation,
        summary,
        steps,
        risks: vec![
            "This only affects local history; nothing is sent to a remote project.".to_string(),
        ],
        recovery,
        requires_confirmation: true,
        state_token: validated.state_token,
        branch: validated.branch,
        is_first_version,
        total_files: validated.selected_counts.total,
        remaining_files: validated.remaining_files,
        is_partial,
        has_prepared_changes: validated.has_prepared_changes,
        counts: validated.selected_counts,
    })
    // `validated.prepared`'s temporary index is dropped (and its backing
    // file removed) here — the plan only ever needed its tree hash, already
    // folded into `state_token` above.
}

fn plan_save_version(
    path: String,
    selected_paths: Option<Vec<String>>,
) -> Result<SaveVersionPlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_save_version", None)?;
    plan_save_version_selection_with_identity_override(path, selected_paths, None)
}

#[cfg(test)]
fn plan_save_version_with_identity_override(
    path: String,
    identity_override: Option<&str>,
) -> Result<SaveVersionPlan, AppError> {
    plan_save_version_selection_with_identity_override(path, None, identity_override)
}

// ---- Save version execution (task 010) ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SaveVersionResult {
    commit: String,
    short_commit: String,
    title: String,
    description: Option<String>,
    branch: Option<String>,
    saved_files: usize,
}

/// Resolves the *effective* index file for `path`, which may be a linked
/// worktree's own index rather than `.git/index`. `--git-path` already
/// accounts for that; it just doesn't guarantee an absolute result, so the
/// raw value is resolved relative to `path` the same way `open_repository`
/// resolves `--absolute-git-dir`'s output.
fn resolve_index_path(path: &str) -> Result<PathBuf, AppError> {
    let raw = checked_git_stdout(run_git(path, &["rev-parse", "--git-path", "index"])?)?;
    Ok(normalized_path(Path::new(path), &raw))
}

fn index_unavailable_error() -> AppError {
    AppError::new(
        AppErrorCode::IndexUnavailable,
        "GitOdrile couldn't safely prepare this project's Git index.",
    )
    .with_remediation("Check available disk space and file permissions (antivirus tools can lock this file on Windows), then try again.")
}

/// Holds what's needed to put the repository's index back exactly as it was,
/// including the case where no index file existed yet (a fresh, never-staged
/// repository) — restoring then means removing whatever `git add` created,
/// not overwriting it with empty content.
struct IndexBackup {
    index_path: PathBuf,
    backup_path: Option<PathBuf>,
}

fn backup_index(index_path: &Path) -> Result<IndexBackup, AppError> {
    if !index_path.exists() {
        return Ok(IndexBackup {
            index_path: index_path.to_path_buf(),
            backup_path: None,
        });
    }

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let mut backup_path = std::env::temp_dir();
    backup_path.push(format!(
        "gitodrile-index-backup-{}-{nanos}.bak",
        std::process::id()
    ));
    std::fs::copy(index_path, &backup_path).map_err(|_| index_unavailable_error())?;
    Ok(IndexBackup {
        index_path: index_path.to_path_buf(),
        backup_path: Some(backup_path),
    })
}

/// Restores the index to its pre-save state. Errors here are reported but
/// deliberately not layered onto an already-in-flight failure: callers treat
/// this as best-effort cleanup after the primary error has been decided.
fn restore_index(backup: &IndexBackup) -> Result<(), AppError> {
    match &backup.backup_path {
        Some(backup_path) => {
            std::fs::copy(backup_path, &backup.index_path)
                .map_err(|_| index_unavailable_error())?;
            let _ = std::fs::remove_file(backup_path);
        }
        None => {
            let _ = std::fs::remove_file(&backup.index_path);
        }
    }
    Ok(())
}

fn cleanup_backup(backup: &IndexBackup) {
    if let Some(backup_path) = &backup.backup_path {
        let _ = std::fs::remove_file(backup_path);
    }
}

fn restore_or_report(backup: &IndexBackup, primary: AppError) -> AppError {
    match restore_index(backup) {
        Ok(()) => primary,
        Err(_) => AppError::new(
            AppErrorCode::IndexRestoreFailed,
            "GitOdrile couldn't restore the project's prepared changes after the save failed.",
        )
        .with_remediation(
            "Your working files are still there. Keep the project open and review Git's prepared changes before trying again.",
        )
        .with_detail(
            backup
                .backup_path
                .as_ref()
                .map(|path| {
                    format!(
                        "The original index backup was kept at {}.",
                        display_path(path.clone())
                    )
                })
                .unwrap_or_else(|| {
                    "The project did not have an index before this save attempt.".to_string()
                }),
        ),
    }
}

fn stderr_text(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).to_string()
}

/// Long enough to be useful as a secondary detail, short enough that a noisy
/// hook can't balloon the error payload.
const MAX_FAILURE_DETAIL_BYTES: usize = 4000;

fn truncate_detail(text: &str) -> String {
    let trimmed = text.trim();
    let mut redacted = git::redact_diagnostic(trimmed.as_bytes(), MAX_FAILURE_DETAIL_BYTES);
    if trimmed.len() > MAX_FAILURE_DETAIL_BYTES {
        redacted.push('…');
    }
    redacted
}

/// A hook's presence doesn't guarantee it fired, and a missing one doesn't
/// rule out a server-side equivalent — this is a best-effort classification
/// hint, not a guarantee. Git gives no structured signal for "a hook
/// rejected this commit" versus any other nonzero exit.
fn hook_exists(path: &str) -> bool {
    let Ok(output) = run_git(path, &["rev-parse", "--absolute-git-dir"]) else {
        return false;
    };
    let Ok(git_dir_raw) = checked_git_stdout(output) else {
        return false;
    };
    let hooks_dir = Path::new(&git_dir_raw).join("hooks");
    ["pre-commit", "commit-msg"]
        .iter()
        .any(|name| hooks_dir.join(name).is_file())
}

/// Best-effort classification of a failed `git commit`. Git does not expose a
/// structured reason for a nonzero exit, so this pattern-matches known GPG/SSH
/// signing failure text before falling back to "a hook rejected this" (when a
/// hook is actually present) and finally a generic failure. The raw stderr
/// always rides along as `detail`, never as the primary `message`.
fn classify_commit_failure(path: &str, stderr: &str) -> AppError {
    let lowered = stderr.to_lowercase();
    let looks_like_signing_failure = lowered.contains("gpg failed to sign")
        || lowered.contains("unable to sign")
        || (lowered.contains("sign") && lowered.contains("fail"));

    if looks_like_signing_failure {
        return AppError::new(
            AppErrorCode::SigningFailed,
            "Git couldn't sign this version.",
        )
        .with_remediation("Check your Git commit-signing setup (GPG or SSH key), then try again.")
        .with_detail(truncate_detail(stderr));
    }

    if hook_exists(path) {
        return AppError::new(
            AppErrorCode::HookRejected,
            "A Git hook rejected this version.",
        )
        .with_remediation("Check the hook's output, address what it's flagging, then try again.")
        .with_detail(truncate_detail(stderr));
    }

    AppError::new(
        AppErrorCode::GitCommandFailed,
        "Git couldn't save this version.",
    )
    .with_remediation("Check the project's Git configuration and try again.")
    .with_detail(truncate_detail(stderr))
}

fn save_version_selection_with_identity_override(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
    identity_override: Option<&str>,
) -> Result<SaveVersionResult, AppError> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err(AppError::new(
            AppErrorCode::EmptyTitle,
            "Write a short name before saving.",
        ));
    }
    if trimmed_title.contains(['\r', '\n']) {
        return Err(AppError::new(
            AppErrorCode::InvalidTitle,
            "Keep the version name on one line.",
        ));
    }
    // `None`/empty/whitespace-only all collapse to "no details" — the caller
    // (an optional textarea) can produce any of the three, and none of them
    // should append an empty trailing paragraph to the commit message.
    let trimmed_description = description
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty());
    let commit_message = match trimmed_description {
        Some(details) => format!("{trimmed_title}\n\n{details}"),
        None => trimmed_title.to_string(),
    };

    // Revalidates every planning blocker (clean tree, conflicts, detached
    // HEAD, an operation in progress, missing identity) against the
    // *current* repository, so execution can never proceed on a state
    // preview already rejected. Comparing `state_token` on top of that
    // catches drift the blockers alone wouldn't (e.g. the same files
    // changed again). This used to happen twice — once via a full call to
    // the planning function, then again independently to get a fresh
    // temporary index to actually use — doubling roughly ten Git process
    // spawns into twenty. One call now does both jobs.
    let validated = validate_and_prepare_save(&path, selected_paths, identity_override)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StalePreview,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Review the updated changes, then try saving again."));
    }

    let index_path = resolve_index_path(&path)?;
    let backup = backup_index(&index_path)?;

    if let Err(error) = std::fs::copy(&validated.prepared.path, &index_path) {
        let primary = index_unavailable_error().with_detail(error.to_string());
        return Err(restore_or_report(&backup, primary));
    }

    let commit_env = identity_override
        .map(|global| vec![("GIT_CONFIG_GLOBAL", global)])
        .unwrap_or_default();
    let commit_output = match run_git_with_env(
        &path,
        ["commit", "-m", commit_message.as_str()],
        &commit_env,
    ) {
        Ok(output) => output,
        Err(error) => return Err(restore_or_report(&backup, error)),
    };

    if !commit_output.status.success() {
        let primary = classify_commit_failure(&path, &stderr_text(&commit_output));
        return Err(restore_or_report(&backup, primary));
    }

    cleanup_backup(&backup);

    let full_commit = match run_git(&path, &["rev-parse", "HEAD"]) {
        Ok(output) if output.status.success() => git_stdout(&output),
        _ => {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "The version was saved, but GitOdrile couldn't read its identifier.",
            )
            .with_remediation("Refresh the project to see the saved version."));
        }
    };
    let short_commit = match run_git(&path, &["rev-parse", "--short", "HEAD"]) {
        Ok(output) if output.status.success() => git_stdout(&output),
        _ => full_commit.chars().take(7).collect(),
    };

    Ok(SaveVersionResult {
        commit: full_commit,
        short_commit,
        title: trimmed_title.to_string(),
        description: trimmed_description.map(str::to_string),
        branch: validated.branch,
        saved_files: validated.selected_counts.total,
    })
}

#[cfg(test)]
fn save_version_with_identity_override(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    identity_override: Option<&str>,
) -> Result<SaveVersionResult, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "save_version", None)?;
    save_version_selection_with_identity_override(
        path,
        title,
        description,
        state_token,
        None,
        identity_override,
    )
}

fn save_version(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
) -> Result<SaveVersionResult, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "save_version", None)?;
    save_version_selection_with_identity_override(
        path,
        title,
        description,
        state_token,
        selected_paths,
        None,
    )
}

// ---- Publish planning and execution (task 011) ----
//
// Mirrors the save-version split: a read-only discovery/plan half and a
// narrow execution half, sharing one validation core the same way
// `validate_and_prepare_save` avoids double-spawning Git for save-version.
// Unlike save-version, `git push` never touches the index or working tree,
// so none of the temporary-index machinery applies here.

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
struct RemoteInfo {
    name: String,
    /// Embedded credentials (`user:pass@`/token-in-URL) are stripped before
    /// this ever leaves Rust; nothing upstream of this struct should see them.
    url: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
struct PublishTarget {
    remote: String,
    destination_branch: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct RemoteDiscovery {
    remotes: Vec<RemoteInfo>,
    branch: Option<String>,
    /// The full `remote/branch` tracking ref, when one is configured.
    upstream: Option<String>,
}

/// Strips embedded credentials (`user:pass@host`, `token@host`) from a remote
/// URL before it's ever serialized to the frontend. SSH's `user@host:path`
/// shorthand has no `://` and is left untouched — the account name there
/// isn't a secret the way an embedded password or token is.
fn redact_remote_url(url: &str) -> String {
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
fn parse_remote_v_output(output: &str) -> Vec<RemoteInfo> {
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

fn discover_remotes(path: String) -> Result<RemoteDiscovery, AppError> {
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
fn resolve_remote_selection(
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

fn validate_remote_name(name: &str) -> Result<(), AppError> {
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

/// `git check-ref-format` is Git's own source of truth for a valid branch
/// name; today `local_branch` only ever comes from the current HEAD's own
/// symbolic ref (which Git already guarantees is valid), so this is
/// defense-in-depth against any future path that could construct a refspec
/// from a less trusted name, rather than a check that can currently fail.
fn validate_branch_ref_name(path: &str, name: &str) -> Result<(), AppError> {
    let output = run_git(path, &["check-ref-format", "--branch", name])?;
    if output.status.success() {
        Ok(())
    } else {
        Err(AppError::new(
            AppErrorCode::InvalidRefName,
            "This version line's name isn't a valid Git reference.",
        )
        .with_remediation("Rename the version line to a valid Git branch name, then try again."))
    }
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
struct PublishPlan {
    operation_kind: OperationKind,
    summary: String,
    steps: Vec<String>,
    risks: Vec<String>,
    recovery: String,
    requires_confirmation: bool,
    /// Opaque fingerprint of local + freshly observed remote state. Execution
    /// must refuse to proceed if a freshly computed token no longer matches.
    state_token: String,
    target: PublishTarget,
    local_branch: String,
    will_create_upstream: bool,
    commit_count: u32,
    commit_summary: Vec<SavedVersionSummary>,
    has_unsaved_files: bool,
    /// How many more pending saved versions (newer than what this plan
    /// covers) would still remain unpublished after it — always `0` unless
    /// `upTo` was requested and it isn't the newest pending version.
    remaining_after_publish: u32,
    remaining_commit_summary: Vec<SavedVersionSummary>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PublishResult {
    target: PublishTarget,
    local_branch: String,
    previous_remote_commit: Option<String>,
    published_commit: String,
    published_count: u32,
    created_upstream: bool,
    remaining_after_publish: u32,
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

fn compute_publish_state_token(
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

fn plan_publish(
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
fn classify_push_failure(porcelain_stdout: &str, stderr: &str) -> AppError {
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

fn publish(
    path: String,
    remote: String,
    state_token: String,
    up_to: Option<String>,
) -> Result<PublishResult, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "publish", None)?;
    publish_selection(path, remote, state_token, up_to)
}

mod version_lines;
pub(crate) use version_lines::*;

/// Starts reporting filesystem changes for an open project (task 020).
///
/// Returns whether a watch could actually be established. `false` is a normal
/// outcome, not a failure to report: network shares, some container mounts,
/// and an exhausted inotify budget all leave a project on the manual "Check
/// changes" path, which keeps working exactly as before. A real `Err` is
/// reserved for a path that isn't a usable repository at all.
fn watch_repository(
    app: tauri::AppHandle,
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: Option<String>,
) -> Result<bool, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "watch_repository", None)?;
    let root = repository.worktree_root.backend_path();
    if !root.is_dir() {
        return Err(
            AppError::new(AppErrorCode::PathMissing, "That folder doesn't exist.")
                .with_remediation("Reopen the project and try again."),
        );
    }
    // A linked worktree has three relevant locations: its resolved private Git
    // directory (HEAD/index), its `<root>/.git` pointer file, and the shared
    // common Git directory (branches/packed refs). Name all of them so an
    // external branch create/delete is visible from linked worktrees too.
    let mut git_dir = repository.git_dir.watch_paths();
    git_dir.push(root.join(".git"));
    git_dir.sort();
    git_dir.dedup();
    let epoch = session_epoch.ok_or_else(session::stale_session_error)?;
    Ok(registry.watch(
        app,
        &path,
        &epoch,
        repository.common_git_dir.match_key(),
        watch::WatchPaths {
            worktree: repository.worktree_root.watch_paths(),
            git_dir,
            common_git_dir: repository.common_git_dir.watch_paths(),
        },
    ))
}

fn unwatch_repository(
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: Option<String>,
) {
    registry.unwatch(&path, session_epoch.as_deref());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(watch::WatcherRegistry::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            ipc::app_status,
            ipc::show_main_window,
            ipc::open_repository,
            ipc::read_working_tree_status,
            ipc::read_file_diff,
            ipc::read_file_lines,
            ipc::read_working_tree_diffs,
            ipc::git_diagnostics,
            ipc::install_git,
            ipc::update_git,
            ipc::check_git_update,
            ipc::get_git_identity,
            ipc::set_git_identity,
            ipc::plan_save_version,
            ipc::save_version,
            ipc::discover_remotes,
            ipc::list_unpublished_versions,
            ipc::read_commit_file_changes,
            ipc::read_commit_file_diff,
            ipc::plan_publish,
            ipc::publish,
            ipc::get_version_lines,
            ipc::plan_create_version_line,
            ipc::create_version_line,
            ipc::plan_switch_version_line,
            ipc::switch_version_line,
            ipc::plan_delete_version_line,
            ipc::delete_version_line,
            ipc::watch_repository,
            ipc::unwatch_repository,
            ipc::close_project_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running GitOdrile");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn unique_temp_dir(label: &str) -> String {
        let mut dir = std::env::temp_dir();
        dir.push(format!("gitodrile-test-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir for test");
        dir.to_string_lossy().to_string()
    }

    fn git_init(path: &str) {
        let status = git_command(path)
            .args(["init", "-q"])
            .status()
            .expect("run git init");
        assert!(status.success(), "git init should succeed");
    }

    fn git_commit_empty(path: &str) {
        let status = git_command(path)
            .args([
                "-c",
                "user.name=GitOdrile Test",
                "-c",
                "user.email=test@gitodrile.local",
                "commit",
                "--allow-empty",
                "-q",
                "-m",
                "init",
            ])
            .status()
            .expect("run git commit");
        assert!(status.success(), "git commit --allow-empty should succeed");
    }

    #[test]
    fn open_repository_recognizes_a_valid_repository() {
        let path = unique_temp_dir("valid-repo");
        git_init(&path);

        let info = open_repository(path.clone(), None).expect("a git init'd folder should open");
        assert!(matches!(info.kind, RepositoryKind::Repository));
        assert_eq!(
            info.path,
            display_path(Path::new(&path).canonicalize().unwrap())
        );
        assert_eq!(info.selected_path, info.path);
        assert_eq!(info.head_state, HeadState::Unborn);
        assert!(info.branch.is_some());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn open_repository_resolves_a_nested_selection_to_the_worktree_root() {
        let path = unique_temp_dir("nested-repo");
        git_init(&path);
        let nested = Path::new(&path).join("one").join("two");
        fs::create_dir_all(&nested).expect("create nested folder");

        let info = open_repository(nested.to_string_lossy().to_string(), None)
            .expect("a folder inside a repository should open");
        assert_eq!(
            info.name,
            Path::new(&path).file_name().unwrap().to_string_lossy()
        );
        assert_eq!(
            info.path,
            display_path(Path::new(&path).canonicalize().unwrap())
        );
        assert_eq!(
            info.selected_path,
            display_path(nested.canonicalize().unwrap())
        );
        assert!(matches!(info.kind, RepositoryKind::Repository));
        assert_eq!(info.git_dir, info.common_git_dir);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn open_repository_rejects_a_non_repository_folder() {
        let path = unique_temp_dir("non-repo");

        let error = open_repository(path.clone(), None).expect_err("a plain folder isn't a repo");
        assert_eq!(error.code, AppErrorCode::NotRepository);
        assert!(error.remediation.is_some());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn open_repository_rejects_a_missing_folder() {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "gitodrile-test-does-not-exist-{}",
            std::process::id()
        ));
        let path = path.to_string_lossy().to_string();

        let error = open_repository(path, None).expect_err("a missing folder can't be opened");
        assert_eq!(error.code, AppErrorCode::PathMissing);
        assert!(error.remediation.is_some());
    }

    #[test]
    fn open_repository_rejects_a_bare_repository() {
        let path = unique_temp_dir("bare-repo");
        let status = git_command(&path)
            .args(["init", "--bare", "-q"])
            .status()
            .expect("run git init --bare");
        assert!(status.success(), "git init --bare should succeed");

        let error =
            open_repository(path.clone(), None).expect_err("a bare repo has no working files");
        assert_eq!(error.code, AppErrorCode::BareRepository);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn open_repository_detects_a_linked_worktree() {
        let main_path = unique_temp_dir("worktree-main");
        git_init(&main_path);
        git_commit_empty(&main_path);

        let mut worktree_buf = std::env::temp_dir();
        worktree_buf.push(format!(
            "gitodrile-test-worktree-linked-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&worktree_buf);
        let worktree_path = worktree_buf.to_string_lossy().to_string();

        let status = git_command(&main_path)
            .args([
                "worktree",
                "add",
                "-q",
                &worktree_path,
                "-b",
                "gitodrile-test-branch",
            ])
            .status()
            .expect("run git worktree add");
        assert!(status.success(), "git worktree add should succeed");

        let info =
            open_repository(worktree_path.clone(), None).expect("the linked worktree should open");
        assert!(matches!(info.kind, RepositoryKind::Worktree));
        assert_eq!(info.head_state, HeadState::Branch);
        assert_eq!(info.branch.as_deref(), Some("gitodrile-test-branch"));
        assert_ne!(info.git_dir, info.common_git_dir);

        let _ = git_command(&main_path)
            .args(["worktree", "remove", "--force", &worktree_path])
            .status();
        let _ = fs::remove_dir_all(&main_path);
        let _ = fs::remove_dir_all(&worktree_path);
    }

    #[test]
    fn open_repository_reports_a_detached_head_without_calling_it_a_branch() {
        let path = unique_temp_dir("detached-head");
        git_init(&path);
        git_commit_empty(&path);
        let status = git_command(&path)
            .args(["checkout", "--detach", "-q"])
            .status()
            .expect("detach HEAD");
        assert!(status.success(), "git checkout --detach should succeed");

        let info = open_repository(path.clone(), None).expect("a detached repository should open");
        assert_eq!(info.head_state, HeadState::Detached);
        assert_eq!(info.branch, None);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn git_diagnostics_finds_the_system_git() {
        // Assumes the machine running the tests has git on PATH, same as
        // every other test in this module (they all shell out to git).
        let diagnostics = git_diagnostics();
        assert_eq!(diagnostics.state, GitDiagnosticState::Available);
        assert!(diagnostics.version.is_some());
    }

    #[test]
    fn git_diagnostic_states_are_mapped_without_running_processes() {
        assert_eq!(
            git_diagnostics_from_attempt(ProcessAttempt::Missing).state,
            GitDiagnosticState::Missing
        );
        assert_eq!(
            git_diagnostics_from_attempt(ProcessAttempt::FailedToStart).state,
            GitDiagnosticState::CheckFailed
        );
        assert_eq!(
            git_diagnostics_from_attempt(ProcessAttempt::Completed {
                success: false,
                stdout: String::new(),
            })
            .state,
            GitDiagnosticState::Unusable
        );

        let available = git_diagnostics_from_attempt(ProcessAttempt::Completed {
            success: true,
            stdout: "git version 2.43.0\n".to_string(),
        });
        assert_eq!(available.state, GitDiagnosticState::Available);
        assert_eq!(available.version.as_deref(), Some("2.43.0"));
    }

    #[test]
    fn installation_planning_is_platform_aware_and_hermetic() {
        assert_eq!(
            installation_result(
                GitInstallationPlatform::Windows,
                Some(InstallSpawnResult::Started)
            )
            .outcome,
            GitInstallationOutcome::Started
        );
        let windows_without_winget = installation_result(
            GitInstallationPlatform::Windows,
            Some(InstallSpawnResult::Missing),
        );
        assert_eq!(
            windows_without_winget.outcome,
            GitInstallationOutcome::Guidance
        );
        assert_eq!(
            windows_without_winget.guidance_url.as_deref(),
            Some(GIT_WINDOWS_DOWNLOAD_URL)
        );
        assert_eq!(
            installation_result(GitInstallationPlatform::Macos, None)
                .guidance_url
                .as_deref(),
            Some(GIT_MACOS_DOWNLOAD_URL)
        );
        assert_eq!(
            installation_result(GitInstallationPlatform::Linux, None)
                .guidance_url
                .as_deref(),
            Some(GIT_LINUX_DOWNLOAD_URL)
        );
        assert_eq!(
            installation_result(
                GitInstallationPlatform::Windows,
                Some(InstallSpawnResult::Failed)
            )
            .outcome,
            GitInstallationOutcome::Failed
        );
    }

    #[test]
    fn update_check_targets_only_git_and_disables_prompts() {
        assert_eq!(
            GIT_UPDATE_CHECK_ARGS,
            [
                "list",
                "--id",
                "Git.Git",
                "-e",
                "--upgrade-available",
                "--accept-source-agreements",
                "--disable-interactivity",
            ]
        );
    }

    #[test]
    fn update_check_states_are_mapped_without_contacting_package_sources() {
        assert_eq!(
            update_status_from_attempt(UpdateCheckAttempt::Unavailable).state,
            GitUpdateState::Unavailable
        );
        assert_eq!(
            update_status_from_attempt(UpdateCheckAttempt::FailedToStart).state,
            GitUpdateState::Failed
        );
        assert_eq!(
            update_status_from_attempt(UpdateCheckAttempt::TimedOut).state,
            GitUpdateState::TimedOut
        );
        assert_eq!(
            update_status_from_attempt(UpdateCheckAttempt::Completed {
                success: true,
                output: "Git Git.Git 2.50.0 2.51.0 winget".to_string(),
            })
            .state,
            GitUpdateState::UpdateAvailable
        );
        assert_eq!(
            update_status_from_attempt(UpdateCheckAttempt::Completed {
                success: true,
                output: "No packages found.".to_string(),
            })
            .state,
            GitUpdateState::UpToDate
        );
        assert_eq!(
            update_status_from_attempt(UpdateCheckAttempt::Completed {
                success: false,
                output: "Source query failed.".to_string(),
            })
            .state,
            GitUpdateState::Failed
        );
    }

    #[test]
    fn parse_git_version_strips_the_leading_label() {
        assert_eq!(
            parse_git_version("git version 2.43.0.windows.1\n"),
            "2.43.0.windows.1"
        );
        assert_eq!(parse_git_version("2.43.0"), "2.43.0");
    }

    #[test]
    fn git_identity_round_trips_through_a_temporary_global_config() {
        let mut config_path = std::env::temp_dir();
        config_path.push(format!("gitodrile-test-gitconfig-{}", std::process::id()));
        let _ = fs::remove_file(&config_path);
        let config_override = config_path.to_string_lossy().to_string();

        assert_eq!(
            read_global_git_config("user.name", Some(&config_override)),
            None
        );

        set_git_identity_with_override("Ada Lovelace", "ada@example.com", Some(&config_override))
            .expect("set identity should succeed");

        assert_eq!(
            read_global_git_config("user.name", Some(&config_override)),
            Some("Ada Lovelace".to_string())
        );
        assert_eq!(
            read_global_git_config("user.email", Some(&config_override)),
            Some("ada@example.com".to_string())
        );

        let _ = fs::remove_file(&config_path);
    }

    #[test]
    fn set_git_identity_rejects_empty_fields() {
        let error = set_git_identity_with_override(" ", "ada@example.com", None)
            .expect_err("empty name should be rejected");
        assert_eq!(error.code, AppErrorCode::InvalidIdentity);
    }

    fn write_file(repo_path: &str, name: &str, contents: &str) {
        fs::write(Path::new(repo_path).join(name), contents).expect("write test file");
    }

    #[test]
    fn read_working_tree_status_reports_a_clean_repository() {
        let path = unique_temp_dir("status-clean");
        git_init(&path);
        git_commit_empty(&path);

        let status = read_working_tree_status(path.clone()).expect("a repository should report");
        assert!(status.is_clean);
        assert_eq!(status.counts.total, 0);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_status_reports_real_changes() {
        let path = unique_temp_dir("status-dirty");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "untracked.txt", "hello");

        let status = read_working_tree_status(path.clone()).expect("a repository should report");
        assert!(!status.is_clean);
        assert_eq!(status.counts.new_files, 1);
        assert_eq!(status.counts.total, 1);
        assert_eq!(status.entries[0].path, "untracked.txt");

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_status_handles_an_unborn_branch() {
        let path = unique_temp_dir("status-unborn");
        git_init(&path);
        write_file(&path, "first.txt", "hello");

        let status =
            read_working_tree_status(path.clone()).expect("an unborn branch should report");
        assert_eq!(status.counts.new_files, 1);
        assert!(!status.is_clean);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_status_reports_a_linked_worktree_separately() {
        let path = unique_temp_dir("status-worktree");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "only-in-main.txt", "hello");

        let worktree = Path::new(&path).join("linked");
        let created = git_command(&path)
            .args(["worktree", "add", "-q", "-b", "linked-branch"])
            .arg(&worktree)
            .status()
            .expect("run git worktree add");
        assert!(created.success(), "git worktree add should succeed");

        let status = read_working_tree_status(worktree.to_string_lossy().to_string())
            .expect("a linked worktree should report");

        // The untracked file lives in the main checkout, not here.
        assert!(status.is_clean);
        assert_eq!(status.upstream.branch, Some("linked-branch".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_status_rejects_a_missing_folder() {
        let path = unique_temp_dir("status-missing");
        let _ = fs::remove_dir_all(&path);

        let error = read_working_tree_status(path).expect_err("a missing folder should fail");
        assert_eq!(error.code, AppErrorCode::PathMissing);
        assert!(error.remediation.is_some());
    }

    #[test]
    fn read_working_tree_status_rejects_a_non_repository_folder() {
        let path = unique_temp_dir("status-non-repo");

        let error = read_working_tree_status(path.clone())
            .expect_err("a folder outside a repository should fail");
        assert_eq!(error.code, AppErrorCode::GitCommandFailed);

        let _ = fs::remove_dir_all(&path);
    }

    // ---- File diff (task 009) ----

    fn git_add(path: &str, file: &str) {
        let status = git_command(path)
            .args(["add", "--", file])
            .status()
            .expect("run git add");
        assert!(status.success(), "git add should succeed");
    }

    fn git_add_all(path: &str) {
        let status = git_command(path)
            .args(["add", "-A"])
            .status()
            .expect("run git add -A");
        assert!(status.success(), "git add -A should succeed");
    }

    fn git_commit(path: &str, message: &str) {
        let status = git_command(path)
            .args([
                "-c",
                "user.name=GitOdrile Test",
                "-c",
                "user.email=test@gitodrile.local",
                "commit",
                "-q",
                "-m",
                message,
            ])
            .status()
            .expect("run git commit");
        assert!(status.success(), "git commit should succeed");
    }

    fn current_branch(path: &str) -> String {
        let output = git_command(path)
            .args(["symbolic-ref", "--short", "HEAD"])
            .output()
            .expect("read current branch");
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[test]
    fn read_file_diff_reports_an_unstaged_modification_with_line_numbers() {
        let path = unique_temp_dir("diff-unstaged");
        git_init(&path);
        write_file(&path, "file.txt", "one\ntwo\nthree\n");
        git_add(&path, "file.txt");
        git_commit(&path, "add file");
        write_file(&path, "file.txt", "one\nTWO\nthree\n");

        let diff =
            read_file_diff(path.clone(), "file.txt".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Text {
                hunks,
                change,
                truncated,
                ..
            } => {
                assert_eq!(change, ChangeCategory::Changed);
                assert!(!truncated);
                let deletion = hunks[0]
                    .lines
                    .iter()
                    .find(|line| line.kind == DiffLineKind::Deletion)
                    .expect("a deletion line");
                assert_eq!(deletion.content, "two");
                assert_eq!(deletion.old_line_number, Some(2));
                let addition = hunks[0]
                    .lines
                    .iter()
                    .find(|line| line.kind == DiffLineKind::Addition)
                    .expect("an addition line");
                assert_eq!(addition.content, "TWO");
                assert_eq!(addition.new_line_number, Some(2));
            }
            other => panic!("expected a text diff, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_lines_returns_an_inclusive_one_based_range() {
        let path = unique_temp_dir("expand-range");
        git_init(&path);
        write_file(&path, "file.txt", "one\ntwo\nthree\nfour\nfive\n");

        let result = read_file_lines(path.clone(), "file.txt".to_string(), 2, 4)
            .expect("reading a range should succeed");
        assert_eq!(result.start_line, 2);
        assert_eq!(result.lines, vec!["two", "three", "four"]);
        assert!(!result.truncated);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_lines_clamps_a_range_that_runs_past_the_end_of_the_file() {
        let path = unique_temp_dir("expand-clamp");
        git_init(&path);
        write_file(&path, "file.txt", "one\ntwo\n");

        // The caller's range comes from a diff that may be a moment stale, so
        // overshooting returns what exists rather than failing.
        let result = read_file_lines(path.clone(), "file.txt".to_string(), 2, 99)
            .expect("an overshooting range should still succeed");
        assert_eq!(result.lines, vec!["two"]);

        // Starting past the end is empty, not an error.
        let past_end = read_file_lines(path.clone(), "file.txt".to_string(), 50, 60)
            .expect("a range past the end should still succeed");
        assert!(past_end.lines.is_empty());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_lines_caps_how_much_one_request_can_pull_in() {
        let path = unique_temp_dir("expand-cap");
        git_init(&path);
        let body: String = (0..(MAX_EXPANDED_LINES + 50))
            .map(|index| format!("line {index}\n"))
            .collect();
        write_file(&path, "file.txt", &body);

        let result = read_file_lines(path.clone(), "file.txt".to_string(), 1, 99_999)
            .expect("a capped range should succeed");
        assert_eq!(result.lines.len(), MAX_EXPANDED_LINES);
        assert!(result.truncated);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_lines_rejects_paths_and_ranges_it_cannot_trust() {
        let path = unique_temp_dir("expand-reject");
        git_init(&path);
        write_file(&path, "file.txt", "one\n");

        assert!(read_file_lines(path.clone(), "../outside.txt".to_string(), 1, 2).is_err());
        assert!(read_file_lines(path.clone(), "file.txt".to_string(), 0, 2).is_err());
        assert!(read_file_lines(path.clone(), "file.txt".to_string(), 5, 2).is_err());
        assert!(read_file_lines(path.clone(), "missing.txt".to_string(), 1, 2).is_err());

        let _ = fs::remove_dir_all(&path);
    }

    /// A repository-relative path that passes the string check can still
    /// resolve outside the repository through a symlink, so containment is
    /// confirmed against the canonicalized root as well.
    #[test]
    fn read_file_lines_refuses_a_symlink_that_escapes_the_repository() {
        let outside = unique_temp_dir("expand-outside");
        write_file(&outside, "secret.txt", "not yours\n");
        let path = unique_temp_dir("expand-symlink");
        git_init(&path);

        let link = Path::new(&path).join("innocent.txt");
        let target = Path::new(&outside).join("secret.txt");
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_file(&target, &link).is_ok();
        #[cfg(not(windows))]
        let linked = std::os::unix::fs::symlink(&target, &link).is_ok();

        // Creating a symlink needs a privilege Windows does not grant by
        // default; skip rather than fail when the platform said no.
        if linked {
            assert!(read_file_lines(path.clone(), "innocent.txt".to_string(), 1, 2).is_err());
        }

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn read_file_diff_reports_a_staged_modification() {
        let path = unique_temp_dir("diff-staged");
        git_init(&path);
        write_file(&path, "file.txt", "one\n");
        git_add(&path, "file.txt");
        git_commit(&path, "add file");
        write_file(&path, "file.txt", "one\ntwo\n");
        git_add(&path, "file.txt");

        let diff =
            read_file_diff(path.clone(), "file.txt".to_string()).expect("diff should succeed");
        assert!(matches!(diff, FileDiff::Text { .. }));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_reports_a_new_untracked_file_as_a_pure_addition() {
        let path = unique_temp_dir("diff-untracked");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "new.txt", "hello\nworld\n");

        let diff =
            read_file_diff(path.clone(), "new.txt".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Text { hunks, change, .. } => {
                assert_eq!(change, ChangeCategory::New);
                let total: usize = hunks.iter().map(|hunk| hunk.lines.len()).sum();
                assert_eq!(total, 2);
                assert!(hunks
                    .iter()
                    .flat_map(|hunk| &hunk.lines)
                    .all(|line| line.kind == DiffLineKind::Addition));
            }
            other => panic!("expected a text diff, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_stops_git_when_output_exceeds_the_byte_limit() {
        let path = unique_temp_dir("diff-output-cap");
        git_init(&path);
        git_commit_empty(&path);
        let content = "a long changed line that makes the patch grow quickly\n"
            .repeat(MAX_DIFF_OUTPUT_BYTES / 24);
        write_file(&path, "huge.txt", &content);

        let diff =
            read_file_diff(path.clone(), "huge.txt".to_string()).expect("diff should be bounded");
        match diff {
            FileDiff::TooLarge { limit_bytes, .. } => {
                assert_eq!(limit_bytes, MAX_DIFF_OUTPUT_BYTES as u64);
            }
            other => panic!("expected too-large, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_reports_a_new_staged_file_as_a_pure_addition() {
        let path = unique_temp_dir("diff-staged-new");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "new.txt", "hello\n");
        git_add(&path, "new.txt");

        let diff =
            read_file_diff(path.clone(), "new.txt".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Text { hunks, .. } => {
                assert_eq!(hunks[0].lines[0].kind, DiffLineKind::Addition);
            }
            other => panic!("expected a text diff, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_reports_a_deleted_file_as_a_pure_deletion() {
        let path = unique_temp_dir("diff-deleted");
        git_init(&path);
        write_file(&path, "gone.txt", "bye\n");
        git_add(&path, "gone.txt");
        git_commit(&path, "add file");
        fs::remove_file(Path::new(&path).join("gone.txt")).expect("remove file");

        let diff =
            read_file_diff(path.clone(), "gone.txt".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Text { hunks, change, .. } => {
                assert_eq!(change, ChangeCategory::Deleted);
                assert!(hunks
                    .iter()
                    .flat_map(|hunk| &hunk.lines)
                    .all(|line| line.kind == DiffLineKind::Deletion));
            }
            other => panic!("expected a text diff, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_reports_a_renamed_file_with_content_change() {
        let path = unique_temp_dir("diff-renamed");
        git_init(&path);
        write_file(&path, "old.txt", "one\ntwo\nthree\nfour\nfive\n");
        git_add(&path, "old.txt");
        git_commit(&path, "add file");
        fs::rename(
            Path::new(&path).join("old.txt"),
            Path::new(&path).join("new.txt"),
        )
        .expect("rename file");
        write_file(&path, "new.txt", "one\ntwo\nTHREE\nfour\nfive\n");
        git_add_all(&path);

        let diff =
            read_file_diff(path.clone(), "new.txt".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Text {
                hunks,
                change,
                original_path,
                ..
            } => {
                assert_eq!(change, ChangeCategory::Renamed);
                assert_eq!(original_path.as_deref(), Some("old.txt"));
                assert!(!hunks.is_empty());
            }
            other => panic!("expected a text diff, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_reports_a_pure_rename_as_unchanged() {
        let path = unique_temp_dir("diff-pure-rename");
        git_init(&path);
        write_file(&path, "old.txt", "same content\n");
        git_add(&path, "old.txt");
        git_commit(&path, "add file");
        fs::rename(
            Path::new(&path).join("old.txt"),
            Path::new(&path).join("new.txt"),
        )
        .expect("rename file");
        git_add_all(&path);

        let diff =
            read_file_diff(path.clone(), "new.txt".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Unchanged {
                change,
                original_path,
                ..
            } => {
                assert_eq!(change, ChangeCategory::Renamed);
                assert_eq!(original_path.as_deref(), Some("old.txt"));
            }
            other => panic!("expected unchanged, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_reports_a_new_file_on_an_unborn_branch() {
        let path = unique_temp_dir("diff-unborn");
        git_init(&path);
        write_file(&path, "first.txt", "hello\n");

        let diff =
            read_file_diff(path.clone(), "first.txt".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Text { hunks, change, .. } => {
                assert_eq!(change, ChangeCategory::New);
                assert_eq!(hunks[0].lines[0].kind, DiffLineKind::Addition);
            }
            other => panic!("expected a text diff, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_rejects_a_path_that_is_not_in_the_current_status() {
        let path = unique_temp_dir("diff-not-changed");
        git_init(&path);
        git_commit_empty(&path);

        let error = read_file_diff(path.clone(), "does-not-exist.txt".to_string())
            .expect_err("a path outside the status should fail");
        assert_eq!(error.code, AppErrorCode::PathNotChanged);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_rejects_a_traversal_path() {
        let path = unique_temp_dir("diff-traversal");
        git_init(&path);
        git_commit_empty(&path);

        let error = read_file_diff(path.clone(), "../outside.txt".to_string())
            .expect_err("a traversal path should be rejected before touching git");
        assert_eq!(error.code, AppErrorCode::PathInvalid);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_reports_a_conflict_with_visible_content() {
        let path = unique_temp_dir("diff-conflict");
        git_init(&path);
        write_file(&path, "file.txt", "base\n");
        git_add(&path, "file.txt");
        git_commit(&path, "base commit");
        let main_branch = current_branch(&path);

        let status = git_command(&path)
            .args(["checkout", "-q", "-b", "feature"])
            .status()
            .expect("checkout feature branch");
        assert!(status.success());
        write_file(&path, "file.txt", "feature change\n");
        git_add(&path, "file.txt");
        git_commit(&path, "feature change");

        let status = git_command(&path)
            .args(["checkout", "-q", &main_branch])
            .status()
            .expect("checkout main branch");
        assert!(status.success());
        write_file(&path, "file.txt", "main change\n");
        git_add(&path, "file.txt");
        git_commit(&path, "main change");

        // A merge conflict is the point of this test: ignore the (expected
        // nonzero) result and inspect the conflicted worktree state instead.
        // An explicit identity is required here too: a clean (non-conflicting)
        // merge would need to auto-commit, and Git checks committer identity
        // before attempting the merge at all, aborting the whole operation
        // untouched on a machine with no configured identity (e.g. CI runners).
        let _ = git_command(&path)
            .args([
                "-c",
                "user.name=GitOdrile Test",
                "-c",
                "user.email=test@gitodrile.local",
                "merge",
                "-q",
                "--no-edit",
                "feature",
            ])
            .status();

        let diff =
            read_file_diff(path.clone(), "file.txt".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Conflict { hunks, detail, .. } => {
                assert!(detail.is_none());
                assert!(
                    !hunks.is_empty(),
                    "conflict markers should be visible in the diff"
                );
            }
            other => panic!("expected a conflict, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_file_diff_reports_a_modified_binary_file() {
        let path = unique_temp_dir("diff-binary");
        git_init(&path);
        fs::write(
            Path::new(&path).join("image.bin"),
            [0u8, 159, 146, 150, 0, 1, 2],
        )
        .expect("write binary file");
        git_add(&path, "image.bin");
        git_commit(&path, "add binary file");
        fs::write(
            Path::new(&path).join("image.bin"),
            [0u8, 159, 146, 150, 0, 9, 9],
        )
        .expect("modify binary file");

        let diff =
            read_file_diff(path.clone(), "image.bin".to_string()).expect("diff should succeed");
        match diff {
            FileDiff::Binary { change, .. } => assert_eq!(change, ChangeCategory::Changed),
            other => panic!("expected binary, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn parse_diff_body_ignores_malformed_and_truncated_header_lines() {
        // A line that looks like a hunk header but fails to parse, content
        // lines with no hunk open yet, and a header cut off mid-stream must
        // not panic and must not fabricate a hunk from unparseable input.
        let text =
            "@@ -bogus @@\n+dangling addition before any hunk\n@@ -1,1 +1,1 @@\n-a\n+b\n@@ -2 +2";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks.len(), 1);
        assert_eq!(parsed.hunks[0].old_start, 1);
        assert_eq!(parsed.hunks[0].lines.len(), 2);
    }

    // ---- plan_save_version (task 010) ----

    /// A `GIT_CONFIG_GLOBAL` file with an identity set, so planner tests don't
    /// depend on (or risk reading) the real machine's global Git identity.
    fn write_test_identity_config(label: &str) -> String {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "gitodrile-test-identity-{label}-{}.gitconfig",
            std::process::id()
        ));
        fs::write(
            &path,
            "[user]\n\tname = GitOdrile Test\n\temail = test@gitodrile.local\n",
        )
        .expect("write temp identity config");
        path.to_string_lossy().to_string()
    }

    /// A `GIT_CONFIG_GLOBAL` path that does not exist, so `git config --get`
    /// finds no identity there and (with no local repo config set either)
    /// reports none configured, deterministically.
    fn empty_identity_override(label: &str) -> String {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "gitodrile-test-no-identity-{label}-{}.gitconfig",
            std::process::id()
        ));
        let _ = fs::remove_file(&path);
        path.to_string_lossy().to_string()
    }

    #[test]
    fn plan_save_version_reports_nothing_to_save_for_a_clean_unborn_repo() {
        let path = unique_temp_dir("plan-clean-unborn");
        git_init(&path);
        let identity = write_test_identity_config("plan-clean-unborn");

        let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect_err("a clean, commit-less repo has nothing to save");
        assert_eq!(error.code, AppErrorCode::NothingToSave);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn plan_save_version_reports_nothing_to_save_for_a_clean_existing_history() {
        let path = unique_temp_dir("plan-clean-existing");
        git_init(&path);
        git_commit_empty(&path);
        let identity = write_test_identity_config("plan-clean-existing");

        let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect_err("a clean repo has nothing to save");
        assert_eq!(error.code, AppErrorCode::NothingToSave);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn plan_save_version_returns_a_first_version_plan_for_an_unborn_repo_with_changes() {
        let path = unique_temp_dir("plan-first-version");
        git_init(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("plan-first-version");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("an unborn repo with changes should produce a plan");
        assert_eq!(plan.operation_kind, OperationKind::HistoryMutation);
        assert!(plan.requires_confirmation);
        assert!(plan.is_first_version);
        assert_eq!(plan.total_files, 1);
        assert_eq!(plan.counts.new_files, 1);
        assert!(plan.branch.is_some());

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn plan_save_version_returns_a_normal_plan_for_an_existing_history() {
        let path = unique_temp_dir("plan-normal");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("plan-normal");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("a repo with changes should produce a plan");
        assert!(!plan.is_first_version);
        assert_eq!(plan.total_files, 1);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn plan_save_version_rejects_a_detached_head() {
        let path = unique_temp_dir("plan-detached");
        git_init(&path);
        git_commit_empty(&path);
        let status = git_command(&path)
            .args(["checkout", "--detach", "-q"])
            .status()
            .expect("detach HEAD");
        assert!(status.success(), "git checkout --detach should succeed");
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("plan-detached");

        let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect_err("a detached HEAD should block saving");
        assert_eq!(error.code, AppErrorCode::DetachedHead);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn plan_save_version_rejects_unresolved_conflicts() {
        let path = unique_temp_dir("plan-conflicts");
        git_init(&path);
        write_file(&path, "file.txt", "base\n");
        git_add_all(&path);
        git_commit(&path, "base");
        let original_branch =
            git_stdout(&run_git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"]).unwrap());

        let status = git_command(&path)
            .args(["checkout", "-q", "-b", "feature"])
            .status()
            .expect("create feature branch");
        assert!(status.success());
        write_file(&path, "file.txt", "feature change\n");
        git_add(&path, "file.txt");
        git_commit(&path, "feature change");

        let status = git_command(&path)
            .args(["checkout", "-q", &original_branch])
            .status()
            .expect("checkout the original branch");
        assert!(status.success());
        write_file(&path, "file.txt", "main change\n");
        git_add(&path, "file.txt");
        git_commit(&path, "main change");

        // A merge conflict is the point of this test: ignore the (expected
        // nonzero) result and inspect the conflicted status afterward.
        // An explicit identity is required here too: a clean (non-conflicting)
        // merge would need to auto-commit, and Git checks committer identity
        // before attempting the merge at all, aborting the whole operation
        // untouched on a machine with no configured identity (e.g. CI runners).
        let _ = git_command(&path)
            .args([
                "-c",
                "user.name=GitOdrile Test",
                "-c",
                "user.email=test@gitodrile.local",
                "merge",
                "-q",
                "--no-edit",
                "feature",
            ])
            .status();

        // `git merge` also leaves `MERGE_HEAD` behind, which would otherwise
        // be caught by the (higher-priority) operation-in-progress check.
        // Removing it isolates the unresolved-conflicts blocker, which also
        // fires for unmerged index entries left by other means (e.g. a
        // conflicting `stash pop`, which never sets `MERGE_HEAD`).
        let git_dir_raw =
            checked_git_stdout(run_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap())
                .unwrap();
        fs::remove_file(Path::new(&git_dir_raw).join("MERGE_HEAD"))
            .expect("remove MERGE_HEAD to isolate the conflict blocker");

        let identity = write_test_identity_config("plan-conflicts");
        let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect_err("unresolved conflicts should block saving");
        assert_eq!(error.code, AppErrorCode::UnresolvedConflicts);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn plan_save_version_rejects_an_operation_in_progress() {
        let path = unique_temp_dir("plan-merge-in-progress");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "readme.md", "hello\n");
        let git_dir_raw =
            checked_git_stdout(run_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap())
                .unwrap();
        fs::write(Path::new(&git_dir_raw).join("MERGE_HEAD"), "deadbeef\n")
            .expect("simulate an in-progress merge");
        let identity = write_test_identity_config("plan-merge-in-progress");

        let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect_err("an in-progress merge should block saving");
        assert_eq!(error.code, AppErrorCode::GitOperationInProgress);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn plan_save_version_rejects_missing_identity() {
        let path = unique_temp_dir("plan-missing-identity");
        git_init(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = empty_identity_override("plan-missing-identity");

        let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect_err("a repo with no configured identity should block saving");
        assert_eq!(error.code, AppErrorCode::MissingIdentity);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn plan_save_version_state_token_is_stable_then_invalidated_by_new_changes() {
        let path = unique_temp_dir("plan-token");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("plan-token");

        let first = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("first plan should succeed");
        let second = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("re-planning identical state should succeed");
        assert_eq!(first.state_token, second.state_token);

        write_file(&path, "other.txt", "more\n");
        let third = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan after a new change should succeed");
        assert_ne!(first.state_token, third.state_token);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    // ---- save_version (task 010) ----

    /// A pre-commit hook that always rejects, written the same way on every
    /// platform: Git for Windows executes shebang scripts through its bundled
    /// `sh`, so no `.exe`/`.bat` wrapper or executable bit is needed there.
    /// Unix needs the executable bit set explicitly.
    fn write_failing_hook(git_dir: &Path, name: &str) {
        let hooks_dir = git_dir.join("hooks");
        fs::create_dir_all(&hooks_dir).expect("create hooks dir");
        let hook_path = hooks_dir.join(name);
        fs::write(
            &hook_path,
            "#!/bin/sh\necho 'rejected by test hook' 1>&2\nexit 1\n",
        )
        .expect("write failing hook");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&hook_path).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&hook_path, perms).unwrap();
        }
    }

    /// A `gpg.program` replacement that always fails the way real GPG does,
    /// so signing failures can be tested without a real GPG/SSH signing setup.
    /// Written under the system temp directory rather than inside the test
    /// repository, so the fixture script itself never shows up as an
    /// untracked file in that repository's status.
    #[cfg(target_os = "windows")]
    fn write_fake_failing_gpg(label: &str) -> String {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "gitodrile-fake-gpg-{label}-{}.bat",
            std::process::id()
        ));
        fs::write(
            &path,
            "@echo off\r\necho gpg failed to sign the data 1>&2\r\nexit /b 1\r\n",
        )
        .expect("write fake gpg script");
        path.to_string_lossy().replace('\\', "/")
    }

    #[cfg(not(target_os = "windows"))]
    fn write_fake_failing_gpg(label: &str) -> String {
        use std::os::unix::fs::PermissionsExt;
        let mut path = std::env::temp_dir();
        path.push(format!(
            "gitodrile-fake-gpg-{label}-{}.sh",
            std::process::id()
        ));
        fs::write(
            &path,
            "#!/bin/sh\necho 'gpg failed to sign the data' 1>&2\nexit 1\n",
        )
        .expect("write fake gpg script");
        let mut perms = fs::metadata(&path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&path, perms).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn save_version_rejects_an_empty_title() {
        let path = unique_temp_dir("save-empty-title");
        git_init(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-empty-title");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        let error = save_version_with_identity_override(
            path.clone(),
            "   ".to_string(),
            None,
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect_err("a whitespace-only title must be rejected");
        assert_eq!(error.code, AppErrorCode::EmptyTitle);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_rejects_a_multiline_title() {
        let path = unique_temp_dir("save-multiline-title");
        git_init(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-multiline-title");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        let error = save_version_with_identity_override(
            path.clone(),
            "title\nunexpected body".to_string(),
            None,
            plan.state_token,
            Some(&identity),
        )
        .expect_err("a multiline title must be rejected at the Rust boundary");
        assert_eq!(error.code, AppErrorCode::InvalidTitle);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_creates_a_title_only_commit_message_with_no_trailing_blank_paragraph() {
        let path = unique_temp_dir("save-title-only-message");
        git_init(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-title-only-message");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        let result = save_version_with_identity_override(
            path.clone(),
            "  title only  ".to_string(),
            Some("   ".to_string()),
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect("save should succeed");

        assert_eq!(result.title, "title only");
        assert_eq!(
            result.description, None,
            "a blank details field is no details"
        );

        let full_message = git_stdout(&run_git(&path, &["log", "-1", "--format=%B"]).unwrap());
        assert_eq!(
            full_message.trim_end(),
            "title only",
            "no empty trailing paragraph should be appended"
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_creates_a_conventional_subject_blank_line_and_body_commit_message() {
        let path = unique_temp_dir("save-title-and-description");
        git_init(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-title-and-description");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        let result = save_version_with_identity_override(
            path.clone(),
            "  Añadir soporte de emojis 🎉  ".to_string(),
            Some("  Primera línea.\n\nSegunda línea con más contexto.  ".to_string()),
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect("save should succeed");

        assert_eq!(result.title, "Añadir soporte de emojis 🎉");
        assert_eq!(
            result.description.as_deref(),
            Some("Primera línea.\n\nSegunda línea con más contexto.")
        );

        let full_message = git_stdout(&run_git(&path, &["log", "-1", "--format=%B"]).unwrap());
        assert_eq!(
            full_message.trim_end(),
            "Añadir soporte de emojis 🎉\n\nPrimera línea.\n\nSegunda línea con más contexto."
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_creates_the_first_commit_on_an_unborn_branch() {
        let path = unique_temp_dir("save-first-commit");
        git_init(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-first-commit");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        assert!(plan.is_first_version);

        let result = save_version_with_identity_override(
            path.clone(),
            "first version".to_string(),
            None,
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect("first save should succeed");

        assert_eq!(result.saved_files, 1);
        assert_eq!(
            git_stdout(&run_git(&path, &["rev-list", "--count", "HEAD"]).unwrap()),
            "1"
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_commits_every_change_kind_and_excludes_ignored_files() {
        let path = unique_temp_dir("save-full-flow");
        git_init(&path);
        write_file(&path, ".gitignore", "ignored.txt\n");
        write_file(&path, "keep.txt", "unchanged\n");
        write_file(&path, "to-modify.txt", "original\n");
        write_file(&path, "to-delete.txt", "bye\n");
        write_file(
            &path,
            "to-rename.txt",
            "rename me, with enough unique content to be detected as a rename\n",
        );
        git_add_all(&path);
        git_commit(&path, "base");

        write_file(&path, "to-modify.txt", "changed\n");
        fs::remove_file(Path::new(&path).join("to-delete.txt")).expect("delete file");
        fs::rename(
            Path::new(&path).join("to-rename.txt"),
            Path::new(&path).join("renamed.txt"),
        )
        .expect("rename file");
        write_file(&path, "new-file.txt", "brand new\n");
        write_file(&path, "ignored.txt", "should stay out\n");
        // Unstaged renames are reported by `git status` as a plain delete +
        // add, not a rename (rename detection only kicks in once a change is
        // staged) — matching the pattern the existing diff/rename tests
        // already rely on. Staging here previews the same categorization
        // `save_version`'s own `git add -A` would produce.
        git_add_all(&path);

        let identity = write_test_identity_config("save-full-flow");
        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        assert_eq!(
            plan.total_files, 4,
            "modify, delete, rename, new — ignored excluded"
        );

        let result = save_version_with_identity_override(
            path.clone(),
            "  save everything  ".to_string(),
            None,
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect("save should succeed");

        assert_eq!(result.title, "save everything");
        assert_eq!(result.description, None);
        assert_eq!(result.saved_files, 4);
        assert_eq!(result.commit.len(), 40);
        assert!(result.commit.starts_with(&result.short_commit));

        let status_after = read_working_tree_status(path.clone()).expect("status after save");
        assert!(status_after.is_clean, "everything should be committed");

        let tracked = git_stdout(&run_git(&path, &["ls-files"]).unwrap());
        assert!(
            !tracked.contains("ignored.txt"),
            "ignored files must never be committed"
        );
        assert!(tracked.contains("renamed.txt"));
        assert!(!tracked.contains("to-delete.txt"));

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_commits_only_the_selected_files() {
        let path = unique_temp_dir("save-selection");
        git_init(&path);
        write_file(&path, "selected.txt", "before\n");
        write_file(&path, "pending.txt", "before\n");
        git_add_all(&path);
        git_commit(&path, "base");
        write_file(&path, "selected.txt", "saved\n");
        write_file(&path, "pending.txt", "still pending\n");
        let identity = write_test_identity_config("save-selection");
        let selected = Some(vec!["selected.txt".to_string()]);

        let plan = plan_save_version_selection_with_identity_override(
            path.clone(),
            selected.clone(),
            Some(&identity),
        )
        .expect("partial plan should succeed");
        assert!(plan.is_partial);
        assert_eq!(plan.total_files, 1);
        assert_eq!(plan.remaining_files, 1);

        save_version_selection_with_identity_override(
            path.clone(),
            "save one file".to_string(),
            None,
            plan.state_token,
            selected,
            Some(&identity),
        )
        .expect("partial save should succeed");

        assert_eq!(
            git_stdout(&run_git(&path, &["show", "HEAD:selected.txt"]).unwrap()),
            "saved"
        );
        assert_eq!(
            git_stdout(&run_git(&path, &["show", "HEAD:pending.txt"]).unwrap()),
            "before"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&path).join("pending.txt")).unwrap(),
            "still pending\n"
        );
        let status = read_working_tree_status(path.clone()).expect("remaining status");
        assert_eq!(status.counts.total, 1);
        assert_eq!(status.entries[0].path, "pending.txt");

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_includes_both_prepared_and_later_changes_to_the_same_file() {
        let path = unique_temp_dir("save-prepared-and-unprepared");
        git_init(&path);
        write_file(&path, "file.txt", "one\ntwo\n");
        git_add_all(&path);
        git_commit(&path, "base");
        write_file(&path, "file.txt", "ONE\ntwo\n");
        git_add(&path, "file.txt");
        write_file(&path, "file.txt", "ONE\nTWO\n");
        let identity = write_test_identity_config("save-prepared-and-unprepared");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("mixed plan should succeed");
        assert!(plan.has_prepared_changes);

        save_version_with_identity_override(
            path.clone(),
            "save complete file".to_string(),
            None,
            plan.state_token,
            Some(&identity),
        )
        .expect("mixed save should succeed");

        assert_eq!(
            git_stdout(&run_git(&path, &["show", "HEAD:file.txt"]).unwrap()),
            "ONE\nTWO"
        );
        assert!(
            read_working_tree_status(path.clone())
                .expect("status after mixed save")
                .is_clean
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_plan_token_changes_when_the_same_file_content_changes_again() {
        let path = unique_temp_dir("save-content-token");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "file.txt", "first\n");
        let identity = write_test_identity_config("save-content-token");

        let first = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("first plan");
        write_file(&path, "file.txt", "second\n");
        let second = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("second plan");

        assert_ne!(first.state_token, second.state_token);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn a_failed_index_restore_is_reported_and_keeps_the_backup() {
        let path = unique_temp_dir("save-restore-failure");
        let backup_path = Path::new(&path).join("original-index.bak");
        fs::write(&backup_path, b"original").expect("write backup");
        let index_directory = Path::new(&path).join("index-as-directory");
        fs::create_dir(&index_directory).expect("create invalid index target");
        let backup = IndexBackup {
            index_path: index_directory,
            backup_path: Some(backup_path.clone()),
        };

        let error = restore_or_report(
            &backup,
            AppError::new(AppErrorCode::GitCommandFailed, "primary failure"),
        );
        assert_eq!(error.code, AppErrorCode::IndexRestoreFailed);
        assert!(backup_path.exists(), "the recovery backup must be retained");

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn save_version_rejects_a_stale_state_token() {
        let path = unique_temp_dir("save-stale-token");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-stale-token");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");

        // Project state drifts after the preview token was captured.
        write_file(&path, "other.txt", "more\n");
        let status_before = read_working_tree_status(path.clone()).expect("status before");

        let error = save_version_with_identity_override(
            path.clone(),
            "a version".to_string(),
            None,
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect_err("a stale plan must be rejected");
        assert_eq!(error.code, AppErrorCode::StalePreview);

        let status_after = read_working_tree_status(path.clone()).expect("status after");
        assert_eq!(status_before, status_after);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_reports_a_hook_rejection_and_leaves_history_untouched() {
        let path = unique_temp_dir("save-hook-rejection");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-hook-rejection");

        let git_dir_raw =
            checked_git_stdout(run_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap())
                .unwrap();
        write_failing_hook(Path::new(&git_dir_raw), "pre-commit");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        let status_before = read_working_tree_status(path.clone()).expect("status before");

        let error = save_version_with_identity_override(
            path.clone(),
            "a version".to_string(),
            None,
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect_err("a rejecting pre-commit hook should fail the save");
        assert_eq!(error.code, AppErrorCode::HookRejected);
        assert!(error.detail.is_some());

        let status_after = read_working_tree_status(path.clone()).expect("status after");
        assert_eq!(status_before, status_after);
        assert_eq!(
            git_stdout(&run_git(&path, &["rev-list", "--count", "HEAD"]).unwrap()),
            "1",
            "no new commit should have been created"
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_restores_the_index_byte_for_byte_after_a_hook_rejection() {
        let path = unique_temp_dir("save-index-restore");
        git_init(&path);
        write_file(&path, "tracked.txt", "base\n");
        git_add_all(&path);
        git_commit(&path, "base");
        write_file(&path, "tracked.txt", "changed\n");
        write_file(&path, "extra.txt", "new\n");
        let identity = write_test_identity_config("save-index-restore");

        let index_path = resolve_index_path(&path).expect("resolve index path");
        let original_index_bytes = fs::read(&index_path).expect("read original index");

        let git_dir_raw =
            checked_git_stdout(run_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap())
                .unwrap();
        write_failing_hook(Path::new(&git_dir_raw), "pre-commit");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        let error = save_version_with_identity_override(
            path.clone(),
            "a version".to_string(),
            None,
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect_err("hook rejection should fail the save");
        assert_eq!(error.code, AppErrorCode::HookRejected);

        let restored_index_bytes = fs::read(&index_path).expect("read restored index");
        assert_eq!(original_index_bytes, restored_index_bytes);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_leaves_no_index_behind_when_a_first_save_fails() {
        let path = unique_temp_dir("save-no-index-restore");
        git_init(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-no-index-restore");

        let index_path = resolve_index_path(&path).expect("resolve index path");
        assert!(
            !index_path.exists(),
            "a fresh repo should have no index yet"
        );

        let git_dir_raw =
            checked_git_stdout(run_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap())
                .unwrap();
        write_failing_hook(Path::new(&git_dir_raw), "pre-commit");

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        let error = save_version_with_identity_override(
            path.clone(),
            "a version".to_string(),
            None,
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect_err("hook rejection should fail the first save too");
        assert_eq!(error.code, AppErrorCode::HookRejected);
        assert!(
            !index_path.exists(),
            "no index should exist after a failed first save either"
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
    }

    #[test]
    fn save_version_reports_a_signing_failure() {
        let path = unique_temp_dir("save-signing-failure");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "readme.md", "hello\n");
        let identity = write_test_identity_config("save-signing-failure");

        let fake_gpg = write_fake_failing_gpg("save-signing-failure");
        assert!(git_command(&path)
            .args(["config", "commit.gpgsign", "true"])
            .status()
            .expect("set commit.gpgsign")
            .success());
        assert!(git_command(&path)
            .args(["config", "gpg.program", &fake_gpg])
            .status()
            .expect("set gpg.program")
            .success());

        let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
            .expect("plan should succeed");
        let error = save_version_with_identity_override(
            path.clone(),
            "a version".to_string(),
            None,
            plan.state_token.clone(),
            Some(&identity),
        )
        .expect_err("a failing gpg program should be reported as a signing failure");
        assert_eq!(error.code, AppErrorCode::SigningFailed);
        assert!(error.detail.is_some());

        let status_after = read_working_tree_status(path.clone()).expect("status after");
        assert_eq!(status_after.counts.total, 1);
        assert_eq!(status_after.counts.new_files, 1);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&identity);
        let _ = fs::remove_file(&fake_gpg);
    }

    // ---- read_working_tree_diffs (extra optimization, task 010) ----

    #[test]
    fn split_diff_sections_splits_on_diff_git_lines() {
        let text = "diff --git a/one b/one\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/two b/two\n@@ -1 +1 @@\n-c\n+d\n";
        let sections = split_diff_sections(text);
        assert_eq!(sections.len(), 2);
        assert!(sections[0].starts_with("diff --git a/one b/one"));
        assert!(sections[0].contains("-a\n+b"));
        assert!(sections[1].starts_with("diff --git a/two b/two"));
        assert!(sections[1].contains("-c\n+d"));
    }

    #[test]
    fn split_diff_sections_returns_nothing_for_empty_input() {
        assert!(split_diff_sections("").is_empty());
    }

    #[test]
    fn split_content_lines_drops_the_phantom_line_from_a_trailing_newline() {
        assert_eq!(split_content_lines("a\nb\n"), vec!["a", "b"]);
    }

    #[test]
    fn split_content_lines_keeps_the_final_unterminated_line() {
        assert_eq!(split_content_lines("a\nb"), vec!["a", "b"]);
    }

    #[test]
    fn split_content_lines_returns_nothing_for_empty_content() {
        assert!(split_content_lines("").is_empty());
    }

    fn find_diff<'a>(diffs: &'a [FileDiff], path: &str) -> Option<&'a FileDiff> {
        diffs.iter().find(|diff| match diff {
            FileDiff::Text { path: p, .. }
            | FileDiff::Binary { path: p, .. }
            | FileDiff::TooLarge { path: p, .. }
            | FileDiff::Unchanged { path: p, .. } => p == path,
            FileDiff::Conflict { path: p, .. } => p == path,
        })
    }

    #[test]
    fn read_working_tree_diffs_batches_every_tracked_change_into_one_process() {
        let path = unique_temp_dir("batch-diffs-tracked");
        git_init(&path);
        write_file(&path, "one.txt", "one\n");
        write_file(&path, "two.txt", "two\n");
        git_add_all(&path);
        git_commit(&path, "base");
        write_file(&path, "one.txt", "one changed\n");
        write_file(&path, "two.txt", "two changed\n");

        let diffs = read_working_tree_diffs(path.clone()).expect("batch should succeed");
        assert_eq!(diffs.len(), 2);

        match find_diff(&diffs, "one.txt") {
            Some(FileDiff::Text { hunks, .. }) => {
                assert_eq!(hunks.len(), 1);
                assert!(hunks[0]
                    .lines
                    .iter()
                    .any(|line| line.content == "one changed"));
            }
            other => panic!("expected a text diff for one.txt, got {other:?}"),
        }
        match find_diff(&diffs, "two.txt") {
            Some(FileDiff::Text { hunks, .. }) => {
                assert!(hunks[0]
                    .lines
                    .iter()
                    .any(|line| line.content == "two changed"));
            }
            other => panic!("expected a text diff for two.txt, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_diffs_reads_an_untracked_file_without_invoking_git_diff() {
        let path = unique_temp_dir("batch-diffs-untracked");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "new-file.txt", "hello\nworld\n");

        let diffs = read_working_tree_diffs(path.clone()).expect("batch should succeed");
        assert_eq!(diffs.len(), 1);
        match find_diff(&diffs, "new-file.txt") {
            Some(FileDiff::Text { hunks, change, .. }) => {
                assert_eq!(*change, ChangeCategory::New);
                assert_eq!(hunks.len(), 1);
                assert_eq!(hunks[0].lines.len(), 2);
                assert!(hunks[0]
                    .lines
                    .iter()
                    .all(|line| line.kind == DiffLineKind::Addition));
                assert_eq!(hunks[0].lines[0].content, "hello");
                assert_eq!(hunks[0].lines[1].new_line_number, Some(2));
            }
            other => panic!("expected a text diff for new-file.txt, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_diffs_reports_an_empty_untracked_file_as_unchanged() {
        let path = unique_temp_dir("batch-diffs-empty-untracked");
        git_init(&path);
        git_commit_empty(&path);
        write_file(&path, "empty.txt", "");

        let diffs = read_working_tree_diffs(path.clone()).expect("batch should succeed");
        match find_diff(&diffs, "empty.txt") {
            Some(FileDiff::Unchanged { .. }) => {}
            other => panic!("expected unchanged for an empty new file, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_diffs_reports_a_binary_untracked_file_as_binary() {
        let path = unique_temp_dir("batch-diffs-binary-untracked");
        git_init(&path);
        git_commit_empty(&path);
        fs::write(
            Path::new(&path).join("image.bin"),
            [0u8, 159, 146, 150, 0, 1, 2],
        )
        .expect("write binary file");

        let diffs = read_working_tree_diffs(path.clone()).expect("batch should succeed");
        match find_diff(&diffs, "image.bin") {
            Some(FileDiff::Binary { .. }) => {}
            other => panic!("expected binary for a binary untracked file, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_diffs_excludes_conflicted_entries() {
        let path = unique_temp_dir("batch-diffs-conflict");
        git_init(&path);
        write_file(&path, "file.txt", "base\n");
        git_add_all(&path);
        git_commit(&path, "base");
        let original_branch =
            git_stdout(&run_git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"]).unwrap());

        let status = git_command(&path)
            .args(["checkout", "-q", "-b", "feature"])
            .status()
            .expect("create feature branch");
        assert!(status.success());
        write_file(&path, "file.txt", "feature change\n");
        git_add(&path, "file.txt");
        git_commit(&path, "feature change");

        let status = git_command(&path)
            .args(["checkout", "-q", &original_branch])
            .status()
            .expect("checkout the original branch");
        assert!(status.success());
        write_file(&path, "file.txt", "main change\n");
        git_add(&path, "file.txt");
        git_commit(&path, "main change");

        // An explicit identity is required here too: a clean (non-conflicting)
        // merge would need to auto-commit, and Git checks committer identity
        // before attempting the merge at all, aborting the whole operation
        // untouched on a machine with no configured identity (e.g. CI runners).
        let _ = git_command(&path)
            .args([
                "-c",
                "user.name=GitOdrile Test",
                "-c",
                "user.email=test@gitodrile.local",
                "merge",
                "-q",
                "--no-edit",
                "feature",
            ])
            .status();

        let diffs = read_working_tree_diffs(path.clone()).expect("batch should succeed");
        assert!(
            find_diff(&diffs, "file.txt").is_none(),
            "a conflicted entry must be left for the per-file fallback, not guessed at here"
        );

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_diffs_batches_a_renamed_file() {
        let path = unique_temp_dir("batch-diffs-rename");
        git_init(&path);
        write_file(
            &path,
            "old.txt",
            "same content, renamed with enough text to be detected\n",
        );
        git_add_all(&path);
        git_commit(&path, "base");
        fs::rename(
            Path::new(&path).join("old.txt"),
            Path::new(&path).join("new.txt"),
        )
        .expect("rename file");
        git_add_all(&path);

        let diffs = read_working_tree_diffs(path.clone()).expect("batch should succeed");
        match find_diff(&diffs, "new.txt") {
            Some(FileDiff::Unchanged {
                original_path,
                change,
                ..
            }) => {
                assert_eq!(original_path.as_deref(), Some("old.txt"));
                assert_eq!(*change, ChangeCategory::Renamed);
            }
            other => panic!("expected an unchanged pure rename, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_diffs_batches_a_deleted_file() {
        let path = unique_temp_dir("batch-diffs-delete");
        git_init(&path);
        write_file(&path, "gone.txt", "bye\n");
        git_add_all(&path);
        git_commit(&path, "base");
        fs::remove_file(Path::new(&path).join("gone.txt")).expect("delete file");

        let diffs = read_working_tree_diffs(path.clone()).expect("batch should succeed");
        match find_diff(&diffs, "gone.txt") {
            Some(FileDiff::Text { change, hunks, .. }) => {
                assert_eq!(*change, ChangeCategory::Deleted);
                assert!(hunks[0]
                    .lines
                    .iter()
                    .any(|line| line.kind == DiffLineKind::Deletion));
            }
            other => panic!("expected a text diff for the deleted file, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn read_working_tree_diffs_returns_nothing_for_a_clean_repository() {
        let path = unique_temp_dir("batch-diffs-clean");
        git_init(&path);
        git_commit_empty(&path);

        let diffs = read_working_tree_diffs(path.clone()).expect("batch should succeed");
        assert!(diffs.is_empty());

        let _ = fs::remove_dir_all(&path);
    }

    // ---- Publish (task 011) ----

    fn init_bare_remote(path: &str) {
        let status = git_command(path)
            .args(["init", "--bare", "-q"])
            .status()
            .expect("run git init --bare");
        assert!(status.success(), "git init --bare should succeed");
    }

    fn wire_remote(repo_path: &str, remote_name: &str, remote_path: &str) {
        let status = git_command(repo_path)
            .args(["remote", "add", remote_name, remote_path])
            .status()
            .expect("run git remote add");
        assert!(status.success(), "git remote add should succeed");
    }

    fn remote_branch_sha(remote_path: &str, branch: &str) -> Option<String> {
        let output = git_command(remote_path)
            .args(["rev-parse", "--verify", branch])
            .output()
            .expect("run git rev-parse on the remote");
        output.status.success().then(|| git_stdout(&output))
    }

    #[test]
    fn redact_remote_url_strips_userinfo_credentials() {
        assert_eq!(
            redact_remote_url("https://alice:s3cr3t@example.com/repo.git"),
            "https://example.com/repo.git"
        );
        assert_eq!(
            redact_remote_url("https://ghp_abcdef123@github.com/org/repo.git"),
            "https://github.com/org/repo.git"
        );
    }

    #[test]
    fn redact_remote_url_leaves_urls_without_credentials_untouched() {
        assert_eq!(
            redact_remote_url("https://github.com/org/repo.git"),
            "https://github.com/org/repo.git"
        );
        assert_eq!(
            redact_remote_url("git@github.com:org/repo.git"),
            "git@github.com:org/repo.git"
        );
        assert_eq!(
            redact_remote_url("/local/bare/repo.git"),
            "/local/bare/repo.git"
        );
    }

    #[test]
    fn redact_remote_url_removes_query_tokens_and_fragments() {
        assert_eq!(
            redact_remote_url("https://example.com/repo.git?access_token=secret#fragment"),
            "https://example.com/repo.git"
        );
    }

    #[test]
    fn parse_remote_v_output_keeps_one_entry_per_remote() {
        let output = "origin\thttps://user:pw@example.com/repo.git (fetch)\n\
                       origin\thttps://user:pw@example.com/repo.git (push)\n\
                       upstream\tgit@example.com:org/repo.git (fetch)\n\
                       upstream\tgit@example.com:org/repo.git (push)\n";
        let remotes = parse_remote_v_output(output);
        assert_eq!(remotes.len(), 2);
        assert_eq!(remotes[0].name, "origin");
        assert_eq!(remotes[0].url, "https://example.com/repo.git");
        assert_eq!(remotes[1].name, "upstream");
        assert_eq!(remotes[1].url, "git@example.com:org/repo.git");
    }

    #[test]
    fn resolve_remote_selection_proposes_the_single_configured_remote() {
        let remotes = vec![RemoteInfo {
            name: "origin".to_string(),
            url: "https://example.com/repo.git".to_string(),
        }];
        let remote = resolve_remote_selection(&remotes, None, None).expect("should propose origin");
        assert_eq!(remote, "origin");
    }

    #[test]
    fn resolve_remote_selection_rejects_when_no_remote_is_configured() {
        let error = resolve_remote_selection(&[], None, None).expect_err("no remotes configured");
        assert_eq!(error.code, AppErrorCode::NoRemoteConfigured);
    }

    #[test]
    fn resolve_remote_selection_requires_an_explicit_choice_with_multiple_remotes() {
        let remotes = vec![
            RemoteInfo {
                name: "origin".to_string(),
                url: "https://example.com/a.git".to_string(),
            },
            RemoteInfo {
                name: "upstream".to_string(),
                url: "https://example.com/b.git".to_string(),
            },
        ];
        let error =
            resolve_remote_selection(&remotes, None, None).expect_err("ambiguous without a choice");
        assert_eq!(error.code, AppErrorCode::RemoteSelectionRequired);

        let remote = resolve_remote_selection(&remotes, None, Some("upstream"))
            .expect("an explicit request should resolve");
        assert_eq!(remote, "upstream");
    }

    #[test]
    fn resolve_remote_selection_prefers_the_configured_upstream_over_ambiguity() {
        let remotes = vec![
            RemoteInfo {
                name: "origin".to_string(),
                url: "https://example.com/a.git".to_string(),
            },
            RemoteInfo {
                name: "upstream".to_string(),
                url: "https://example.com/b.git".to_string(),
            },
        ];
        let remote = resolve_remote_selection(&remotes, Some("upstream/main"), None)
            .expect("configured upstream should resolve without asking");
        assert_eq!(remote, "upstream");
    }

    #[test]
    fn resolve_remote_selection_rejects_an_unknown_requested_remote() {
        let remotes = vec![RemoteInfo {
            name: "origin".to_string(),
            url: "https://example.com/repo.git".to_string(),
        }];
        let error = resolve_remote_selection(&remotes, None, Some("does-not-exist"))
            .expect_err("an unconfigured remote name must be rejected");
        assert_eq!(error.code, AppErrorCode::NoRemoteConfigured);
    }

    #[test]
    fn validate_remote_name_rejects_option_shaped_names() {
        let error = validate_remote_name("--upload-pack=evil")
            .expect_err("an option-shaped remote name must be rejected");
        assert_eq!(error.code, AppErrorCode::InvalidSelection);
    }

    #[test]
    fn compute_publish_state_token_is_stable_then_changes_with_remote_state() {
        let target = PublishTarget {
            remote: "origin".to_string(),
            destination_branch: "main".to_string(),
        };
        let first = compute_publish_state_token("abc123", &target, Some("def456"), "main", false);
        let same = compute_publish_state_token("abc123", &target, Some("def456"), "main", false);
        assert_eq!(first, same);

        let after_local_move =
            compute_publish_state_token("zzz999", &target, Some("def456"), "main", false);
        assert_ne!(first, after_local_move);

        let after_remote_move =
            compute_publish_state_token("abc123", &target, Some("newsha"), "main", false);
        assert_ne!(first, after_remote_move);

        let first_publish = compute_publish_state_token("abc123", &target, None, "main", false);
        assert_ne!(first, first_publish);

        let unsaved_files_changed =
            compute_publish_state_token("abc123", &target, Some("def456"), "main", true);
        assert_ne!(first, unsaved_files_changed);
    }

    #[test]
    fn classify_push_failure_recognizes_remote_rejection() {
        let stdout = "To ../remote.git\n!\trefs/heads/main:refs/heads/main\t[remote rejected] (pre-receive hook declined)\n";
        let error = classify_push_failure(stdout, "hook declined\n");
        assert_eq!(error.code, AppErrorCode::RemoteRejected);
    }

    #[test]
    fn classify_push_failure_recognizes_non_fast_forward_as_diverged() {
        let stdout =
            "To ../remote.git\n!\trefs/heads/main:refs/heads/main\t[rejected] (non-fast-forward)\n";
        let error = classify_push_failure(stdout, "");
        assert_eq!(error.code, AppErrorCode::DivergedHistories);
    }

    #[test]
    fn classify_push_failure_recognizes_authentication_failure() {
        let error = classify_push_failure(
            "",
            "fatal: Authentication failed for 'https://example.com/repo.git'\n",
        );
        assert_eq!(error.code, AppErrorCode::AuthenticationFailed);
    }

    /// Sets up a repository with one commit already published to a fresh bare
    /// remote under `origin`, with upstream tracking configured — the common
    /// starting point most publish tests build on.
    fn published_repo_and_remote(label: &str) -> (String, String, String) {
        let repo = unique_temp_dir(&format!("publish-{label}"));
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let branch = current_branch(&repo);

        let remote = unique_temp_dir(&format!("publish-{label}-remote"));
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);

        let plan = plan_publish(repo.clone(), None, None).expect("first plan should succeed");
        publish(repo.clone(), plan.target.remote, plan.state_token, None)
            .expect("first publish should succeed");

        (repo, remote, branch)
    }

    #[test]
    fn plan_publish_reports_the_first_publish_and_publish_creates_upstream() {
        let repo = unique_temp_dir("publish-first");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let branch = current_branch(&repo);

        let remote = unique_temp_dir("publish-first-remote");
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);

        let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
        assert_eq!(plan.operation_kind, OperationKind::RemoteMutation);
        assert!(plan.requires_confirmation);
        assert!(plan.will_create_upstream);
        assert_eq!(plan.target.remote, "origin");
        assert_eq!(plan.target.destination_branch, branch);
        assert_eq!(plan.commit_count, 1);

        let result = publish(repo.clone(), plan.target.remote, plan.state_token, None)
            .expect("publish should succeed");
        assert!(result.created_upstream);
        assert_eq!(result.published_count, 1);
        assert!(result.previous_remote_commit.is_none());
        assert_eq!(
            remote_branch_sha(&remote, &branch),
            Some(result.published_commit)
        );

        let status = read_working_tree_status(repo.clone()).expect("status should read");
        assert_eq!(status.upstream.upstream, Some(format!("origin/{branch}")));

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn ahead_only_publish_succeeds_after_the_first_publish() {
        let (repo, remote, branch) = published_repo_and_remote("ahead-only");

        write_file(&repo, "b.txt", "second\n");
        git_add_all(&repo);
        git_commit(&repo, "second");

        let plan = plan_publish(repo.clone(), None, None).expect("second plan should succeed");
        assert!(!plan.will_create_upstream);
        assert_eq!(plan.commit_count, 1);

        let result = publish(repo.clone(), plan.target.remote, plan.state_token, None)
            .expect("second publish should succeed");
        assert_eq!(result.published_count, 1);
        assert!(result.previous_remote_commit.is_some());
        assert_eq!(
            remote_branch_sha(&remote, &branch),
            Some(result.published_commit)
        );

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn publish_uses_the_configured_upstream_branch_when_its_name_differs_locally() {
        let (repo, remote, original_branch) =
            published_repo_and_remote("different-upstream-branch");

        let rename_status = git_command(&repo)
            .args(["branch", "-m", "feature"])
            .status()
            .expect("rename local branch");
        assert!(rename_status.success());
        write_file(&repo, "feature.txt", "published to main\n");
        git_add_all(&repo);
        git_commit(&repo, "feature work");

        let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
        assert_eq!(plan.local_branch, "feature");
        assert_eq!(plan.target.remote, "origin");
        assert_eq!(plan.target.destination_branch, original_branch);
        assert!(!plan.will_create_upstream);

        let result = publish(repo.clone(), plan.target.remote, plan.state_token, None)
            .expect("publish should use the configured destination");
        assert_eq!(result.target.destination_branch, original_branch);
        assert_eq!(
            remote_branch_sha(&remote, &original_branch),
            Some(result.published_commit)
        );
        assert_eq!(remote_branch_sha(&remote, "feature"), None);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn plan_publish_reports_nothing_to_publish_when_already_up_to_date() {
        let (repo, remote, _branch) = published_repo_and_remote("up-to-date");

        let error = plan_publish(repo.clone(), None, None).expect_err("nothing new should publish");
        assert_eq!(error.code, AppErrorCode::NothingToPublish);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn plan_publish_blocks_when_the_local_branch_is_behind_the_remote() {
        let (repo, remote, branch) = published_repo_and_remote("behind");

        // A second clone advances the remote without repo A's knowledge.
        let other = unique_temp_dir("publish-behind-other");
        let clone_status = base_git_command()
            .args(["clone", "-q", &remote, &other])
            .status()
            .expect("run git clone");
        assert!(clone_status.success(), "clone should succeed");
        write_file(&other, "from-other.txt", "hi\n");
        git_add_all(&other);
        git_commit(&other, "from other clone");
        let push_status = git_command(&other)
            .args(["push", "-q", "origin", &branch])
            .status()
            .expect("run git push from the other clone");
        assert!(
            push_status.success(),
            "the other clone's push should succeed"
        );

        let error =
            plan_publish(repo.clone(), None, None).expect_err("a behind branch must be blocked");
        assert_eq!(error.code, AppErrorCode::BehindRemote);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn plan_publish_blocks_a_diverged_history() {
        let (repo, remote, branch) = published_repo_and_remote("diverged");

        let other = unique_temp_dir("publish-diverged-other");
        let clone_status = base_git_command()
            .args(["clone", "-q", &remote, &other])
            .status()
            .expect("run git clone");
        assert!(clone_status.success(), "clone should succeed");
        write_file(&other, "from-other.txt", "hi\n");
        git_add_all(&other);
        git_commit(&other, "from other clone");
        let push_status = git_command(&other)
            .args(["push", "-q", "origin", &branch])
            .status()
            .expect("run git push from the other clone");
        assert!(
            push_status.success(),
            "the other clone's push should succeed"
        );

        // repo now has its own unpublished commit too, so both sides moved.
        write_file(&repo, "from-repo.txt", "hi\n");
        git_add_all(&repo);
        git_commit(&repo, "from repo");

        let error =
            plan_publish(repo.clone(), None, None).expect_err("a diverged history must be blocked");
        assert_eq!(error.code, AppErrorCode::DivergedHistories);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn publish_rejects_a_state_token_that_went_stale_after_planning() {
        let (repo, remote, branch) = published_repo_and_remote("stale-token");

        write_file(&repo, "b.txt", "second\n");
        git_add_all(&repo);
        git_commit(&repo, "second");
        let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");

        // The remote moves after the plan was produced but before execution.
        let other = unique_temp_dir("publish-stale-other");
        let clone_status = base_git_command()
            .args(["clone", "-q", &remote, &other])
            .status()
            .expect("run git clone");
        assert!(clone_status.success(), "clone should succeed");
        write_file(&other, "from-other.txt", "hi\n");
        git_add_all(&other);
        git_commit(&other, "from other clone");
        let push_status = git_command(&other)
            .args(["push", "-q", "origin", &branch])
            .status()
            .expect("run git push from the other clone");
        assert!(
            push_status.success(),
            "the other clone's push should succeed"
        );

        let error = publish(repo.clone(), plan.target.remote, plan.state_token, None)
            .expect_err("a plan invalidated by a remote change must be rejected");
        assert!(matches!(
            error.code,
            AppErrorCode::StalePublishPlan
                | AppErrorCode::DivergedHistories
                | AppErrorCode::BehindRemote
        ));

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn publish_reports_a_remote_hook_rejection() {
        let repo = unique_temp_dir("publish-hook-rejection");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");

        let remote = unique_temp_dir("publish-hook-rejection-remote");
        init_bare_remote(&remote);
        write_failing_hook(Path::new(&remote), "pre-receive");
        wire_remote(&repo, "origin", &remote);

        let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
        let error = publish(repo.clone(), plan.target.remote, plan.state_token, None)
            .expect_err("a rejecting pre-receive hook should fail the publish");
        assert_eq!(error.code, AppErrorCode::RemoteRejected);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn publish_leaves_unsaved_files_local_and_the_working_tree_and_index_unchanged() {
        let (repo, remote, branch) = published_repo_and_remote("unsaved-files");

        write_file(&repo, "b.txt", "second\n");
        git_add_all(&repo);
        git_commit(&repo, "second");
        write_file(&repo, "untracked.txt", "not saved\n");

        let index_path = resolve_index_path(&repo).expect("resolve index path");
        let index_before = fs::read(&index_path).expect("read index before publish");

        let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
        assert!(plan.has_unsaved_files);

        let result = publish(repo.clone(), plan.target.remote, plan.state_token, None)
            .expect("publish should succeed");
        assert_eq!(
            remote_branch_sha(&remote, &branch),
            Some(result.published_commit)
        );

        let index_after = fs::read(&index_path).expect("read index after publish");
        assert_eq!(
            index_before, index_after,
            "publish must never touch the index"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&repo).join("untracked.txt"))
                .expect("read untracked file"),
            "not saved\n"
        );

        let status = read_working_tree_status(repo.clone()).expect("status should read");
        assert_eq!(status.counts.new_files, 1);
        assert_eq!(status.entries[0].path, "untracked.txt");

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn publish_updates_exactly_one_branch_and_creates_no_tags() {
        let repo = unique_temp_dir("publish-one-ref");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let branch = current_branch(&repo);

        let remote = unique_temp_dir("publish-one-ref-remote");
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);

        let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
        publish(repo.clone(), plan.target.remote, plan.state_token, None)
            .expect("publish should succeed");

        let branches = checked_git_stdout(
            run_git(
                &remote,
                &["for-each-ref", "--format=%(refname)", "refs/heads"],
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(branches, format!("refs/heads/{branch}"));

        let tags = checked_git_stdout(run_git(&remote, &["tag", "--list"]).unwrap()).unwrap();
        assert!(tags.is_empty(), "publish must never create tags");

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn list_unpublished_versions_reports_every_local_commit_without_an_upstream() {
        let repo = unique_temp_dir("unpublished-no-upstream");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        write_file(&repo, "b.txt", "second\n");
        git_add_all(&repo);
        git_commit(&repo, "second");

        let pending =
            list_unpublished_versions(repo.clone()).expect("should list without a remote");
        assert_eq!(pending.total_count, 2);
        assert!(!pending.is_truncated);
        assert_eq!(pending.versions[0].title, "second");
        assert_eq!(pending.versions[0].description, None);
        assert_eq!(pending.versions[1].title, "first");
        assert_eq!(pending.versions[1].description, None);
        assert!(!pending.versions[0].commit.is_empty());
        assert!(!pending.versions[0].short_commit.is_empty());

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn list_unpublished_versions_separates_an_existing_title_and_multiline_description() {
        let repo = unique_temp_dir("unpublished-message-body");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        checked_git_stdout(
            run_git(
                &repo,
                &[
                    "-c",
                    "user.name=GitOdrile Test",
                    "-c",
                    "user.email=test@gitodrile.local",
                    "commit",
                    "-m",
                    "Añadir búsqueda 🔎",
                    "-m",
                    "Primera línea.\n\nSecond paragraph with context.",
                ],
            )
            .unwrap(),
        )
        .expect("commit with a body should succeed");

        let pending = list_unpublished_versions(repo.clone())
            .expect("the existing commit message should be readable");
        assert_eq!(pending.versions.len(), 1);
        assert_eq!(pending.versions[0].title, "Añadir búsqueda 🔎");
        assert_eq!(
            pending.versions[0].description.as_deref(),
            Some("Primera línea.\n\nSecond paragraph with context.")
        );

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn list_unpublished_versions_reports_only_commits_ahead_of_a_published_upstream() {
        let (repo, remote, _branch) = published_repo_and_remote("unpublished-list");

        assert!(list_unpublished_versions(repo.clone())
            .expect("should list with an upstream")
            .versions
            .is_empty());

        write_file(&repo, "b.txt", "second\n");
        git_add_all(&repo);
        git_commit(&repo, "second");
        write_file(&repo, "c.txt", "third\n");
        git_add_all(&repo);
        git_commit(&repo, "third");

        let pending =
            list_unpublished_versions(repo.clone()).expect("should list the two new commits");
        assert_eq!(pending.total_count, 2);
        assert_eq!(pending.versions[0].title, "third");
        assert_eq!(pending.versions[0].description, None);
        assert_eq!(pending.versions[1].title, "second");
        assert_eq!(pending.versions[1].description, None);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn list_unpublished_versions_reports_the_total_when_the_preview_is_truncated() {
        let repo = unique_temp_dir("unpublished-truncated");
        git_init(&repo);
        for _ in 0..(MAX_LISTED_SAVED_VERSIONS + 1) {
            git_commit_empty(&repo);
        }

        let pending =
            list_unpublished_versions(repo.clone()).expect("should report the capped preview");
        assert_eq!(pending.total_count, (MAX_LISTED_SAVED_VERSIONS + 1) as u32);
        assert_eq!(pending.versions.len(), MAX_LISTED_SAVED_VERSIONS);
        assert!(pending.is_truncated);

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn read_commit_file_changes_classifies_the_root_commit_as_entirely_new() {
        let repo = unique_temp_dir("commit-files-root");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        write_file(&repo, "b.txt", "world\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        let files =
            read_commit_file_changes(repo.clone(), commit).expect("should read root commit files");
        assert_eq!(files.len(), 2);
        assert!(files
            .iter()
            .all(|file| file.category == ChangeCategory::New && file.original_path.is_none()));

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn read_commit_file_changes_classifies_modify_delete_and_rename() {
        let repo = unique_temp_dir("commit-files-mixed");
        git_init(&repo);
        write_file(&repo, "keep.txt", "unchanged\n");
        write_file(&repo, "to-modify.txt", "before\n");
        write_file(&repo, "to-delete.txt", "temporary\n");
        write_file(&repo, "to-rename.txt", "rename me please, this needs to be long enough for git to detect a rename by similarity\n");
        git_add_all(&repo);
        git_commit(&repo, "base");

        write_file(&repo, "to-modify.txt", "after\n");
        fs::remove_file(Path::new(&repo).join("to-delete.txt")).expect("delete file");
        fs::rename(
            Path::new(&repo).join("to-rename.txt"),
            Path::new(&repo).join("renamed.txt"),
        )
        .expect("rename file");
        git_add_all(&repo);
        git_commit(&repo, "mixed changes");
        let commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        let files =
            read_commit_file_changes(repo.clone(), commit).expect("should read mixed commit files");
        let find = |path: &str| files.iter().find(|file| file.path == path);

        assert_eq!(
            find("to-modify.txt").map(|f| f.category),
            Some(ChangeCategory::Changed)
        );
        assert_eq!(
            find("to-delete.txt").map(|f| f.category),
            Some(ChangeCategory::Deleted)
        );
        let renamed = find("renamed.txt").expect("renamed.txt should be reported");
        assert_eq!(renamed.category, ChangeCategory::Renamed);
        assert_eq!(renamed.original_path.as_deref(), Some("to-rename.txt"));
        assert!(
            find("keep.txt").is_none(),
            "an unchanged file must not be reported"
        );

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn read_commit_file_changes_rejects_a_value_that_looks_like_a_flag() {
        let repo = unique_temp_dir("commit-files-invalid");
        git_init(&repo);
        git_commit_empty(&repo);

        let error = read_commit_file_changes(repo.clone(), "--upload-pack=evil".to_string())
            .expect_err("a flag-shaped commit value must be rejected");
        assert_eq!(error.code, AppErrorCode::InvalidSelection);

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn read_commit_file_diff_reports_hunks_for_a_modified_file() {
        let repo = unique_temp_dir("commit-diff-modify");
        git_init(&repo);
        write_file(&repo, "a.txt", "one\ntwo\nthree\n");
        git_add_all(&repo);
        git_commit(&repo, "base");
        write_file(&repo, "a.txt", "one\nTWO\nthree\n");
        git_add_all(&repo);
        git_commit(&repo, "modify");
        let commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        let diff = read_commit_file_diff(repo.clone(), commit, "a.txt".to_string())
            .expect("should read the commit's diff for this file");
        match diff {
            FileDiff::Text { change, hunks, .. } => {
                assert_eq!(change, ChangeCategory::Changed);
                assert!(!hunks.is_empty());
                assert!(hunks[0].lines.iter().any(|line| line.content == "TWO"));
            }
            other => panic!("expected a text diff, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn read_commit_file_diff_reports_a_root_commit_file_as_a_pure_addition() {
        let repo = unique_temp_dir("commit-diff-root");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        let diff = read_commit_file_diff(repo.clone(), commit, "a.txt".to_string())
            .expect("should read the root commit's diff for this file");
        match diff {
            FileDiff::Text { change, hunks, .. } => {
                assert_eq!(change, ChangeCategory::New);
                assert!(hunks[0]
                    .lines
                    .iter()
                    .all(|line| line.kind == DiffLineKind::Addition));
            }
            other => panic!("expected a text diff, got {other:?}"),
        }

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn read_commit_file_diff_rejects_a_path_not_touched_by_that_commit() {
        let repo = unique_temp_dir("commit-diff-untouched");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        write_file(&repo, "b.txt", "untouched\n");
        git_add_all(&repo);
        git_commit(&repo, "first");

        write_file(&repo, "a.txt", "hello again\n");
        git_add_all(&repo);
        git_commit(&repo, "second");
        let second_commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        let error = read_commit_file_diff(repo.clone(), second_commit, "b.txt".to_string())
            .expect_err("b.txt wasn't touched by the second commit");
        assert_eq!(error.code, AppErrorCode::PathNotChanged);

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn read_commit_file_diff_rejects_a_flag_shaped_commit_value() {
        let repo = unique_temp_dir("commit-diff-invalid");
        git_init(&repo);
        git_commit_empty(&repo);

        let error = read_commit_file_diff(
            repo.clone(),
            "--upload-pack=evil".to_string(),
            "a.txt".to_string(),
        )
        .expect_err("a flag-shaped commit value must be rejected");
        assert_eq!(error.code, AppErrorCode::InvalidSelection);

        let _ = fs::remove_dir_all(&repo);
    }

    // ---- Publish up to a checkpoint (task 011 follow-up) ----

    #[test]
    fn plan_publish_with_up_to_reports_only_the_checkpoint_and_what_remains() {
        let repo = unique_temp_dir("publish-up-to-plan");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let first_commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        write_file(&repo, "b.txt", "second\n");
        git_add_all(&repo);
        git_commit(&repo, "second");
        write_file(&repo, "c.txt", "third\n");
        git_add_all(&repo);
        git_commit(&repo, "third");

        let remote = unique_temp_dir("publish-up-to-plan-remote");
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);

        let plan = plan_publish(repo.clone(), None, Some(first_commit))
            .expect("planning a checkpoint publish should succeed");
        assert_eq!(plan.commit_count, 1);
        assert_eq!(plan.remaining_after_publish, 2);
        assert_eq!(plan.commit_summary.len(), 1);
        assert_eq!(plan.commit_summary[0].title, "first");
        assert_eq!(plan.commit_summary[0].description, None);
        assert_eq!(plan.remaining_commit_summary.len(), 2);
        assert_eq!(plan.remaining_commit_summary[0].title, "third");
        assert_eq!(plan.remaining_commit_summary[0].description, None);
        assert_eq!(plan.remaining_commit_summary[1].title, "second");
        assert_eq!(plan.remaining_commit_summary[1].description, None);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn publish_with_up_to_only_pushes_the_checkpoint_and_leaves_newer_commits_local() {
        let repo = unique_temp_dir("publish-up-to-exec");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let first_commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());
        let branch = current_branch(&repo);

        write_file(&repo, "b.txt", "second\n");
        git_add_all(&repo);
        git_commit(&repo, "second");
        let second_commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        let remote = unique_temp_dir("publish-up-to-exec-remote");
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);

        let plan = plan_publish(repo.clone(), None, Some(first_commit.clone()))
            .expect("planning a checkpoint publish should succeed");
        let result = publish(
            repo.clone(),
            plan.target.remote,
            plan.state_token,
            Some(first_commit.clone()),
        )
        .expect("publishing up to the checkpoint should succeed");

        assert_eq!(result.published_commit, first_commit);
        assert_eq!(result.published_count, 1);
        assert_eq!(result.remaining_after_publish, 1);
        assert!(result.created_upstream);
        assert_eq!(remote_branch_sha(&remote, &branch), Some(first_commit));
        assert_ne!(remote_branch_sha(&remote, &branch), Some(second_commit));

        let pending = list_unpublished_versions(repo.clone()).expect("should list what remains");
        assert_eq!(pending.total_count, 1);
        assert_eq!(pending.versions[0].title, "second");
        assert_eq!(pending.versions[0].description, None);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn plan_publish_rejects_an_up_to_commit_that_is_not_an_ancestor_of_head() {
        let repo = unique_temp_dir("publish-up-to-unrelated");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let branch = current_branch(&repo);

        let orphan_status = git_command(&repo)
            .args(["checkout", "--orphan", "unrelated-branch", "-q"])
            .status()
            .expect("run git checkout --orphan");
        assert!(orphan_status.success(), "checkout --orphan should succeed");
        write_file(&repo, "x.txt", "unrelated\n");
        git_add_all(&repo);
        git_commit(&repo, "unrelated");
        let unrelated_commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        let checkout_back = git_command(&repo)
            .args(["checkout", &branch, "-q"])
            .status()
            .expect("run git checkout back");
        assert!(checkout_back.success(), "checkout back should succeed");

        let remote = unique_temp_dir("publish-up-to-unrelated-remote");
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);

        let error = plan_publish(repo.clone(), None, Some(unrelated_commit))
            .expect_err("a commit outside this branch's history must be rejected");
        assert_eq!(error.code, AppErrorCode::InvalidSelection);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn plan_publish_rejects_an_up_to_commit_that_is_already_published() {
        let (repo, remote, _branch) = published_repo_and_remote("up-to-already-published");
        let published_commit = git_stdout(&run_git(&repo, &["rev-parse", "HEAD"]).unwrap());

        write_file(&repo, "b.txt", "second\n");
        git_add_all(&repo);
        git_commit(&repo, "second");

        let error = plan_publish(repo.clone(), None, Some(published_commit))
            .expect_err("an already-published commit must be rejected");
        assert_eq!(error.code, AppErrorCode::NothingToPublish);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    // ---- Version lines (task 016) ----
}

//! System Git diagnostics, installation/update guidance and global identity.
//!
//! These application services back the Settings feature. Platform process
//! details stay here rather than accumulating in the Tauri composition root.

use crate::application;
use crate::error::{AppError, AppErrorCode};
#[cfg(test)]
use crate::git_command::in_test_frame;
use crate::git_command::{git_stdout, run_global_git_with_env};
#[cfg(target_os = "windows")]
use std::io::ErrorKind;
#[cfg(target_os = "windows")]
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(target_os = "windows")]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitDiagnostics {
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

pub(crate) fn parse_git_version(raw_version_output: &str) -> String {
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

pub(crate) fn git_diagnostics() -> GitDiagnostics {
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
pub(crate) struct GitInstallationResult {
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
#[allow(dead_code)]
enum GitInstallationPlatform {
    Windows,
    Macos,
    Linux,
    Unsupported,
}

#[derive(Clone, Copy)]
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

pub(crate) fn install_git() -> GitInstallationResult {
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
pub(crate) struct GitUpdateLaunchResult {
    outcome: GitUpdateLaunchOutcome,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
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

pub(crate) fn update_git() -> GitUpdateLaunchResult {
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
pub(crate) struct GitUpdateStatus {
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

pub(crate) fn check_git_update() -> GitUpdateStatus {
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
pub(crate) struct GitIdentity {
    name: Option<String>,
    email: Option<String>,
}

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

pub(crate) fn get_git_identity() -> GitIdentity {
    let _command = application::enter("get_git_identity");
    GitIdentity {
        name: read_global_git_config("user.name", None),
        email: read_global_git_config("user.email", None),
    }
}

pub(crate) fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
    let _command = application::enter("set_git_identity");
    set_git_identity_with_override(&name, &email, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn git_diagnostics_finds_the_system_git() {
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
            in_test_frame(|| read_global_git_config("user.name", Some(&config_override))),
            None
        );
        in_test_frame(|| {
            set_git_identity_with_override(
                "Ada Lovelace",
                "ada@example.com",
                Some(&config_override),
            )
        })
        .expect("set identity should succeed");
        assert_eq!(
            in_test_frame(|| read_global_git_config("user.name", Some(&config_override))),
            Some("Ada Lovelace".to_string())
        );
        assert_eq!(
            in_test_frame(|| read_global_git_config("user.email", Some(&config_override))),
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
}

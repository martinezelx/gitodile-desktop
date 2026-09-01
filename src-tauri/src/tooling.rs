//! System Git diagnostics, installation/update guidance and global identity.
//!
//! These application services back the Settings feature. Platform process
//! details stay here rather than accumulating in the Tauri composition root.

use crate::application;
use crate::error::{AppError, AppErrorCode};
#[cfg(test)]
use crate::git_command::in_test_frame;
use crate::git_command::{git_stdout, run_global_git_with_env};
use std::collections::HashMap;
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

/// The keys this reads, as one `--get-regexp` pattern.
///
/// One process instead of one per key. Reading `user.name` and `user.email`
/// separately spawned two Git processes to read one file, and line endings
/// spawned two more — at roughly 55 ms per spawn on Windows, that was the
/// whole of the delay before Settings could show what it had found.
pub(crate) fn config_pattern(keys: &[&str]) -> String {
    format!(
        "^({})$",
        keys.iter()
            .map(|key| key.replace('.', "\\."))
            .collect::<Vec<_>>()
            .join("|")
    )
}

/// Parses `git config -z --get-regexp` output into the value Git itself would
/// return for each key.
///
/// `-z` rather than the default line format: entries are separated by NUL and
/// the key from its value by a newline, so a config value that *contains* a
/// newline cannot be mistaken for the next entry. An entry with no newline is
/// a valueless key — one written under a section header with nothing after it
/// — which reads as absent here exactly as `--get` reported it before.
///
/// Later entries overwrite earlier ones because that is Git's own precedence:
/// with a key set more than once, the last one wins, which is what `--get`
/// returns.
pub(crate) fn parse_config_entries(stdout: &str) -> HashMap<String, String> {
    let mut values = HashMap::new();
    for entry in stdout.split('\0').filter(|entry| !entry.is_empty()) {
        if let Some((key, value)) = entry.split_once('\n') {
            let value = value.trim();
            if !value.is_empty() {
                values.insert(key.to_string(), value.to_string());
            }
        }
    }
    values
}

/// Every requested key that the global config defines, in one process.
fn read_global_git_config_many(
    keys: &[&str],
    config_override: Option<&str>,
) -> HashMap<String, String> {
    let envs = config_override
        .map(|path| vec![("GIT_CONFIG_GLOBAL", path)])
        .unwrap_or_default();
    // `--get-regexp` exits non-zero when nothing matches, which is an answer
    // ("none of these are set"), not a failure — so an empty map is returned
    // either way rather than distinguishing them.
    let Ok(output) = run_global_git_with_env(
        [
            "config",
            "--global",
            "-z",
            "--get-regexp",
            &config_pattern(keys),
        ],
        &envs,
    ) else {
        return HashMap::new();
    };
    if !output.status.success() {
        return HashMap::new();
    }
    parse_config_entries(&String::from_utf8_lossy(&output.stdout))
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
    let values = read_global_git_config_many(&["user.name", "user.email"], None);
    GitIdentity {
        name: values.get("user.name").cloned(),
        email: values.get("user.email").cloned(),
    }
}

pub(crate) fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
    let _command = application::enter("set_git_identity");
    set_git_identity_with_override(&name, &email, None)
}

/// What Git is doing to line endings, and whether the answer the panel shows is
/// the one actually in effect.
///
/// `core.autocrlf` is the setting behind the "every line changed and I typed
/// nothing" diff, so it is reported by behaviour rather than by config value.
/// `source` exists because a repository can override the global answer, and
/// showing a global value that a repository ignores would be a confident lie.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitLineEndings {
    mode: LineEndingMode,
    source: LineEndingSource,
    eol: Option<String>,
    project_attributes: bool,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
enum LineEndingMode {
    /// `core.autocrlf=true`: normalize on the way in, Windows endings on disk.
    WindowsCheckout,
    /// `core.autocrlf=input`: normalize on the way in, leave the disk alone.
    Normalize,
    /// `core.autocrlf=false`: no conversion in either direction.
    KeepAsIs,
    NotSet,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
enum LineEndingSource {
    Global,
    Project,
    Unset,
}

/// Git's boolean spelling is wider than `true`/`false`, and a config file
/// written by hand or by another tool is entitled to use any of it.
fn parse_autocrlf(raw: Option<&str>) -> LineEndingMode {
    match raw
        .map(|value| value.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("true" | "yes" | "on" | "1") => LineEndingMode::WindowsCheckout,
        Some("input") => LineEndingMode::Normalize,
        Some("false" | "no" | "off" | "0") => LineEndingMode::KeepAsIs,
        _ => LineEndingMode::NotSet,
    }
}

fn autocrlf_value(mode: &str) -> Option<&'static str> {
    match mode {
        "windows_checkout" => Some("true"),
        "normalize" => Some("input"),
        "keep_as_is" => Some("false"),
        _ => None,
    }
}

/// A `.gitattributes` line only overrides the global setting when it actually
/// says something about text or line endings; a repository that only marks
/// binary types or diff drivers leaves `core.autocrlf` in charge.
fn attributes_affect_line_endings(contents: &str) -> bool {
    contents.lines().any(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            return false;
        }
        line.split_whitespace().skip(1).any(|token| {
            let token = token.trim_start_matches(['-', '!']);
            token == "text" || token.starts_with("text=") || token.starts_with("eol=")
        })
    })
}

fn project_defines_line_ending_attributes(project_path: &str) -> bool {
    let root = std::path::Path::new(project_path);
    [
        root.join(".gitattributes"),
        root.join(".git").join("info").join("attributes"),
    ]
    .iter()
    .filter_map(|path| std::fs::read_to_string(path).ok())
    .any(|contents| attributes_affect_line_endings(&contents))
}

/// Pure resolution so the panel's wording is decided by a testable rule rather
/// than by whichever Git call happened to answer last.
fn line_endings_from_values(
    global: Option<&str>,
    effective: Option<&str>,
    eol: Option<&str>,
    project_attributes: bool,
) -> GitLineEndings {
    let source = match effective {
        None => LineEndingSource::Unset,
        Some(value) if global.map(str::trim) == Some(value.trim()) => LineEndingSource::Global,
        Some(_) => LineEndingSource::Project,
    };
    GitLineEndings {
        mode: parse_autocrlf(effective),
        source,
        eol: eol.map(|value| value.trim().to_string()),
        project_attributes,
    }
}

fn read_project_git_config(
    project_path: &str,
    keys: &[&str],
    config_override: Option<&str>,
) -> HashMap<String, String> {
    let envs = config_override
        .map(|path| vec![("GIT_CONFIG_GLOBAL", path)])
        .unwrap_or_default();
    let Ok(output) = crate::git_command::run_git_with_env(
        project_path,
        ["config", "-z", "--get-regexp", &config_pattern(keys)],
        envs.as_slice(),
    ) else {
        return HashMap::new();
    };
    if !output.status.success() {
        return HashMap::new();
    }
    parse_config_entries(&String::from_utf8_lossy(&output.stdout))
}

const LINE_ENDING_KEYS: [&str; 2] = ["core.autocrlf", "core.eol"];

fn read_line_endings(project_path: Option<&str>, config_override: Option<&str>) -> GitLineEndings {
    // Both keys in one process, and the project's pair in one more when there
    // is a project. Four spawns became two, which is the whole of what the
    // panel used to wait for.
    let global = read_global_git_config_many(&LINE_ENDING_KEYS, config_override);
    let global_autocrlf = global.get("core.autocrlf").map(String::as_str);
    let global_eol = global.get("core.eol").map(String::as_str);
    match project_path {
        // Read inside the project so Git itself resolves the precedence between
        // repository and global config; falling back to the global answer keeps
        // an unreadable repository from reporting "not set".
        Some(path) => {
            let project = read_project_git_config(path, &LINE_ENDING_KEYS, config_override);
            line_endings_from_values(
                global_autocrlf,
                project
                    .get("core.autocrlf")
                    .map(String::as_str)
                    .or(global_autocrlf),
                project.get("core.eol").map(String::as_str).or(global_eol),
                project_defines_line_ending_attributes(path),
            )
        }
        None => line_endings_from_values(global_autocrlf, global_autocrlf, global_eol, false),
    }
}

fn set_line_endings_with_override(
    mode: &str,
    config_override: Option<&str>,
) -> Result<(), AppError> {
    let value = autocrlf_value(mode).ok_or_else(|| {
        AppError::new(
            AppErrorCode::InvalidSelection,
            "That isn't one of the line-ending options.",
        )
    })?;
    write_global_git_config("core.autocrlf", value, config_override)
}

pub(crate) fn get_line_endings(project_path: Option<String>) -> GitLineEndings {
    match project_path {
        // A repository read is coordinated like every other one. If the open
        // project can't be authorized the global answer is still true and still
        // worth showing, so this degrades to it rather than failing the panel.
        Some(path) => match application::authorize_repository(&path, "get_line_endings", None) {
            Ok((_context, _access)) => read_line_endings(Some(&path), None),
            Err(_) => {
                let _command = application::enter("get_line_endings");
                read_line_endings(None, None)
            }
        },
        None => {
            let _command = application::enter("get_line_endings");
            read_line_endings(None, None)
        }
    }
}

pub(crate) fn set_line_endings(mode: String) -> Result<(), AppError> {
    let _command = application::enter("set_line_endings");
    set_line_endings_with_override(&mode, None)
}

/// The name Git gives the first version line of a project it creates, read
/// from the global `init.defaultBranch`.
///
/// `None` is an answer rather than a failure: with the key unset, Git falls
/// back to its own built-in default, and reporting a name GitOdile made up
/// would be a lie about what the next `git init` will do.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitDefaultBranch {
    name: Option<String>,
}

/// Git canonicalizes config keys to lower case, and `--get-regexp` both matches
/// and reports them that way, so the read spelling is the stored one while the
/// write uses the documented camel case Git also accepts.
const DEFAULT_BRANCH_READ_KEY: &str = "init.defaultbranch";
const DEFAULT_BRANCH_WRITE_KEY: &str = "init.defaultBranch";

/// Git decides what a branch name may be, so `check-ref-format` decides it
/// here too rather than a hand-written character rule that would drift from it.
/// The cheap checks come first because they need no process at all.
fn validate_default_branch_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    // A leading dash is rejected here rather than by Git: passed on, it would
    // reach `check-ref-format` as an option rather than as the name to check,
    // and Git's answer would then be about the wrong question.
    if name.is_empty() || name.starts_with('-') || name.chars().any(char::is_control) {
        return Err(AppError::new(
            AppErrorCode::InvalidInitialBranch,
            "Enter a valid default version-line name.",
        )
        .with_remediation("Use a Git branch name such as main."));
    }
    let output = run_global_git_with_env(
        ["check-ref-format", "--branch", name],
        &[("GIT_TERMINAL_PROMPT", "0")],
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidInitialBranch,
            "That default version-line name isn't valid in Git.",
        )
        .with_remediation(
            "Choose a name such as main without spaces or Git reference punctuation.",
        ));
    }
    Ok(name.to_string())
}

fn read_default_branch(config_override: Option<&str>) -> GitDefaultBranch {
    let values = read_global_git_config_many(&[DEFAULT_BRANCH_READ_KEY], config_override);
    GitDefaultBranch {
        name: values.get(DEFAULT_BRANCH_READ_KEY).cloned(),
    }
}

fn set_default_branch_with_override(
    name: &str,
    config_override: Option<&str>,
) -> Result<(), AppError> {
    let name = validate_default_branch_name(name)?;
    write_global_git_config(DEFAULT_BRANCH_WRITE_KEY, &name, config_override)
}

pub(crate) fn get_default_branch() -> GitDefaultBranch {
    let _command = application::enter("get_default_branch");
    read_default_branch(None)
}

pub(crate) fn set_default_branch(name: String) -> Result<(), AppError> {
    let _command = application::enter("set_default_branch");
    set_default_branch_with_override(&name, None)
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
    fn config_entries_survive_spaces_newlines_and_non_ascii() {
        // The exact shape `git config -z --get-regexp` writes: key, newline,
        // value, NUL. A value containing a newline is the case the previous
        // line-based format could not have told apart from the next entry.
        let stdout = concat!(
            "user.name\nLuis Muñoz Martínez\0",
            "core.autocrlf\ttrue\0",
            "user.email\nada@example.com\0",
            "core.eol\nfirst\nsecond\0",
        );
        let values = parse_config_entries(stdout);
        assert_eq!(
            values.get("user.name").map(String::as_str),
            Some("Luis Muñoz Martínez")
        );
        assert_eq!(
            values.get("user.email").map(String::as_str),
            Some("ada@example.com")
        );
        assert_eq!(
            values.get("core.eol").map(String::as_str),
            Some("first\nsecond")
        );
        // No newline in the entry means a key written with no value, which
        // reads as absent exactly as `--get` reported it.
        assert_eq!(values.get("core.autocrlf\ttrue"), None);
        assert_eq!(values.get("core.autocrlf"), None);
    }

    #[test]
    fn config_entries_take_the_last_value_git_would_return() {
        // Git's own precedence for a key set more than once: the last one wins,
        // which is what `--get` answered before this read them all at once.
        let values = parse_config_entries("core.autocrlf\ninput\0core.autocrlf\ntrue\0");
        assert_eq!(
            values.get("core.autocrlf").map(String::as_str),
            Some("true")
        );
    }

    #[test]
    fn config_entries_ignore_empty_values_and_empty_output() {
        assert!(parse_config_entries("").is_empty());
        assert!(parse_config_entries("user.name\n   \0").is_empty());
    }

    #[test]
    fn config_pattern_anchors_and_escapes_the_key_separator() {
        // Unescaped, the `.` would match any character, so `user.name` would
        // also match a key like `usersname`.
        assert_eq!(
            config_pattern(&["user.name", "user.email"]),
            r"^(user\.name|user\.email)$"
        );
    }

    #[test]
    fn git_identity_round_trips_through_a_temporary_global_config() {
        let mut config_path = std::env::temp_dir();
        config_path.push(format!("gitodile-test-gitconfig-{}", std::process::id()));
        let _ = fs::remove_file(&config_path);
        let config_override = config_path.to_string_lossy().to_string();

        let read = |override_path: &str| {
            let values = in_test_frame(|| {
                read_global_git_config_many(&["user.name", "user.email"], Some(override_path))
            });
            (
                values.get("user.name").cloned(),
                values.get("user.email").cloned(),
            )
        };

        assert_eq!(read(&config_override), (None, None));
        in_test_frame(|| {
            set_git_identity_with_override(
                "Ada Lovelace",
                "ada@example.com",
                Some(&config_override),
            )
        })
        .expect("set identity should succeed");
        assert_eq!(
            read(&config_override),
            (
                Some("Ada Lovelace".to_string()),
                Some("ada@example.com".to_string())
            )
        );
        let _ = fs::remove_file(&config_path);
    }

    #[test]
    fn default_branch_round_trips_through_a_temporary_global_config() {
        let mut config_path = std::env::temp_dir();
        config_path.push(format!(
            "gitodile-test-default-branch-{}",
            std::process::id()
        ));
        let _ = fs::remove_file(&config_path);
        let config_override = config_path.to_string_lossy().to_string();

        assert_eq!(
            in_test_frame(|| read_default_branch(Some(&config_override))).name,
            None
        );
        in_test_frame(|| set_default_branch_with_override("trunk", Some(&config_override)))
            .expect("a valid branch name should be accepted");
        // Written camel-cased and read back lower-cased: this asserts the two
        // spellings agree, which is the whole reason they are separate consts.
        assert_eq!(
            in_test_frame(|| read_default_branch(Some(&config_override))).name,
            Some("trunk".to_string())
        );
        let _ = fs::remove_file(&config_path);
    }

    #[test]
    fn default_branch_rejects_names_git_would_reject() {
        // Pointed at a scratch config even though every name here is rejected
        // before anything is written: if one ever stopped being rejected, the
        // test must not scribble on the developer's real global config.
        let mut config_path = std::env::temp_dir();
        config_path.push(format!(
            "gitodile-test-default-branch-invalid-{}",
            std::process::id()
        ));
        let _ = fs::remove_file(&config_path);
        let config_override = config_path.to_string_lossy().to_string();

        for name in [" ", "with space", "-leading-dash", "has..dots", "ends/"] {
            let error =
                in_test_frame(|| set_default_branch_with_override(name, Some(&config_override)))
                    .expect_err("an invalid branch name should be rejected");
            assert_eq!(error.code, AppErrorCode::InvalidInitialBranch, "{name}");
        }
        assert!(
            !config_path.exists(),
            "no rejected name may reach the config"
        );
        let _ = fs::remove_file(&config_path);
    }

    #[test]
    fn set_git_identity_rejects_empty_fields() {
        let error = set_git_identity_with_override(" ", "ada@example.com", None)
            .expect_err("empty name should be rejected");
        assert_eq!(error.code, AppErrorCode::InvalidIdentity);
    }

    #[test]
    fn autocrlf_is_read_in_every_spelling_git_accepts() {
        assert_eq!(
            parse_autocrlf(Some("true")),
            LineEndingMode::WindowsCheckout
        );
        assert_eq!(
            parse_autocrlf(Some(" ON ")),
            LineEndingMode::WindowsCheckout
        );
        assert_eq!(parse_autocrlf(Some("input")), LineEndingMode::Normalize);
        assert_eq!(parse_autocrlf(Some("false")), LineEndingMode::KeepAsIs);
        assert_eq!(parse_autocrlf(Some("0")), LineEndingMode::KeepAsIs);
        assert_eq!(parse_autocrlf(None), LineEndingMode::NotSet);
    }

    #[test]
    fn line_endings_say_where_the_effective_value_came_from() {
        let unset = line_endings_from_values(None, None, None, false);
        assert_eq!(unset.mode, LineEndingMode::NotSet);
        assert_eq!(unset.source, LineEndingSource::Unset);

        let global = line_endings_from_values(Some("true"), Some("true"), None, false);
        assert_eq!(global.mode, LineEndingMode::WindowsCheckout);
        assert_eq!(global.source, LineEndingSource::Global);

        // The project answers differently, so reporting the global value would
        // name a setting that is not the one in effect.
        let overridden = line_endings_from_values(Some("true"), Some("input"), Some("lf"), true);
        assert_eq!(overridden.mode, LineEndingMode::Normalize);
        assert_eq!(overridden.source, LineEndingSource::Project);
        assert_eq!(overridden.eol.as_deref(), Some("lf"));
        assert!(overridden.project_attributes);

        // A project setting with nothing global behind it is still the project's.
        let local_only = line_endings_from_values(None, Some("false"), None, false);
        assert_eq!(local_only.source, LineEndingSource::Project);
    }

    #[test]
    fn gitattributes_counts_only_when_it_speaks_about_line_endings() {
        assert!(attributes_affect_line_endings("* text=auto\n"));
        assert!(attributes_affect_line_endings("*.sh text eol=lf\n"));
        assert!(attributes_affect_line_endings("*.png -text\n"));
        assert!(!attributes_affect_line_endings(
            "# text is only mentioned here\n*.png binary\n*.md diff=markdown\n"
        ));
        assert!(!attributes_affect_line_endings(""));
    }

    #[test]
    fn line_endings_round_trip_through_a_temporary_global_config() {
        let mut config_path = std::env::temp_dir();
        config_path.push(format!("gitodile-test-eol-config-{}", std::process::id()));
        let _ = fs::remove_file(&config_path);
        let config_override = config_path.to_string_lossy().to_string();

        let unset = in_test_frame(|| read_line_endings(None, Some(&config_override)));
        assert_eq!(unset.mode, LineEndingMode::NotSet);
        assert_eq!(unset.source, LineEndingSource::Unset);
        assert_eq!(unset.eol, None);

        for (choice, expected) in [
            ("windows_checkout", LineEndingMode::WindowsCheckout),
            ("normalize", LineEndingMode::Normalize),
            ("keep_as_is", LineEndingMode::KeepAsIs),
        ] {
            in_test_frame(|| set_line_endings_with_override(choice, Some(&config_override)))
                .expect("writing the choice should succeed");
            let stored = in_test_frame(|| read_line_endings(None, Some(&config_override)));
            assert_eq!(stored.mode, expected, "reading back {choice}");
            assert_eq!(stored.source, LineEndingSource::Global);
        }

        let _ = fs::remove_file(&config_path);
    }

    #[test]
    fn set_line_endings_rejects_an_option_it_does_not_offer() {
        let error = set_line_endings_with_override("auto", None)
            .expect_err("an unknown option should be rejected");
        assert_eq!(error.code, AppErrorCode::InvalidSelection);
    }

    #[test]
    fn a_project_setting_is_reported_over_the_global_one() {
        let repo = crate::test_support::unique_temp_dir("line-endings");
        crate::test_support::git_init(&repo);
        let mut config_path = std::env::temp_dir();
        config_path.push(format!("gitodile-test-eol-project-{}", std::process::id()));
        let _ = fs::remove_file(&config_path);
        let config_override = config_path.to_string_lossy().to_string();
        in_test_frame(|| {
            set_line_endings_with_override("windows_checkout", Some(&config_override))
        })
        .expect("writing the global choice should succeed");

        let status = crate::git_command::git_command(&repo)
            .args(["config", "--local", "core.autocrlf", "input"])
            .status()
            .expect("run git config");
        assert!(status.success(), "setting the local value should succeed");
        crate::test_support::write_file(&repo, ".gitattributes", "* text=auto\n");

        let resolved = in_test_frame(|| read_line_endings(Some(&repo), Some(&config_override)));
        assert_eq!(resolved.mode, LineEndingMode::Normalize);
        assert_eq!(resolved.source, LineEndingSource::Project);
        assert!(resolved.project_attributes);

        let _ = fs::remove_file(&config_path);
        let _ = fs::remove_dir_all(&repo);
    }
}

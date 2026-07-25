#![allow(linker_messages)]

use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::process::Stdio;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(target_os = "windows")]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

fn base_git_command() -> Command {
    // `mut` is only exercised on Windows (creation_flags below); harmless
    // elsewhere, but clippy flags it as unused on non-Windows targets.
    #[allow(unused_mut)]
    let mut command = Command::new("git");
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn git_command(repo_path: &str) -> Command {
    let mut command = base_git_command();
    command.arg("-C").arg(repo_path);
    command
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct AppError {
    code: AppErrorCode,
    message: String,
    remediation: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
enum AppErrorCode {
    PathMissing,
    PathUnusable,
    NotRepository,
    BareRepository,
    GitMissing,
    GitUnusable,
    GitCommandFailed,
    InvalidIdentity,
    GitConfigWriteFailed,
}

impl AppError {
    fn new(code: AppErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            remediation: None,
        }
    }

    fn with_remediation(mut self, remediation: impl Into<String>) -> Self {
        self.remediation = Some(remediation.into());
        self
    }
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<Output, AppError> {
    git_command(repo_path).args(args).output().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(
                AppErrorCode::GitMissing,
                "Git isn't installed, or isn't available on PATH.",
            )
            .with_remediation("Install Git, then reopen GitOdrile and try again.")
        } else {
            AppError::new(AppErrorCode::GitUnusable, "Git couldn't be started.")
                .with_remediation("Check the Git installation and try again.")
        }
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

fn display_path(path: PathBuf) -> String {
    let value = path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        value
            .strip_prefix(r"\\?\UNC\")
            .map(|rest| format!(r"\\{rest}"))
            .or_else(|| value.strip_prefix(r"\\?\").map(ToString::to_string))
            .unwrap_or(value)
    }
    #[cfg(not(target_os = "windows"))]
    {
        value
    }
}

fn normalized_path(base: &Path, raw_path: &str) -> PathBuf {
    let path = Path::new(raw_path);
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    };
    absolute.canonicalize().unwrap_or(absolute)
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct RepositoryInfo {
    name: String,
    path: String,
    selected_path: String,
    git_dir: String,
    common_git_dir: String,
    branch: Option<String>,
    head_state: HeadState,
    kind: RepositoryKind,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
enum RepositoryKind {
    Repository,
    Worktree,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
enum HeadState {
    Branch,
    Detached,
    Unborn,
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

#[tauri::command]
fn app_status() -> &'static str {
    "GitOdrile is ready"
}

#[tauri::command]
fn open_repository(path: String) -> Result<RepositoryInfo, AppError> {
    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "That folder doesn't exist.")
                .with_remediation("Choose another folder.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "That folder can't be read.")
                .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(
            AppError::new(AppErrorCode::PathUnusable, "That path isn't a folder.")
                .with_remediation("Choose a folder instead of a file."),
        );
    }
    let selected_path_buf = repo_path.canonicalize().map_err(|_| {
        AppError::new(AppErrorCode::PathUnusable, "That folder can't be resolved.")
            .with_remediation("Check the folder permissions and try again.")
    })?;
    let selected_path = display_path(selected_path_buf.clone());

    let is_repo = run_git(&path, &["rev-parse", "--is-inside-work-tree"])?;
    if !is_repo.status.success() {
        return Err(AppError::new(
            AppErrorCode::NotRepository,
            "This folder isn't inside a Git project.",
        )
        .with_remediation("Choose a folder inside an existing Git project."));
    }
    if git_stdout(&is_repo) != "true" {
        let is_bare = run_git(&path, &["rev-parse", "--is-bare-repository"])?;
        if is_bare.status.success() && git_stdout(&is_bare) == "true" {
            return Err(AppError::new(
                AppErrorCode::BareRepository,
                "Bare Git repositories aren't supported yet.",
            )
            .with_remediation("Choose a project folder with working files."));
        }
        return Err(AppError::new(
            AppErrorCode::NotRepository,
            "This folder isn't inside a Git project.",
        )
        .with_remediation("Choose a folder inside an existing Git project."));
    }

    let root = checked_git_stdout(run_git(&path, &["rev-parse", "--show-toplevel"])?)?;
    let root_path = normalized_path(repo_path, &root);
    let git_dir_raw = checked_git_stdout(run_git(&path, &["rev-parse", "--absolute-git-dir"])?)?;
    let common_dir_raw = checked_git_stdout(run_git(&path, &["rev-parse", "--git-common-dir"])?)?;
    let git_dir_path = normalized_path(&root_path, &git_dir_raw);
    // `--git-common-dir` is relative to the directory passed to `git -C`,
    // not necessarily to the worktree root. Resolving it from `root_path`
    // misclassified a normal repository when the user selected a nested
    // folder (for example, `src` yields `../.git`).
    let common_dir_path = normalized_path(&selected_path_buf, &common_dir_raw);

    // A linked worktree has its own Git directory but shares a common Git
    // directory with the main checkout.
    let kind = if git_dir_path == common_dir_path {
        RepositoryKind::Repository
    } else {
        RepositoryKind::Worktree
    };

    let symbolic_head = run_git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let (branch, head_state) = if symbolic_head.status.success() {
        let branch = Some(git_stdout(&symbolic_head));
        let verified_head = run_git(&path, &["rev-parse", "--verify", "HEAD"])?;
        if verified_head.status.success() {
            (branch, HeadState::Branch)
        } else {
            (branch, HeadState::Unborn)
        }
    } else {
        let verified_head = run_git(&path, &["rev-parse", "--verify", "HEAD"])?;
        if verified_head.status.success() {
            (None, HeadState::Detached)
        } else {
            (None, HeadState::Unborn)
        }
    };

    let name = root_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| display_path(root_path.clone()));

    Ok(RepositoryInfo {
        name,
        path: display_path(root_path),
        selected_path,
        git_dir: display_path(git_dir_path),
        common_git_dir: display_path(common_dir_path),
        branch,
        head_state,
        kind,
    })
}

#[tauri::command]
fn git_diagnostics() -> GitDiagnostics {
    let attempt = match base_git_command().arg("--version").output() {
        Ok(output) => ProcessAttempt::Completed {
            success: output.status.success(),
            stdout: git_stdout(&output),
        },
        Err(error) if error.kind() == ErrorKind::NotFound => ProcessAttempt::Missing,
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

#[tauri::command]
fn install_git() -> GitInstallationResult {
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

#[tauri::command]
fn update_git() -> GitUpdateLaunchResult {
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

#[tauri::command]
fn check_git_update() -> GitUpdateStatus {
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
    let mut command = base_git_command();
    if let Some(path) = config_override {
        command.env("GIT_CONFIG_GLOBAL", path);
    }
    let output = command
        .args(["config", "--global", "--get", key])
        .output()
        .ok()?;
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
    let mut command = base_git_command();
    if let Some(path) = config_override {
        command.env("GIT_CONFIG_GLOBAL", path);
    }
    let status = command
        .args(["config", "--global", key, value])
        .status()
        .map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                AppError::new(AppErrorCode::GitMissing, "Git isn't available.")
                    .with_remediation("Install Git and try again.")
            } else {
                AppError::new(AppErrorCode::GitUnusable, "Git couldn't be started.")
                    .with_remediation("Check the Git installation and try again.")
            }
        })?;
    if !status.success() {
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

#[tauri::command]
fn get_git_identity() -> GitIdentity {
    GitIdentity {
        name: read_global_git_config("user.name", None),
        email: read_global_git_config("user.email", None),
    }
}

#[tauri::command]
fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
    set_git_identity_with_override(&name, &email, None)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            app_status,
            open_repository,
            git_diagnostics,
            install_git,
            update_git,
            check_git_update,
            get_git_identity,
            set_git_identity
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

        let info = open_repository(path.clone()).expect("a git init'd folder should open");
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

        let info = open_repository(nested.to_string_lossy().to_string())
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

        let error = open_repository(path.clone()).expect_err("a plain folder isn't a repo");
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

        let error = open_repository(path).expect_err("a missing folder can't be opened");
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

        let error = open_repository(path.clone()).expect_err("a bare repo has no working files");
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

        let info = open_repository(worktree_path.clone()).expect("the linked worktree should open");
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

        let info = open_repository(path.clone()).expect("a detached repository should open");
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
}

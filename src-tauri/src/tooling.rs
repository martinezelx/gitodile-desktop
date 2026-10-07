//! System Git/GitHub/GitLab CLI diagnostics, installation/update guidance and Git identity.
//!
//! These application services back the Settings feature. Platform process
//! details stay here rather than accumulating in the Tauri composition root.

use crate::application;
use crate::error::{AppError, AppErrorCode};
#[cfg(test)]
use crate::git_command::in_test_frame;
use crate::git_command::{git_stdout, run_global_git_with_env};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::{ErrorKind, Read};
use std::path::{Path, PathBuf};
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
    /// Where the Git that answered lives. Only the system Git reports one,
    /// and only once it ran; the GitHub and GitLab CLIs leave it out.
    #[serde(skip_serializing_if = "Option::is_none")]
    location: Option<GitLocation>,
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
    TimedOut,
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
            location: None,
        },
        ProcessAttempt::Missing => GitDiagnostics {
            state: GitDiagnosticState::Missing,
            version: None,
            location: None,
        },
        ProcessAttempt::Completed { success: false, .. } => GitDiagnostics {
            state: GitDiagnosticState::Unusable,
            version: None,
            location: None,
        },
        ProcessAttempt::FailedToStart | ProcessAttempt::TimedOut => GitDiagnostics {
            state: GitDiagnosticState::CheckFailed,
            version: None,
            location: None,
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
    let mut diagnostics = git_diagnostics_from_attempt(attempt);
    if diagnostics.state == GitDiagnosticState::Available {
        diagnostics.location = locate_git(current_installation_platform());
    }
    diagnostics
}

/// The Git executable GitOdile runs and how it came to be on this machine.
///
/// Answering "which Git is this?" matters most when a machine has more than
/// one — Git for Windows beside the copy GitHub Desktop bundles, or Apple's
/// beside Homebrew's — and the version alone cannot tell them apart.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitLocation {
    executable: String,
    distribution: GitDistribution,
    /// Set for Git for Windows, whose installer offers both.
    scope: Option<GitInstallScope>,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
enum GitDistribution {
    GitForWindows,
    GithubDesktop,
    Scoop,
    Homebrew,
    Macports,
    AppleDeveloperTools,
    SystemPackage,
    Other,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
enum GitInstallScope {
    AllUsers,
    CurrentUser,
}

fn git_program_name(platform: GitInstallationPlatform) -> &'static str {
    match platform {
        GitInstallationPlatform::Windows => "git.exe",
        _ => "git",
    }
}

/// The first `git` on `PATH`, which is the one `Command::new("git")` starts:
/// GitOdile never changes the child's `PATH`, and Git is never installed in
/// the application or Windows system directories Rust searches first.
fn find_on_path(program: &str, path: Option<&OsStr>) -> Option<PathBuf> {
    std::env::split_paths(path?)
        .filter(|directory| directory.is_absolute())
        .map(|directory| directory.join(program))
        .find(|candidate| candidate.is_file())
}

fn locate_git(platform: GitInstallationPlatform) -> Option<GitLocation> {
    let executable = find_on_path(
        git_program_name(platform),
        std::env::var_os("PATH").as_deref(),
    )?;
    // Homebrew and MacPorts link `git` into a shared `bin`; the link target
    // says which one installed it. Windows paths are classified as found:
    // canonicalising there only adds a `\\?\` prefix.
    let resolved = match platform {
        GitInstallationPlatform::Windows => executable.clone(),
        _ => executable
            .canonicalize()
            .unwrap_or_else(|_| executable.clone()),
    };
    let (distribution, scope) = classify_git_location(platform, &executable, &resolved);
    Some(GitLocation {
        executable: executable.to_string_lossy().into_owned(),
        distribution,
        scope,
    })
}

/// Reads the installation from its path alone, so it never runs a process.
/// `found` is the path on `PATH`; `resolved` is where its links lead.
fn classify_git_location(
    platform: GitInstallationPlatform,
    found: &Path,
    resolved: &Path,
) -> (GitDistribution, Option<GitInstallScope>) {
    let normalise = |path: &Path| path.to_string_lossy().replace('\\', "/").to_lowercase();
    let found = normalise(found);
    let resolved = normalise(resolved);
    match platform {
        GitInstallationPlatform::Windows => {
            if found.contains("/appdata/local/githubdesktop/") {
                (GitDistribution::GithubDesktop, None)
            } else if found.contains("/scoop/") {
                (GitDistribution::Scoop, None)
            } else if found.contains("/program files/git/")
                || found.contains("/program files (x86)/git/")
            {
                (
                    GitDistribution::GitForWindows,
                    Some(GitInstallScope::AllUsers),
                )
            } else if found.contains("/appdata/local/programs/git/") {
                (
                    GitDistribution::GitForWindows,
                    Some(GitInstallScope::CurrentUser),
                )
            } else if found.ends_with("/cmd/git.exe") || found.contains("/mingw64/bin/") {
                (GitDistribution::GitForWindows, None)
            } else {
                (GitDistribution::Other, None)
            }
        }
        GitInstallationPlatform::Macos => {
            if resolved.starts_with("/opt/homebrew/") || resolved.contains("/cellar/") {
                (GitDistribution::Homebrew, None)
            } else if resolved.starts_with("/opt/local/") {
                (GitDistribution::Macports, None)
            } else if resolved == "/usr/bin/git"
                || resolved.starts_with("/library/developer/commandlinetools/")
                || resolved.starts_with("/applications/xcode")
            {
                (GitDistribution::AppleDeveloperTools, None)
            } else {
                (GitDistribution::Other, None)
            }
        }
        GitInstallationPlatform::Linux => {
            if resolved.contains("/linuxbrew/") || resolved.contains("/cellar/") {
                (GitDistribution::Homebrew, None)
            } else if resolved.starts_with("/usr/bin/") || resolved.starts_with("/bin/") {
                (GitDistribution::SystemPackage, None)
            } else {
                (GitDistribution::Other, None)
            }
        }
        GitInstallationPlatform::Unsupported => (GitDistribution::Other, None),
    }
}

/// What the Git section shows under "Technical details". Read only when the
/// reader opens that disclosure: it costs several Git processes, and none of
/// it is needed to know whether Git works.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitInstallationDetails {
    /// Git's own `cpu:` build option, such as `x86_64` or `arm64`.
    architecture: Option<String>,
    exec_path: Option<GitPathFact>,
    global_config: Option<GitPathFact>,
    system_config: Option<GitPathFact>,
    credential_helper: GitCredentialHelper,
    large_files_version: Option<String>,
    /// A recognisable name for the editor Git opens, never its full command.
    editor: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct GitPathFact {
    path: String,
    exists: bool,
}

/// Which credential helper signs Git in. Only known helpers are named: a
/// custom `credential.helper` value can be a shell snippet, and those have
/// been known to carry a token inline.
#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
enum GitCredentialHelper {
    None,
    GitCredentialManager,
    MacosKeychain,
    Libsecret,
    WindowsCredentialStore,
    Cache,
    Store,
    Other,
}

fn git_output(args: &[&str]) -> Option<String> {
    let output = run_global_git_with_env(args, &[]).ok()?;
    output
        .status
        .success()
        .then(|| git_stdout(&output))
        .filter(|stdout| !stdout.is_empty())
}

fn is_plain_token(value: &str, extra: &[u8]) -> bool {
    !value.is_empty()
        && value.len() <= 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || extra.contains(&byte))
}

fn parse_build_architecture(build_options: &str) -> Option<String> {
    build_options
        .lines()
        .find_map(|line| line.trim().strip_prefix("cpu:"))
        .map(str::trim)
        .filter(|cpu| is_plain_token(cpu, b"_-"))
        .map(str::to_string)
}

fn parse_lfs_version(output: &str) -> Option<String> {
    output
        .trim()
        .strip_prefix("git-lfs/")?
        .split_whitespace()
        .next()
        .filter(|version| is_plain_token(version, b".-+"))
        .map(str::to_string)
}

/// The helper Git asks last, from `git config -z --get-all` output.
/// `credential.helper` is a list, and an empty entry clears what came before
/// it, so an empty last entry means no helper at all.
fn parse_credential_helper(entries: &str) -> GitCredentialHelper {
    let entries = entries.strip_suffix('\0').unwrap_or(entries);
    let helper = entries.rsplit('\0').next().unwrap_or_default().trim();
    if helper.is_empty() {
        return GitCredentialHelper::None;
    }
    let name = helper.to_lowercase();
    let program = name.split_whitespace().next().unwrap_or_default();
    if name.contains("manager") {
        GitCredentialHelper::GitCredentialManager
    } else if name.contains("osxkeychain") {
        GitCredentialHelper::MacosKeychain
    } else if name.contains("libsecret") {
        GitCredentialHelper::Libsecret
    } else if name.contains("wincred") {
        GitCredentialHelper::WindowsCredentialStore
    } else if program == "cache" {
        GitCredentialHelper::Cache
    } else if program == "store" {
        GitCredentialHelper::Store
    } else {
        GitCredentialHelper::Other
    }
}

/// A name for the editor in `GIT_EDITOR`: the program alone, without the
/// path or arguments around it, and a familiar name for the common ones.
fn editor_name(command: &str) -> Option<String> {
    let command = command.trim();
    let quote = command
        .chars()
        .next()
        .filter(|first| *first == '"' || *first == '\'');
    let program = match quote {
        Some(quote) => command[1..].split(quote).next()?,
        None => command.split_whitespace().next()?,
    };
    let file = program.rsplit(['/', '\\']).next()?.trim();
    let lowered = file.to_lowercase();
    let base = lowered.strip_suffix(".exe").unwrap_or(&lowered);
    let known = match base {
        // `true` and `:` are what scripts set to skip the editor entirely.
        "" | "true" | ":" => return None,
        "code" => "Visual Studio Code",
        "code-insiders" => "Visual Studio Code Insiders",
        "cursor" => "Cursor",
        "windsurf" => "Windsurf",
        "zed" => "Zed",
        "subl" | "sublime_text" => "Sublime Text",
        "notepad++" => "Notepad++",
        "notepad" => "Notepad",
        "vim" | "vi" | "gvim" => "Vim",
        "nvim" => "Neovim",
        "nano" => "nano",
        "emacs" | "emacsclient" => "Emacs",
        "mate" => "TextMate",
        "bbedit" => "BBEdit",
        "gedit" => "gedit",
        "kate" => "Kate",
        "idea" | "idea64" => "IntelliJ IDEA",
        "webstorm" | "webstorm64" => "WebStorm",
        _ => return Some(file.chars().take(64).collect()),
    };
    Some(known.to_string())
}

fn path_fact(path: &str, platform: GitInstallationPlatform) -> GitPathFact {
    // Git for Windows answers with forward slashes; show the path the way
    // the rest of Windows writes it.
    let path = match platform {
        GitInstallationPlatform::Windows => path.trim().replace('/', "\\"),
        _ => path.trim().to_string(),
    };
    GitPathFact {
        exists: Path::new(&path).exists(),
        path,
    }
}

/// `git var GIT_CONFIG_GLOBAL` lists every per-user file Git reads, the XDG
/// one first and `~/.gitconfig` last. `git config --global` writes to
/// `~/.gitconfig` whenever it exists and to the XDG file only when it alone
/// does, so the last file that exists is the one in use; with none yet, the
/// last is where Git will write.
fn global_config_fact(listing: &str, platform: GitInstallationPlatform) -> Option<GitPathFact> {
    let mut candidates = listing
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| path_fact(line, platform))
        .collect::<Vec<_>>();
    let index = candidates
        .iter()
        .rposition(|fact| fact.exists)
        .or(candidates.len().checked_sub(1))?;
    Some(candidates.swap_remove(index))
}

fn read_global_config_fact(platform: GitInstallationPlatform) -> Option<GitPathFact> {
    // `git var GIT_CONFIG_GLOBAL` arrived in Git 2.42; older Gits get no row.
    global_config_fact(&git_output(&["var", "GIT_CONFIG_GLOBAL"])?, platform)
}

fn read_system_config_fact(platform: GitInstallationPlatform) -> Option<GitPathFact> {
    let listing = git_output(&["var", "GIT_CONFIG_SYSTEM"])?;
    Some(path_fact(listing.lines().next()?, platform))
}

pub(crate) fn git_installation_details() -> GitInstallationDetails {
    let _command = application::enter("git_installation_details");
    let platform = current_installation_platform();
    GitInstallationDetails {
        architecture: git_output(&["version", "--build-options"])
            .as_deref()
            .and_then(parse_build_architecture),
        exec_path: git_output(&["--exec-path"])
            .and_then(|path| path.lines().next().map(|line| path_fact(line, platform))),
        global_config: read_global_config_fact(platform),
        system_config: read_system_config_fact(platform),
        // `--get-all` exits 1 when nothing is set, which is an answer.
        credential_helper: git_output(&["config", "-z", "--get-all", "credential.helper"])
            .map(|entries| parse_credential_helper(&entries))
            .unwrap_or(GitCredentialHelper::None),
        large_files_version: git_output(&["lfs", "version"])
            .as_deref()
            .and_then(parse_lfs_version),
        editor: git_output(&["var", "GIT_EDITOR"])
            .as_deref()
            .and_then(editor_name),
    }
}

/// The place the Git section shows in the file manager. The renderer only
/// names which one; the path itself is always found again here, so the
/// webview can never ask for an arbitrary file to be revealed.
pub(crate) fn git_location_path(target: &str) -> Result<PathBuf, AppError> {
    let _command = application::enter("reveal_git_location");
    let platform = current_installation_platform();
    let path = match target {
        "executable" => locate_git(platform).map(|location| PathBuf::from(location.executable)),
        "global_config" => read_global_config_fact(platform)
            .filter(|fact| fact.exists)
            .map(|fact| PathBuf::from(fact.path)),
        "system_config" => read_system_config_fact(platform)
            .filter(|fact| fact.exists)
            .map(|fact| PathBuf::from(fact.path)),
        _ => {
            return Err(AppError::new(
                AppErrorCode::PathInvalid,
                "GitOdile can't show that place.",
            ))
        }
    };
    path.ok_or_else(|| {
        AppError::new(AppErrorCode::PathMissing, "That file is no longer there.")
            .with_remediation("Check Git again, then try once more.")
    })
}

// Only fixed application-owned commands reach this runner. Drain both pipes
// concurrently, retaining at most 64 KiB each, so package-manager output cannot
// fill a pipe while the parent waits for exit.
fn drain_tool_output(mut reader: impl Read) -> Vec<u8> {
    let mut kept = Vec::new();
    let mut buffer = [0_u8; 8192];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => return kept,
            Ok(count) => {
                let retain = count.min((64 * 1024_usize).saturating_sub(kept.len()));
                kept.extend_from_slice(&buffer[..retain]);
            }
        }
    }
}

fn run_tool_probe(mut command: Command, timeout: Duration) -> ProcessAttempt {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == ErrorKind::NotFound => return ProcessAttempt::Missing,
        Err(_) => return ProcessAttempt::FailedToStart,
    };
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let stdout_reader = std::thread::spawn(move || drain_tool_output(stdout));
    let stderr_reader = std::thread::spawn(move || drain_tool_output(stderr));
    let started = Instant::now();
    let cancellation = application::current_cancellation();
    let status = loop {
        if started.elapsed() >= timeout
            || cancellation
                .as_ref()
                .is_some_and(|token| token.is_cancelled())
        {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return ProcessAttempt::TimedOut;
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return ProcessAttempt::FailedToStart;
            }
        }
    };
    let stdout = stdout_reader.join().unwrap_or_default();
    let _ = stderr_reader.join(); // Never return credential or helper error output.
    ProcessAttempt::Completed {
        success: status.success(),
        stdout: String::from_utf8_lossy(&stdout).into_owned(),
    }
}

fn gh_diagnostics_from_attempt(attempt: ProcessAttempt) -> GitDiagnostics {
    match attempt {
        ProcessAttempt::Completed {
            success: true,
            stdout,
        } => {
            let version = stdout
                .lines()
                .next()
                .and_then(|line| line.strip_prefix("gh version "))
                .and_then(|line| line.split_whitespace().next())
                .filter(|version| {
                    let core = version.split(['-', '+']).next().unwrap_or_default();
                    version.len() <= 128
                        && version
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || b".-+".contains(&byte))
                        && core.split('.').count() == 3
                        && core.split('.').all(|part| {
                            !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit())
                        })
                });
            GitDiagnostics {
                state: if version.is_some() {
                    GitDiagnosticState::Available
                } else {
                    GitDiagnosticState::Unusable
                },
                version: version.map(str::to_string),
                location: None,
            }
        }
        attempt => git_diagnostics_from_attempt(attempt),
    }
}

fn gh_probe_programs(platform: GitInstallationPlatform) -> &'static [&'static str] {
    // GUI launches may omit Homebrew/local bins from PATH. Preserve PATH
    // precedence; only a missing executable permits an application-owned fallback.
    match platform {
        GitInstallationPlatform::Macos => &["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"],
        GitInstallationPlatform::Linux => &[
            "gh",
            "/usr/local/bin/gh",
            "/usr/bin/gh",
            "/home/linuxbrew/.linuxbrew/bin/gh",
        ],
        _ => &["gh"],
    }
}

/// Shared fixed discovery policy for machine-level GitHub authentication.
pub(crate) fn gh_program_candidates() -> &'static [&'static str] {
    gh_probe_programs(current_installation_platform())
}

fn probe_gh(
    programs: &[impl AsRef<str>],
    mut probe: impl FnMut(&str) -> ProcessAttempt,
) -> ProcessAttempt {
    for program in programs {
        let attempt = probe(program.as_ref());
        if !matches!(attempt, ProcessAttempt::Missing) {
            return attempt;
        }
    }
    ProcessAttempt::Missing
}

pub(crate) fn gh_diagnostics() -> GitDiagnostics {
    let _command = application::enter("gh_diagnostics");
    let attempt = probe_gh(
        gh_probe_programs(current_installation_platform()),
        |program| {
            let mut command = Command::new(program);
            command
                .arg("--version")
                .env("LC_ALL", "C")
                .env("LANG", "C")
                .env("GH_PROMPT_DISABLED", "1")
                .env("GH_NO_UPDATE_NOTIFIER", "1");
            run_tool_probe(command, Duration::from_secs(15))
        },
    );
    gh_diagnostics_from_attempt(attempt)
}

/// Same fixed PATH-first policy as gh, with independent process/update state.
fn glab_probe_programs(
    platform: GitInstallationPlatform,
    windows_roots: &[std::path::PathBuf],
) -> Vec<String> {
    let programs: &[&str] = match platform {
        GitInstallationPlatform::Macos => {
            &["glab", "/opt/homebrew/bin/glab", "/usr/local/bin/glab"]
        }
        GitInstallationPlatform::Linux => &[
            "glab",
            "/usr/local/bin/glab",
            "/usr/bin/glab",
            "/home/linuxbrew/.linuxbrew/bin/glab",
        ],
        _ => &["glab"],
    };
    let mut programs: Vec<String> = programs.iter().map(|program| (*program).into()).collect();
    if platform == GitInstallationPlatform::Windows {
        for root in windows_roots.iter().filter(|root| root.is_absolute()) {
            let program = root
                .join("glab")
                .join("glab.exe")
                .to_string_lossy()
                .into_owned();
            if !programs.contains(&program) {
                programs.push(program);
            }
        }
    }
    programs
}

pub(crate) fn glab_program_candidates() -> Vec<String> {
    // Installers update the user's PATH, not the environment of an already
    // running desktop process. Both diagnostics and authentication must find
    // the same executable without mutating the app's global environment.
    let mut roots = Vec::new();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        roots.push(std::path::PathBuf::from(local).join("Programs"));
    }
    for key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(key) {
            roots.push(std::path::PathBuf::from(root));
        }
    }
    glab_probe_programs(current_installation_platform(), &roots)
}

/// glab's released binary prints `glab X.Y.Z`; retain the labelled
/// spelling too, while each caller validates the numeric version it needs.
pub(crate) fn glab_version(stdout: &str) -> Option<&str> {
    let line = stdout.lines().next()?.strip_prefix("glab ")?;
    line.strip_prefix("version ")
        .unwrap_or(line)
        .split_whitespace()
        .next()
}
pub(crate) fn glab_diagnostics() -> GitDiagnostics {
    let _command = application::enter("glab_diagnostics");
    let attempt = probe_gh(&glab_program_candidates(), |program| {
        let mut command = Command::new(program);
        command
            .arg("--version")
            .env("LC_ALL", "C")
            .env("LANG", "C")
            .env("GLAB_CHECK_UPDATE", "false");
        run_tool_probe(command, Duration::from_secs(15))
    });
    glab_diagnostics_from_attempt(attempt)
}

fn glab_diagnostics_from_attempt(attempt: ProcessAttempt) -> GitDiagnostics {
    let attempt = match attempt {
        ProcessAttempt::Completed { success, stdout } => ProcessAttempt::Completed {
            success,
            stdout: glab_version(&stdout)
                .map(|version| format!("gh version {version}"))
                .unwrap_or_default(),
        },
        other => other,
    };
    gh_diagnostics_from_attempt(attempt)
}
pub(crate) fn install_glab() -> GitInstallationResult {
    install_tool(SystemTool::GitLabCli, "install_glab")
}
pub(crate) fn update_glab() -> GitUpdateLaunchResult {
    update_tool(SystemTool::GitLabCli, "update_glab")
}
pub(crate) fn check_glab_update() -> GitUpdateStatus {
    check_tool_update(SystemTool::GitLabCli, "check_glab_update")
}

const GIT_WINDOWS_DOWNLOAD_URL: &str = "https://git-scm.com/install/windows";
const GIT_MACOS_DOWNLOAD_URL: &str = "https://git-scm.com/install/mac";
const GIT_LINUX_DOWNLOAD_URL: &str = "https://git-scm.com/install/linux";
// Independent process state: starting one tool must never suppress the other.
struct ToolState {
    // Installation and upgrade of one package must not overlap.
    mutation_starting: AtomicBool,
    update_check_running: AtomicBool,
    update_cache: Mutex<Option<CachedGitUpdate>>,
}

impl ToolState {
    const fn new() -> Self {
        Self {
            mutation_starting: AtomicBool::new(false),
            update_check_running: AtomicBool::new(false),
            update_cache: Mutex::new(None),
        }
    }
}

static GIT_STATE: ToolState = ToolState::new();
static GH_STATE: ToolState = ToolState::new();
static GLAB_STATE: ToolState = ToolState::new();

#[derive(Clone, Copy)]
enum SystemTool {
    Git,
    GitHubCli,
    GitLabCli,
}

impl SystemTool {
    fn state(self) -> &'static ToolState {
        match self {
            Self::Git => &GIT_STATE,
            Self::GitHubCli => &GH_STATE,
            Self::GitLabCli => &GLAB_STATE,
        }
    }
    fn package_id(self) -> &'static str {
        match self {
            Self::Git => "Git.Git",
            Self::GitHubCli => "GitHub.cli",
            Self::GitLabCli => "GLab.GLab",
        }
    }
    fn guidance_url(self, platform: GitInstallationPlatform) -> Option<&'static str> {
        match (self, platform) {
            (_, GitInstallationPlatform::Unsupported) => None,
            (Self::GitLabCli, _) => Some("https://gitlab.com/gitlab-org/cli#installation"),
            (Self::Git, GitInstallationPlatform::Windows) => Some(GIT_WINDOWS_DOWNLOAD_URL),
            (Self::Git, GitInstallationPlatform::Macos) => Some(GIT_MACOS_DOWNLOAD_URL),
            (Self::Git, GitInstallationPlatform::Linux) => Some(GIT_LINUX_DOWNLOAD_URL),
            (Self::GitHubCli, GitInstallationPlatform::Windows) => {
                Some("https://github.com/cli/cli#windows")
            }
            (Self::GitHubCli, GitInstallationPlatform::Macos) => {
                Some("https://github.com/cli/cli#macos")
            }
            (Self::GitHubCli, GitInstallationPlatform::Linux) => {
                Some("https://github.com/cli/cli/blob/trunk/docs/install_linux.md")
            }
        }
    }
}

#[cfg(target_os = "windows")]
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(15);
const UPDATE_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
#[cfg(any(target_os = "windows", test))]
fn update_check_args(tool: SystemTool) -> [&'static str; 9] {
    [
        "list",
        "--id",
        tool.package_id(),
        "-e",
        "--upgrade-available",
        "--accept-source-agreements",
        "--disable-interactivity",
        "--source",
        "winget",
    ]
}

#[cfg(any(target_os = "windows", test))]
fn tool_install_args(tool: SystemTool, upgrade: bool) -> [&'static str; 8] {
    [
        if upgrade { "upgrade" } else { "install" },
        "--id",
        tool.package_id(),
        "-e",
        "--source",
        "winget",
        "--accept-package-agreements",
        "--accept-source-agreements",
    ]
}

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
    tool: SystemTool,
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
                guidance_url: tool.guidance_url(platform).map(str::to_string),
            },
            Some(InstallSpawnResult::Failed) | None => GitInstallationResult {
                outcome: GitInstallationOutcome::Failed,
                platform,
                guidance_url: tool.guidance_url(platform).map(str::to_string),
            },
        },
        GitInstallationPlatform::Macos => GitInstallationResult {
            outcome: GitInstallationOutcome::Guidance,
            platform,
            guidance_url: tool.guidance_url(platform).map(str::to_string),
        },
        GitInstallationPlatform::Linux => GitInstallationResult {
            outcome: GitInstallationOutcome::Guidance,
            platform,
            guidance_url: tool.guidance_url(platform).map(str::to_string),
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
fn spawn_git_installer(tool: SystemTool) -> (InstallSpawnResult, Option<std::process::Child>) {
    let mut command = Command::new("winget");
    command
        .args(tool_install_args(tool, false))
        .creation_flags(CREATE_NEW_CONSOLE);
    match command.spawn() {
        Ok(child) => (InstallSpawnResult::Started, Some(child)),
        Err(error) if error.kind() == ErrorKind::NotFound => (InstallSpawnResult::Missing, None),
        Err(_) => (InstallSpawnResult::Failed, None),
    }
}

pub(crate) fn install_git() -> GitInstallationResult {
    install_tool(SystemTool::Git, "install_git")
}
pub(crate) fn install_gh() -> GitInstallationResult {
    install_tool(SystemTool::GitHubCli, "install_gh")
}

fn install_tool(tool: SystemTool, command: &'static str) -> GitInstallationResult {
    let _command = application::enter(command);
    if tool.state().mutation_starting.swap(true, Ordering::AcqRel) {
        return GitInstallationResult {
            outcome: GitInstallationOutcome::AlreadyStarting,
            platform: current_installation_platform(),
            guidance_url: None,
        };
    }

    let platform = current_installation_platform();
    #[cfg(target_os = "windows")]
    let result = {
        let background = application::begin_background_activity(command);
        let (attempt, child) = spawn_git_installer(tool);
        if let Some(mut child) = child {
            std::thread::spawn(move || {
                let _background = background;
                let _ = child.wait();
                tool.state()
                    .mutation_starting
                    .store(false, Ordering::Release);
            });
        } else {
            drop(background);
            tool.state()
                .mutation_starting
                .store(false, Ordering::Release);
        }
        installation_result(tool, platform, Some(attempt))
    };
    #[cfg(not(target_os = "windows"))]
    let result = installation_result(tool, platform, None);

    #[cfg(not(target_os = "windows"))]
    tool.state()
        .mutation_starting
        .store(false, Ordering::Release);
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
fn spawn_git_update(tool: SystemTool) -> (GitUpdateLaunchOutcome, Option<std::process::Child>) {
    let mut command = Command::new("winget");
    command
        .args(tool_install_args(tool, true))
        .creation_flags(CREATE_NEW_CONSOLE);
    match command.spawn() {
        Ok(child) => (GitUpdateLaunchOutcome::Started, Some(child)),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            (GitUpdateLaunchOutcome::Unavailable, None)
        }
        Err(_) => (GitUpdateLaunchOutcome::Failed, None),
    }
}

pub(crate) fn update_git() -> GitUpdateLaunchResult {
    update_tool(SystemTool::Git, "update_git")
}
pub(crate) fn update_gh() -> GitUpdateLaunchResult {
    update_tool(SystemTool::GitHubCli, "update_gh")
}

fn update_tool(tool: SystemTool, command: &'static str) -> GitUpdateLaunchResult {
    let _command = application::enter(command);
    if tool.state().mutation_starting.swap(true, Ordering::AcqRel) {
        return GitUpdateLaunchResult {
            outcome: GitUpdateLaunchOutcome::AlreadyStarting,
        };
    }

    #[cfg(target_os = "windows")]
    let outcome = {
        let background = application::begin_background_activity(command);
        let (outcome, child) = spawn_git_update(tool);
        if let Some(mut child) = child {
            std::thread::spawn(move || {
                let _background = background;
                let _ = child.wait();
                tool.state()
                    .mutation_starting
                    .store(false, Ordering::Release);
            });
        } else {
            drop(background);
            tool.state()
                .mutation_starting
                .store(false, Ordering::Release);
        }
        outcome
    };
    #[cfg(not(target_os = "windows"))]
    let outcome = GitUpdateLaunchOutcome::Unavailable;

    #[cfg(not(target_os = "windows"))]
    tool.state()
        .mutation_starting
        .store(false, Ordering::Release);
    if outcome == GitUpdateLaunchOutcome::Started {
        if let Ok(mut cache) = tool.state().update_cache.lock() {
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

fn update_status_from_attempt(tool: SystemTool, attempt: UpdateCheckAttempt) -> GitUpdateStatus {
    let state = match attempt {
        UpdateCheckAttempt::Unavailable => GitUpdateState::Unavailable,
        UpdateCheckAttempt::FailedToStart => GitUpdateState::Failed,
        UpdateCheckAttempt::TimedOut => GitUpdateState::TimedOut,
        UpdateCheckAttempt::Completed {
            success: true,
            output,
        } if output
            .split_whitespace()
            .any(|word| word == tool.package_id()) =>
        {
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

fn cached_update_status(tool: SystemTool, now: Instant) -> Option<GitUpdateStatus> {
    let cache = tool.state().update_cache.lock().ok()?;
    let cached = cache.as_ref()?;
    if now.duration_since(cached.checked_at) >= UPDATE_CACHE_TTL {
        return None;
    }
    Some(GitUpdateStatus {
        state: cached.state,
        cached: true,
    })
}

fn cache_update_status(tool: SystemTool, status: GitUpdateStatus, now: Instant) {
    if !matches!(
        status.state,
        GitUpdateState::UpToDate | GitUpdateState::UpdateAvailable
    ) {
        return;
    }
    if let Ok(mut cache) = tool.state().update_cache.lock() {
        *cache = Some(CachedGitUpdate {
            checked_at: now,
            state: status.state,
        });
    }
}

#[cfg(target_os = "windows")]
fn run_winget_update_check(tool: SystemTool, timeout: Duration) -> UpdateCheckAttempt {
    let mut command = Command::new("winget");
    command.args(update_check_args(tool));
    match run_tool_probe(command, timeout) {
        ProcessAttempt::Missing => UpdateCheckAttempt::Unavailable,
        ProcessAttempt::FailedToStart => UpdateCheckAttempt::FailedToStart,
        ProcessAttempt::TimedOut => UpdateCheckAttempt::TimedOut,
        ProcessAttempt::Completed { success, stdout } => UpdateCheckAttempt::Completed {
            success,
            output: stdout,
        },
    }
}

pub(crate) fn check_git_update() -> GitUpdateStatus {
    check_tool_update(SystemTool::Git, "check_git_update")
}
pub(crate) fn check_gh_update() -> GitUpdateStatus {
    check_tool_update(SystemTool::GitHubCli, "check_gh_update")
}

fn check_tool_update(tool: SystemTool, command: &'static str) -> GitUpdateStatus {
    let _command = application::enter(command);
    let now = Instant::now();
    if let Some(cached) = cached_update_status(tool, now) {
        return cached;
    }
    if tool
        .state()
        .update_check_running
        .swap(true, Ordering::AcqRel)
    {
        return GitUpdateStatus {
            state: GitUpdateState::Checking,
            cached: false,
        };
    }

    #[cfg(target_os = "windows")]
    let status =
        update_status_from_attempt(tool, run_winget_update_check(tool, UPDATE_CHECK_TIMEOUT));
    #[cfg(not(target_os = "windows"))]
    let status = update_status_from_attempt(tool, UpdateCheckAttempt::Unavailable);

    tool.state()
        .update_check_running
        .store(false, Ordering::Release);
    cache_update_status(tool, status, now);
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
    fn glab_finds_windows_installations_without_a_refreshed_path() {
        let root = std::env::temp_dir().join("glab-discovery-fixture");
        let roots = [
            root.join("Local Programs"),
            root.join("Program Files"),
            std::path::PathBuf::from("relative"),
        ];
        let programs = glab_probe_programs(GitInstallationPlatform::Windows, &roots);
        assert_eq!(programs[0], "glab");
        assert_eq!(programs.len(), 3);
        for installed in programs.iter().skip(1) {
            let mut attempts = Vec::new();
            let result = probe_gh(&programs, |program| {
                attempts.push(program.to_owned());
                if program == installed {
                    ProcessAttempt::Completed {
                        success: true,
                        stdout: "glab 1.120.0 (7879011)\r\n".into(),
                    }
                } else {
                    ProcessAttempt::Missing
                }
            });
            assert_eq!(attempts.last(), Some(installed));
            let diagnostics = glab_diagnostics_from_attempt(result);
            assert_eq!(diagnostics.state, GitDiagnosticState::Available);
            assert_eq!(diagnostics.version.as_deref(), Some("1.120.0"));
        }
        // A present but broken PATH executable must not be silently replaced.
        let mut attempts = 0;
        let result = probe_gh(&programs, |_| {
            attempts += 1;
            ProcessAttempt::FailedToStart
        });
        assert_eq!(attempts, 1);
        assert_eq!(
            glab_diagnostics_from_attempt(result).state,
            GitDiagnosticState::CheckFailed
        );
        assert_eq!(
            glab_probe_programs(GitInstallationPlatform::Macos, &roots),
            ["glab", "/opt/homebrew/bin/glab", "/usr/local/bin/glab"]
        );
        assert_eq!(
            glab_probe_programs(GitInstallationPlatform::Linux, &roots),
            [
                "glab",
                "/usr/local/bin/glab",
                "/usr/bin/glab",
                "/home/linuxbrew/.linuxbrew/bin/glab"
            ]
        );
    }

    #[test]
    fn glab_diagnostics_accept_the_released_version_output_and_reject_bad_versions() {
        for stdout in [
            "glab 1.120.0 (7879011)\r\n",
            "glab version 1.120.0 (fixture)\n",
        ] {
            let result = glab_diagnostics_from_attempt(ProcessAttempt::Completed {
                success: true,
                stdout: stdout.into(),
            });
            assert_eq!(result.state, GitDiagnosticState::Available);
            assert_eq!(result.version.as_deref(), Some("1.120.0"));
        }
        for stdout in [
            "gh version 2.80.0",
            "glab 1.120.bad",
            "glab",
            "glab version",
            "untrusted 1.120.0",
        ] {
            assert_eq!(
                glab_diagnostics_from_attempt(ProcessAttempt::Completed {
                    success: true,
                    stdout: stdout.into()
                })
                .state,
                GitDiagnosticState::Unusable
            );
        }
    }

    #[test]
    fn gh_probe_paths_cover_default_gui_installations() {
        assert_eq!(gh_probe_programs(GitInstallationPlatform::Windows), &["gh"]);
        assert_eq!(
            gh_probe_programs(GitInstallationPlatform::Unsupported),
            &["gh"]
        );
        assert_eq!(
            gh_probe_programs(GitInstallationPlatform::Macos),
            &["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"]
        );
        assert_eq!(
            gh_probe_programs(GitInstallationPlatform::Linux),
            &[
                "gh",
                "/usr/local/bin/gh",
                "/usr/bin/gh",
                "/home/linuxbrew/.linuxbrew/bin/gh"
            ]
        );
    }

    #[test]
    fn gh_probe_uses_fallback_only_when_a_program_is_missing() {
        for platform in [
            GitInstallationPlatform::Macos,
            GitInstallationPlatform::Linux,
        ] {
            let programs = gh_probe_programs(platform);
            for target in programs {
                let mut attempted = Vec::new();
                let result = probe_gh(programs, |program| {
                    attempted.push(program.to_owned());
                    if program == *target {
                        ProcessAttempt::Completed {
                            success: true,
                            stdout: "gh version 2.80.0".into(),
                        }
                    } else {
                        ProcessAttempt::Missing
                    }
                });
                assert_eq!(attempted.last().map(String::as_str), Some(*target));
                assert_eq!(
                    gh_diagnostics_from_attempt(result).version.as_deref(),
                    Some("2.80.0")
                );
            }
        }
        for failure in [
            ProcessAttempt::TimedOut,
            ProcessAttempt::FailedToStart,
            ProcessAttempt::Completed {
                success: false,
                stdout: String::new(),
            },
        ] {
            let mut failure = Some(failure);
            let mut attempts = 0;
            let result = probe_gh(gh_probe_programs(GitInstallationPlatform::Macos), |_| {
                attempts += 1;
                failure
                    .take()
                    .expect("must not hide a broken PATH installation")
            });
            assert!(!matches!(result, ProcessAttempt::Missing));
            assert_eq!(attempts, 1);
        }
        assert!(matches!(
            probe_gh(gh_probe_programs(GitInstallationPlatform::Linux), |_| {
                ProcessAttempt::Missing
            }),
            ProcessAttempt::Missing
        ));
    }

    #[test]
    fn gh_version_and_failure_states_are_local_and_structured() {
        let available = gh_diagnostics_from_attempt(ProcessAttempt::Completed {
            success: true,
            stdout: "gh version 2.80.0 (2025-09-23)\r\nhttps://github.com/cli/cli/releases/tag/v2.80.0\r\n".into(),
        });
        assert_eq!(available.state, GitDiagnosticState::Available);
        assert_eq!(available.version.as_deref(), Some("2.80.0"));
        for output in [
            "",
            "git version 2.80.0",
            "gh version unknown",
            "gh version 2..0",
        ] {
            assert_eq!(
                gh_diagnostics_from_attempt(ProcessAttempt::Completed {
                    success: true,
                    stdout: output.into(),
                })
                .state,
                GitDiagnosticState::Unusable
            );
        }
        assert_eq!(
            gh_diagnostics_from_attempt(ProcessAttempt::Missing).state,
            GitDiagnosticState::Missing
        );
        assert_eq!(
            gh_diagnostics_from_attempt(ProcessAttempt::TimedOut).state,
            GitDiagnosticState::CheckFailed
        );
        assert_eq!(
            gh_diagnostics_from_attempt(ProcessAttempt::Completed {
                success: false,
                stdout: "gh version 2.80.0".into(),
            })
            .state,
            GitDiagnosticState::Unusable
        );
    }

    #[test]
    fn gh_installation_uses_official_platform_guidance() {
        for platform in [
            GitInstallationPlatform::Windows,
            GitInstallationPlatform::Macos,
            GitInstallationPlatform::Linux,
        ] {
            let result = installation_result(
                SystemTool::GitHubCli,
                platform,
                Some(InstallSpawnResult::Missing),
            );
            assert_eq!(result.outcome, GitInstallationOutcome::Guidance);
            assert_eq!(
                result.guidance_url.as_deref(),
                SystemTool::GitHubCli.guidance_url(platform)
            );
        }
        assert_eq!(
            installation_result(
                SystemTool::GitHubCli,
                GitInstallationPlatform::Windows,
                Some(InstallSpawnResult::Started)
            )
            .outcome,
            GitInstallationOutcome::Started
        );
        assert_eq!(
            installation_result(
                SystemTool::GitHubCli,
                GitInstallationPlatform::Windows,
                Some(InstallSpawnResult::Failed)
            )
            .outcome,
            GitInstallationOutcome::Failed
        );
        assert_eq!(
            installation_result(
                SystemTool::GitHubCli,
                GitInstallationPlatform::Unsupported,
                None
            )
            .guidance_url,
            None
        );
        assert!(!std::ptr::eq(
            SystemTool::Git.state(),
            SystemTool::GitHubCli.state()
        ));
    }

    #[test]
    fn gh_updates_require_its_exact_package_and_a_successful_query() {
        assert_eq!(update_check_args(SystemTool::GitHubCli)[2], "GitHub.cli");
        for (success, output, expected) in [
            (
                true,
                "GitHub CLI GitHub.cli 2.79.0 2.80.0 winget",
                GitUpdateState::UpdateAvailable,
            ),
            (
                true,
                "Git Git.Git 2.50.0 2.51.0 winget",
                GitUpdateState::UpToDate,
            ),
            (true, "GitHub.cli.other", GitUpdateState::UpToDate),
            (
                false,
                "GitHub.cli source query failed",
                GitUpdateState::Failed,
            ),
        ] {
            assert_eq!(
                update_status_from_attempt(
                    SystemTool::GitHubCli,
                    UpdateCheckAttempt::Completed {
                        success,
                        output: output.into()
                    }
                )
                .state,
                expected
            );
        }
    }

    #[test]
    fn tool_probe_handles_missing_process_and_drains_beyond_retention_limit() {
        let missing = Command::new("gitodile-nonexistent-tool-probe-fixture");
        assert!(matches!(
            run_tool_probe(missing, Duration::from_secs(1)),
            ProcessAttempt::Missing
        ));
        let bytes = vec![b'x'; 256 * 1024];
        let mut cursor = std::io::Cursor::new(bytes);
        assert_eq!(drain_tool_output(&mut cursor).len(), 64 * 1024);
        assert_eq!(cursor.position(), 256 * 1024);
    }

    // Hermetic subprocess fixture: never runs a package manager or changes PATH.
    #[test]
    fn tool_probe_fixture() {
        match std::env::var("GITODILE_TOOL_PROBE_FIXTURE").as_deref() {
            Ok("output") => {
                use std::io::Write;
                let bytes = vec![b'x'; 256 * 1024];
                std::io::stdout().write_all(&bytes).unwrap();
                std::io::stderr().write_all(&bytes).unwrap();
            }
            Ok("sleep") => std::thread::sleep(Duration::from_secs(30)),
            _ => {}
        }
    }

    #[test]
    fn tool_probe_drains_both_pipes_and_stops_on_timeout() {
        let fixture = |mode| {
            let mut command = Command::new(std::env::current_exe().unwrap());
            command
                .args([
                    "--exact",
                    "tooling::tests::tool_probe_fixture",
                    "--nocapture",
                ])
                .env("GITODILE_TOOL_PROBE_FIXTURE", mode);
            command
        };
        match run_tool_probe(fixture("output"), Duration::from_secs(10)) {
            ProcessAttempt::Completed { success, stdout } => {
                assert!(success);
                assert_eq!(stdout.len(), 64 * 1024);
            }
            _ => panic!("both pipes must drain before the deadline"),
        }
        let started = Instant::now();
        assert!(matches!(
            run_tool_probe(fixture("sleep"), Duration::from_millis(100)),
            ProcessAttempt::TimedOut
        ));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn git_diagnostics_finds_the_system_git() {
        let diagnostics = git_diagnostics();
        assert_eq!(diagnostics.state, GitDiagnosticState::Available);
        assert!(diagnostics.version.is_some());
    }

    #[test]
    fn git_location_is_read_from_the_path_on_every_platform() {
        let windows = |path: &str| {
            classify_git_location(
                GitInstallationPlatform::Windows,
                Path::new(path),
                Path::new(path),
            )
        };
        assert_eq!(
            windows(r"C:\Program Files\Git\cmd\git.exe"),
            (
                GitDistribution::GitForWindows,
                Some(GitInstallScope::AllUsers)
            )
        );
        assert_eq!(
            windows(r"C:\Users\ana\AppData\Local\Programs\Git\cmd\git.exe"),
            (
                GitDistribution::GitForWindows,
                Some(GitInstallScope::CurrentUser)
            )
        );
        assert_eq!(
            windows(
                r"C:\Users\ana\AppData\Local\GitHubDesktop\app-3.5.0\resources\app\git\cmd\git.exe"
            ),
            (GitDistribution::GithubDesktop, None)
        );
        assert_eq!(
            windows(r"C:\Users\ana\scoop\shims\git.exe"),
            (GitDistribution::Scoop, None)
        );
        assert_eq!(
            windows(r"D:\tools\PortableGit\cmd\git.exe"),
            (GitDistribution::GitForWindows, None)
        );
        assert_eq!(windows(r"D:\bin\git.exe"), (GitDistribution::Other, None));

        let macos = |found: &str, resolved: &str| {
            classify_git_location(
                GitInstallationPlatform::Macos,
                Path::new(found),
                Path::new(resolved),
            )
            .0
        };
        assert_eq!(
            macos(
                "/opt/homebrew/bin/git",
                "/opt/homebrew/Cellar/git/2.55.0/bin/git"
            ),
            GitDistribution::Homebrew
        );
        assert_eq!(
            macos("/usr/local/bin/git", "/usr/local/Cellar/git/2.55.0/bin/git"),
            GitDistribution::Homebrew
        );
        assert_eq!(
            macos("/usr/bin/git", "/usr/bin/git"),
            GitDistribution::AppleDeveloperTools
        );
        assert_eq!(
            macos("/opt/local/bin/git", "/opt/local/bin/git"),
            GitDistribution::Macports
        );

        let linux = |path: &str| {
            classify_git_location(
                GitInstallationPlatform::Linux,
                Path::new(path),
                Path::new(path),
            )
            .0
        };
        assert_eq!(linux("/usr/bin/git"), GitDistribution::SystemPackage);
        assert_eq!(
            linux("/home/linuxbrew/.linuxbrew/Cellar/git/2.55.0/bin/git"),
            GitDistribution::Homebrew
        );
        assert_eq!(linux("/opt/git/bin/git"), GitDistribution::Other);
    }

    #[test]
    fn git_is_found_on_the_first_path_entry_that_has_it() {
        let root = std::env::temp_dir().join(format!("git-path-fixture-{}", std::process::id()));
        let empty = root.join("empty");
        let first = root.join("first");
        let second = root.join("second");
        for directory in [&empty, &first, &second] {
            fs::create_dir_all(directory).unwrap();
        }
        fs::write(first.join("git-fixture"), "").unwrap();
        fs::write(second.join("git-fixture"), "").unwrap();
        let path = std::env::join_paths([
            PathBuf::from("relative"),
            empty.clone(),
            first.clone(),
            second.clone(),
        ])
        .unwrap();
        assert_eq!(
            find_on_path("git-fixture", Some(&path)),
            Some(first.join("git-fixture"))
        );
        assert_eq!(find_on_path("missing-fixture", Some(&path)), None);
        assert_eq!(find_on_path("git-fixture", None), None);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn installation_details_parse_git_output_without_leaking_it() {
        assert_eq!(
            parse_build_architecture("git version 2.55.0\ncpu: x86_64\nsizeof-long: 4\n")
                .as_deref(),
            Some("x86_64")
        );
        assert_eq!(parse_build_architecture("cpu: x86 64; rm -rf"), None);
        assert_eq!(parse_build_architecture("git version 2.30.0"), None);

        assert_eq!(
            parse_lfs_version("git-lfs/3.7.1 (GitHub; windows amd64; go 1.25.1)").as_deref(),
            Some("3.7.1")
        );
        assert_eq!(parse_lfs_version("git: 'lfs' is not a git command."), None);

        assert_eq!(
            parse_credential_helper("manager\0"),
            GitCredentialHelper::GitCredentialManager
        );
        assert_eq!(
            parse_credential_helper(
                "C:/Program Files/Git/mingw64/bin/git-credential-manager.exe\0"
            ),
            GitCredentialHelper::GitCredentialManager
        );
        assert_eq!(
            parse_credential_helper("manager\0osxkeychain\0"),
            GitCredentialHelper::MacosKeychain
        );
        assert_eq!(
            parse_credential_helper("manager\0\0"),
            GitCredentialHelper::None
        );
        assert_eq!(
            parse_credential_helper("store --file ~/.creds\0"),
            GitCredentialHelper::Store
        );
        assert_eq!(
            parse_credential_helper("cache --timeout=3600\0"),
            GitCredentialHelper::Cache
        );
        assert_eq!(
            parse_credential_helper("!f() { echo password=secret; }; f\0"),
            GitCredentialHelper::Other
        );

        assert_eq!(
            editor_name("code --wait").as_deref(),
            Some("Visual Studio Code")
        );
        assert_eq!(
            editor_name("'C:/Program Files/Notepad++/notepad++.exe' -multiInst -notabbar")
                .as_deref(),
            Some("Notepad++")
        );
        assert_eq!(
            editor_name("\"C:\\Tools\\My Editor\\edit.exe\" -w").as_deref(),
            Some("edit.exe")
        );
        assert_eq!(editor_name("vi").as_deref(), Some("Vim"));
        assert_eq!(editor_name("true"), None);
        assert_eq!(editor_name("  "), None);
    }

    #[test]
    fn the_global_config_in_use_is_the_one_that_exists() {
        let root =
            std::env::temp_dir().join(format!("git-global-config-fixture-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let xdg = root.join("xdg-config");
        let home = root.join(".gitconfig");
        let listing = format!("{}\n{}\n", xdg.display(), home.display());

        let fact = global_config_fact(&listing, GitInstallationPlatform::Linux).unwrap();
        assert_eq!(
            (fact.path.as_str(), fact.exists),
            (home.to_str().unwrap(), false)
        );

        fs::write(&xdg, "").unwrap();
        let fact = global_config_fact(&listing, GitInstallationPlatform::Linux).unwrap();
        assert_eq!(
            (fact.path.as_str(), fact.exists),
            (xdg.to_str().unwrap(), true)
        );

        // With both, `~/.gitconfig` is the one `git config --global` writes.
        fs::write(&home, "").unwrap();
        let fact = global_config_fact(&listing, GitInstallationPlatform::Linux).unwrap();
        assert_eq!(
            (fact.path.as_str(), fact.exists),
            (home.to_str().unwrap(), true)
        );

        assert_eq!(
            global_config_fact("\n", GitInstallationPlatform::Linux),
            None
        );
        assert_eq!(
            path_fact("C:/Users/ana/.gitconfig", GitInstallationPlatform::Windows).path,
            r"C:\Users\ana\.gitconfig"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn git_location_reveal_only_accepts_known_places() {
        let error = git_location_path("../../etc/passwd").unwrap_err();
        assert_eq!(error.code, AppErrorCode::PathInvalid);
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
                SystemTool::Git,
                GitInstallationPlatform::Windows,
                Some(InstallSpawnResult::Started)
            )
            .outcome,
            GitInstallationOutcome::Started
        );
        let windows_without_winget = installation_result(
            SystemTool::Git,
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
            installation_result(SystemTool::Git, GitInstallationPlatform::Macos, None)
                .guidance_url
                .as_deref(),
            Some(GIT_MACOS_DOWNLOAD_URL)
        );
        assert_eq!(
            installation_result(SystemTool::Git, GitInstallationPlatform::Linux, None)
                .guidance_url
                .as_deref(),
            Some(GIT_LINUX_DOWNLOAD_URL)
        );
        assert_eq!(
            installation_result(
                SystemTool::Git,
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
            update_check_args(SystemTool::Git),
            [
                "list",
                "--id",
                "Git.Git",
                "-e",
                "--upgrade-available",
                "--accept-source-agreements",
                "--disable-interactivity",
                "--source",
                "winget",
            ]
        );
    }

    #[test]
    fn glab_tooling_is_independent_and_uses_its_official_package_and_guidance() {
        assert!(!std::ptr::eq(
            SystemTool::GitLabCli.state(),
            SystemTool::GitHubCli.state()
        ));
        assert!(!std::ptr::eq(
            SystemTool::GitLabCli.state(),
            SystemTool::Git.state()
        ));
        for platform in [
            GitInstallationPlatform::Windows,
            GitInstallationPlatform::Macos,
            GitInstallationPlatform::Linux,
        ] {
            assert_eq!(
                installation_result(
                    SystemTool::GitLabCli,
                    platform,
                    Some(InstallSpawnResult::Missing)
                )
                .guidance_url
                .as_deref(),
                Some("https://gitlab.com/gitlab-org/cli#installation")
            );
        }
        assert_eq!(update_check_args(SystemTool::GitLabCli)[2], "GLab.GLab");
        for (success, output, expected) in [
            (
                true,
                "GitLab CLI GLab.GLab 1.119.0 1.120.0 winget",
                GitUpdateState::UpdateAvailable,
            ),
            (
                true,
                "GitHub CLI GitHub.cli 2.80.0 2.81.0 winget",
                GitUpdateState::UpToDate,
            ),
            (
                false,
                "GLab.GLab source query failed",
                GitUpdateState::Failed,
            ),
        ] {
            assert_eq!(
                update_status_from_attempt(
                    SystemTool::GitLabCli,
                    UpdateCheckAttempt::Completed {
                        success,
                        output: output.into()
                    }
                )
                .state,
                expected
            );
        }
    }

    #[test]
    fn installers_pin_exact_package_and_official_source() {
        for (tool, package) in [
            (SystemTool::Git, "Git.Git"),
            (SystemTool::GitHubCli, "GitHub.cli"),
            (SystemTool::GitLabCli, "GLab.GLab"),
        ] {
            for upgrade in [false, true] {
                assert_eq!(
                    tool_install_args(tool, upgrade),
                    [
                        if upgrade { "upgrade" } else { "install" },
                        "--id",
                        package,
                        "-e",
                        "--source",
                        "winget",
                        "--accept-package-agreements",
                        "--accept-source-agreements",
                    ]
                );
            }
        }
    }

    #[test]
    fn update_check_states_are_mapped_without_contacting_package_sources() {
        assert_eq!(
            update_status_from_attempt(SystemTool::Git, UpdateCheckAttempt::Unavailable).state,
            GitUpdateState::Unavailable
        );
        assert_eq!(
            update_status_from_attempt(SystemTool::Git, UpdateCheckAttempt::FailedToStart).state,
            GitUpdateState::Failed
        );
        assert_eq!(
            update_status_from_attempt(SystemTool::Git, UpdateCheckAttempt::TimedOut).state,
            GitUpdateState::TimedOut
        );
        assert_eq!(
            update_status_from_attempt(
                SystemTool::Git,
                UpdateCheckAttempt::Completed {
                    success: true,
                    output: "Git Git.Git 2.50.0 2.51.0 winget".to_string(),
                }
            )
            .state,
            GitUpdateState::UpdateAvailable
        );
        assert_eq!(
            update_status_from_attempt(
                SystemTool::Git,
                UpdateCheckAttempt::Completed {
                    success: true,
                    output: "No packages found.".to_string(),
                }
            )
            .state,
            GitUpdateState::UpToDate
        );
        assert_eq!(
            update_status_from_attempt(
                SystemTool::Git,
                UpdateCheckAttempt::Completed {
                    success: false,
                    output: "Source query failed.".to_string(),
                }
            )
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

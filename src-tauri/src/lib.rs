#![allow(linker_messages)]

mod watch;

use std::io::{ErrorKind, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Output, Stdio};
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

fn base_git_command() -> Command {
    // `mut` is only exercised on Windows (creation_flags below); harmless
    // elsewhere, but clippy flags it as unused on non-Windows targets.
    #[allow(unused_mut)]
    let mut command = Command::new("git");
    // Domain parsers and error classifiers need deterministic diagnostics on
    // localized installations.
    command.env("LC_ALL", "C").env("LANG", "C");
    // Stops read commands from taking the *optional* index lock and rewriting
    // `.git/index` just to refresh its stat cache. Without this, every status
    // read is itself a filesystem change, which the watcher in `watch.rs`
    // would see and answer with another status read — a loop that never
    // settles. Required locks (commit, checkout) are unaffected.
    command.env("GIT_OPTIONAL_LOCKS", "0");
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
    /// A bounded, secondary excerpt for failures whose primary cause is
    /// something GitOdrile can only classify heuristically (a rejecting hook,
    /// a signing failure) — never the sole or primary user-facing message.
    detail: Option<String>,
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
    PathInvalid,
    PathNotChanged,
    PathEncodingUnsupported,
    NothingToSave,
    UnresolvedConflicts,
    DetachedHead,
    GitOperationInProgress,
    MissingIdentity,
    EmptyTitle,
    InvalidTitle,
    StalePreview,
    HookRejected,
    SigningFailed,
    IndexUnavailable,
    IndexRestoreFailed,
    InvalidSelection,
    NoRemoteConfigured,
    RemoteSelectionRequired,
    UnbornBranchNoVersion,
    NothingToPublish,
    BehindRemote,
    DivergedHistories,
    StalePublishPlan,
    InvalidRefName,
    AuthenticationFailed,
    NetworkTimeout,
    RemoteRejected,
    PublishUncertain,
    GitVersionTooOld,
    VersionLineNameTaken,
    VersionLineNameCollides,
    VersionLineCheckedOutElsewhere,
    VersionLineIsActive,
    VersionLineUniqueWork,
    VersionLineSwitchObstructed,
    StaleVersionLinePlan,
    DirtyWorkingTree,
    RefLocked,
}

impl AppError {
    fn new(code: AppErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            remediation: None,
            detail: None,
        }
    }

    fn with_remediation(mut self, remediation: impl Into<String>) -> Self {
        self.remediation = Some(remediation.into());
        self
    }

    fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
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

struct CappedOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    limit_exceeded: bool,
}

/// Reads at most `limit + 1` stdout bytes and stops Git as soon as the cap is
/// crossed. `Command::output` cannot be used here because it buffers the whole
/// patch before callers can inspect its length.
fn run_git_capped(repo_path: &str, args: &[&str], limit: usize) -> Result<CappedOutput, AppError> {
    let mut child = git_command(repo_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
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
        })?;

    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::new(AppErrorCode::GitUnusable, "Git's output couldn't be read.")
            .with_remediation("Check the Git installation and try again.")
    })?;
    let mut stderr = child.stderr.take().ok_or_else(|| {
        AppError::new(AppErrorCode::GitUnusable, "Git's errors couldn't be read.")
            .with_remediation("Check the Git installation and try again.")
    })?;

    // Drain stderr concurrently so a noisy Git process cannot fill that pipe
    // and deadlock while stdout is being capped. Diagnostics are deliberately
    // bounded and are not exposed as the primary user-facing error.
    let stderr_reader = std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        while let Ok(read) = stderr.read(&mut buffer) {
            if read == 0 {
                break;
            }
        }
    });

    let mut stdout_bytes = Vec::with_capacity(limit.saturating_add(1));
    let read_result = stdout
        .take(limit.saturating_add(1) as u64)
        .read_to_end(&mut stdout_bytes);
    let limit_exceeded = stdout_bytes.len() > limit;

    if read_result.is_err() || limit_exceeded {
        let _ = child.kill();
    }
    let status = child.wait().map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't finish reading this file.",
        )
        .with_remediation("Check that the project is readable and try again.")
    })?;
    let _ = stderr_reader.join();

    if read_result.is_err() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git's output couldn't be read.",
        )
        .with_remediation("Check that the project is readable and try again."));
    }

    if limit_exceeded {
        stdout_bytes.truncate(limit);
    }
    Ok(CappedOutput {
        status,
        stdout: stdout_bytes,
        limit_exceeded,
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

/// The main window starts hidden (see `tauri.conf.json`) so the OS-level
/// window never appears blank while the webview loads and React mounts.
/// The frontend calls this once the first frame has actually painted.
#[tauri::command]
fn show_main_window(window: tauri::Window) {
    if let Some(main) = window.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

#[tauri::command(async)]
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

/// Product-level meaning of a change, rather than Git's index/worktree split.
/// The staging model belongs to the save-version flow, not to this summary.
#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum ChangeCategory {
    Changed,
    New,
    Deleted,
    Renamed,
    Conflicted,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
struct WorkingTreeEntry {
    path: String,
    /// Only set for renames: where the file came from.
    original_path: Option<String>,
    category: ChangeCategory,
    /// Kept as structured metadata for save planning and advanced tooling.
    /// Simple mode deliberately does not expose Git's index vocabulary.
    is_prepared: bool,
    has_unprepared_changes: bool,
}

#[derive(serde::Serialize, Debug, PartialEq, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct WorkingTreeCounts {
    changed: usize,
    #[serde(rename = "new")]
    new_files: usize,
    deleted: usize,
    renamed: usize,
    conflicted: usize,
    total: usize,
}

/// Captured because `--branch` provides it for free. Task 007 does not present
/// it: explaining ahead/behind needs the remote contracts from a later phase.
#[derive(serde::Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
struct UpstreamStatus {
    branch: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
}

#[derive(serde::Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
struct WorkingTreeStatus {
    is_clean: bool,
    counts: WorkingTreeCounts,
    entries: Vec<WorkingTreeEntry>,
    /// True when more files changed than `MAX_REPORTED_ENTRIES`. The counts
    /// stay exact; only the per-file list is capped.
    truncated: bool,
    has_prepared_changes: bool,
    has_unprepared_changes: bool,
    upstream: UpstreamStatus,
}

/// Enough to populate a file list without shipping a pathological status
/// (a fresh clone of a huge tree, a reformatting commit) across the IPC
/// boundary. Counts are never truncated, so the summary stays truthful.
const MAX_REPORTED_ENTRIES: usize = 1000;

/// Shared by `read_working_tree_status` and `read_file_diff`, so both commands
/// always classify the working tree the same way. `--renames` is explicit so
/// a repository configured with `status.renames=false` still reports a rename
/// as a rename rather than a delete plus an add.
const STATUS_ARGS: [&str; 6] = [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
    "--renames",
    "-z",
];

/// Classifies an ordinary `1 <XY>` record. `X` is the index status and `Y` the
/// worktree status; either may be `.` for "unchanged there".
fn categorize_ordinary(index_status: u8, worktree_status: u8) -> ChangeCategory {
    if index_status == b'D' || worktree_status == b'D' {
        ChangeCategory::Deleted
    } else if index_status == b'A' {
        ChangeCategory::New
    } else {
        ChangeCategory::Changed
    }
}

fn parse_ahead_behind(value: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;
    for field in value.split_whitespace() {
        let (sign, digits) = field.split_at(1);
        let parsed = digits.parse::<u32>().unwrap_or(0);
        match sign {
            "+" => ahead = parsed,
            "-" => behind = parsed,
            _ => {}
        }
    }
    (ahead, behind)
}

/// A parsed status record before it is folded into the public
/// `WorkingTreeStatus` shape. `is_untracked` is deliberately not part of
/// `WorkingTreeEntry`: the Overview and Changes list only ever need the
/// product category, but the diff command needs to know whether a "new" file
/// is untracked (never `git add`ed, so `git diff HEAD` won't see it) or
/// staged (already visible to `git diff HEAD`) to choose a diff strategy.
#[derive(Debug, PartialEq)]
struct RawStatusEntry {
    path: String,
    original_path: Option<String>,
    category: ChangeCategory,
    is_untracked: bool,
    is_prepared: bool,
    has_unprepared_changes: bool,
}

struct ParsedStatusRecords {
    entries: Vec<RawStatusEntry>,
    upstream: UpstreamStatus,
    has_unsupported_path_encoding: bool,
}

/// Parses `git status --porcelain=v2 --branch -z` output into raw records and
/// the upstream header, without folding them into aggregate counts. Shared by
/// `parse_status_porcelain_v2` (task 007) and `find_status_entry` (task 009),
/// so the record grammar is decoded in exactly one place.
///
/// The `-z` form is NUL-separated and leaves paths verbatim, which is the only
/// way to survive paths containing spaces, quotes, or newlines. Note that a
/// rename record spans two NUL-separated fields: the record itself and the
/// original path.
fn parse_status_records(stdout: &[u8]) -> ParsedStatusRecords {
    let mut upstream = UpstreamStatus::default();
    let mut entries = Vec::new();
    let mut has_unsupported_path_encoding = false;
    let mut fields = stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());

    while let Some(field) = fields.next() {
        let record = match std::str::from_utf8(field) {
            Ok(record) => record,
            Err(_) => {
                has_unsupported_path_encoding = true;
                // A rename consumes a second NUL field even when its primary
                // record cannot be represented.
                if field.starts_with(b"2 ") {
                    let _ = fields.next();
                }
                continue;
            }
        };

        if let Some(header) = record.strip_prefix("# ") {
            if let Some(head) = header.strip_prefix("branch.head ") {
                // `(detached)` is Git's placeholder, not a branch name.
                upstream.branch = match head {
                    "(detached)" => None,
                    value => Some(value.to_string()),
                };
            } else if let Some(value) = header.strip_prefix("branch.upstream ") {
                upstream.upstream = Some(value.to_string());
            } else if let Some(ab) = header.strip_prefix("branch.ab ") {
                let (ahead, behind) = parse_ahead_behind(ab);
                upstream.ahead = ahead;
                upstream.behind = behind;
            }
            continue;
        }

        let (category, path, original_path, is_untracked, is_prepared, has_unprepared_changes) =
            match record.as_bytes().first() {
                // `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
                Some(b'1') => {
                    let Some(rest) = record.strip_prefix("1 ") else {
                        continue;
                    };
                    let mut parts = rest.splitn(8, ' ');
                    let Some(xy) = parts.next() else { continue };
                    let Some(path) = parts.nth(6) else { continue };
                    let xy = xy.as_bytes();
                    if xy.len() < 2 {
                        continue;
                    }
                    (
                        categorize_ordinary(xy[0], xy[1]),
                        path.to_string(),
                        None,
                        false,
                        xy[0] != b'.',
                        xy[1] != b'.',
                    )
                }
                // `2 ... <path>` followed by a separate NUL-terminated original path.
                Some(b'2') => {
                    let Some(rest) = record.strip_prefix("2 ") else {
                        continue;
                    };
                    let mut parts = rest.splitn(9, ' ');
                    let Some(xy) = parts.next() else { continue };
                    let Some(path) = parts.nth(7) else {
                        continue;
                    };
                    let original = match fields.next() {
                        Some(value) => match std::str::from_utf8(value) {
                            Ok(value) => Some(value.to_string()),
                            Err(_) => {
                                has_unsupported_path_encoding = true;
                                continue;
                            }
                        },
                        None => None,
                    };
                    let xy = xy.as_bytes();
                    (
                        ChangeCategory::Renamed,
                        path.to_string(),
                        original,
                        false,
                        xy.first().is_some_and(|value| *value != b'.'),
                        xy.get(1).is_some_and(|value| *value != b'.'),
                    )
                }
                // `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
                Some(b'u') => {
                    let Some(rest) = record.strip_prefix("u ") else {
                        continue;
                    };
                    let Some(path) = rest.splitn(10, ' ').nth(9) else {
                        continue;
                    };
                    (
                        ChangeCategory::Conflicted,
                        path.to_string(),
                        None,
                        false,
                        true,
                        true,
                    )
                }
                Some(b'?') => {
                    let Some(path) = record.strip_prefix("? ") else {
                        continue;
                    };
                    (
                        ChangeCategory::New,
                        path.to_string(),
                        None,
                        true,
                        false,
                        true,
                    )
                }
                // `!` ignored entries are never requested, and anything else is
                // output this parser does not model.
                _ => continue,
            };

        entries.push(RawStatusEntry {
            path,
            original_path,
            category,
            is_untracked,
            is_prepared,
            has_unprepared_changes,
        });
    }

    ParsedStatusRecords {
        entries,
        upstream,
        has_unsupported_path_encoding,
    }
}

fn status_from_records(records: ParsedStatusRecords) -> WorkingTreeStatus {
    let mut status = WorkingTreeStatus {
        upstream: records.upstream,
        ..Default::default()
    };

    for raw in records.entries {
        status.has_prepared_changes |= raw.is_prepared;
        status.has_unprepared_changes |= raw.has_unprepared_changes;
        match raw.category {
            ChangeCategory::Changed => status.counts.changed += 1,
            ChangeCategory::New => status.counts.new_files += 1,
            ChangeCategory::Deleted => status.counts.deleted += 1,
            ChangeCategory::Renamed => status.counts.renamed += 1,
            ChangeCategory::Conflicted => status.counts.conflicted += 1,
        }
        status.counts.total += 1;

        if status.entries.len() < MAX_REPORTED_ENTRIES {
            status.entries.push(WorkingTreeEntry {
                path: raw.path,
                original_path: raw.original_path,
                category: raw.category,
                is_prepared: raw.is_prepared,
                has_unprepared_changes: raw.has_unprepared_changes,
            });
        } else {
            status.truncated = true;
        }
    }

    status.is_clean = status.counts.total == 0;
    status
}

#[cfg(test)]
fn parse_status_porcelain_v2(stdout: &[u8]) -> WorkingTreeStatus {
    status_from_records(parse_status_records(stdout))
}

fn unsupported_path_encoding_error() -> AppError {
    AppError::new(
        AppErrorCode::PathEncodingUnsupported,
        "This project contains a file path GitOdrile can't represent safely.",
    )
    .with_remediation("Rename that file with a Unicode-compatible name, then refresh the project.")
}

fn checked_status_records(stdout: &[u8]) -> Result<ParsedStatusRecords, AppError> {
    let records = parse_status_records(stdout);
    if records.has_unsupported_path_encoding {
        Err(unsupported_path_encoding_error())
    } else {
        Ok(records)
    }
}

/// Finds the freshly-read status record for one repository-relative path.
/// Used by `read_file_diff` to re-validate a frontend-supplied path against
/// the *current* status rather than trusting a possibly-stale caller.
fn find_status_entry(stdout: &[u8], file_path: &str) -> Result<Option<RawStatusEntry>, AppError> {
    Ok(checked_status_records(stdout)?
        .entries
        .into_iter()
        .find(|entry| entry.path == file_path))
}

#[tauri::command(async)]
fn read_working_tree_status(path: String) -> Result<WorkingTreeStatus, AppError> {
    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(
                AppErrorCode::PathMissing,
                "This project's folder is no longer there.",
            )
            .with_remediation("Open the project again, or choose another folder.")
        } else {
            AppError::new(
                AppErrorCode::PathUnusable,
                "This project's folder can't be read.",
            )
            .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This project's path isn't a folder any more.",
        )
        .with_remediation("Open the project again."));
    }

    let output = run_git(&path, &STATUS_ARGS)?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check what changed in this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    Ok(status_from_records(checked_status_records(&output.stdout)?))
}

// ---- File diff (task 009) ----

/// Git's well-known hash of the empty tree. It needs no lookup — an empty
/// tree has no entries — so it is always usable as a diff base, which lets an
/// unborn branch's files be diffed as additions instead of failing because
/// `HEAD` does not exist yet.
const EMPTY_TREE_HASH: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Bounds the raw `git diff` output read into memory before parsing. Chosen
/// to comfortably fit ordinary reviewable diffs while capping worst-case
/// memory and IPC payload for pathological files. Hitting it returns an
/// explicit `too-large` result rather than a partial or frozen one.
const MAX_DIFF_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

/// Bounds the number of parsed diff lines returned to the frontend. Only
/// reachable by very large hunks that already survived the byte cap above.
const MAX_DIFF_LINES: usize = 5000;

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum DiffLineKind {
    Context,
    Addition,
    Deletion,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct DiffLine {
    kind: DiffLineKind,
    content: String,
    old_line_number: Option<u32>,
    new_line_number: Option<u32>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct DiffHunk {
    header: String,
    old_start: u32,
    old_lines: u32,
    new_start: u32,
    new_lines: u32,
    lines: Vec<DiffLine>,
}

/// Product-shaped diff result. Rust owns Git's unified-diff grammar entirely;
/// React only renders typed hunks and lines, never raw patch text.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum FileDiff {
    Text {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
        hunks: Vec<DiffHunk>,
        truncated: bool,
    },
    Binary {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
    },
    #[serde(rename = "too-large")]
    TooLarge {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
        limit_bytes: u64,
    },
    Conflict {
        path: String,
        hunks: Vec<DiffHunk>,
        truncated: bool,
        detail: Option<String>,
    },
    /// Git reports a difference (a pure rename, or a mode-only change) but
    /// there is no content to render as hunks. An empty `hunks` array on
    /// `Text` would look like an unexplained parsing failure instead.
    Unchanged {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
    },
}

struct ParsedDiff {
    hunks: Vec<DiffHunk>,
    truncated: bool,
}

fn parse_range(value: &str) -> Option<(u32, u32)> {
    if let Some((start, count)) = value.split_once(',') {
        Some((start.parse().ok()?, count.parse().ok()?))
    } else {
        Some((value.parse().ok()?, 1))
    }
}

/// Parses a hunk header line, e.g. `@@ -3,7 +3,6 @@ optional section text`.
/// A side's count is omitted by Git when it is exactly 1 (`@@ -3 +3,2 @@`).
fn parse_hunk_header(line: &str) -> Option<(u32, u32, u32, u32)> {
    let rest = line.strip_prefix("@@ -")?;
    let close = rest.find(" @@")?;
    let ranges = &rest[..close];
    let (old, new) = ranges.split_once(" +")?;
    let (old_start, old_lines) = parse_range(old)?;
    let (new_start, new_lines) = parse_range(new)?;
    Some((old_start, old_lines, new_start, new_lines))
}

/// Parses unified-diff text into typed hunks and lines. Git always separates
/// diff lines with `\n`, even for files whose *content* uses CRLF, so
/// splitting on `\n` alone is correct: a trailing `\r` that belongs to the
/// file's own line ending is left in the line content rather than stripped.
/// Everything before the first hunk header (`diff --git`, `index`, `---`,
/// `+++`, `similarity index`, `rename from/to`, ...) is skipped.
fn parse_diff_body(text: &str) -> ParsedDiff {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut truncated = false;
    let mut total_lines = 0usize;
    let mut old_line = 0u32;
    let mut new_line = 0u32;

    for line in text.split('\n') {
        if truncated {
            break;
        }

        if line.starts_with("@@ -") {
            if let Some((old_start, old_lines, new_start, new_lines)) = parse_hunk_header(line) {
                old_line = old_start;
                new_line = new_start;
                hunks.push(DiffHunk {
                    header: line.to_string(),
                    old_start,
                    old_lines,
                    new_start,
                    new_lines,
                    lines: Vec::new(),
                });
            }
            continue;
        }

        let Some(current_hunk) = hunks.last_mut() else {
            continue;
        };

        let (kind, content, old_number, new_number) = if let Some(content) = line.strip_prefix(' ')
        {
            let numbers = (Some(old_line), Some(new_line));
            old_line += 1;
            new_line += 1;
            (DiffLineKind::Context, content, numbers.0, numbers.1)
        } else if let Some(content) = line.strip_prefix('+') {
            let number = new_line;
            new_line += 1;
            (DiffLineKind::Addition, content, None, Some(number))
        } else if let Some(content) = line.strip_prefix('-') {
            let number = old_line;
            old_line += 1;
            (DiffLineKind::Deletion, content, Some(number), None)
        } else {
            // `\ No newline at end of file`, or anything else this parser
            // does not model, is not a content line.
            continue;
        };

        current_hunk.lines.push(DiffLine {
            kind,
            content: content.to_string(),
            old_line_number: old_number,
            new_line_number: new_number,
        });
        total_lines += 1;
        if total_lines >= MAX_DIFF_LINES {
            truncated = true;
        }
    }

    ParsedDiff { hunks, truncated }
}

fn is_binary_diff_output(text: &str) -> bool {
    text.lines()
        .any(|line| line.starts_with("Binary files ") && line.trim_end().ends_with(" differ"))
}

enum DiffStrategy {
    /// The ordinary case: compare the worktree against `HEAD` (or the empty
    /// tree on an unborn branch). `git diff <base> -- <path>` reflects the
    /// complete unsaved change regardless of whether it is staged, unstaged,
    /// or both, because Git compares the worktree file to `<base>` directly.
    AgainstBase,
    /// A file `git status` reports as untracked has no entry in the index or
    /// `HEAD`, so `git diff HEAD` silently ignores it. `git diff --no-index`
    /// against a genuinely empty temporary file produces a pure-addition
    /// diff without relying on `/dev/null`, which is not a reliable sentinel
    /// path across platforms.
    Untracked,
    /// Restricts the base comparison to both the old and new paths so Git's
    /// rename pairing has both sides of the pair to match.
    Rename,
}

/// Resolves the base revision for `AgainstBase`/`Rename` diffs: `HEAD` when
/// it exists, otherwise the empty tree so new files on an unborn branch
/// render as additions instead of failing.
fn diff_base_rev(path: &str) -> Result<String, AppError> {
    let head = run_git(path, &["rev-parse", "--verify", "-q", "HEAD"])?;
    Ok(if head.status.success() {
        "HEAD".to_string()
    } else {
        EMPTY_TREE_HASH.to_string()
    })
}

/// Writes a genuinely empty temporary file and runs `git diff --no-index`
/// against it, then removes the temporary file. The temporary path is
/// absolute and outside the repository; `--no-index` accepts arbitrary
/// filesystem paths on either side, so this does not depend on the
/// repository's working directory.
fn run_untracked_diff(path: &str, file_path: &str) -> Result<CappedOutput, AppError> {
    let mut temp_path = std::env::temp_dir();
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    temp_path.push(format!(
        "gitodrile-empty-{}-{unique}.tmp",
        std::process::id()
    ));
    std::fs::write(&temp_path, b"").map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable.")
    })?;
    let temp_path_string = temp_path.to_string_lossy().to_string();

    let result = run_git_capped(
        path,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--no-index",
            "--",
            &temp_path_string,
            file_path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    );
    let _ = std::fs::remove_file(&temp_path);
    result
}

fn run_diff_command(
    path: &str,
    strategy: &DiffStrategy,
    entry: &RawStatusEntry,
) -> Result<CappedOutput, AppError> {
    match strategy {
        DiffStrategy::AgainstBase => {
            let base = diff_base_rev(path)?;
            run_git_capped(
                path,
                &[
                    "diff",
                    "--no-color",
                    "--no-ext-diff",
                    &base,
                    "--",
                    &entry.path,
                ],
                MAX_DIFF_OUTPUT_BYTES,
            )
        }
        DiffStrategy::Rename => {
            let base = diff_base_rev(path)?;
            let original = entry.original_path.as_deref().unwrap_or(&entry.path);
            run_git_capped(
                path,
                &[
                    "diff",
                    "--no-color",
                    "--no-ext-diff",
                    "-M",
                    &base,
                    "--",
                    original,
                    &entry.path,
                ],
                MAX_DIFF_OUTPUT_BYTES,
            )
        }
        DiffStrategy::Untracked => run_untracked_diff(path, &entry.path),
    }
}

/// `git diff --no-index` mirrors the standalone `diff` command's exit codes:
/// 0 means no differences, 1 means differences were found (not an error), and
/// 2+ means real trouble. Every other diff invocation in this module uses
/// Git's ordinary in-repository exit convention, where 0 always means success
/// regardless of whether differences were found.
fn diff_output_is_success(strategy: &DiffStrategy, output: &CappedOutput) -> bool {
    match strategy {
        DiffStrategy::Untracked => matches!(output.status.code(), Some(0) | Some(1)),
        DiffStrategy::AgainstBase | DiffStrategy::Rename => output.status.success(),
    }
}

/// Shared by the single-file (`read_file_diff`) and batched
/// (`read_working_tree_diffs`) paths, so a file's classification (binary,
/// too-large, unchanged, text-with-hunks) never depends on which path fetched
/// it. `too_large` is decided by the caller: the single-file path checks
/// `CappedOutput::limit_exceeded` from its own dedicated-size invocation,
/// while the batch path checks each file's *section* length against the same
/// `MAX_DIFF_OUTPUT_BYTES` threshold, since the whole combined invocation is
/// capped much higher.
fn diff_result_from_text(entry: &RawStatusEntry, text: &str, too_large: bool) -> FileDiff {
    if too_large {
        return FileDiff::TooLarge {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
            limit_bytes: MAX_DIFF_OUTPUT_BYTES as u64,
        };
    }

    if is_binary_diff_output(text) {
        return FileDiff::Binary {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
        };
    }

    let parsed = parse_diff_body(text);
    if parsed.hunks.is_empty() {
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
        };
    }

    FileDiff::Text {
        path: entry.path.clone(),
        original_path: entry.original_path.clone(),
        change: entry.category,
        hunks: parsed.hunks,
        truncated: parsed.truncated,
    }
}

fn build_text_result(entry: &RawStatusEntry, output: &CappedOutput) -> FileDiff {
    diff_result_from_text(
        entry,
        &String::from_utf8_lossy(&output.stdout),
        output.limit_exceeded,
    )
}

/// Conflict inspection is informational only (see task decisions), so a
/// diff that cannot be produced is reported as an honest conflict-specific
/// explanation rather than failing the whole command.
fn build_conflict_result(path: &str, entry: &RawStatusEntry) -> FileDiff {
    let unavailable = || FileDiff::Conflict {
        path: entry.path.clone(),
        hunks: Vec::new(),
        truncated: false,
        detail: Some("unavailable".to_string()),
    };

    let Ok(base) = diff_base_rev(path) else {
        return unavailable();
    };
    let Ok(output) = run_git_capped(
        path,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            &base,
            "--",
            &entry.path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    ) else {
        return unavailable();
    };
    if output.limit_exceeded {
        return FileDiff::Conflict {
            path: entry.path.clone(),
            hunks: Vec::new(),
            truncated: false,
            detail: Some("too-large".to_string()),
        };
    }
    if !output.status.success() {
        return unavailable();
    }

    let text = String::from_utf8_lossy(&output.stdout);
    if is_binary_diff_output(&text) {
        return FileDiff::Conflict {
            path: entry.path.clone(),
            hunks: Vec::new(),
            truncated: false,
            detail: Some("binary".to_string()),
        };
    }

    let parsed = parse_diff_body(&text);
    FileDiff::Conflict {
        path: entry.path.clone(),
        hunks: parsed.hunks,
        truncated: parsed.truncated,
        detail: None,
    }
}

/// Rejects absolute paths, parent traversal, and Windows drive/UNC prefixes
/// before the path is ever considered for lookup. Membership in the freshly
/// read status (checked afterwards) is the authoritative containment check;
/// this is a cheap, fast-failing first line of defense.
fn validate_repo_relative_path(file_path: &str) -> Result<(), AppError> {
    let invalid = || {
        AppError::new(AppErrorCode::PathInvalid, "That file path isn't valid.")
            .with_remediation("Refresh the changes list and choose the file again.")
    };
    if file_path.is_empty() {
        return Err(invalid());
    }
    let path = Path::new(file_path);
    if path.is_absolute() {
        return Err(invalid());
    }
    let has_unsafe_component = path.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir
                | std::path::Component::Prefix(_)
                | std::path::Component::RootDir
        )
    });
    if has_unsafe_component {
        return Err(invalid());
    }
    Ok(())
}

#[tauri::command(async)]
fn read_file_diff(path: String, file_path: String) -> Result<FileDiff, AppError> {
    validate_repo_relative_path(&file_path)?;

    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(
                AppErrorCode::PathMissing,
                "This project's folder is no longer there.",
            )
            .with_remediation("Open the project again, or choose another folder.")
        } else {
            AppError::new(
                AppErrorCode::PathUnusable,
                "This project's folder can't be read.",
            )
            .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This project's path isn't a folder any more.",
        )
        .with_remediation("Open the project again."));
    }

    let status_output = run_git(&path, &STATUS_ARGS)?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check what changed in this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    let entry = find_status_entry(&status_output.stdout, &file_path)?.ok_or_else(|| {
        AppError::new(
            AppErrorCode::PathNotChanged,
            "This file is no longer part of the unsaved changes.",
        )
        .with_remediation("Refresh the list and choose a file that is still listed.")
    })?;

    if entry.category == ChangeCategory::Conflicted {
        return Ok(build_conflict_result(&path, &entry));
    }

    let strategy = if entry.category == ChangeCategory::Renamed {
        DiffStrategy::Rename
    } else if entry.is_untracked {
        DiffStrategy::Untracked
    } else {
        DiffStrategy::AgainstBase
    };

    let output = run_diff_command(&path, &strategy, &entry)?;
    if output.limit_exceeded {
        return Ok(build_text_result(&entry, &output));
    }
    if !diff_output_is_success(&strategy, &output) {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    Ok(build_text_result(&entry, &output))
}

// ---- Batched working-tree diffs (extra optimization, task 010) ----
//
// `read_file_diff` spawns at least two Git processes per call (a fresh
// status re-validation plus a dedicated `git diff` for that one path), which
// is the dominant cost when switching between files quickly — not IPC, not
// parsing. This command answers "the diff for every currently changed file"
// with one `git status` and, for ordinary tracked changes, exactly one more
// `git diff` process covering all of them at once. The frontend uses it to
// warm its cache right after the working tree loads, so most clicks become
// pure cache hits instead of a fresh process spawn. It is a read-only,
// best-effort *supplement* to `read_file_diff`, not a replacement: entries it
// cannot or does not cover (conflicts, a file whose section did not fit
// before the combined output was capped, or a failed batch) are simply
// absent from the result, and the frontend falls back to `read_file_diff`
// for exactly those paths.

/// Higher than `MAX_DIFF_OUTPUT_BYTES` (which bounds one file) because this
/// covers every ordinary tracked change in the project at once. Still bounded
/// so a pathological changeset can't block the UI or balloon the IPC payload;
/// see `batch_tracked_diffs` for how a cap mid-file is handled safely.
const MAX_BATCH_DIFF_OUTPUT_BYTES: usize = 16 * 1024 * 1024;

/// Git's own heuristic for "treat this as binary": a NUL byte anywhere in a
/// bounded prefix. Only needed for untracked files, which this command reads
/// directly from disk instead of spawning `git diff --no-index` per file;
/// every other path's binary detection still goes through Git's own output
/// (`is_binary_diff_output`), which stays authoritative there.
const BINARY_SNIFF_BYTES: usize = 8000;

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(BINARY_SNIFF_BYTES).any(|&byte| byte == 0)
}

/// Splits `text` into per-file sections at each line beginning with
/// `diff --git `, without needing to parse (and possibly un-quote) the path
/// on that line. Sections are returned in the same order Git printed them,
/// which — for the identical base/flags/pathspec — is also the order
/// `--name-only -z` reports, so the two can be zipped positionally.
fn split_diff_sections(text: &str) -> Vec<&str> {
    const MARKER: &str = "diff --git ";
    let mut starts: Vec<usize> = Vec::new();
    if text.starts_with(MARKER) {
        starts.push(0);
    }
    let mut search_from = 0;
    while let Some(relative) = text[search_from..].find("\ndiff --git ") {
        let start = search_from + relative + 1;
        starts.push(start);
        search_from = start + MARKER.len();
    }
    starts
        .iter()
        .enumerate()
        .map(|(index, &start)| {
            let end = starts.get(index + 1).copied().unwrap_or(text.len());
            &text[start..end]
        })
        .collect()
}

/// Splits file content into lines the same way `parse_diff_body` treats
/// hunk lines: on `\n` only (never touching a lone `\r`, which belongs to the
/// file's own CRLF line endings), and without fabricating a phantom trailing
/// empty line for a file that ends with a newline.
fn split_content_lines(content: &str) -> Vec<&str> {
    if content.is_empty() {
        return Vec::new();
    }
    let mut lines: Vec<&str> = content.split('\n').collect();
    if content.ends_with('\n') {
        lines.pop();
    }
    lines
}

/// Builds an untracked file's diff by reading it directly from disk instead
/// of spawning `git diff --no-index` — an untracked file's diff is always
/// "every line is an addition," which needs no Git process to compute.
fn untracked_file_diff(repo_path: &Path, entry: &RawStatusEntry) -> FileDiff {
    let full_path = repo_path.join(&entry.path);
    let Ok(bytes) = std::fs::read(&full_path) else {
        // Unreadable (permissions, a broken symlink, a race with deletion):
        // report it as absent from the batch rather than guessing; the
        // frontend's per-file fallback will surface a proper error.
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    };

    if bytes.len() as u64 > MAX_DIFF_OUTPUT_BYTES as u64 {
        return FileDiff::TooLarge {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
            limit_bytes: MAX_DIFF_OUTPUT_BYTES as u64,
        };
    }
    if looks_binary(&bytes) {
        return FileDiff::Binary {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    }

    let text = String::from_utf8_lossy(&bytes);
    let lines = split_content_lines(&text);
    if lines.is_empty() {
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    }

    let truncated = lines.len() > MAX_DIFF_LINES;
    let included = if truncated {
        &lines[..MAX_DIFF_LINES]
    } else {
        &lines[..]
    };
    let diff_lines = included
        .iter()
        .enumerate()
        .map(|(index, content)| DiffLine {
            kind: DiffLineKind::Addition,
            content: (*content).to_string(),
            old_line_number: None,
            new_line_number: Some(index as u32 + 1),
        })
        .collect::<Vec<_>>();

    FileDiff::Text {
        path: entry.path.clone(),
        original_path: None,
        change: entry.category,
        hunks: vec![DiffHunk {
            header: format!("@@ -0,0 +1,{} @@", diff_lines.len()),
            old_start: 0,
            old_lines: 0,
            new_start: 1,
            new_lines: diff_lines.len() as u32,
            lines: diff_lines,
        }],
        truncated,
    }
}

/// Batches every ordinary (non-conflicted, tracked) change into one `git
/// diff` process. Renamed entries contribute both their old and new path to
/// the pathspec, matching the single-file `Rename` strategy, so Git's rename
/// pairing still has both sides to match.
fn batch_tracked_diffs(
    path: &str,
    base: &str,
    entries: &[&RawStatusEntry],
) -> Result<Vec<FileDiff>, AppError> {
    if entries.is_empty() {
        return Ok(Vec::new());
    }

    let mut pathspecs: Vec<&str> = Vec::with_capacity(entries.len() * 2);
    for entry in entries {
        if let Some(original) = &entry.original_path {
            pathspecs.push(original);
        }
        pathspecs.push(&entry.path);
    }

    // Pass 1: the ordered, unambiguous list of paths this exact diff will
    // emit sections for. `-z` keeps it NUL-separated so no path (however it
    // would otherwise need quoting) can be misread.
    let mut name_args = vec![
        "diff",
        "--no-color",
        "--no-ext-diff",
        "-M",
        "-z",
        "--name-only",
        base,
        "--",
    ];
    name_args.extend(pathspecs.iter().copied());
    let name_output = run_git(path, &name_args)?;
    if !name_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't list which files changed.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    let ordered_paths: Vec<String> = name_output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|segment| !segment.is_empty())
        .map(|segment| String::from_utf8_lossy(segment).into_owned())
        .collect();

    // Pass 2: the actual patch text, from the identical base/flags/pathspec,
    // so Git computes and orders it identically to pass 1.
    let mut diff_args = vec!["diff", "--no-color", "--no-ext-diff", "-M", base, "--"];
    diff_args.extend(pathspecs.iter().copied());
    let capped = run_git_capped(path, &diff_args, MAX_BATCH_DIFF_OUTPUT_BYTES)?;
    if !capped.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read these files' differences.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    let text = String::from_utf8_lossy(&capped.stdout);
    let mut sections = split_diff_sections(&text);
    if capped.limit_exceeded {
        // The combined output was cut mid-stream, so the last section (if
        // any) may be an incomplete file rather than a real one. Dropping it
        // is always safe: every path it would have covered still gets a
        // result from the frontend's per-file fallback.
        sections.pop();
    }

    let mut results = Vec::with_capacity(sections.len());
    for (name, section) in ordered_paths.iter().zip(sections.iter()) {
        let Some(entry) = entries.iter().find(|entry| &entry.path == name) else {
            // A rename's *old* path can appear here if similarity fell below
            // Git's detection threshold and it downgraded to a delete+add;
            // that old path isn't one of our known entries, so skip it.
            continue;
        };
        let too_large = section.len() > MAX_DIFF_OUTPUT_BYTES;
        results.push(diff_result_from_text(entry, section, too_large));
    }
    Ok(results)
}

#[tauri::command(async)]
fn read_working_tree_diffs(path: String) -> Result<Vec<FileDiff>, AppError> {
    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(
                AppErrorCode::PathMissing,
                "This project's folder is no longer there.",
            )
            .with_remediation("Open the project again, or choose another folder.")
        } else {
            AppError::new(
                AppErrorCode::PathUnusable,
                "This project's folder can't be read.",
            )
            .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This project's path isn't a folder any more.",
        )
        .with_remediation("Open the project again."));
    }

    let status_output = run_git(&path, &STATUS_ARGS)?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check what changed in this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    let records = checked_status_records(&status_output.stdout)?;

    let tracked_entries: Vec<&RawStatusEntry> = records
        .entries
        .iter()
        .filter(|entry| entry.category != ChangeCategory::Conflicted && !entry.is_untracked)
        .collect();
    let untracked_entries: Vec<&RawStatusEntry> = records
        .entries
        .iter()
        .filter(|entry| entry.is_untracked)
        .collect();

    let mut results = if tracked_entries.is_empty() {
        Vec::new()
    } else {
        let base = diff_base_rev(&path)?;
        batch_tracked_diffs(&path, &base, &tracked_entries)?
    };
    results.extend(
        untracked_entries
            .iter()
            .map(|entry| untracked_file_diff(repo_path, entry)),
    );
    Ok(results)
}

#[tauri::command(async)]
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

#[tauri::command(async)]
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

#[tauri::command(async)]
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

#[tauri::command(async)]
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

#[tauri::command(async)]
fn get_git_identity() -> GitIdentity {
    GitIdentity {
        name: read_global_git_config("user.name", None),
        email: read_global_git_config("user.email", None),
    }
}

#[tauri::command(async)]
fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
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
    let mut command = git_command(repo_path);
    if let Some(global) = config_override {
        command.env("GIT_CONFIG_GLOBAL", global);
    }
    command.args(args).output().map_err(|error| {
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

    let mut read_tree = git_command(path);
    read_tree.env("GIT_INDEX_FILE", &index_path);
    if *head_state == HeadState::Unborn {
        read_tree.args(["read-tree", "--empty"]);
    } else {
        read_tree.args(["read-tree", "HEAD"]);
    }
    let output = read_tree.output().map_err(|_| index_unavailable_error())?;
    if !output.status.success() {
        return Err(index_unavailable_error().with_detail(truncate_detail(&stderr_text(&output))));
    }

    let mut add = git_command(path);
    add.env("GIT_INDEX_FILE", &index_path).args(["add", "-A"]);
    if let Some(entries) = selected_entries {
        add.arg("--");
        for entry in entries {
            add.arg(&entry.path);
            if let Some(original) = &entry.original_path {
                add.arg(original);
            }
        }
    }
    let output = add.output().map_err(|_| index_unavailable_error())?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't prepare the selected changes.",
        )
        .with_remediation("Refresh the project and check that the selected files are readable.")
        .with_detail(truncate_detail(&stderr_text(&output))));
    }

    let mut write_tree = git_command(path);
    let output = write_tree
        .env("GIT_INDEX_FILE", &index_path)
        .args(["write-tree"])
        .output()
        .map_err(|_| index_unavailable_error())?;
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

#[tauri::command(async)]
fn plan_save_version(
    path: String,
    selected_paths: Option<Vec<String>>,
) -> Result<SaveVersionPlan, AppError> {
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
    if trimmed.len() <= MAX_FAILURE_DETAIL_BYTES {
        trimmed.to_string()
    } else {
        let mut truncated = trimmed
            .char_indices()
            .take_while(|(index, _)| *index < MAX_FAILURE_DETAIL_BYTES)
            .map(|(_, ch)| ch)
            .collect::<String>();
        truncated.push('…');
        truncated
    }
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

    let mut commit_command = git_command(&path);
    if let Some(global) = identity_override {
        commit_command.env("GIT_CONFIG_GLOBAL", global);
    }
    let commit_output = match commit_command
        .args(["commit", "-m", &commit_message])
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            let primary = if error.kind() == ErrorKind::NotFound {
                AppError::new(
                    AppErrorCode::GitMissing,
                    "Git isn't installed, or isn't available on PATH.",
                )
                .with_remediation("Install Git, then reopen GitOdrile and try again.")
            } else {
                AppError::new(AppErrorCode::GitUnusable, "Git couldn't be started.")
                    .with_remediation("Check the Git installation and try again.")
            };
            return Err(restore_or_report(&backup, primary));
        }
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
    save_version_selection_with_identity_override(
        path,
        title,
        description,
        state_token,
        None,
        identity_override,
    )
}

#[tauri::command(async)]
fn save_version(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
) -> Result<SaveVersionResult, AppError> {
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

#[tauri::command(async)]
fn discover_remotes(path: String) -> Result<RemoteDiscovery, AppError> {
    let status = read_working_tree_status(path.clone())?;
    let remotes = list_remotes(&path)?;
    Ok(RemoteDiscovery {
        remotes,
        branch: status.upstream.branch,
        upstream: status.upstream.upstream,
    })
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
struct SavedVersionSummary {
    commit: String,
    short_commit: String,
    title: String,
    description: Option<String>,
    /// `%cI` (committer date, ISO 8601 strict) — the same format already used
    /// for a version line's tip (`committerdate:iso-strict` in
    /// `for-each-ref`'s format string), so the frontend parses both the same
    /// way.
    committed_at: String,
    /// `%an` — the commit's author name, exactly as Git has it configured
    /// (may be empty on a malformed/legacy commit; the frontend hides its
    /// display rather than showing a blank chip).
    author: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PendingVersionsResult {
    total_count: u32,
    versions: Vec<SavedVersionSummary>,
    is_truncated: bool,
}

/// How many saved versions a `git log` summary call reports at most, whether
/// for the Overview's passive pending list or a publish plan's preview. Not a
/// hard guarantee against a much larger real gap — just enough for a
/// quick-glance list without shipping an unbounded payload.
const MAX_LISTED_SAVED_VERSIONS: usize = 50;

fn parse_saved_version_summaries(text: &str) -> Vec<SavedVersionSummary> {
    let fields = text.split('\0').collect::<Vec<_>>();
    fields
        .chunks_exact(6)
        .filter_map(|parts| {
            let commit = parts[0].trim();
            let short_commit = parts[1].trim();
            let title = parts[2].trim();
            let committed_at = parts[4].trim();
            if commit.is_empty()
                || short_commit.is_empty()
                || title.is_empty()
                || committed_at.is_empty()
            {
                return None;
            }
            let description = parts[3].trim();
            let author = parts[5].trim();
            Some(SavedVersionSummary {
                commit: commit.to_string(),
                short_commit: short_commit.to_string(),
                title: title.to_string(),
                description: (!description.is_empty()).then(|| description.to_string()),
                committed_at: committed_at.to_string(),
                author: author.to_string(),
            })
        })
        .collect()
}

/// Runs `git log` for `range` with hash/short-hash/subject/body/committer-date/
/// author-name in one machine-parseable pass. NUL separates both fields and records because Git commit
/// messages cannot contain NUL bytes, while their bodies may contain any
/// number of ordinary lines. A failing range (e.g. a configured upstream that has never
/// been fetched locally, so Git can't resolve it as a revision yet) is
/// treated as "nothing reliable to report", not an error — callers show an
/// empty list rather than surfacing a spurious failure for something that
/// isn't actually broken.
fn git_log_summaries(path: &str, range: &str) -> Result<Vec<SavedVersionSummary>, AppError> {
    let cap = MAX_LISTED_SAVED_VERSIONS.to_string();
    let output = run_git(
        path,
        &[
            "log",
            "-z",
            "--pretty=format:%H%x00%h%x00%s%x00%b%x00%cI%x00%an",
            "-n",
            &cap,
            range,
        ],
    )?;
    let text = checked_git_stdout(output)?;
    if text.is_empty() {
        return Ok(Vec::new());
    }
    Ok(parse_saved_version_summaries(&text))
}

/// Read-only and local-only: never fetches. When an upstream is configured,
/// this only reflects the last-known remote-tracking ref (as of the most
/// recent fetch or publish) — the same "cached, possibly optimistic" signal
/// documented for the Overview's publish entry point, not a fresh preflight.
/// With no upstream configured yet, every local saved version is reported as
/// unpublished, since nothing is locally known to contradict that.
#[tauri::command(async)]
fn list_unpublished_versions(path: String) -> Result<PendingVersionsResult, AppError> {
    let status = read_working_tree_status(path.clone())?;
    let (head_state, _) = resolve_head_state(&path, status.upstream.branch.clone())?;
    if head_state != HeadState::Branch {
        return Ok(PendingVersionsResult {
            total_count: 0,
            versions: Vec::new(),
            is_truncated: false,
        });
    }

    let range = match &status.upstream.upstream {
        Some(upstream) => format!("{upstream}..HEAD"),
        None => "HEAD".to_string(),
    };
    let total_count = checked_git_stdout(run_git(&path, &["rev-list", "--count", &range])?)?
        .parse::<u32>()
        .map_err(|_| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "GitOdrile couldn't count the saved versions waiting to be published.",
            )
            .with_remediation("Refresh and try again.")
        })?;
    let versions = git_log_summaries(&path, &range)?;
    Ok(PendingVersionsResult {
        total_count,
        is_truncated: total_count as usize > versions.len(),
        versions,
    })
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
struct CommitFileChange {
    path: String,
    /// Only set for a detected rename/copy: where the file came from.
    original_path: Option<String>,
    category: ChangeCategory,
}

/// Classifies one `git show --name-status` line. Reuses the same
/// `ChangeCategory` vocabulary (and, on the frontend, the same icons) as the
/// working-tree Changes list, so a saved version's file summary and the
/// Changes screen can never disagree about what a category means. A type
/// change (`T`) is presented as `Changed` — GitOdrile doesn't have a distinct
/// category for that rare case, and it *is* still a modification to the file.
fn parse_name_status_line(line: &str) -> Option<CommitFileChange> {
    let mut parts = line.split('\t');
    let status = parts.next()?;
    let first_path = parts.next()?;
    match status.as_bytes().first()? {
        b'A' => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::New,
        }),
        b'D' => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::Deleted,
        }),
        b'R' | b'C' => {
            let new_path = parts.next()?.to_string();
            Some(CommitFileChange {
                path: new_path,
                original_path: Some(first_path.to_string()),
                category: ChangeCategory::Renamed,
            })
        }
        _ => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::Changed,
        }),
    }
}

/// A commit hash reaching any of these commands always comes from GitOdrile's
/// own previously displayed list (`SavedVersionSummary`/`CommitFileChange`),
/// never free-typed by the user — but since it still becomes a `git` process
/// argument, this rejects the one shape that could be misread as a flag
/// instead of a revision.
fn validate_commit_ish(commit: &str) -> Result<(), AppError> {
    if commit.is_empty() || commit.starts_with('-') {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version couldn't be identified.",
        ));
    }
    Ok(())
}

/// Read-only, local-only file summary for one already-saved commit — the
/// "very summarized" per-version detail shown inline in the publish preview,
/// deliberately not the full line-by-line diff the Changes screen shows.
/// `git show` handles a root commit (no parent) the same way it handles any
/// other commit, listing every file as added, so no special case is needed.
#[tauri::command(async)]
fn read_commit_file_changes(
    path: String,
    commit: String,
) -> Result<Vec<CommitFileChange>, AppError> {
    validate_commit_ish(&commit)?;
    let output = run_git(
        &path,
        &[
            "show",
            "--no-color",
            "--format=",
            "--name-status",
            "-M",
            &commit,
        ],
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdrile couldn't read that saved version's changed files.",
        )
        .with_remediation("Refresh and try again."));
    }
    Ok(git_stdout(&output)
        .lines()
        .filter_map(parse_name_status_line)
        .collect())
}

/// The line-by-line diff for one file within one already-saved commit — the
/// second level of the Overview's "view changes" flow, once a specific file
/// from `read_commit_file_changes` is picked. Reuses the exact same
/// `RawStatusEntry`/`diff_result_from_text` pipeline the working-tree diff
/// commands use, so a file's classification (binary/too-large/unchanged/text)
/// can never disagree between an unsaved change and an already-saved one —
/// only the `git show`/`--name-status` step that determined `category` and
/// `original_path` here comes from a commit instead of the working tree.
#[tauri::command(async)]
fn read_commit_file_diff(
    path: String,
    commit: String,
    file_path: String,
) -> Result<FileDiff, AppError> {
    validate_repo_relative_path(&file_path)?;
    validate_commit_ish(&commit)?;

    let status_output = run_git(
        &path,
        &[
            "show",
            "--no-color",
            "--format=",
            "--name-status",
            "-M",
            &commit,
            "--",
            &file_path,
        ],
    )?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdrile couldn't check that saved version's changes.",
        )
        .with_remediation("Refresh and try again."));
    }
    let Some(change) = git_stdout(&status_output)
        .lines()
        .find_map(parse_name_status_line)
    else {
        return Err(AppError::new(
            AppErrorCode::PathNotChanged,
            "This file isn't part of that saved version.",
        )
        .with_remediation("Refresh and choose a file that is still listed."));
    };
    let entry = RawStatusEntry {
        path: change.path,
        original_path: change.original_path,
        category: change.category,
        is_untracked: false,
        is_prepared: false,
        has_unprepared_changes: false,
    };

    let output = run_git_capped(
        &path,
        &[
            "show",
            "--no-color",
            "--no-ext-diff",
            "--format=",
            "-M",
            &commit,
            "--",
            &file_path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    )?;
    if output.limit_exceeded {
        return Ok(build_text_result(&entry, &output));
    }
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    Ok(build_text_result(&entry, &output))
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
    let mut command = git_command(repo_path);
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
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
    })?;

    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child.wait_with_output().map_err(|_| {
                    AppError::new(
                        AppErrorCode::GitCommandFailed,
                        "Git's output couldn't be read.",
                    )
                    .with_remediation("Check the Git installation and try again.")
                })?;
                return Ok(NetworkOutput {
                    status: Some(output.status),
                    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                    timed_out: false,
                });
            }
            Ok(None) if started_at.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(NetworkOutput {
                    status: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    timed_out: true,
                });
            }
            Err(_) => {
                return Err(AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "GitOdrile lost track of a running Git process.",
                )
                .with_remediation("Try again."));
            }
        }
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

#[tauri::command(async)]
fn plan_publish(
    path: String,
    remote: Option<String>,
    up_to: Option<String>,
) -> Result<PublishPlan, AppError> {
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

#[tauri::command(async)]
fn publish(
    path: String,
    remote: String,
    state_token: String,
    up_to: Option<String>,
) -> Result<PublishResult, AppError> {
    publish_selection(path, remote, state_token, up_to)
}

// ---- Version lines (task 016) ----
//
// "Version line" is simple-mode wording for a local Git branch. This section
// owns discovery (read-only) and the create/switch/delete plan-then-execute
// contracts. Every mutation here requires `git switch` support (Git >= 2.23,
// see `require_git_switch_support`) — this is the first Git-version floor
// enforced anywhere in the app; task 002 deliberately left minimum-version
// enforcement out of scope, so the check stays local to these commands
// instead of a global gate.

/// Safety cap on how many local branches a single discovery call reports in
/// full. Chosen to comfortably cover ordinary projects while keeping the
/// per-branch reachability/uniqueness queries below bounded; counts stay
/// exact even when the list itself is truncated.
const VERSION_LINE_LIST_CAP: usize = 300;

fn git_version_at_least(version: &str, minimum: (u32, u32, u32)) -> bool {
    let mut parts = version
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty());
    let major: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let minor: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let patch: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    (major, minor, patch) >= minimum
}

fn git_supports_switch(path: &str) -> Result<bool, AppError> {
    let output = run_git(path, &["--version"])?;
    if !output.status.success() {
        return Ok(false);
    }
    Ok(git_version_at_least(
        &parse_git_version(&git_stdout(&output)),
        (2, 23, 0),
    ))
}

/// Gate shared by create/switch/delete. Discovery (`get_version_lines`) never
/// calls this — read-only listing stays available regardless of Git version.
fn require_git_switch_support(path: &str) -> Result<(), AppError> {
    if git_supports_switch(path)? {
        Ok(())
    } else {
        Err(AppError::new(
            AppErrorCode::GitVersionTooOld,
            "This version of Git is too old for GitOdrile to change version lines safely.",
        )
        .with_remediation("Update Git to version 2.23 or newer, then try again."))
    }
}

struct WorktreeEntry {
    path: String,
    branch: Option<String>,
}

/// Parses `git worktree list --porcelain`: repeated blocks of `key value`
/// lines separated by a blank line, one block per worktree (the main one
/// first). A block with no `branch` line is detached there, which is simply
/// reported as no occupied branch for that worktree.
fn parse_worktree_list_porcelain(text: &str) -> Vec<WorktreeEntry> {
    let mut entries = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    for line in text.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(path) = current_path.take() {
                entries.push(WorktreeEntry {
                    path,
                    branch: current_branch.take(),
                });
            }
            current_path = Some(path.to_string());
        } else if let Some(branch_ref) = line.strip_prefix("branch ") {
            current_branch = branch_ref.strip_prefix("refs/heads/").map(str::to_string);
        } else if line.is_empty() {
            if let Some(path) = current_path.take() {
                entries.push(WorktreeEntry {
                    path,
                    branch: current_branch.take(),
                });
            }
        }
    }
    if let Some(path) = current_path.take() {
        entries.push(WorktreeEntry {
            path,
            branch: current_branch.take(),
        });
    }
    entries
}

fn list_worktrees(path: &str) -> Result<Vec<WorktreeEntry>, AppError> {
    let output = checked_git_stdout(run_git(path, &["worktree", "list", "--porcelain"])?)?;
    Ok(parse_worktree_list_porcelain(&output))
}

/// Local branch names that this app can represent exactly. See
/// `parse_version_line_refs` for why unrepresentable names are skipped rather
/// than lossily converted.
fn list_branch_names(path: &str) -> Result<Vec<String>, AppError> {
    let output = run_git(
        path,
        &["for-each-ref", "--format=%(refname:short)%00", "refs/heads"],
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project's version-line names.",
        )
        .with_remediation("Check that the project's Git references are readable."));
    }
    Ok(output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty() && *field != b"\n" && *field != b"\r\n")
        .filter_map(|field| {
            let field = field.strip_prefix(b"\n").unwrap_or(field);
            let field = field.strip_suffix(b"\r").unwrap_or(field);
            // Skipping an unrepresentable name is safe for every caller here:
            // this list exists to reject an exact or case-only duplicate of a
            // *new* name, and a new name is always valid UTF-8, so it can
            // never collide with bytes that are not.
            std::str::from_utf8(field).ok().map(str::to_string)
        })
        .collect())
}

/// Refs (local branches or remote-tracking refs) other than `name` itself
/// whose history already contains `tip` — the "is this work retained
/// elsewhere" proof required before any deletion, and the same signal used
/// to flag a line as safely retained in discovery.
fn retaining_refs(path: &str, name: &str, tip: &str) -> Result<Vec<String>, AppError> {
    let own_ref = format!("refs/heads/{name}");
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--contains",
            tip,
            "--format=%(refname)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(git_stdout(&output)
        .lines()
        .filter(|line| *line != own_ref)
        .map(str::to_string)
        .collect())
}

fn add_reaching_ref(references: &mut Vec<String>, reference: &str) {
    if references.iter().any(|existing| existing == reference) {
        return;
    }
    // Inventory only needs to know whether at least one *other* ref reaches a
    // branch tip. Keeping two distinct names is sufficient to answer that for
    // every branch while bounding memory even in repositories with many refs.
    if references.len() < 2 {
        references.push(reference.to_string());
    }
}

/// Computes the refs that can reach every commit in one graph walk. This
/// replaces one `for-each-ref --contains` process per listed branch during
/// discovery; delete planning still asks Git for the exact retained-by list.
fn reaching_refs_by_commit(
    path: &str,
) -> Result<std::collections::HashMap<String, Vec<String>>, AppError> {
    use std::collections::HashMap;

    let refs_output = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(refname)%00",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    if !refs_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect which references retain these version lines.",
        ));
    }

    let mut reaching: HashMap<String, Vec<String>> = HashMap::new();
    let mut fields = refs_output.stdout.split(|byte| *byte == 0);
    while let Some(commit_bytes) = fields.next() {
        if commit_bytes.is_empty() || commit_bytes == b"\n" || commit_bytes == b"\r\n" {
            continue;
        }
        let commit_bytes = commit_bytes.strip_prefix(b"\n").unwrap_or(commit_bytes);
        let Some(reference_bytes) = fields.next() else {
            break;
        };
        let reference_bytes = reference_bytes
            .strip_suffix(b"\r")
            .unwrap_or(reference_bytes);
        // A ref this app cannot name is dropped rather than failing the walk.
        // That errs toward "we cannot prove this line is retained elsewhere",
        // which shows the branch as carrying unique work — the cautious
        // answer. Deletion safety does not rest on it either way:
        // `git branch -d` remains the actual enforcement.
        let (Ok(commit), Ok(reference)) = (
            std::str::from_utf8(commit_bytes),
            std::str::from_utf8(reference_bytes),
        ) else {
            continue;
        };
        add_reaching_ref(reaching.entry(commit.to_string()).or_default(), reference);
    }

    let graph = run_git(
        path,
        &[
            "rev-list",
            "--topo-order",
            "--parents",
            "--branches",
            "--remotes",
        ],
    )?;
    if !graph.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect version-line reachability.",
        ));
    }
    let graph_text = std::str::from_utf8(&graph.stdout).map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git returned commit identifiers that couldn't be represented safely.",
        )
    })?;
    for line in graph_text.lines() {
        let mut commits = line.split_ascii_whitespace();
        let Some(commit) = commits.next() else {
            continue;
        };
        let sources = reaching.get(commit).cloned().unwrap_or_default();
        if sources.is_empty() {
            continue;
        }
        for parent in commits {
            let parent_sources = reaching.entry(parent.to_string()).or_default();
            for source in &sources {
                add_reaching_ref(parent_sources, source);
            }
        }
    }
    Ok(reaching)
}

fn branch_unique_commit_count(path: &str, active: Option<&str>, tip: &str) -> Option<u32> {
    let active = active?;
    let output = run_git(path, &["rev-list", "--count", &format!("{active}..{tip}")]).ok()?;
    if !output.status.success() {
        return None;
    }
    git_stdout(&output).parse().ok()
}

fn split_nul_list(output: &Output) -> Vec<String> {
    String::from_utf8_lossy(&output.stdout)
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect()
}

/// Cheap, deterministic fingerprint of a typed working-tree status. Reuses
/// the status this command already fetched for its own validation, so
/// building a state token never costs an extra Git process — unlike
/// save-version's `compute_state_token`, which needs a real tree hash because
/// it must detect drift in a *selected subset* of files.
fn status_fingerprint(status: &WorkingTreeStatus) -> String {
    let mut fingerprint = format!("clean:{}|total:{}|", status.is_clean, status.counts.total);
    for entry in &status.entries {
        fingerprint.push_str(&entry.path);
        fingerprint.push(':');
        fingerprint.push_str(match entry.category {
            ChangeCategory::Changed => "c",
            ChangeCategory::New => "n",
            ChangeCategory::Deleted => "d",
            ChangeCategory::Renamed => "r",
            ChangeCategory::Conflicted => "x",
        });
        fingerprint.push(if entry.is_prepared { '1' } else { '0' });
        fingerprint.push('|');
    }
    fingerprint
}

/// Fingerprint used when creating a line with unsaved/prepared work. The
/// status shape alone cannot detect editing the same already-modified file
/// after preview, so include both the complete worktree tree and the exact
/// staged-content tree. `prepare_index` uses a temporary index and never
/// mutates the user's real one; `write-tree` reads the real index without
/// depending on volatile stat-cache bytes.
fn create_version_line_state_fingerprint(
    path: &str,
    head_state: &HeadState,
    status: &WorkingTreeStatus,
) -> Result<String, AppError> {
    let prepared_index = prepare_index(path, head_state, None)?;
    let worktree_tree = &prepared_index.tree;
    let index_tree = checked_git_stdout(run_git(path, &["write-tree"])?)?;
    Ok(format!(
        "{}|worktree-tree:{worktree_tree}|index-tree:{index_tree}",
        status_fingerprint(status),
    ))
}

fn compute_version_line_state_token(
    head: Option<&str>,
    branch: Option<&str>,
    status_fingerprint: &str,
    extra: &str,
) -> String {
    use std::hash::{Hash, Hasher};
    let fingerprint = format!(
        "head:{}|branch:{}|status:{status_fingerprint}|extra:{extra}|",
        head.unwrap_or("unborn"),
        branch.unwrap_or("detached"),
    );
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    fingerprint.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
struct VersionLineTip {
    commit: String,
    short_commit: String,
    subject: String,
    committed_at: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
struct VersionLine {
    name: String,
    tip: VersionLineTip,
    is_active: bool,
    upstream: Option<String>,
    is_retained_elsewhere: bool,
    unique_commit_count: Option<u32>,
    worktree_path: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct VersionLinesSnapshot {
    branch: Option<String>,
    head_state: HeadState,
    current_commit: Option<String>,
    lines: Vec<VersionLine>,
    total_count: usize,
    is_truncated: bool,
    /// Local branches whose exact bytes this app cannot represent, and which
    /// are therefore absent from `lines`. Surfaced so the screen can say so
    /// instead of quietly showing an incomplete list.
    unreadable_count: usize,
}

#[derive(Debug)]
struct VersionLineRaw {
    name: String,
    commit: String,
    short_commit: String,
    subject: String,
    committed_at: String,
    upstream: Option<String>,
    unique_commit_count: Option<u32>,
    worktree_path: Option<String>,
}

/// Parses one `for-each-ref` record per line, fields separated by the literal
/// NUL bytes `%00` writes into the format string. Machine-readable and
/// version-agnostic — this is the read-only half of the feature and must stay
/// usable regardless of `require_git_switch_support`.
/// Parsed inventory plus the number of records skipped because their bytes
/// are not valid UTF-8.
struct ParsedVersionLines {
    lines: Vec<VersionLineRaw>,
    unreadable_count: usize,
}

/// Git ref names are bytes, not text, so a name this app cannot represent is
/// possible. Such a record is skipped and counted, never lossily converted:
/// showing a name peppered with replacement characters would invite the user
/// to act on something that does not exist, and every mutation is keyed by
/// exact name. Skipping one record rather than failing the whole read keeps
/// the other lines usable, which is the same "show what is true, say what is
/// missing" contract `is_truncated` already follows.
fn parse_version_line_refs(bytes: &[u8]) -> ParsedVersionLines {
    let mut lines = Vec::new();
    let mut unreadable_count = 0;
    for line in bytes.split(|byte| *byte == b'\n') {
        if line.is_empty() {
            continue;
        }
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let fields = line.split(|byte| *byte == 0).collect::<Vec<_>>();
        if fields.len() < 3 {
            continue;
        }
        let decode = |field: &[u8]| -> Option<String> {
            std::str::from_utf8(field).ok().map(str::to_string)
        };
        // The ref name decides whether this record counts as unreadable; a
        // malformed line that is not a local branch at all is simply not ours.
        let Some(refname) = decode(fields[0]) else {
            unreadable_count += 1;
            continue;
        };
        let Some(name) = refname.strip_prefix("refs/heads/") else {
            continue;
        };
        let (Some(commit), Some(short_commit)) = (decode(fields[1]), decode(fields[2])) else {
            unreadable_count += 1;
            continue;
        };
        // Metadata that cannot be represented degrades to empty rather than
        // dropping an otherwise addressable line: the name is what mutations
        // need, and the subject and date are decoration.
        lines.push(VersionLineRaw {
            name: name.to_string(),
            commit,
            short_commit,
            subject: fields
                .get(3)
                .and_then(|field| decode(field))
                .unwrap_or_default(),
            committed_at: fields
                .get(4)
                .and_then(|field| decode(field))
                .unwrap_or_default(),
            upstream: fields
                .get(5)
                .and_then(|field| decode(field))
                .filter(|value| !value.trim().is_empty()),
            // Git >= 2.41 can calculate both values inside the inventory's
            // single graph walk. Older versions return only the first six
            // fields and use the compatibility path in `get_version_lines`.
            unique_commit_count: fields
                .get(6)
                .and_then(|field| decode(field))
                .and_then(|counts| counts.split_ascii_whitespace().next()?.parse().ok()),
            worktree_path: fields
                .get(7)
                .and_then(|field| decode(field))
                .filter(|value| !value.trim().is_empty()),
        });
    }
    ParsedVersionLines {
        lines,
        unreadable_count,
    }
}

const VERSION_LINE_BASE_FORMAT: &str =
    "%(refname)%00%(objectname)%00%(objectname:short)%00%(contents:subject)%00%(committerdate:iso-strict)%00%(upstream:short)";

/// Git 2.41 added `ahead-behind:<committish>` to `for-each-ref`; together
/// with `worktreepath`, it folds the old one-process-per-line count and the
/// separate worktree inventory into the branch inventory's existing graph
/// walk. Discovery still supports older Git versions: an unsupported atom
/// makes this first command fail without mutating anything, then the legacy
/// format and helpers provide exactly the previous answer.
fn read_version_line_refs(
    path: &str,
    current_commit: Option<&str>,
) -> Result<(ParsedVersionLines, bool), AppError> {
    if let Some(commit) = current_commit {
        let format = format!(
            "--format={VERSION_LINE_BASE_FORMAT}%00%(ahead-behind:{commit})%00%(worktreepath)"
        );
        let batched = run_git(
            path,
            &[
                "for-each-ref",
                &format,
                "--sort=-committerdate",
                "refs/heads",
            ],
        )?;
        if batched.status.success() {
            return Ok((parse_version_line_refs(&batched.stdout), true));
        }
    }

    let legacy_format = format!("--format={VERSION_LINE_BASE_FORMAT}");
    let legacy = run_git(
        path,
        &[
            "for-each-ref",
            &legacy_format,
            "--sort=-committerdate",
            "refs/heads",
        ],
    )?;
    if !legacy.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project's version lines.",
        ));
    }
    Ok((parse_version_line_refs(&legacy.stdout), false))
}

/// Read-only, local-only branch inventory. Never contacts a remote; any
/// upstream/reachability information reflects only what is already known
/// from local refs, exactly like the rest of the app's "no fresh remote
/// truth" convention for non-network commands.
#[tauri::command(async)]
fn get_version_lines(path: String) -> Result<VersionLinesSnapshot, AppError> {
    let symbolic_head = run_git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let branch = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    // One verification answers both questions: whether HEAD exists and which
    // commit it names. The previous implementation launched this same command
    // twice on every refresh.
    let verified_head = run_git(&path, &["rev-parse", "--verify", "HEAD"])?;
    let current_commit = verified_head
        .status
        .success()
        .then(|| git_stdout(&verified_head));
    let head_state = match (branch.is_some(), current_commit.is_some()) {
        (true, true) => HeadState::Branch,
        (false, true) => HeadState::Detached,
        (_, false) => HeadState::Unborn,
    };

    let (parsed, has_batched_metadata) = read_version_line_refs(&path, current_commit.as_deref())?;
    let worktrees = if has_batched_metadata {
        Vec::new()
    } else {
        list_worktrees(&path).unwrap_or_default()
    };
    let unreadable_count = parsed.unreadable_count;
    let mut raw_lines = parsed.lines;
    // Counts only what is actually representable; the skipped records are
    // reported separately rather than being folded into a total the list
    // cannot account for.
    let total_count = raw_lines.len();
    let is_truncated = total_count > VERSION_LINE_LIST_CAP;
    raw_lines.truncate(VERSION_LINE_LIST_CAP);

    let reaching_refs = reaching_refs_by_commit(&path)?;
    let mut unique_counts_by_tip = std::collections::HashMap::new();
    let mut lines = Vec::with_capacity(raw_lines.len());
    for raw in raw_lines {
        let is_active = branch.as_deref() == Some(raw.name.as_str());
        let worktree_path = if is_active {
            None
        } else if has_batched_metadata {
            raw.worktree_path
                .as_deref()
                .map(|worktree| display_path(PathBuf::from(worktree)))
        } else {
            worktrees
                .iter()
                .find(|worktree| worktree.branch.as_deref() == Some(raw.name.as_str()))
                .map(|worktree| display_path(PathBuf::from(&worktree.path)))
        };
        let own_ref = format!("refs/heads/{}", raw.name);
        let is_retained_elsewhere = reaching_refs
            .get(&raw.commit)
            .map(|references| references.iter().any(|reference| reference != &own_ref))
            .unwrap_or(false);
        let unique_commit_count = if is_active {
            None
        } else if has_batched_metadata {
            raw.unique_commit_count
        } else {
            *unique_counts_by_tip
                .entry(raw.commit.clone())
                .or_insert_with(|| {
                    branch_unique_commit_count(&path, branch.as_deref(), &raw.commit)
                })
        };
        lines.push(VersionLine {
            name: raw.name,
            tip: VersionLineTip {
                commit: raw.commit,
                short_commit: raw.short_commit,
                subject: raw.subject,
                committed_at: raw.committed_at,
            },
            is_active,
            upstream: raw.upstream,
            is_retained_elsewhere,
            unique_commit_count,
            worktree_path,
        });
    }

    Ok(VersionLinesSnapshot {
        branch,
        head_state,
        current_commit,
        lines,
        total_count,
        is_truncated,
        unreadable_count,
    })
}

// ---- Create a version line ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct CreateVersionLinePlan {
    operation_kind: OperationKind,
    summary: String,
    steps: Vec<String>,
    risks: Vec<String>,
    recovery: String,
    requires_confirmation: bool,
    state_token: String,
    name: String,
    head_state: HeadState,
    starting_commit: Option<String>,
    will_switch: bool,
    has_unsaved_work: bool,
}

struct ValidatedCreate {
    name: String,
    head_state: HeadState,
    starting_commit: Option<String>,
    will_switch: bool,
    has_unsaved_work: bool,
    state_token: String,
}

fn validate_and_prepare_create(
    path: &str,
    name: &str,
    switch: bool,
) -> Result<ValidatedCreate, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let branch = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let (head_state, head_sha) = resolve_head_state(path, branch.clone())?;

    if head_state == HeadState::Unborn {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "Save the first version before creating another version line.",
        )
        .with_remediation("Save a version, then create a new version line."));
    }

    validate_branch_ref_name(path, name)?;

    let existing = list_branch_names(path)?;
    if existing.iter().any(|existing_name| existing_name == name) {
        return Err(AppError::new(
            AppErrorCode::VersionLineNameTaken,
            "A version line with this exact name already exists.",
        )
        .with_remediation("Choose a different name."));
    }
    if let Some(collision) = existing
        .iter()
        .find(|existing_name| existing_name.eq_ignore_ascii_case(name))
    {
        return Err(AppError::new(
            AppErrorCode::VersionLineNameCollides,
            format!(
                "\"{collision}\" already exists and only differs by letter case, which some file systems can't tell apart."
            ),
        )
        .with_remediation("Choose a name that isn't just a different case of an existing one."));
    }

    let status = read_working_tree_status(path.to_string())?;
    if status.counts.conflicted > 0 {
        return Err(AppError::new(
            AppErrorCode::UnresolvedConflicts,
            "Some files have overlapping changes that need to be resolved first.",
        )
        .with_remediation("Resolve the overlapping changes, then try again."));
    }
    let has_unsaved_work = !status.is_clean;
    let will_switch = switch || head_state == HeadState::Detached;

    let mutable_state = create_version_line_state_fingerprint(path, &head_state, &status)?;
    let state_token = compute_version_line_state_token(
        head_sha.as_deref(),
        branch.as_deref(),
        &mutable_state,
        &format!("create:{name}:{will_switch}"),
    );

    Ok(ValidatedCreate {
        name: name.to_string(),
        head_state,
        starting_commit: head_sha,
        will_switch,
        has_unsaved_work,
        state_token,
    })
}

#[tauri::command(async)]
fn plan_create_version_line(
    path: String,
    name: String,
    switch: bool,
) -> Result<CreateVersionLinePlan, AppError> {
    let validated = validate_and_prepare_create(&path, &name, switch)?;
    let mut steps = vec![format!(
        "Create the version line \"{}\" at the current commit.",
        validated.name
    )];
    if validated.will_switch {
        steps.push(format!("Switch this project to \"{}\".", validated.name));
    }
    let mut risks = Vec::new();
    if validated.has_unsaved_work {
        risks.push(
            "Unsaved files and prepared changes stay exactly as they are; future saved versions will belong to the new version line."
                .to_string(),
        );
    }
    if validated.head_state == HeadState::Detached {
        risks.push(
            "This project isn't on a version line right now; creating one here keeps the current commit reachable by name."
                .to_string(),
        );
    }
    let summary = if validated.will_switch {
        format!("Create \"{}\" and switch to it.", validated.name)
    } else {
        format!("Create \"{}\" without switching to it.", validated.name)
    };
    let requires_confirmation = validated.will_switch || validated.has_unsaved_work;
    Ok(CreateVersionLinePlan {
        operation_kind: OperationKind::LocalMutation,
        summary,
        steps,
        risks,
        recovery:
            "No files, saved versions, or other version lines are changed by creating this one."
                .to_string(),
        requires_confirmation,
        state_token: validated.state_token,
        name: validated.name,
        head_state: validated.head_state,
        starting_commit: validated.starting_commit,
        will_switch: validated.will_switch,
        has_unsaved_work: validated.has_unsaved_work,
    })
}

fn classify_ref_mutation_failure(output: &Output, generic_message: &str) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("already exists") {
        AppError::new(
            AppErrorCode::VersionLineNameTaken,
            "That name is already used by another version line.",
        )
        .with_remediation("Choose a different name.")
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to create") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(AppErrorCode::GitCommandFailed, generic_message)
            .with_remediation("Check the project's Git state and try again.")
            .with_detail(truncate_detail(&stderr))
    }
}

#[tauri::command(async)]
fn create_version_line(
    path: String,
    name: String,
    switch: bool,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    let validated = validate_and_prepare_create(&path, &name, switch)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }

    let output = if validated.will_switch {
        run_git(&path, &["switch", "-c", &validated.name])?
    } else {
        let starting = validated.starting_commit.as_deref().unwrap_or("HEAD");
        run_git(&path, &["branch", "--", &validated.name, starting])?
    };
    if !output.status.success() {
        return Err(classify_ref_mutation_failure(
            &output,
            "Git couldn't create this version line.",
        ));
    }
    get_version_lines(path)
}

// ---- Switch to an existing version line ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SwitchVersionLinePlan {
    operation_kind: OperationKind,
    summary: String,
    steps: Vec<String>,
    risks: Vec<String>,
    recovery: String,
    requires_confirmation: bool,
    state_token: String,
    from: String,
    to: String,
    from_commit: String,
    to_commit: String,
    changed_files: Vec<String>,
    changed_files_total: usize,
}

struct ValidatedSwitch {
    from: String,
    to: String,
    from_commit: String,
    to_commit: String,
    changed_files: Vec<String>,
    changed_files_total: usize,
    state_token: String,
}

fn validate_and_prepare_switch(path: &str, target: &str) -> Result<ValidatedSwitch, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let status = read_working_tree_status(path.to_string())?;
    if !status.is_clean {
        return Err(AppError::new(
            AppErrorCode::DirtyWorkingTree,
            "This project has unsaved changes, so GitOdrile can't switch version lines yet.",
        )
        .with_remediation(
            "Save a version, or start a new version line with this work, then try again.",
        ));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let from = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let (head_state, from_commit) = resolve_head_state(path, from.clone())?;
    if head_state == HeadState::Detached {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a version line right now.",
        )
        .with_remediation("Create a version line at this commit first."));
    }
    if head_state == HeadState::Unborn {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "There's no saved version on this version line yet.",
        )
        .with_remediation("Save a version before switching version lines."));
    }
    let from = from.expect("a branch head has a name");
    let from_commit = from_commit.expect("a branch head has a commit");

    validate_branch_ref_name(path, target)?;
    if target == from {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "This is already the active version line.",
        ));
    }

    let target_ref = format!("refs/heads/{target}");
    let target_exists = run_git(path, &["show-ref", "--verify", "--quiet", &target_ref])?;
    if !target_exists.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That version line no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    }
    let to_commit = checked_git_stdout(run_git(path, &["rev-parse", &target_ref])?)?;

    let worktrees = list_worktrees(path)?;
    if let Some(occupied) = worktrees
        .iter()
        .find(|worktree| worktree.branch.as_deref() == Some(target))
    {
        return Err(AppError::new(
            AppErrorCode::VersionLineCheckedOutElsewhere,
            format!(
                "\"{target}\" is already open in another workspace at {}.",
                occupied.path
            ),
        )
        .with_remediation("Switch to it from that workspace instead."));
    }

    let diff_output = run_git(
        path,
        &[
            "diff",
            "--name-only",
            "-z",
            &format!("{from_commit}..{to_commit}"),
        ],
    )?;
    let all_changed_files = if diff_output.status.success() {
        split_nul_list(&diff_output)
    } else {
        Vec::new()
    };
    let changed_files_total = all_changed_files.len();
    let changed_files = all_changed_files.into_iter().take(50).collect();

    let state_token = compute_version_line_state_token(
        Some(&from_commit),
        Some(&from),
        &status_fingerprint(&status),
        &format!("switch:{from}->{target}@{to_commit}"),
    );

    Ok(ValidatedSwitch {
        from,
        to: target.to_string(),
        from_commit,
        to_commit,
        changed_files,
        changed_files_total,
        state_token,
    })
}

#[tauri::command(async)]
fn plan_switch_version_line(
    path: String,
    target: String,
) -> Result<SwitchVersionLinePlan, AppError> {
    let validated = validate_and_prepare_switch(&path, &target)?;
    Ok(SwitchVersionLinePlan {
        operation_kind: OperationKind::LocalMutation,
        summary: format!(
            "Switch from \"{}\" to \"{}\".",
            validated.from, validated.to
        ),
        steps: vec![
            format!(
                "Update this project's files and index to match \"{}\".",
                validated.to
            ),
            "Local history and every other version line stay unchanged.".to_string(),
        ],
        risks: Vec::new(),
        recovery: format!(
            "\"{}\" stays exactly as it is; switching back returns these files.",
            validated.from
        ),
        requires_confirmation: true,
        state_token: validated.state_token,
        from: validated.from,
        to: validated.to,
        from_commit: validated.from_commit,
        to_commit: validated.to_commit,
        changed_files: validated.changed_files,
        changed_files_total: validated.changed_files_total,
    })
}

fn classify_switch_failure(output: &Output) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("would be overwritten")
        || stderr_lower.contains("please commit your changes")
    {
        AppError::new(
            AppErrorCode::VersionLineSwitchObstructed,
            "Git found local changes in the way of this switch that weren't visible in the preview.",
        )
        .with_remediation("Save or discard those changes in Git directly, then try again.")
        .with_detail(truncate_detail(&stderr))
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't switch version lines.",
        )
        .with_remediation("Check the project's Git state and try again.")
        .with_detail(truncate_detail(&stderr))
    }
}

#[tauri::command(async)]
fn switch_version_line(
    path: String,
    target: String,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    let validated = validate_and_prepare_switch(&path, &target)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }
    let output = run_git(&path, &["switch", "--no-guess", &validated.to])?;
    if !output.status.success() {
        return Err(classify_switch_failure(&output));
    }
    get_version_lines(path)
}

// ---- Safely delete a local version line ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct DeleteVersionLinePlan {
    operation_kind: OperationKind,
    summary: String,
    steps: Vec<String>,
    risks: Vec<String>,
    recovery: String,
    requires_confirmation: bool,
    state_token: String,
    name: String,
    tip_commit: String,
    retained_by: Vec<String>,
    upstream: Option<String>,
}

struct ValidatedDelete {
    name: String,
    tip: String,
    retained_by: Vec<String>,
    upstream: Option<String>,
    state_token: String,
}

fn validate_and_prepare_delete(path: &str, name: &str) -> Result<ValidatedDelete, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let active = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    if active.as_deref() == Some(name) {
        return Err(AppError::new(
            AppErrorCode::VersionLineIsActive,
            "The active version line can't be deleted.",
        )
        .with_remediation("Switch to a different version line first."));
    }

    let target_ref = format!("refs/heads/{name}");
    let target_exists = run_git(path, &["show-ref", "--verify", "--quiet", &target_ref])?;
    if !target_exists.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That version line no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    }
    let tip = checked_git_stdout(run_git(path, &["rev-parse", &target_ref])?)?;

    let worktrees = list_worktrees(path)?;
    if let Some(occupied) = worktrees
        .iter()
        .find(|worktree| worktree.branch.as_deref() == Some(name))
    {
        return Err(AppError::new(
            AppErrorCode::VersionLineCheckedOutElsewhere,
            format!(
                "\"{name}\" is open in another workspace at {}.",
                occupied.path
            ),
        )
        .with_remediation(
            "Close that workspace, or switch it to a different version line, before deleting.",
        ));
    }

    let retained_by = retaining_refs(path, name, &tip)?;
    if retained_by.is_empty() {
        return Err(AppError::new(
            AppErrorCode::VersionLineUniqueWork,
            format!(
                "\"{name}\" has saved work that isn't reachable from any other version line or remote yet."
            ),
        )
        .with_remediation(
            "Merge or publish this work, or keep the version line, before deleting it.",
        ));
    }

    let upstream_output = run_git(
        path,
        &["for-each-ref", "--format=%(upstream:short)", &target_ref],
    )?;
    let upstream = upstream_output
        .status
        .success()
        .then(|| git_stdout(&upstream_output))
        .filter(|value| !value.is_empty());

    let status = read_working_tree_status(path.to_string())?;
    let state_token = compute_version_line_state_token(
        Some(&tip),
        Some(name),
        &status_fingerprint(&status),
        &format!("delete:{name}:{}", retained_by.join(",")),
    );

    Ok(ValidatedDelete {
        name: name.to_string(),
        tip,
        retained_by,
        upstream,
        state_token,
    })
}

#[tauri::command(async)]
fn plan_delete_version_line(path: String, name: String) -> Result<DeleteVersionLinePlan, AppError> {
    let validated = validate_and_prepare_delete(&path, &name)?;
    Ok(DeleteVersionLinePlan {
        operation_kind: OperationKind::Destructive,
        summary: format!("Delete the version line \"{}\".", validated.name),
        steps: vec![format!(
            "Remove the local reference \"{}\"; its saved work stays reachable from {}.",
            validated.name,
            validated.retained_by.join(", ")
        )],
        risks: vec![
            "This can't be undone from GitOdrile; the retained reference(s) above are the only guaranteed way back to this work."
                .to_string(),
        ],
        recovery: format!("Reachable from: {}", validated.retained_by.join(", ")),
        requires_confirmation: true,
        state_token: validated.state_token,
        name: validated.name,
        tip_commit: validated.tip,
        retained_by: validated.retained_by,
        upstream: validated.upstream,
    })
}

fn classify_delete_failure(output: &Output) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("not fully merged") {
        AppError::new(
            AppErrorCode::VersionLineUniqueWork,
            "Git found work on this version line that isn't safely reachable elsewhere yet.",
        )
        .with_remediation(
            "Merge or publish this work, or keep the version line, before deleting it.",
        )
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't delete this version line.",
        )
        .with_remediation("Check the project's Git state and try again.")
        .with_detail(truncate_detail(&stderr))
    }
}

#[tauri::command(async)]
fn delete_version_line(
    path: String,
    name: String,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    let validated = validate_and_prepare_delete(&path, &name)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }
    // Never `-D`: Git's own safe-delete refusal (a branch not fully merged
    // into its upstream or HEAD) is the actual enforcement of "never delete
    // unique work" — `retained_by` above only explains why it's expected to
    // succeed.
    let output = run_git(&path, &["branch", "-d", "--", &validated.name])?;
    if !output.status.success() {
        return Err(classify_delete_failure(&output));
    }
    get_version_lines(path)
}

/// Starts reporting filesystem changes for an open project (task 020).
///
/// Returns whether a watch could actually be established. `false` is a normal
/// outcome, not a failure to report: network shares, some container mounts,
/// and an exhausted inotify budget all leave a project on the manual "Check
/// changes" path, which keeps working exactly as before. A real `Err` is
/// reserved for a path that isn't a usable repository at all.
#[tauri::command(async)]
fn watch_repository(
    app: tauri::AppHandle,
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
) -> Result<bool, AppError> {
    let root = Path::new(&path);
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
    let git_dir_raw = checked_git_stdout(run_git(&path, &["rev-parse", "--absolute-git-dir"])?)?;
    let common_git_dir_raw =
        checked_git_stdout(run_git(&path, &["rev-parse", "--git-common-dir"])?)?;
    let mut git_dirs = vec![
        normalized_path(root, &git_dir_raw),
        root.join(".git"),
        normalized_path(root, &common_git_dir_raw),
    ];
    // Order is deliberately not significant here: a linked worktree's private
    // directory lives inside the common one, and the event filter resolves
    // that overlap itself by matching the most specific entry (see
    // `watch::is_relevant_path`). `dedup` collapses the normal-repository
    // case, where all three resolve to the same `.git`.
    git_dirs.dedup();
    Ok(registry.watch(app, &path, git_dirs))
}

#[tauri::command(async)]
fn unwatch_repository(registry: tauri::State<'_, watch::WatcherRegistry>, path: String) {
    registry.unwatch(&path);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(watch::WatcherRegistry::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            app_status,
            show_main_window,
            open_repository,
            read_working_tree_status,
            read_file_diff,
            read_working_tree_diffs,
            git_diagnostics,
            install_git,
            update_git,
            check_git_update,
            get_git_identity,
            set_git_identity,
            plan_save_version,
            save_version,
            discover_remotes,
            list_unpublished_versions,
            read_commit_file_changes,
            read_commit_file_diff,
            plan_publish,
            publish,
            get_version_lines,
            plan_create_version_line,
            create_version_line,
            plan_switch_version_line,
            switch_version_line,
            plan_delete_version_line,
            delete_version_line,
            watch_repository,
            unwatch_repository
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

    /// Joins porcelain-v2 records the way `-z` emits them: every record, and
    /// every rename's original path, is its own NUL-terminated field.
    fn porcelain_v2(records: &[&str]) -> Vec<u8> {
        let mut bytes = Vec::new();
        for record in records {
            bytes.extend_from_slice(record.as_bytes());
            bytes.push(0);
        }
        bytes
    }

    const HASHES: &str = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 \
                          e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";

    #[test]
    fn status_parser_reports_a_clean_repository() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            "# branch.oid 1234567890abcdef1234567890abcdef12345678",
            "# branch.head main",
        ]));

        assert!(status.is_clean);
        assert_eq!(status.counts, WorkingTreeCounts::default());
        assert!(status.entries.is_empty());
        assert!(!status.truncated);
        assert_eq!(status.upstream.branch, Some("main".to_string()));
    }

    #[test]
    fn status_parser_separates_staged_and_unstaged_modifications() {
        let staged = parse_status_porcelain_v2(&porcelain_v2(&[&format!(
            "1 M. N... 100644 100644 100644 {HASHES} staged.txt"
        )]));
        let unstaged = parse_status_porcelain_v2(&porcelain_v2(&[&format!(
            "1 .M N... 100644 100644 100644 {HASHES} unstaged.txt"
        )]));

        // Both are simply "changed" to the user: the index/worktree split is
        // not the product's primary concept.
        for status in [staged, unstaged] {
            assert!(!status.is_clean);
            assert_eq!(status.counts.changed, 1);
            assert_eq!(status.counts.total, 1);
            assert_eq!(status.entries[0].category, ChangeCategory::Changed);
        }
    }

    #[test]
    fn status_parser_classifies_every_category_in_a_mixed_status() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +2 -3",
            &format!("1 .M N... 100644 100644 100644 {HASHES} changed.txt"),
            &format!("1 A. N... 100644 100644 100644 {HASHES} added.txt"),
            &format!("1 .D N... 100644 100644 000000 {HASHES} deleted.txt"),
            &format!("2 R. N... 100644 100644 100644 {HASHES} R100 renamed-new.txt"),
            "renamed-old.txt",
            &format!("u UU N... 100644 100644 100644 100644 {HASHES} e69de29 conflict.txt"),
            "? untracked.txt",
        ]));

        assert_eq!(
            status.counts,
            WorkingTreeCounts {
                changed: 1,
                new_files: 2,
                deleted: 1,
                renamed: 1,
                conflicted: 1,
                total: 6,
            }
        );
        assert!(!status.is_clean);
        assert_eq!(status.upstream.upstream, Some("origin/main".to_string()));
        assert_eq!(status.upstream.ahead, 2);
        assert_eq!(status.upstream.behind, 3);
    }

    #[test]
    fn status_parser_keeps_both_sides_of_a_rename() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            &format!("2 R. N... 100644 100644 100644 {HASHES} R100 new name.txt"),
            "old name.txt",
        ]));

        assert_eq!(status.counts.renamed, 1);
        assert_eq!(status.entries[0].category, ChangeCategory::Renamed);
        assert_eq!(status.entries[0].path, "new name.txt");
        assert_eq!(
            status.entries[0].original_path,
            Some("old name.txt".to_string())
        );
    }

    #[test]
    fn status_parser_preserves_paths_with_spaces_and_non_ascii_characters() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            &format!("1 .M N... 100644 100644 100644 {HASHES} src/a file — ñ.txt"),
            "? another new file.md",
        ]));

        assert_eq!(status.entries[0].path, "src/a file — ñ.txt");
        assert_eq!(status.entries[1].path, "another new file.md");
    }

    #[test]
    fn status_parser_does_not_present_a_detached_head_as_a_branch() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            "# branch.oid 1234567890abcdef1234567890abcdef12345678",
            "# branch.head (detached)",
        ]));

        assert_eq!(status.upstream.branch, None);
        assert!(status.is_clean);
    }

    #[test]
    fn status_parser_reports_an_unborn_branch_without_error() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            "# branch.oid (initial)",
            "# branch.head main",
            "? first.txt",
        ]));

        assert_eq!(status.upstream.branch, Some("main".to_string()));
        assert_eq!(status.counts.new_files, 1);
        assert!(!status.is_clean);
    }

    #[test]
    fn status_parser_caps_the_entry_list_but_never_the_counts() {
        let records: Vec<String> = (0..MAX_REPORTED_ENTRIES + 25)
            .map(|index| format!("? file-{index}.txt"))
            .collect();
        let borrowed: Vec<&str> = records.iter().map(String::as_str).collect();

        let status = parse_status_porcelain_v2(&porcelain_v2(&borrowed));

        assert!(status.truncated);
        assert_eq!(status.entries.len(), MAX_REPORTED_ENTRIES);
        assert_eq!(status.counts.new_files, MAX_REPORTED_ENTRIES + 25);
        assert_eq!(status.counts.total, MAX_REPORTED_ENTRIES + 25);
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

    fn sample_entry(path: &str, category: ChangeCategory) -> RawStatusEntry {
        RawStatusEntry {
            path: path.to_string(),
            original_path: None,
            category,
            is_untracked: false,
            is_prepared: false,
            has_unprepared_changes: true,
        }
    }

    /// A real exit status with fabricated stdout, for testing the pure
    /// stdout, for testing the pure functions that turn `git diff` output
    /// into a `FileDiff` without needing a matching real diff to produce it.
    fn fake_output(stdout: &str) -> CappedOutput {
        let real = base_git_command()
            .arg("--version")
            .output()
            .expect("run git --version");
        CappedOutput {
            stdout: stdout.as_bytes().to_vec(),
            status: real.status,
            limit_exceeded: stdout.len() > MAX_DIFF_OUTPUT_BYTES,
        }
    }

    #[test]
    fn parse_hunk_header_parses_standard_and_omitted_counts() {
        assert_eq!(
            parse_hunk_header("@@ -3,7 +3,6 @@ fn foo() {"),
            Some((3, 7, 3, 6))
        );
        assert_eq!(parse_hunk_header("@@ -1 +1,2 @@"), Some((1, 1, 1, 2)));
        assert_eq!(parse_hunk_header("@@ -0,0 +1,3 @@"), Some((0, 0, 1, 3)));
        assert_eq!(parse_hunk_header("not a header"), None);
    }

    #[test]
    fn parse_diff_body_numbers_context_addition_and_deletion_lines() {
        let text = "diff --git a/f.txt b/f.txt\nindex 111..222 100644\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n context2\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks.len(), 1);
        let lines = &parsed.hunks[0].lines;
        assert_eq!(
            lines[0],
            DiffLine {
                kind: DiffLineKind::Context,
                content: "context".to_string(),
                old_line_number: Some(1),
                new_line_number: Some(1),
            }
        );
        assert_eq!(
            lines[1],
            DiffLine {
                kind: DiffLineKind::Deletion,
                content: "old".to_string(),
                old_line_number: Some(2),
                new_line_number: None,
            }
        );
        assert_eq!(
            lines[2],
            DiffLine {
                kind: DiffLineKind::Addition,
                content: "new".to_string(),
                old_line_number: None,
                new_line_number: Some(2),
            }
        );
        assert_eq!(
            lines[3],
            DiffLine {
                kind: DiffLineKind::Context,
                content: "context2".to_string(),
                old_line_number: Some(3),
                new_line_number: Some(3),
            }
        );
        assert!(!parsed.truncated);
    }

    #[test]
    fn parse_diff_body_handles_multiple_hunks() {
        let text = "@@ -1,1 +1,1 @@\n-a\n+b\n@@ -10,1 +10,1 @@\n-c\n+d\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks.len(), 2);
        assert_eq!(parsed.hunks[0].old_start, 1);
        assert_eq!(parsed.hunks[1].old_start, 10);
    }

    #[test]
    fn parse_diff_body_ignores_the_no_newline_marker() {
        let text = "@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks[0].lines.len(), 2);
    }

    #[test]
    fn parse_diff_body_truncates_after_the_line_cap() {
        let mut text = String::from("@@ -1,1 +1,20000 @@\n");
        for index in 0..MAX_DIFF_LINES + 50 {
            text.push_str(&format!("+line {index}\n"));
        }

        let parsed = parse_diff_body(&text);

        assert!(parsed.truncated);
        assert_eq!(parsed.hunks[0].lines.len(), MAX_DIFF_LINES);
    }

    #[test]
    fn build_text_result_flags_binary_marker_output() {
        let entry = sample_entry("image.png", ChangeCategory::Changed);
        let output = fake_output("Binary files a/image.png and b/image.png differ\n");

        assert!(matches!(
            build_text_result(&entry, &output),
            FileDiff::Binary { .. }
        ));
    }

    #[test]
    fn build_text_result_flags_output_over_the_byte_limit() {
        let entry = sample_entry("huge.txt", ChangeCategory::Changed);
        let big = "a".repeat(MAX_DIFF_OUTPUT_BYTES + 1);
        let output = fake_output(&big);

        match build_text_result(&entry, &output) {
            FileDiff::TooLarge { limit_bytes, .. } => {
                assert_eq!(limit_bytes, MAX_DIFF_OUTPUT_BYTES as u64);
            }
            other => panic!("expected too-large, got {other:?}"),
        }
    }

    #[test]
    fn build_text_result_returns_unchanged_for_a_pure_rename_header() {
        let entry = RawStatusEntry {
            path: "new.txt".to_string(),
            original_path: Some("old.txt".to_string()),
            category: ChangeCategory::Renamed,
            is_untracked: false,
            is_prepared: true,
            has_unprepared_changes: false,
        };
        let output = fake_output(
            "diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n",
        );

        assert!(matches!(
            build_text_result(&entry, &output),
            FileDiff::Unchanged { .. }
        ));
    }

    #[test]
    fn validate_repo_relative_path_rejects_absolute_and_traversal_paths() {
        assert_eq!(
            validate_repo_relative_path("").unwrap_err().code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("/etc/passwd").unwrap_err().code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("../outside.txt")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("src/../../outside.txt")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn validate_repo_relative_path_rejects_a_windows_drive_path() {
        assert_eq!(
            validate_repo_relative_path("C:/Windows/system.ini")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
    }

    #[test]
    fn validate_repo_relative_path_accepts_ordinary_relative_paths() {
        assert!(validate_repo_relative_path("src/main.rs").is_ok());
        assert!(validate_repo_relative_path("a file — ñ.txt").is_ok());
    }

    #[test]
    fn checked_status_rejects_a_path_that_cannot_be_represented_losslessly() {
        let stdout = b"? invalid-\xff-name.txt\0";
        let error = checked_status_records(stdout)
            .err()
            .expect("invalid UTF-8 should return a structured error");

        assert_eq!(error.code, AppErrorCode::PathEncodingUnsupported);
    }

    #[test]
    fn find_status_entry_distinguishes_untracked_from_staged_new() {
        let stdout = porcelain_v2(&[
            &format!("1 A. N... 100644 100644 100644 {HASHES} staged-new.txt"),
            "? untracked-new.txt",
        ]);

        let staged = find_status_entry(&stdout, "staged-new.txt")
            .expect("status should parse")
            .expect("staged entry should be found");
        assert_eq!(staged.category, ChangeCategory::New);
        assert!(!staged.is_untracked);

        let untracked = find_status_entry(&stdout, "untracked-new.txt")
            .expect("status should parse")
            .expect("untracked entry should be found");
        assert_eq!(untracked.category, ChangeCategory::New);
        assert!(untracked.is_untracked);
    }

    #[test]
    fn find_status_entry_keeps_both_sides_of_a_rename() {
        let stdout = porcelain_v2(&[
            &format!("2 R. N... 100644 100644 100644 {HASHES} R100 new name.txt"),
            "old name.txt",
        ]);

        let entry = find_status_entry(&stdout, "new name.txt")
            .expect("status should parse")
            .expect("rename entry should be found");
        assert_eq!(entry.category, ChangeCategory::Renamed);
        assert_eq!(entry.original_path.as_deref(), Some("old name.txt"));
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

    #[test]
    fn git_version_at_least_compares_numerically_not_lexically() {
        assert!(git_version_at_least("2.23.0", (2, 23, 0)));
        assert!(git_version_at_least("2.40.1", (2, 23, 0)));
        assert!(git_version_at_least("3.0.0", (2, 23, 0)));
        assert!(!git_version_at_least("2.9.0", (2, 23, 0)));
        assert!(!git_version_at_least("1.99.9", (2, 23, 0)));
        // A trailing platform suffix (as Git for Windows appends) must not
        // break parsing of the leading numeric triple.
        assert!(git_version_at_least("2.39.2.windows.1", (2, 23, 0)));
    }

    #[test]
    fn parse_worktree_list_porcelain_reports_each_block_and_its_branch() {
        let text = "worktree /repo/main\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo/linked\nHEAD def456\nbranch refs/heads/feature\n\nworktree /repo/detached\nHEAD 789abc\ndetached\n";
        let entries = parse_worktree_list_porcelain(text);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].path, "/repo/main");
        assert_eq!(entries[0].branch.as_deref(), Some("main"));
        assert_eq!(entries[1].path, "/repo/linked");
        assert_eq!(entries[1].branch.as_deref(), Some("feature"));
        assert_eq!(entries[2].path, "/repo/detached");
        assert_eq!(entries[2].branch, None);
    }

    #[test]
    fn parse_version_line_refs_reads_nul_delimited_fields() {
        let text = b"refs/heads/main\0abc123\0abc12\0First subject\x002024-01-01T00:00:00+00:00\0origin/main\nrefs/heads/feature/nested\0def456\0def45\0Nested line\x002024-02-02T00:00:00+00:00\0\n";
        let lines = parse_version_line_refs(text).lines;
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].name, "main");
        assert_eq!(lines[0].commit, "abc123");
        assert_eq!(lines[0].upstream.as_deref(), Some("origin/main"));
        // A nested (`feature/name`) ref name and an empty upstream field
        // must both survive without being mistaken for malformed input.
        assert_eq!(lines[1].name, "feature/nested");
        assert_eq!(lines[1].upstream, None);
    }

    #[test]
    fn parse_version_line_refs_reads_batched_counts_and_worktrees() {
        let text = b"refs/heads/feature\0def456\0def45\0Feature\x002024-02-02T00:00:00+00:00\0origin/feature\x003 7\0C:/repo-linked\n";
        let lines = parse_version_line_refs(text).lines;
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].unique_commit_count, Some(3));
        assert_eq!(lines[0].worktree_path.as_deref(), Some("C:/repo-linked"));
    }

    #[test]
    fn parse_version_line_refs_ignores_a_malformed_record() {
        let text = b"not-a-ref-line-at-all\nrefs/heads/main\0abc\0ab\0subject\0date\0\n";
        let lines = parse_version_line_refs(text).lines;
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].name, "main");
    }

    #[test]
    fn parse_version_line_refs_skips_a_non_utf8_name_without_lossy_replacement() {
        // One unrepresentable name must not cost the user the rest of the
        // inventory, and must never be shown as a name that does not exist:
        // every mutation is keyed by the exact bytes.
        let bytes = b"refs/heads/feature-\xff\0abc\0ab\0subject\0date\0\nrefs/heads/main\0def\0de\0ok\0date\0\n";
        let parsed = parse_version_line_refs(bytes);
        assert_eq!(parsed.unreadable_count, 1);
        assert_eq!(parsed.lines.len(), 1);
        assert_eq!(parsed.lines[0].name, "main");
        assert!(
            !parsed
                .lines
                .iter()
                .any(|line| line.name.contains(char::REPLACEMENT_CHARACTER)),
            "a skipped name must never reappear as replacement characters"
        );
    }

    #[test]
    fn compute_version_line_state_token_is_stable_then_changes_with_status() {
        let first = compute_version_line_state_token(
            Some("abc"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        let same = compute_version_line_state_token(
            Some("abc"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        assert_eq!(first, same);

        let after_dirty = compute_version_line_state_token(
            Some("abc"),
            Some("main"),
            "clean:false|total:1|",
            "switch:main->feature@def",
        );
        assert_ne!(first, after_dirty);

        let after_head_moved = compute_version_line_state_token(
            Some("zzz"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        assert_ne!(first, after_head_moved);
    }

    fn write_and_commit(path: &str, name: &str, contents: &str, message: &str) {
        write_file(path, name, contents);
        git_add_all(path);
        git_commit(path, message);
    }

    #[test]
    fn get_version_lines_reports_active_and_other_lines_with_reachability() {
        let path = unique_temp_dir("vl-discovery");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        let status = git_command(&path)
            .args(["branch", "feature"])
            .status()
            .expect("run git branch feature");
        assert!(status.success());

        let snapshot = get_version_lines(path.clone()).expect("discovery should succeed");
        assert_eq!(snapshot.branch, Some(current_branch(&path)));
        assert_eq!(snapshot.lines.len(), 2);
        let active = snapshot.lines.iter().find(|line| line.is_active).unwrap();
        assert_eq!(active.name, snapshot.branch.clone().unwrap());
        let feature = snapshot
            .lines
            .iter()
            .find(|line| line.name == "feature")
            .unwrap();
        // "feature" points at the very same commit as the active branch, so
        // it must be reported as already retained elsewhere.
        assert!(feature.is_retained_elsewhere);
        assert!(!feature.is_active);
        assert!(feature.worktree_path.is_none());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn get_version_lines_flags_a_branch_checked_out_in_a_linked_worktree() {
        let path = unique_temp_dir("vl-worktree");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let worktree = Path::new(&path).join("linked");
        let status = git_command(&path)
            .args(["worktree", "add", "-q", "-b", "linked-line"])
            .arg(&worktree)
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let snapshot = get_version_lines(path.clone()).expect("discovery should succeed");
        let linked = snapshot
            .lines
            .iter()
            .find(|line| line.name == "linked-line")
            .unwrap();
        assert!(linked.worktree_path.is_some());
        let active = snapshot
            .lines
            .iter()
            .find(|line| line.name == branch)
            .unwrap();
        assert!(active.is_active);
        assert!(active.worktree_path.is_none());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_defaults_to_create_and_switch() {
        let path = unique_temp_dir("vl-create-switch");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let original_head = git_stdout(&run_git(&path, &["rev-parse", "HEAD"]).unwrap());

        let plan = plan_create_version_line(path.clone(), "feature-x".to_string(), true)
            .expect("plan should succeed");
        assert!(plan.will_switch);
        assert!(plan.requires_confirmation);
        assert_eq!(plan.operation_kind, OperationKind::LocalMutation);

        let snapshot = create_version_line(
            path.clone(),
            "feature-x".to_string(),
            true,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(snapshot.branch.as_deref(), Some("feature-x"));
        assert_eq!(
            git_stdout(&run_git(&path, &["rev-parse", "HEAD"]).unwrap()),
            original_head,
            "creating a line at the current commit must not move HEAD's target"
        );

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_without_switching_stays_on_the_original_line() {
        let path = unique_temp_dir("vl-create-no-switch");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let original_branch = current_branch(&path);

        let plan = plan_create_version_line(path.clone(), "feature-y".to_string(), false)
            .expect("plan should succeed");
        assert!(!plan.will_switch);

        create_version_line(
            path.clone(),
            "feature-y".to_string(),
            false,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(current_branch(&path), original_branch);
        let branches = list_branch_names(&path).unwrap();
        assert!(branches.contains(&"feature-y".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_preserves_unsaved_and_untracked_work() {
        let path = unique_temp_dir("vl-create-dirty");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "a.txt", "one\nmodified\n");
        write_file(&path, "new.txt", "untracked\n");

        let plan = plan_create_version_line(path.clone(), "carrying-work".to_string(), true)
            .expect("plan should succeed");
        assert!(plan.has_unsaved_work);

        create_version_line(
            path.clone(),
            "carrying-work".to_string(),
            true,
            plan.state_token,
        )
        .expect("create should succeed");

        assert_eq!(
            fs::read_to_string(Path::new(&path).join("a.txt")).unwrap(),
            "one\nmodified\n"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&path).join("new.txt")).unwrap(),
            "untracked\n"
        );
        let status = read_working_tree_status(path.clone()).unwrap();
        assert!(!status.is_clean);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_recovers_a_detached_head() {
        let path = unique_temp_dir("vl-create-detached");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let commit = git_stdout(&run_git(&path, &["rev-parse", "HEAD"]).unwrap());
        let status = git_command(&path)
            .args(["checkout", "-q", &commit])
            .status()
            .expect("detach HEAD");
        assert!(status.success());

        let plan = plan_create_version_line(path.clone(), "recovered".to_string(), false)
            .expect("plan should succeed even without an explicit switch request");
        assert!(
            plan.will_switch,
            "detached HEAD must force create-and-switch"
        );

        create_version_line(
            path.clone(),
            "recovered".to_string(),
            false,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(current_branch(&path), "recovered");
        assert_eq!(
            git_stdout(&run_git(&path, &["rev-parse", "HEAD"]).unwrap()),
            commit
        );

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_an_unborn_branch() {
        let path = unique_temp_dir("vl-create-unborn");
        git_init(&path);

        let error = plan_create_version_line(path.clone(), "too-soon".to_string(), true)
            .expect_err("an unborn branch has nothing to branch from yet");
        assert_eq!(error.code, AppErrorCode::UnbornBranchNoVersion);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_a_duplicate_name() {
        let path = unique_temp_dir("vl-create-dup");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let error = plan_create_version_line(path.clone(), branch, true)
            .expect_err("the current branch's own name must be rejected as a duplicate");
        assert_eq!(error.code, AppErrorCode::VersionLineNameTaken);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_a_case_only_collision() {
        let path = unique_temp_dir("vl-create-case");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "Feature-Z"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let error = plan_create_version_line(path.clone(), "feature-z".to_string(), false)
            .expect_err("a case-only collision must be rejected before mutation");
        assert_eq!(error.code, AppErrorCode::VersionLineNameCollides);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_a_stale_state_token() {
        let path = unique_temp_dir("vl-create-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        let plan = plan_create_version_line(path.clone(), "feature-stale".to_string(), false)
            .expect("plan should succeed");
        write_file(&path, "b.txt", "changed after preview\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale".to_string(),
            false,
            plan.state_token,
        )
        .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);
        assert!(!list_branch_names(&path)
            .unwrap()
            .contains(&"feature-stale".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_changed_content_with_the_same_status_shape() {
        let path = unique_temp_dir("vl-create-stale-content");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "pending.txt", "before preview\n");

        let plan =
            plan_create_version_line(path.clone(), "feature-stale-content".to_string(), true)
                .expect("plan should succeed with ordinary unsaved work");
        // The file remains untracked before and after, so the old status-only
        // token was identical even though the confirmed bytes had changed.
        write_file(&path, "pending.txt", "after preview\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale-content".to_string(),
            true,
            plan.state_token,
        )
        .expect_err("content drift after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);
        assert!(!list_branch_names(&path)
            .unwrap()
            .contains(&"feature-stale-content".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_changed_staged_content_with_the_same_worktree() {
        let path = unique_temp_dir("vl-create-stale-index");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "a.txt", "staged before preview\n");
        git_add(&path, "a.txt");
        write_file(&path, "a.txt", "same final worktree\n");

        let plan = plan_create_version_line(path.clone(), "feature-stale-index".to_string(), true)
            .expect("plan should capture both index and worktree content");
        write_file(&path, "a.txt", "different staged content\n");
        git_add(&path, "a.txt");
        write_file(&path, "a.txt", "same final worktree\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale-index".to_string(),
            true,
            plan.state_token,
        )
        .expect_err("staged-content drift must stop execution even when the worktree matches");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);

        let _ = fs::remove_dir_all(&path);
    }

    fn make_two_branch_repo(label: &str) -> (String, String, String) {
        let path = unique_temp_dir(label);
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let from_branch = current_branch(&path);
        let status = git_command(&path)
            .args(["switch", "-c", "target-line"])
            .status()
            .expect("run git switch -c");
        assert!(status.success());
        write_and_commit(&path, "b.txt", "two\n", "second");
        let status = git_command(&path)
            .args(["switch", &from_branch])
            .status()
            .expect("run git switch back");
        assert!(status.success());
        (path, from_branch, "target-line".to_string())
    }

    #[test]
    fn switch_version_line_moves_between_two_clean_branches() {
        let (path, from_branch, target) = make_two_branch_repo("vl-switch-clean");

        let plan = plan_switch_version_line(path.clone(), target.clone())
            .expect("plan should succeed for a clean project");
        assert_eq!(plan.from, from_branch);
        assert_eq!(plan.to, target);
        assert_eq!(plan.changed_files, vec!["b.txt".to_string()]);
        assert!(plan.requires_confirmation);

        switch_version_line(path.clone(), target.clone(), plan.state_token)
            .expect("switch should succeed");
        assert_eq!(current_branch(&path), target);
        assert!(Path::new(&path).join("b.txt").exists());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn switch_version_line_blocks_on_unsaved_work() {
        let (path, _from_branch, target) = make_two_branch_repo("vl-switch-dirty");
        write_file(&path, "uncommitted.txt", "oops\n");

        let error = plan_switch_version_line(path.clone(), target)
            .expect_err("unsaved work must block switching to an existing line");
        assert_eq!(error.code, AppErrorCode::DirtyWorkingTree);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn switch_version_line_blocks_a_branch_checked_out_in_another_worktree() {
        let (path, _from_branch, target) = make_two_branch_repo("vl-switch-worktree");
        // Sibling of the repo, not nested inside it — a worktree created
        // inside the repo root would itself show up as an untracked
        // directory in the main worktree's own status.
        let mut worktree = std::env::temp_dir();
        worktree.push(format!(
            "gitodrile-test-vl-switch-worktree-linked-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&worktree);
        let status = git_command(&path)
            .args([
                "worktree",
                "add",
                "-q",
                &worktree.to_string_lossy(),
                &target,
            ])
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let error = plan_switch_version_line(path.clone(), target)
            .expect_err("a branch checked out elsewhere must not be switchable here");
        assert_eq!(error.code, AppErrorCode::VersionLineCheckedOutElsewhere);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&worktree);
    }

    #[test]
    fn switch_version_line_rejects_a_stale_state_token() {
        let (path, _from_branch, target) = make_two_branch_repo("vl-switch-stale");
        let plan =
            plan_switch_version_line(path.clone(), target.clone()).expect("plan should succeed");

        // Something changes the project between preview and execution.
        write_and_commit(&path, "c.txt", "three\n", "third");

        let error = switch_version_line(path.clone(), target, plan.state_token)
            .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_removes_a_fully_retained_branch() {
        let path = unique_temp_dir("vl-delete-retained");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "mergeable"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let plan = plan_delete_version_line(path.clone(), "mergeable".to_string())
            .expect("a branch identical to a retained ref must be deletable");
        assert!(!plan.retained_by.is_empty());
        assert_eq!(plan.operation_kind, OperationKind::Destructive);

        delete_version_line(path.clone(), "mergeable".to_string(), plan.state_token)
            .expect("delete should succeed");
        assert!(!list_branch_names(&path)
            .unwrap()
            .contains(&"mergeable".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_blocks_the_active_branch() {
        let path = unique_temp_dir("vl-delete-active");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let error = plan_delete_version_line(path.clone(), branch)
            .expect_err("the active version line can never be deleted");
        assert_eq!(error.code, AppErrorCode::VersionLineIsActive);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_blocks_unique_unretained_work() {
        let path = unique_temp_dir("vl-delete-unique");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["switch", "-c", "unique-work"])
            .status()
            .expect("run git switch -c");
        assert!(status.success());
        write_and_commit(&path, "only-here.txt", "unique\n", "unique commit");
        let status = git_command(&path)
            .args(["switch", "-"])
            .status()
            .expect("run git switch -");
        assert!(status.success());

        let error = plan_delete_version_line(path.clone(), "unique-work".to_string())
            .expect_err("a branch with unreachable unique work must not be deletable");
        assert_eq!(error.code, AppErrorCode::VersionLineUniqueWork);
        assert!(list_branch_names(&path)
            .unwrap()
            .contains(&"unique-work".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_blocks_a_branch_checked_out_elsewhere() {
        let path = unique_temp_dir("vl-delete-worktree");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let worktree = Path::new(&path).join("linked");
        let status = git_command(&path)
            .args([
                "worktree",
                "add",
                "-q",
                &worktree.to_string_lossy(),
                "-b",
                "elsewhere",
            ])
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let error = plan_delete_version_line(path.clone(), "elsewhere".to_string())
            .expect_err("a branch checked out in another worktree must not be deletable here");
        assert_eq!(error.code, AppErrorCode::VersionLineCheckedOutElsewhere);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_rejects_a_stale_state_token() {
        let path = unique_temp_dir("vl-delete-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "goes-away"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let plan = plan_delete_version_line(path.clone(), "goes-away".to_string())
            .expect("plan should succeed");
        // Left uncommitted on purpose: a fresh commit alone would leave the
        // tree clean again and wouldn't move the state token, since the
        // token's status fingerprint only reflects working-tree drift.
        write_file(&path, "c.txt", "uncommitted change after preview\n");

        let error = delete_version_line(path.clone(), "goes-away".to_string(), plan.state_token)
            .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);
        assert!(list_branch_names(&path)
            .unwrap()
            .contains(&"goes-away".to_string()));

        let _ = fs::remove_dir_all(&path);
    }
}

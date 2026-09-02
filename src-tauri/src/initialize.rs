//! Safe local project creation and ordinary-folder initialization.
//!
//! The workflow owns only paths it creates exclusively. Existing working
//! files are never opened for writing, copied, moved, or removed. A plan binds
//! the canonical destination and user choices; execution repeats every safety
//! check immediately before creating the exact target and `.git` directory.

use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{git_stdout, run_git, run_global_git_with_env};
use crate::repository::display_path;
use std::fs::{self, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const OWNER_MARKER: &str = ".gitodile-init-owner";
const OWNER_VERSION: &str = "gitodile-init-v1";
const MAX_PROJECT_NAME_CHARS: usize = 120;
const MAX_INSPECTED_ENTRIES: usize = 20_000;

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum InitializeTargetKind {
    NewFolder,
    ExistingFolder,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum InitializeProgressPhase {
    Revalidating,
    PreparingFolder,
    InitializingGit,
    CreatingReadme,
    Verifying,
    Finalizing,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InitializeProjectPlan {
    pub(crate) operation_kind: &'static str,
    pub(crate) requires_confirmation: bool,
    pub(crate) operation_id: String,
    pub(crate) state_token: String,
    pub(crate) target_kind: InitializeTargetKind,
    pub(crate) destination_path: String,
    pub(crate) initial_branch: String,
    pub(crate) create_readme: bool,
    pub(crate) save_initial_version: bool,
    pub(crate) identity_ready: bool,
    pub(crate) existing_entry_count: usize,
    pub(crate) existing_entries_truncated: bool,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum InitializeOutcome {
    Completed,
    CleanupRequired,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InitializeProjectResult {
    pub(crate) outcome: InitializeOutcome,
    pub(crate) operation_id: String,
    pub(crate) destination_path: String,
    pub(crate) readme_created: bool,
    pub(crate) cleanup_path: Option<String>,
}

#[derive(Debug)]
struct ValidatedInitialize {
    target_kind: InitializeTargetKind,
    destination: PathBuf,
    initial_branch: String,
    create_readme: bool,
    identity_ready: bool,
    existing_entry_count: usize,
    existing_entries_truncated: bool,
    state_token: String,
}

fn initialize_error(code: AppErrorCode, message: &str, remediation: &str) -> AppError {
    AppError::new(code, message).with_remediation(remediation)
}

fn new_operation_id() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let sequence = NEXT.fetch_add(1, Ordering::Relaxed) + 1;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{nanos:x}-{sequence:x}")
}

fn validate_operation_id(value: &str) -> Result<(), AppError> {
    if value.is_empty()
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
    {
        return Err(initialize_error(
            AppErrorCode::InitializeCleanupUnavailable,
            "That initialization attempt identifier is invalid.",
            "Start a new project attempt.",
        ));
    }
    Ok(())
}

fn is_reserved_windows_name(name: &str) -> bool {
    let stem = name
        .trim_end_matches(['.', ' '])
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit()
            && stem.as_bytes()[3] != b'0')
}

fn validate_project_name(name: &str) -> Result<(), AppError> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.chars().count() > MAX_PROJECT_NAME_CHARS
        || name.chars().any(char::is_control)
        || name.contains(['/', '\\', ':'])
        || name.ends_with(['.', ' '])
        || name.starts_with(".gitodile-")
        || is_reserved_windows_name(name)
    {
        return Err(initialize_error(
            AppErrorCode::InvalidProjectName,
            "That project folder name isn't safe on every supported platform.",
            "Choose a shorter name without separators, reserved names, controls, or trailing spaces and dots.",
        ));
    }
    Ok(())
}

fn canonical_folder(path: &str, purpose: &str) -> Result<PathBuf, AppError> {
    let path = Path::new(path);
    let metadata = path.metadata().map_err(|error| match error.kind() {
        ErrorKind::NotFound => initialize_error(
            AppErrorCode::PathMissing,
            &format!("The {purpose} folder doesn't exist."),
            "Choose an existing folder.",
        ),
        ErrorKind::PermissionDenied => initialize_error(
            AppErrorCode::PermissionDenied,
            &format!("The {purpose} folder can't be read."),
            "Check its permissions or choose another folder.",
        ),
        _ => initialize_error(
            AppErrorCode::PathUnusable,
            &format!("The {purpose} folder can't be used."),
            "Choose another folder.",
        ),
    })?;
    if !metadata.is_dir() {
        return Err(initialize_error(
            AppErrorCode::PathUnusable,
            &format!("The {purpose} path isn't a folder."),
            "Choose a folder instead of a file.",
        ));
    }
    path.canonicalize().map_err(|_| {
        initialize_error(
            AppErrorCode::PathUnusable,
            &format!("The {purpose} folder can't be resolved."),
            "Check its permissions or choose another folder.",
        )
    })
}

fn checked_entries(path: &Path) -> Result<Vec<fs::DirEntry>, AppError> {
    let entries = fs::read_dir(path).map_err(|error| match error.kind() {
        ErrorKind::PermissionDenied => initialize_error(
            AppErrorCode::PermissionDenied,
            "GitOdile can't inspect this folder.",
            "Check its permissions or choose another folder.",
        ),
        _ => initialize_error(
            AppErrorCode::InitializationInspectionIncomplete,
            "GitOdile couldn't finish inspecting this folder.",
            "Close programs using the folder and try again.",
        ),
    })?;
    entries
        .map(|entry| {
            entry.map_err(|_| {
                initialize_error(
                    AppErrorCode::InitializationInspectionIncomplete,
                    "GitOdile couldn't finish inspecting this folder.",
                    "Check the folder permissions and try again.",
                )
            })
        })
        .collect()
}

fn git_metadata_entry(path: &Path) -> Result<Option<fs::DirEntry>, AppError> {
    Ok(checked_entries(path)?.into_iter().find(|entry| {
        entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case(".git")
    }))
}

fn reject_existing_git_metadata(path: &Path) -> Result<(), AppError> {
    let Some(entry) = git_metadata_entry(path)? else {
        return Ok(());
    };
    let file_type = entry.file_type().map_err(|_| {
        initialize_error(
            AppErrorCode::InitializationInspectionIncomplete,
            "GitOdile couldn't inspect the existing Git metadata.",
            "Check the folder permissions and try again.",
        )
    })?;
    if file_type.is_file() || file_type.is_symlink() {
        return Err(initialize_error(
            AppErrorCode::LinkedWorktree,
            "This folder already contains linked-worktree Git metadata.",
            "Open the existing project instead. GitOdile will not replace its .git file.",
        ));
    }
    Err(initialize_error(
        AppErrorCode::ExistingGitMetadata,
        "This folder already contains Git metadata.",
        "Open the existing project instead. GitOdile will not replace its .git directory.",
    ))
}

fn reject_enclosing_repository(path: &Path) -> Result<(), AppError> {
    let display = display_path(path.to_path_buf());
    let inside = run_git(&display, &["rev-parse", "--is-inside-work-tree"])?;
    if inside.status.success() && git_stdout(&inside) == "true" {
        return Err(initialize_error(
            AppErrorCode::NestedRepository,
            "This folder is already inside another Git project.",
            "Choose a folder outside that project so Git histories don't become nested.",
        ));
    }
    let bare = run_git(&display, &["rev-parse", "--is-bare-repository"])?;
    if bare.status.success() && git_stdout(&bare) == "true" {
        return Err(initialize_error(
            AppErrorCode::NestedRepository,
            "This folder is inside a bare Git repository.",
            "Choose a folder outside that repository.",
        ));
    }
    Ok(())
}

fn reject_nested_git_metadata(root: &Path) -> Result<(), AppError> {
    let mut inspected = 0usize;
    let mut stack = vec![root.to_path_buf()];
    while let Some(folder) = stack.pop() {
        for entry in checked_entries(&folder)? {
            inspected += 1;
            if inspected > MAX_INSPECTED_ENTRIES {
                return Err(initialize_error(
                    AppErrorCode::InitializationInspectionIncomplete,
                    "This folder is too large to prove that it contains no nested Git projects.",
                    "Choose a smaller project folder or remove nested repositories before trying again.",
                ));
            }
            let file_type = entry.file_type().map_err(|_| {
                initialize_error(
                    AppErrorCode::InitializationInspectionIncomplete,
                    "GitOdile couldn't inspect every item in this folder.",
                    "Check permissions and try again.",
                )
            })?;
            if file_type.is_symlink() {
                continue;
            }
            if entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(".git")
            {
                return Err(initialize_error(
                    AppErrorCode::NestedRepository,
                    "This folder contains another Git project or linked worktree.",
                    "Choose a folder without nested Git metadata. GitOdile will not combine histories implicitly.",
                ));
            }
            if file_type.is_dir() {
                stack.push(entry.path());
            }
        }
    }
    Ok(())
}

fn check_new_destination(parent: &Path, name: &str) -> Result<PathBuf, AppError> {
    let destination = parent.join(name);
    if destination.symlink_metadata().is_ok() {
        return Err(initialize_error(
            AppErrorCode::ProjectDestinationExists,
            "A file or folder already exists at that destination.",
            "Choose another name. GitOdile will not initialize, empty, or replace an existing destination in this flow.",
        ));
    }
    let folded = name.to_lowercase();
    for entry in checked_entries(parent)? {
        if entry.file_name().to_string_lossy().to_lowercase() == folded {
            return Err(initialize_error(
                AppErrorCode::ProjectDestinationCollides,
                "That name collides with an existing path when letter case or aliases are ignored.",
                "Choose a different project name.",
            ));
        }
    }
    #[cfg(target_os = "windows")]
    if display_path(destination.clone()).encode_utf16().count() > 240 {
        return Err(initialize_error(
            AppErrorCode::PathTooLong,
            "The new project path is too long for reliable Windows Git operations.",
            "Choose a shorter parent path or project name.",
        ));
    }
    Ok(destination)
}

fn validate_initial_branch(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().any(char::is_control) {
        return Err(initialize_error(
            AppErrorCode::InvalidInitialBranch,
            "Enter a valid initial version-line name.",
            "Use a Git branch name such as main.",
        ));
    }
    let output = run_global_git_with_env(
        ["check-ref-format", "--branch", name],
        &[("GIT_TERMINAL_PROMPT", "0")],
    )?;
    if !output.status.success() {
        return Err(initialize_error(
            AppErrorCode::InvalidInitialBranch,
            "That initial version-line name isn't valid in Git.",
            "Choose a name such as main without spaces or Git reference punctuation.",
        ));
    }
    Ok(name.to_string())
}

fn identity_ready() -> Result<bool, AppError> {
    Ok(
        run_global_git_with_env(["var", "GIT_AUTHOR_IDENT"], &[("GIT_TERMINAL_PROMPT", "0")])?
            .status
            .success(),
    )
}

fn check_readme_available(path: &Path) -> Result<(), AppError> {
    if checked_entries(path)?.into_iter().any(|entry| {
        entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case("README.md")
    }) {
        return Err(initialize_error(
            AppErrorCode::ReadmeAlreadyExists,
            "This folder already contains a README file.",
            "Keep the existing file unchanged and turn off Add a README.",
        ));
    }
    Ok(())
}

fn top_level_count(path: &Path) -> Result<(usize, bool), AppError> {
    let count = checked_entries(path)?.len();
    Ok((count.min(999), count > 999))
}

#[allow(clippy::too_many_arguments)]
fn validate_initialize(
    target_kind: InitializeTargetKind,
    destination_parent: &str,
    destination_name: &str,
    existing_path: &str,
    initial_branch: &str,
    create_readme: bool,
    save_initial_version: bool,
) -> Result<ValidatedInitialize, AppError> {
    let initial_branch = validate_initial_branch(initial_branch)?;
    let (destination, entry_count, entries_truncated) = match target_kind {
        InitializeTargetKind::NewFolder => {
            validate_project_name(destination_name.trim())?;
            let parent = canonical_folder(destination_parent, "parent")?;
            reject_enclosing_repository(&parent)?;
            (
                check_new_destination(&parent, destination_name.trim())?,
                0,
                false,
            )
        }
        InitializeTargetKind::ExistingFolder => {
            let destination = canonical_folder(existing_path, "selected")?;
            reject_existing_git_metadata(&destination)?;
            reject_enclosing_repository(&destination)?;
            reject_nested_git_metadata(&destination)?;
            if create_readme {
                check_readme_available(&destination)?;
            }
            let (count, truncated) = top_level_count(&destination)?;
            (destination, count, truncated)
        }
    };
    let identity_ready = !save_initial_version || identity_ready()?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    target_kind.hash(&mut hasher);
    destination.hash(&mut hasher);
    initial_branch.hash(&mut hasher);
    create_readme.hash(&mut hasher);
    save_initial_version.hash(&mut hasher);
    let state_token = format!("{:016x}", hasher.finish());
    Ok(ValidatedInitialize {
        target_kind,
        destination,
        initial_branch,
        create_readme,
        identity_ready,
        existing_entry_count: entry_count,
        existing_entries_truncated: entries_truncated,
        state_token,
    })
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn plan_initialize_project(
    target_kind: InitializeTargetKind,
    destination_parent: String,
    destination_name: String,
    existing_path: String,
    initial_branch: String,
    create_readme: bool,
    save_initial_version: bool,
) -> Result<InitializeProjectPlan, AppError> {
    let _command = application::enter("plan_initialize_project");
    let validated = validate_initialize(
        target_kind,
        &destination_parent,
        &destination_name,
        &existing_path,
        &initial_branch,
        create_readme,
        save_initial_version,
    )?;
    Ok(InitializeProjectPlan {
        operation_kind: "local-mutation",
        requires_confirmation: true,
        operation_id: new_operation_id(),
        state_token: validated.state_token,
        target_kind,
        destination_path: display_path(validated.destination),
        initial_branch: validated.initial_branch,
        create_readme,
        save_initial_version,
        identity_ready: validated.identity_ready,
        existing_entry_count: validated.existing_entry_count,
        existing_entries_truncated: validated.existing_entries_truncated,
    })
}

fn marker_contents(operation_id: &str) -> String {
    format!("{OWNER_VERSION}\n{operation_id}\n")
}

fn create_owner_marker(path: &Path, operation_id: &str) -> Result<(), AppError> {
    let mut marker = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| {
            classify_filesystem_error(&error, "GitOdile couldn't mark the path it created.")
        })?;
    marker
        .write_all(marker_contents(operation_id).as_bytes())
        .and_then(|_| marker.sync_all())
        .map_err(|error| {
            classify_filesystem_error(
                &error,
                "GitOdile couldn't finish marking the path it created.",
            )
        })
}

fn verify_owner_marker(path: &Path, operation_id: &str) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| {
        initialize_error(
            AppErrorCode::InitializeCleanupUnavailable,
            "The initialization ownership marker is unavailable.",
            "Inspect the project manually. GitOdile will not remove an unowned path.",
        )
    })?;
    if !metadata.file_type().is_file()
        || fs::read_to_string(path).ok().as_deref() != Some(&marker_contents(operation_id))
    {
        return Err(initialize_error(
            AppErrorCode::InitializeCleanupUnavailable,
            "GitOdile can't prove that it owns this initialization artifact.",
            "Inspect it manually. GitOdile will not remove it.",
        ));
    }
    Ok(())
}

fn remove_owned_marker(path: &Path, operation_id: &str) -> Result<(), AppError> {
    if !path.exists() {
        return Ok(());
    }
    verify_owner_marker(path, operation_id)?;
    fs::remove_file(path).map_err(|error| {
        classify_filesystem_error(&error, "GitOdile couldn't remove its ownership marker.")
    })
}

fn directory_is_empty(path: &Path) -> Result<bool, AppError> {
    Ok(checked_entries(path)?.is_empty())
}

fn cleanup_owned_empty_artifacts(
    destination: &Path,
    target_kind: InitializeTargetKind,
    operation_id: &str,
) -> Result<(), AppError> {
    validate_operation_id(operation_id)?;
    let git_dir = destination.join(".git");
    let git_marker = git_dir.join(OWNER_MARKER);
    if git_dir.exists() && git_marker.exists() {
        let metadata = fs::symlink_metadata(&git_dir).map_err(|_| {
            initialize_error(
                AppErrorCode::InitializeCleanupUnavailable,
                "The created Git metadata path can't be inspected.",
                "GitOdile will not remove it.",
            )
        })?;
        if !metadata.file_type().is_dir() {
            return Err(initialize_error(
                AppErrorCode::InitializeCleanupUnavailable,
                "The created Git metadata path changed type.",
                "GitOdile will not remove it.",
            ));
        }
        remove_owned_marker(&git_marker, operation_id)?;
        if directory_is_empty(&git_dir)? {
            fs::remove_dir(&git_dir).map_err(|error| {
                classify_filesystem_error(
                    &error,
                    "GitOdile couldn't remove the empty Git metadata directory it created.",
                )
            })?;
        }
    }
    let target_marker = destination.join(OWNER_MARKER);
    if target_kind == InitializeTargetKind::NewFolder
        && destination.exists()
        && target_marker.exists()
    {
        let metadata = fs::symlink_metadata(destination).map_err(|_| {
            initialize_error(
                AppErrorCode::InitializeCleanupUnavailable,
                "The created project path can't be inspected.",
                "GitOdile will not remove it.",
            )
        })?;
        if !metadata.file_type().is_dir() {
            return Err(initialize_error(
                AppErrorCode::InitializeCleanupUnavailable,
                "The created project path changed type.",
                "GitOdile will not remove it.",
            ));
        }
        remove_owned_marker(&target_marker, operation_id)?;
        if directory_is_empty(destination)? {
            fs::remove_dir(destination).map_err(|error| {
                classify_filesystem_error(
                    &error,
                    "GitOdile couldn't remove the empty project folder it created.",
                )
            })?;
        }
    }
    Ok(())
}

fn classify_filesystem_error(error: &std::io::Error, context: &str) -> AppError {
    let lower = error.to_string().to_lowercase();
    if error.kind() == ErrorKind::PermissionDenied {
        return initialize_error(
            AppErrorCode::PermissionDenied,
            context,
            "Check the folder permissions and try again.",
        );
    }
    if lower.contains("no space") || lower.contains("disk full") {
        return initialize_error(
            AppErrorCode::DiskFull,
            "There isn't enough disk space to initialize this project.",
            "Free some space and try again. GitOdile will not remove existing files.",
        );
    }
    if lower.contains("filename too long") || lower.contains("path too long") {
        return initialize_error(
            AppErrorCode::PathTooLong,
            "A project path is too long for this operation.",
            "Choose a shorter path or enable long-path support.",
        );
    }
    initialize_error(
        AppErrorCode::InitializeFailed,
        context,
        "Check the folder and Git installation, then try again.",
    )
}

fn create_target(validated: &ValidatedInitialize, operation_id: &str) -> Result<(), AppError> {
    if validated.target_kind == InitializeTargetKind::NewFolder {
        fs::create_dir(&validated.destination).map_err(|error| match error.kind() {
            ErrorKind::AlreadyExists => initialize_error(
                AppErrorCode::ProjectDestinationExists,
                "The destination appeared after the preview.",
                "GitOdile did not replace it. Review the destination again.",
            ),
            _ => classify_filesystem_error(&error, "GitOdile couldn't create the project folder."),
        })?;
        if let Err(error) =
            create_owner_marker(&validated.destination.join(OWNER_MARKER), operation_id)
        {
            let _ = fs::remove_dir(&validated.destination);
            return Err(error);
        }
    }
    let git_dir = validated.destination.join(".git");
    fs::create_dir(&git_dir).map_err(|error| match error.kind() {
        ErrorKind::AlreadyExists => initialize_error(
            AppErrorCode::ExistingGitMetadata,
            "Git metadata appeared after the preview.",
            "Open the existing project or review this folder again. GitOdile did not replace it.",
        ),
        _ => classify_filesystem_error(
            &error,
            "GitOdile couldn't create the Git metadata directory.",
        ),
    })?;
    if let Err(error) = create_owner_marker(&git_dir.join(OWNER_MARKER), operation_id) {
        let _ = fs::remove_dir(&git_dir);
        return Err(error);
    }
    Ok(())
}

fn create_readme(path: &Path) -> Result<(), AppError> {
    check_readme_available(path)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path.join("README.md"))
        .map_err(|error| match error.kind() {
            ErrorKind::AlreadyExists => initialize_error(
                AppErrorCode::ReadmeAlreadyExists,
                "A README appeared after the preview.",
                "GitOdile did not replace it. Keep it and retry without Add a README.",
            ),
            _ => classify_filesystem_error(&error, "GitOdile couldn't create README.md."),
        })?;
    file.write_all(b"# Project\n").map_err(|error| {
        classify_filesystem_error(&error, "GitOdile couldn't finish writing README.md.")
    })
}

fn verify_initialized(path: &Path, branch: &str) -> Result<(), AppError> {
    let display = display_path(path.to_path_buf());
    let inside = run_git(&display, &["rev-parse", "--is-inside-work-tree"])?;
    if !inside.status.success() || git_stdout(&inside) != "true" {
        return Err(initialize_error(
            AppErrorCode::InitializeVerificationFailed,
            "The new Git metadata could not be verified as a usable project.",
            "Inspect the folder before trying another initialization.",
        ));
    }
    let root = run_git(&display, &["rev-parse", "--show-toplevel"])?;
    let expected = path.canonicalize().map_err(|_| {
        initialize_error(
            AppErrorCode::InitializeVerificationFailed,
            "The initialized project path can't be resolved.",
            "Check its permissions before continuing.",
        )
    })?;
    let observed = Path::new(&git_stdout(&root)).canonicalize().map_err(|_| {
        initialize_error(
            AppErrorCode::InitializeVerificationFailed,
            "Git reported a project root that can't be resolved.",
            "Inspect the folder before continuing.",
        )
    })?;
    let symbolic = run_git(&display, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let head = run_git(&display, &["rev-parse", "--verify", "HEAD"])?;
    if expected != observed
        || !symbolic.status.success()
        || git_stdout(&symbolic) != branch
        || head.status.success()
    {
        return Err(initialize_error(
            AppErrorCode::InitializeVerificationFailed,
            "The initialized project identity or unborn version line doesn't match the preview.",
            "Inspect the folder before another Git operation.",
        ));
    }
    Ok(())
}

fn cleanup_failure(
    error: AppError,
    validated: &ValidatedInitialize,
    operation_id: &str,
) -> AppError {
    match cleanup_owned_empty_artifacts(
        &validated.destination,
        validated.target_kind,
        operation_id,
    ) {
        Ok(()) => error,
        Err(cleanup_error) => initialize_error(
            AppErrorCode::InitializeCleanupRequired,
            "Initialization stopped, but an exact owned marker or empty artifact still needs cleanup.",
            "Retry cleanup from this dialog. GitOdile will not remove existing files or non-empty folders.",
        )
        .with_detail(format!(
            "Cleanup path: {}. {}",
            display_path(validated.destination.clone()),
            cleanup_error.message
        )),
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn initialize_project(
    target_kind: InitializeTargetKind,
    destination_parent: String,
    destination_name: String,
    existing_path: String,
    initial_branch: String,
    create_readme_requested: bool,
    save_initial_version: bool,
    operation_id: String,
    state_token: String,
    mut progress: impl FnMut(InitializeProgressPhase),
) -> Result<InitializeProjectResult, AppError> {
    let _command = application::enter("initialize_project");
    progress(InitializeProgressPhase::Revalidating);
    validate_operation_id(&operation_id)?;
    let validated = validate_initialize(
        target_kind,
        &destination_parent,
        &destination_name,
        &existing_path,
        &initial_branch,
        create_readme_requested,
        save_initial_version,
    )?;
    if validated.state_token != state_token {
        return Err(initialize_error(
            AppErrorCode::StaleInitializePlan,
            "The project destination or choices changed after the preview.",
            "Review the initialization plan again.",
        ));
    }

    progress(InitializeProgressPhase::PreparingFolder);
    if let Err(error) = create_target(&validated, &operation_id) {
        return Err(cleanup_failure(error, &validated, &operation_id));
    }

    let display = display_path(validated.destination.clone());
    progress(InitializeProgressPhase::InitializingGit);
    let init = run_git(&display, &["init", "--quiet"]);
    let init = match init {
        Ok(output) if output.status.success() => output,
        Ok(_) => {
            return Err(cleanup_failure(
                initialize_error(
                    AppErrorCode::InitializeFailed,
                    "Git could not initialize this project.",
                    "Inspect the folder and Git configuration, then try again.",
                ),
                &validated,
                &operation_id,
            ))
        }
        Err(error) => return Err(cleanup_failure(error, &validated, &operation_id)),
    };
    drop(init);
    let full_ref = format!("refs/heads/{}", validated.initial_branch);
    let symbolic = run_git(&display, &["symbolic-ref", "HEAD", &full_ref]);
    match symbolic {
        Ok(output) if output.status.success() => {}
        Ok(_) => {
            return Err(cleanup_failure(
                initialize_error(
                    AppErrorCode::InitializeFailed,
                    "Git initialized the folder but could not select the requested initial version line.",
                    "The project remains recoverable. Inspect its Git metadata before retrying.",
                ),
                &validated,
                &operation_id,
            ))
        }
        Err(error) => return Err(cleanup_failure(error, &validated, &operation_id)),
    }

    let mut readme_created = false;
    if validated.create_readme {
        progress(InitializeProgressPhase::CreatingReadme);
        if let Err(error) = create_readme(&validated.destination) {
            return Err(cleanup_failure(error, &validated, &operation_id));
        }
        readme_created = true;
    }

    progress(InitializeProgressPhase::Verifying);
    if let Err(error) = verify_initialized(&validated.destination, &validated.initial_branch) {
        return Err(cleanup_failure(error, &validated, &operation_id));
    }

    progress(InitializeProgressPhase::Finalizing);
    let cleanup = (|| {
        remove_owned_marker(
            &validated.destination.join(".git").join(OWNER_MARKER),
            &operation_id,
        )?;
        if validated.target_kind == InitializeTargetKind::NewFolder {
            remove_owned_marker(&validated.destination.join(OWNER_MARKER), &operation_id)?;
        }
        Ok::<(), AppError>(())
    })();
    let outcome = if cleanup.is_ok() {
        InitializeOutcome::Completed
    } else {
        InitializeOutcome::CleanupRequired
    };
    Ok(InitializeProjectResult {
        outcome,
        operation_id,
        destination_path: display,
        readme_created,
        cleanup_path: (outcome == InitializeOutcome::CleanupRequired)
            .then(|| display_path(validated.destination)),
    })
}

pub(crate) fn cleanup_initialize_project(
    destination_path: String,
    target_kind: InitializeTargetKind,
    operation_id: String,
) -> Result<(), AppError> {
    let _command = application::enter("cleanup_initialize_project");
    validate_operation_id(&operation_id)?;
    let destination = PathBuf::from(destination_path);
    cleanup_owned_empty_artifacts(&destination, target_kind, &operation_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_names_cover_unicode_and_cross_platform_rejections() {
        assert!(validate_project_name("mi proyecto 🐊").is_ok());
        for name in ["", ".", "..", "a/b", "a\\b", "CON", "name.", ".gitodile-x"] {
            assert_eq!(
                validate_project_name(name).unwrap_err().code,
                AppErrorCode::InvalidProjectName
            );
        }
    }

    #[test]
    fn ownership_markers_must_match_exactly() {
        let root =
            std::env::temp_dir().join(format!("gitodile-init-marker-{}", new_operation_id()));
        fs::create_dir(&root).unwrap();
        let marker = root.join(OWNER_MARKER);
        create_owner_marker(&marker, "a1-b2").unwrap();
        assert!(verify_owner_marker(&marker, "a1-b2").is_ok());
        assert_eq!(
            verify_owner_marker(&marker, "different").unwrap_err().code,
            AppErrorCode::InitializeCleanupUnavailable
        );
        fs::remove_file(marker).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn cleanup_never_removes_non_empty_or_mismatched_owned_paths() {
        let root =
            std::env::temp_dir().join(format!("gitodile-init-cleanup-{}", new_operation_id()));
        fs::create_dir(&root).unwrap();
        let operation_id = "a1-b2";
        create_owner_marker(&root.join(OWNER_MARKER), operation_id).unwrap();
        let git_dir = root.join(".git");
        fs::create_dir(&git_dir).unwrap();
        create_owner_marker(&git_dir.join(OWNER_MARKER), operation_id).unwrap();
        fs::write(git_dir.join("user-owned"), b"keep").unwrap();
        fs::write(root.join("user.txt"), b"keep").unwrap();

        cleanup_owned_empty_artifacts(&root, InitializeTargetKind::NewFolder, operation_id)
            .unwrap();
        assert!(root.exists());
        assert_eq!(fs::read(root.join("user.txt")).unwrap(), b"keep");
        assert_eq!(fs::read(git_dir.join("user-owned")).unwrap(), b"keep");
        assert!(!root.join(OWNER_MARKER).exists());
        assert!(!git_dir.join(OWNER_MARKER).exists());

        create_owner_marker(&root.join(OWNER_MARKER), "different").unwrap();
        let error =
            cleanup_owned_empty_artifacts(&root, InitializeTargetKind::NewFolder, operation_id)
                .unwrap_err();
        assert_eq!(error.code, AppErrorCode::InitializeCleanupUnavailable);
        assert!(root.join(OWNER_MARKER).exists());
        assert_eq!(fs::read(root.join("user.txt")).unwrap(), b"keep");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn permission_errors_are_classified_without_exposing_raw_os_details() {
        let error = classify_filesystem_error(
            &std::io::Error::from(ErrorKind::PermissionDenied),
            "Initialization could not write here.",
        );
        assert_eq!(error.code, AppErrorCode::PermissionDenied);
        assert!(error.detail.is_none());
    }
}

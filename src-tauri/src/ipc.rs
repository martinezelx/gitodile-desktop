//! Thin Tauri transport adapters.
//!
//! These functions own only framework extraction/serialization and delegate
//! immediately. Repository authorization, execution policy and workflows stay
//! behind the application boundary.

use crate::*;

#[tauri::command]
pub(crate) fn app_status() -> &'static str {
    crate::app_status()
}

#[tauri::command]
pub(crate) fn show_main_window(window: tauri::Window) {
    crate::show_main_window(window);
}

#[tauri::command(async)]
pub(crate) fn open_repository(path: String) -> Result<RepositoryInfo, AppError> {
    crate::open_repository(path)
}

#[tauri::command(async)]
pub(crate) fn read_working_tree_status(path: String) -> Result<WorkingTreeStatus, AppError> {
    crate::read_working_tree_status(path)
}

#[tauri::command(async)]
pub(crate) fn read_file_diff(path: String, file_path: String) -> Result<FileDiff, AppError> {
    crate::read_file_diff(path, file_path)
}

#[tauri::command(async)]
pub(crate) fn read_file_lines(
    path: String,
    file_path: String,
    start_line: u32,
    end_line: u32,
) -> Result<FileLines, AppError> {
    crate::read_file_lines(path, file_path, start_line, end_line)
}

#[tauri::command(async)]
pub(crate) fn read_working_tree_diffs(path: String) -> Result<Vec<FileDiff>, AppError> {
    crate::read_working_tree_diffs(path)
}

#[tauri::command(async)]
pub(crate) fn git_diagnostics() -> GitDiagnostics {
    crate::git_diagnostics()
}

#[tauri::command(async)]
pub(crate) fn install_git() -> GitInstallationResult {
    crate::install_git()
}

#[tauri::command(async)]
pub(crate) fn update_git() -> GitUpdateLaunchResult {
    crate::update_git()
}

#[tauri::command(async)]
pub(crate) fn check_git_update() -> GitUpdateStatus {
    crate::check_git_update()
}

#[tauri::command(async)]
pub(crate) fn get_git_identity() -> GitIdentity {
    crate::get_git_identity()
}

#[tauri::command(async)]
pub(crate) fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
    crate::set_git_identity(name, email)
}

#[tauri::command(async)]
pub(crate) fn plan_save_version(
    path: String,
    selected_paths: Option<Vec<String>>,
) -> Result<SaveVersionPlan, AppError> {
    crate::plan_save_version(path, selected_paths)
}

#[tauri::command(async)]
pub(crate) fn save_version(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
) -> Result<SaveVersionResult, AppError> {
    crate::save_version(path, title, description, state_token, selected_paths)
}

#[tauri::command(async)]
pub(crate) fn discover_remotes(path: String) -> Result<RemoteDiscovery, AppError> {
    crate::discover_remotes(path)
}

#[tauri::command(async)]
pub(crate) fn list_unpublished_versions(path: String) -> Result<PendingVersionsResult, AppError> {
    crate::list_unpublished_versions(path)
}

#[tauri::command(async)]
pub(crate) fn read_commit_file_changes(
    path: String,
    commit: String,
) -> Result<Vec<CommitFileChange>, AppError> {
    crate::read_commit_file_changes(path, commit)
}

#[tauri::command(async)]
pub(crate) fn read_commit_file_diff(
    path: String,
    commit: String,
    file_path: String,
) -> Result<FileDiff, AppError> {
    crate::read_commit_file_diff(path, commit, file_path)
}

#[tauri::command(async)]
pub(crate) fn plan_publish(
    path: String,
    remote: Option<String>,
    up_to: Option<String>,
) -> Result<PublishPlan, AppError> {
    crate::plan_publish(path, remote, up_to)
}

#[tauri::command(async)]
pub(crate) fn publish(
    path: String,
    remote: String,
    state_token: String,
    up_to: Option<String>,
) -> Result<PublishResult, AppError> {
    crate::publish(path, remote, state_token, up_to)
}

#[tauri::command(async)]
pub(crate) fn get_version_lines(path: String) -> Result<VersionLinesSnapshot, AppError> {
    crate::get_version_lines(path)
}

#[tauri::command(async)]
pub(crate) fn plan_create_version_line(
    path: String,
    name: String,
    switch: bool,
) -> Result<CreateVersionLinePlan, AppError> {
    crate::plan_create_version_line(path, name, switch)
}

#[tauri::command(async)]
pub(crate) fn create_version_line(
    path: String,
    name: String,
    switch: bool,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    crate::create_version_line(path, name, switch, state_token)
}

#[tauri::command(async)]
pub(crate) fn plan_switch_version_line(
    path: String,
    target: String,
) -> Result<SwitchVersionLinePlan, AppError> {
    crate::plan_switch_version_line(path, target)
}

#[tauri::command(async)]
pub(crate) fn switch_version_line(
    path: String,
    target: String,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    crate::switch_version_line(path, target, state_token)
}

#[tauri::command(async)]
pub(crate) fn plan_delete_version_line(
    path: String,
    name: String,
) -> Result<DeleteVersionLinePlan, AppError> {
    crate::plan_delete_version_line(path, name)
}

#[tauri::command(async)]
pub(crate) fn delete_version_line(
    path: String,
    name: String,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    crate::delete_version_line(path, name, state_token)
}

#[tauri::command(async)]
pub(crate) fn watch_repository(
    app: tauri::AppHandle,
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
) -> Result<bool, AppError> {
    crate::watch_repository(app, registry, path)
}

#[tauri::command(async)]
pub(crate) fn unwatch_repository(registry: tauri::State<'_, watch::WatcherRegistry>, path: String) {
    crate::unwatch_repository(registry, path);
}

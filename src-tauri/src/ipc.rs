//! Thin Tauri transport adapters.
//!
//! These functions own only framework extraction/serialization and delegate
//! immediately. Repository authorization, execution policy and workflows stay
//! behind the application boundary.

use crate::{
    app_updates::{
        AppUpdateService, InstallUpdateRequest, ReleaseChannel, StartupUpdateConfirmation,
        UpdateAction, UpdateChannelSetting, UpdateCheckSource, UpdateState,
    },
    application,
    changes::{self, CommitFileChange, FileDiff, FileLines, ImagePreview, WorkingTreeDiffBatch},
    clone::{self, CloneOperationRegistry, ClonePlan, CloneProgressPhase, CloneResult},
    desktop,
    diagnostics::{self, DiagnosticsLog},
    error::AppError,
    history::{self, HistoryPage, SavedVersionDetail},
    initialize::{
        self, InitializeProgressPhase, InitializeProjectPlan, InitializeProjectResult,
        InitializeTargetKind,
    },
    project_settings::{self, IgnoreFile, ProjectIdentity},
    publish_domain::{self, PublishPlan, PublishResult},
    recovery::{self, DiscardPlan, DiscardRecovery, DiscardRecoveryRecord, DiscardResult},
    repository::{self, RepositoryInfo},
    save_version::{self, SaveVersionPlan, SaveVersionResult},
    session,
    status::{self, PendingVersionsResult, WorkingTreeStatus},
    sync::{
        self, ConnectRemotePlan, ConnectRemoteResult, GetTeamChangesPhase, GetTeamChangesPlan,
        GetTeamChangesResult, ProjectRemotes, RemoteDiscovery, TeamSyncStatus,
    },
    tooling::{
        self, GitDefaultBranch, GitDiagnostics, GitIdentity, GitInstallationResult, GitLineEndings,
        GitUpdateLaunchResult, GitUpdateStatus,
    },
    version_lines::{
        self, CreateVersionLinePlan, DeleteVersionLinePlan, DeleteVersionLineResult,
        RenameVersionLinePlan, SwitchVersionLinePlan, VersionLineHistory, VersionLinesSnapshot,
    },
    watch,
};

#[tauri::command]
pub(crate) fn get_app_update_state(service: tauri::State<'_, AppUpdateService>) -> UpdateState {
    report_value("get_app_update_state", service.snapshot())
}

#[tauri::command]
pub(crate) fn get_startup_update_confirmation(
    service: tauri::State<'_, AppUpdateService>,
) -> StartupUpdateConfirmation {
    report_value(
        "get_startup_update_confirmation",
        service.startup_confirmation(),
    )
}

#[tauri::command]
pub(crate) fn check_app_update(
    app: tauri::AppHandle,
    service: tauri::State<'_, AppUpdateService>,
    source: UpdateCheckSource,
) -> UpdateAction {
    report_value("check_app_update", service.start_check(app, source))
}

#[tauri::command]
pub(crate) fn download_app_update(
    service: tauri::State<'_, AppUpdateService>,
    candidate_id: String,
) -> UpdateAction {
    report_value("download_app_update", service.start_download(&candidate_id))
}

#[tauri::command]
pub(crate) fn cancel_app_update(
    service: tauri::State<'_, AppUpdateService>,
    operation_id: String,
) -> UpdateState {
    report_value("cancel_app_update", service.cancel(&operation_id))
}

#[tauri::command(async)]
pub(crate) fn install_app_update(
    app: tauri::AppHandle,
    service: tauri::State<'_, AppUpdateService>,
    watchers: tauri::State<'_, watch::WatcherRegistry>,
    request: InstallUpdateRequest,
) -> UpdateState {
    report_value(
        "install_app_update",
        service.install(&app, &watchers, request),
    )
}

#[tauri::command]
pub(crate) fn get_app_update_channel(
    service: tauri::State<'_, AppUpdateService>,
) -> UpdateChannelSetting {
    report_value("get_app_update_channel", service.channel_setting())
}

/// The renderer chooses between the two compiled feeds by closed enum; it
/// still cannot name a feed, URL, key or target.
#[tauri::command]
pub(crate) fn set_app_update_channel(
    service: tauri::State<'_, AppUpdateService>,
    channel: ReleaseChannel,
) -> Result<UpdateChannelSetting, AppError> {
    report_result("set_app_update_channel", service.set_channel(channel))
}

fn report_result<T>(operation: &'static str, result: Result<T, AppError>) -> Result<T, AppError> {
    diagnostics::record_command(
        application::policy(operation).class,
        operation,
        result.as_ref().err(),
    );
    result
}

fn report_value<T>(operation: &'static str, value: T) -> T {
    diagnostics::record_command(application::policy(operation).class, operation, None);
    value
}

/// Every repository-scoped command that acts on an already-open project proves
/// its incarnation here. Reads and mutations share one rule; there is no
/// weaker read path and no missing-epoch allowance.
fn validate_session(path: &str, session_epoch: &str) -> Result<(), AppError> {
    session::global().validate(path, session_epoch)
}

#[tauri::command]
pub(crate) fn app_status() -> &'static str {
    report_value("app_status", desktop::app_status())
}

#[tauri::command]
pub(crate) fn show_main_window(window: tauri::Window) {
    desktop::show_main_window(window);
    report_value("show_main_window", ());
}

#[tauri::command(async)]
pub(crate) fn reveal_project_file(
    path: String,
    file_path: String,
    session_epoch: String,
) -> Result<(), AppError> {
    report_result(
        "reveal_project_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            desktop::reveal_project_file(path, file_path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn open_repository(
    path: String,
    session_epoch: Option<String>,
) -> Result<RepositoryInfo, AppError> {
    report_result(
        "open_repository",
        repository::open_repository(path, session_epoch),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_clone(
    source: String,
    destination_parent: String,
    destination_name: String,
) -> Result<ClonePlan, AppError> {
    report_result(
        "plan_clone",
        clone::plan_clone(source, destination_parent, destination_name),
    )
}

#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn clone_repository(
    registry: tauri::State<'_, CloneOperationRegistry>,
    source: String,
    destination_parent: String,
    destination_name: String,
    operation_id: String,
    state_token: String,
    on_progress: tauri::ipc::Channel<CloneProgressPhase>,
) -> Result<CloneResult, AppError> {
    report_result(
        "clone_repository",
        clone::clone_repository(
            &registry,
            source,
            destination_parent,
            destination_name,
            operation_id,
            state_token,
            |phase| {
                let _ = on_progress.send(phase);
            },
        ),
    )
}

#[tauri::command]
pub(crate) fn cancel_clone(
    registry: tauri::State<'_, CloneOperationRegistry>,
    operation_id: String,
) -> Result<(), AppError> {
    report_result("cancel_clone", clone::cancel_clone(&registry, operation_id))
}

#[tauri::command]
pub(crate) fn cleanup_clone(
    destination_parent: String,
    operation_id: String,
) -> Result<(), AppError> {
    report_result(
        "cleanup_clone",
        clone::cleanup_clone(destination_parent, operation_id),
    )
}

#[tauri::command(async)]
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
    report_result(
        "plan_initialize_project",
        initialize::plan_initialize_project(
            target_kind,
            destination_parent,
            destination_name,
            existing_path,
            initial_branch,
            create_readme,
            save_initial_version,
        ),
    )
}

#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn initialize_project(
    target_kind: InitializeTargetKind,
    destination_parent: String,
    destination_name: String,
    existing_path: String,
    initial_branch: String,
    create_readme: bool,
    save_initial_version: bool,
    operation_id: String,
    state_token: String,
    on_progress: tauri::ipc::Channel<InitializeProgressPhase>,
) -> Result<InitializeProjectResult, AppError> {
    report_result(
        "initialize_project",
        initialize::initialize_project(
            target_kind,
            destination_parent,
            destination_name,
            existing_path,
            initial_branch,
            create_readme,
            save_initial_version,
            operation_id,
            state_token,
            |phase| {
                let _ = on_progress.send(phase);
            },
        ),
    )
}

#[tauri::command]
pub(crate) fn cleanup_initialize_project(
    destination_path: String,
    target_kind: InitializeTargetKind,
    operation_id: String,
) -> Result<(), AppError> {
    report_result(
        "cleanup_initialize_project",
        initialize::cleanup_initialize_project(destination_path, target_kind, operation_id),
    )
}

#[tauri::command(async)]
pub(crate) fn read_working_tree_status(
    path: String,
    session_epoch: String,
) -> Result<WorkingTreeStatus, AppError> {
    report_result(
        "read_working_tree_status",
        (|| {
            validate_session(&path, &session_epoch)?;
            status::read_working_tree_status(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_file_diff(
    path: String,
    file_path: String,
    session_epoch: String,
) -> Result<FileDiff, AppError> {
    report_result(
        "read_file_diff",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_file_diff(path, file_path)
        })(),
    )
}

/// `commit` chooses which pair of versions to read: absent means the working
/// tree against `HEAD`, present means that saved version against its parent.
/// One command rather than two because the surfaces asking differ only in
/// that, and a second command would be the same body with a different name.
#[tauri::command(async)]
pub(crate) fn read_file_image_preview(
    path: String,
    file_path: String,
    original_path: Option<String>,
    commit: Option<String>,
    session_epoch: String,
) -> Result<ImagePreview, AppError> {
    report_result(
        "read_file_image_preview",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_file_image_preview(path, file_path, original_path, commit)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_file_lines(
    path: String,
    file_path: String,
    start_line: u32,
    end_line: u32,
    session_epoch: String,
) -> Result<FileLines, AppError> {
    report_result(
        "read_file_lines",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_file_lines(path, file_path, start_line, end_line)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_working_tree_diffs(
    path: String,
    session_epoch: String,
) -> Result<WorkingTreeDiffBatch, AppError> {
    report_result(
        "read_working_tree_diffs",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_working_tree_diffs(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_discard_changes(
    path: String,
    selected_path: Option<String>,
    session_epoch: String,
) -> Result<DiscardPlan, AppError> {
    report_result(
        "plan_discard_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::plan_discard_changes(path, selected_path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn discard_changes(
    path: String,
    selected_path: Option<String>,
    state_token: String,
    session_epoch: String,
) -> Result<DiscardResult, AppError> {
    report_result(
        "discard_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::discard_changes(path, selected_path, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn get_discard_recovery(
    path: String,
    session_epoch: String,
) -> Result<DiscardRecovery, AppError> {
    report_result(
        "get_discard_recovery",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::get_discard_recovery(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn list_discard_recoveries(
    path: String,
    session_epoch: String,
) -> Result<Vec<DiscardRecoveryRecord>, AppError> {
    report_result(
        "list_discard_recoveries",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::list_discard_recoveries(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn delete_discard_recovery(
    path: String,
    recovery_id: String,
    session_epoch: String,
) -> Result<(), AppError> {
    report_result(
        "delete_discard_recovery",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::delete_discard_recovery(path, recovery_id)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn restore_discarded_changes(
    path: String,
    recovery_id: String,
    state_token: String,
    session_epoch: String,
) -> Result<(), AppError> {
    report_result(
        "restore_discarded_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::restore_discarded_changes(path, recovery_id, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn git_diagnostics() -> GitDiagnostics {
    report_value("git_diagnostics", tooling::git_diagnostics())
}

#[tauri::command(async)]
pub(crate) fn install_git() -> GitInstallationResult {
    report_value("install_git", tooling::install_git())
}

#[tauri::command(async)]
pub(crate) fn update_git() -> GitUpdateLaunchResult {
    report_value("update_git", tooling::update_git())
}

#[tauri::command(async)]
pub(crate) fn check_git_update() -> GitUpdateStatus {
    report_value("check_git_update", tooling::check_git_update())
}

#[tauri::command(async)]
pub(crate) fn get_git_identity() -> GitIdentity {
    report_value("get_git_identity", tooling::get_git_identity())
}

#[tauri::command]
pub(crate) fn render_diagnostic_report(
    log: tauri::State<'_, DiagnosticsLog>,
    environment: String,
) -> String {
    report_value(
        "render_diagnostic_report",
        diagnostics::render_report(&log, environment),
    )
}

#[tauri::command(async)]
pub(crate) fn save_diagnostic_report(path: String, report: String) -> Result<(), AppError> {
    let _command = application::enter("save_diagnostic_report");
    report_result(
        "save_diagnostic_report",
        diagnostics::save_report(path, report),
    )
}

#[tauri::command(async)]
pub(crate) fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
    report_result("set_git_identity", tooling::set_git_identity(name, email))
}

/// The one Settings read that can be repository-scoped: a project can override
/// the global line-ending setting, so the open one is validated like any other
/// repository call and simply absent when no project is open.
#[tauri::command(async)]
pub(crate) fn get_line_endings(
    path: Option<String>,
    session_epoch: Option<String>,
) -> Result<GitLineEndings, AppError> {
    report_result(
        "get_line_endings",
        (|| {
            if let Some(path) = path.as_deref() {
                // Semantic optionality, not compatibility: without a project there is
                // no session to prove. With one, the epoch is required exactly like
                // any other repository read.
                let epoch = session_epoch
                    .as_deref()
                    .ok_or_else(session::stale_session_error)?;
                validate_session(path, epoch)?;
            }
            Ok(tooling::get_line_endings(path))
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn set_line_endings(mode: String) -> Result<(), AppError> {
    report_result("set_line_endings", tooling::set_line_endings(mode))
}

/// The name Git will give the first version line of the next project it
/// creates. Global like the identity, and absent when Git's own default
/// applies.
#[tauri::command(async)]
pub(crate) fn get_default_branch() -> GitDefaultBranch {
    report_value("get_default_branch", tooling::get_default_branch())
}

#[tauri::command(async)]
pub(crate) fn set_default_branch(name: String) -> Result<(), AppError> {
    report_result("set_default_branch", tooling::set_default_branch(name))
}

#[tauri::command(async)]
pub(crate) fn plan_save_version(
    path: String,
    selected_paths: Option<Vec<String>>,
    session_epoch: String,
) -> Result<SaveVersionPlan, AppError> {
    report_result(
        "plan_save_version",
        (|| {
            validate_session(&path, &session_epoch)?;
            save_version::plan_save_version(path, selected_paths)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn save_version(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
    run_hooks: bool,
    session_epoch: String,
) -> Result<SaveVersionResult, AppError> {
    report_result(
        "save_version",
        (|| {
            validate_session(&path, &session_epoch)?;
            save_version::save_version(
                path,
                title,
                description,
                state_token,
                selected_paths,
                run_hooks,
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn discover_remotes(
    path: String,
    session_epoch: String,
) -> Result<RemoteDiscovery, AppError> {
    report_result(
        "discover_remotes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::discover_remotes(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_connect_remote(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
) -> Result<ConnectRemotePlan, AppError> {
    report_result(
        "plan_connect_remote",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::plan_connect_remote(path, session_epoch, remote_name, remote_url)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn connect_remote(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
    state_token: String,
) -> Result<ConnectRemoteResult, AppError> {
    report_result(
        "connect_remote",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::connect_remote(path, session_epoch, remote_name, remote_url, state_token)
        })(),
    )
}

/// The project's own settings read the remotes with their editable detail,
/// which `discover_remotes` deliberately does not carry: Publish only needs a
/// name and a safe label.
#[tauri::command(async)]
pub(crate) fn read_project_remotes(
    path: String,
    session_epoch: String,
) -> Result<ProjectRemotes, AppError> {
    report_result(
        "read_project_remotes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::read_project_remotes(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn set_remote_url(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
) -> Result<ProjectRemotes, AppError> {
    report_result(
        "set_remote_url",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::set_remote_url(path, remote_name, remote_url)
        })(),
    )
}

/// The identity *this project* saves as, alongside the one it would inherit.
/// Global identity stays with `get_git_identity`; these three never touch it.
#[tauri::command(async)]
pub(crate) fn read_project_identity(
    path: String,
    session_epoch: String,
) -> Result<ProjectIdentity, AppError> {
    report_result(
        "read_project_identity",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::read_project_identity(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn set_project_identity(
    path: String,
    session_epoch: String,
    name: String,
    email: String,
) -> Result<ProjectIdentity, AppError> {
    report_result(
        "set_project_identity",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::set_project_identity(path, name, email)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn clear_project_identity(
    path: String,
    session_epoch: String,
) -> Result<ProjectIdentity, AppError> {
    report_result(
        "clear_project_identity",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::clear_project_identity(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_ignore_file(
    path: String,
    session_epoch: String,
    scope: String,
) -> Result<IgnoreFile, AppError> {
    report_result(
        "read_ignore_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::read_ignore_file(path, scope)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn write_ignore_file(
    path: String,
    session_epoch: String,
    scope: String,
    contents: String,
    state_token: String,
) -> Result<IgnoreFile, AppError> {
    report_result(
        "write_ignore_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::write_ignore_file(path, scope, contents, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_team_sync_status(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    report_result(
        "read_team_sync_status",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::read_team_sync_status(path, session_epoch)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn check_team_changes(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    report_result(
        "check_team_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::check_team_changes(path, session_epoch)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_get_team_changes(
    path: String,
    session_epoch: String,
    on_progress: tauri::ipc::Channel<GetTeamChangesPhase>,
) -> Result<GetTeamChangesPlan, AppError> {
    report_result(
        "plan_get_team_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::plan_get_team_changes(path, session_epoch, |phase| {
                let _ = on_progress.send(phase);
            })
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn get_team_changes(
    path: String,
    session_epoch: String,
    state_token: String,
    recovery_reference: String,
    on_progress: tauri::ipc::Channel<GetTeamChangesPhase>,
) -> Result<GetTeamChangesResult, AppError> {
    report_result(
        "get_team_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::get_team_changes(
                path,
                session_epoch,
                state_token,
                recovery_reference,
                |phase| {
                    let _ = on_progress.send(phase);
                },
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn list_unpublished_versions(
    path: String,
    session_epoch: String,
) -> Result<PendingVersionsResult, AppError> {
    report_result(
        "list_unpublished_versions",
        (|| {
            validate_session(&path, &session_epoch)?;
            status::list_unpublished_versions(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_commit_file_changes(
    path: String,
    commit: String,
    session_epoch: String,
) -> Result<Vec<CommitFileChange>, AppError> {
    report_result(
        "read_commit_file_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_commit_file_changes(path, commit)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_commit_file_diff(
    path: String,
    commit: String,
    file_path: String,
    session_epoch: String,
) -> Result<FileDiff, AppError> {
    report_result(
        "read_commit_file_diff",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_commit_file_diff(path, commit, file_path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_history_page(
    cache: tauri::State<'_, history::HistoryReadCache>,
    path: String,
    cursor: Option<String>,
    page_size: Option<usize>,
    filters: Option<history::HistoryFilters>,
    scope: Option<history::HistoryScope>,
    session_epoch: String,
) -> Result<HistoryPage, AppError> {
    report_result(
        "read_history_page",
        (|| {
            validate_session(&path, &session_epoch)?;
            history::read_history_page_cached(&cache, path, cursor, page_size, filters, scope)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_saved_version_detail(
    cache: tauri::State<'_, history::HistoryReadCache>,
    path: String,
    snapshot_token: String,
    commit: String,
    session_epoch: String,
) -> Result<SavedVersionDetail, AppError> {
    report_result(
        "read_saved_version_detail",
        (|| {
            validate_session(&path, &session_epoch)?;
            history::read_saved_version_detail_cached(&cache, path, snapshot_token, commit)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_saved_version_file_diff(
    cache: tauri::State<'_, history::HistoryReadCache>,
    path: String,
    snapshot_token: String,
    commit: String,
    file_path: String,
    session_epoch: String,
) -> Result<FileDiff, AppError> {
    report_result(
        "read_saved_version_file_diff",
        (|| {
            validate_session(&path, &session_epoch)?;
            history::read_saved_version_file_diff_cached(
                &cache,
                path,
                snapshot_token,
                commit,
                file_path,
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_publish(
    path: String,
    remote: Option<String>,
    up_to: Option<String>,
    session_epoch: String,
) -> Result<PublishPlan, AppError> {
    report_result(
        "plan_publish",
        (|| {
            validate_session(&path, &session_epoch)?;
            publish_domain::plan_publish(path, remote, up_to)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn publish(
    path: String,
    remote: String,
    state_token: String,
    up_to: Option<String>,
    run_hooks: bool,
    session_epoch: String,
) -> Result<PublishResult, AppError> {
    report_result(
        "publish",
        (|| {
            validate_session(&path, &session_epoch)?;
            publish_domain::publish(path, remote, state_token, up_to, run_hooks)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn get_version_lines(
    path: String,
    session_epoch: String,
) -> Result<VersionLinesSnapshot, AppError> {
    report_result(
        "get_version_lines",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::get_version_lines(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn get_version_line_history(
    path: String,
    name: String,
    session_epoch: String,
) -> Result<VersionLineHistory, AppError> {
    report_result(
        "get_version_line_history",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::get_version_line_history(path, name)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_create_version_line(
    path: String,
    name: String,
    switch: bool,
    start_commit: Option<String>,
    session_epoch: String,
) -> Result<CreateVersionLinePlan, AppError> {
    report_result(
        "plan_create_version_line",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::plan_create_version_line(path, name, switch, start_commit)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn create_version_line(
    path: String,
    name: String,
    switch: bool,
    start_commit: Option<String>,
    state_token: String,
    session_epoch: String,
) -> Result<VersionLinesSnapshot, AppError> {
    report_result(
        "create_version_line",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::create_version_line(path, name, switch, start_commit, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_switch_version_line(
    path: String,
    target: String,
    session_epoch: String,
) -> Result<SwitchVersionLinePlan, AppError> {
    report_result(
        "plan_switch_version_line",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::plan_switch_version_line(path, target)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn switch_version_line(
    path: String,
    target: String,
    state_token: String,
    session_epoch: String,
) -> Result<VersionLinesSnapshot, AppError> {
    report_result(
        "switch_version_line",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::switch_version_line(path, target, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_delete_version_line(
    path: String,
    name: String,
    session_epoch: String,
) -> Result<DeleteVersionLinePlan, AppError> {
    report_result(
        "plan_delete_version_line",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::plan_delete_version_line(path, name)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn delete_version_line(
    path: String,
    name: String,
    delete_remote: bool,
    state_token: String,
    session_epoch: String,
) -> Result<DeleteVersionLineResult, AppError> {
    report_result(
        "delete_version_line",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::delete_version_line(path, name, delete_remote, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_rename_version_line(
    path: String,
    name: String,
    new_name: String,
    session_epoch: String,
) -> Result<RenameVersionLinePlan, AppError> {
    report_result(
        "plan_rename_version_line",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::plan_rename_version_line(path, name, new_name)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn rename_version_line(
    path: String,
    name: String,
    new_name: String,
    state_token: String,
    session_epoch: String,
) -> Result<VersionLinesSnapshot, AppError> {
    report_result(
        "rename_version_line",
        (|| {
            validate_session(&path, &session_epoch)?;
            version_lines::rename_version_line(path, name, new_name, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn watch_repository(
    app: tauri::AppHandle,
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: String,
) -> Result<bool, AppError> {
    report_result(
        "watch_repository",
        (|| {
            validate_session(&path, &session_epoch)?;
            watch::watch_repository(app, registry, path, session_epoch)
        })(),
    )
}

#[tauri::command(async)]
/// Detaching is deliberately not validated — a renderer that has already lost
/// its session must still be able to release the watcher it registered — but it
/// is scoped to the exact epoch, so a late request from an older incarnation
/// cannot detach the watcher a newer one owns.
pub(crate) fn unwatch_repository(
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: String,
) {
    watch::unwatch_repository(registry, path, session_epoch);
    report_value("unwatch_repository", ());
}

#[tauri::command(async)]
pub(crate) fn close_project_session(
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: String,
) -> Result<(), AppError> {
    let _command = application::enter("close_project_session");
    registry.unwatch(&path, &session_epoch);
    report_result(
        "close_project_session",
        session::global().close(&path, &session_epoch),
    )
}

#[cfg(test)]
mod session_boundary_tests {
    use super::*;
    use crate::error::AppErrorCode;
    use crate::test_support::{git_init, unique_temp_dir};

    #[test]
    fn line_endings_stay_global_without_a_project_and_are_epoch_checked_with_one() {
        let path = unique_temp_dir("ipc-line-endings-epoch");
        git_init(&path);

        // No project path: a genuinely global read, with no session to prove.
        assert!(get_line_endings(None, None).is_ok());

        // With one, the epoch is required. Missing is not a compatibility
        // case any more; it is a request that cannot name its session.
        assert_eq!(
            get_line_endings(Some(path.clone()), None).unwrap_err().code,
            AppErrorCode::StaleSession
        );
        assert_eq!(
            get_line_endings(Some(path.clone()), Some("not-an-epoch".into()))
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );

        let epoch = session::global().open(&path, None).unwrap();
        assert!(get_line_endings(Some(path.clone()), Some(epoch.clone())).is_ok());
        session::global().close(&path, &epoch).unwrap();
        assert_eq!(
            get_line_endings(Some(path.clone()), Some(epoch))
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );

        let _ = std::fs::remove_dir_all(&path);
    }

    #[test]
    fn a_repository_read_needs_the_current_epoch() {
        let path = unique_temp_dir("ipc-read-epoch");
        git_init(&path);
        let epoch = session::global().open(&path, None).unwrap();

        assert!(read_working_tree_status(path.clone(), epoch.clone()).is_ok());
        assert_eq!(
            read_working_tree_status(path.clone(), "not-an-epoch".into())
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );

        session::global().close(&path, &epoch).unwrap();
        assert_eq!(
            read_working_tree_diffs(path.clone(), epoch)
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );

        let _ = std::fs::remove_dir_all(&path);
    }
}

#[cfg(test)]
mod contract_tests {
    use super::*;
    use crate::{
        application,
        error::AppErrorCode,
        repository::{HeadState, RepositoryKind},
    };
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Contract {
        commands: Vec<CommandContract>,
        error_codes: Vec<String>,
        session_epoch: SessionEpochContract,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SessionEpochContract {
        required_for_open_repository_commands: bool,
        semantic_exceptions: Vec<SemanticException>,
    }

    #[derive(Deserialize)]
    struct SemanticException {
        command: String,
        reason: String,
    }

    #[derive(Deserialize)]
    struct CommandContract {
        name: String,
        arguments: Vec<String>,
        response: String,
    }

    fn snake_case(value: &str) -> String {
        value
            .trim_end_matches('?')
            .chars()
            .flat_map(|character| {
                if character.is_ascii_uppercase() {
                    vec!['_', character.to_ascii_lowercase()]
                } else {
                    vec![character]
                }
            })
            .collect()
    }

    fn response_name(signature: &str) -> String {
        let Some((_, response)) = signature.split_once("->") else {
            return "void".to_string();
        };
        let mut response = response
            .split('{')
            .next()
            .unwrap_or(response)
            .split_whitespace()
            .collect::<String>();
        if response.starts_with("Result<") && response.ends_with(",AppError>") {
            response = response[7..response.len() - 10].to_string();
        }
        match response.as_str() {
            "()" => "void".to_string(),
            "bool" => "boolean".to_string(),
            "String" => "string".to_string(),
            "&'staticstr" => "string".to_string(),
            value if value.starts_with("Vec<") && value.ends_with('>') => {
                format!("{}[]", &value[4..value.len() - 1])
            }
            value => value.to_string(),
        }
    }

    #[test]
    fn checked_contract_matches_registered_adapters_arguments_and_errors() {
        let contract: Contract = serde_json::from_str(include_str!(
            "../../docs/architecture/025-ipc-contract.json"
        ))
        .unwrap();
        let registered = application::EXECUTION_INVENTORY
            .iter()
            .map(|policy| policy.command)
            .collect::<Vec<_>>();
        assert_eq!(
            contract
                .commands
                .iter()
                .map(|command| command.name.as_str())
                .collect::<Vec<_>>(),
            registered
        );

        assert!(contract.session_epoch.required_for_open_repository_commands);
        for exception in &contract.session_epoch.semantic_exceptions {
            assert!(
                !exception.reason.trim().is_empty(),
                "{} needs a documented reason for its optional epoch",
                exception.command
            );
        }

        let source = include_str!("ipc.rs");
        for command in &contract.commands {
            let marker = format!("fn {}(", command.name);
            let start = source
                .find(&marker)
                .unwrap_or_else(|| panic!("missing adapter {}", command.name));
            let tail = &source[start..];
            let end = tail.find('{').unwrap_or(tail.len());
            let signature = &tail[..end];
            let compact_signature = signature.split_whitespace().collect::<String>();
            for argument in &command.arguments {
                let rust_name = snake_case(argument);
                assert!(
                    signature.contains(&rust_name),
                    "{} missing argument {argument}",
                    command.name
                );
                if argument.trim_end_matches('?') == "sessionEpoch" {
                    let is_optional = compact_signature.contains("session_epoch:Option<String>");
                    assert_eq!(
                        is_optional,
                        argument.ends_with('?'),
                        "{} sessionEpoch optionality must match the checked contract",
                        command.name,
                    );
                    // Optionality is a semantic property now, never
                    // compatibility scaffolding: an optional epoch has to be
                    // documented, with its reason, in the contract.
                    let documented = contract
                        .session_epoch
                        .semantic_exceptions
                        .iter()
                        .any(|exception| exception.command == command.name);
                    assert_eq!(
                        is_optional, documented,
                        "{} must be listed under sessionEpoch.semanticExceptions exactly when its epoch is optional",
                        command.name,
                    );
                }
            }
            assert_eq!(
                response_name(signature),
                command.response,
                "{} response",
                command.name
            );
        }

        let codes = [
            AppErrorCode::StaleSession,
            AppErrorCode::PathMissing,
            AppErrorCode::PathUnusable,
            AppErrorCode::NotRepository,
            AppErrorCode::BareRepository,
            AppErrorCode::InvalidCloneSource,
            AppErrorCode::InvalidCloneDestination,
            AppErrorCode::CloneDestinationExists,
            AppErrorCode::CloneDestinationCollides,
            AppErrorCode::StaleClonePlan,
            AppErrorCode::CloneOperationBusy,
            AppErrorCode::CloneOperationMissing,
            AppErrorCode::CloneVerificationFailed,
            AppErrorCode::ClonePublishUncertain,
            AppErrorCode::CloneCleanupRequired,
            AppErrorCode::CloneCleanupUnavailable,
            AppErrorCode::CloneFailed,
            AppErrorCode::Offline,
            AppErrorCode::InvalidProjectName,
            AppErrorCode::ProjectDestinationExists,
            AppErrorCode::ProjectDestinationCollides,
            AppErrorCode::ExistingGitMetadata,
            AppErrorCode::LinkedWorktree,
            AppErrorCode::NestedRepository,
            AppErrorCode::InitializationInspectionIncomplete,
            AppErrorCode::InvalidInitialBranch,
            AppErrorCode::ReadmeAlreadyExists,
            AppErrorCode::StaleInitializePlan,
            AppErrorCode::InitializeFailed,
            AppErrorCode::InitializeVerificationFailed,
            AppErrorCode::InitializeCleanupRequired,
            AppErrorCode::InitializeCleanupUnavailable,
            AppErrorCode::CertificateFailed,
            AppErrorCode::HostKeyFailed,
            AppErrorCode::RemoteNotFound,
            AppErrorCode::DiskFull,
            AppErrorCode::PermissionDenied,
            AppErrorCode::PathTooLong,
            AppErrorCode::GitMissing,
            AppErrorCode::GitUnusable,
            AppErrorCode::GitCommandFailed,
            AppErrorCode::InvalidIdentity,
            AppErrorCode::GitConfigWriteFailed,
            AppErrorCode::PathInvalid,
            AppErrorCode::PathNotChanged,
            AppErrorCode::PathEncodingUnsupported,
            AppErrorCode::NothingToSave,
            AppErrorCode::UnresolvedConflicts,
            AppErrorCode::DetachedHead,
            AppErrorCode::GitOperationInProgress,
            AppErrorCode::MissingIdentity,
            AppErrorCode::EmptyTitle,
            AppErrorCode::InvalidTitle,
            AppErrorCode::StalePreview,
            AppErrorCode::StaleHistoryCursor,
            AppErrorCode::HookRejected,
            AppErrorCode::SigningFailed,
            AppErrorCode::IndexUnavailable,
            AppErrorCode::IndexRestoreFailed,
            AppErrorCode::InvalidSelection,
            AppErrorCode::NoRemoteConfigured,
            AppErrorCode::RemoteSelectionRequired,
            AppErrorCode::UnbornBranchNoVersion,
            AppErrorCode::NothingToPublish,
            AppErrorCode::NothingToGet,
            AppErrorCode::BehindRemote,
            AppErrorCode::DivergedHistories,
            AppErrorCode::StalePublishPlan,
            AppErrorCode::StaleGetTeamChangesPlan,
            AppErrorCode::InvalidRefName,
            AppErrorCode::AuthenticationFailed,
            AppErrorCode::NetworkTimeout,
            AppErrorCode::OperationCancelled,
            AppErrorCode::InvalidRemoteConfiguration,
            AppErrorCode::RemoteRefMissing,
            AppErrorCode::RemoteRejected,
            AppErrorCode::InvalidRemoteUrl,
            AppErrorCode::RemoteNameExists,
            AppErrorCode::StaleConnectRemotePlan,
            AppErrorCode::RemoteConnectFailed,
            AppErrorCode::RemoteConnectUncertain,
            AppErrorCode::PublishUncertain,
            AppErrorCode::GetTeamChangesUncertain,
            AppErrorCode::GitVersionTooOld,
            AppErrorCode::VersionLineNameTaken,
            AppErrorCode::VersionLineNameCollides,
            AppErrorCode::VersionLineCheckedOutElsewhere,
            AppErrorCode::VersionLineIsActive,
            AppErrorCode::VersionLineIsDefault,
            AppErrorCode::VersionLineMissing,
            AppErrorCode::VersionLineUniqueWork,
            AppErrorCode::VersionLineSwitchObstructed,
            AppErrorCode::StaleVersionLinePlan,
            AppErrorCode::DirtyWorkingTree,
            AppErrorCode::IncomingTrackedChangeCollision,
            AppErrorCode::IncomingPathCollision,
            AppErrorCode::RefLocked,
            AppErrorCode::NothingToDiscard,
            AppErrorCode::StaleDiscardPlan,
            AppErrorCode::RecoveryUnavailable,
            AppErrorCode::RecoveryConflict,
            AppErrorCode::RecoveryFailed,
            AppErrorCode::IgnoreFileTooLarge,
            AppErrorCode::IgnoreFileNotText,
            AppErrorCode::StaleIgnoreFile,
            AppErrorCode::IgnoreFileWriteFailed,
            AppErrorCode::InstallBlocked,
            AppErrorCode::UpdateOperationBusy,
        ];
        let serialized = codes
            .iter()
            .map(|code| {
                serde_json::to_value(code)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string()
            })
            .collect::<Vec<_>>();
        assert_eq!(contract.error_codes, serialized);
    }

    #[test]
    fn representative_response_error_and_event_serialization_are_stable() {
        let repository = RepositoryInfo {
            name: "project".into(),
            path: "/repo".into(),
            selected_path: "/repo".into(),
            git_dir: "/repo/.git".into(),
            common_git_dir: "/repo/.git".into(),
            branch: Some("main".into()),
            head_state: HeadState::Branch,
            kind: RepositoryKind::Repository,
            session_epoch: "epoch-1".into(),
        };
        assert_eq!(
            serde_json::to_value(repository).unwrap(),
            serde_json::json!({
                "name":"project", "path":"/repo", "selectedPath":"/repo", "gitDir":"/repo/.git",
                "commonGitDir":"/repo/.git", "branch":"main", "headState":"branch",
                "kind":"repository", "sessionEpoch":"epoch-1"
            })
        );
        // The one shape whose field names the frontend reads out of a tagged
        // enum variant, and the shape that broke when they were left in
        // snake_case: a picture with no `mediaType` is drawn with an unusable
        // `data:` URL, and no `byteLength` prints as "NaN MB".
        assert_eq!(
            serde_json::to_value(changes::ImagePreview {
                before: Some(changes::ImagePreviewSide::Ready {
                    media_type: "image/png".into(),
                    byte_length: 747,
                    data: "iVBORw0KGgo=".into(),
                }),
                after: Some(changes::ImagePreviewSide::TooLarge {
                    byte_length: 20 * 1024 * 1024,
                    limit_bytes: 10 * 1024 * 1024,
                }),
            })
            .unwrap(),
            serde_json::json!({
                "before": {
                    "kind":"ready", "mediaType":"image/png", "byteLength":747,
                    "data":"iVBORw0KGgo="
                },
                "after": {
                    "kind":"too-large", "byteLength":20971520, "limitBytes":10485760
                }
            })
        );
        assert_eq!(
            serde_json::to_value(changes::WorkingTreeDiffBatch {
                outcome: changes::DiffWarmOutcome::Deferred,
                diffs: Vec::new(),
                changed_files: 900,
                budget_bytes: 2 * 1024 * 1024,
            })
            .unwrap(),
            serde_json::json!({
                "outcome":"deferred", "diffs":[], "changedFiles":900, "budgetBytes":2097152
            })
        );
        assert_eq!(
            serde_json::to_value(session::stale_session_error()).unwrap(),
            serde_json::json!({
                "code":"stale_session", "message":"This result belongs to a project session that is no longer open.",
                "remediation":"Use the currently open project and try again.", "detail": null
            })
        );
        assert_eq!(
            serde_json::to_value(watch::RepositoryInvalidation {
                project_id: "/repo".into(),
                session_epoch: "epoch-1".into(),
                sequence: 7,
                kind: watch::RepositoryInvalidationKind::SharedRepository,
            })
            .unwrap(),
            serde_json::json!({
                "projectId":"/repo", "sessionEpoch":"epoch-1", "sequence":7,
                "kind":"shared_repository"
            })
        );
    }
}

//! Thin Tauri transport adapters.
//!
//! These functions own only framework extraction/serialization and delegate
//! immediately. Repository authorization, execution policy and workflows stay
//! behind the application boundary.

use crate::{
    changes::{self, CommitFileChange, FileDiff, FileLines},
    desktop,
    error::AppError,
    publish_domain::{self, PublishPlan, PublishResult},
    recovery::{self, DiscardPlan, DiscardRecovery, DiscardResult},
    repository::{self, RepositoryInfo},
    save_version::{self, SaveVersionPlan, SaveVersionResult},
    session,
    status::{self, PendingVersionsResult, WorkingTreeStatus},
    sync::{
        self, GetTeamChangesPhase, GetTeamChangesPlan, GetTeamChangesResult, RemoteDiscovery,
        TeamSyncStatus,
    },
    tooling::{
        self, GitDiagnostics, GitIdentity, GitInstallationResult, GitUpdateLaunchResult,
        GitUpdateStatus,
    },
    version_lines::{
        self, CreateVersionLinePlan, DeleteVersionLinePlan, SwitchVersionLinePlan,
        VersionLinesSnapshot,
    },
    watch,
};

fn validate_session(path: &str, session_epoch: Option<&str>) -> Result<(), AppError> {
    session::global().validate(path, session_epoch)
}

fn validate_mutation_session(path: &str, session_epoch: &str) -> Result<(), AppError> {
    session::global().validate(path, Some(session_epoch))
}

#[tauri::command]
pub(crate) fn app_status() -> &'static str {
    desktop::app_status()
}

#[tauri::command]
pub(crate) fn show_main_window(window: tauri::Window) {
    desktop::show_main_window(window);
}

#[tauri::command(async)]
pub(crate) fn open_repository(
    path: String,
    session_epoch: Option<String>,
) -> Result<RepositoryInfo, AppError> {
    repository::open_repository(path, session_epoch)
}

#[tauri::command(async)]
pub(crate) fn read_working_tree_status(
    path: String,
    session_epoch: Option<String>,
) -> Result<WorkingTreeStatus, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    status::read_working_tree_status(path)
}

#[tauri::command(async)]
pub(crate) fn read_file_diff(
    path: String,
    file_path: String,
    session_epoch: Option<String>,
) -> Result<FileDiff, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    changes::read_file_diff(path, file_path)
}

#[tauri::command(async)]
pub(crate) fn read_file_lines(
    path: String,
    file_path: String,
    start_line: u32,
    end_line: u32,
    session_epoch: Option<String>,
) -> Result<FileLines, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    changes::read_file_lines(path, file_path, start_line, end_line)
}

#[tauri::command(async)]
pub(crate) fn read_working_tree_diffs(
    path: String,
    session_epoch: Option<String>,
) -> Result<Vec<FileDiff>, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    changes::read_working_tree_diffs(path)
}

#[tauri::command(async)]
pub(crate) fn plan_discard_changes(
    path: String,
    selected_path: Option<String>,
    session_epoch: String,
) -> Result<DiscardPlan, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    recovery::plan_discard_changes(path, selected_path)
}

#[tauri::command(async)]
pub(crate) fn discard_changes(
    path: String,
    selected_path: Option<String>,
    state_token: String,
    session_epoch: String,
) -> Result<DiscardResult, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    recovery::discard_changes(path, selected_path, state_token)
}

#[tauri::command(async)]
pub(crate) fn get_discard_recovery(
    path: String,
    session_epoch: String,
) -> Result<DiscardRecovery, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    recovery::get_discard_recovery(path)
}

#[tauri::command(async)]
pub(crate) fn restore_discarded_changes(
    path: String,
    recovery_id: String,
    state_token: String,
    session_epoch: String,
) -> Result<(), AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    recovery::restore_discarded_changes(path, recovery_id, state_token)
}

#[tauri::command(async)]
pub(crate) fn git_diagnostics() -> GitDiagnostics {
    tooling::git_diagnostics()
}

#[tauri::command(async)]
pub(crate) fn install_git() -> GitInstallationResult {
    tooling::install_git()
}

#[tauri::command(async)]
pub(crate) fn update_git() -> GitUpdateLaunchResult {
    tooling::update_git()
}

#[tauri::command(async)]
pub(crate) fn check_git_update() -> GitUpdateStatus {
    tooling::check_git_update()
}

#[tauri::command(async)]
pub(crate) fn get_git_identity() -> GitIdentity {
    tooling::get_git_identity()
}

#[tauri::command(async)]
pub(crate) fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
    tooling::set_git_identity(name, email)
}

#[tauri::command(async)]
pub(crate) fn plan_save_version(
    path: String,
    selected_paths: Option<Vec<String>>,
    session_epoch: String,
) -> Result<SaveVersionPlan, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    save_version::plan_save_version(path, selected_paths)
}

#[tauri::command(async)]
pub(crate) fn save_version(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
    session_epoch: String,
) -> Result<SaveVersionResult, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    save_version::save_version(path, title, description, state_token, selected_paths)
}

#[tauri::command(async)]
pub(crate) fn discover_remotes(
    path: String,
    session_epoch: Option<String>,
) -> Result<RemoteDiscovery, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    sync::discover_remotes(path)
}

#[tauri::command(async)]
pub(crate) fn read_team_sync_status(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    sync::read_team_sync_status(path, session_epoch)
}

#[tauri::command(async)]
pub(crate) fn check_team_changes(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    sync::check_team_changes(path, session_epoch)
}

#[tauri::command(async)]
pub(crate) fn plan_get_team_changes(
    path: String,
    session_epoch: String,
    on_progress: tauri::ipc::Channel<GetTeamChangesPhase>,
) -> Result<GetTeamChangesPlan, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    sync::plan_get_team_changes(path, session_epoch, |phase| {
        let _ = on_progress.send(phase);
    })
}

#[tauri::command(async)]
pub(crate) fn get_team_changes(
    path: String,
    session_epoch: String,
    state_token: String,
    recovery_reference: String,
    on_progress: tauri::ipc::Channel<GetTeamChangesPhase>,
) -> Result<GetTeamChangesResult, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    sync::get_team_changes(
        path,
        session_epoch,
        state_token,
        recovery_reference,
        |phase| {
            let _ = on_progress.send(phase);
        },
    )
}

#[tauri::command(async)]
pub(crate) fn list_unpublished_versions(
    path: String,
    session_epoch: Option<String>,
) -> Result<PendingVersionsResult, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    status::list_unpublished_versions(path)
}

#[tauri::command(async)]
pub(crate) fn read_commit_file_changes(
    path: String,
    commit: String,
    session_epoch: Option<String>,
) -> Result<Vec<CommitFileChange>, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    changes::read_commit_file_changes(path, commit)
}

#[tauri::command(async)]
pub(crate) fn read_commit_file_diff(
    path: String,
    commit: String,
    file_path: String,
    session_epoch: Option<String>,
) -> Result<FileDiff, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    changes::read_commit_file_diff(path, commit, file_path)
}

#[tauri::command(async)]
pub(crate) fn plan_publish(
    path: String,
    remote: Option<String>,
    up_to: Option<String>,
    session_epoch: String,
) -> Result<PublishPlan, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    publish_domain::plan_publish(path, remote, up_to)
}

#[tauri::command(async)]
pub(crate) fn publish(
    path: String,
    remote: String,
    state_token: String,
    up_to: Option<String>,
    session_epoch: String,
) -> Result<PublishResult, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    publish_domain::publish(path, remote, state_token, up_to)
}

#[tauri::command(async)]
pub(crate) fn get_version_lines(
    path: String,
    session_epoch: Option<String>,
) -> Result<VersionLinesSnapshot, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    version_lines::get_version_lines(path)
}

#[tauri::command(async)]
pub(crate) fn plan_create_version_line(
    path: String,
    name: String,
    switch: bool,
    session_epoch: String,
) -> Result<CreateVersionLinePlan, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    version_lines::plan_create_version_line(path, name, switch)
}

#[tauri::command(async)]
pub(crate) fn create_version_line(
    path: String,
    name: String,
    switch: bool,
    state_token: String,
    session_epoch: String,
) -> Result<VersionLinesSnapshot, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    version_lines::create_version_line(path, name, switch, state_token)
}

#[tauri::command(async)]
pub(crate) fn plan_switch_version_line(
    path: String,
    target: String,
    session_epoch: String,
) -> Result<SwitchVersionLinePlan, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    version_lines::plan_switch_version_line(path, target)
}

#[tauri::command(async)]
pub(crate) fn switch_version_line(
    path: String,
    target: String,
    state_token: String,
    session_epoch: String,
) -> Result<VersionLinesSnapshot, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    version_lines::switch_version_line(path, target, state_token)
}

#[tauri::command(async)]
pub(crate) fn plan_delete_version_line(
    path: String,
    name: String,
    session_epoch: String,
) -> Result<DeleteVersionLinePlan, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    version_lines::plan_delete_version_line(path, name)
}

#[tauri::command(async)]
pub(crate) fn delete_version_line(
    path: String,
    name: String,
    state_token: String,
    session_epoch: String,
) -> Result<VersionLinesSnapshot, AppError> {
    validate_mutation_session(&path, &session_epoch)?;
    version_lines::delete_version_line(path, name, state_token)
}

#[tauri::command(async)]
pub(crate) fn watch_repository(
    app: tauri::AppHandle,
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: Option<String>,
) -> Result<bool, AppError> {
    validate_session(&path, session_epoch.as_deref())?;
    watch::watch_repository(app, registry, path, session_epoch)
}

#[tauri::command(async)]
pub(crate) fn unwatch_repository(
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: Option<String>,
) {
    watch::unwatch_repository(registry, path, session_epoch);
}

#[tauri::command(async)]
pub(crate) fn close_project_session(
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: String,
) -> Result<(), AppError> {
    registry.unwatch(&path, Some(&session_epoch));
    session::global().close(&path, &session_epoch)
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
            AppErrorCode::PublishUncertain,
            AppErrorCode::GetTeamChangesUncertain,
            AppErrorCode::GitVersionTooOld,
            AppErrorCode::VersionLineNameTaken,
            AppErrorCode::VersionLineNameCollides,
            AppErrorCode::VersionLineCheckedOutElsewhere,
            AppErrorCode::VersionLineIsActive,
            AppErrorCode::VersionLineUniqueWork,
            AppErrorCode::VersionLineSwitchObstructed,
            AppErrorCode::StaleVersionLinePlan,
            AppErrorCode::DirtyWorkingTree,
            AppErrorCode::IncomingPathCollision,
            AppErrorCode::RefLocked,
            AppErrorCode::NothingToDiscard,
            AppErrorCode::StaleDiscardPlan,
            AppErrorCode::RecoveryUnavailable,
            AppErrorCode::RecoveryConflict,
            AppErrorCode::RecoveryFailed,
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

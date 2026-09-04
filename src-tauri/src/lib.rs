#![allow(linker_messages)]

mod application;
#[cfg(test)]
mod architecture;
mod changes;
mod clone;
mod desktop;
mod diagnostics;
mod error;
mod git;
mod git_command;
mod history;
mod index;
mod initialize;
mod ipc;
mod operation;
mod platform;
mod project_settings;
#[path = "publish.rs"]
mod publish_domain;
mod recovery;
mod repository;
mod repository_access;
mod save_version;
mod session;
mod status;
mod sync;
mod tooling;
mod version_lines;
mod watch;

#[cfg(test)]
use changes::*;
#[cfg(test)]
use clone::*;
#[cfg(test)]
use error::{AppError, AppErrorCode};
#[cfg(test)]
use git_command::*;
#[cfg(test)]
use history::*;
#[cfg(test)]
use initialize::*;
#[cfg(test)]
use operation::*;
#[cfg(test)]
use publish_domain::*;
#[cfg(test)]
use recovery::*;
#[cfg(test)]
use repository::*;
#[cfg(test)]
use save_version::*;
#[cfg(test)]
use status::*;
#[cfg(test)]
use sync::*;

#[cfg(test)]
use std::path::Path;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(diagnostics::install_global())
        .manage(watch::WatcherRegistry::default())
        .manage(clone::CloneOperationRegistry::default())
        .manage(history::HistoryReadCache::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            ipc::app_status,
            ipc::show_main_window,
            ipc::open_repository,
            ipc::plan_clone,
            ipc::clone_repository,
            ipc::cancel_clone,
            ipc::cleanup_clone,
            ipc::plan_initialize_project,
            ipc::initialize_project,
            ipc::cleanup_initialize_project,
            ipc::read_working_tree_status,
            ipc::read_file_diff,
            ipc::read_file_image_preview,
            ipc::read_file_lines,
            ipc::read_working_tree_diffs,
            ipc::plan_discard_changes,
            ipc::discard_changes,
            ipc::get_discard_recovery,
            ipc::restore_discarded_changes,
            ipc::git_diagnostics,
            ipc::install_git,
            ipc::update_git,
            ipc::check_git_update,
            ipc::get_git_identity,
            ipc::render_diagnostic_report,
            ipc::save_diagnostic_report,
            ipc::set_git_identity,
            ipc::get_line_endings,
            ipc::set_line_endings,
            ipc::get_default_branch,
            ipc::set_default_branch,
            ipc::plan_save_version,
            ipc::save_version,
            ipc::discover_remotes,
            ipc::plan_connect_remote,
            ipc::connect_remote,
            ipc::read_project_remotes,
            ipc::set_remote_url,
            ipc::read_project_identity,
            ipc::set_project_identity,
            ipc::clear_project_identity,
            ipc::read_ignore_file,
            ipc::write_ignore_file,
            ipc::read_team_sync_status,
            ipc::check_team_changes,
            ipc::plan_get_team_changes,
            ipc::get_team_changes,
            ipc::list_unpublished_versions,
            ipc::read_commit_file_changes,
            ipc::read_commit_file_diff,
            ipc::read_history_page,
            ipc::read_saved_version_detail,
            ipc::read_saved_version_file_diff,
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
        .expect("error while running GitOdile");
}

#[cfg(test)]
#[path = "tests/changes_tests.rs"]
mod changes_tests;
#[cfg(test)]
#[path = "tests/clone_tests.rs"]
mod clone_tests;
#[cfg(test)]
#[path = "tests/core_workflow_tests.rs"]
mod core_workflow_tests;
#[cfg(test)]
#[path = "tests/git_command_tests.rs"]
mod git_command_tests;
#[cfg(test)]
#[path = "tests/history_tests.rs"]
mod history_tests;
#[cfg(test)]
#[path = "tests/initialize_tests.rs"]
mod initialize_tests;
#[cfg(test)]
#[path = "tests/publish_tests.rs"]
mod publish_tests;
#[cfg(test)]
#[path = "tests/recovery_tests.rs"]
mod recovery_tests;
#[cfg(test)]
#[path = "tests/repository_tests.rs"]
mod repository_tests;
#[cfg(test)]
#[path = "tests/save_version_tests.rs"]
mod save_version_tests;
#[cfg(test)]
#[path = "tests/status_tests.rs"]
mod status_tests;
#[cfg(test)]
#[path = "tests/sync_tests.rs"]
mod sync_tests;
#[cfg(test)]
mod test_support;

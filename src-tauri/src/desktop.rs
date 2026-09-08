//! Desktop-shell services that do not belong to a product feature.

use std::io::ErrorKind;
use std::path::Path;

use tauri::Manager;

use crate::application;
use crate::changes::validate_repo_relative_path;
use crate::error::{AppError, AppErrorCode};

pub(crate) fn app_status() -> &'static str {
    "GitOdile is ready"
}

/// Opens the operating system's file manager with one of the project's files
/// selected.
///
/// The frontend names a repository-relative path and never a place on the disk.
/// `tauri-plugin-opener` exposes a `reveal_item_in_dir` command whose permission
/// carries no scope of its own, so allowing it in `capabilities/default.json`
/// would let the webview reveal anything on the machine — the same reason that
/// file lists every URL the app may open. Calling the plugin's Rust API from
/// behind this command keeps the choice of path here, where it can be checked.
///
/// The check is the one `read_file_lines` and the picture previews already make,
/// for the same reason: `validate_repo_relative_path` rejects `..` and absolute
/// paths but works on the string alone, so a symlink committed inside the
/// repository would still resolve outside it. Both ends are resolved and
/// compared.
pub(crate) fn reveal_project_file(path: String, file_path: String) -> Result<(), AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "reveal_project_file", None)?;
    validate_repo_relative_path(&file_path)?;

    let repo_root = Path::new(&path).canonicalize().map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "This project's folder can't be read.",
        )
        .with_remediation("Open the project again, or choose another folder.")
    })?;
    let full_path = repo_root.join(&file_path).canonicalize().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "This file is no longer there.")
                .with_remediation("Refresh the changes list.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "This file can't be read.")
                .with_remediation("Check the file's permissions and try again.")
        }
    })?;
    if !full_path.starts_with(&repo_root) {
        return Err(
            AppError::new(AppErrorCode::PathInvalid, "That file path isn't valid.")
                .with_remediation("Refresh the changes list and choose the file again."),
        );
    }

    tauri_plugin_opener::reveal_item_in_dir(&full_path).map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "Your file manager couldn't be opened.",
        )
        .with_remediation("Open the project folder yourself to find this file.")
    })
}

/// The main window starts hidden so the OS-level window never appears blank
/// while the webview loads and React mounts.
pub(crate) fn show_main_window(window: tauri::Window) {
    if let Some(main) = window.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

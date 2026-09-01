//! Desktop-shell services that do not belong to a product feature.

use tauri::Manager;

pub(crate) fn app_status() -> &'static str {
    "GitOdile is ready"
}

/// The main window starts hidden so the OS-level window never appears blank
/// while the webview loads and React mounts.
pub(crate) fn show_main_window(window: tauri::Window) {
    if let Some(main) = window.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

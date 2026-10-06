//! Change confirmations: a GitOdile setting, held and enforced by Rust.
//!
//! It lives in GitOdile's own data folder and never in Git configuration.
//! Every plan and every run reads it here; the renderer can ask to change it
//! but never passes it along with a command.

use crate::error::{AppError, AppErrorCode};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const FILE_NAME: &str = "console-settings.json";
const SIZE_LIMIT: u64 = 4 * 1024;

fn confirmations_default() -> bool {
    true
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    schema_version: u32,
    /// Absent in files written before the setting existed: confirmations on.
    #[serde(default = "confirmations_default")]
    confirm_changes: bool,
    /// Written by versions that had a read-only console mode (ADR 0017 §4,
    /// replaced by ADR 0028). Read only so that someone who chose read-only
    /// keeps confirmations on; never written again.
    #[serde(default, skip_serializing)]
    advanced_mode: Option<bool>,
}

/// The console's setting, as the renderer reads it.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConsoleModes {
    /// A change plan asks `[s/N]` before it runs.
    pub(crate) confirm_changes: bool,
}

const DEFAULT_MODES: ConsoleModes = ConsoleModes {
    confirm_changes: true,
};

pub(crate) struct ConsoleSettings {
    path: PathBuf,
    modes: Mutex<ConsoleModes>,
}

impl ConsoleSettings {
    /// Reads the stored choice once; anything missing, oversized or
    /// malformed means the default: confirmations on.
    pub(crate) fn load(data_dir: &Path) -> Self {
        let path = data_dir.join(FILE_NAME);
        let modes = fs::metadata(&path)
            .ok()
            .filter(|metadata| metadata.len() <= SIZE_LIMIT)
            .and_then(|_| fs::read(&path).ok())
            .and_then(|bytes| serde_json::from_slice::<Record>(&bytes).ok())
            .filter(|record| record.schema_version == 1)
            .map_or(DEFAULT_MODES, |record| ConsoleModes {
                confirm_changes: record.confirm_changes || record.advanced_mode == Some(false),
            });
        Self {
            path,
            modes: Mutex::new(modes),
        }
    }

    /// The settings for the running app, in GitOdile's local data folder.
    pub(crate) fn for_app<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Self {
        use tauri::Manager;
        let data_dir = app
            .path()
            .app_local_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("gitodile"));
        Self::load(&data_dir)
    }

    pub(crate) fn modes(&self) -> ConsoleModes {
        *self
            .modes
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[cfg(test)]
    pub(crate) fn confirm_changes(&self) -> bool {
        self.modes().confirm_changes
    }

    /// Turning confirmations off needs the renderer to say the person accepted
    /// its dialog; turning them back on never waits for anything.
    pub(crate) fn set_confirm_changes(
        &self,
        enabled: bool,
        confirmed: bool,
    ) -> Result<ConsoleModes, AppError> {
        if !enabled && !confirmed {
            return Err(AppError::new(
                AppErrorCode::InvalidSelection,
                "Turning off change confirmations needs to be confirmed first.",
            ));
        }
        self.update(|modes| modes.confirm_changes = enabled, enabled)
    }

    /// Applies a change and saves it. A change that makes the console
    /// stricter takes effect in memory even if saving fails, so a failed
    /// write can never leave it more permissive than the person asked.
    fn update(
        &self,
        change: impl FnOnce(&mut ConsoleModes),
        stricter: bool,
    ) -> Result<ConsoleModes, AppError> {
        let mut modes = self
            .modes
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut next = *modes;
        change(&mut next);
        if stricter {
            *modes = next;
        }
        persist(&self.path, next).map_err(|_| {
            AppError::new(
                AppErrorCode::PermissionDenied,
                "The console setting could not be saved.",
            )
        })?;
        *modes = next;
        Ok(next)
    }
}

fn persist(path: &Path, modes: ConsoleModes) -> std::io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::other("settings path has no parent"))?;
    fs::create_dir_all(parent)?;
    let bytes = serde_json::to_vec(&Record {
        schema_version: 1,
        confirm_changes: modes.confirm_changes,
        advanced_mode: None,
    })
    .map_err(std::io::Error::other)?;
    let temporary = parent.join(format!("{FILE_NAME}.new"));
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temporary, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::unique_temp_dir;

    #[test]
    fn confirmations_stay_on_until_turning_them_off_is_confirmed() {
        let dir = PathBuf::from(unique_temp_dir("console-settings-confirm"));
        let settings = ConsoleSettings::load(&dir);
        assert_eq!(settings.modes(), DEFAULT_MODES);
        assert_eq!(
            settings.set_confirm_changes(false, false).unwrap_err().code,
            AppErrorCode::InvalidSelection
        );
        assert!(settings.confirm_changes());
        let modes = settings.set_confirm_changes(false, true).unwrap();
        assert!(!modes.confirm_changes);
        assert_eq!(ConsoleSettings::load(&dir).modes(), modes);
        // Back on needs nothing.
        assert!(
            settings
                .set_confirm_changes(true, false)
                .unwrap()
                .confirm_changes
        );
        assert!(ConsoleSettings::load(&dir).confirm_changes());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_file_from_before_confirmations_keeps_them_on() {
        let dir = PathBuf::from(unique_temp_dir("console-settings-older"));
        fs::write(
            dir.join(FILE_NAME),
            r#"{"schemaVersion":1,"advancedMode":true}"#,
        )
        .unwrap();
        assert!(ConsoleSettings::load(&dir).confirm_changes());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_file_from_the_three_modes_keeps_root_and_never_widens_read_only() {
        let dir = PathBuf::from(unique_temp_dir("console-settings-modes"));
        for (contents, confirm) in [
            (
                r#"{"schemaVersion":1,"advancedMode":true,"confirmChanges":false}"#,
                false,
            ),
            (
                r#"{"schemaVersion":1,"advancedMode":true,"confirmChanges":true}"#,
                true,
            ),
            (
                r#"{"schemaVersion":1,"advancedMode":false,"confirmChanges":false}"#,
                true,
            ),
            (
                r#"{"schemaVersion":1,"advancedMode":false,"confirmChanges":true}"#,
                true,
            ),
        ] {
            fs::write(dir.join(FILE_NAME), contents).unwrap();
            assert_eq!(
                ConsoleSettings::load(&dir).confirm_changes(),
                confirm,
                "{contents}"
            );
        }
        // Saving drops the old field.
        ConsoleSettings::load(&dir)
            .set_confirm_changes(true, false)
            .unwrap();
        assert_eq!(
            fs::read_to_string(dir.join(FILE_NAME)).unwrap(),
            r#"{"schemaVersion":1,"confirmChanges":true}"#
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_damaged_file_means_the_defaults() {
        let dir = PathBuf::from(unique_temp_dir("console-settings-damaged"));
        for contents in [
            "not json".to_string(),
            r#"{"schemaVersion":2,"confirmChanges":false}"#.to_string(),
            format!(
                r#"{{"schemaVersion":1,"confirmChanges":false,"x":"{}"}}"#,
                "x".repeat(5000)
            ),
        ] {
            fs::write(dir.join(FILE_NAME), contents).unwrap();
            assert_eq!(ConsoleSettings::load(&dir).modes(), DEFAULT_MODES);
        }
        fs::remove_dir_all(dir).unwrap();
    }
}

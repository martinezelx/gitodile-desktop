//! Advanced mode and change confirmations: GitOdile settings, held and
//! enforced by Rust.
//!
//! They live in GitOdile's own data folder and never in Git configuration.
//! Every plan and every run reads them here; the renderer can ask to change
//! them but never passes them along with a command.

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
    advanced_mode: bool,
    /// Absent in files written before the setting existed: confirmations on.
    #[serde(default = "confirmations_default")]
    confirm_changes: bool,
}

/// The console's two settings, as the renderer reads them.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConsoleModes {
    /// Changes (Local change, Remote) may be planned at all.
    pub(crate) advanced_mode: bool,
    /// A change plan asks `[s/N]` before it runs.
    pub(crate) confirm_changes: bool,
}

const DEFAULT_MODES: ConsoleModes = ConsoleModes {
    advanced_mode: false,
    confirm_changes: true,
};

pub(crate) struct ConsoleSettings {
    path: PathBuf,
    modes: Mutex<ConsoleModes>,
}

impl ConsoleSettings {
    /// Reads the stored choices once; anything missing, oversized or
    /// malformed means the defaults: advanced mode off, confirmations on.
    pub(crate) fn load(data_dir: &Path) -> Self {
        let path = data_dir.join(FILE_NAME);
        let modes = fs::metadata(&path)
            .ok()
            .filter(|metadata| metadata.len() <= SIZE_LIMIT)
            .and_then(|_| fs::read(&path).ok())
            .and_then(|bytes| serde_json::from_slice::<Record>(&bytes).ok())
            .filter(|record| record.schema_version == 1)
            .map_or(DEFAULT_MODES, |record| ConsoleModes {
                advanced_mode: record.advanced_mode,
                confirm_changes: record.confirm_changes,
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
    pub(crate) fn advanced_mode(&self) -> bool {
        self.modes().advanced_mode
    }

    #[cfg(test)]
    pub(crate) fn confirm_changes(&self) -> bool {
        self.modes().confirm_changes
    }

    /// Turning advanced mode on needs the renderer to say the person accepted
    /// its confirmation dialog; turning it off never waits for anything.
    pub(crate) fn set_advanced_mode(
        &self,
        enabled: bool,
        confirmed: bool,
    ) -> Result<ConsoleModes, AppError> {
        if enabled && !confirmed {
            return Err(AppError::new(
                AppErrorCode::InvalidSelection,
                "Advanced mode needs to be confirmed before it turns on.",
            ));
        }
        self.update(|modes| modes.advanced_mode = enabled, !enabled)
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
        advanced_mode: modes.advanced_mode,
        confirm_changes: modes.confirm_changes,
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
    fn advanced_mode_is_off_until_confirmed_and_survives_a_restart() {
        let dir = PathBuf::from(unique_temp_dir("console-settings"));
        let settings = ConsoleSettings::load(&dir);
        assert_eq!(settings.modes(), DEFAULT_MODES);
        assert_eq!(
            settings.set_advanced_mode(true, false).unwrap_err().code,
            AppErrorCode::InvalidSelection
        );
        assert!(!settings.advanced_mode());
        assert!(
            settings
                .set_advanced_mode(true, true)
                .unwrap()
                .advanced_mode
        );
        assert!(ConsoleSettings::load(&dir).advanced_mode());
        // Turning it off needs no confirmation.
        assert!(
            !settings
                .set_advanced_mode(false, false)
                .unwrap()
                .advanced_mode
        );
        assert!(!ConsoleSettings::load(&dir).advanced_mode());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn confirmations_stay_on_until_turning_them_off_is_confirmed() {
        let dir = PathBuf::from(unique_temp_dir("console-settings-confirm"));
        let settings = ConsoleSettings::load(&dir);
        assert!(settings.confirm_changes());
        assert_eq!(
            settings.set_confirm_changes(false, false).unwrap_err().code,
            AppErrorCode::InvalidSelection
        );
        assert!(settings.confirm_changes());
        settings.set_advanced_mode(true, true).unwrap();
        let modes = settings.set_confirm_changes(false, true).unwrap();
        assert_eq!(
            modes,
            ConsoleModes {
                advanced_mode: true,
                confirm_changes: false
            }
        );
        assert_eq!(ConsoleSettings::load(&dir).modes(), modes);
        // Back on needs nothing, and advanced mode is left as it was.
        assert!(
            settings
                .set_confirm_changes(true, false)
                .unwrap()
                .confirm_changes
        );
        assert!(ConsoleSettings::load(&dir).advanced_mode());
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
        assert_eq!(
            ConsoleSettings::load(&dir).modes(),
            ConsoleModes {
                advanced_mode: true,
                confirm_changes: true
            }
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_damaged_file_means_the_defaults() {
        let dir = PathBuf::from(unique_temp_dir("console-settings-damaged"));
        for contents in [
            "not json".to_string(),
            r#"{"schemaVersion":2,"advancedMode":true,"confirmChanges":false}"#.to_string(),
            format!(
                r#"{{"schemaVersion":1,"advancedMode":true,"x":"{}"}}"#,
                "x".repeat(5000)
            ),
        ] {
            fs::write(dir.join(FILE_NAME), contents).unwrap();
            assert_eq!(ConsoleSettings::load(&dir).modes(), DEFAULT_MODES);
        }
        fs::remove_dir_all(dir).unwrap();
    }
}

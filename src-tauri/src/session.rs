use crate::error::{AppError, AppErrorCode};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Default)]
pub(crate) struct SessionRegistry {
    epochs: Mutex<HashMap<String, String>>,
    next: AtomicU64,
}

impl SessionRegistry {
    pub(crate) fn open(
        &self,
        project_id: &str,
        requested: Option<&str>,
    ) -> Result<String, AppError> {
        let mut epochs = self
            .epochs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(requested) = requested {
            return match epochs.get(project_id) {
                Some(current) if current == requested => Ok(current.clone()),
                _ => Err(stale_session_error()),
            };
        }
        if let Some(current) = epochs.get(project_id) {
            return Ok(current.clone());
        }
        let epoch = self.create_epoch();
        epochs.insert(project_id.to_string(), epoch.clone());
        Ok(epoch)
    }

    pub(crate) fn validate(&self, project_id: &str, epoch: Option<&str>) -> Result<(), AppError> {
        // Compatibility bridge for the current direct invoke consumers. Task
        // 029 removes this allowance for mutations. Consumers migrated in
        // task 025 already supply an epoch; the remaining named bridge users
        // are recorded in the checked IPC contract.
        let Some(epoch) = epoch else {
            return Ok(());
        };
        let epochs = self
            .epochs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match epochs.get(project_id) {
            Some(current) if current == epoch => Ok(()),
            _ => Err(stale_session_error()),
        }
    }

    pub(crate) fn close(&self, project_id: &str, epoch: &str) -> Result<(), AppError> {
        let mut epochs = self
            .epochs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match epochs.get(project_id) {
            Some(current) if current == epoch => {
                epochs.remove(project_id);
                Ok(())
            }
            _ => Err(stale_session_error()),
        }
    }

    fn create_epoch(&self) -> String {
        let sequence = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        format!("{nanos:x}-{sequence:x}")
    }
}

pub(crate) fn stale_session_error() -> AppError {
    AppError::new(
        AppErrorCode::StaleSession,
        "This result belongs to a project session that is no longer open.",
    )
    .with_remediation("Use the currently open project and try again.")
}

pub(crate) fn global() -> &'static SessionRegistry {
    static REGISTRY: OnceLock<SessionRegistry> = OnceLock::new();
    REGISTRY.get_or_init(SessionRegistry::default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_and_reopen_creates_a_new_epoch_and_rejects_the_old_one() {
        let registry = SessionRegistry::default();
        let first = registry.open("/repo", None).unwrap();
        registry.validate("/repo", Some(&first)).unwrap();
        registry.close("/repo", &first).unwrap();
        let second = registry.open("/repo", None).unwrap();
        assert_ne!(first, second);
        assert_eq!(
            registry.validate("/repo", Some(&first)).unwrap_err().code,
            AppErrorCode::StaleSession
        );
        registry.validate("/repo", Some(&second)).unwrap();
    }

    #[test]
    fn refresh_with_the_current_epoch_preserves_the_incarnation() {
        let registry = SessionRegistry::default();
        let epoch = registry.open("/repo", None).unwrap();
        assert_eq!(registry.open("/repo", Some(&epoch)).unwrap(), epoch);
    }
}

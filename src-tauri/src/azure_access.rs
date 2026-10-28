//! Azure Repos Services organization instances. Token lifecycle stays in
//! hosting_access; this owner handles organization discovery and URL policy.
use crate::{
    credentials::{AccessProvider, AccountService},
    error::{AppError, AppErrorCode},
    hosting_access::HostingAccessService,
};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::{Arc, Mutex},
};

pub(crate) fn organization(raw: &str) -> Result<String, AppError> {
    let value = raw.trim();
    let value = value
        .strip_prefix("https://dev.azure.com/")
        .unwrap_or(value)
        .trim_end_matches('/')
        .to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 50
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        || !value.as_bytes()[0].is_ascii_alphanumeric()
        || !value.as_bytes()[value.len() - 1].is_ascii_alphanumeric()
    {
        return Err(failure(AppErrorCode::InvalidSelection));
    }
    Ok(value)
}
pub(crate) fn instance_id(org: &str) -> String {
    let digest = Sha256::digest(org.as_bytes());
    format!(
        "azo-{}",
        digest
            .iter()
            .take(10)
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    )
}
fn failure(code: AppErrorCode) -> AppError {
    AppError::new(code, "Azure Repos access could not be completed.")
}

/// Decode segments only after splitting. Encoded separators, dot segments,
/// malformed escapes and control characters can never change the boundary.
fn segment(raw: &str) -> Result<String, ()> {
    let mut bytes = Vec::new();
    let mut i = 0;
    while i < raw.len() {
        if raw.as_bytes()[i] == b'%' {
            let hex = raw.get(i + 1..i + 3).ok_or(())?;
            bytes.push(u8::from_str_radix(hex, 16).map_err(|_| ())?);
            i += 3;
        } else {
            bytes.push(raw.as_bytes()[i]);
            i += 1;
        }
    }
    let value = String::from_utf8(bytes).map_err(|_| ())?;
    if value.is_empty()
        || matches!(value.as_str(), "." | "..")
        || value
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\' | '%' | '?' | '#'))
    {
        return Err(());
    }
    Ok(value)
}
pub(crate) fn validate_source(source: &str, org: &str) -> Result<(), ()> {
    // Check original segments before URL normalization can collapse dot paths.
    let raw = source.strip_prefix("https://dev.azure.com/").ok_or(())?;
    let parts = raw
        .trim_end_matches('/')
        .split('/')
        .map(segment)
        .collect::<Result<Vec<_>, _>>()?;
    if !matches!(parts.len(), 3 | 4)
        || parts[0] != org
        || raw.split('/').next() != Some(org)
        || parts[parts.len() - 2] != "_git"
    {
        return Err(());
    }
    let url = reqwest::Url::parse(source).map_err(|_| ())?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port().is_some()
    {
        return Err(());
    }
    Ok(())
}

/// Normalize copied clone URLs only. Existing Git remotes are never rewritten.
pub(crate) fn normalize_clone_source(raw: &str) -> Result<Option<String>, ()> {
    let Ok(url) = reqwest::Url::parse(raw) else {
        return Ok(None);
    };
    if url.host_str() != Some("dev.azure.com") || url.scheme() != "https" {
        return Ok(None);
    }
    if url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port().is_some()
    {
        return Err(());
    }
    let path = raw
        .split_once("://")
        .and_then(|(_, tail)| tail.split_once('/'))
        .map(|(_, path)| path)
        .ok_or(())?;
    let (org, rest) = path.split_once('/').ok_or(())?;
    let org = organization(org).map_err(|_| ())?;
    let source = format!("https://dev.azure.com/{org}/{rest}");
    validate_source(&source, &org)?;
    Ok(Some(source))
}

#[derive(Clone)]
pub(crate) struct AzureOrganizations {
    directory: PathBuf,
    accounts: Arc<AccountService>,
    services: Arc<Mutex<BTreeMap<String, HostingAccessService>>>,
    cancelled: Arc<Mutex<BTreeSet<String>>>,
    adding: Arc<tokio::sync::Mutex<()>>,
    writable: bool,
}
impl AzureOrganizations {
    pub(crate) fn load(directory: PathBuf, accounts: Arc<AccountService>) -> Self {
        let directory = directory.join("azure-organizations");
        let mut services = BTreeMap::new();
        let loaded = (|| -> Result<(), ()> {
            let entries = match std::fs::read_dir(&directory) {
                Ok(entries) => entries,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
                Err(_) => return Err(()),
            };
            for entry in entries {
                let entry = entry.map_err(|_| ())?;
                if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
                    continue;
                }
                if services.len() >= 8 || !entry.file_type().map_err(|_| ())?.is_file() {
                    return Err(());
                }
                let name = entry
                    .path()
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .and_then(|s| s.strip_prefix("org-"))
                    .ok_or(())?
                    .to_owned();
                if organization(&name).ok().as_deref() != Some(&name) {
                    return Err(());
                }
                services.insert(
                    name.clone(),
                    HostingAccessService::azure(&name, entry.path()),
                );
            }
            Ok(())
        })();
        if loaded.is_ok() {
            for service in services.values() {
                accounts.register(Arc::new(service.clone()));
            }
        } else {
            services.clear();
        }
        Self {
            directory,
            accounts,
            services: Arc::new(Mutex::new(services)),
            cancelled: Default::default(),
            adding: Default::default(),
            writable: loaded.is_ok(),
        }
    }
    pub(crate) async fn add(
        &self,
        org: String,
        token: String,
        request_id: String,
    ) -> Result<String, AppError> {
        let token = zeroize::Zeroizing::new(token);
        let owner = self.clone();
        // Finish catalog registration even if IPC loses its receipt after the
        // secure-store worker commits. Cancellation remains explicit.
        tokio::spawn(async move { owner.add_inner(org, token, request_id).await })
            .await
            .map_err(|_| failure(AppErrorCode::SecureStorageUnavailable))?
    }
    async fn add_inner(
        &self,
        raw_org: String,
        token: zeroize::Zeroizing<String>,
        request_id: String,
    ) -> Result<String, AppError> {
        let org = organization(&raw_org)?;
        if !self.writable {
            return Err(failure(AppErrorCode::SecureStorageUnavailable));
        }
        let _adding = self
            .adding
            .try_lock()
            .map_err(|_| failure(AppErrorCode::CloneOperationBusy))?;
        if request_id.is_empty()
            || request_id.len() > 64
            || !request_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(failure(AppErrorCode::InvalidSelection));
        }
        // Cancelled or malformed requests must not evict a saved organization
        // merely because capacity planning runs before token verification.
        if self
            .cancelled
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&request_id)
        {
            return Err(failure(AppErrorCode::OperationCancelled));
        }
        let service = {
            let mut services = self.services.lock().unwrap_or_else(|e| e.into_inner());
            if !services.contains_key(&org) && services.len() >= 8 {
                let mut unused = None;
                for (name, service) in services.iter() {
                    if !service.has_saved_tokens() && !self.accounts.has_bindings(service.id())? {
                        unused = Some(name.clone());
                        break;
                    }
                }
                let unused = unused.ok_or_else(|| failure(AppErrorCode::InvalidSelection))?;
                std::fs::remove_file(self.directory.join(format!("org-{unused}.json")))
                    .map_err(|_| failure(AppErrorCode::SecureStorageUnavailable))?;
                if let Some(removed) = services.remove(&unused) {
                    self.accounts.unregister(removed.id());
                }
            }
            let service = services
                .entry(org.clone())
                .or_insert_with(|| {
                    HostingAccessService::azure(
                        &org,
                        self.directory.join(format!("org-{org}.json")),
                    )
                })
                .clone();
            if self
                .cancelled
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&request_id)
            {
                service.cancel(&request_id);
            }
            service
        };
        let result = service.add(token.to_string(), request_id).await;
        if result.is_ok() {
            self.accounts.register(Arc::new(service));
        } else if !service.has_saved_tokens()
            && !self.directory.join(format!("org-{org}.json")).exists()
        {
            self.services
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&org);
        }
        result
    }
    pub(crate) fn cancel(&self, request_id: &str) {
        if request_id.len() > 64
            || request_id.is_empty()
            || !request_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return;
        }
        let services = self.services.lock().unwrap_or_else(|e| e.into_inner());
        for service in services.values() {
            service.cancel(request_id);
        }
        let mut cancelled = self.cancelled.lock().unwrap_or_else(|e| e.into_inner());
        if cancelled.len() >= 64 {
            cancelled.pop_first();
        }
        cancelled.insert(request_id.to_owned());
    }
    pub(crate) fn remove(&self, account_id: &str) -> Result<(), AppError> {
        let _adding = self
            .adding
            .try_lock()
            .map_err(|_| failure(AppErrorCode::CloneOperationBusy))?;
        let service = self
            .services
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values()
            .find(|service| account_id.starts_with(&format!("{}:", service.id())))
            .cloned()
            .ok_or_else(|| failure(AppErrorCode::InvalidSelection))?;
        // Keep the instance so bound projects can see their unavailable choice
        // and explicitly switch back to existing Git access, even after restart.
        service.remove(account_id)
    }
}

pub(crate) fn helper(account_id: &str, context: &str) -> Result<Arc<dyn AccessProvider>, ()> {
    let org = context.strip_prefix("dev.azure.com/").ok_or(())?;
    if organization(org).ok().as_deref() != Some(org)
        || crate::credentials::split_account(account_id).map(|(id, _)| id.to_owned())
            != Some(instance_id(org))
    {
        return Err(());
    }
    Ok(Arc::new(HostingAccessService::azure(org, PathBuf::new())))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn capacity_cleanup_retains_empty_bound_organizations_and_windows_device_names() {
        let root = PathBuf::from(crate::test_support::unique_temp_dir("azure-capacity"));
        let dir = root.join("azure-organizations");
        std::fs::create_dir_all(&dir).unwrap();
        for org in ["con", "one", "two", "three", "four", "five", "six", "seven"] {
            std::fs::write(
                dir.join(format!("org-{org}.json")),
                r#"{"version":1,"logins":[],"usernames":{}}"#,
            )
            .unwrap();
        }
        let id = instance_id("con");
        let preferences = root.join("selections.json");
        let mut bindings = BTreeMap::new();
        bindings.insert(
            id.clone(),
            format!("{id}:token.11111111-1111-1111-1111-111111111111"),
        );
        let mut projects = BTreeMap::new();
        projects.insert("00".repeat(32), bindings);
        std::fs::write(
            &preferences,
            serde_json::to_vec(&serde_json::json!({ "version": 1, "projects": projects })).unwrap(),
        )
        .unwrap();
        let accounts = Arc::new(AccountService::new(preferences.clone(), vec![]));
        let registry = AzureOrganizations::load(root.clone(), accounts.clone());
        assert_eq!(accounts.providers().len(), 8);
        assert!(accounts.has_bindings(&id).unwrap());
        registry.cancel("cancelled_at_capacity");
        for (request, expected) in [
            ("cancelled_at_capacity", AppErrorCode::OperationCancelled),
            ("invalid request", AppErrorCode::InvalidSelection),
        ] {
            assert_eq!(
                registry
                    .add("new".into(), "fixture-token-123456".into(), request.into())
                    .await
                    .unwrap_err()
                    .code,
                expected
            );
            assert_eq!(accounts.providers().len(), 8);
            assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 8);
        }
        // A deliberately invalid fixture token stops before any network/store
        // access, after capacity planning has considered the empty instances.
        assert_eq!(
            registry
                .add("new".into(), "short".into(), "capacity_try".into())
                .await
                .unwrap_err()
                .code,
            AppErrorCode::AuthenticationFailed
        );
        assert!(dir.join("org-con.json").exists());
        assert_eq!(accounts.providers().len(), 7);
        let restarted = Arc::new(AccountService::new(preferences, vec![]));
        let _registry = AzureOrganizations::load(root, restarted.clone());
        assert_eq!(restarted.providers().len(), 7);
        assert!(restarted
            .providers()
            .iter()
            .any(|provider| provider.id() == id));
        assert!(restarted.has_bindings(&id).unwrap());
    }
    #[test]
    fn organization_names_normalize_without_accepting_arbitrary_servers_or_paths() {
        assert_eq!(
            organization(" https://dev.azure.com/Contoso/ ").unwrap(),
            "contoso"
        );
        assert_eq!(organization("Contoso").unwrap(), "contoso");
        for raw in [
            "",
            "-org",
            "org-",
            "org/project",
            "https://evil.invalid/org",
            "org%2fother",
            "org?token=x",
            "org\nother",
        ] {
            assert!(organization(raw).is_err(), "{raw}");
        }
        assert_ne!(instance_id("contoso"), instance_id("other"));
    }
    #[test]
    fn clone_paths_accept_spaces_and_default_projects_but_never_cross_organizations() {
        for path in [
            "contoso/project/_git/repo",
            "contoso/My%20Project/_git/My%20Repo",
            "contoso/_git/repo",
        ] {
            assert!(
                validate_source(&format!("https://dev.azure.com/{path}"), "contoso").is_ok(),
                "{path}"
            );
        }
        for path in [
            "other/project/_git/repo",
            "contoso-other/project/_git/repo",
            "contoso/project/repo",
            "contoso/project/_git/repo/extra",
            "contoso/%2e%2e/_git/repo",
            "contoso/%2fother/_git/repo",
            "contoso/%5cother/_git/repo",
            "contoso/%252fother/_git/repo",
            "contoso/%00/_git/repo",
            "contoso/%zz/_git/repo",
            "contoso/project/_git/repo?token=x",
            "contoso/project/_git/repo#fragment",
        ] {
            assert!(
                validate_source(&format!("https://dev.azure.com/{path}"), "contoso").is_err(),
                "{path}"
            );
        }
        assert!(validate_source("http://dev.azure.com/contoso/_git/repo", "contoso").is_err());
        assert!(validate_source(
            "https://dev.azure.com.evil.invalid/contoso/_git/repo",
            "contoso"
        )
        .is_err());
    }
    #[test]
    fn helper_reconstruction_binds_the_instance_to_the_organization() {
        let id = format!(
            "{}:token.11111111-1111-1111-1111-111111111111",
            instance_id("contoso")
        );
        let service = helper(&id, "dev.azure.com/contoso").ok().unwrap();
        assert_eq!(service.scope_path(), Some("contoso"));
        assert_eq!(service.host(), "dev.azure.com");
        assert!(helper(&id, "dev.azure.com/other").is_err());
        assert!(helper(&id, "dev.azure.com/contoso/project").is_err());
        assert!(helper(&id, "dev.azure.com.evil.invalid/contoso").is_err());
    }
    #[test]
    fn saved_instances_load_with_separate_scopes_and_tampering_blocks_writes() {
        let root = PathBuf::from(crate::test_support::unique_temp_dir("azure-organizations"));
        let dir = root.join("azure-organizations");
        std::fs::create_dir_all(&dir).unwrap();
        for org in ["one", "two"] {
            std::fs::write(
                dir.join(format!("org-{org}.json")),
                r#"{"version":1,"logins":[],"usernames":{}}"#,
            )
            .unwrap();
        }
        let accounts = Arc::new(AccountService::new(root.join("selections.json"), vec![]));
        let registry = AzureOrganizations::load(root.clone(), accounts.clone());
        assert!(registry.writable);
        assert_eq!(accounts.providers().len(), 2);
        std::fs::write(dir.join("INVALID.json"), "{}").unwrap();
        let accounts = Arc::new(AccountService::new(
            root.join("other-selections.json"),
            vec![],
        ));
        let registry = AzureOrganizations::load(root, accounts.clone());
        assert!(!registry.writable);
        assert!(accounts.providers().is_empty());
    }
}

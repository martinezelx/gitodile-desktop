//! Desktop composition of hosting adapters: the public hosts (github.com,
//! gitlab.com and the token-only bitbucket.org), user-added
//! company servers (GitHub Enterprise Server, GitLab Self-Managed) and the
//! internal Git credential helper.
use crate::{
    bitbucket_access::BitbucketAccessService,
    credentials::{self, AccessProvider, AccountCatalog, AccountService},
    error::{AppError, AppErrorCode},
    git::CancellationToken,
    github_access::GitHubAccessService,
    github_auth::{GhAccessProvider, GitHubAuthService, GitHubAuthSnapshot},
    gitlab_access::GitLabAccessService,
    gitlab_auth::{GitLabAuthService, GitLabAuthSnapshot},
    hosting_access::{self, HostingAccessService, ProviderKind, RepositoryPage},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Products whose saved connections the launch sync verifies; each check also
/// covers that product's company servers.
const LAUNCH_SYNC_PRODUCTS: [&str; 3] = ["github", "gitlab", "bitbucket"];
/// Long enough for the window to paint first; the sync is never on that path.
const LAUNCH_SYNC_DELAY: std::time::Duration = std::time::Duration::from_secs(3);

/// Like other desktop Git clients, verify saved connections in the background
/// shortly after launch so they are ready to use without a manual check
/// (ADR 0027): one identity request per saved token and one gh/glab status
/// check per product. Each check runs on its own worker; failures only mark
/// the affected connections, exactly like the Check accounts action.
pub(crate) fn sync_accounts_after_launch(accounts: Arc<AccountService>) {
    let _ = std::thread::Builder::new()
        .name("hosting-launch-sync".into())
        .spawn(move || {
            std::thread::sleep(LAUNCH_SYNC_DELAY);
            for product in LAUNCH_SYNC_PRODUCTS {
                let _ = accounts.check(product);
            }
        });
}

/// One registry serves the desktop catalog and the internal helper process.
pub(crate) fn providers(
    github: GitHubAccessService,
    gitlab: GitLabAccessService,
    bitbucket: BitbucketAccessService,
) -> Vec<Arc<dyn credentials::AccessProvider>> {
    vec![Arc::new(github), Arc::new(gitlab), Arc::new(bitbucket)]
}

/// Returns Some only in helper mode, before Tauri or its WebView starts.
pub fn credential_helper_entry() -> Option<i32> {
    let args = std::env::args_os().collect::<Vec<_>>();
    if args
        .get(1)
        .is_none_or(|a| a != "--gitodile-credential-helper")
    {
        return None;
    }
    let result = match args.len() {
        4 => args[2].to_str().ok_or(()).and_then(|id| {
            credentials::helper(
                &providers(
                    GitHubAccessService::new(GitHubAuthService::default(), Default::default()),
                    GitLabAccessService::new(GitLabAuthService::default(), Default::default()),
                    BitbucketAccessService::new(Default::default()),
                ),
                id,
                &args[3],
                std::io::stdin().lock(),
                std::io::stdout().lock(),
            )
        }),
        // A company server: rebuild its adapter from the authority Git was
        // configured with, and only if that authority derives the same ID.
        5 => match (args[2].to_str(), args[3].to_str()) {
            (Some(id), Some(host)) => helper_server(id, host).and_then(|server| {
                credentials::helper(
                    &[server],
                    id,
                    &args[4],
                    std::io::stdin().lock(),
                    std::io::stdout().lock(),
                )
            }),
            _ => Err(()),
        },
        _ => Err(()),
    };
    if result.is_err() {
        // Stop helper fallback and askpass: an explicitly selected identity
        // must never be replaced with a different user's cached credential.
        let _ = std::io::stdout().lock().write_all(b"quit=true\n\n");
    }
    Some(if result.is_ok() { 0 } else { 1 })
}

fn helper_server(account_id: &str, host: &str) -> Result<Arc<dyn AccessProvider>, ()> {
    let (provider, _) = credentials::split_account(account_id).ok_or(())?;
    let kind = [ProviderKind::GitHub, ProviderKind::GitLab]
        .into_iter()
        .find(|kind| provider.starts_with(id_prefix(*kind)))
        .ok_or(())?;
    if normalize_address(host).ok().as_deref() != Some(host) || server_id(kind, host) != provider {
        return Err(());
    }
    let entry = ServerEntry {
        id: provider.to_owned(),
        kind: kind.name().to_owned(),
        host: host.to_owned(),
    };
    Ok(Arc::new(build(&entry, PathBuf::new()).ok_or(())?.access))
}

const MAX_SERVERS: usize = 8;
const FILE_CAP: u64 = 16 * 1024;

#[derive(Clone, Deserialize, Serialize)]
struct ServerEntry {
    id: String,
    kind: String,
    host: String,
}

#[derive(Deserialize, Serialize)]
struct ServerFile {
    version: u8,
    servers: Vec<ServerEntry>,
}

#[derive(Clone)]
enum ServerCli {
    GitHub(GitHubAuthService),
    GitLab(GitLabAuthService),
}

#[derive(Clone)]
struct Server {
    entry: ServerEntry,
    access: HostingAccessService,
    cli: ServerCli,
}

/// A browser (gh/glab) connection receipt for one company server.
#[derive(Serialize)]
#[serde(untagged)]
pub(crate) enum HostingCliSnapshot {
    GitHub(GitHubAuthSnapshot),
    GitLab(GitLabAuthSnapshot),
}

fn id_prefix(kind: ProviderKind) -> &'static str {
    match kind {
        ProviderKind::GitHub => "ghe-",
        ProviderKind::GitLab => "gls-",
        // Never a company server; `ProviderKind::server_kind` refuses it.
        ProviderKind::Bitbucket => "bbc-",
    }
}

/// Stable, host-derived instance ID. Removing and re-adding a server restores
/// the same ID, so saved project bindings return when their account does.
fn server_id(kind: ProviderKind, host: &str) -> String {
    let digest = Sha256::digest(format!("{}\0{}", kind.name(), host.to_ascii_lowercase()));
    let hex: String = digest.iter().take(5).map(|b| format!("{b:02x}")).collect();
    format!("{}{hex}", id_prefix(kind))
}

fn error(code: AppErrorCode, message: &str) -> AppError {
    AppError::new(code, message)
}

/// `https://host[:port]` with nothing else. Public hosts already have their
/// own sections; GHE.com data residency uses a different API layout.
fn normalize_address(raw: &str) -> Result<String, AppError> {
    let invalid = || {
        error(
            AppErrorCode::InvalidSelection,
            "Enter the server's HTTPS address, such as https://git.example.com.",
        )
    };
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 300 || raw.chars().any(|c| c.is_control() || c == '*') {
        return Err(invalid());
    }
    let with_scheme = if raw.contains("://") {
        raw.to_owned()
    } else {
        format!("https://{raw}")
    };
    let url = reqwest::Url::parse(&with_scheme).map_err(|_| invalid())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err(invalid());
    }
    let authority = credentials::authority(&url).ok_or_else(invalid)?;
    let name = credentials::host_name(&authority);
    if ["github.com", "gitlab.com", "ghe.com"]
        .iter()
        .any(|public| name == *public || name.ends_with(&format!(".{public}")))
    {
        return Err(error(
            AppErrorCode::InvalidSelection,
            "GitHub.com, GitLab.com and GHE.com addresses are not company servers.",
        )
        .with_remediation("Use the GitHub or GitLab connections above for those hosts."));
    }
    Ok(authority)
}

fn build(entry: &ServerEntry, path: PathBuf) -> Option<Server> {
    let kind = ProviderKind::server_kind(&entry.kind)?;
    let (cli, adapter): (ServerCli, Arc<dyn AccessProvider>) = match kind {
        ProviderKind::GitHub => {
            let service = GitHubAuthService::for_host(&entry.id, &entry.host);
            (
                ServerCli::GitHub(service.clone()),
                Arc::new(GhAccessProvider(service)),
            )
        }
        ProviderKind::GitLab => {
            let service = GitLabAuthService::for_host(&entry.id, &entry.host);
            (ServerCli::GitLab(service.clone()), Arc::new(service))
        }
        ProviderKind::Bitbucket => return None,
    };
    Some(Server {
        entry: entry.clone(),
        access: HostingAccessService::server(adapter, kind, &entry.id, &entry.host, path),
        cli,
    })
}

struct State {
    servers: BTreeMap<String, Server>,
    // An unreadable file is never overwritten; adding waits for a fix.
    readable: bool,
}

/// User-added company servers. Only explicit actions contact them.
#[derive(Clone)]
pub(crate) struct HostingServers {
    state: Arc<Mutex<State>>,
    directory: PathBuf,
    accounts: Arc<AccountService>,
    requests: Arc<Mutex<BTreeMap<String, CancellationToken>>>,
}

impl HostingServers {
    pub(crate) fn load(directory: PathBuf, accounts: Arc<AccountService>) -> Self {
        let file = directory.join("hosting-servers.json");
        let parsed = match fs::File::open(&file) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Some(Vec::new()),
            Err(_) => None,
            Ok(handle) => {
                let mut bytes = Vec::new();
                handle
                    .take(FILE_CAP + 1)
                    .read_to_end(&mut bytes)
                    .ok()
                    .filter(|_| bytes.len() as u64 <= FILE_CAP)
                    .and_then(|_| serde_json::from_slice::<ServerFile>(&bytes).ok())
                    .filter(|file| file.version == 1 && file.servers.len() <= MAX_SERVERS)
                    .filter(|file| {
                        file.servers.iter().all(|entry| {
                            ProviderKind::server_kind(&entry.kind).is_some_and(|kind| {
                                normalize_address(&entry.host).ok().as_deref()
                                    == Some(entry.host.as_str())
                                    && server_id(kind, &entry.host) == entry.id
                            })
                        })
                    })
                    .map(|file| file.servers)
            }
        };
        let mut servers = BTreeMap::new();
        for entry in parsed.iter().flatten() {
            if let Some(server) = build(entry, token_path(&directory, &entry.id)) {
                accounts.register(Arc::new(server.access.clone()));
                servers.insert(entry.id.clone(), server);
            }
        }
        Self {
            state: Arc::new(Mutex::new(State {
                servers,
                readable: parsed.is_some(),
            })),
            directory,
            accounts,
            requests: Arc::default(),
        }
    }

    fn persist(&self, servers: &BTreeMap<String, Server>) -> Result<(), AppError> {
        let failure = || {
            error(
                AppErrorCode::SecureStorageUnavailable,
                "The company server list could not be saved.",
            )
        };
        let file = ServerFile {
            version: 1,
            servers: servers.values().map(|s| s.entry.clone()).collect(),
        };
        fs::create_dir_all(&self.directory).map_err(|_| failure())?;
        let path = self.directory.join("hosting-servers.json");
        let temporary = path.with_extension("new");
        fs::write(
            &temporary,
            serde_json::to_vec(&file).map_err(|_| failure())?,
        )
        .and_then(|_| fs::rename(&temporary, &path))
        .map_err(|_| failure())
    }

    fn server(&self, id: &str) -> Result<Server, AppError> {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .servers
            .get(id)
            .cloned()
            .ok_or_else(|| {
                error(
                    AppErrorCode::InvalidSelection,
                    "That company server is no longer configured.",
                )
            })
    }

    fn server_for_account(&self, account_id: &str) -> Result<Server, AppError> {
        let (provider, _) = credentials::split_account(account_id).ok_or_else(|| {
            error(
                AppErrorCode::InvalidSelection,
                "Choose a supported connection.",
            )
        })?;
        self.server(provider)
    }

    /// Identify, then save and register a company server.
    pub(crate) async fn add(
        &self,
        kind: String,
        address: String,
        request_id: String,
    ) -> Result<AccountCatalog, AppError> {
        let kind = ProviderKind::server_kind(&kind)
            .ok_or_else(|| error(AppErrorCode::InvalidSelection, "Choose GitHub or GitLab."))?;
        let host = normalize_address(&address)?;
        let id = server_id(kind, &host);
        self.admit(&id)?;
        if request_id.is_empty()
            || request_id.len() > 64
            || !request_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(error(AppErrorCode::InvalidSelection, "Invalid request."));
        }
        let cancellation = CancellationToken::default();
        {
            let mut requests = self.requests.lock().unwrap_or_else(|e| e.into_inner());
            if requests.len() >= 4 || requests.contains_key(&request_id) {
                return Err(error(
                    AppErrorCode::CloneOperationBusy,
                    "A server check is running.",
                ));
            }
            requests.insert(request_id.clone(), cancellation.clone());
        }
        let _activity = crate::application::begin_background_activity_with_cancellation(
            "add_hosting_server",
            cancellation.clone(),
        );
        // Release the request even if this future is dropped mid-probe (a
        // closed window), so abandoned checks never fill the request limit.
        struct Release<'a>(&'a Mutex<BTreeMap<String, CancellationToken>>, String);
        impl Drop for Release<'_> {
            fn drop(&mut self) {
                self.0
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&self.1);
            }
        }
        let release = Release(&self.requests, request_id);
        let probe = hosting_access::probe_server(kind, &host, &cancellation).await;
        drop(release);
        probe?;
        if cancellation.is_cancelled() {
            return Err(error(AppErrorCode::OperationCancelled, "Cancelled."));
        }
        let entry = ServerEntry {
            id: id.clone(),
            kind: kind.name().to_owned(),
            host,
        };
        let server = build(&entry, token_path(&self.directory, &id))
            .ok_or_else(|| error(AppErrorCode::InvalidSelection, "Choose GitHub or GitLab."))?;
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        Self::admit_locked(&state, &id)?;
        let mut next = state.servers.clone();
        next.insert(id.clone(), server.clone());
        self.persist(&next)?;
        state.servers = next;
        drop(state);
        self.accounts.register(Arc::new(server.access));
        Ok(self.accounts.catalog())
    }

    fn admit(&self, id: &str) -> Result<(), AppError> {
        Self::admit_locked(&self.state.lock().unwrap_or_else(|e| e.into_inner()), id)
    }

    fn admit_locked(state: &State, id: &str) -> Result<(), AppError> {
        if !state.readable {
            return Err(error(
                AppErrorCode::SecureStorageUnavailable,
                "The saved company server list could not be read.",
            ));
        }
        if state.servers.contains_key(id) {
            return Err(error(
                AppErrorCode::StalePreview,
                "That server is already added.",
            ));
        }
        if state.servers.len() >= MAX_SERVERS {
            return Err(error(
                AppErrorCode::InvalidSelection,
                "Remove a company server before adding another.",
            ));
        }
        Ok(())
    }

    /// Delete its saved tokens, then forget the server. gh/glab sessions on
    /// that host belong to those tools and stay untouched; project bindings
    /// stay saved and unavailable until the same server and account return.
    pub(crate) fn remove(&self, id: &str) -> Result<AccountCatalog, AppError> {
        let server = self.server(id)?;
        server.access.forget_tokens()?;
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let mut next = state.servers.clone();
        next.remove(id);
        self.persist(&next)?;
        state.servers = next;
        drop(state);
        self.accounts.unregister(id);
        Ok(self.accounts.catalog())
    }

    pub(crate) fn cancel(&self, request_id: &str) {
        if let Some(token) = self
            .requests
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(request_id)
        {
            token.cancel();
        }
        let servers = self
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .servers
            .clone();
        for server in servers.values() {
            server.access.cancel(request_id);
        }
    }

    pub(crate) async fn add_token(
        &self,
        provider: &str,
        token: String,
        request_id: String,
    ) -> Result<String, AppError> {
        self.server(provider)?.access.add(token, request_id).await
    }

    pub(crate) fn remove_token(&self, account_id: &str) -> Result<(), AppError> {
        self.server_for_account(account_id)?
            .access
            .remove(account_id)
    }

    pub(crate) async fn repositories(
        &self,
        account_id: String,
        page: u32,
        request_id: String,
    ) -> Result<RepositoryPage, AppError> {
        let server = self.server_for_account(&account_id)?;
        server
            .access
            .repositories(account_id, page, request_id)
            .await
    }

    pub(crate) fn cli(
        &self,
        provider: &str,
        action: CliAction,
    ) -> Result<HostingCliSnapshot, AppError> {
        Ok(match (self.server(provider)?.cli, action) {
            (ServerCli::GitHub(service), CliAction::Read) => {
                HostingCliSnapshot::GitHub(service.snapshot())
            }
            (ServerCli::GitHub(service), CliAction::Check) => {
                HostingCliSnapshot::GitHub(service.check())
            }
            (ServerCli::GitHub(service), CliAction::Login) => {
                HostingCliSnapshot::GitHub(service.login())
            }
            (ServerCli::GitHub(service), CliAction::Logout(login)) => {
                HostingCliSnapshot::GitHub(service.logout(login))
            }
            (ServerCli::GitHub(service), CliAction::Cancel(id)) => {
                HostingCliSnapshot::GitHub(service.cancel(&id))
            }
            (ServerCli::GitLab(service), CliAction::Read) => {
                HostingCliSnapshot::GitLab(service.snapshot())
            }
            (ServerCli::GitLab(service), CliAction::Check) => {
                HostingCliSnapshot::GitLab(service.check_state())
            }
            (ServerCli::GitLab(service), CliAction::Login) => {
                HostingCliSnapshot::GitLab(service.login())
            }
            (ServerCli::GitLab(service), CliAction::Logout(account)) => {
                HostingCliSnapshot::GitLab(service.logout(account))
            }
            (ServerCli::GitLab(service), CliAction::Cancel(id)) => {
                HostingCliSnapshot::GitLab(service.cancel(&id))
            }
        })
    }
}

impl HostingServers {
    /// gh's device authorization page on a GitHub Enterprise Server, derived
    /// from the registered host rather than from gh's output.
    pub(crate) fn open_device_page(&self, provider: &str) -> Result<(), AppError> {
        let server = self.server(provider)?;
        if !matches!(server.cli, ServerCli::GitHub(_)) {
            return Err(error(
                AppErrorCode::InvalidSelection,
                "This server has no device sign-in page.",
            ));
        }
        crate::desktop::open_derived_url(&format!("https://{}/login/device", server.entry.host))
    }
}

pub(crate) enum CliAction {
    Read,
    Check,
    Login,
    Logout(String),
    Cancel(String),
}

fn token_path(directory: &std::path::Path, id: &str) -> PathBuf {
    directory.join("hosting").join(format!("{id}-tokens.json"))
}

/// Dispatch only registered providers; malformed IDs never reach credentials.
pub(crate) async fn repositories(
    github: &GitHubAccessService,
    gitlab: &GitLabAccessService,
    bitbucket: &BitbucketAccessService,
    servers: &HostingServers,
    account_id: String,
    page: u32,
    request_id: String,
) -> Result<RepositoryPage, AppError> {
    match credentials::split_account(&account_id).map(|(provider, _)| provider) {
        Some("github") => github.repositories(account_id, page, request_id).await,
        Some("gitlab") => gitlab.repositories(account_id, page, request_id).await,
        Some("bitbucket") => bitbucket.repositories(account_id, page, request_id).await,
        _ => servers.repositories(account_id, page, request_id).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_launch_sync_covers_every_registered_product() {
        let registered = providers(
            GitHubAccessService::new(GitHubAuthService::default(), Default::default()),
            GitLabAccessService::new(GitLabAuthService::default(), Default::default()),
            BitbucketAccessService::new(Default::default()),
        )
        .iter()
        .map(|provider| provider.kind())
        .collect::<Vec<_>>();
        assert_eq!(registered, LAUNCH_SYNC_PRODUCTS);
    }

    #[test]
    fn addresses_normalize_to_one_https_authority_and_refuse_public_hosts() {
        for (raw, host) in [
            ("git.example.com", "git.example.com"),
            ("https://GIT.Example.com/", "git.example.com"),
            ("https://git.example.com:443", "git.example.com"),
            ("https://git.example.com:8443", "git.example.com:8443"),
            (" https://10.0.0.5 ", "10.0.0.5"),
        ] {
            assert_eq!(normalize_address(raw).unwrap(), host, "{raw}");
        }
        for raw in [
            "",
            "http://git.example.com",
            "https://user@git.example.com",
            "https://git.example.com/gitlab",
            "https://git.example.com/?q=1",
            "https://git.example.com/#x",
            "https://*.example.com",
            "https://github.com",
            "https://api.github.com",
            "gitlab.com",
            "https://octo.ghe.com",
            "ssh://git.example.com",
        ] {
            assert!(normalize_address(raw).is_err(), "{raw}");
        }
    }

    #[test]
    fn instance_ids_are_stable_kind_scoped_and_valid_account_prefixes() {
        let github = server_id(ProviderKind::GitHub, "git.example.com");
        assert_eq!(github, server_id(ProviderKind::GitHub, "GIT.example.com"));
        assert_ne!(github, server_id(ProviderKind::GitLab, "git.example.com"));
        assert_ne!(
            github,
            server_id(ProviderKind::GitHub, "git.example.com:8443")
        );
        assert!(github.starts_with("ghe-") && github.len() == 14);
        let account = format!("{github}:token.octocat");
        assert_eq!(
            credentials::split_account(&account),
            Some((github.as_str(), "token.octocat"))
        );
        assert!(helper_server(&account, "git.example.com").is_ok());
        // An authority that does not derive the ID never builds an adapter.
        assert!(helper_server(&account, "evil.example.com").is_err());
        assert!(helper_server(&account, "git.example.com:8443").is_err());
        let gitlab = server_id(ProviderKind::GitLab, "git.example.com");
        assert!(helper_server(&format!("{gitlab}:cli.42"), "git.example.com").is_ok());
        assert!(helper_server("github:octocat", "github.com").is_err());
    }

    #[test]
    fn unreadable_or_tampered_server_lists_register_nothing_and_refuse_writes() {
        let directory = PathBuf::from(crate::test_support::unique_temp_dir(
            "hosting-servers-tampered",
        ));
        fs::create_dir_all(&directory).unwrap();
        let accounts = Arc::new(AccountService::new(
            directory.join("selections.json"),
            Vec::new(),
        ));
        let entry = |id: &str| {
            format!(
                r#"{{"version":1,"servers":[{{"id":"{id}","kind":"github","host":"git.example.com"}}]}}"#
            )
        };
        fs::write(
            directory.join("hosting-servers.json"),
            entry("ghe-0000000000"),
        )
        .unwrap();
        let servers = HostingServers::load(directory.clone(), accounts.clone());
        assert!(servers.state.lock().unwrap().servers.is_empty());
        assert!(servers.admit("ghe-0123456789").is_err());
        let id = server_id(ProviderKind::GitHub, "git.example.com");
        fs::write(directory.join("hosting-servers.json"), entry(&id)).unwrap();
        let servers = HostingServers::load(directory.clone(), accounts.clone());
        assert_eq!(servers.server(&id).unwrap().entry.host, "git.example.com");
        assert!(!accounts.catalog().providers.is_empty());
        assert!(servers.admit(&id).is_err(), "duplicates are refused");
    }
}

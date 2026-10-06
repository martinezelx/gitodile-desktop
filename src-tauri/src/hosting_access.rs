//! Shared native token storage and bounded provider API lifecycle.
//! Provider-specific identities/endpoints remain explicit; browser sessions
//! stay owned by their CLI. Persisted metadata never contains credentials.
use crate::{
    application,
    credentials::{AccessProvider, Account, Secret},
    error::{AppError, AppErrorCode},
    git::CancellationToken,
    github_auth::{GhAccessProvider, GitHubAuthService},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Read,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use zeroize::Zeroize;

const STORE: &str = "GitOdile/GitHub/token/v1";
const API_ORIGIN: &str = "https://api.github.com";
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum ProviderKind {
    GitHub,
    GitLab,
}
impl ProviderKind {
    fn id(self) -> &'static str {
        match self {
            Self::GitHub => "github",
            Self::GitLab => "gitlab",
        }
    }
    fn host(self) -> &'static str {
        match self {
            Self::GitHub => "github.com",
            Self::GitLab => "gitlab.com",
        }
    }
    fn origin(self) -> &'static str {
        match self {
            Self::GitHub => API_ORIGIN,
            Self::GitLab => "https://gitlab.com/api/v4",
        }
    }
    fn add_command(self) -> &'static str {
        match self {
            Self::GitHub => "add_github_token",
            Self::GitLab => "add_gitlab_token",
        }
    }
    pub(crate) fn from_id(kind: &str) -> Option<Self> {
        match kind {
            "github" => Some(Self::GitHub),
            "gitlab" => Some(Self::GitLab),
            _ => None,
        }
    }
    pub(crate) fn name(self) -> &'static str {
        self.id()
    }
    /// A company server's REST origin; github.com and gitlab.com keep theirs.
    fn server_origin(self, host: &str) -> String {
        match self {
            Self::GitHub => format!("https://{host}/api/v3"),
            Self::GitLab => format!("https://{host}/api/v4"),
        }
    }
    fn repositories_path(self, page: u32) -> String {
        match self {
        Self::GitHub => format!("/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=100&page={page}"),
        Self::GitLab => format!("/projects?membership=true&order_by=last_activity_at&sort=desc&per_page=100&page={page}")
    }
    }
}
fn numeric_id(key: &str) -> bool {
    key.parse::<u64>()
        .is_ok_and(|id| id > 0 && id.to_string() == key)
}
pub(crate) fn gitlab_login_is_valid(login: &str) -> bool {
    !login.is_empty()
        && login.len() <= 255
        && login
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
const TOKEN_PREFIX: &str = "token.";
const MAX_ACCOUNTS: usize = 8;
const BODY_CAP: usize = 2 * 1024 * 1024;

fn error(code: AppErrorCode) -> AppError {
    // Never include raw HTTP, keyring, response body or request errors: those
    // can contain credentials or private repository names.
    AppError::new(code, "Hosting access could not be completed.")
}

/// github.com logins are alphanumeric with hyphens; GitHub Enterprise Server
/// normalizes SAML/LDAP names to longer logins that may contain underscores.
fn login_is_valid(login: &str) -> bool {
    !login.is_empty()
        && login.len() <= 100
        && login
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn token_login(key: &str) -> Option<&str> {
    key.strip_prefix(TOKEN_PREFIX)
        .filter(|login| login_is_valid(login))
}

trait TokenStore: Send + Sync {
    fn get(&self, login: &str) -> Result<Secret, AppError>;
    fn set(&self, login: &str, secret: &Secret) -> Result<(), AppError>;
    fn remove(&self, login: &str) -> Result<(), AppError>;
}

struct OsTokenStore(String);
fn entry(store: &str, login: &str) -> Result<keyring::Entry, AppError> {
    if !login_is_valid(login) {
        return Err(error(AppErrorCode::InvalidSelection));
    }
    keyring::Entry::new(store, &login.to_ascii_lowercase())
        .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))
}
impl TokenStore for OsTokenStore {
    fn get(&self, login: &str) -> Result<Secret, AppError> {
        let bytes = entry(&self.0, login)?.get_secret().map_err(|failure| {
            error(match failure {
                keyring::Error::NoEntry => AppErrorCode::AuthenticationFailed,
                _ => AppErrorCode::SecureStorageUnavailable,
            })
        })?;
        Secret::from_bytes(bytes).ok_or_else(|| error(AppErrorCode::AuthenticationFailed))
    }
    fn set(&self, login: &str, secret: &Secret) -> Result<(), AppError> {
        entry(&self.0, login)?
            .set_secret(secret.bytes())
            .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))
    }
    fn remove(&self, login: &str) -> Result<(), AppError> {
        match entry(&self.0, login)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(error(AppErrorCode::SecureStorageUnavailable)),
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
struct Metadata {
    version: u8,
    logins: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    usernames: BTreeMap<String, String>,
}
struct TokenState {
    metadata: Result<Metadata, ()>,
    verified: BTreeSet<String>,
    // Each saved or removed connection takes a fresh value of this counter.
    // In-flight checks and discovery are fenced per connection, so changing
    // one token never discards or invalidates results for another.
    revision: u64,
    generations: BTreeMap<String, u64>,
    failures: BTreeMap<String, AppErrorCode>,
}
impl TokenState {
    fn generation(&self, login: &str) -> u64 {
        self.generations
            .get(&login.to_ascii_lowercase())
            .copied()
            .unwrap_or(0)
    }
    fn advance(&mut self, login: &str) {
        self.revision += 1;
        let revision = self.revision;
        self.generations
            .insert(login.to_ascii_lowercase(), revision);
    }
}
#[derive(Clone)]
pub(crate) struct HostingAccessService {
    cli: Arc<dyn AccessProvider>,
    kind: ProviderKind,
    id: Arc<str>,
    host: Arc<str>,
    path: PathBuf,
    store: Arc<dyn TokenStore>,
    state: Arc<Mutex<TokenState>>,
    // Serialize storage mutations separately: an OS credential prompt must
    // never hold the short-lived catalog lock used by synchronous cached reads.
    mutations: Arc<Mutex<()>>,
    checking: Arc<AtomicBool>,
    requests: Arc<Mutex<BTreeMap<String, CancellationToken>>>,
    cancelled_requests: Arc<Mutex<BTreeSet<String>>>,
    api_origin: String,
}

impl HostingAccessService {
    pub(crate) fn new(gh: GitHubAuthService, path: PathBuf) -> Self {
        Self::with_store(gh, path, Arc::new(OsTokenStore(STORE.into())))
    }
    /// A company server. Its secure-store namespace and API origin derive from
    /// the exact authority, so the same login on two hosts never shares a secret.
    pub(crate) fn server(
        cli: Arc<dyn AccessProvider>,
        kind: ProviderKind,
        id: &str,
        host: &str,
        path: PathBuf,
    ) -> Self {
        let mut service = Self::configured(
            cli,
            kind,
            path,
            Arc::new(OsTokenStore(server_store(kind, host))),
        );
        service.id = id.into();
        service.host = host.into();
        service.api_origin = kind.server_origin(host);
        service
    }
    /// Delete every token secret saved for a removed company server.
    pub(crate) fn forget_tokens(&self) -> Result<(), AppError> {
        let _mutation = self.mutations.lock().unwrap_or_else(|e| e.into_inner());
        let logins = {
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            state
                .metadata
                .as_ref()
                .map(|m| m.logins.clone())
                .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))?
        };
        for login in &logins {
            self.store.remove(login)?;
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        for login in &logins {
            state.verified.remove(&login.to_ascii_lowercase());
            state.failures.remove(&login.to_ascii_lowercase());
            state.advance(login);
        }
        // The secrets are gone: never list them again, even if removing the
        // metadata file below fails and the server stays registered.
        state.metadata = Ok(Metadata {
            version: 1,
            logins: Vec::new(),
            usernames: BTreeMap::new(),
        });
        drop(state);
        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(error(AppErrorCode::SecureStorageUnavailable)),
        }
    }
    fn with_store(gh: GitHubAuthService, path: PathBuf, store: Arc<dyn TokenStore>) -> Self {
        Self::configured(
            Arc::new(GhAccessProvider(gh)),
            ProviderKind::GitHub,
            path,
            store,
        )
    }
    pub(crate) fn gitlab(glab: crate::gitlab_auth::GitLabAuthService, path: PathBuf) -> Self {
        Self::configured(
            Arc::new(glab),
            ProviderKind::GitLab,
            path,
            Arc::new(OsTokenStore("GitOdile/GitLab.com/token/v1".into())),
        )
    }
    fn configured(
        cli: Arc<dyn AccessProvider>,
        kind: ProviderKind,
        path: PathBuf,
        store: Arc<dyn TokenStore>,
    ) -> Self {
        let metadata = match fs::File::open(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Metadata {
                version: 1,
                logins: vec![],
                usernames: BTreeMap::new(),
            }),
            Err(_) => Err(()),
            Ok(file) => {
                let mut bytes = Vec::new();
                file.take(8193)
                    .read_to_end(&mut bytes)
                    .map_err(|_| ())
                    .and_then(|_| {
                        if bytes.len() > 8192 {
                            return Err(());
                        }
                        let metadata: Metadata = serde_json::from_slice(&bytes).map_err(|_| ())?;
                        if metadata.version != 1
                            || metadata.logins.len() > MAX_ACCOUNTS
                            || (kind == ProviderKind::GitLab
                                && metadata.logins.iter().any(|key| {
                                    !numeric_id(key)
                                        || !metadata
                                            .usernames
                                            .get(key)
                                            .is_some_and(|name| gitlab_login_is_valid(name))
                                }))
                            || metadata.logins.iter().any(|login| !login_is_valid(login))
                            || metadata
                                .logins
                                .iter()
                                .map(|login| login.to_ascii_lowercase())
                                .collect::<BTreeSet<_>>()
                                .len()
                                != metadata.logins.len()
                        {
                            return Err(());
                        }
                        Ok(metadata)
                    })
            }
        };
        Self {
            cli,
            kind,
            id: kind.id().into(),
            host: kind.host().into(),
            path,
            store,
            state: Arc::new(Mutex::new(TokenState {
                metadata,
                verified: BTreeSet::new(),
                revision: 0,
                generations: BTreeMap::new(),
                failures: BTreeMap::new(),
            })),
            checking: Arc::new(AtomicBool::new(false)),
            mutations: Arc::new(Mutex::new(())),
            requests: Arc::new(Mutex::new(BTreeMap::new())),
            cancelled_requests: Arc::new(Mutex::new(BTreeSet::new())),
            api_origin: kind.origin().into(),
        }
    }
    fn persist(&self, metadata: &Metadata) -> Result<(), AppError> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| error(AppErrorCode::SecureStorageUnavailable))?;
        fs::create_dir_all(parent).map_err(|_| error(AppErrorCode::SecureStorageUnavailable))?;
        let temporary = self.path.with_extension("new");
        fs::write(
            &temporary,
            serde_json::to_vec(metadata)
                .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))?,
        )
        .and_then(|_| fs::rename(&temporary, &self.path))
        .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))
    }
    /// Keep a GitLab rename found by a check across restarts. Serialized with
    /// token mutations; a failed write only leaves the old display name.
    fn persist_usernames(&self) {
        let _mutation = self.mutations.lock().unwrap_or_else(|e| e.into_inner());
        let next = {
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let Ok(metadata) = &state.metadata else {
                return;
            };
            Metadata {
                version: 1,
                logins: metadata.logins.clone(),
                usernames: metadata.usernames.clone(),
            }
        };
        let _ = self.persist(&next);
    }
    fn save(
        &self,
        login: String,
        secret: &Secret,
        cancellation: &CancellationToken,
    ) -> Result<String, AppError> {
        self.save_named(login, None, secret, cancellation)
    }
    fn save_named(
        &self,
        login: String,
        username: Option<String>,
        secret: &Secret,
        cancellation: &CancellationToken,
    ) -> Result<String, AppError> {
        let _mutation = self.mutations.lock().unwrap_or_else(|e| e.into_inner());
        // Cancellation can arrive while another credential prompt owns the
        // mutation lock. Do not begin a new storage write after that wait.
        if cancellation.is_cancelled() {
            return Err(error(AppErrorCode::OperationCancelled));
        }
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let metadata = state
            .metadata
            .as_ref()
            .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))?;
        if metadata
            .logins
            .iter()
            .any(|saved| saved.eq_ignore_ascii_case(&login))
        {
            return Err(error(AppErrorCode::StalePreview)
                .with_remediation("Remove the existing token connection before replacing it."));
        }
        if metadata.logins.len() >= MAX_ACCOUNTS {
            return Err(error(AppErrorCode::InvalidSelection));
        }
        let mut next = Metadata {
            version: 1,
            logins: metadata.logins.clone(),
            usernames: metadata.usernames.clone(),
        };
        next.logins.push(login.clone());
        if let Some(username) = username {
            next.usernames.insert(login.clone(), username);
        }
        drop(state);
        self.store.set(&login, secret)?;
        if let Err(failure) = self.persist(&next) {
            let _ = self.store.remove(&login);
            return Err(failure);
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.metadata = Ok(next);
        state.advance(&login);
        state.verified.insert(login.to_ascii_lowercase());
        state.failures.remove(&login.to_ascii_lowercase());
        Ok(format!(
            "{}:token.{}",
            self.id(),
            login.to_ascii_lowercase()
        ))
    }
    fn save_identity(
        &self,
        user: User,
        secret: &Secret,
        cancellation: &CancellationToken,
    ) -> Result<String, AppError> {
        let key = user.key(self.kind)?;
        if self.kind == ProviderKind::GitHub {
            return self.save(key, secret, cancellation);
        }
        // Store metadata and secret as one serialized mutation, including numeric identity.
        self.save_named(key, Some(user.login), secret, cancellation)
    }
    pub(crate) fn remove(&self, account_id: &str) -> Result<(), AppError> {
        let key = account_id
            .strip_prefix(&format!("{}:", self.id()))
            .and_then(token_login)
            .ok_or_else(|| error(AppErrorCode::InvalidSelection))?;
        let _mutation = self.mutations.lock().unwrap_or_else(|e| e.into_inner());
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let metadata = state
            .metadata
            .as_ref()
            .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))?;
        if !metadata
            .logins
            .iter()
            .any(|login| login.eq_ignore_ascii_case(key))
        {
            return Err(error(AppErrorCode::InvalidSelection));
        }
        // If metadata replacement fails, keep an unavailable row that can be
        // removed again. Existing project bindings deliberately remain intact.
        let key_to_remove = key;
        let next = Metadata {
            version: 1,
            usernames: metadata
                .usernames
                .iter()
                .filter(|(key, _)| !key.eq_ignore_ascii_case(key_to_remove))
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect(),
            logins: metadata
                .logins
                .iter()
                .filter(|login| !login.eq_ignore_ascii_case(key))
                .cloned()
                .collect(),
        };
        drop(state);
        self.store.remove(key)?;
        state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.verified.remove(&key.to_ascii_lowercase());
        state.failures.remove(&key.to_ascii_lowercase());
        state.advance(key);
        drop(state);
        self.persist(&next)?;
        state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.metadata = Ok(next);
        state.advance(key);
        Ok(())
    }
    fn request(&self, id: &str, command: &'static str) -> Result<Arc<Request>, AppError> {
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(error(AppErrorCode::InvalidSelection));
        }
        let mut requests = self.requests.lock().unwrap_or_else(|e| e.into_inner());
        if self
            .cancelled_requests
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(id)
        {
            return Err(error(AppErrorCode::OperationCancelled));
        }
        if requests.contains_key(id) || requests.len() >= 16 {
            return Err(error(AppErrorCode::CloneOperationBusy));
        }
        let cancellation = CancellationToken::default();
        requests.insert(id.to_owned(), cancellation.clone());
        drop(requests);
        let activity =
            application::begin_background_activity_with_cancellation(command, cancellation.clone());
        Ok(Arc::new(Request {
            id: id.to_owned(),
            requests: self.requests.clone(),
            cancellation,
            _activity: activity,
        }))
    }
    pub(crate) fn cancel(&self, id: &str) {
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return;
        }
        let requests = self.requests.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(token) = requests.get(id) {
            token.cancel();
        } else {
            // A cancellation IPC can beat scheduling of the original async
            // request. Keep bounded tombstones so that request cannot start.
            let mut cancelled = self
                .cancelled_requests
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if cancelled.len() >= 64 {
                cancelled.pop_first();
            }
            cancelled.insert(id.to_owned());
        }
    }
    pub(crate) async fn add(&self, token: String, request_id: String) -> Result<String, AppError> {
        let secret = Secret::from_bytes(token.into_bytes())
            .ok_or_else(|| error(AppErrorCode::AuthenticationFailed))?;
        let command = if self.is_server() {
            "add_hosting_token"
        } else {
            self.kind.add_command()
        };
        let request = self.request(&request_id, command)?;
        let user = user(self.kind, &self.api_origin, &secret, &request.cancellation).await?;
        request.ensure_active()?;
        let service = self.clone();
        // Keychain prompts/storage are synchronous and must not block the async executor.
        tokio::task::spawn_blocking(move || {
            // Keep admission until the synchronous storage worker ends, even
            // if its waiting IPC future is abandoned during a window close.
            request.ensure_active()?;
            service.save_identity(user, &secret, &request.cancellation)
        })
        .await
        .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))?
    }
    pub(crate) async fn repositories(
        &self,
        account_id: String,
        page: u32,
        request_id: String,
    ) -> Result<RepositoryPage, AppError> {
        if !(1..=1000).contains(&page) {
            return Err(error(AppErrorCode::InvalidSelection));
        }
        let request = self.request(&request_id, "list_hosting_repositories")?;
        let key = account_id
            .strip_prefix(&format!("{}:", self.id()))
            .ok_or_else(|| error(AppErrorCode::InvalidSelection))?;
        let expected = self
            .identity_key(key)
            .ok_or_else(|| error(AppErrorCode::InvalidSelection))?;
        let revision = token_login(key).map(|login| {
            self.state
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .generation(login)
        });
        if !self
            .accounts()
            .iter()
            .any(|a| a.id == account_id && a.available)
        {
            return Err(error(AppErrorCode::AuthenticationFailed));
        }
        let adapter = self.clone();
        let credential_key = key.to_owned();
        let worker_request = request.clone();
        let secret = tokio::task::spawn_blocking(move || {
            worker_request.ensure_active()?;
            adapter.api_credential(&credential_key)
        })
        .await
        .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))?;
        let secret = match secret {
            Ok(secret) => secret,
            Err(failure) => {
                self.record_failure(key, failure.code.clone(), revision);
                return Err(failure);
            }
        };
        self.ensure_revision(key, revision)?;
        let result = async {
            let identity =
                user(self.kind, &self.api_origin, &secret, &request.cancellation).await?;
            if !identity.key(self.kind)?.eq_ignore_ascii_case(&expected) {
                return Err(error(AppErrorCode::AuthenticationFailed));
            }
            let path = self.kind.repositories_path(page);
            let (bytes, next) =
                get(&self.api_origin, &path, &secret, &request.cancellation).await?;
            let repositories = match self.kind {
                ProviderKind::GitHub => parse_repositories(&bytes, &self.host)?,
                ProviderKind::GitLab => parse_gitlab_repositories(&bytes, &self.host)?,
            };
            request.ensure_active()?;
            self.ensure_revision(key, revision)?;
            Ok(RepositoryPage {
                account_id: account_id.clone(),
                page,
                repositories,
                next_page: (next && page < 1000).then_some(page + 1),
            })
        }
        .await;
        if result
            .as_ref()
            .is_err_and(|e| e.code == AppErrorCode::AuthenticationFailed)
        {
            self.record_failure(key, AppErrorCode::AuthenticationFailed, revision);
        }
        result
    }
    fn ensure_revision(&self, key: &str, revision: Option<u64>) -> Result<(), AppError> {
        let Some(login) = token_login(key) else {
            return Ok(());
        };
        if revision.is_some_and(|revision| {
            self.state
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .generation(login)
                != revision
        }) {
            Err(error(AppErrorCode::AuthenticationFailed))
        } else {
            Ok(())
        }
    }
    fn record_failure(&self, key: &str, code: AppErrorCode, revision: Option<u64>) {
        // A failed gh connection must never invalidate the independent token
        // connection for the same person. gh owns its own verification state.
        let Some(login) = token_login(key) else {
            return;
        };
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if revision.is_some_and(|revision| state.generation(login) != revision) {
            return;
        }
        state.verified.remove(&login.to_ascii_lowercase());
        state.failures.insert(login.to_ascii_lowercase(), code);
    }
    fn identity_key(&self, key: &str) -> Option<String> {
        let login = if key.starts_with(TOKEN_PREFIX) {
            token_login(key)?
        } else if self.kind == ProviderKind::GitLab {
            key.strip_prefix("cli.")?
        } else {
            key
        };
        (if self.kind == ProviderKind::GitLab {
            numeric_id(login)
        } else {
            login_is_valid(login)
        })
        .then(|| login.to_owned())
    }
    fn api_credential(&self, key: &str) -> Result<Secret, AppError> {
        if key.starts_with(TOKEN_PREFIX) {
            self.store
                .get(token_login(key).ok_or_else(|| error(AppErrorCode::InvalidSelection))?)
        } else {
            self.cli
                .credential(key)
                .ok_or_else(|| error(AppErrorCode::AuthenticationFailed))
        }
    }
}

impl AccessProvider for HostingAccessService {
    fn id(&self) -> &str {
        &self.id
    }
    fn host(&self) -> &str {
        &self.host
    }
    fn kind(&self) -> &'static str {
        self.kind.id()
    }
    fn accounts(&self) -> Vec<Account> {
        let mut accounts = self.cli.accounts();
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Ok(metadata) = &state.metadata {
            accounts.extend(metadata.logins.iter().map(|login| {
                Account {
                    id: format!("{}:token.{}", self.id(), login.to_ascii_lowercase()),
                    provider: self.id().into(),
                    host: self.host().into(),
                    login: state
                        .metadata
                        .as_ref()
                        .ok()
                        .and_then(|m| m.usernames.get(login))
                        .cloned()
                        .unwrap_or_else(|| login.clone()),
                    avatar_data_url: None,
                    // A verified connection stays usable while a background
                    // check runs; its result replaces this state when it lands.
                    available: state.verified.contains(&login.to_ascii_lowercase()),
                    unavailable_reason: state.failures.get(&login.to_ascii_lowercase()).cloned(),
                }
            }));
        }
        accounts
    }
    fn busy(&self) -> bool {
        self.cli.busy() || self.checking.load(Ordering::Acquire)
    }
    fn check(&self) {
        self.cli.check();
        if self.checking.swap(true, Ordering::AcqRel) {
            return;
        }
        let service = self.clone();
        let checking = self.checking.clone();
        if std::thread::Builder::new()
            .name(format!("{}-token-check", self.id()))
            .spawn(move || {
                struct CheckGuard(Arc<AtomicBool>);
                impl Drop for CheckGuard {
                    fn drop(&mut self) {
                        self.0.store(false, Ordering::Release);
                    }
                }
                let _checking = CheckGuard(service.checking.clone());
                let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                else {
                    return;
                };
                runtime.block_on(async move {
                    let logins = {
                        let state = service.state.lock().unwrap_or_else(|e| e.into_inner());
                        state
                            .metadata
                            .as_ref()
                            .map(|m| m.logins.clone())
                            .unwrap_or_default()
                            .into_iter()
                            .map(|login| {
                                let generation = state.generation(&login);
                                (login, generation)
                            })
                            .collect::<Vec<_>>()
                    };
                    let cancellation = CancellationToken::default();
                    let _activity = application::begin_background_activity_with_cancellation(
                        "check_account_catalog",
                        cancellation.clone(),
                    );
                    let mut workers = tokio::task::JoinSet::new();
                    for (login, generation) in logins {
                        let store = service.store.clone();
                        let origin = service.api_origin.clone();
                        let kind = service.kind;
                        let cancellation = cancellation.clone();
                        workers.spawn(async move {
                            let key = login.clone();
                            let secret = tokio::task::spawn_blocking(move || store.get(&key))
                                .await
                                .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))
                                .and_then(|result| result);
                            let verification = match secret {
                                Ok(secret) => user(kind, &origin, &secret, &cancellation)
                                    .await
                                    .and_then(|user| {
                                        if user.key(kind)?.eq_ignore_ascii_case(&login) {
                                            Ok(user.login)
                                        } else {
                                            Err(error(AppErrorCode::AuthenticationFailed))
                                        }
                                    }),
                                Err(failure) => Err(failure),
                            };
                            (login, generation, verification)
                        });
                    }
                    let mut renamed = false;
                    while let Some(result) = workers.join_next().await {
                        let Ok((login, generation, verification)) = result else {
                            continue;
                        };
                        let mut state = service.state.lock().unwrap_or_else(|e| e.into_inner());
                        if state.generation(&login) != generation {
                            continue;
                        }
                        let still_saved = state.metadata.as_ref().is_ok_and(|m| {
                            m.logins
                                .iter()
                                .any(|saved| saved.eq_ignore_ascii_case(&login))
                        });
                        if !still_saved {
                            continue;
                        }
                        let key = login.to_ascii_lowercase();
                        match verification {
                            Ok(username) => {
                                if service.kind == ProviderKind::GitLab {
                                    if let Ok(metadata) = &mut state.metadata {
                                        let previous = metadata
                                            .usernames
                                            .insert(key.clone(), username.clone());
                                        renamed |= previous.as_ref() != Some(&username);
                                    }
                                }
                                state.verified.insert(key.clone());
                                state.failures.remove(&key);
                            }
                            Err(failure) => {
                                state.verified.remove(&key);
                                state.failures.insert(key, failure.code);
                            }
                        }
                    }
                    if renamed {
                        service.persist_usernames();
                    }
                });
            })
            .is_err()
        {
            checking.store(false, Ordering::Release);
        }
    }
    fn username(&self, key: &str) -> Option<String> {
        self.identity_key(key).map(|login| {
            if self.kind == ProviderKind::GitLab {
                "oauth2".into()
            } else {
                login
            }
        })
    }
    fn credential(&self, key: &str) -> Option<Secret> {
        self.identity_key(key)?;
        if key.starts_with(TOKEN_PREFIX) {
            self.store.get(token_login(key)?).ok()
        } else {
            self.cli.credential(key)
        }
    }
}

struct Request {
    id: String,
    requests: Arc<Mutex<BTreeMap<String, CancellationToken>>>,
    cancellation: CancellationToken,
    _activity: application::OperationActivity,
}
impl Request {
    fn ensure_active(&self) -> Result<(), AppError> {
        if self.cancellation.is_cancelled() {
            Err(error(AppErrorCode::OperationCancelled))
        } else {
            Ok(())
        }
    }
}
impl Drop for Request {
    fn drop(&mut self) {
        self.requests
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.id);
    }
}

#[derive(Deserialize)]
pub(crate) struct User {
    #[serde(alias = "username")]
    pub(crate) login: String,
    #[serde(default)]
    pub(crate) id: Option<u64>,
}
impl User {
    fn key(&self, kind: ProviderKind) -> Result<String, AppError> {
        if kind == ProviderKind::GitLab {
            self.id
                .filter(|id| *id > 0)
                .map(|id| id.to_string())
                .ok_or_else(|| error(AppErrorCode::RemoteRejected))
        } else {
            Ok(self.login.clone())
        }
    }
}
async fn user(
    kind: ProviderKind,
    origin: &str,
    secret: &Secret,
    cancellation: &CancellationToken,
) -> Result<User, AppError> {
    let (bytes, _) = get(origin, "/user", secret, cancellation).await?;
    let user: User =
        serde_json::from_slice(&bytes).map_err(|_| error(AppErrorCode::RemoteRejected))?;
    if !(if kind == ProviderKind::GitLab {
        gitlab_login_is_valid(&user.login) && user.id.is_some_and(|id| id > 0)
    } else {
        login_is_valid(&user.login)
    }) {
        return Err(error(AppErrorCode::RemoteRejected));
    }
    Ok(user)
}

fn client() -> Result<reqwest::Client, AppError> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("GitOdile")
        .build()
        .map_err(|_| error(AppErrorCode::Offline))
}

/// Company servers often use a corporate CA. Name a rejected certificate
/// instead of reporting the server as offline; other failures stay coarse.
fn transport_error(failure: reqwest::Error) -> AppError {
    if failure.is_timeout() {
        return error(AppErrorCode::NetworkTimeout);
    }
    let mut source: Option<&dyn std::error::Error> = Some(&failure);
    while let Some(cause) = source {
        let text = cause.to_string().to_ascii_lowercase();
        if text.contains("certificate") || text.contains("unknownissuer") {
            return error(AppErrorCode::CertificateFailed);
        }
        source = cause.source();
    }
    error(AppErrorCode::Offline)
}

/// Oldest company-server versions accepted. Every API GitOdile calls predates
/// them; older servers are long out of vendor support.
const MIN_GITHUB_SERVER: (u32, u32) = (3, 0);
const MIN_GITLAB_SERVER: (u32, u32) = (14, 0);

fn version_at_least(version: &str, minimum: (u32, u32)) -> bool {
    let mut parts = version
        .trim_start_matches(|c: char| !c.is_ascii_digit())
        .split(['.', '-', '+'])
        .map(|part| part.parse::<u32>());
    match (parts.next(), parts.next()) {
        (Some(Ok(major)), Some(Ok(minor))) => (major, minor) >= minimum,
        _ => false,
    }
}

/// Identify a company server before it is saved, without credentials.
/// GitHub Enterprise Server names its version on every API response; GitLab
/// answers its version endpoint, or refuses it in its own JSON shape.
pub(crate) async fn probe_server(
    kind: ProviderKind,
    host: &str,
    cancellation: &CancellationToken,
) -> Result<Option<String>, AppError> {
    probe_origin(kind, &kind.server_origin(host), cancellation).await
}

async fn probe_origin(
    kind: ProviderKind,
    origin: &str,
    cancellation: &CancellationToken,
) -> Result<Option<String>, AppError> {
    let unsupported = || {
        AppError::new(
            AppErrorCode::UnsupportedServer,
            "This address doesn't answer as a supported server of that product.",
        )
    };
    let path = match kind {
        ProviderKind::GitHub => "/meta",
        ProviderKind::GitLab => "/version",
    };
    let url = format!("{origin}{path}");
    let fetch = async {
        let mut response = client()?
            .get(url)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(transport_error)?;
        let status = response.status().as_u16();
        let header_version = response
            .headers()
            .get("x-github-enterprise-version")
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
            if bytes.len() + chunk.len() > 64 * 1024 {
                return Err(unsupported());
            }
            bytes.extend_from_slice(&chunk);
        }
        let body: Option<serde_json::Value> = serde_json::from_slice(&bytes).ok();
        let field = |name: &str| {
            body.as_ref()
                .and_then(|body| body.get(name))
                .and_then(|value| value.as_str())
                .map(str::to_owned)
        };
        let (version, minimum) = match kind {
            ProviderKind::GitHub => (
                header_version.or_else(|| {
                    (status == 200)
                        .then(|| field("installed_version"))
                        .flatten()
                }),
                MIN_GITHUB_SERVER,
            ),
            ProviderKind::GitLab => match status {
                200 => (field("version"), MIN_GITLAB_SERVER),
                // GitLab requires sign-in for its version; its refusal is
                // recognizable, and the version is checked again by tokens.
                401 if field("message").as_deref() == Some("401 Unauthorized") => return Ok(None),
                _ => (None, MIN_GITLAB_SERVER),
            },
        };
        let version = version.ok_or_else(unsupported)?;
        if version.len() > 64 || !version_at_least(&version, minimum) {
            return Err(unsupported().with_remediation(
                "Ask your administrator to update the server, or use its address with Git directly.",
            ));
        }
        Ok(Some(version))
    };
    let cancelled = async {
        while !cancellation.is_cancelled() {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    };
    tokio::select! { result = fetch => result, () = cancelled => Err(error(AppErrorCode::OperationCancelled)) }
}

pub(crate) async fn get(
    origin: &str,
    path: &str,
    secret: &Secret,
    cancellation: &CancellationToken,
) -> Result<(Vec<u8>, bool), AppError> {
    if cancellation.is_cancelled() {
        return Err(error(AppErrorCode::OperationCancelled));
    }
    let client = client()?;
    let mut bearer = b"Bearer ".to_vec();
    bearer.extend_from_slice(secret.bytes());
    let authorization = reqwest::header::HeaderValue::from_bytes(&bearer);
    bearer.zeroize();
    let mut authorization = authorization.map_err(|_| error(AppErrorCode::AuthenticationFailed))?;
    authorization.set_sensitive(true);
    let fetch = async {
        let request = client
            .get(format!("{origin}{path}"))
            .header(reqwest::header::AUTHORIZATION, authorization)
            .header(reqwest::header::ACCEPT, "application/json");
        let request = if origin == API_ORIGIN {
            request
                .header("X-GitHub-Api-Version", "2022-11-28")
                .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        } else {
            request
        };
        let mut response = request.send().await.map_err(transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(error(match status.as_u16() {
                401 => AppErrorCode::AuthenticationFailed,
                429 => AppErrorCode::ProviderRateLimited,
                403 if response.headers().contains_key("retry-after")
                    || response
                        .headers()
                        .get("x-ratelimit-remaining")
                        .is_some_and(|v| v == "0") =>
                {
                    AppErrorCode::ProviderRateLimited
                }
                403 => AppErrorCode::PermissionDenied,
                _ => AppErrorCode::RemoteRejected,
            }));
        }
        let next = response
            .headers()
            .get("link")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|link| link.split(',').any(|part| part.contains("rel=\"next\"")))
            || response
                .headers()
                .get("x-next-page")
                .and_then(|value| value.to_str().ok())
                .is_some_and(numeric_id);
        // We never follow the server's link: a numeric next page is requested
        // against the fixed API origin, so redirects/links cannot leak a token.
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
            if bytes.len().saturating_add(chunk.len()) > BODY_CAP {
                return Err(error(AppErrorCode::RemoteRejected));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok((bytes, next))
    };
    let cancelled = async {
        loop {
            if cancellation.is_cancelled() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    };
    tokio::select! { result = fetch => result, () = cancelled => Err(error(AppErrorCode::OperationCancelled)) }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryPage {
    account_id: String,
    page: u32,
    repositories: Vec<HostedRepository>,
    next_page: Option<u32>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostedRepository {
    id: u64,
    name: String,
    full_name: String,
    owner: String,
    private: bool,
    archived: bool,
    description: Option<String>,
    clone_url: String,
}
#[derive(Deserialize)]
struct ApiOwner {
    login: String,
}
#[derive(Deserialize)]
struct ApiRepository {
    id: u64,
    name: String,
    full_name: String,
    owner: ApiOwner,
    private: bool,
    archived: bool,
    description: Option<String>,
    clone_url: String,
}
/// Descriptions are free display text written in browsers on any platform.
/// Normalize line endings, drop other control characters and bound the length
/// instead of rejecting the page; identity and clone URLs stay strictly checked.
fn display_text(raw: &str) -> Option<String> {
    const LIMIT: usize = 8192;
    let mut text = String::new();
    for c in raw.replace("\r\n", "\n").chars() {
        let c = if c == '\r' { '\n' } else { c };
        if c.is_control() && c != '\n' && c != '\t' {
            continue;
        }
        if text.len() + c.len_utf8() > LIMIT {
            break;
        }
        text.push(c);
    }
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}
fn parse_repositories(bytes: &[u8], host: &str) -> Result<Vec<HostedRepository>, AppError> {
    let rows: Vec<ApiRepository> =
        serde_json::from_slice(bytes).map_err(|_| error(AppErrorCode::RemoteRejected))?;
    if rows.len() > 100 {
        return Err(error(AppErrorCode::RemoteRejected));
    }
    rows.into_iter()
        .map(|row| {
            // Validate the identity and clone URL independently of remote JSON.
            if row.name.is_empty()
                || row.name.len() > 100
                || !row
                    .name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
                || !login_is_valid(&row.owner.login)
                || row.full_name != format!("{}/{}", row.owner.login, row.name)
                || row.clone_url != format!("https://{host}/{}.git", row.full_name)
            {
                return Err(error(AppErrorCode::RemoteRejected));
            }
            Ok(HostedRepository {
                id: row.id,
                name: row.name,
                full_name: row.full_name,
                owner: row.owner.login,
                private: row.private,
                archived: row.archived,
                description: row.description.as_deref().and_then(display_text),
                clone_url: row.clone_url,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpListener;
    #[derive(Default)]
    struct MemoryStore(Mutex<BTreeMap<String, Vec<u8>>>);
    impl TokenStore for MemoryStore {
        fn get(&self, login: &str) -> Result<Secret, AppError> {
            self.0
                .lock()
                .unwrap()
                .get(login)
                .cloned()
                .and_then(Secret::from_bytes)
                .ok_or_else(|| error(AppErrorCode::AuthenticationFailed))
        }
        fn set(&self, login: &str, secret: &Secret) -> Result<(), AppError> {
            self.0
                .lock()
                .unwrap()
                .insert(login.to_owned(), secret.bytes().to_vec());
            Ok(())
        }
        fn remove(&self, login: &str) -> Result<(), AppError> {
            self.0.lock().unwrap().remove(login);
            Ok(())
        }
    }
    #[test]
    fn cached_catalog_reads_do_not_wait_for_a_secure_store_prompt() {
        struct PromptStore {
            entered: std::sync::mpsc::Sender<()>,
            release: Mutex<std::sync::mpsc::Receiver<()>>,
        }
        impl TokenStore for PromptStore {
            fn get(&self, _: &str) -> Result<Secret, AppError> {
                Err(error(AppErrorCode::AuthenticationFailed))
            }
            fn set(&self, _: &str, _: &Secret) -> Result<(), AppError> {
                self.entered.send(()).unwrap();
                self.release.lock().unwrap().recv().unwrap();
                Ok(())
            }
            fn remove(&self, _: &str) -> Result<(), AppError> {
                Ok(())
            }
        }
        let (entered, started) = std::sync::mpsc::channel();
        let (release, gate) = std::sync::mpsc::channel();
        let path = std::env::temp_dir()
            .join(format!("gitodile-prompt-test-{}", std::process::id()))
            .join("accounts.json");
        let service = HostingAccessService::with_store(
            GitHubAuthService::default(),
            path.clone(),
            Arc::new(PromptStore {
                entered,
                release: Mutex::new(gate),
            }),
        );
        let writer = service.clone();
        let worker = std::thread::spawn(move || {
            writer.save(
                "octocat".into(),
                &Secret::from_bytes(b"fixture-token-only-123456".to_vec()).unwrap(),
                &CancellationToken::default(),
            )
        });
        started.recv_timeout(Duration::from_secs(10)).unwrap();
        let reader = service.clone();
        let (finished, receipt) = std::sync::mpsc::channel();
        let reading = std::thread::spawn(move || finished.send(reader.accounts()).unwrap());
        let snapshot = receipt.recv_timeout(Duration::from_secs(1));
        // Always release before asserting so a regression cannot strand workers.
        release.send(()).unwrap();
        worker.join().unwrap().unwrap();
        reading.join().unwrap();
        assert!(snapshot.unwrap().is_empty());
        assert!(service.accounts()[0].available);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn a_cancelled_storage_wait_never_saves_a_token() {
        let path = PathBuf::from(crate::test_support::unique_temp_dir(
            "cancelled-token-write",
        ))
        .join("accounts.json");
        let store = Arc::new(MemoryStore::default());
        let service = HostingAccessService::with_store(
            GitHubAuthService::default(),
            path.clone(),
            store.clone(),
        );
        let cancellation = CancellationToken::default();
        let guard = service.mutations.lock().unwrap();
        let writer = service.clone();
        let worker_cancellation = cancellation.clone();
        let (ready, started) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            assert!(!worker_cancellation.is_cancelled());
            ready.send(()).unwrap();
            writer.save(
                "octocat".into(),
                &Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap(),
                &worker_cancellation,
            )
        });
        started.recv_timeout(Duration::from_secs(10)).unwrap();
        cancellation.cancel();
        drop(guard);
        assert_eq!(
            worker.join().unwrap().unwrap_err().code,
            AppErrorCode::OperationCancelled
        );
        assert!(store.0.lock().unwrap().is_empty());
        assert!(service.accounts().is_empty());
        assert!(!path.exists());
    }
    #[test]
    fn token_source_survives_restart_without_secret_json_or_implicit_verification() {
        let path = std::env::temp_dir()
            .join(format!("gitodile-token-test-{}", std::process::id()))
            .join("accounts.json");
        let store = Arc::new(MemoryStore::default());
        let service = HostingAccessService::with_store(
            GitHubAuthService::default(),
            path.clone(),
            store.clone(),
        );
        let secret = Secret::from_bytes(b"fixture-token-only-123456".to_vec()).unwrap();
        assert_eq!(
            service
                .save("octocat".into(), &secret, &CancellationToken::default())
                .unwrap(),
            "github:token.octocat"
        );
        assert!(service.accounts()[0].available);
        service.record_failure("octocat", AppErrorCode::AuthenticationFailed, None);
        assert!(
            service.accounts()[0].available,
            "gh failures must not invalidate the token source"
        );
        let metadata = fs::read_to_string(&path).unwrap();
        assert!(!metadata.contains("fixture-token"));
        let restored =
            HostingAccessService::with_store(GitHubAuthService::default(), path.clone(), store);
        assert!(!restored.accounts()[0].available);
        assert_eq!(
            restored.username("token.octocat").as_deref(),
            Some("octocat")
        );
        assert!(restored.credential("token.octocat").is_some());
        assert!(restored.credential("token.unknown").is_none());
        assert!(restored
            .save("octocat".into(), &secret, &CancellationToken::default())
            .is_err());
        restored.remove("github:token.octocat").unwrap();
        assert!(restored.credential("token.octocat").is_none());
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn api_parser_refuses_credentials_or_foreign_clone_hosts() {
        let fixture = r#"[{"id":1,"name":"project","full_name":"team/project","owner":{"login":"team"},"private":true,"archived":false,"description":null,"clone_url":"https://github.com/team/project.git"}]"#;
        assert!(parse_repositories(fixture.as_bytes(), "github.com").unwrap()[0].private);
        let described = fixture.replace(
            r#""description":null"#,
            &format!(r#""description":"Notes\r\n{}""#, "x".repeat(9000)),
        );
        let description = parse_repositories(described.as_bytes(), "github.com").unwrap()[0]
            .description
            .clone()
            .unwrap();
        assert!(description.starts_with("Notes\nx") && description.len() == 8192);
        let blank = fixture.replace(r#""description":null"#, r#""description":" \r\n ""#);
        assert!(
            parse_repositories(blank.as_bytes(), "github.com").unwrap()[0]
                .description
                .is_none()
        );
        for replacement in [
            "https://attacker.test/team/project.git",
            "https://token@github.com/team/project.git",
            "http://github.com/team/project.git",
        ] {
            assert!(parse_repositories(
                fixture
                    .replace("https://github.com/team/project.git", replacement)
                    .as_bytes(),
                "github.com"
            )
            .is_err());
        }
        assert!(parse_repositories(
            fixture
                .replace("team/project", "other/project")
                .replacen("other/project", "team/project", 1)
                .as_bytes(),
            "github.com"
        )
        .is_err());
    }

    fn endpoint(
        responses: Vec<(String, String)>,
    ) -> (String, std::thread::JoinHandle<Vec<String>>) {
        gated_endpoint(responses, None)
    }
    fn gated_endpoint(
        responses: Vec<(String, String)>,
        mut gate: Option<(std::sync::mpsc::Sender<()>, std::sync::mpsc::Receiver<()>)>,
    ) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let worker = std::thread::spawn(move || {
            let mut requests = Vec::new();
            for (headers, body) in responses {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut bytes = Vec::new();
                while !bytes.windows(4).any(|part| part == b"\r\n\r\n") {
                    let mut byte = [0];
                    socket.read_exact(&mut byte).unwrap();
                    bytes.push(byte[0]);
                    assert!(bytes.len() < 8192);
                }
                requests.push(String::from_utf8(bytes).unwrap());
                if let Some((entered, release)) = gate.take() {
                    entered.send(()).unwrap();
                    release.recv_timeout(Duration::from_secs(10)).unwrap();
                }
                write!(
                    socket,
                    "HTTP/1.1 {headers}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
            requests
        });
        (origin, worker)
    }
    #[tokio::test]
    async fn discovery_checks_the_exact_identity_before_private_results_and_never_follows_links() {
        let path = std::env::temp_dir()
            .join(format!("gitodile-discovery-{}", std::process::id()))
            .join("accounts.json");
        let store = Arc::new(MemoryStore::default());
        let mut service =
            HostingAccessService::with_store(GitHubAuthService::default(), path.clone(), store);
        let secret = Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap();
        service
            .save("octocat".into(), &secret, &CancellationToken::default())
            .unwrap();
        let (origin, worker) = endpoint(vec![
            ("200 OK".into(), r#"{"login":"octocat"}"#.into()),
            (
                "200 OK\r\nLink: <https://attacker.invalid/leak>; rel=\"next\"".into(),
                "[]".into(),
            ),
        ]);
        service.api_origin = origin;
        let page = service
            .repositories("github:token.octocat".into(), 1, "fixture_list".into())
            .await
            .unwrap();
        assert_eq!(page.next_page, Some(2));
        let requests = worker.join().unwrap();
        assert!(requests[0].starts_with("GET /user "));
        assert!(requests[1].starts_with("GET /user/repos?"));
        assert!(requests[1]
            .to_ascii_lowercase()
            .contains("authorization: bearer fixture-token-1234567"));
        let (origin, worker) = endpoint(vec![("200 OK".into(), r#"{"login":"different"}"#.into())]);
        service.api_origin = origin;
        assert_eq!(
            service
                .repositories("github:token.octocat".into(), 1, "fixture_other".into())
                .await
                .err()
                .unwrap()
                .code,
            AppErrorCode::AuthenticationFailed
        );
        assert_eq!(worker.join().unwrap().len(), 1);
        assert!(!service.accounts()[0].available);
        assert_eq!(
            service.accounts()[0].unavailable_reason,
            Some(AppErrorCode::AuthenticationFailed)
        );
        fs::remove_file(path).unwrap();
    }
    #[tokio::test]
    async fn late_discovery_responses_cannot_use_or_invalidate_a_reconnected_token() {
        for succeeds in [false, true] {
            let path = PathBuf::from(crate::test_support::unique_temp_dir("reconnected-token"))
                .join("accounts.json");
            let mut service = HostingAccessService::with_store(
                GitHubAuthService::default(),
                path.clone(),
                Arc::new(MemoryStore::default()),
            );
            let old = Secret::from_bytes(b"fixture-old-token-123456".to_vec()).unwrap();
            let new = Secret::from_bytes(b"fixture-new-token-123456".to_vec()).unwrap();
            service
                .save("octocat".into(), &old, &CancellationToken::default())
                .unwrap();
            let responses = if succeeds {
                vec![
                    ("200 OK".into(), r#"{"login":"octocat"}"#.into()),
                    ("200 OK".into(), "[]".into()),
                ]
            } else {
                vec![("401 Unauthorized".into(), "{}".into())]
            };
            let (entered, started) = std::sync::mpsc::channel();
            let (release, gate) = std::sync::mpsc::channel();
            let (origin, server) = gated_endpoint(responses, Some((entered, gate)));
            service.api_origin = origin;
            let adapter = service.clone();
            let request = tokio::spawn(async move {
                adapter
                    .repositories("github:token.octocat".into(), 1, "old_request".into())
                    .await
            });
            tokio::task::spawn_blocking(move || {
                started.recv_timeout(Duration::from_secs(10)).unwrap()
            })
            .await
            .unwrap();
            service.remove("github:token.octocat").unwrap();
            service
                .save("octocat".into(), &new, &CancellationToken::default())
                .unwrap();
            release.send(()).unwrap();
            assert_eq!(
                request.await.unwrap().err().unwrap().code,
                AppErrorCode::AuthenticationFailed
            );
            assert!(service.accounts()[0].available);
            assert!(service.accounts()[0].unavailable_reason.is_none());
            assert_eq!(
                service.credential("token.octocat").unwrap().bytes(),
                new.bytes()
            );
            assert_eq!(server.join().unwrap().len(), if succeeds { 2 } else { 1 });
            fs::remove_file(path).unwrap();
        }
    }
    #[tokio::test]
    async fn company_server_probe_identifies_the_product_and_refuses_old_or_foreign_servers() {
        let cancellation = CancellationToken::default();
        let probe = |kind, headers: &str, body: &str| {
            let (origin, worker) = endpoint(vec![(headers.into(), body.into())]);
            (origin, worker, kind)
        };
        let (origin, worker, kind) = probe(
            ProviderKind::GitHub,
            "401 Unauthorized\r\nX-GitHub-Enterprise-Version: 3.16.2",
            r#"{"message":"Must authenticate"}"#,
        );
        assert_eq!(
            probe_origin(kind, &origin, &cancellation)
                .await
                .unwrap()
                .as_deref(),
            Some("3.16.2")
        );
        assert!(worker.join().unwrap()[0].starts_with("GET /meta "));
        let (origin, worker, kind) = probe(
            ProviderKind::GitHub,
            "200 OK",
            r#"{"installed_version":"3.15.0"}"#,
        );
        assert!(probe_origin(kind, &origin, &cancellation).await.is_ok());
        worker.join().unwrap();
        let (origin, worker, kind) = probe(
            ProviderKind::GitLab,
            "401 Unauthorized",
            r#"{"message":"401 Unauthorized"}"#,
        );
        assert_eq!(
            probe_origin(kind, &origin, &cancellation).await.unwrap(),
            None
        );
        assert!(worker.join().unwrap()[0].starts_with("GET /version "));
        let (origin, worker, kind) =
            probe(ProviderKind::GitLab, "200 OK", r#"{"version":"17.4.1-ee"}"#);
        assert!(probe_origin(kind, &origin, &cancellation).await.is_ok());
        worker.join().unwrap();
        for (kind, headers, body) in [
            // A GitLab answering on the GitHub path, a plain web server, and
            // servers older than the supported floor.
            (
                ProviderKind::GitHub,
                "401 Unauthorized",
                r#"{"message":"401 Unauthorized"}"#,
            ),
            (ProviderKind::GitLab, "200 OK", "<html></html>"),
            (
                ProviderKind::GitLab,
                "404 Not Found",
                r#"{"message":"404 Not Found"}"#,
            ),
            (
                ProviderKind::GitHub,
                "200 OK\r\nX-GitHub-Enterprise-Version: 2.22.0",
                "{}",
            ),
            (ProviderKind::GitLab, "200 OK", r#"{"version":"13.12.0"}"#),
        ] {
            let (origin, worker, kind) = probe(kind, headers, body);
            assert_eq!(
                probe_origin(kind, &origin, &cancellation)
                    .await
                    .unwrap_err()
                    .code,
                AppErrorCode::UnsupportedServer,
                "{headers} {body}"
            );
            worker.join().unwrap();
        }
        assert!(version_at_least("3.0.0", MIN_GITHUB_SERVER));
        assert!(version_at_least("v14.0.12-ee", MIN_GITLAB_SERVER));
        assert!(!version_at_least("garbage", MIN_GITLAB_SERVER));
    }

    #[tokio::test]
    async fn company_server_tokens_use_their_own_namespace_origin_and_clone_host() {
        let path =
            PathBuf::from(crate::test_support::unique_temp_dir("ghe-tokens")).join("tokens.json");
        let mut service = HostingAccessService::server(
            Arc::new(GhAccessProvider(GitHubAuthService::for_host(
                "ghe-0123456789",
                "ghe.example.com:8443",
            ))),
            ProviderKind::GitHub,
            "ghe-0123456789",
            "ghe.example.com:8443",
            path.clone(),
        );
        assert_eq!(service.api_origin, "https://ghe.example.com:8443/api/v3");
        assert_eq!(
            server_store(ProviderKind::GitHub, "ghe.example.com:8443"),
            "GitOdile/GitHubEnterprise/ghe.example.com:8443/token/v1"
        );
        service.store = Arc::new(MemoryStore::default());
        let secret = Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap();
        let id = service
            .save("saml_user-1".into(), &secret, &CancellationToken::default())
            .unwrap();
        assert_eq!(id, "ghe-0123456789:token.saml_user-1");
        let account = &service.accounts()[0];
        assert_eq!(
            (account.provider.as_str(), account.host.as_str()),
            ("ghe-0123456789", "ghe.example.com:8443")
        );
        let (origin, worker) = endpoint(vec![
            ("200 OK".into(), r#"{"login":"saml_user-1"}"#.into()),
            (
                "200 OK".into(),
                r#"[{"id":7,"name":"tool","full_name":"corp/tool","owner":{"login":"corp"},"private":true,"archived":false,"description":null,"clone_url":"https://ghe.example.com:8443/corp/tool.git"}]"#.into(),
            ),
        ]);
        service.api_origin = origin;
        let page = service
            .repositories(id.clone(), 1, "fixture_ghe".into())
            .await
            .unwrap();
        assert_eq!(
            page.repositories[0].clone_url,
            "https://ghe.example.com:8443/corp/tool.git"
        );
        let requests = worker.join().unwrap();
        // Only github.com receives its REST version header.
        assert!(!requests[0]
            .to_ascii_lowercase()
            .contains("x-github-api-version"));
        assert!(parse_repositories(
            br#"[{"id":7,"name":"tool","full_name":"corp/tool","owner":{"login":"corp"},"private":true,"archived":false,"description":null,"clone_url":"https://github.com/corp/tool.git"}]"#,
            "ghe.example.com:8443"
        )
        .is_err());
        service.forget_tokens().unwrap();
        assert!(service.credential("token.saml_user-1").is_none());
        assert!(service.accounts().is_empty());
        assert!(!path.exists());
    }

    #[tokio::test]
    async fn transport_maps_rate_limits_denial_and_redirects_without_private_response_details() {
        let secret = Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap();
        for (headers, code) in [
            ("429 Too Many Requests", AppErrorCode::ProviderRateLimited),
            (
                "403 Forbidden\r\nX-RateLimit-Remaining: 0",
                AppErrorCode::ProviderRateLimited,
            ),
            ("403 Forbidden", AppErrorCode::PermissionDenied),
            ("401 Unauthorized", AppErrorCode::AuthenticationFailed),
            (
                "302 Found\r\nLocation: https://attacker.invalid/leak",
                AppErrorCode::RemoteRejected,
            ),
        ] {
            let (origin, worker) =
                endpoint(vec![(headers.into(), "private-response-token".into())]);
            let failure = get(&origin, "/user", &secret, &CancellationToken::default())
                .await
                .unwrap_err();
            assert_eq!(failure.code, code);
            assert!(!serde_json::to_string(&failure)
                .unwrap()
                .contains("private-response-token"));
            assert_eq!(worker.join().unwrap().len(), 1);
        }
        let cancelled = CancellationToken::default();
        cancelled.cancel();
        assert_eq!(
            get("http://127.0.0.1:9", "/user", &secret, &cancelled)
                .await
                .unwrap_err()
                .code,
            AppErrorCode::OperationCancelled
        );
    }
    #[test]
    fn token_helper_keeps_the_account_source_and_emits_the_real_http_username() {
        let path = std::env::temp_dir()
            .join(format!("gitodile-token-helper-{}", std::process::id()))
            .join("accounts.json");
        let service = HostingAccessService::with_store(
            GitHubAuthService::default(),
            path.clone(),
            Arc::new(MemoryStore::default()),
        );
        service
            .save(
                "octocat".into(),
                &Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap(),
                &CancellationToken::default(),
            )
            .unwrap();
        let mut output = Vec::new();
        let providers: Vec<Arc<dyn AccessProvider>> = vec![Arc::new(service.clone())];
        crate::credentials::helper(
            &providers,
            "github:token.octocat",
            std::ffi::OsStr::new("get"),
            &b"protocol=https\nhost=github.com\nusername=octocat\n\n"[..],
            &mut output,
        )
        .unwrap();
        assert!(output.starts_with(b"username=octocat\npassword=fixture-token-1234567"));
        for id in ["github:token.absent", "github:token.octocat"] {
            let mut output = Vec::new();
            assert!(crate::credentials::helper(
                &providers,
                id,
                std::ffi::OsStr::new("get"),
                &b"protocol=https\nhost=github.com\nusername=other\n\n"[..],
                &mut output
            )
            .is_err());
            assert!(output.is_empty());
        }
        service.remove("github:token.octocat").unwrap();
        assert!(service.credential("token.octocat").is_none());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn cancellation_before_registration_and_unavailable_storage_fail_closed() {
        struct UnavailableStore;
        impl TokenStore for UnavailableStore {
            fn get(&self, _: &str) -> Result<Secret, AppError> {
                Err(error(AppErrorCode::SecureStorageUnavailable))
            }
            fn set(&self, _: &str, _: &Secret) -> Result<(), AppError> {
                Err(error(AppErrorCode::SecureStorageUnavailable))
            }
            fn remove(&self, _: &str) -> Result<(), AppError> {
                Err(error(AppErrorCode::SecureStorageUnavailable))
            }
        }
        let path = std::env::temp_dir()
            .join(format!("gitodile-unavailable-store-{}", std::process::id()))
            .join("accounts.json");
        let service = HostingAccessService::with_store(
            GitHubAuthService::default(),
            path.clone(),
            Arc::new(UnavailableStore),
        );
        service.cancel("before_registration");
        assert_eq!(
            service
                .request("before_registration", "list_hosting_repositories")
                .err()
                .unwrap()
                .code,
            AppErrorCode::OperationCancelled
        );
        let secret = Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap();
        assert_eq!(
            service
                .save("octocat".into(), &secret, &CancellationToken::default())
                .unwrap_err()
                .code,
            AppErrorCode::SecureStorageUnavailable
        );
        assert!(!path.exists());
        assert!(service.accounts().is_empty());
        assert!(service.credential("token.octocat").is_none());
    }

    #[test]
    #[ignore = "explicit system credential-store qualification; uses only a disposable fixture entry"]
    fn secure_store_roundtrip() {
        let name = format!(
            "GitOdile/validation/{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let entry = keyring::Entry::new(&name, "fixture").unwrap();
        entry
            .set_secret(b"fixture-secret-not-an-account-token")
            .unwrap();
        let value = entry.get_secret().unwrap();
        entry.delete_credential().unwrap();
        assert_eq!(value, b"fixture-secret-not-an-account-token");
        assert!(matches!(entry.get_secret(), Err(keyring::Error::NoEntry)));
    }
    struct NoCli;
    impl AccessProvider for NoCli {
        fn kind(&self) -> &'static str {
            "gitlab"
        }
        fn id(&self) -> &str {
            "gitlab"
        }
        fn host(&self) -> &str {
            "gitlab.com"
        }
        fn accounts(&self) -> Vec<Account> {
            vec![]
        }
        fn busy(&self) -> bool {
            false
        }
        fn check(&self) {}
        fn credential(&self, _: &str) -> Option<Secret> {
            None
        }
    }
    fn gitlab_fixture(name: &str) -> (HostingAccessService, PathBuf) {
        let path = PathBuf::from(crate::test_support::unique_temp_dir(name)).join("accounts.json");
        let service = HostingAccessService::configured(
            Arc::new(NoCli),
            ProviderKind::GitLab,
            path.clone(),
            Arc::new(MemoryStore::default()),
        );
        (service, path)
    }
    #[test]
    fn gitlab_tokens_use_stable_ids_separate_sources_and_os_namespaces() {
        let (service, path) = gitlab_fixture("gitlab-stable-id");
        let secret = Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap();
        let cancellation = CancellationToken::default();
        let id = service
            .save_identity(
                User {
                    id: Some(42),
                    login: "studio.user_1".into(),
                },
                &secret,
                &cancellation,
            )
            .unwrap();
        assert_eq!(id, "gitlab:token.42");
        assert_eq!(service.accounts()[0].login, "studio.user_1");
        assert_eq!(service.username("token.42").as_deref(), Some("oauth2"));
        assert_eq!(service.username("cli.42").as_deref(), Some("oauth2"));
        for key in [
            "token.studio.user_1",
            "token.0",
            "token.042",
            "cli.042",
            "42",
        ] {
            assert!(service.username(key).is_none());
            assert!(service.credential(key).is_none());
        }
        let restored = HostingAccessService::configured(
            service.cli.clone(),
            ProviderKind::GitLab,
            path.clone(),
            service.store.clone(),
        );
        assert_eq!(restored.accounts()[0].id, id);
        assert!(!restored.accounts()[0].available);
        assert_eq!(restored.accounts()[0].login, "studio.user_1");
        assert!(service
            .save_identity(
                User {
                    id: Some(42),
                    login: "renamed".into()
                },
                &secret,
                &cancellation
            )
            .is_err());
        let mut output = Vec::new();
        let providers: Vec<Arc<dyn AccessProvider>> = vec![Arc::new(service.clone())];
        crate::credentials::helper(
            &providers,
            &id,
            std::ffi::OsStr::new("get"),
            &b"protocol=https\nhost=gitlab.com\nusername=oauth2\n\n"[..],
            &mut output,
        )
        .unwrap();
        assert!(output.starts_with(b"username=oauth2\npassword=fixture-token"));
        for request in [
            "protocol=https\nhost=github.com\n\n",
            "protocol=http\nhost=gitlab.com\n\n",
            "protocol=https\nhost=gitlab.com.evil.test\n\n",
            "protocol=https\nhost=gitlab.com\nusername=another\n\n",
        ] {
            output.clear();
            assert!(crate::credentials::helper(
                &providers,
                &id,
                std::ffi::OsStr::new("get"),
                request.as_bytes(),
                &mut output
            )
            .is_err());
            assert!(output.is_empty());
        }
        service.remove(&id).unwrap();
        assert!(service.accounts().is_empty());
        assert!(service.credential("token.42").is_none());
        assert!(service.credential("cli.42").is_none());
        assert!(!fs::read_to_string(path).unwrap().contains("studio.user_1"));
    }
    #[test]
    fn a_background_check_keeps_verified_rows_and_survives_another_token_change() {
        let (mut service, path) = gitlab_fixture("gitlab-check-fencing");
        let (entered, entered_rx) = std::sync::mpsc::channel();
        let (release, release_rx) = std::sync::mpsc::channel();
        let (origin, worker) = gated_endpoint(
            vec![(
                "200 OK".into(),
                r#"{"id":42,"username":"renamed.user"}"#.into(),
            )],
            Some((entered, release_rx)),
        );
        service.api_origin = origin;
        let cancellation = CancellationToken::default();
        let secret = Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap();
        let user = |id, login: &str| User {
            id: Some(id),
            login: login.into(),
        };
        service
            .save_identity(user(42, "old.name"), &secret, &cancellation)
            .unwrap();
        service.check();
        entered_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        assert!(service.busy());
        assert!(
            service.accounts()[0].available,
            "a verified row stays selectable during a check"
        );
        // Changing an unrelated connection must not discard this result.
        service
            .save_identity(user(43, "other.user"), &secret, &cancellation)
            .unwrap();
        release.send(()).unwrap();
        worker.join().unwrap();
        let started = std::time::Instant::now();
        while service.busy() {
            assert!(started.elapsed() < Duration::from_secs(10));
            std::thread::sleep(Duration::from_millis(20));
        }
        let accounts = service.accounts();
        assert_eq!(accounts[0].login, "renamed.user");
        assert!(accounts[0].available && accounts[1].available);
        assert!(fs::read_to_string(&path).unwrap().contains("renamed.user"));
    }
    #[test]
    fn gitlab_projects_validate_nested_namespaces_and_exact_https_urls() {
        let fixture = r#"[{"id":9,"name":"Project label","path":"project","path_with_namespace":"team/sub-group/project","visibility":"private","archived":false,"description":null,"http_url_to_repo":"https://gitlab.com/team/sub-group/project.git"}]"#;
        let rows = parse_gitlab_repositories(fixture.as_bytes(), "gitlab.com").unwrap();
        assert_eq!(rows[0].owner, "team/sub-group");
        assert!(rows[0].private);
        for replacement in [
            "https://token@gitlab.com/team/sub-group/project.git",
            "http://gitlab.com/team/sub-group/project.git",
            "https://gitlab.com.evil.test/team/sub-group/project.git",
            "https://gitlab.com/team/sub-group/project.git?token=secret",
        ] {
            assert!(parse_gitlab_repositories(
                fixture
                    .replace("https://gitlab.com/team/sub-group/project.git", replacement)
                    .as_bytes(),
                "gitlab.com"
            )
            .is_err());
        }
        assert!(parse_gitlab_repositories(
            fixture.replace("team/sub-group", "team/..").as_bytes(),
            "gitlab.com"
        )
        .is_err());
        let row: serde_json::Value = serde_json::from_str(fixture).unwrap();
        let oversized = serde_json::to_vec(&vec![row[0].clone(); 101]).unwrap();
        assert!(parse_gitlab_repositories(&oversized, "gitlab.com").is_err());
        // A description typed in a Windows browser must not reject the page.
        let windows_text = fixture.replace(
            r#""description":null"#,
            r#""description":"First line\r\nSecond\u0007 line\r""#,
        );
        assert_eq!(
            parse_gitlab_repositories(windows_text.as_bytes(), "gitlab.com").unwrap()[0]
                .description
                .as_deref(),
            Some("First line\nSecond line")
        );
    }
    #[tokio::test]
    async fn gitlab_ingestion_verifies_identity_and_discovery_rechecks_numeric_id() {
        let (mut service, _) = gitlab_fixture("gitlab-ingestion");
        let (origin, worker) = endpoint(vec![(
            "200 OK".into(),
            r#"{"id":42,"username":"studio.user_1"}"#.into(),
        )]);
        service.api_origin = origin;
        assert_eq!(
            service
                .add("fixture-token-1234567".into(), "gitlab_add".into())
                .await
                .unwrap(),
            "gitlab:token.42"
        );
        assert_eq!(worker.join().unwrap().len(), 1);
        let (origin, worker) = endpoint(vec![
            ("200 OK".into(), r#"{"id":42,"username":"new.name"}"#.into()),
            (
                "200 OK\r\nX-Next-Page: 2\r\nLink: <https://attacker.invalid>; rel=\"next\"".into(),
                "[]".into(),
            ),
        ]);
        service.api_origin = origin;
        let page = service
            .repositories("gitlab:token.42".into(), 1, "gitlab_list".into())
            .await
            .unwrap();
        assert_eq!(page.next_page, Some(2));
        let requests = worker.join().unwrap();
        assert!(requests[1].starts_with("GET /projects?membership=true&order_by=last_activity_at&sort=desc&per_page=100&page=1 "));
        let (origin, worker) = endpoint(vec![(
            "200 OK".into(),
            r#"{"id":43,"username":"studio.user_1"}"#.into(),
        )]);
        service.api_origin = origin;
        let failure = service
            .repositories("gitlab:token.42".into(), 1, "changed_id".into())
            .await
            .err()
            .unwrap();
        assert_eq!(failure.code, AppErrorCode::AuthenticationFailed);
        assert_eq!(worker.join().unwrap().len(), 1);
        assert!(!service.accounts()[0].available);
    }
    #[tokio::test]
    async fn gitlab_invalid_identity_revocation_and_cancellation_never_persist_tokens() {
        let (mut service, path) = gitlab_fixture("gitlab-invalid-identity");
        for body in [
            r#"{"id":0,"username":"name"}"#,
            r#"{"id":42,"username":"bad/name"}"#,
            r#"{"username":"name"}"#,
        ] {
            let (origin, worker) = endpoint(vec![("200 OK".into(), body.into())]);
            service.api_origin = origin;
            assert!(service
                .add("fixture-token-1234567".into(), "invalid_user".into())
                .await
                .is_err());
            worker.join().unwrap();
            assert!(!path.exists());
        }
        service.cancel("before_add");
        assert_eq!(
            service
                .add("fixture-token-1234567".into(), "before_add".into())
                .await
                .err()
                .unwrap()
                .code,
            AppErrorCode::OperationCancelled
        );
        service
            .save_identity(
                User {
                    id: Some(42),
                    login: "name".into(),
                },
                &Secret::from_bytes(b"fixture-token-1234567".to_vec()).unwrap(),
                &CancellationToken::default(),
            )
            .unwrap();
        let (origin, worker) = endpoint(vec![(
            "401 Unauthorized".into(),
            "private_fixture_secret".into(),
        )]);
        service.api_origin = origin;
        let failure = service
            .repositories("gitlab:token.42".into(), 1, "revoked".into())
            .await
            .err()
            .unwrap();
        assert_eq!(failure.code, AppErrorCode::AuthenticationFailed);
        assert!(!failure.message.contains("private_fixture_secret"));
        worker.join().unwrap();
        assert!(!service.accounts()[0].available);
    }
}

#[derive(Deserialize)]
struct GitLabProject {
    id: u64,
    name: String,
    path: String,
    path_with_namespace: String,
    visibility: String,
    archived: bool,
    description: Option<String>,
    http_url_to_repo: String,
}
fn parse_gitlab_repositories(bytes: &[u8], host: &str) -> Result<Vec<HostedRepository>, AppError> {
    let rows: Vec<GitLabProject> =
        serde_json::from_slice(bytes).map_err(|_| error(AppErrorCode::RemoteRejected))?;
    if rows.len() > 100 {
        return Err(error(AppErrorCode::RemoteRejected));
    }
    rows.into_iter()
        .map(|row| {
            let parts: Vec<_> = row.path_with_namespace.split('/').collect();
            if row.id == 0
                || parts.len() < 2
                || parts.len() > 32
                || parts
                    .iter()
                    .any(|p| p.is_empty() || *p == "." || *p == ".." || !gitlab_login_is_valid(p))
                || parts.last() != Some(&row.path.as_str())
                || row.http_url_to_repo != format!("https://{host}/{}.git", row.path_with_namespace)
                || row.name.is_empty()
                || row.name.len() > 1024
                || row.name.chars().any(char::is_control)
                || !["private", "internal", "public"].contains(&row.visibility.as_str())
            {
                return Err(error(AppErrorCode::RemoteRejected));
            }
            let owner = parts[..parts.len() - 1].join("/");
            Ok(HostedRepository {
                id: row.id,
                name: row.path,
                full_name: row.path_with_namespace,
                owner,
                private: row.visibility != "public",
                archived: row.archived,
                description: row.description.as_deref().and_then(display_text),
                clone_url: row.http_url_to_repo,
            })
        })
        .collect()
}
pub(crate) async fn gitlab_user(
    host: &str,
    secret: &Secret,
    cancellation: &CancellationToken,
) -> Result<User, AppError> {
    let origin = if host == ProviderKind::GitLab.host() {
        ProviderKind::GitLab.origin().to_owned()
    } else {
        ProviderKind::GitLab.server_origin(host)
    };
    user(ProviderKind::GitLab, &origin, secret, cancellation).await
}

fn server_store(kind: ProviderKind, host: &str) -> String {
    match kind {
        ProviderKind::GitHub => format!("GitOdile/GitHubEnterprise/{host}/token/v1"),
        ProviderKind::GitLab => format!("GitOdile/GitLabSelfManaged/{host}/token/v1"),
    }
}

impl HostingAccessService {
    fn is_server(&self) -> bool {
        &*self.id != self.kind.id()
    }
}

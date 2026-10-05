//! GitHub.com API access and GitOdile-owned personal access tokens. Secrets
//! live only in the operating system credential store; JSON contains logins.
//! Browser/CLI credentials stay owned by gh and retain their original IDs.
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
const TOKEN_PREFIX: &str = "token.";
const MAX_ACCOUNTS: usize = 8;
const BODY_CAP: usize = 2 * 1024 * 1024;

fn error(code: AppErrorCode) -> AppError {
    // Never include raw HTTP, keyring, response body or request errors: those
    // can contain credentials or private repository names.
    AppError::new(code, "GitHub access could not be completed.")
}

fn login_is_valid(login: &str) -> bool {
    !login.is_empty()
        && login.len() <= 39
        && login
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
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

struct OsTokenStore;
fn entry(login: &str) -> Result<keyring::Entry, AppError> {
    if !login_is_valid(login) {
        return Err(error(AppErrorCode::InvalidSelection));
    }
    keyring::Entry::new(STORE, &login.to_ascii_lowercase())
        .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))
}
impl TokenStore for OsTokenStore {
    fn get(&self, login: &str) -> Result<Secret, AppError> {
        let bytes = entry(login)?.get_secret().map_err(|failure| {
            error(match failure {
                keyring::Error::NoEntry => AppErrorCode::AuthenticationFailed,
                _ => AppErrorCode::SecureStorageUnavailable,
            })
        })?;
        Secret::from_bytes(bytes).ok_or_else(|| error(AppErrorCode::AuthenticationFailed))
    }
    fn set(&self, login: &str, secret: &Secret) -> Result<(), AppError> {
        entry(login)?
            .set_secret(secret.bytes())
            .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))
    }
    fn remove(&self, login: &str) -> Result<(), AppError> {
        match entry(login)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(error(AppErrorCode::SecureStorageUnavailable)),
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
struct Metadata {
    version: u8,
    logins: Vec<String>,
}
struct TokenState {
    metadata: Result<Metadata, ()>,
    verified: BTreeSet<String>,
    revision: u64,
    failures: BTreeMap<String, AppErrorCode>,
}
#[derive(Clone)]
pub(crate) struct GitHubAccessService {
    gh: Arc<GhAccessProvider>,
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

impl GitHubAccessService {
    pub(crate) fn new(gh: GitHubAuthService, path: PathBuf) -> Self {
        Self::with_store(gh, path, Arc::new(OsTokenStore))
    }
    fn with_store(gh: GitHubAuthService, path: PathBuf, store: Arc<dyn TokenStore>) -> Self {
        let metadata = match fs::File::open(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Metadata {
                version: 1,
                logins: vec![],
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
            gh: Arc::new(GhAccessProvider(gh)),
            path,
            store,
            state: Arc::new(Mutex::new(TokenState {
                metadata,
                verified: BTreeSet::new(),
                revision: 0,
                failures: BTreeMap::new(),
            })),
            checking: Arc::new(AtomicBool::new(false)),
            mutations: Arc::new(Mutex::new(())),
            requests: Arc::new(Mutex::new(BTreeMap::new())),
            cancelled_requests: Arc::new(Mutex::new(BTreeSet::new())),
            api_origin: API_ORIGIN.into(),
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
    fn save(
        &self,
        login: String,
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
        };
        next.logins.push(login.clone());
        drop(state);
        self.store.set(&login, secret)?;
        if let Err(failure) = self.persist(&next) {
            let _ = self.store.remove(&login);
            return Err(failure);
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.metadata = Ok(next);
        state.revision += 1;
        state.verified.insert(login.to_ascii_lowercase());
        state.failures.remove(&login.to_ascii_lowercase());
        Ok(format!("github:token.{}", login.to_ascii_lowercase()))
    }
    pub(crate) fn remove(&self, account_id: &str) -> Result<(), AppError> {
        let key = account_id
            .strip_prefix("github:")
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
        let next = Metadata {
            version: 1,
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
        state.revision += 1;
        drop(state);
        self.persist(&next)?;
        state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.metadata = Ok(next);
        state.revision += 1;
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
        let request = self.request(&request_id, "add_github_token")?;
        let user = user(&self.api_origin, &secret, &request.cancellation).await?;
        request.ensure_active()?;
        let service = self.clone();
        // Keychain prompts/storage are synchronous and must not block the async executor.
        tokio::task::spawn_blocking(move || {
            // Keep admission until the synchronous storage worker ends, even
            // if its waiting IPC future is abandoned during a window close.
            request.ensure_active()?;
            service.save(user.login, &secret, &request.cancellation)
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
            .strip_prefix("github:")
            .ok_or_else(|| error(AppErrorCode::InvalidSelection))?;
        let expected = self
            .username(key)
            .ok_or_else(|| error(AppErrorCode::InvalidSelection))?;
        let revision = token_login(key).map(|_| {
            self.state
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .revision
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
        self.ensure_revision(revision)?;
        let result = async {
            let identity = user(&self.api_origin, &secret, &request.cancellation).await?;
            if !identity.login.eq_ignore_ascii_case(&expected) {
                return Err(error(AppErrorCode::AuthenticationFailed));
            }
            let path = format!("/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=100&page={page}");
            let (bytes, next) = get(&self.api_origin, &path, &secret, &request.cancellation).await?;
            let repositories = parse_repositories(&bytes)?;
            request.ensure_active()?;
            self.ensure_revision(revision)?;
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
    fn ensure_revision(&self, revision: Option<u64>) -> Result<(), AppError> {
        if revision.is_some_and(|revision| {
            self.state
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .revision
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
        if revision.is_some_and(|revision| state.revision != revision) {
            return;
        }
        state.verified.remove(&login.to_ascii_lowercase());
        state.failures.insert(login.to_ascii_lowercase(), code);
    }
    fn api_credential(&self, key: &str) -> Result<Secret, AppError> {
        if key.starts_with(TOKEN_PREFIX) {
            self.store
                .get(token_login(key).ok_or_else(|| error(AppErrorCode::InvalidSelection))?)
        } else {
            self.gh
                .credential(key)
                .ok_or_else(|| error(AppErrorCode::AuthenticationFailed))
        }
    }
}

impl AccessProvider for GitHubAccessService {
    fn id(&self) -> &'static str {
        "github"
    }
    fn host(&self) -> &'static str {
        "github.com"
    }
    fn accounts(&self) -> Vec<Account> {
        let mut accounts = self.gh.accounts();
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Ok(metadata) = &state.metadata {
            accounts.extend(metadata.logins.iter().map(|login| Account {
                id: format!("github:token.{}", login.to_ascii_lowercase()),
                provider: "github".into(),
                host: "github.com".into(),
                login: login.clone(),
                avatar_data_url: None,
                available: state.verified.contains(&login.to_ascii_lowercase())
                    && !self.checking.load(Ordering::Acquire),
                unavailable_reason: state.failures.get(&login.to_ascii_lowercase()).cloned(),
            }));
        }
        accounts
    }
    fn busy(&self) -> bool {
        self.gh.busy() || self.checking.load(Ordering::Acquire)
    }
    fn check(&self) {
        self.gh.check();
        if self.checking.swap(true, Ordering::AcqRel) {
            return;
        }
        let service = self.clone();
        let checking = self.checking.clone();
        if std::thread::Builder::new()
            .name("github-token-check".into())
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
                    let (logins, revision) = {
                        let state = service.state.lock().unwrap_or_else(|e| e.into_inner());
                        (
                            state
                                .metadata
                                .as_ref()
                                .map(|m| m.logins.clone())
                                .unwrap_or_default(),
                            state.revision,
                        )
                    };
                    let cancellation = CancellationToken::default();
                    let _activity = application::begin_background_activity_with_cancellation(
                        "check_account_catalog",
                        cancellation.clone(),
                    );
                    let mut workers = tokio::task::JoinSet::new();
                    for login in logins {
                        let store = service.store.clone();
                        let origin = service.api_origin.clone();
                        let cancellation = cancellation.clone();
                        workers.spawn(async move {
                            let key = login.clone();
                            let secret = tokio::task::spawn_blocking(move || store.get(&key))
                                .await
                                .map_err(|_| error(AppErrorCode::SecureStorageUnavailable))
                                .and_then(|result| result);
                            let verification =
                                match secret {
                                    Ok(secret) => user(&origin, &secret, &cancellation)
                                        .await
                                        .and_then(|user| {
                                            if user.login.eq_ignore_ascii_case(&login) {
                                                Ok(())
                                            } else {
                                                Err(error(AppErrorCode::AuthenticationFailed))
                                            }
                                        }),
                                    Err(failure) => Err(failure),
                                };
                            (login, verification)
                        });
                    }
                    while let Some(result) = workers.join_next().await {
                        let Ok((login, verification)) = result else {
                            continue;
                        };
                        let mut state = service.state.lock().unwrap_or_else(|e| e.into_inner());
                        if state.revision != revision {
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
                            Ok(()) => {
                                state.verified.insert(key.clone());
                                state.failures.remove(&key);
                            }
                            Err(failure) => {
                                state.verified.remove(&key);
                                state.failures.insert(key, failure.code);
                            }
                        }
                    }
                });
            })
            .is_err()
        {
            checking.store(false, Ordering::Release);
        }
    }
    fn username(&self, key: &str) -> Option<String> {
        let login = if key.starts_with(TOKEN_PREFIX) {
            token_login(key)?
        } else {
            key
        };
        login_is_valid(login).then(|| login.to_owned())
    }
    fn credential(&self, key: &str) -> Option<Secret> {
        if key.starts_with(TOKEN_PREFIX) {
            self.store.get(token_login(key)?).ok()
        } else {
            self.gh.credential(key)
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
struct User {
    login: String,
}
async fn user(
    origin: &str,
    secret: &Secret,
    cancellation: &CancellationToken,
) -> Result<User, AppError> {
    let (bytes, _) = get(origin, "/user", secret, cancellation).await?;
    let user: User =
        serde_json::from_slice(&bytes).map_err(|_| error(AppErrorCode::RemoteRejected))?;
    if !login_is_valid(&user.login) {
        return Err(error(AppErrorCode::RemoteRejected));
    }
    Ok(user)
}

async fn get(
    origin: &str,
    path: &str,
    secret: &Secret,
    cancellation: &CancellationToken,
) -> Result<(Vec<u8>, bool), AppError> {
    if cancellation.is_cancelled() {
        return Err(error(AppErrorCode::OperationCancelled));
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("GitOdile")
        .build()
        .map_err(|_| error(AppErrorCode::Offline))?;
    let mut bearer = b"Bearer ".to_vec();
    bearer.extend_from_slice(secret.bytes());
    let authorization = reqwest::header::HeaderValue::from_bytes(&bearer);
    bearer.zeroize();
    let mut authorization = authorization.map_err(|_| error(AppErrorCode::AuthenticationFailed))?;
    authorization.set_sensitive(true);
    let fetch = async {
        let mut response = client
            .get(format!("{origin}{path}"))
            .header(reqwest::header::AUTHORIZATION, authorization)
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| {
                error(if e.is_timeout() {
                    AppErrorCode::NetworkTimeout
                } else {
                    AppErrorCode::Offline
                })
            })?;
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
            .is_some_and(|link| link.split(',').any(|part| part.contains("rel=\"next\"")));
        // We never follow the server's link: a numeric next page is requested
        // against the fixed API origin, so redirects/links cannot leak a token.
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|failure| {
            error(if failure.is_timeout() {
                AppErrorCode::NetworkTimeout
            } else {
                AppErrorCode::Offline
            })
        })? {
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
fn parse_repositories(bytes: &[u8]) -> Result<Vec<HostedRepository>, AppError> {
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
                || row.clone_url != format!("https://github.com/{}.git", row.full_name)
                || row.description.as_ref().is_some_and(|d| {
                    d.len() > 8192 || d.chars().any(|c| c.is_control() && c != '\n' && c != '\t')
                })
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
                description: row.description,
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
        let service = GitHubAccessService::with_store(
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
        let service = GitHubAccessService::with_store(
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
        let service = GitHubAccessService::with_store(
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
            GitHubAccessService::with_store(GitHubAuthService::default(), path.clone(), store);
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
        assert!(parse_repositories(fixture.as_bytes()).unwrap()[0].private);
        for replacement in [
            "https://attacker.test/team/project.git",
            "https://token@github.com/team/project.git",
            "http://github.com/team/project.git",
        ] {
            assert!(parse_repositories(
                fixture
                    .replace("https://github.com/team/project.git", replacement)
                    .as_bytes()
            )
            .is_err());
        }
        assert!(parse_repositories(
            fixture
                .replace("team/project", "other/project")
                .replacen("other/project", "team/project", 1)
                .as_bytes()
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
            GitHubAccessService::with_store(GitHubAuthService::default(), path.clone(), store);
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
            let mut service = GitHubAccessService::with_store(
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
        let service = GitHubAccessService::with_store(
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
        let service = GitHubAccessService::with_store(
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
}

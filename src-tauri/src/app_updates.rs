//! Process-wide, Rust-owned application updater.
//!
//! The WebView can only name opaque candidate/operation IDs. Feed selection,
//! target detection, request policy, signature verification, retained bytes,
//! installation paths and installer handoff stay here. The official updater
//! plugin performs the authoritative check, verification and install.

use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git::CancellationToken;
use crate::watch::{WatcherRegistry, WatcherSuspension};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::utils::config::BundleType;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use tokio::sync::watch;

pub(crate) const UPDATER_PLUGIN_VERSION: &str = "2.11.0";
pub(crate) const MANIFEST_BYTES_LIMIT: u64 = 256 * 1024;
pub(crate) const NOTES_BYTES_LIMIT: usize = 16 * 1024;
pub(crate) const PLATFORM_ENTRIES_LIMIT: usize = 8;
pub(crate) const SIGNATURE_BYTES_LIMIT: usize = 4 * 1024;
pub(crate) const ARTIFACT_BYTES_LIMIT: u64 = 256 * 1024 * 1024;
const PUBLIC_KEY_BYTES_LIMIT: usize = 8 * 1024;
const PUBLIC_KEY_ID_BYTES_LIMIT: usize = 128;
const SAFE_DETAIL_BYTES_LIMIT: usize = 512;
const CHECK_TIMEOUT: Duration = Duration::from_secs(15);
const DOWNLOAD_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const DOWNLOAD_TOTAL_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const READ_DRAIN_TIMEOUT: Duration = Duration::from_secs(5);
const REDIRECT_LIMIT: usize = 5;
const STABLE_FEED: &str =
    "https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/stable.json";
const PREVIEW_FEED: &str =
    "https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/preview.json";
const RELEASE_PREFIX: &str = "/martinezelx/gitodile/releases/download/";
const HANDOFF_FILE: &str = "app-update-handoff-v1.json";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum UpdateCheckSource {
    Manual,
    Background,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ReleaseChannel {
    Stable,
    Preview,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub(crate) enum UpdateTarget {
    #[serde(rename = "windows-x86_64")]
    WindowsX86_64,
    #[serde(rename = "darwin-aarch64")]
    DarwinAarch64,
    #[serde(rename = "darwin-x86_64")]
    DarwinX86_64,
    #[serde(rename = "linux-x86_64")]
    LinuxX86_64,
}

impl UpdateTarget {
    fn as_str(self) -> &'static str {
        match self {
            Self::WindowsX86_64 => "windows-x86_64",
            Self::DarwinAarch64 => "darwin-aarch64",
            Self::DarwinX86_64 => "darwin-x86_64",
            Self::LinuxX86_64 => "linux-x86_64",
        }
    }

    fn current() -> Result<Self, UpdateError> {
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("windows", "x86_64") => Ok(Self::WindowsX86_64),
            ("macos", "aarch64") => Ok(Self::DarwinAarch64),
            ("macos", "x86_64") => Ok(Self::DarwinX86_64),
            ("linux", "x86_64") => Ok(Self::LinuxX86_64),
            _ => Err(UpdateError::new(
                UpdateErrorCode::UnsupportedInstallation,
                UpdateStage::Check,
                false,
            )),
        }
    }

    fn from_key(value: &str) -> Option<Self> {
        match value {
            "windows-x86_64" => Some(Self::WindowsX86_64),
            "darwin-aarch64" => Some(Self::DarwinAarch64),
            "darwin-x86_64" => Some(Self::DarwinX86_64),
            "linux-x86_64" => Some(Self::LinuxX86_64),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum InstallationMode {
    WindowsNsisPerUser,
    MacosAppBundle,
    LinuxAppImage,
    WindowsMsi,
    WindowsMachineWide,
    ManagedPackage,
    Store,
    MountedImage,
    Unsupported,
}

impl InstallationMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::WindowsNsisPerUser => "windows_nsis_per_user",
            Self::MacosAppBundle => "macos_app_bundle",
            Self::LinuxAppImage => "linux_appimage",
            Self::WindowsMsi => "windows_msi",
            Self::WindowsMachineWide => "windows_machine_wide",
            Self::ManagedPackage => "managed_package",
            Self::Store => "store",
            Self::MountedImage => "mounted_image",
            Self::Unsupported => "unsupported",
        }
    }

    fn automatic_candidate(self) -> bool {
        matches!(
            self,
            Self::WindowsNsisPerUser | Self::MacosAppBundle | Self::LinuxAppImage
        )
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateCandidate {
    candidate_id: String,
    version: String,
    channel: ReleaseChannel,
    target: UpdateTarget,
    published_at: Option<String>,
    notes: String,
    expected_bytes: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "length",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum TransferProgress {
    Known {
        received_bytes: u64,
        total_bytes: u64,
    },
    Unknown {
        received_bytes: u64,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum UpdateErrorCode {
    Offline,
    Timeout,
    HttpStatus,
    FeedUnavailable,
    InvalidManifest,
    InvalidVersion,
    ChannelMismatch,
    TargetUnavailable,
    UnsupportedInstallation,
    ReadOnlyInstallation,
    NotesTooLarge,
    PayloadTooLarge,
    TruncatedDownload,
    SignatureInvalid,
    InsufficientSpace,
    InstallBlocked,
    InstallHandoffFailed,
    PostInstallUnconfirmed,
    Internal,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum UpdateStage {
    Check,
    Download,
    Verify,
    Admission,
    Install,
    Startup,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateError {
    code: UpdateErrorCode,
    stage: UpdateStage,
    retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    safe_detail: Option<String>,
}

impl UpdateError {
    fn new(code: UpdateErrorCode, stage: UpdateStage, retryable: bool) -> Self {
        Self {
            code,
            stage,
            retryable,
            http_status: None,
            safe_detail: None,
        }
    }

    fn status(status: u16, stage: UpdateStage) -> Self {
        Self {
            code: UpdateErrorCode::HttpStatus,
            stage,
            retryable: status >= 500,
            http_status: Some(status),
            safe_detail: None,
        }
    }

    fn detail(mut self, detail: impl AsRef<str>) -> Self {
        self.safe_detail = Some(bound_safe_detail(detail.as_ref()));
        self
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CancellableStage {
    Checking,
    Downloading,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum UpdateState {
    Idle,
    Checking {
        operation_id: String,
        source: UpdateCheckSource,
    },
    Current {
        checked_at: String,
    },
    Available {
        candidate: UpdateCandidate,
    },
    Downloading {
        candidate: UpdateCandidate,
        transfer: TransferProgress,
    },
    Verifying {
        candidate: UpdateCandidate,
        received_bytes: u64,
    },
    Ready {
        candidate: UpdateCandidate,
    },
    Blocked {
        candidate: UpdateCandidate,
        error: UpdateError,
    },
    Installing {
        candidate_id: String,
    },
    Cancelled {
        stage: CancellableStage,
    },
    Unavailable {
        error: UpdateError,
    },
    Failed {
        error: UpdateError,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateAction {
    operation_id: Option<String>,
    coalesced: bool,
    state: UpdateState,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DraftPreparation {
    protected_count: usize,
    blockers: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallUpdateRequest {
    candidate_id: String,
    consent: bool,
    drafts: DraftPreparation,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum StartupUpdateConfirmation {
    None,
    Confirmed {
        version: String,
    },
    Unconfirmed {
        expected_version: String,
        error: UpdateError,
    },
}

#[derive(Clone)]
pub(crate) struct AppUpdateService(Arc<ServiceInner>);

struct ServiceInner {
    next_operation: AtomicU64,
    state: Mutex<ServiceState>,
    handoff_path: PathBuf,
}

struct ServiceState {
    snapshot: UpdateState,
    candidate: Option<PendingCandidate>,
    active: Option<ActiveOperation>,
    startup_confirmation: StartupUpdateConfirmation,
}

struct PendingCandidate {
    public: UpdateCandidate,
    mode: InstallationMode,
    manifest_digest: String,
    artifact_url: String,
    signature: String,
    update: Update,
    verified_bytes: Option<Vec<u8>>,
}

struct ActiveOperation {
    id: String,
    kind: ActiveOperationKind,
    cancel: watch::Sender<bool>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum ActiveOperationKind {
    Check,
    Download,
}

#[derive(Clone)]
struct BuildUpdateIdentity {
    version: Version,
    channel: ReleaseChannel,
    feed: &'static str,
    public_key: String,
    public_key_id: String,
}

enum CheckOutcome {
    Current,
    Candidate(Box<PendingCandidate>),
    Unavailable(UpdateError),
    Failed(UpdateError),
    Cancelled,
}

enum DownloadOutcome {
    Ready(Vec<u8>),
    Failed(UpdateError),
    Cancelled,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HandoffRecord {
    schema_version: u8,
    candidate_id: String,
    from_version: String,
    expected_version: String,
    started_at_unix_seconds: u64,
}

pub(crate) struct InstallPreparation {
    watchers: Option<WatcherSuspension>,
    admission: Option<application::InstallAdmission>,
}

impl Drop for InstallPreparation {
    fn drop(&mut self) {
        drop(self.watchers.take());
        drop(self.admission.take());
    }
}

impl AppUpdateService {
    pub(crate) fn new<R: Runtime>(app: &AppHandle<R>) -> Self {
        let handoff_path = app
            .path()
            .app_local_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("gitodile"))
            .join(HANDOFF_FILE);
        let startup_confirmation = confirm_handoff(&handoff_path, env!("CARGO_PKG_VERSION"));
        let snapshot = match &startup_confirmation {
            StartupUpdateConfirmation::Unconfirmed { error, .. } => UpdateState::Failed {
                error: error.clone(),
            },
            _ => UpdateState::Idle,
        };
        Self(Arc::new(ServiceInner {
            next_operation: AtomicU64::new(0),
            state: Mutex::new(ServiceState {
                snapshot,
                candidate: None,
                active: None,
                startup_confirmation,
            }),
            handoff_path,
        }))
    }

    #[cfg(test)]
    fn for_test() -> Self {
        Self(Arc::new(ServiceInner {
            next_operation: AtomicU64::new(0),
            state: Mutex::new(ServiceState {
                snapshot: UpdateState::Idle,
                candidate: None,
                active: None,
                startup_confirmation: StartupUpdateConfirmation::None,
            }),
            handoff_path: std::env::temp_dir().join("gitodile-test-handoff-unused"),
        }))
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, ServiceState> {
        self.0
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn operation_id(&self, kind: &str) -> String {
        let sequence = self.0.next_operation.fetch_add(1, Ordering::Relaxed) + 1;
        let mut hash = Sha256::new();
        hash.update(b"gitodile-app-update-operation-v1\0");
        hash.update(kind.as_bytes());
        hash.update(sequence.to_le_bytes());
        hash.update(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
                .to_le_bytes(),
        );
        hex_digest(hash.finalize())
    }

    pub(crate) fn snapshot(&self) -> UpdateState {
        self.lock().snapshot.clone()
    }

    pub(crate) fn startup_confirmation(&self) -> StartupUpdateConfirmation {
        self.lock().startup_confirmation.clone()
    }

    pub(crate) fn start_check<R: Runtime>(
        &self,
        app: AppHandle<R>,
        source: UpdateCheckSource,
    ) -> UpdateAction {
        let mut state = self.lock();
        if let Some(action) = coalesced_check(&state) {
            return action;
        }
        if let Some(active) = &state.active {
            let _ = active.cancel.send(true);
        }
        state.candidate = None;
        let operation_id = self.operation_id("check");
        let (cancel, cancel_rx) = watch::channel(false);
        state.active = Some(ActiveOperation {
            id: operation_id.clone(),
            kind: ActiveOperationKind::Check,
            cancel,
        });
        state.snapshot = UpdateState::Checking {
            operation_id: operation_id.clone(),
            source,
        };
        let snapshot = state.snapshot.clone();
        drop(state);

        let service = self.clone();
        let task_id = operation_id.clone();
        let app_cancel = CancellationToken::default();
        let activity = application::begin_background_activity_with_cancellation(
            "check_app_update",
            app_cancel.clone(),
        );
        tauri::async_runtime::spawn(async move {
            let outcome = tokio::select! {
                biased;
                _ = wait_for_cancellation(cancel_rx, app_cancel) => CheckOutcome::Cancelled,
                outcome = perform_check(&app) => outcome,
            };
            drop(activity);
            service.finish_check(&task_id, outcome);
        });
        UpdateAction {
            operation_id: Some(operation_id),
            coalesced: false,
            state: snapshot,
        }
    }

    fn finish_check(&self, operation_id: &str, outcome: CheckOutcome) {
        let mut state = self.lock();
        if !active_matches(&state, operation_id, ActiveOperationKind::Check) {
            return;
        }
        state.active = None;
        match outcome {
            CheckOutcome::Current => {
                state.candidate = None;
                state.snapshot = UpdateState::Current {
                    checked_at: now_rfc3339(),
                };
            }
            CheckOutcome::Candidate(candidate) => {
                let public = candidate.public.clone();
                let blocked = installation_error(candidate.mode, UpdateStage::Check);
                state.candidate = Some(*candidate);
                state.snapshot = match blocked {
                    Some(error) => UpdateState::Blocked {
                        candidate: public,
                        error,
                    },
                    None => UpdateState::Available { candidate: public },
                };
            }
            CheckOutcome::Unavailable(error) => {
                state.candidate = None;
                state.snapshot = UpdateState::Unavailable { error };
            }
            CheckOutcome::Failed(error) => {
                state.candidate = None;
                state.snapshot = UpdateState::Failed { error };
            }
            CheckOutcome::Cancelled => {
                state.candidate = None;
                state.snapshot = UpdateState::Cancelled {
                    stage: CancellableStage::Checking,
                };
            }
        }
    }

    pub(crate) fn start_download(&self, candidate_id: &str) -> UpdateAction {
        if !opaque_id_is_valid(candidate_id) {
            return action_failure(stale_candidate_error(UpdateStage::Download));
        }
        let mut state = self.lock();
        if let Some(active) = &state.active {
            let same = active.kind == ActiveOperationKind::Download
                && state
                    .candidate
                    .as_ref()
                    .is_some_and(|candidate| candidate.public.candidate_id == candidate_id);
            if same {
                return UpdateAction {
                    operation_id: Some(active.id.clone()),
                    coalesced: true,
                    state: state.snapshot.clone(),
                };
            }
            return action_failure(stale_candidate_error(UpdateStage::Download));
        }
        let Some(candidate) = state.candidate.as_mut() else {
            return action_failure(stale_candidate_error(UpdateStage::Download));
        };
        if candidate.public.candidate_id != candidate_id || !candidate.mode.automatic_candidate() {
            return action_failure(stale_candidate_error(UpdateStage::Download));
        }
        candidate.verified_bytes = None;
        let update = candidate.update.clone();
        let public = candidate.public.clone();
        let manifest_expected = candidate.public.expected_bytes;
        let operation_id = self.operation_id("download");
        let (cancel, cancel_rx) = watch::channel(false);
        state.active = Some(ActiveOperation {
            id: operation_id.clone(),
            kind: ActiveOperationKind::Download,
            cancel: cancel.clone(),
        });
        state.snapshot = UpdateState::Downloading {
            candidate: public.clone(),
            transfer: public.expected_bytes.map_or(
                TransferProgress::Unknown { received_bytes: 0 },
                |total_bytes| TransferProgress::Known {
                    received_bytes: 0,
                    total_bytes,
                },
            ),
        };
        let snapshot = state.snapshot.clone();
        drop(state);

        let service = self.clone();
        let task_id = operation_id.clone();
        let candidate_id = candidate_id.to_string();
        let app_cancel = CancellationToken::default();
        let activity = application::begin_background_activity_with_cancellation(
            "download_app_update",
            app_cancel.clone(),
        );
        tauri::async_runtime::spawn(async move {
            let outcome = service
                .download_candidate(
                    &task_id,
                    &candidate_id,
                    update,
                    cancel,
                    cancel_rx,
                    app_cancel,
                    manifest_expected,
                )
                .await;
            drop(activity);
            service.finish_download(&task_id, &candidate_id, outcome);
        });
        UpdateAction {
            operation_id: Some(operation_id),
            coalesced: false,
            state: snapshot,
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn download_candidate(
        &self,
        operation_id: &str,
        candidate_id: &str,
        mut update: Update,
        cancel: watch::Sender<bool>,
        cancel_rx: watch::Receiver<bool>,
        app_cancel: CancellationToken,
        manifest_expected: Option<u64>,
    ) -> DownloadOutcome {
        update.timeout = Some(DOWNLOAD_TOTAL_TIMEOUT);
        let received = Arc::new(AtomicU64::new(0));
        let expected = Arc::new(Mutex::new(None::<u64>));
        let abort_error = Arc::new(Mutex::new(None::<UpdateError>));
        let chunk_received = Arc::clone(&received);
        let finish_received = Arc::clone(&received);
        let chunk_expected = Arc::clone(&expected);
        let chunk_error = Arc::clone(&abort_error);
        let chunk_cancel = cancel.clone();
        let progress_service = self.clone();
        let progress_operation = operation_id.to_string();
        let progress_candidate = candidate_id.to_string();
        let verifying_service = self.clone();
        let verifying_operation = operation_id.to_string();
        let verifying_candidate = candidate_id.to_string();
        let download = update.download(
            move |chunk, content_length| {
                let total =
                    chunk_received.fetch_add(chunk as u64, Ordering::Relaxed) + chunk as u64;
                if let Some(length) = content_length {
                    *chunk_expected.lock().unwrap_or_else(|p| p.into_inner()) = Some(length);
                }
                if total > ARTIFACT_BYTES_LIMIT
                    || content_length.is_some_and(|length| length > ARTIFACT_BYTES_LIMIT)
                {
                    *chunk_error.lock().unwrap_or_else(|p| p.into_inner()) =
                        Some(UpdateError::new(
                            UpdateErrorCode::PayloadTooLarge,
                            UpdateStage::Download,
                            false,
                        ));
                    let _ = chunk_cancel.send(true);
                }
                progress_service.record_progress(
                    &progress_operation,
                    &progress_candidate,
                    total,
                    content_length,
                );
            },
            move || {
                verifying_service.record_verifying(
                    &verifying_operation,
                    &verifying_candidate,
                    finish_received.load(Ordering::Relaxed),
                );
            },
        );
        tokio::pin!(download);
        let result = tokio::select! {
            biased;
            _ = wait_for_cancellation(cancel_rx, app_cancel) => {
                let error = abort_error.lock().unwrap_or_else(|p| p.into_inner()).take();
                return error.map_or(DownloadOutcome::Cancelled, DownloadOutcome::Failed);
            }
            result = &mut download => result,
        };
        let received = received.load(Ordering::Relaxed);
        let expected = *expected.lock().unwrap_or_else(|p| p.into_inner());
        match result {
            Ok(bytes) => match validate_download_lengths(
                bytes.len() as u64,
                received,
                expected,
                manifest_expected,
            ) {
                Ok(()) => DownloadOutcome::Ready(bytes),
                Err(error) => DownloadOutcome::Failed(error),
            },
            Err(error) => DownloadOutcome::Failed(map_download_error(error, received, expected)),
        }
    }

    fn record_progress(
        &self,
        operation: &str,
        candidate_id: &str,
        received: u64,
        total: Option<u64>,
    ) {
        let mut state = self.lock();
        if !active_matches(&state, operation, ActiveOperationKind::Download) {
            return;
        }
        let Some(candidate) = state.candidate.as_ref() else {
            return;
        };
        if candidate.public.candidate_id != candidate_id {
            return;
        }
        state.snapshot = UpdateState::Downloading {
            candidate: candidate.public.clone(),
            transfer: total.or(candidate.public.expected_bytes).map_or(
                TransferProgress::Unknown {
                    received_bytes: received,
                },
                |total_bytes| TransferProgress::Known {
                    received_bytes: received,
                    total_bytes,
                },
            ),
        };
    }

    fn record_verifying(&self, operation: &str, candidate_id: &str, received: u64) {
        let mut state = self.lock();
        if !active_matches(&state, operation, ActiveOperationKind::Download) {
            return;
        }
        let Some(candidate) = state.candidate.as_ref() else {
            return;
        };
        if candidate.public.candidate_id != candidate_id {
            return;
        }
        state.snapshot = UpdateState::Verifying {
            candidate: candidate.public.clone(),
            received_bytes: received,
        };
    }

    fn finish_download(&self, operation: &str, candidate_id: &str, outcome: DownloadOutcome) {
        let mut state = self.lock();
        if !active_matches(&state, operation, ActiveOperationKind::Download) {
            return;
        }
        state.active = None;
        let Some(candidate) = state.candidate.as_mut() else {
            return;
        };
        if candidate.public.candidate_id != candidate_id {
            return;
        }
        candidate.verified_bytes = None;
        match outcome {
            DownloadOutcome::Ready(bytes) => {
                candidate.verified_bytes = Some(bytes);
                state.snapshot = UpdateState::Ready {
                    candidate: candidate.public.clone(),
                };
            }
            DownloadOutcome::Failed(error) => state.snapshot = UpdateState::Failed { error },
            DownloadOutcome::Cancelled => {
                state.snapshot = UpdateState::Cancelled {
                    stage: CancellableStage::Downloading,
                }
            }
        }
    }

    pub(crate) fn cancel(&self, operation_id: &str) -> UpdateState {
        if !opaque_id_is_valid(operation_id) {
            return self.snapshot();
        }
        let state = self.lock();
        if let Some(active) = &state.active {
            if active.id == operation_id {
                let _ = active.cancel.send(true);
            }
        }
        state.snapshot.clone()
    }

    pub(crate) fn install<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        watchers: &WatcherRegistry,
        request: InstallUpdateRequest,
    ) -> UpdateState {
        if !request.consent {
            return self.install_failure(
                UpdateError::new(
                    UpdateErrorCode::InstallBlocked,
                    UpdateStage::Admission,
                    false,
                )
                .detail("Explicit install consent is required."),
            );
        }
        let preparation = match prepare_installation(watchers, &request.drafts) {
            Ok(preparation) => preparation,
            Err(error) => return self.install_failure(map_admission_error(error)),
        };
        let revalidated = self.revalidate_install_candidate(&request.candidate_id);
        let (update, bytes, candidate) = match revalidated {
            Ok(value) => value,
            Err(error) => {
                drop(preparation);
                return self.install_failure(error);
            }
        };
        let record = HandoffRecord {
            schema_version: 1,
            candidate_id: candidate.candidate_id.clone(),
            from_version: env!("CARGO_PKG_VERSION").to_string(),
            expected_version: candidate.version.clone(),
            started_at_unix_seconds: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        };
        if persist_handoff(&self.0.handoff_path, &record).is_err() {
            drop(preparation);
            return self.install_failure(install_handoff_error());
        }
        self.lock().snapshot = UpdateState::Installing {
            candidate_id: candidate.candidate_id,
        };
        if let Err(error) = update.install(&bytes) {
            let _ = fs::remove_file(&self.0.handoff_path);
            drop(preparation);
            return self.install_failure(map_install_error(error));
        }
        drop(preparation);
        app.restart()
    }

    fn revalidate_install_candidate(
        &self,
        candidate_id: &str,
    ) -> Result<(Update, Vec<u8>, UpdateCandidate), UpdateError> {
        if !opaque_id_is_valid(candidate_id) {
            return Err(stale_candidate_error(UpdateStage::Install));
        }
        let mut state = self.lock();
        let pending = state
            .candidate
            .as_mut()
            .ok_or_else(|| stale_candidate_error(UpdateStage::Install))?;
        if pending.public.candidate_id != candidate_id {
            return Err(stale_candidate_error(UpdateStage::Install));
        }
        if pending.verified_bytes.is_none() {
            return Err(UpdateError::new(
                UpdateErrorCode::SignatureInvalid,
                UpdateStage::Verify,
                false,
            )
            .detail("The update is not in the verified ready state."));
        }
        let mode = detect_installation_mode();
        if mode != pending.mode {
            return Err(stale_candidate_error(UpdateStage::Install));
        }
        if let Some(error) = installation_error(mode, UpdateStage::Install) {
            return Err(error);
        }
        let build_identity = BuildUpdateIdentity::current()?;
        if !build_identity.target_is_enabled(pending.public.target) {
            return Err(UpdateError::new(
                UpdateErrorCode::UnsupportedInstallation,
                UpdateStage::Install,
                false,
            )
            .detail("This target still requires signed A-to-B qualification."));
        }
        if !installation_is_writable(mode) {
            return Err(UpdateError::new(
                UpdateErrorCode::ReadOnlyInstallation,
                UpdateStage::Install,
                false,
            ));
        }
        let build_channel = build_identity.channel;
        let rebuilt = candidate_identity(
            build_channel,
            &pending.public.version,
            pending.public.target,
            mode,
            &format!("v{}", pending.public.version),
            &pending.manifest_digest,
            &pending.artifact_url,
            &pending.signature,
        );
        if rebuilt != pending.public.candidate_id {
            return Err(stale_candidate_error(UpdateStage::Install));
        }
        let bytes = pending.verified_bytes.take().ok_or_else(|| {
            UpdateError::new(
                UpdateErrorCode::SignatureInvalid,
                UpdateStage::Verify,
                false,
            )
            .detail("The update is not in the verified ready state.")
        })?;
        Ok((pending.update.clone(), bytes, pending.public.clone()))
    }

    fn install_failure(&self, error: UpdateError) -> UpdateState {
        let mut state = self.lock();
        let snapshot = if matches!(
            error.code,
            UpdateErrorCode::InstallBlocked
                | UpdateErrorCode::UnsupportedInstallation
                | UpdateErrorCode::ReadOnlyInstallation
        ) {
            state.candidate.as_ref().map_or_else(
                || UpdateState::Failed {
                    error: error.clone(),
                },
                |candidate| UpdateState::Blocked {
                    candidate: candidate.public.clone(),
                    error: error.clone(),
                },
            )
        } else {
            UpdateState::Failed { error }
        };
        state.snapshot = snapshot.clone();
        snapshot
    }

    #[cfg(test)]
    fn install_test_operation(&self, kind: ActiveOperationKind) -> String {
        let id = self.operation_id("test");
        let (cancel, _) = watch::channel(false);
        self.lock().active = Some(ActiveOperation {
            id: id.clone(),
            kind,
            cancel,
        });
        id
    }
}

async fn perform_check<R: Runtime>(app: &AppHandle<R>) -> CheckOutcome {
    let identity = match BuildUpdateIdentity::current() {
        Ok(identity) => identity,
        Err(error) => return CheckOutcome::Unavailable(error),
    };
    let target = match UpdateTarget::current() {
        Ok(target) => target,
        Err(error) => return CheckOutcome::Unavailable(error),
    };
    let endpoint = match identity.feed.parse() {
        Ok(endpoint) => endpoint,
        Err(_) => {
            return CheckOutcome::Unavailable(UpdateError::new(
                UpdateErrorCode::Internal,
                UpdateStage::Check,
                false,
            ))
        }
    };
    let updater = match app
        .updater_builder()
        .pubkey(identity.public_key.clone())
        .target(target.as_str())
        .endpoints(vec![endpoint])
        .and_then(|builder| {
            builder
                .timeout(CHECK_TIMEOUT)
                .configure_client(configure_http_client)
                .version_comparator(|_, _| true)
                .build()
        }) {
        Ok(updater) => updater,
        Err(error) => return classify_plugin_check_error(error),
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return CheckOutcome::Current,
        Err(error) => return classify_plugin_check_error(error),
    };
    validate_candidate(identity, target, update)
}

impl BuildUpdateIdentity {
    fn current() -> Result<Self, UpdateError> {
        debug_assert_eq!(UPDATER_PLUGIN_VERSION, "2.11.0");
        build_update_identity(
            env!("CARGO_PKG_VERSION"),
            option_env!("GITODILE_UPDATER_PUBLIC_KEY").unwrap_or(""),
            option_env!("GITODILE_UPDATER_PUBLIC_KEY_ID").unwrap_or(""),
        )
    }

    fn target_is_enabled(&self, target: UpdateTarget) -> bool {
        production_target_is_enabled(self.channel, target)
    }
}

/// The installed feed is derived from the compiled version's channel and the
/// reviewed public key baked in at build time. There is no other routing: a
/// build cannot be pointed at another feed or key by configuration or by the
/// renderer.
fn build_update_identity(
    version_text: &str,
    public_key: &str,
    public_key_id: &str,
) -> Result<BuildUpdateIdentity, UpdateError> {
    let (version, channel) = parse_release_version(version_text).ok_or_else(|| {
        UpdateError::new(UpdateErrorCode::InvalidVersion, UpdateStage::Check, false)
    })?;
    if public_key.is_empty()
        || public_key.len() > PUBLIC_KEY_BYTES_LIMIT
        || public_key_id.is_empty()
        || public_key_id.len() > PUBLIC_KEY_ID_BYTES_LIMIT
        || !public_key_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(
            UpdateError::new(UpdateErrorCode::Internal, UpdateStage::Check, false)
                .detail("Update verification is not configured for this build."),
        );
    }
    let feed = match channel {
        ReleaseChannel::Stable => STABLE_FEED,
        ReleaseChannel::Preview => PREVIEW_FEED,
    };
    Ok(BuildUpdateIdentity {
        version,
        channel,
        feed,
        public_key: public_key.to_string(),
        public_key_id: public_key_id.to_string(),
    })
}

fn configure_http_client(client: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    client
        .https_only(true)
        .connect_timeout(CHECK_TIMEOUT)
        .read_timeout(DOWNLOAD_IDLE_TIMEOUT)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= REDIRECT_LIMIT {
                attempt.error(std::io::Error::other("too many redirects"))
            } else if allowed_redirect_url(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
}

fn allowed_redirect_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "raw.githubusercontent.com"
                    | "github.com"
                    | "objects.githubusercontent.com"
                    | "release-assets.githubusercontent.com"
            )
        )
}

fn validate_candidate(
    identity: BuildUpdateIdentity,
    target: UpdateTarget,
    update: Update,
) -> CheckOutcome {
    let validated_manifest = match validate_raw_manifest(
        target,
        &update.raw_json,
        PluginManifestSelection {
            version: &update.version,
            target: &update.target,
            notes: update.body.as_deref(),
            date: update.date.as_ref(),
            url: &update.download_url,
            signature: &update.signature,
        },
    ) {
        Ok(manifest) => manifest,
        Err(error) => return CheckOutcome::Failed(error),
    };
    let candidate_channel =
        match version_decision(identity.channel, &identity.version, &update.version) {
            Ok(Some(channel)) => channel,
            Ok(None) => return CheckOutcome::Current,
            Err(error) => return CheckOutcome::Failed(error),
        };
    let notes = match plain_text_notes(update.body.as_deref().unwrap_or("")) {
        Ok(notes) => notes,
        Err(error) => return CheckOutcome::Failed(error),
    };
    if !valid_artifact_url(&update.download_url, &update.version) {
        return CheckOutcome::Failed(UpdateError::new(
            UpdateErrorCode::InvalidManifest,
            UpdateStage::Check,
            false,
        ));
    }
    let expected_bytes = Some(validated_manifest.expected_bytes);
    let mode = detect_installation_mode();
    let manifest_digest = hex_digest(Sha256::digest(&validated_manifest.bytes));
    let artifact_url = update.download_url.as_str().to_string();
    let candidate_id = candidate_identity(
        identity.channel,
        &update.version,
        target,
        mode,
        &format!("v{}", update.version),
        &manifest_digest,
        &artifact_url,
        &update.signature,
    );
    let public = UpdateCandidate {
        candidate_id,
        version: update.version.clone(),
        channel: candidate_channel,
        target,
        published_at: update.date.and_then(|date| date.format(&Rfc3339).ok()),
        notes,
        expected_bytes,
    };
    let _ = identity.public_key_id;
    CheckOutcome::Candidate(Box::new(PendingCandidate {
        public,
        mode,
        manifest_digest,
        artifact_url,
        signature: update.signature.clone(),
        update,
        verified_bytes: None,
    }))
}

#[derive(Debug)]
struct ValidatedManifest {
    bytes: Vec<u8>,
    expected_bytes: u64,
}

struct PluginManifestSelection<'a> {
    version: &'a str,
    target: &'a str,
    notes: Option<&'a str>,
    date: Option<&'a OffsetDateTime>,
    url: &'a reqwest::Url,
    signature: &'a str,
}

fn invalid_manifest() -> UpdateError {
    UpdateError::new(UpdateErrorCode::InvalidManifest, UpdateStage::Check, false)
}

fn validate_raw_manifest(
    target: UpdateTarget,
    raw_json: &serde_json::Value,
    parsed: PluginManifestSelection<'_>,
) -> Result<ValidatedManifest, UpdateError> {
    let bytes = serde_json::to_vec(raw_json).map_err(|_| invalid_manifest())?;
    if bytes.len() as u64 > MANIFEST_BYTES_LIMIT {
        return Err(invalid_manifest());
    }
    let object = raw_json.as_object().ok_or_else(invalid_manifest)?;
    if object.len() != 4
        || !["version", "notes", "pub_date", "platforms"]
            .into_iter()
            .all(|key| object.contains_key(key))
        || object.get("version").and_then(serde_json::Value::as_str) != Some(parsed.version)
        || parsed.target != target.as_str()
    {
        return Err(invalid_manifest());
    }
    match (object.get("notes"), parsed.notes) {
        (Some(serde_json::Value::String(raw)), Some(parsed)) if raw == parsed => {}
        (Some(serde_json::Value::Null), None) => {}
        _ => return Err(invalid_manifest()),
    }
    match (object.get("pub_date"), parsed.date) {
        (Some(serde_json::Value::Null), None) => {}
        (Some(serde_json::Value::String(raw)), Some(parsed))
            if parsed.format(&Rfc3339).is_ok_and(|value| value == *raw) => {}
        _ => return Err(invalid_manifest()),
    }
    let platforms = object
        .get("platforms")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(invalid_manifest)?;
    if platforms.is_empty() || platforms.len() > PLATFORM_ENTRIES_LIMIT {
        return Err(invalid_manifest());
    }
    let mut selected_size = None;
    for (key, value) in platforms {
        let platform_target = UpdateTarget::from_key(key).ok_or_else(invalid_manifest)?;
        if !matches!(
            platform_target,
            UpdateTarget::WindowsX86_64 | UpdateTarget::LinuxX86_64
        ) {
            return Err(invalid_manifest());
        }
        let platform = value.as_object().ok_or_else(invalid_manifest)?;
        if platform.len() != 3
            || !["url", "signature", "size"]
                .into_iter()
                .all(|field| platform.contains_key(field))
        {
            return Err(invalid_manifest());
        }
        let url_text = platform
            .get("url")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(invalid_manifest)?;
        let url = reqwest::Url::parse(url_text).map_err(|_| invalid_manifest())?;
        if !valid_artifact_url(&url, parsed.version) {
            return Err(invalid_manifest());
        }
        let signature = platform
            .get("signature")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty() && value.len() <= SIGNATURE_BYTES_LIMIT)
            .ok_or_else(invalid_manifest)?;
        let size = platform
            .get("size")
            .and_then(serde_json::Value::as_u64)
            .filter(|value| *value > 0)
            .ok_or_else(invalid_manifest)?;
        if size > ARTIFACT_BYTES_LIMIT {
            return Err(UpdateError::new(
                UpdateErrorCode::PayloadTooLarge,
                UpdateStage::Check,
                false,
            ));
        }
        if platform_target == target {
            if url.as_str() != parsed.url.as_str() || signature != parsed.signature {
                return Err(invalid_manifest());
            }
            selected_size = Some(size);
        }
    }
    let expected_bytes = selected_size.ok_or_else(|| {
        UpdateError::new(
            UpdateErrorCode::TargetUnavailable,
            UpdateStage::Check,
            false,
        )
    })?;
    Ok(ValidatedManifest {
        bytes,
        expected_bytes,
    })
}

fn valid_artifact_url(url: &reqwest::Url, version: &str) -> bool {
    if url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    let expected = format!("{RELEASE_PREFIX}v{version}/");
    url.host_str() == Some("github.com")
        && url.path().starts_with(&expected)
        && url.path().len() > expected.len()
}

fn parse_release_version(value: &str) -> Option<(Version, ReleaseChannel)> {
    if value.is_empty() || value.starts_with('v') || value.contains('+') {
        return None;
    }
    let version = Version::parse(value).ok()?;
    for component in value.split(['.', '-']) {
        if component.len() > 1
            && component.starts_with('0')
            && component.bytes().all(|byte| byte.is_ascii_digit())
        {
            return None;
        }
    }
    let channel = if version.pre == semver::Prerelease::EMPTY {
        ReleaseChannel::Stable
    } else {
        let prefix = format!(
            "{}.{}.{}-preview.",
            version.major, version.minor, version.patch
        );
        let number = value.strip_prefix(&prefix)?;
        if number.is_empty()
            || number == "0"
            || (number.len() > 1 && number.starts_with('0'))
            || !number.bytes().all(|byte| byte.is_ascii_digit())
        {
            return None;
        }
        ReleaseChannel::Preview
    };
    Some((version, channel))
}

fn version_decision(
    installed_channel: ReleaseChannel,
    installed_version: &Version,
    candidate: &str,
) -> Result<Option<ReleaseChannel>, UpdateError> {
    let (candidate_version, candidate_channel) =
        parse_release_version(candidate).ok_or_else(|| {
            UpdateError::new(UpdateErrorCode::InvalidVersion, UpdateStage::Check, false)
        })?;
    if installed_channel == ReleaseChannel::Stable && candidate_channel == ReleaseChannel::Preview {
        return Err(UpdateError::new(
            UpdateErrorCode::ChannelMismatch,
            UpdateStage::Check,
            false,
        ));
    }
    Ok((candidate_version > *installed_version).then_some(candidate_channel))
}

fn plain_text_notes(notes: &str) -> Result<String, UpdateError> {
    if notes.len() > NOTES_BYTES_LIMIT {
        return Err(UpdateError::new(
            UpdateErrorCode::NotesTooLarge,
            UpdateStage::Check,
            false,
        ));
    }
    let mut plain = String::with_capacity(notes.len());
    let mut in_tag = false;
    let mut link_depth = 0_u8;
    let mut just_closed_label = false;
    for character in notes.chars() {
        match character {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            '(' if !in_tag && just_closed_label => {
                link_depth = 1;
                just_closed_label = false;
            }
            ')' if link_depth > 0 => link_depth = 0,
            '\r' => {}
            ']' if !in_tag && link_depth == 0 => just_closed_label = true,
            '*' | '_' | '`' | '#' | '[' if !in_tag && link_depth == 0 => {}
            value if !in_tag && link_depth == 0 && (!value.is_control() || value == '\n') => {
                just_closed_label = false;
                plain.push(value)
            }
            _ => {}
        }
    }
    Ok(plain.trim().to_string())
}

#[allow(clippy::too_many_arguments)]
fn candidate_identity(
    channel: ReleaseChannel,
    version: &str,
    target: UpdateTarget,
    mode: InstallationMode,
    release_tag: &str,
    manifest_digest: &str,
    artifact_url: &str,
    signature: &str,
) -> String {
    let mut hash = Sha256::new();
    for part in [
        "gitodile-update-candidate-v1",
        match channel {
            ReleaseChannel::Stable => "stable",
            ReleaseChannel::Preview => "preview",
        },
        version,
        target.as_str(),
        mode.as_str(),
        release_tag,
        manifest_digest,
        artifact_url,
        signature,
    ] {
        hash.update(part.as_bytes());
        hash.update([0]);
    }
    hex_digest(hash.finalize())
}

fn hex_digest(bytes: impl AsRef<[u8]>) -> String {
    use std::fmt::Write as _;
    let mut output = String::with_capacity(bytes.as_ref().len() * 2);
    for byte in bytes.as_ref() {
        let _ = write!(output, "{byte:02x}");
    }
    output
}

fn opaque_id_is_valid(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn detect_installation_mode() -> InstallationMode {
    if cfg!(target_os = "windows") {
        let executable = std::env::current_exe().unwrap_or_default();
        let display = executable.to_string_lossy().to_ascii_lowercase();
        if display.starts_with("\\\\")
            || std::env::temp_dir()
                .canonicalize()
                .is_ok_and(|temporary| executable.starts_with(temporary))
        {
            return InstallationMode::MountedImage;
        }
        if display.contains("\\windowsapps\\") {
            return InstallationMode::Store;
        }
        return match tauri::utils::platform::bundle_type() {
            Some(BundleType::Nsis) => {
                if std::env::var_os("LOCALAPPDATA")
                    .map(PathBuf::from)
                    .is_some_and(|root| executable.starts_with(root))
                {
                    InstallationMode::WindowsNsisPerUser
                } else {
                    InstallationMode::WindowsMachineWide
                }
            }
            Some(BundleType::Msi) => InstallationMode::WindowsMsi,
            _ => InstallationMode::Unsupported,
        };
    }
    if cfg!(target_os = "macos") {
        let executable = std::env::current_exe().unwrap_or_default();
        return macos_installation_mode(&executable);
    }
    if cfg!(target_os = "linux") {
        if std::env::var_os("SNAP").is_some() || std::env::var_os("FLATPAK_ID").is_some() {
            return InstallationMode::ManagedPackage;
        }
        if let Some(appimage) = std::env::var_os("APPIMAGE").map(PathBuf::from) {
            let display = appimage.to_string_lossy();
            return if display.starts_with("/mnt/")
                || display.starts_with("/media/")
                || display.starts_with("/run/media/")
                || appimage.starts_with(std::env::temp_dir())
            {
                InstallationMode::MountedImage
            } else if appimage.is_file() {
                InstallationMode::LinuxAppImage
            } else {
                InstallationMode::MountedImage
            };
        }
        return match tauri::utils::platform::bundle_type() {
            Some(BundleType::Deb | BundleType::Rpm) => InstallationMode::ManagedPackage,
            _ => InstallationMode::Unsupported,
        };
    }
    InstallationMode::Unsupported
}

fn macos_app_bundle(executable: &Path) -> Option<&Path> {
    executable.ancestors().find(|path| {
        path.extension()
            .and_then(std::ffi::OsStr::to_str)
            .is_some_and(|extension| extension.eq_ignore_ascii_case("app"))
    })
}

fn macos_installation_mode(executable: &Path) -> InstallationMode {
    macos_installation_mode_at(executable, &std::env::temp_dir())
}

fn macos_installation_mode_at(executable: &Path, temporary_root: &Path) -> InstallationMode {
    let display = executable.to_string_lossy().replace('\\', "/");
    if display.starts_with("/Volumes/")
        || display.contains("/AppTranslocation/")
        || display.starts_with("/private/var/folders/")
        || executable.starts_with(temporary_root)
    {
        return InstallationMode::MountedImage;
    }
    let Some(bundle) = macos_app_bundle(executable) else {
        return InstallationMode::Unsupported;
    };
    if bundle.join("Contents/_MASReceipt/receipt").is_file() {
        InstallationMode::Store
    } else {
        InstallationMode::MacosAppBundle
    }
}

fn installation_error(mode: InstallationMode, stage: UpdateStage) -> Option<UpdateError> {
    match mode {
        InstallationMode::WindowsNsisPerUser
        | InstallationMode::MacosAppBundle
        | InstallationMode::LinuxAppImage => None,
        InstallationMode::MountedImage => Some(UpdateError::new(
            UpdateErrorCode::ReadOnlyInstallation,
            stage,
            false,
        )),
        _ => Some(UpdateError::new(
            UpdateErrorCode::UnsupportedInstallation,
            stage,
            false,
        )),
    }
}

fn installation_is_writable(mode: InstallationMode) -> bool {
    let path = match mode {
        InstallationMode::LinuxAppImage => std::env::var_os("APPIMAGE")
            .map(PathBuf::from)
            .and_then(|path| path.parent().map(Path::to_path_buf)),
        InstallationMode::WindowsNsisPerUser => std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf)),
        InstallationMode::MacosAppBundle => std::env::current_exe()
            .ok()
            .and_then(|path| macos_app_bundle(&path).map(Path::to_path_buf))
            .and_then(|bundle| bundle.parent().map(Path::to_path_buf)),
        _ => None,
    };
    let Some(path) = path else { return false };
    let Ok(metadata) = fs::metadata(&path) else {
        return false;
    };
    if metadata.permissions().readonly() {
        return false;
    }
    if !metadata.is_dir() {
        return false;
    }
    let directory = path;
    let probe = directory.join(format!(
        ".gitodile-update-write-probe-{}",
        std::process::id()
    ));
    match OpenOptions::new().write(true).create_new(true).open(&probe) {
        Ok(file) => {
            drop(file);
            fs::remove_file(probe).is_ok()
        }
        Err(_) => false,
    }
}

fn target_list_contains(list: &str, target: UpdateTarget) -> bool {
    list.split(',')
        .map(str::trim)
        .any(|entry| entry == target.as_str())
}

fn production_target_is_enabled(channel: ReleaseChannel, target: UpdateTarget) -> bool {
    production_target_is_enabled_for_lists(
        channel,
        target,
        option_env!("GITODILE_QUALIFIED_UPDATE_TARGETS").unwrap_or(""),
        option_env!("GITODILE_PREVIEW_TEST_UPDATE_TARGETS").unwrap_or(""),
    )
}

fn production_target_is_enabled_for_lists(
    channel: ReleaseChannel,
    target: UpdateTarget,
    qualified_targets: &str,
    preview_test_targets: &str,
) -> bool {
    target_list_contains(qualified_targets, target)
        || (channel == ReleaseChannel::Preview
            && target_list_contains(preview_test_targets, target))
}

fn map_reqwest_check_error(error: reqwest::Error) -> UpdateError {
    classify_network_error(
        error.is_timeout(),
        error.is_connect(),
        error.status().map(|status| status.as_u16()),
        UpdateStage::Check,
    )
}

fn classify_network_error(
    timeout: bool,
    connect: bool,
    status: Option<u16>,
    stage: UpdateStage,
) -> UpdateError {
    if timeout {
        UpdateError::new(UpdateErrorCode::Timeout, stage, true)
    } else if connect {
        UpdateError::new(UpdateErrorCode::Offline, stage, true)
    } else if let Some(status) = status {
        UpdateError::status(status, stage)
    } else {
        UpdateError::new(UpdateErrorCode::FeedUnavailable, stage, true)
    }
}

fn classify_check_error(error: UpdateError) -> CheckOutcome {
    match error.code {
        UpdateErrorCode::Offline
        | UpdateErrorCode::Timeout
        | UpdateErrorCode::HttpStatus
        | UpdateErrorCode::FeedUnavailable => CheckOutcome::Unavailable(error),
        _ => CheckOutcome::Failed(error),
    }
}

fn classify_plugin_check_error(error: tauri_plugin_updater::Error) -> CheckOutcome {
    use tauri_plugin_updater::Error;
    let mapped = match error {
        Error::Serialization(_) => {
            UpdateError::new(UpdateErrorCode::InvalidManifest, UpdateStage::Check, false)
        }
        Error::Semver(_) => {
            UpdateError::new(UpdateErrorCode::InvalidVersion, UpdateStage::Check, false)
        }
        Error::TargetNotFound(_) | Error::TargetsNotFound(_) => UpdateError::new(
            UpdateErrorCode::TargetUnavailable,
            UpdateStage::Check,
            false,
        ),
        Error::ReleaseNotFound => {
            UpdateError::new(UpdateErrorCode::FeedUnavailable, UpdateStage::Check, true)
        }
        Error::UnsupportedArch | Error::UnsupportedOs => UpdateError::new(
            UpdateErrorCode::UnsupportedInstallation,
            UpdateStage::Check,
            false,
        ),
        Error::Reqwest(error) => map_reqwest_check_error(error),
        _ => UpdateError::new(UpdateErrorCode::Internal, UpdateStage::Check, false),
    };
    classify_check_error(mapped)
}

fn map_download_error(
    error: tauri_plugin_updater::Error,
    received: u64,
    expected: Option<u64>,
) -> UpdateError {
    use tauri_plugin_updater::Error;
    if expected.is_some_and(|length| received < length) {
        return UpdateError::new(
            UpdateErrorCode::TruncatedDownload,
            UpdateStage::Download,
            true,
        );
    }
    match error {
        Error::Minisign(_) | Error::SignatureUtf8(_) | Error::Base64(_) => UpdateError::new(
            UpdateErrorCode::SignatureInvalid,
            UpdateStage::Verify,
            false,
        ),
        Error::Reqwest(error) if error.is_timeout() => {
            UpdateError::new(UpdateErrorCode::Timeout, UpdateStage::Download, true)
        }
        Error::Reqwest(error) if error.is_connect() => {
            UpdateError::new(UpdateErrorCode::Offline, UpdateStage::Download, true)
        }
        Error::Network(message) => parse_http_status(&message).map_or_else(
            || {
                UpdateError::new(
                    UpdateErrorCode::FeedUnavailable,
                    UpdateStage::Download,
                    true,
                )
            },
            |status| UpdateError::status(status, UpdateStage::Download),
        ),
        Error::Io(error) if error.kind() == std::io::ErrorKind::StorageFull => UpdateError::new(
            UpdateErrorCode::InsufficientSpace,
            UpdateStage::Download,
            true,
        ),
        _ => UpdateError::new(UpdateErrorCode::Internal, UpdateStage::Download, true),
    }
}

fn validate_download_lengths(
    buffered: u64,
    received: u64,
    transport_expected: Option<u64>,
    manifest_expected: Option<u64>,
) -> Result<(), UpdateError> {
    if buffered > ARTIFACT_BYTES_LIMIT || received > ARTIFACT_BYTES_LIMIT {
        return Err(UpdateError::new(
            UpdateErrorCode::PayloadTooLarge,
            UpdateStage::Download,
            false,
        ));
    }
    if buffered != received
        || transport_expected.is_some_and(|length| length != received)
        || manifest_expected.is_some_and(|length| length != received)
    {
        return Err(UpdateError::new(
            UpdateErrorCode::TruncatedDownload,
            UpdateStage::Download,
            true,
        ));
    }
    Ok(())
}

fn map_install_error(error: tauri_plugin_updater::Error) -> UpdateError {
    match error {
        tauri_plugin_updater::Error::Io(error)
            if error.kind() == std::io::ErrorKind::StorageFull =>
        {
            UpdateError::new(
                UpdateErrorCode::InsufficientSpace,
                UpdateStage::Install,
                true,
            )
            .detail("Free space, then download and install the update again.")
        }
        _ => install_handoff_error(),
    }
}

fn install_handoff_error() -> UpdateError {
    UpdateError::new(
        UpdateErrorCode::InstallHandoffFailed,
        UpdateStage::Install,
        true,
    )
    .detail("Try again or download the signed installer for this version and reinstall manually.")
}

fn parse_http_status(message: &str) -> Option<u16> {
    message
        .split(|character: char| !character.is_ascii_digit())
        .find_map(|part| {
            let status = part.parse::<u16>().ok()?;
            (400..=599).contains(&status).then_some(status)
        })
}

fn stale_candidate_error(stage: UpdateStage) -> UpdateError {
    UpdateError::new(UpdateErrorCode::InvalidManifest, stage, false)
        .detail("The update candidate is no longer current. Check again.")
}

fn action_failure(error: UpdateError) -> UpdateAction {
    UpdateAction {
        operation_id: None,
        coalesced: false,
        state: UpdateState::Failed { error },
    }
}

fn coalesced_check(state: &ServiceState) -> Option<UpdateAction> {
    let active = state.active.as_ref()?;
    (active.kind == ActiveOperationKind::Check).then(|| UpdateAction {
        operation_id: Some(active.id.clone()),
        coalesced: true,
        state: state.snapshot.clone(),
    })
}

fn active_matches(state: &ServiceState, id: &str, kind: ActiveOperationKind) -> bool {
    matches!(state.active.as_ref(), Some(active) if active.id == id && active.kind == kind)
}

async fn wait_for_cancellation(
    mut receiver: watch::Receiver<bool>,
    application: CancellationToken,
) {
    loop {
        if *receiver.borrow() || application.is_cancelled() {
            return;
        }
        tokio::select! {
            changed = receiver.changed() => if changed.is_err() || *receiver.borrow() { return },
            _ = tokio::time::sleep(Duration::from_millis(25)) => {}
        }
    }
}

fn prepare_installation(
    watchers: &WatcherRegistry,
    drafts: &DraftPreparation,
) -> Result<InstallPreparation, AppError> {
    if drafts.protected_count > 4096
        || drafts.blockers.len() > 32
        || drafts.blockers.iter().any(|label| {
            label.is_empty() || label.len() > 96 || label.chars().any(char::is_control)
        })
    {
        return Err(AppError::new(
            AppErrorCode::InstallBlocked,
            "Some unfinished edits could not be verified for restart.",
        ));
    }
    let admission = application::begin_install_admission(READ_DRAIN_TIMEOUT)?;
    if let Some(label) = drafts.blockers.first() {
        return Err(AppError::new(
            AppErrorCode::InstallBlocked,
            "Some unfinished edits could not be protected for restart.",
        )
        .with_remediation(format!(
            "Save or discard the unfinished {label} edit, then choose Install and restart again."
        )));
    }
    Ok(InstallPreparation {
        watchers: Some(watchers.suspend_all()),
        admission: Some(admission),
    })
}

fn map_admission_error(error: AppError) -> UpdateError {
    UpdateError::new(
        UpdateErrorCode::InstallBlocked,
        UpdateStage::Admission,
        true,
    )
    .detail(error.remediation.unwrap_or(error.message))
}

fn persist_handoff(path: &Path, record: &HandoffRecord) -> std::io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::other("handoff path has no parent"))?;
    fs::create_dir_all(parent)?;
    let bytes = serde_json::to_vec(record).map_err(std::io::Error::other)?;
    if bytes.len() > 2048 {
        return Err(std::io::Error::other("handoff record too large"));
    }
    let temporary = parent.join(format!("{HANDOFF_FILE}.new"));
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

fn confirm_handoff(path: &Path, running_version: &str) -> StartupUpdateConfirmation {
    if !path.is_file() {
        return StartupUpdateConfirmation::None;
    }
    let record = fs::read(path)
        .ok()
        .filter(|bytes| bytes.len() <= 2048)
        .and_then(|bytes| serde_json::from_slice::<HandoffRecord>(&bytes).ok());
    let _ = fs::remove_file(path);
    let Some(record) = record.filter(valid_handoff_record) else {
        return StartupUpdateConfirmation::Unconfirmed {
            expected_version: String::new(),
            error: UpdateError::new(
                UpdateErrorCode::PostInstallUnconfirmed,
                UpdateStage::Startup,
                false,
            )
            .detail(
                "The install result could not be verified. Reinstall the latest signed version manually; GitOdile will not downgrade automatically.",
            ),
        };
    };
    if running_version == record.expected_version {
        StartupUpdateConfirmation::Confirmed {
            version: running_version.to_string(),
        }
    } else {
        StartupUpdateConfirmation::Unconfirmed {
            expected_version: record.expected_version,
            error: UpdateError::new(
                UpdateErrorCode::PostInstallUnconfirmed,
                UpdateStage::Startup,
                false,
            )
            .detail(
                "The running version did not confirm the attempted update. Reinstall the latest signed version manually; GitOdile will not downgrade automatically.",
            ),
        }
    }
}

fn valid_handoff_record(record: &HandoffRecord) -> bool {
    let versions = parse_release_version(&record.from_version)
        .zip(parse_release_version(&record.expected_version));
    let forward = versions.is_some_and(|((from, _), (expected, _))| expected > from);
    let timestamp_is_plausible = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .saturating_add(300)
        >= record.started_at_unix_seconds;
    record.schema_version == 1
        && opaque_id_is_valid(&record.candidate_id)
        && record.from_version.len() <= 64
        && record.expected_version.len() <= 64
        && forward
        && timestamp_is_plausible
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "unknown".to_string())
}

fn bound_safe_detail(detail: &str) -> String {
    let redacted = detail
        .chars()
        .filter(|character| !character.is_control() || *character == '\n')
        .collect::<String>();
    let mut end = redacted.len().min(SAFE_DETAIL_BYTES_LIMIT);
    while !redacted.is_char_boundary(end) {
        end -= 1;
    }
    redacted[..end].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::InstallAdmissionCoordinator;
    use crate::test_support::unique_temp_dir;
    use crate::watch::WatchPaths;
    use base64::Engine;
    use std::sync::Arc;

    #[test]
    fn strict_versions_and_preview_order_are_enforced() {
        for valid in ["0.2.0", "0.2.0-preview.1", "10.20.30-preview.42"] {
            assert!(parse_release_version(valid).is_some(), "{valid}");
        }
        for invalid in [
            "v0.2.0",
            "01.2.0",
            "0.02.0",
            "0.2.00",
            "0.2.0-preview.0",
            "0.2.0-preview.01",
            "0.2.0-alpha.1",
            "0.2.0-preview.1+build.7",
        ] {
            assert!(parse_release_version(invalid).is_none(), "{invalid}");
        }
        let a = parse_release_version("0.2.0-preview.2").unwrap().0;
        let b = parse_release_version("0.2.0-preview.3").unwrap().0;
        let stable = parse_release_version("0.2.0").unwrap().0;
        assert!(a < b && b < stable);
    }

    #[test]
    fn version_decisions_cover_equal_older_upgrade_and_channel_mismatch() {
        let stable = Version::parse("1.2.3").unwrap();
        assert_eq!(
            version_decision(ReleaseChannel::Stable, &stable, "1.2.3").unwrap(),
            None
        );
        assert_eq!(
            version_decision(ReleaseChannel::Stable, &stable, "1.2.2").unwrap(),
            None
        );
        assert_eq!(
            version_decision(ReleaseChannel::Stable, &stable, "1.2.4").unwrap(),
            Some(ReleaseChannel::Stable)
        );
        assert_eq!(
            version_decision(ReleaseChannel::Stable, &stable, "1.3.0-preview.1")
                .unwrap_err()
                .code,
            UpdateErrorCode::ChannelMismatch
        );
        let preview = Version::parse("1.2.3-preview.2").unwrap();
        assert_eq!(
            version_decision(ReleaseChannel::Preview, &preview, "1.2.3-preview.3").unwrap(),
            Some(ReleaseChannel::Preview)
        );
        assert_eq!(
            version_decision(ReleaseChannel::Preview, &preview, "1.2.3").unwrap(),
            Some(ReleaseChannel::Stable)
        );
    }

    #[test]
    fn notes_are_bounded_plain_text() {
        assert_eq!(
            plain_text_notes("# Hello <b>friend</b> [site](https://invalid)").unwrap(),
            "Hello friend site"
        );
        assert_eq!(
            plain_text_notes(&"x".repeat(NOTES_BYTES_LIMIT + 1))
                .unwrap_err()
                .code,
            UpdateErrorCode::NotesTooLarge
        );
    }

    #[test]
    fn artifact_origin_and_version_are_locked() {
        let valid = reqwest::Url::parse(
            "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.2/GitOdile.exe").unwrap();
        assert!(valid_artifact_url(&valid, "0.2.0-preview.2"));
        for invalid in [
            "http://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.2/x",
            "https://evil.invalid/martinezelx/gitodile/releases/download/v0.2.0-preview.2/x",
            "https://github.com/martinezelx/gitodile/releases/latest/download/x",
            "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.3/x",
            "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.2/",
            "https://user:pw@github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.2/x",
            "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.2/x?token=1",
        ] {
            assert!(
                !valid_artifact_url(&reqwest::Url::parse(invalid).unwrap(), "0.2.0-preview.2"),
                "{invalid}"
            );
        }
    }

    #[test]
    fn build_identity_is_derived_only_from_version_and_reviewed_key() {
        let preview = build_update_identity("0.2.0-preview.9", "public-key", "key-id").unwrap();
        assert_eq!(preview.channel, ReleaseChannel::Preview);
        assert_eq!(preview.feed, PREVIEW_FEED);
        let stable = build_update_identity("0.2.0", "public-key", "key-id").unwrap();
        assert_eq!(stable.channel, ReleaseChannel::Stable);
        assert_eq!(stable.feed, STABLE_FEED);
        for (version, key, key_id) in [
            ("0.2.0-alpha.1", "public-key", "key-id"),
            ("0.2.0-preview.9", "", "key-id"),
            ("0.2.0-preview.9", "public-key", ""),
            ("0.2.0-preview.9", "public-key", "key id with spaces"),
        ] {
            assert!(
                build_update_identity(version, key, key_id).is_err(),
                "{version}"
            );
        }
    }

    #[test]
    fn preview_testing_targets_do_not_imply_stable_qualification() {
        let targets = "windows-x86_64,linux-x86_64";
        for target in [UpdateTarget::WindowsX86_64, UpdateTarget::LinuxX86_64] {
            assert!(production_target_is_enabled_for_lists(
                ReleaseChannel::Preview,
                target,
                "",
                targets,
            ));
            assert!(!production_target_is_enabled_for_lists(
                ReleaseChannel::Stable,
                target,
                "",
                targets,
            ));
            assert!(production_target_is_enabled_for_lists(
                ReleaseChannel::Stable,
                target,
                targets,
                "",
            ));
        }
        assert!(!production_target_is_enabled_for_lists(
            ReleaseChannel::Preview,
            UpdateTarget::DarwinAarch64,
            "",
            targets,
        ));
    }

    #[test]
    fn raw_manifest_is_closed_bounded_and_matches_the_plugin_selection() {
        let missing = classify_plugin_check_error(tauri_plugin_updater::Error::TargetNotFound(
            "windows-x86_64".to_string(),
        ));
        assert!(matches!(
            missing,
            CheckOutcome::Failed(UpdateError {
                code: UpdateErrorCode::TargetUnavailable,
                ..
            })
        ));
        let url = reqwest::Url::parse(
            "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.10/GitOdile_0.2.0-preview.10_x64-setup.exe",
        )
        .unwrap();
        let manifest = serde_json::json!({
            "version": "0.2.0-preview.10",
            "notes": "Corrected updater path",
            "pub_date": null,
            "platforms": {
                "windows-x86_64": {
                    "url": url.as_str(),
                    "signature": "signature",
                    "size": 7
                },
                "linux-x86_64": {
                    "url": "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.10/GitOdile_0.2.0-preview.10_amd64.AppImage",
                    "signature": "linux-signature",
                    "size": 9
                }
            }
        });
        let validated = validate_raw_manifest(
            UpdateTarget::WindowsX86_64,
            &manifest,
            PluginManifestSelection {
                version: "0.2.0-preview.10",
                target: "windows-x86_64",
                notes: Some("Corrected updater path"),
                date: None,
                url: &url,
                signature: "signature",
            },
        )
        .unwrap();
        assert_eq!(validated.expected_bytes, 7);

        for invalid in [
            {
                let mut value = manifest.clone();
                value
                    .as_object_mut()
                    .unwrap()
                    .insert("extra".into(), true.into());
                value
            },
            {
                let mut value = manifest.clone();
                value["platforms"]["windows-x86_64"]["size"] = "7".into();
                value
            },
            {
                let mut value = manifest.clone();
                value["platforms"]["windows-x86_64"]["signature"] = "different".into();
                value
            },
            {
                let mut value = manifest.clone();
                value["platforms"]["windows-x86_64"]["url"] =
                    "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.9/GitOdile.exe".into();
                value
            },
            {
                let mut value = manifest.clone();
                value["platforms"]["darwin-aarch64"] = serde_json::json!({
                    "url": "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.10/GitOdile.app.tar.gz",
                    "signature": "mac-signature",
                    "size": 9
                });
                value
            },
        ] {
            assert_eq!(
                validate_raw_manifest(
                    UpdateTarget::WindowsX86_64,
                    &invalid,
                    PluginManifestSelection {
                        version: "0.2.0-preview.10",
                        target: "windows-x86_64",
                        notes: Some("Corrected updater path"),
                        date: None,
                        url: &url,
                        signature: "signature",
                    },
                )
                .unwrap_err()
                .code,
                UpdateErrorCode::InvalidManifest
            );
        }

        for allowed in [
            "https://raw.githubusercontent.com/x",
            "https://github.com/x",
            "https://objects.githubusercontent.com/x",
            "https://release-assets.githubusercontent.com/x",
        ] {
            assert!(allowed_redirect_url(&reqwest::Url::parse(allowed).unwrap()));
        }
        for denied in [
            "https://example.invalid/x",
            "http://github.com/x",
            "https://github.com:8443/x",
            "https://user:pw@github.com/x",
        ] {
            assert!(
                !allowed_redirect_url(&reqwest::Url::parse(denied).unwrap()),
                "{denied}"
            );
        }
    }

    #[test]
    fn the_plugin_check_is_the_only_feed_request_authority() {
        let source = include_str!("app_updates.rs");
        let production = source.split("\n#[cfg(test)]\nmod tests").next().unwrap();
        assert_eq!(production.matches("updater.check().await").count(), 1);
        assert!(!production.contains("fetch_bounded_manifest"));
        assert!(!production.contains("bytes_stream"));
        assert!(production.contains(".configure_client(configure_http_client)"));
    }

    #[test]
    fn check_requests_share_the_exact_active_operation() {
        let service = AppUpdateService::for_test();
        let id = service.install_test_operation(ActiveOperationKind::Check);
        service.lock().snapshot = UpdateState::Checking {
            operation_id: id.clone(),
            source: UpdateCheckSource::Background,
        };
        let action = coalesced_check(&service.lock()).unwrap();
        assert!(action.coalesced);
        assert_eq!(action.operation_id.as_deref(), Some(id.as_str()));
    }

    #[test]
    fn unsupported_and_read_only_modes_never_become_automatic() {
        for mode in [
            InstallationMode::WindowsMsi,
            InstallationMode::WindowsMachineWide,
            InstallationMode::ManagedPackage,
            InstallationMode::Store,
            InstallationMode::Unsupported,
        ] {
            assert!(!mode.automatic_candidate());
            assert_eq!(
                installation_error(mode, UpdateStage::Install).unwrap().code,
                UpdateErrorCode::UnsupportedInstallation
            );
        }
        assert_eq!(
            installation_error(InstallationMode::MountedImage, UpdateStage::Install)
                .unwrap()
                .code,
            UpdateErrorCode::ReadOnlyInstallation
        );
    }

    #[test]
    fn macos_paths_distinguish_installed_store_and_translocated_bundles() {
        let root = PathBuf::from(unique_temp_dir("update-macos-mode"));
        let bundle = root.join("GitOdile.app");
        let executable = bundle.join("Contents/MacOS/gitodile");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        assert_eq!(macos_app_bundle(&executable), Some(bundle.as_path()));
        assert_eq!(
            macos_installation_mode_at(&executable, Path::new("/private/tmp")),
            InstallationMode::MacosAppBundle
        );

        let receipt = bundle.join("Contents/_MASReceipt/receipt");
        fs::create_dir_all(receipt.parent().unwrap()).unwrap();
        fs::write(&receipt, b"fixture").unwrap();
        assert_eq!(
            macos_installation_mode_at(&executable, Path::new("/private/tmp")),
            InstallationMode::Store
        );
        assert_eq!(
            macos_installation_mode(Path::new(
                "/private/var/folders/x/AppTranslocation/GitOdile.app/Contents/MacOS/gitodile"
            )),
            InstallationMode::MountedImage
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn exact_cancellation_and_late_operations_are_inert() {
        let service = AppUpdateService::for_test();
        let first = service.install_test_operation(ActiveOperationKind::Check);
        service.cancel("another-operation");
        assert!(!*service.lock().active.as_ref().unwrap().cancel.borrow());
        let second = service.install_test_operation(ActiveOperationKind::Check);
        let receiver = service.lock().active.as_ref().unwrap().cancel.subscribe();
        service.finish_check(&first, CheckOutcome::Current);
        assert_eq!(service.lock().active.as_ref().unwrap().id, second);
        service.cancel(&second);
        assert!(*receiver.borrow());
    }

    #[test]
    fn length_cases_detect_known_unknown_oversize_and_truncation() {
        assert!(validate_download_lengths(7, 7, Some(7), Some(7)).is_ok());
        assert!(validate_download_lengths(7, 7, None, None).is_ok());
        assert_eq!(
            validate_download_lengths(3, 3, Some(7), None)
                .unwrap_err()
                .code,
            UpdateErrorCode::TruncatedDownload
        );
        assert_eq!(
            validate_download_lengths(
                ARTIFACT_BYTES_LIMIT + 1,
                ARTIFACT_BYTES_LIMIT + 1,
                None,
                None
            )
            .unwrap_err()
            .code,
            UpdateErrorCode::PayloadTooLarge
        );
    }

    #[test]
    fn network_error_taxonomy_remains_distinct() {
        assert_eq!(
            classify_network_error(true, false, None, UpdateStage::Check).code,
            UpdateErrorCode::Timeout
        );
        assert_eq!(
            classify_network_error(false, true, None, UpdateStage::Check).code,
            UpdateErrorCode::Offline
        );
        assert_eq!(
            classify_network_error(false, false, Some(503), UpdateStage::Check).code,
            UpdateErrorCode::HttpStatus
        );
        assert_eq!(
            classify_network_error(false, false, None, UpdateStage::Check).code,
            UpdateErrorCode::FeedUnavailable
        );
        assert_eq!(
            parse_http_status("status: 503 Service Unavailable"),
            Some(503)
        );
    }

    #[test]
    fn handoff_confirmation_is_version_observed_and_one_shot() {
        let root = PathBuf::from(unique_temp_dir("update-handoff"));
        fs::create_dir_all(&root).unwrap();
        let path = root.join(HANDOFF_FILE);
        let record = HandoffRecord {
            schema_version: 1,
            candidate_id: "a".repeat(64),
            from_version: "0.2.0-preview.2".into(),
            expected_version: "0.2.0-preview.3".into(),
            started_at_unix_seconds: 1,
        };
        persist_handoff(&path, &record).unwrap();
        assert!(matches!(
            confirm_handoff(&path, "0.2.0-preview.3"),
            StartupUpdateConfirmation::Confirmed { .. }
        ));
        assert_eq!(
            confirm_handoff(&path, "0.2.0-preview.3"),
            StartupUpdateConfirmation::None
        );
        persist_handoff(&path, &record).unwrap();
        assert!(matches!(
            confirm_handoff(&path, "0.2.0-preview.2"),
            StartupUpdateConfirmation::Unconfirmed { .. }
        ));

        let downgrade = HandoffRecord {
            from_version: "0.2.0-preview.3".into(),
            expected_version: "0.2.0-preview.2".into(),
            ..record
        };
        persist_handoff(&path, &downgrade).unwrap();
        assert!(matches!(
            confirm_handoff(&path, "0.2.0-preview.2"),
            StartupUpdateConfirmation::Unconfirmed { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn immutable_identity_includes_signature() {
        let make =
            |signature| {
                candidate_identity(
            ReleaseChannel::Preview, "0.2.0-preview.2", UpdateTarget::WindowsX86_64,
            InstallationMode::WindowsNsisPerUser, "v0.2.0-preview.2", "manifest",
            "https://github.com/martinezelx/gitodile/releases/download/v0.2.0-preview.2/a.exe",
            signature)
            };
        assert_ne!(make("signature"), make("changed"));
    }

    fn verifies_fixture(payload: &[u8], signature_path: &str) -> bool {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/app-updates");
        let decode = |value: &str| {
            base64::engine::general_purpose::STANDARD
                .decode(value.trim())
                .ok()
                .and_then(|bytes| String::from_utf8(bytes).ok())
        };
        let Some(public_text) = decode(&fs::read_to_string(root.join("public-key.txt")).unwrap())
        else {
            return false;
        };
        let Some(signature_text) = decode(&fs::read_to_string(root.join(signature_path)).unwrap())
        else {
            return false;
        };
        let Ok(public) = minisign_verify::PublicKey::decode(&public_text) else {
            return false;
        };
        let Ok(signature) = minisign_verify::Signature::decode(&signature_text) else {
            return false;
        };
        public.verify(payload, &signature, true).is_ok()
    }

    #[test]
    fn signature_fixtures_cover_valid_invalid_and_corrupt_content() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/app-updates");
        let payload = fs::read(root.join("payload.txt")).unwrap();
        assert!(verifies_fixture(&payload, "payload.txt.sig"));
        assert!(!verifies_fixture(&payload, "payload-invalid.sig"));
        let mut corrupt = payload;
        corrupt.push(b'!');
        assert!(!verifies_fixture(&corrupt, "payload.txt.sig"));
    }

    #[test]
    fn draft_blocker_reopens_admission_and_mutations_are_not_cancelled() {
        let coordinator = Arc::new(InstallAdmissionCoordinator::default());
        let cancellation = CancellationToken::default();
        let _mutation = coordinator.start_operation(
            "save_version",
            crate::git::InstallAdmissionPolicy::Block,
            Some(cancellation.clone()),
        );
        let error = coordinator
            .begin_install(Duration::from_millis(20))
            .err()
            .unwrap();
        assert_eq!(error.code, AppErrorCode::InstallBlocked);
        assert!(!cancellation.is_cancelled());
        assert_eq!(coordinator.active_count(), 1);
    }

    #[test]
    fn failed_preparation_and_drop_restore_watchers() {
        let registry = WatcherRegistry::default();
        let root = PathBuf::from(unique_temp_dir("app-update-watcher"));
        fs::create_dir_all(root.join(".git")).unwrap();
        let paths = WatchPaths {
            worktree: vec![root.clone()],
            git_dir: vec![root.join(".git")],
            common_git_dir: vec![root.join(".git")],
        };
        if !registry.watch_with("project", "epoch", "common", paths, |_| {}) {
            return;
        }
        assert_eq!(registry.watch_count(), 1);
        let preparation = prepare_installation(
            &registry,
            &DraftPreparation {
                protected_count: 1,
                blockers: Vec::new(),
            },
        )
        .unwrap();
        assert_eq!(registry.watch_count(), 0);
        drop(preparation);
        assert_eq!(registry.watch_count(), 1);
        registry.unwatch("project", "epoch");
        let _ = fs::remove_dir_all(root);
    }
}

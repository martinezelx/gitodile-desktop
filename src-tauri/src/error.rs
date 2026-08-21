//! Stable application error envelope shared by domains and IPC.

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppError {
    pub(crate) code: AppErrorCode,
    pub(crate) message: String,
    pub(crate) remediation: Option<String>,
    pub(crate) detail: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AppErrorCode {
    StaleSession,
    PathMissing,
    PathUnusable,
    NotRepository,
    BareRepository,
    InvalidCloneSource,
    InvalidCloneDestination,
    CloneDestinationExists,
    CloneDestinationCollides,
    StaleClonePlan,
    CloneOperationBusy,
    CloneOperationMissing,
    CloneVerificationFailed,
    ClonePublishUncertain,
    CloneCleanupRequired,
    CloneCleanupUnavailable,
    CloneFailed,
    Offline,
    CertificateFailed,
    HostKeyFailed,
    RemoteNotFound,
    DiskFull,
    PermissionDenied,
    PathTooLong,
    GitMissing,
    GitUnusable,
    GitCommandFailed,
    InvalidIdentity,
    GitConfigWriteFailed,
    PathInvalid,
    PathNotChanged,
    PathEncodingUnsupported,
    NothingToSave,
    UnresolvedConflicts,
    DetachedHead,
    GitOperationInProgress,
    MissingIdentity,
    EmptyTitle,
    InvalidTitle,
    StalePreview,
    HookRejected,
    SigningFailed,
    IndexUnavailable,
    IndexRestoreFailed,
    InvalidSelection,
    NoRemoteConfigured,
    RemoteSelectionRequired,
    UnbornBranchNoVersion,
    NothingToPublish,
    NothingToGet,
    BehindRemote,
    DivergedHistories,
    StalePublishPlan,
    StaleGetTeamChangesPlan,
    InvalidRefName,
    AuthenticationFailed,
    NetworkTimeout,
    OperationCancelled,
    InvalidRemoteConfiguration,
    RemoteRefMissing,
    RemoteRejected,
    PublishUncertain,
    GetTeamChangesUncertain,
    GitVersionTooOld,
    VersionLineNameTaken,
    VersionLineNameCollides,
    VersionLineCheckedOutElsewhere,
    VersionLineIsActive,
    VersionLineUniqueWork,
    VersionLineSwitchObstructed,
    StaleVersionLinePlan,
    DirtyWorkingTree,
    IncomingPathCollision,
    RefLocked,
    NothingToDiscard,
    StaleDiscardPlan,
    RecoveryUnavailable,
    RecoveryConflict,
    RecoveryFailed,
}

impl AppError {
    pub(crate) fn new(code: AppErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            remediation: None,
            detail: None,
        }
    }

    pub(crate) fn with_remediation(mut self, remediation: impl Into<String>) -> Self {
        self.remediation = Some(remediation.into());
        self
    }

    pub(crate) fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

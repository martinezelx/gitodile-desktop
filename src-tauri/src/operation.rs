//! Shared operation vocabulary and safe diagnostic presentation.

use crate::git;

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum OperationKind {
    ReadOnly,
    HistoryMutation,
    RemoteMutation,
    LocalMutation,
    Destructive,
    PlatformMutation,
}

impl OperationKind {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::HistoryMutation => "history-mutation",
            Self::RemoteMutation => "remote-mutation",
            Self::LocalMutation => "local-mutation",
            Self::Destructive => "destructive",
            Self::PlatformMutation => "platform-mutation",
        }
    }
}

const MAX_FAILURE_DETAIL_BYTES: usize = 4000;

/// Keeps secondary diagnostics useful without allowing noisy hooks or remote
/// output to inflate the error payload or expose URL credentials.
pub(crate) fn truncate_detail(text: &str) -> String {
    let trimmed = text.trim();
    let mut redacted = git::redact_diagnostic(trimmed.as_bytes(), MAX_FAILURE_DETAIL_BYTES);
    if trimmed.len() > MAX_FAILURE_DETAIL_BYTES {
        redacted.push('…');
    }
    redacted
}

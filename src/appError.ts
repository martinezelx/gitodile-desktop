import type { Translations } from "./i18n";

/** Mirrors the Rust `AppError` / `AppErrorCode` contract shared by every
 * Tauri command. Kept separate from `main.tsx` so other view modules (e.g.
 * `changes.tsx`) can localize command failures without importing the app
 * shell. */
export type AppError = {
  code:
    | "path_missing"
    | "path_unusable"
    | "not_repository"
    | "bare_repository"
    | "git_missing"
    | "git_unusable"
    | "git_command_failed"
    | "invalid_identity"
    | "git_config_write_failed"
    | "path_invalid"
    | "path_not_changed"
    | "path_encoding_unsupported"
    | "nothing_to_save"
    | "unresolved_conflicts"
    | "detached_head"
    | "git_operation_in_progress"
    | "missing_identity"
    | "empty_description"
    | "stale_preview"
    | "hook_rejected"
    | "signing_failed"
    | "index_unavailable"
    | "index_restore_failed"
    | "invalid_selection"
    | "no_remote_configured"
    | "remote_selection_required"
    | "unborn_branch_no_version"
    | "nothing_to_publish"
    | "behind_remote"
    | "diverged_histories"
    | "stale_publish_plan"
    | "invalid_ref_name"
    | "authentication_failed"
    | "network_timeout"
    | "remote_rejected"
    | "publish_uncertain";
  message: string;
  remediation: string | null;
  /** A bounded, secondary excerpt (e.g. raw hook or signing output) for
   * failures GitOdrile can only classify heuristically. Never the primary
   * message — see `saveVersionDialog.tsx`'s optional "technical details". */
  detail?: string | null;
};

export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

export function localizeAppError(error: unknown, t: Translations, fallback: string): string {
  if (!isAppError(error)) {
    return typeof error === "string" ? error : fallback;
  }

  const messages: Record<AppError["code"], string> = {
    path_missing: t.errorPathMissing,
    path_unusable: t.errorPathUnusable,
    not_repository: t.errorNotRepository,
    bare_repository: t.errorBareRepository,
    git_missing: t.errorGitMissing,
    git_unusable: t.errorGitUnusable,
    git_command_failed: t.errorGitCommandFailed,
    invalid_identity: t.errorInvalidIdentity,
    git_config_write_failed: t.errorGitConfigWriteFailed,
    path_invalid: t.errorPathInvalid,
    path_not_changed: t.errorPathNotChanged,
    path_encoding_unsupported: t.errorPathEncodingUnsupported,
    nothing_to_save: t.errorNothingToSave,
    unresolved_conflicts: t.errorUnresolvedConflicts,
    detached_head: t.errorDetachedHead,
    git_operation_in_progress: t.errorGitOperationInProgress,
    missing_identity: t.errorMissingIdentity,
    empty_description: t.errorEmptyDescription,
    stale_preview: t.errorStalePreview,
    hook_rejected: t.errorHookRejected,
    signing_failed: t.errorSigningFailed,
    index_unavailable: t.errorIndexUnavailable,
    index_restore_failed: t.errorIndexRestoreFailed,
    invalid_selection: t.errorInvalidSelection,
    no_remote_configured: t.errorNoRemoteConfigured,
    remote_selection_required: t.errorRemoteSelectionRequired,
    unborn_branch_no_version: t.errorUnbornBranchNoVersion,
    nothing_to_publish: t.errorNothingToPublish,
    behind_remote: t.errorBehindRemote,
    diverged_histories: t.errorDivergedHistories,
    stale_publish_plan: t.errorStalePublishPlan,
    invalid_ref_name: t.errorInvalidRefName,
    authentication_failed: t.errorAuthenticationFailed,
    network_timeout: t.errorNetworkTimeout,
    remote_rejected: t.errorRemoteRejected,
    publish_uncertain: t.errorPublishUncertain,
  };
  return messages[error.code] ?? fallback;
}

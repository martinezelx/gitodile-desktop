import type { SharedTranslations } from "./translations";

/** Mirrors the Rust `AppError` / `AppErrorCode` contract shared by every Tauri
 * command.
 *
 * This lives with the shared translation runtime rather than in `shared/ui`
 * because it is error localization, not a visual primitive — and every one of
 * the 52 codes below maps to a key `SharedTranslations` already owns, so it
 * depends on that interface rather than on the composed `Translations`. A
 * caller passing the full dictionary still satisfies it. */
export const APP_ERROR_CODES = [
  "stale_session", "path_missing", "path_unusable", "not_repository", "bare_repository",
  "git_missing", "git_unusable", "git_command_failed", "invalid_identity",
  "git_config_write_failed", "path_invalid", "path_not_changed", "path_encoding_unsupported",
  "nothing_to_save", "unresolved_conflicts", "detached_head", "git_operation_in_progress",
  "missing_identity", "empty_title", "invalid_title", "stale_preview", "hook_rejected",
  "signing_failed", "index_unavailable", "index_restore_failed", "invalid_selection",
  "no_remote_configured", "remote_selection_required", "unborn_branch_no_version",
  "nothing_to_publish", "nothing_to_get", "behind_remote", "diverged_histories", "stale_publish_plan",
  "stale_get_team_changes_plan",
  "invalid_ref_name", "authentication_failed", "network_timeout", "operation_cancelled",
  "invalid_remote_configuration", "remote_ref_missing", "remote_rejected",
  "publish_uncertain", "get_team_changes_uncertain", "git_version_too_old", "version_line_name_taken",
  "version_line_name_collides", "version_line_checked_out_elsewhere", "version_line_is_active",
  "version_line_unique_work", "version_line_switch_obstructed", "stale_version_line_plan",
  "dirty_working_tree", "incoming_path_collision", "ref_locked", "nothing_to_discard", "stale_discard_plan",
  "recovery_unavailable", "recovery_conflict", "recovery_failed",
] as const;

export type AppError = {
  code: (typeof APP_ERROR_CODES)[number];
  message: string;
  remediation: string | null;
  /** A bounded, secondary excerpt (e.g. raw hook or signing output) for
   * failures GitOdrile can only classify heuristically. Never the primary
   * message — see Save version's optional "technical details". */
  detail?: string | null;
};

export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

export function localizeAppError(error: unknown, t: SharedTranslations, fallback: string): string {
  if (!isAppError(error)) {
    return typeof error === "string" ? error : fallback;
  }

  const messages: Record<AppError["code"], string> = {
    stale_session: t.errorStalePreview,
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
    empty_title: t.errorEmptyTitle,
    invalid_title: t.errorInvalidTitle,
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
    nothing_to_get: t.errorNothingToGet,
    behind_remote: t.errorBehindRemote,
    diverged_histories: t.errorDivergedHistories,
    stale_publish_plan: t.errorStalePublishPlan,
    stale_get_team_changes_plan: t.errorStaleGetTeamChangesPlan,
    invalid_ref_name: t.errorInvalidRefName,
    authentication_failed: t.errorAuthenticationFailed,
    network_timeout: t.errorNetworkTimeout,
    operation_cancelled: t.errorOperationCancelled,
    invalid_remote_configuration: t.errorInvalidRemoteConfiguration,
    remote_ref_missing: t.errorRemoteRefMissing,
    remote_rejected: t.errorRemoteRejected,
    publish_uncertain: t.errorPublishUncertain,
    get_team_changes_uncertain: t.errorGetTeamChangesUncertain,
    git_version_too_old: t.errorGitVersionTooOld,
    version_line_name_taken: t.errorVersionLineNameTaken,
    version_line_name_collides: t.errorVersionLineNameCollides,
    version_line_checked_out_elsewhere: t.errorVersionLineCheckedOutElsewhere,
    version_line_is_active: t.errorVersionLineIsActive,
    version_line_unique_work: t.errorVersionLineUniqueWork,
    version_line_switch_obstructed: t.errorVersionLineSwitchObstructed,
    stale_version_line_plan: t.errorStaleVersionLinePlan,
    dirty_working_tree: t.errorDirtyWorkingTree,
    incoming_path_collision: t.errorIncomingPathCollision,
    ref_locked: t.errorRefLocked,
    nothing_to_discard: t.errorNothingToDiscard,
    stale_discard_plan: t.errorStaleDiscardPlan,
    recovery_unavailable: t.errorRecoveryUnavailable,
    recovery_conflict: t.errorRecoveryConflict,
    recovery_failed: t.errorRecoveryFailed,
  };
  return messages[error.code] ?? fallback;
}

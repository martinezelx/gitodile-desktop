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
    | "path_encoding_unsupported";
  message: string;
  remediation: string | null;
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
  };
  return messages[error.code] ?? fallback;
}

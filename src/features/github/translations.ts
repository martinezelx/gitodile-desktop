import type { GitHubAccountChipState, GitHubAuthState } from "./domain";

export interface GitHubTranslations {
  githubAuthReconnect: string;
  githubAuthCancel: string;
  githubAuthConfirm: string;
  githubAuthNotNow: string;
  githubAuthDisconnect: string;
  githubAuthUseAccount: string;
  githubAuthUseAccountLabel: string;
  githubAuthChip: Record<GitHubAccountChipState, string>;
  githubAuthLogoutConfirm: string;
  githubAuthLogoutConsent: string;
  githubAuthLogoutBrowser: string;
  githubAuthLogoutDone: string;
  githubAuthShared: string;
  githubAuthStorageConsent: string;
  githubAuthPermissions: string;
  githubAuthFile: string;
  githubAuthEnvironment: string;
  githubAuthUnknownStorage: string;
  githubAuthNeedsCheck: string;
  githubAuthBrowserFailed: string;
  githubAuthOpenBrowser: string;
  githubAuthCopyCode: string;
  githubAuthCopied: string;
  githubAuthCopyFailed: string;
  githubAuthDeviceSteps: string;
  githubAuthStatus: Record<GitHubAuthState, string>;
}

import type { GitLabAuthState } from "./domain";

export interface GitLabTranslations {
  gitlabAuthRepairDetails: string;
  gitlabAuthRepairHint: string;
  gitlabAuthCancel: string;
  gitlabAuthConfirm: string;
  gitlabAuthDisconnect: string;
  gitlabAuthAccountName: string;
  gitlabAuthChip: Record<"connected" | "saved" | "unchecked" | "signed_out" | "checking" | "invalid" | "unavailable" | "environment", string>;
  gitlabAuthLogoutConsent: string;
  gitlabAuthLogoutBrowser: string;
  gitlabAuthShared: string;
  gitlabAuthStorageConsent: string;
  gitlabAuthPermissions: string;
  gitlabAuthNeedsCheck: string;
  gitlabAuthStatus: Record<GitLabAuthState, string>;
}

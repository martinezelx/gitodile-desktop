export type GitHubAuthState = "unchecked" | "checking" | "signed_out" | "connected" | "invalid" | "offline"
  | "login_starting" | "signing_out" | "switching" | "awaiting_browser" | "cancelling" | "cancelled" | "timed_out" | "failed"
  | "cli_missing" | "cli_unsupported" | "environment_controlled";

export type GitHubAccount = {
  login: string;
  host: "github.com";
  storage: "secure" | "file" | "environment" | "unknown";
  avatarDataUrl: string | null;
};

export type GitHubSavedAccount = GitHubAccount & {
  active: boolean;
  state: "connected" | "invalid" | "offline";
};

export type GitHubAuthSnapshot = {
  state: GitHubAuthState;
  account: GitHubAccount | null;
  accounts: GitHubSavedAccount[];
  operationId: string | null;
  deviceCode: string | null;
  verificationUrl: string | null;
  needsCheck: boolean;
  signedOutAccount: string | null;
};

export const EMPTY_GITHUB_AUTH: GitHubAuthSnapshot = {
  state: "unchecked", account: null, accounts: [], operationId: null, deviceCode: null, verificationUrl: null, needsCheck: false, signedOutAccount: null,
};
export const GITHUB_DEVICE_URL = "https://github.com/login/device";

export function isGitHubAuthBusy(state: GitHubAuthState): boolean {
  return ["checking", "login_starting", "signing_out", "switching", "awaiting_browser", "cancelling"].includes(state);
}

/** Keep the last known active identity visible even if a check has no new list. */
export function githubAccountRows(snapshot: GitHubAuthSnapshot): GitHubSavedAccount[] {
  const active = snapshot.account;
  if (!active || snapshot.accounts.some(account => account.login === active.login)) return snapshot.accounts;
  return [{ ...active, active: true, state: snapshot.state === "connected" ? "connected" : snapshot.state === "invalid" ? "invalid" : "offline" }, ...snapshot.accounts];
}

export type GitHubAccountChipState = "connected" | "saved" | "unchecked" | "signed_out" | "checking" | "invalid" | "unavailable" | "environment";

export function githubAccountChip(snapshot: GitHubAuthSnapshot, account: GitHubSavedAccount | null, available: boolean | null, busy: boolean): GitHubAccountChipState {
  if (available === false || snapshot.state === "cli_missing") return "unavailable";
  if (busy && (!account || account.active)) return "checking";
  if (snapshot.state === "environment_controlled") return "environment";
  if (snapshot.needsCheck) return "unchecked";
  if (account && !account.active) return account.state === "invalid" ? "invalid" : account.state === "offline" ? "unchecked" : "saved";
  if (snapshot.state === "connected") return "connected";
  if (snapshot.state === "invalid") return "invalid";
  if (snapshot.state === "signed_out") return "signed_out";
  return "unchecked";
}

export function isGitHubAvatarDataUrl(value: string | null): value is string {
  return value !== null && value.length <= 350_000
    && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

import type { HostingAccount } from "../accounts";
export type GitLabAuthState = "unchecked" | "checking" | "signed_out" | "connected" | "invalid" | "offline"
  | "login_starting" | "signing_out" | "switching" | "awaiting_browser" | "cancelling" | "cancelled" | "timed_out" | "failed"
  | "cli_missing" | "cli_unsupported" | "environment_controlled";
export type GitLabAuthSnapshot = { state: GitLabAuthState; account: HostingAccount | null; operationId: string | null; needsCheck: boolean };
export const EMPTY_GITLAB_AUTH: GitLabAuthSnapshot = { state: "unchecked", account: null, operationId: null, needsCheck: false };

export function gitlabAccountChip(snapshot: GitLabAuthSnapshot, available: boolean | null, busy: boolean):
  "checking" | "environment" | "invalid" | "unavailable" | "connected" | "unchecked" {
  if (busy) return "checking";
  if (snapshot.state === "environment_controlled") return "environment";
  if (snapshot.state === "invalid") return "invalid";
  if (available === false || ["cli_missing", "cli_unsupported", "offline", "timed_out", "failed"].includes(snapshot.state)) return "unavailable";
  if (snapshot.state === "connected" && !snapshot.needsCheck) return "connected";
  return "unchecked";
}

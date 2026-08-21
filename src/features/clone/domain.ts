export type CloneSourceKind = "https" | "ssh" | "git" | "file" | "local";
export type CloneCredentialExpectation = "none" | "git-credential-helper" | "ssh-agent-or-key";
export type CloneProgressPhase =
  | "preparing"
  | "cloning"
  | "sanitizingRemote"
  | "verifying"
  | "publishing"
  | "finalizing";
export type DependencyDiscovery = "detected" | "not-detected" | "unknown";

export type CloneRequest = {
  source: string;
  destinationParent: string;
  destinationName: string;
};

export type ClonePlan = {
  operationKind: "local-mutation";
  requiresConfirmation: true;
  operationId: string;
  stateToken: string;
  sourceKind: CloneSourceKind;
  /** Rust-redacted: never contains URL credentials, query, or fragment. */
  sourceDisplay: string;
  destinationParent: string;
  destinationName: string;
  destinationPath: string;
  credentialExpectation: CloneCredentialExpectation;
  contactsNetwork: boolean;
  changesRemote: false;
  checksOutRemoteDefault: true;
  usesStaging: true;
};

export type CloneResult = {
  outcome: "completed" | "cleanup-required";
  operationId: string;
  destinationPath: string;
  submodules: DependencyDiscovery;
  gitLfs: DependencyDiscovery;
  cleanupPath: string | null;
};

const LAST_CLONE_PARENT_KEY = "gitodrile-clone-parent";

export function readLastCloneParent(): string {
  return localStorage.getItem(LAST_CLONE_PARENT_KEY) ?? "";
}

/** Persists only a local parent folder. Remote input and operation tokens are
 * deliberately absent from browser persistence. */
export function writeLastCloneParent(parent: string): void {
  if (parent) localStorage.setItem(LAST_CLONE_PARENT_KEY, parent);
}

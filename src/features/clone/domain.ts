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
  accountId?: string | null;
  source: string;
  destinationParent: string;
  destinationName: string;
};

export type ClonePlan = {
  accountId?: string | null;
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
  /** False means the verified clone exists, but its chosen account needs setup. */
  accountSelectionSaved?: boolean | null;
  outcome: "completed" | "cleanup-required";
  operationId: string;
  destinationPath: string;
  submodules: DependencyDiscovery;
  gitLfs: DependencyDiscovery;
  cleanupPath: string | null;
};

const LAST_CLONE_PARENT_KEY = "gitodile-clone-parent";

export function readLastCloneParent(): string {
  return localStorage.getItem(LAST_CLONE_PARENT_KEY) ?? "";
}

/** Persists only a local parent folder. Remote input and operation tokens are
 * deliberately absent from browser persistence. */
export function writeLastCloneParent(parent: string): void {
  if (parent) localStorage.setItem(LAST_CLONE_PARENT_KEY, parent);
}

/** The connection last chosen for a product's discovery tab. Only an account
 * ID (no secret); preselecting it reads nothing from the network. */
export function readLastCloneConnection(kind: string): string | null {
  try { return localStorage.getItem(`gitodile-clone-connection-${kind}`); } catch { return null; }
}

export function writeLastCloneConnection(kind: string, accountId: string | null): void {
  try {
    if (accountId) localStorage.setItem(`gitodile-clone-connection-${kind}`, accountId);
  } catch { /* A remembered choice is a convenience; the picker still works. */ }
}

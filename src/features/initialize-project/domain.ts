export type InitializeTargetKind = "new-folder" | "existing-folder";
export type InitializeProgressPhase =
  | "revalidating"
  | "preparingFolder"
  | "initializingGit"
  | "creatingReadme"
  | "verifying"
  | "finalizing";

export type InitializeProjectRequest = {
  targetKind: InitializeTargetKind;
  destinationParent: string;
  destinationName: string;
  existingPath: string;
  initialBranch: string;
  createReadme: boolean;
  saveInitialVersion: boolean;
};

export type InitializeProjectPlan = {
  operationKind: "local-mutation";
  requiresConfirmation: true;
  operationId: string;
  stateToken: string;
  targetKind: InitializeTargetKind;
  destinationPath: string;
  initialBranch: string;
  createReadme: boolean;
  saveInitialVersion: boolean;
  identityReady: boolean;
  existingEntryCount: number;
  existingEntriesTruncated: boolean;
};

export type InitializeProjectResult = {
  outcome: "completed" | "cleanup-required";
  operationId: string;
  destinationPath: string;
  readmeCreated: boolean;
  cleanupPath: string | null;
};

export type ConnectRemoteCredentialExpectation =
  | "none"
  | "git-credential-helper"
  | "ssh-agent-or-key";

export type ConnectRemoteRequest = {
  projectId: string;
  sessionEpoch: string;
  remoteName: string;
  remoteUrl: string;
};

export type ConnectRemotePlan = {
  operationKind: "local-mutation";
  requiresConfirmation: true;
  projectId: string;
  sessionEpoch: string;
  stateToken: string;
  remoteName: string;
  fetchUrlDisplay: string;
  pushUrlDisplay: string;
  credentialExpectation: ConnectRemoteCredentialExpectation;
  contactsNetwork: false;
  futureNetworkAccess: boolean;
  changesRemote: false;
  preservesExistingConfig: true;
};

export type ConnectRemoteResult = {
  projectId: string;
  sessionEpoch: string;
  remoteName: string;
};

const LAST_CREATE_PARENT_KEY = "gitodrile-create-parent";

export function readLastCreateParent(): string {
  return localStorage.getItem(LAST_CREATE_PARENT_KEY) ?? "";
}

/** Only a local parent path is persisted. Existing-folder choices, remote
 * URLs, names, operation ids, and state tokens stay in memory. */
export function writeLastCreateParent(parent: string): void {
  if (parent) localStorage.setItem(LAST_CREATE_PARENT_KEY, parent);
}

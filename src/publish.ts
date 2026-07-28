/** Mirrors the Rust `RemoteInfo` contract. The url is already redacted on
 * the Rust side; nothing here should ever see embedded credentials. */
export type RemoteInfo = {
  name: string;
  url: string;
};

export type RemoteDiscovery = {
  remotes: RemoteInfo[];
  branch: string | null;
  upstream: string | null;
};

/** Mirrors the Rust `PublishPlan` contract. */
export type PublishPlan = {
  operationKind: "remote-mutation";
  summary: string;
  steps: string[];
  risks: string[];
  recovery: string;
  requiresConfirmation: boolean;
  stateToken: string;
  remote: string;
  localBranch: string;
  destinationBranch: string;
  willCreateUpstream: boolean;
  commitCount: number;
  commitSummary: string[];
  hasUnsavedFiles: boolean;
};

/** Mirrors the Rust `PublishResult` contract. */
export type PublishResult = {
  remote: string;
  localBranch: string;
  destinationBranch: string;
  previousRemoteCommit: string | null;
  publishedCommit: string;
  publishedCount: number;
  createdUpstream: boolean;
};

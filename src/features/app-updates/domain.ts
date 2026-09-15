export type UpdateChannel = "stable" | "preview";

/** The stored choice between the two compiled feeds. `follow_build` is the
 * default — the channel the running version belongs to — and is what every
 * build did before the choice existed. The renderer never names a feed. */
export type UpdateChannelPreference = "follow_build" | UpdateChannel;

export type UpdateChannelSetting = Readonly<{
  preferred: UpdateChannelPreference;
  /** The channel the running build belongs to. */
  buildChannel: UpdateChannel;
  /** The channel a check will follow: the preference when set, else the build's. */
  channel: UpdateChannel;
}>;
export type UpdateTarget = "windows-x86_64" | "darwin-aarch64" | "darwin-x86_64" | "linux-x86_64";

export type UpdateCandidate = Readonly<{
  candidateId: string;
  version: string;
  channel: UpdateChannel;
  target: UpdateTarget;
  publishedAt: string | null;
  notes: string;
  expectedBytes: number | null;
}>;

export type UpdateError = Readonly<{
  code:
    | "offline" | "timeout" | "http_status" | "feed_unavailable"
    | "invalid_manifest" | "invalid_version" | "channel_mismatch"
    | "target_unavailable" | "unsupported_installation" | "automatic_update_not_enabled"
    | "read_only_installation"
    | "notes_too_large" | "payload_too_large" | "truncated_download"
    | "signature_invalid" | "insufficient_space" | "install_blocked"
    | "install_handoff_failed" | "post_install_unconfirmed" | "internal";
  stage: "check" | "download" | "verify" | "admission" | "install" | "startup";
  retryable: boolean;
  httpStatus?: number;
  safeDetail?: string;
}>;

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking"; operationId: string; source: "manual" | "background" }
  | { kind: "current"; checkedAt: string }
  | { kind: "available"; candidate: UpdateCandidate }
  | { kind: "downloading"; candidate: UpdateCandidate; transfer:
      | { length: "known"; receivedBytes: number; totalBytes: number }
      | { length: "unknown"; receivedBytes: number } }
  | { kind: "verifying"; candidate: UpdateCandidate; receivedBytes: number }
  | { kind: "ready"; candidate: UpdateCandidate }
  | { kind: "blocked"; candidate: UpdateCandidate; error: UpdateError }
  | { kind: "installing"; candidateId: string }
  | { kind: "cancelled"; stage: "checking" | "downloading" }
  | { kind: "unavailable"; error: UpdateError }
  | { kind: "failed"; error: UpdateError };

export type UpdateAction = Readonly<{
  operationId: string | null;
  coalesced: boolean;
  state: UpdateState;
}>;

export type StartupUpdateConfirmation =
  | { kind: "none" }
  | { kind: "confirmed"; version: string }
  | { kind: "unconfirmed"; expectedVersion: string; error: UpdateError };

export type NativeDraftPreparation = Readonly<{
  protectedCount: number;
  blockers: readonly string[];
}>;

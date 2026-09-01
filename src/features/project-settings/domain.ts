/** The panel's sections, in rail order.
 *
 * Three, and deliberately not more: everything else a project can be
 * configured with is either machine-wide (Settings owns it) or a workflow
 * rather than a setting. */
export const PROJECT_SETTINGS_SECTIONS = ["remote", "ignored", "identity"] as const;
export type ProjectSettingsSection = (typeof PROJECT_SETTINGS_SECTIONS)[number];

export function projectSettingsSectionLabel(
  section: ProjectSettingsSection,
  t: {
    projectSettingsRemote: string;
    projectSettingsIgnored: string;
    projectSettingsIdentity: string;
  },
): string {
  switch (section) {
    case "remote":
      return t.projectSettingsRemote;
    case "ignored":
      return t.projectSettingsIgnored;
    case "identity":
      return t.projectSettingsIdentity;
  }
}

/** The open project a call is scoped to. Every command in this feature is
 * repository-scoped, so there is no shape without an epoch. */
export type ProjectSettingsTarget = {
  path: string;
  sessionEpoch: string;
};

export type ProjectRemote = {
  name: string;
  /** Redacted by Rust; the raw configured URL never crosses IPC. */
  url: string;
  /** Only present when pushing goes somewhere other than fetching. */
  pushUrl: string | null;
  /** The stored URL carries a password, token or query the display drops.
   * Saving the shown text would delete it, so the panel has to say so. */
  hasHiddenCredentials: boolean;
};

export type ProjectRemotes = {
  remotes: ProjectRemote[];
  /** The remote the current version line publishes to, when it has one. */
  upstreamRemote: string | null;
};

export type ConnectRemotePlan = {
  stateToken: string;
  remoteName: string;
  fetchUrlDisplay: string;
  credentialExpectation: "none" | "git-credential-helper" | "ssh-agent-or-key";
  futureNetworkAccess: boolean;
};

export type ProjectIdentitySource = "project" | "inherited" | "unset";

export type ProjectIdentity = {
  localName: string | null;
  localEmail: string | null;
  inheritedName: string | null;
  inheritedEmail: string | null;
  effectiveName: string | null;
  effectiveEmail: string | null;
  source: ProjectIdentitySource;
};

export const IGNORE_SCOPES = ["project", "personal"] as const;
export type IgnoreScope = (typeof IGNORE_SCOPES)[number];

export type IgnoreFileUnavailable = "too_large" | "not_text" | "unreadable";

export type IgnoreFile = {
  scope: IgnoreScope;
  relativePath: string;
  exists: boolean;
  /** `null` exactly when `unavailable` is set. */
  contents: string | null;
  stateToken: string | null;
  byteLength: number;
  unavailable: IgnoreFileUnavailable | null;
};

export type IdentityDraft = { name: string; email: string };

/* Deliberately permissive, and the same rule the global identity block uses:
   Git accepts almost anything here, so this catches the typo class of mistake
   rather than deciding which addresses are real. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isIdentityDraftValid(draft: IdentityDraft): boolean {
  return draft.name.trim().length > 0 && EMAIL_PATTERN.test(draft.email.trim());
}

/** Seeds the fields from the local override when there is one, and from the
 * inherited identity when there is not — so switching the override on offers
 * the values to edit rather than two empty boxes. */
export function identityDraftFrom(identity: ProjectIdentity | null): IdentityDraft {
  if (!identity) {
    return { name: "", email: "" };
  }
  return {
    name: identity.localName ?? identity.inheritedName ?? "",
    email: identity.localEmail ?? identity.inheritedEmail ?? "",
  };
}

export function hasIdentityDraftChanged(
  draft: IdentityDraft,
  identity: ProjectIdentity | null,
): boolean {
  return (
    draft.name.trim() !== (identity?.localName ?? "") ||
    draft.email.trim() !== (identity?.localEmail ?? "")
  );
}

/**
 * Whether a typed remote URL is something to save.
 *
 * The displayed URL is redacted, so a draft equal to it carries no decision —
 * saving it would replace a stored password with nothing while looking like a
 * no-op. Refusing that here is what keeps the panel from silently dropping
 * credentials it never showed.
 */
export function hasRemoteUrlChanged(draft: string, remote: ProjectRemote): boolean {
  const trimmed = draft.trim();
  return trimmed.length > 0 && trimmed !== remote.url;
}

export function hasIgnoreDraftChanged(draft: string, file: IgnoreFile | null): boolean {
  return file?.contents != null && draft !== file.contents;
}

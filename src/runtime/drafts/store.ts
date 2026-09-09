const STORAGE_PREFIX = "gitodile-install-draft-v1:";
const MAX_DRAFT_BYTES = 128 * 1024;
const MAX_LABEL_LENGTH = 96;

type StoredDraft = {
  schemaVersion: 1;
  ownerId: string;
  label: string;
  value: unknown;
};

export type DraftBlocker = Readonly<{
  ownerId: string;
  label: string;
  reason: "requires-user-action" | "persistence-failed" | "stored-copy-invalid";
}>;

export type DraftPreparation = Readonly<{
  protected: readonly string[];
  blockers: readonly DraftBlocker[];
}>;

const liveBlockers = new Map<string, DraftBlocker>();
const persistenceFailures = new Map<string, DraftBlocker>();

function storageKey(ownerId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(ownerId)}`;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isStoredDraft(value: unknown, ownerId: string): value is StoredDraft {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StoredDraft>;
  return (
    candidate.schemaVersion === 1 &&
    candidate.ownerId === ownerId &&
    typeof candidate.label === "string" &&
    candidate.label.length > 0 &&
    candidate.label.length <= MAX_LABEL_LENGTH &&
    "value" in candidate
  );
}

export function readInstallDraft<T>(
  ownerId: string,
  validate: (value: unknown) => value is T,
): T | null {
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (raw === null || utf8Length(raw) > MAX_DRAFT_BYTES) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft(parsed, ownerId) && validate(parsed.value) ? parsed.value : null;
  } catch {
    return null;
  }
}

/** Writes synchronously so an Install click immediately after a keystroke
 * cannot outrun the browser copy. No repository path, file, index or Git
 * configuration is touched. */
export function writeInstallDraft<T>(ownerId: string, label: string, value: T): boolean {
  const blocker = { ownerId, label, reason: "persistence-failed" } as const;
  try {
    const serialized = JSON.stringify({ schemaVersion: 1, ownerId, label, value } satisfies StoredDraft);
    if (utf8Length(serialized) > MAX_DRAFT_BYTES) {
      persistenceFailures.set(ownerId, blocker);
      return false;
    }
    localStorage.setItem(storageKey(ownerId), serialized);
    persistenceFailures.delete(ownerId);
    return true;
  } catch {
    persistenceFailures.set(ownerId, blocker);
    return false;
  }
}

export function clearInstallDraft(ownerId: string): void {
  try {
    localStorage.removeItem(storageKey(ownerId));
  } finally {
    persistenceFailures.delete(ownerId);
  }
}

export function setInstallDraftBlocker(ownerId: string, label: string, blocked: boolean): void {
  if (blocked) {
    liveBlockers.set(ownerId, { ownerId, label, reason: "requires-user-action" });
  } else {
    liveBlockers.delete(ownerId);
  }
}

/** Called by the future updater controller before native admission. Stored
 * values are parsed and bounded again rather than trusting prior writes. */
export function prepareInstallDrafts(): DraftPreparation {
  const protectedOwners: string[] = [];
  const blockers = new Map<string, DraftBlocker>([...liveBlockers, ...persistenceFailures]);
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const ownerId = decodeURIComponent(key.slice(STORAGE_PREFIX.length));
      const raw = localStorage.getItem(key);
      try {
        const parsed: unknown = raw !== null && utf8Length(raw) <= MAX_DRAFT_BYTES ? JSON.parse(raw) : null;
        if (!isStoredDraft(parsed, ownerId)) throw new Error("invalid draft envelope");
        protectedOwners.push(ownerId);
      } catch {
        blockers.set(ownerId, {
          ownerId,
          label: "saved draft",
          reason: "stored-copy-invalid",
        });
      }
    }
  } catch {
    blockers.set("draft-storage", {
      ownerId: "draft-storage",
      label: "saved drafts",
      reason: "persistence-failed",
    });
  }
  protectedOwners.sort();
  return { protected: protectedOwners, blockers: [...blockers.values()] };
}

export const INSTALL_DRAFT_STORAGE_PREFIX = STORAGE_PREFIX;

import type { ProjectSettingsPort } from "./port";
import type { ProjectSettingsTarget } from "./domain";

/**
 * Answers this panel already has, kept between openings.
 *
 * The dialog is unmounted on every close, so without this each opening pays for
 * its reads again — three `git config` processes for the identity, three more
 * for the remotes, at roughly 55 ms per spawn on Windows. Settings solved the
 * same problem by hoisting its global reads above the dialog (task 097); this
 * cache is the per-project shape of that, because reading every project's
 * settings on the chance one is opened would be worse than the wait.
 *
 * Three properties matter:
 *
 * - **Keys carry the project path and its session epoch**, so a reopened
 *   project never sees the previous session's answers.
 * - **A cached answer is shown, then revalidated.** These are facts about a
 *   repository that another tool can change, so a remembered value is a
 *   starting frame, never the last word.
 * - **One read in flight per key.** A prefetch and the panel's own read share
 *   the same promise instead of spawning Git twice.
 *
 * It deliberately does not hold what the user edits: see the ignore file's
 * `null` cache at the call site.
 */
export type ProjectSettingsCache = {
  /** The remembered answer, synchronously, so the first frame can paint it. */
  peek<T>(key: string): T | undefined;
  /** The in-flight or fresh read for this key. */
  read<T>(key: string, load: () => Promise<T>): Promise<T>;
  /** Records what a mutation reported back, so the next opening starts there. */
  write<T>(key: string, value: T): void;
  /** Drops an answer so the next read goes to Git. */
  forget(key: string): void;
  /** Starts a read nobody is waiting for yet. Failures are ignored: the panel
   * will report them for itself when it actually asks. */
  warm(key: string, load: () => Promise<unknown>): void;
};

/** Small on purpose: a handful of projects' worth of answers, evicted oldest
 * first. This exists to make reopening instant, not to be a store. */
const MAX_ENTRIES = 12;

type Entry = { value?: unknown; promise?: Promise<unknown> };

export function createProjectSettingsCache(): ProjectSettingsCache {
  const entries = new Map<string, Entry>();

  const put = (key: string, entry: Entry): void => {
    // Re-inserting moves the key to the end, so eviction is least-recently
    // written rather than first-ever-seen.
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > MAX_ENTRIES) {
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    }
  };

  const read = <T,>(key: string, load: () => Promise<T>): Promise<T> => {
    const existing = entries.get(key);
    if (existing?.promise) {
      return existing.promise as Promise<T>;
    }
    const promise = load().then(
      (value) => {
        put(key, { value });
        return value;
      },
      (error: unknown) => {
        // A failed read leaves nothing behind: keeping the previous answer
        // would let a stale value outlive the failure that should have
        // replaced it.
        entries.delete(key);
        throw error;
      },
    );
    put(key, { value: existing?.value, promise });
    return promise;
  };

  return {
    peek: <T,>(key: string) => entries.get(key)?.value as T | undefined,
    read,
    write: (key, value) => put(key, { value }),
    forget: (key) => entries.delete(key),
    warm: (key, load) => {
      if (entries.has(key)) return;
      void read(key, load).catch(() => undefined);
    },
  };
}

/** The key the panel's remote read uses. Exported so the gear that opens the
 * panel can warm exactly that read rather than guessing at its shape. */
export function remotesCacheKey(project: ProjectSettingsTarget): string {
  return `remotes:${project.path}:${project.sessionEpoch}`;
}

/**
 * Starts the read the panel opens with, before it is opened.
 *
 * Called when the pointer reaches the gear or it takes focus — typically a few
 * hundred milliseconds before the click, which is the same order as the read
 * itself. A user who never opens the panel pays nothing, because nothing else
 * calls this.
 */
export function warmProjectSettings(
  cache: ProjectSettingsCache,
  port: ProjectSettingsPort,
  project: ProjectSettingsTarget,
): void {
  cache.warm(remotesCacheKey(project), () => port.readRemotes(project));
}

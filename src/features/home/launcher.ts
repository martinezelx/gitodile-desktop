/**
 * The pure half of Home's launcher: which part of the day it is, whom to
 * greet, what a typed or pasted query means, and which recent projects match
 * it, and what the account receipt says Home can show. Nothing here touches
 * the disk or Git — a pasted URL or path only becomes
 * a *suggestion*; acting on it goes through the same clone and open flows (and
 * the same Rust validation) as their buttons.
 */

import { providerKind, type AccountCatalog } from "../accounts";

export type DaySlot = "morning" | "afternoon" | "evening";

/** Spanish-style day parts, which English reads naturally too: morning until
 * two, afternoon until nine, evening through the night. */
export function daySlot(hour: number): DaySlot {
  if (hour >= 6 && hour < 14) return "morning";
  if (hour >= 14 && hour < 21) return "afternoon";
  return "evening";
}

/** The first word of the Git identity's name — "Luis Muñoz Martínez" greets as
 * "Luis". Null when there is nothing usable, so the greeting drops the name
 * rather than greeting nobody. */
export function greetingName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export type LauncherIntent =
  | { kind: "empty" }
  | { kind: "url"; url: string; name: string | null }
  | { kind: "path"; path: string }
  | { kind: "text"; text: string };

/** Every scheme the Clone dialog accepts, `file://` included. */
const URL_PATTERN = /^(?:https?|ssh|git|file):\/\/\S+$/i;
/** `git@github.com:owner/repo.git`, the form hosts offer beside HTTPS. */
const SCP_PATTERN = /^[\w.-]+@[\w.-]+:\S+$/;
/** An absolute path only: a drive letter, a UNC share or a POSIX root. A
 * relative or `~` path has no meaning the app could resolve without guessing. */
const PATH_PATTERN = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/;

/** The folder name a clone would get, read from the URL's last segment. */
export function nameFromRemoteUrl(url: string): string | null {
  const segment = url.replace(/[\\/]+$/, "").split(/[\\/:]/).pop() ?? "";
  const name = segment.replace(/\.git$/i, "");
  return name ? name : null;
}

export function classifyLauncherQuery(raw: string): LauncherIntent {
  const query = raw.trim();
  if (!query) return { kind: "empty" };
  if (URL_PATTERN.test(query) || SCP_PATTERN.test(query)) {
    return { kind: "url", url: query, name: nameFromRemoteUrl(query) };
  }
  if (PATH_PATTERN.test(query)) return { kind: "path", path: query };
  return { kind: "text", text: query };
}

/** A typed word can name a new folder only if it is one: no separators, and
 * short enough to be a name rather than a sentence. */
export function isPlausibleProjectName(text: string): boolean {
  return text.length <= 64 && text !== "." && text !== ".." && !/[\\/:*?"<>|]/.test(text);
}

/** Case-insensitive, name matches before path matches, each group keeping the
 * caller's order (recency), so typing narrows the list without reshuffling it. */
export function matchRecentProjects<Entry extends { name: string; path: string }>(
  entries: readonly Entry[],
  text: string,
): Entry[] {
  const needle = text.trim().toLocaleLowerCase();
  if (!needle) return [...entries];
  const byName = entries.filter((entry) => entry.name.toLocaleLowerCase().includes(needle));
  const byPath = entries.filter(
    (entry) => !byName.includes(entry) && entry.path.toLocaleLowerCase().includes(needle),
  );
  return [...byName, ...byPath];
}

/** Each part of the day has this many prompts under the greeting. */
export const PROMPTS_PER_SLOT = 3;

const LAST_PROMPT_STORAGE_KEY = "gitodile-home-prompt";

/** A prompt index for this visit that differs from the last one shown, so
 * coming back to Home does not repeat the same question. Storage is a
 * convenience: when it is unavailable the choice is merely random. */
export function nextPromptIndex(random: () => number = Math.random): number {
  let previous: number | null = null;
  try {
    const raw = localStorage.getItem(LAST_PROMPT_STORAGE_KEY);
    const stored = raw === null ? Number.NaN : Number(raw);
    previous = Number.isInteger(stored) ? stored : null;
  } catch {
    previous = null;
  }
  let index = Math.floor(random() * PROMPTS_PER_SLOT) % PROMPTS_PER_SLOT;
  if (index === previous) index = (index + 1) % PROMPTS_PER_SLOT;
  try {
    localStorage.setItem(LAST_PROMPT_STORAGE_KEY, String(index));
  } catch {
    // Not remembering it only allows an occasional repeat.
  }
  return index;
}

/* ---- Getting the machine ready ----
   What Home knows about this computer's setup, all of it read elsewhere and
   locally: the Git diagnostics and identity App already reads after first
   paint, and the account receipts the launch sync keeps (ADR 0027). Home
   never reads a repository or the network to fill this in. */

export type HomeGitState = "checking" | "available" | "missing" | "unusable" | "check_failed";
export type HomeAccountKind = "github" | "gitlab" | "bitbucket";
export type HomeAccount = {
  id: string;
  kind: HomeAccountKind;
  login: string;
  /** How GitOdile reaches it: a browser or CLI sign-in, or a saved token.
   * One person can have both, under the same login. */
  source: "connection" | "token";
  /** Set only for a company server; the public host goes unsaid. */
  server: string | null;
};

export type HomeSetup = {
  git: { state: HomeGitState; version: string | null; isRechecking: boolean };
  /** Null until the identity has been read. */
  identity: { name: string; email: string } | null;
  /** Usable accounts, or null until the receipts have been read. */
  accounts: readonly HomeAccount[] | null;
  /** Providers with a saved connection still being checked and no usable
   * account yet. Each holds a place until its check lands, so one provider
   * finishing first does not leave the other to appear from nowhere. */
  pendingAccountKinds?: readonly HomeAccountKind[];
};

/** Brand names stay untranslated. */
export const ACCOUNT_KIND_NAMES: Record<HomeAccountKind, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

export type SetupStepId = "git" | "identity" | "account";
export type SetupStep = { id: SetupStepId; done: boolean; optional: boolean };

export type SetupPlan = {
  /** Git is missing or will not run: nothing that touches a project works. */
  gitBlocked: boolean;
  /** Read, and lacking the name or the email a saved version needs. */
  identityMissing: boolean;
  steps: SetupStep[];
  /** Required steps still to do; the optional account does not count. */
  requiredLeft: number;
  /** Every step, the optional one included, is done. */
  complete: boolean;
};

export function planSetup(setup: HomeSetup): SetupPlan {
  const gitBlocked = setup.git.state === "missing" || setup.git.state === "unusable";
  const identityMissing = setup.identity !== null && (!setup.identity.name.trim() || !setup.identity.email.trim());
  const steps: SetupStep[] = [
    { id: "git", done: setup.git.state === "available", optional: false },
    { id: "identity", done: setup.identity !== null && !identityMissing, optional: false },
    { id: "account", done: (setup.accounts?.length ?? 0) > 0, optional: true },
  ];
  return {
    gitBlocked,
    identityMissing,
    steps,
    requiredLeft: steps.filter((step) => !step.optional && !step.done).length,
    complete: steps.every((step) => step.done),
  };
}

/** The first step not yet done — the one the checklist marks as next. */
export function nextSetupStep(plan: SetupPlan): SetupStep | null {
  return plan.steps.find((step) => !step.done) ?? null;
}

export type AccountGroup = { kind: HomeAccountKind; accounts: HomeAccount[] };

/** One group per provider, in the order the accounts arrive. Someone with an
 * account and a token on the same provider sees one tab and one status entry
 * for it, and picks between them inside, rather than two of each. */
export function groupAccountsByKind(accounts: readonly HomeAccount[]): AccountGroup[] {
  const groups: AccountGroup[] = [];
  for (const account of accounts) {
    const group = groups.find((candidate) => candidate.kind === account.kind);
    if (group) group.accounts.push(account);
    else groups.push({ kind: account.kind, accounts: [account] });
  }
  return groups;
}

/** "2.55.0.windows.3" reads as "2.55": the release a person recognizes. The
 * full string stays in the tooltip and in Settings. */
export function shortGitVersion(version: string): string {
  const match = /^(\d+)\.(\d+)/.exec(version.trim());
  return match ? `${match[1]}.${match[2]}` : version;
}

/** Accounts shown as two buttons at most; more become a menu that holds any
 * number without crowding the section heading. */
export const ACCOUNT_CHOICES_AS_BUTTONS = 2;

/** What tells accounts on one provider apart: the login, then the source when
 * another account shares that login, then the server when they differ. */
export function accountChoiceParts(account: HomeAccount, siblings: readonly HomeAccount[]): {
  login: string;
  showSource: boolean;
  server: string | null;
} {
  const sameLogin = siblings.filter((other) => other.login.toLowerCase() === account.login.toLowerCase());
  const servers = new Set(siblings.map((other) => other.server ?? ""));
  return {
    login: account.login,
    showSource: sameLogin.length > 1 || siblings.some((other) => other.source !== account.source),
    server: servers.size > 1 ? account.server : null,
  };
}

function homeKind(catalog: AccountCatalog, provider: string): HomeAccountKind | null {
  const kind = providerKind(catalog.providers, provider);
  return kind === "github" || kind === "gitlab" || kind === "bitbucket" ? kind : null;
}

/**
 * What Home can say about accounts from the local receipt.
 *
 * While the launch check (ADR 0027) is coming or running, saved connections
 * read as unchecked. A provider listing one that is not usable yet is
 * *pending*: its place is known from the receipt, not guessed. With nothing
 * usable and nothing listed (gh/glab sessions appear only once checked),
 * "none" would be a guess, so the accounts stay unknown (null) until the
 * check lands.
 */
export function readHomeAccounts(
  catalog: AccountCatalog | null | undefined,
  loaded: boolean,
): { accounts: HomeAccount[] | null; pendingKinds: HomeAccountKind[] } {
  if (!loaded || !catalog) return { accounts: null, pendingKinds: [] };
  const listed = catalog.accounts ?? [];
  const usable: HomeAccount[] = listed.flatMap((account) => {
    const kind = homeKind(catalog, account.provider);
    if (!kind || !account.available) return [];
    const provider = catalog.providers.find((candidate) => candidate.id === account.provider);
    return [{
      id: account.id,
      kind,
      login: account.login,
      // Token connections are stored as `<provider>:token.<login>`.
      source: account.id.includes(":token.") ? "token" : "connection",
      server: provider && !provider.builtIn ? account.host : null,
    }];
  });
  const pendingKinds = catalog.busy
    ? [...new Set(listed.flatMap((account) => {
        const kind = homeKind(catalog, account.provider);
        return kind && !account.available ? [kind] : [];
      }))].filter((kind) => !usable.some((account) => account.kind === kind))
    : [];
  const unknown = catalog.busy && usable.length === 0 && pendingKinds.length === 0;
  return { accounts: unknown ? null : usable, pendingKinds };
}

import type { Journey } from "./journey";

/**
 * The colour a state wears on the next-step card. Each is one of the status
 * tokens every theme already defines, so a theme changes the hue and never the
 * meaning:
 *
 * - `unsaved` — `--status-warning`, the colour the switcher and the rail
 *   already give a project with unsaved changes.
 * - `ready` — the theme's accent: saved work waiting to be published, the step
 *   that closes the loop.
 * - `incoming` — `--status-renamed`, the theme's blue: something new is on the
 *   remote.
 * - `blocked` — `--status-danger`: overlapping changes, or files that could
 *   not be read.
 * - `calm` — no tint: nothing is waiting, or the card only reports.
 */
export type NextStepTone = "unsaved" | "ready" | "incoming" | "blocked" | "calm";

/** What the card offers to press. The panel binds each to its handler. */
export type NextStepAction =
  | "save"
  | "reviewChanges"
  | "resolve"
  | "publish"
  | "openHistory"
  | "getChanges"
  | "checkRemote"
  | "checkLocal"
  | "openSettings"
  | "openLines";

export type NextStepKind =
  | "loading"
  | "localError"
  | "conflicts"
  | "save"
  | "firstSave"
  | "publish"
  | "unpublished"
  | "behind"
  | "diverged"
  | "checking"
  | "notChecked"
  | "unavailable"
  | "noRemote"
  | "noUpstream"
  | "detached"
  | "unborn"
  | "upToDate";

/** What comes after this step, said in the card in a neutral pill so the card
 * keeps one colour: saved work that will still need publishing, or versions
 * waiting on the remote. */
export type NextStepThen = { kind: "publish"; count: number } | { kind: "get"; count: number };

export type NextStep = {
  kind: NextStepKind;
  tone: NextStepTone;
  /** The one action that is the next step, or `null` when the card only
   * reports. At most one per card: it is the page's one primary button. */
  primary: NextStepAction | null;
  /** Quieter actions beside it, in display order. */
  secondary: NextStepAction[];
  /** How far along change → save → publish the project is: how many of the
   * three steps are done, and which one is the current one, if any. */
  progress: { done: 0 | 1 | 2 | 3; current: 0 | 1 | 2 | null };
  /** A spinner stands in for the glyph while the fact is still being read. */
  isPending: boolean;
  then: NextStepThen | null;
};

/**
 * Turns the journey — the facts Overview already derives — into the one card
 * that says what to do now. Pure: the card picks its words from `kind` and
 * its buttons from the actions, and this never reads the DOM.
 *
 * Local facts come first, because nothing on the remote side can be acted on
 * while files overlap or are unsaved; what the remote holds is then said as
 * what comes after. Once the working tree is clean, the remote side speaks.
 */
export function deriveNextStep(journey: Journey, { canPublish }: { canPublish: boolean }): NextStep {
  const { changes, publish } = journey;
  const incoming = (publish.state === "behind" || publish.state === "diverged") && publish.behind > 0
    ? publish.behind
    : 0;

  // Until both sides are read, the card holds its shape rather than guessing
  // a step that changes a moment later.
  if (changes.state === "loading" || (publish.state === "reading" && changes.state !== "error")) {
    return step("loading", "calm", null, [], { done: 0, current: null }, true);
  }
  if (changes.state === "error") {
    return step("localError", "blocked", "checkLocal", [], { done: 0, current: 0 });
  }
  if (changes.state === "conflicts") {
    return step("conflicts", "blocked", "resolve", [], { done: 0, current: 0 });
  }
  if (changes.state === "dirty") {
    if (publish.state === "unborn") {
      return step("firstSave", "unsaved", "save", [], { done: 1, current: 1 });
    }
    // Versions waiting on the remote come before your own unpublished ones:
    // they have to be received before anything can be published.
    const then: NextStepThen | null = incoming > 0
      ? { kind: "get", count: incoming }
      : publish.pending > 0 ? { kind: "publish", count: publish.pending } : null;
    return step("save", "unsaved", "save", ["reviewChanges"], { done: 1, current: 1 }, false, then);
  }

  // Everything on this computer is saved; the remote side decides the rest.
  switch (publish.state) {
    case "ahead":
      return canPublish
        ? step("publish", "ready", "publish", ["openHistory"], { done: 2, current: 2 })
        : step("unpublished", "ready", null, ["openHistory"], { done: 2, current: 2 });
    case "behind":
      return step("behind", "incoming", "getChanges", [], { done: 2, current: 2 });
    case "diverged":
      // Both sides moved: receive first, then publish what is yours.
      return step("diverged", "incoming", "getChanges", [], { done: 2, current: 2 }, false,
        publish.pending > 0 ? { kind: "publish", count: publish.pending } : null);
    case "reading":
    case "checking":
      return step("checking", "calm", null, [], { done: 2, current: null }, true);
    case "notChecked":
      return step("notChecked", "calm", null, ["checkRemote"], { done: 2, current: null }, publish.isChecking);
    case "unavailable":
      // The work itself is safe; only the remote could not be asked. The card
      // says so calmly and its glyph carries the failure.
      return step("unavailable", "calm", null, ["checkRemote"], { done: 2, current: null }, publish.isChecking);
    case "noRemote":
      return step("noRemote", "calm", null, ["openSettings"], { done: 2, current: null });
    case "noUpstream":
      return step("noUpstream", "calm", null, [], { done: 2, current: null });
    case "detached":
      return step("detached", "calm", null, ["openLines"], { done: 2, current: null });
    case "unborn":
      return step("unborn", "calm", null, [], { done: 0, current: null });
    case "upToDate":
      // Nothing to do: the status bar's cloud is where the remote is checked
      // again, and the card does not offer it twice.
      return step("upToDate", "calm", null, [], { done: 3, current: null }, publish.isChecking);
  }
}

function step(
  kind: NextStepKind,
  tone: NextStepTone,
  primary: NextStepAction | null,
  secondary: NextStepAction[],
  progress: NextStep["progress"],
  isPending = false,
  then: NextStepThen | null = null,
): NextStep {
  return { kind, tone, primary, secondary, progress, isPending, then };
}

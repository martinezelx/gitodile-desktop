import type { SavedVersionSummary } from "./domain";

/** How the timeline is drawn from the versions a page holds, in the page's
 * topological order. Nothing here asks Git anything: `parents` and the order
 * are already in every page. */

/** The most lanes the column ever makes room for. A history with more lines
 * alive at once draws the extra ones on the last lane rather than widening
 * the column past the subjects it exists to show. */
export const MAX_LANES = 5;

/** What a lane is waiting for: the version it runs down to, and the tint it
 * has worn since it began. Tint 0 is the trunk — the line being read. */
export type LaneSlot = { commit: string; tint: number } | null;

export type LaneRow = {
  /** The lane this version's node sits on, and that lane's tint. */
  lane: number;
  tint: number;
  /** The lanes crossing the top half of the row, and the bottom half. */
  lanesIn: LaneSlot[];
  lanesOut: LaneSlot[];
  /** From the node down to each parent's lane, first parent first. */
  edges: Array<{ lane: number; tint: number }>;
};

/** What a lane stands for, for the reader pointing at it: the line's name when
 * a reference or the merge that brought it in says it, and whether its
 * versions are in another line. */
export type LaneLine = {
  name: string | null;
  /** The newest merge that took this line into another, the first met in the
   * page's order: which lane, and how many of this line's versions came after
   * it — saved since, and not in the other line yet. */
  lastMerge: { into: number; after: number } | null;
  /** This line's versions, newest first, to count what came after a merge. */
  commits: string[];
};

export type LaneLayout = { rows: Map<string, LaneRow>; width: number; lines: Map<number, LaneLine> };

const MERGED_NAME = [/^Merge (?:remote-tracking )?branch '([^']+)'/, /^Merge pull request #\d+ from [^/\s]+\/(\S+)/, /^Merge (?:remote-tracking )?branch "([^"]+)"/];
/** The line a merge's subject says it brought in, as Git and the hosts word it. */
function mergedLineName(subject: string): string | null {
  for (const pattern of MERGED_NAME) {
    const name = pattern.exec(subject)?.[1];
    if (name) return name.replace(/^origin\//, "");
  }
  return null;
}
/** The line a version's own references name: a local line first, then a
 * remote one without its remote. */
function referencedLineName(version: SavedVersionSummary): string | null {
  const local = version.decorations.find((decoration) => decoration.kind === "localBranch");
  if (local) return local.name;
  const remote = version.decorations.find((decoration) => decoration.kind === "remoteBranch");
  return remote ? remote.name.replace(/^[^/]+\//, "") : null;
}

/** How many tints a lane can take besides the trunk's, before they repeat. */
export const LANE_TINTS = 8;

/** The versions a single line's own history walks: the tip, then each first
 * parent, as far as the loaded pages reach. A merge's other parents are what
 * the merge brought in, not the line's own steps. */
export function firstParentChain(versions: readonly SavedVersionSummary[]): Set<string> {
  const byCommit = new Map(versions.map((version) => [version.commit, version]));
  const chain = new Set<string>();
  for (let version: SavedVersionSummary | undefined = versions[0]; version && !chain.has(version.commit); version = byCommit.get(version.parents[0] ?? "")) {
    chain.add(version.commit);
  }
  return chain;
}

/** What a merge on the chain brought in: everything reachable from its other
 * parents — merges inside the merged line included — until the chain, and
 * nothing an earlier merge already claimed. Only loaded versions are named,
 * so on a partly loaded history the count can grow with the next page. */
export function mergedBy(
  merge: SavedVersionSummary,
  byCommit: ReadonlyMap<string, SavedVersionSummary>,
  chain: ReadonlySet<string>,
  claimed: Set<string> = new Set(),
): SavedVersionSummary[] {
  const brought: SavedVersionSummary[] = [];
  const queue = merge.parents.slice(1);
  while (queue.length > 0) {
    const version = byCommit.get(queue.shift()!);
    if (!version || chain.has(version.commit) || claimed.has(version.commit)) continue;
    claimed.add(version.commit);
    brought.push(version);
    queue.push(...version.parents);
  }
  return brought;
}

export type Detour = { merge: string; versions: string[]; open: boolean };

/** A single line read straight: the chain, plus what the merges the reader
 * opened brought in. Order is the page's, so an opened detour sits where Git
 * put it. A merge with nothing loaded to show keeps no detour, and a version
 * no merge on the chain accounts for stays in view: nothing is hidden that
 * the reader could not open again. */
export function versionsWithDetours(
  versions: readonly SavedVersionSummary[],
  opened: ReadonlySet<string>,
): { visible: SavedVersionSummary[]; detours: Map<string, Detour> } {
  const chain = firstParentChain(versions);
  const byCommit = new Map(versions.map((version) => [version.commit, version]));
  const detours = new Map<string, Detour>();
  const claimed = new Set<string>();
  const hidden = new Set<string>();
  for (const version of versions) {
    if (!chain.has(version.commit) || version.parents.length < 2) continue;
    const brought = mergedBy(version, byCommit, chain, claimed);
    if (brought.length === 0) continue;
    const open = opened.has(version.commit);
    detours.set(version.commit, { merge: version.commit, versions: brought.map((entry) => entry.commit), open });
    if (!open) for (const entry of brought) hidden.add(entry.commit);
  }
  return { visible: versions.filter((version) => !hidden.has(version.commit)), detours };
}

/** The merge whose detour holds `commit`, when it is folded away. */
export function detourHolding(detours: ReadonlyMap<string, Detour>, commit: string): string | null {
  for (const detour of detours.values()) if (detour.versions.includes(commit)) return detour.merge;
  return null;
}

/** Lanes for versions in topological order, children before parents. Each
 * version sits on the lane already waiting for it — or the first free one —
 * and hands that lane to its first parent; every other parent gets the lane
 * already waiting for it, or a new one with a tint of its own. Lanes waiting
 * for the same version join it there. Parents outside `versions` end their
 * lane at the node: a filtered or partial history draws no line to nowhere. */
export function layoutLanes(versions: readonly SavedVersionSummary[]): LaneLayout {
  const present = new Set(versions.map((version) => version.commit));
  const lanes: LaneSlot[] = [];
  const rows = new Map<string, LaneRow>();
  const lines = new Map<number, LaneLine>();
  const lineOf = (tint: number): LaneLine => {
    let line = lines.get(tint);
    if (!line) lines.set(tint, (line = { name: null, lastMerge: null, commits: [] }));
    return line;
  };
  let nextTint = 1;
  /* The version each line's last merge took, to count what it saved after. */
  const mergedParents = new Map<number, string>();
  let width = 0;
  const freeLane = (): number => {
    const free = lanes.indexOf(null);
    return free < 0 ? lanes.length : free;
  };
  versions.forEach((version, index) => {
    let lane = lanes.findIndex((slot) => slot?.commit === version.commit);
    const isTip = lane < 0;
    if (isTip) {
      lane = freeLane();
      lanes[lane] = { commit: version.commit, tint: index === 0 ? 0 : nextTint++ };
    }
    const tint = lanes[lane]!.tint;
    const line = lineOf(tint);
    line.commits.push(version.commit);
    line.name ??= referencedLineName(version);
    // A tip starts at its own node: nothing runs into it from above.
    const lanesIn = lanes.slice();
    if (isTip) lanesIn[lane] = null;
    for (let other = 0; other < lanes.length; other++) {
      if (other !== lane && lanes[other]?.commit === version.commit) lanes[other] = null;
    }
    const parents = version.parents.filter((parent) => present.has(parent));
    const edges: LaneRow["edges"] = [];
    lanes[lane] = parents[0] ? { commit: parents[0], tint } : null;
    if (parents[0]) edges.push({ lane, tint });
    for (const parent of parents.slice(1)) {
      let target = lanes.findIndex((slot) => slot?.commit === parent);
      if (target < 0) {
        target = freeLane();
        lanes[target] = { commit: parent, tint: nextTint++ };
        lineOf(lanes[target]!.tint).name ??= mergedLineName(version.subject);
      }
      // The first merge met is the newest: it is the one that says what the
      // other line has of this one now.
      const merged = lineOf(lanes[target]!.tint);
      if (lanes[target]!.tint !== tint && !merged.lastMerge) {
        merged.lastMerge = { into: tint, after: 0 };
        mergedParents.set(lanes[target]!.tint, parent);
      }
      edges.push({ lane: target, tint: lanes[target]!.tint });
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    const lanesOut = lanes.slice();
    width = Math.max(width, lanesIn.length, lanesOut.length, lane + 1);
    rows.set(version.commit, { lane, tint, lanesIn, lanesOut, edges });
  });
  for (const [tint, parent] of mergedParents) {
    const line = lines.get(tint);
    // Only loaded versions are counted, as everywhere on this timeline.
    if (line?.lastMerge) line.lastMerge.after = Math.max(0, line.commits.indexOf(parent));
  }
  return { rows, width: Math.min(width, MAX_LANES), lines };
}

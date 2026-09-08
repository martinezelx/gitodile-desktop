import React from "react";
import { GitBranch, Tag } from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import type { HistoryDecoration, SavedVersionSummary } from "./domain";

/* A commit carries every ref that points *at* it, which is not the same
   question as "which line is this commit on" — Git cannot answer that one
   cheaply, and a commit reachable from five lines belongs to all of them. So a
   row is badged only when a ref genuinely lands on it, and the rest of the
   timeline keeps the author and the time it already had.

   Ranked, because a dense row has space for one name and the detail panel
   already lists the full set.

   A tag comes first. It is the one fact on the row that cannot be inferred by
   looking: a line's name is already implied by standing on it, and a line moves
   with every saved version, while a tag is permanent and marks something
   someone chose to mark. A remote tracking ref comes last — it almost always
   sits on the same commit as the local line it tracks and repeats that name
   with a prefix. `head` is not ranked at all: its name is the literal string
   "HEAD", which names no line; it is read separately, as the signal that the
   line beside it is the one currently checked out. */
const BADGE_RANK = { tag: 0, localBranch: 1, remoteBranch: 2 } as const;

type BadgeKind = keyof typeof BADGE_RANK;

function isBadgeable(decoration: HistoryDecoration): decoration is HistoryDecoration & { kind: BadgeKind } {
  return decoration.kind !== "head";
}

/** Whether this reference is the line the working tree is currently on — not
    merely a line that happens to share a commit with it. */
function isCheckedOutLine(
  decoration: HistoryDecoration,
  version: SavedVersionSummary,
  currentBranch: string | null,
): boolean {
  return decoration.kind === "localBranch"
    && decoration.name === currentBranch
    && version.decorations.some((item) => item.kind === "head");
}

/** The one reference a dense row has space for, or `null` if none points here.

    Between two lines of the same kind the checked-out one wins. Several lines
    can point at one commit — this repository's own tip carries `main` and the
    branch it was merged from — and picking alphabetically would name whichever
    sorts first rather than the one the user is standing on. It is a tie-break
    inside a rank, not a jump over it: a release tag on that same commit is
    still the more interesting of the two. */
export function primaryDecoration(version: SavedVersionSummary, currentBranch: string | null): HistoryDecoration | null {
  let best: (HistoryDecoration & { kind: BadgeKind }) | null = null;
  for (const decoration of version.decorations) {
    if (!isBadgeable(decoration)) continue;
    if (!best) { best = decoration; continue; }
    const byKind = BADGE_RANK[decoration.kind] - BADGE_RANK[best.kind];
    if (byKind < 0 || (byKind === 0 && isCheckedOutLine(decoration, version, currentBranch))) best = decoration;
  }
  return best;
}

/** The local version line this row names, or `null` if it names none.
 *
 * The badge and the row's actions have to agree about which line a row is
 * about, so both ask this. It is still "a ref that points at this commit" and
 * never "the line this commit is on": a tag may outrank the line in the badge,
 * and the line is still the one the actions act on. */
export function localLineFor(
  version: SavedVersionSummary,
  currentBranch: string | null,
): HistoryDecoration | null {
  const primary = primaryDecoration(version, currentBranch);
  if (primary?.kind === "localBranch") return primary;
  return (
    version.decorations.find(
      (decoration) => decoration.kind === "localBranch" && decoration.name === currentBranch,
    ) ?? version.decorations.find((decoration) => decoration.kind === "localBranch") ?? null
  );
}

/** Spoken form of a reference. Both rows are buttons with an explicit
    `aria-label`, which replaces their whole subtree, so the badge stays silent
    unless the row folds this into its own name. */
export function decorationLabel(decoration: HistoryDecoration, t: Translations): string {
  return decoration.kind === "tag" ? t.historyRefTagLabel(decoration.name) : t.historyRefLineLabel(decoration.name);
}

/** The separator between two facts on a metadata line.

    A real element, not a `::before` on the item that follows it. The badge is
    an `inline-flex` capsule, so a pseudo-element on it would be laid out as a
    flex child *inside* its border — the dot would sit within the pill instead
    of before it. */
export function HistoryMetaDot(): React.JSX.Element {
  return <span className="history-meta-dot" aria-hidden="true">·</span>;
}

export function HistoryRefBadge({ version, currentBranch }: {
  version: SavedVersionSummary; currentBranch: string | null;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const decoration = primaryDecoration(version, currentBranch);
  if (!decoration) return null;
  const isTag = decoration.kind === "tag";
  // The accent is for the line being stood on, not merely for a line that
  // happens to share a commit with it. A sibling line on the same tip, a
  // detached HEAD with no line at all, and a tag that outranked the line it
  // shares a commit with all get the ordinary treatment.
  const isCurrent = isCheckedOutLine(decoration, version, currentBranch);
  return (
    <>
      {/* Carried by the badge rather than by its host, so a row can never
          render the capsule without the separator that seats it in the line. */}
      <HistoryMetaDot />
      <span
        className={
          `history-ref-badge history-ref-badge--${isTag ? "tag" : "line"}` +
          (isCurrent ? " history-ref-badge--current" : "")
        }
        title={`${decorationLabel(decoration, t)} — ${decoration.fullRef}`}
      >
        {isTag ? <Tag aria-hidden="true" /> : <GitBranch aria-hidden="true" />}
        {/* A bare text node would be an anonymous flex item, which `ellipsis`
            cannot address; a long line name has to truncate, not clip. */}
        <span className="history-ref-badge__name">{decoration.name}</span>
      </span>
    </>
  );
}

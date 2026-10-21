import React from "react";
import { CloudDownload, CloudOff, CloudUpload, House } from "lucide-react";
import type { Translations } from "../../i18n";
import { formatNumber, type LocaleFormats } from "../../shared/i18n";
import { LocalOnlyIcon, type StateGlyphTone } from "../../shared/ui";
import type { VersionLine } from "./domain";
import { deletabilityOf } from "./lineActions";

/** How this line compares to its upstream, derived from the last local
 * fetch — never a live remote check. `"none"` and `"synced"` are the two
 * unremarkable states; everything else is worth a row chip. */
export type SyncStatus =
  | { kind: "none" }
  | { kind: "synced" }
  | { kind: "gone" }
  | { kind: "ahead"; count: number }
  | { kind: "behind"; count: number }
  | { kind: "diverged"; ahead: number; behind: number };

export function syncStatusOf(line: VersionLine): SyncStatus {
  if (line.upstream === null) {
    return { kind: "none" };
  }
  if (line.upstreamGone) {
    return { kind: "gone" };
  }
  const ahead = line.upstreamAhead ?? 0;
  const behind = line.upstreamBehind ?? 0;
  if (ahead > 0 && behind > 0) {
    return { kind: "diverged", ahead, behind };
  }
  if (ahead > 0) {
    return { kind: "ahead", count: ahead };
  }
  if (behind > 0) {
    return { kind: "behind", count: behind };
  }
  return { kind: "synced" };
}

export function syncText(sync: SyncStatus, t: Translations): string {
  switch (sync.kind) {
    case "none":
      return t.versionLinesSyncNoUpstream;
    case "synced":
      return t.versionLinesSyncUpToDate;
    case "gone":
      return t.versionLinesSyncGone;
    case "ahead":
      return t.versionLinesSyncAhead(sync.count);
    case "behind":
      return t.versionLinesSyncBehind(sync.count);
    case "diverged":
      return t.versionLinesSyncAheadBehind(sync.ahead, sync.behind);
  }
}

/** One state a row flags, as a glyph. `label` is the short name the chip used
 * to spell out — what a screen reader hears, as the row's description —
 * and `tooltip` the sentence that says what the glyph means to someone who has
 * not learned it yet. */
export type RowGlyph = {
  key: string;
  tone: StateGlyphTone;
  icon: React.ReactNode;
  /** Drawn beside the icon: how many versions an arrow stands for. */
  count?: string;
  label: string;
  tooltip: string;
};

/** Where the project is: the ring with its centre filled, so it stands apart
 * from every other glyph in a theme whose accent is the text's own ink. */
function ActiveIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Only what asks something of the reader, each glyph with one meaning. The
 * cloud is the remote, in the app's own verbs: up to publish in the local
 * tone, down to get in the remote's. Whether a line can be deleted is not
 * here: the list's blocks already say it, and a tick or a warning on every
 * row read as "done" and as a problem. In sync with its remote says nothing,
 * as it always did: the unremarkable state is the one without a mark. */
export function rowGlyphs(line: VersionLine, t: Translations, formats: LocaleFormats): RowGlyph[] {
  const glyphs: RowGlyph[] = [];
  // First, in the accent: where the project is. It carries no `label` — the
  // row's own accessible name already ends in "Active".
  if (line.isActive) {
    glyphs.push({
      key: "active",
      tone: "accent",
      icon: <ActiveIcon />,
      label: "",
      tooltip: t.versionLinesGlyphActive,
    });
  }
  // The main line is home: where the shared work lives. Quiet, since it is
  // pinned at the top already.
  if (deletabilityOf(line) === "protected") {
    glyphs.push({
      key: "protected",
      tone: "neutral",
      icon: <House />,
      label: t.versionLinesDefaultLineChip,
      tooltip: t.versionLinesGlyphProtected,
    });
  }
  const sync = syncStatusOf(line);
  if (sync.kind === "none") {
    glyphs.push({
      key: "local",
      tone: "local",
      icon: <LocalOnlyIcon />,
      label: t.versionLinesNoUpstreamLabel,
      tooltip: t.versionLinesGlyphLocalOnly,
    });
  } else if (sync.kind === "gone") {
    // Neutral: after a pull request is merged this is what is expected, not
    // something to look at.
    glyphs.push({
      key: "gone",
      tone: "neutral",
      icon: <CloudOff />,
      label: syncText(sync, t),
      tooltip: t.versionLinesGlyphGone,
    });
  } else if (sync.kind === "ahead" || sync.kind === "diverged") {
    const ahead = sync.kind === "ahead" ? sync.count : sync.ahead;
    glyphs.push({
      key: "ahead",
      tone: "local",
      icon: <CloudUpload />,
      count: formatNumber(ahead, formats),
      label: sync.kind === "ahead" ? syncText(sync, t) : "",
      tooltip: t.versionLinesSyncAhead(ahead),
    });
  }
  if (sync.kind === "behind" || sync.kind === "diverged") {
    const behind = sync.kind === "behind" ? sync.count : sync.behind;
    glyphs.push({
      key: "behind",
      tone: "remote",
      icon: <CloudDownload />,
      count: formatNumber(behind, formats),
      // A diverged line is read out as one state, the way its chip said it,
      // rather than as two halves of one sentence.
      label: syncText(sync, t),
      tooltip: t.versionLinesSyncBehind(behind),
    });
  }
  return glyphs;
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Cloud,
  CloudOff,
  GitBranch,
  Info,
  Laptop,
  PenLine,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { formatDate, formatNumber, formatRelativeTime, type LocaleFormats } from "../../shared/i18n";
import {
  AutomaticUpdatesNotice,
  contextMenuAnchorFrom,
  FilterCapsule,
  FilterCapsules,
  FilterGroup,
  FilterPanel,
  FilterSwitch,
  LoadingBar,
  SearchBox,
  autoHideScrollbarProps,
} from "../../shared/ui";
import type { VersionLine, VersionLineHistory, VersionLinesSnapshot } from "./domain";
import { deletabilityOf, deleteActionLabel, versionLineActions } from "./lineActions";
import { VersionLineContextMenu, type VersionLineContextMenuState } from "./VersionLineContextMenu";
import { VersionLineQuickCreateBox } from "./VersionLineQuickCreateBox";
import { VersionLineRenameStrip } from "./VersionLineRenameStrip";
import { VersionLineRoute, type DrawnRoute } from "./VersionLineRoute";
import { VersionLineChanges } from "./VersionLineChanges";
import {
  CreateVersionLineDialog,
  DeleteVersionLineDialog,
  SwitchVersionLineDialog,
} from "./VersionLinesDialog";

type DialogRequest =
  | { kind: "create"; forceSwitch: boolean }
  | { kind: "switch"; target: string }
  | { kind: "delete"; target: string }
  | null;

/** How the list is ordered. `unpublished` leans on `upstream === null` — a fact
 * the snapshot already carries — rather than on any commit count, which would
 * mean asking Git something new (task 034). */
type SortKey = "recent" | "name" | "unpublished";

const SORT_KEYS = ["recent", "name", "unpublished"] as const;

const SORT_LABEL_KEYS = {
  recent: "versionLinesSortRecent",
  name: "versionLinesSortName",
  unpublished: "versionLinesSortUnpublished",
} as const satisfies Record<SortKey, keyof Translations>;

/** The state filters offered beside the sort. They intentionally mirror the
 * chips a row can show, so what you filter by is what you see. */
type StateFilter = "tracking" | "local-only" | "deletable" | "blocked";

const STATE_KEYS = ["tracking", "local-only", "deletable", "blocked"] as const;

/** The glyph each state wears on a row, drawn beside its name here too: the
 * filter panel is where the glyphs are listed with their words, which makes it
 * the list's legend as well as its filter. `tracking` has no row glyph — it is
 * the unremarkable state — so it takes the remote's cloud only here. */
const STATE_GLYPHS = {
  tracking: { icon: <Cloud />, tone: "neutral" },
  "local-only": { icon: <Laptop />, tone: "neutral" },
  deletable: { icon: <CircleCheck />, tone: "positive" },
  blocked: { icon: <TriangleAlert />, tone: "warning" },
} as const satisfies Record<StateFilter, { icon: React.ReactNode; tone: string }>;

const STATE_LABEL_KEYS = {
  tracking: "versionLinesStateTracking",
  "local-only": "versionLinesNoUpstreamLabel",
  deletable: "versionLinesDeletablePill",
  blocked: "versionLinesNotDeletablePill",
} as const satisfies Record<StateFilter, keyof Translations>;

/** How this line compares to its upstream, derived from the last local
 * fetch — never a live remote check. `"none"` and `"synced"` are the two
 * unremarkable states; everything else is worth a row chip. */
type SyncStatus =
  | { kind: "none" }
  | { kind: "synced" }
  | { kind: "gone" }
  | { kind: "ahead"; count: number }
  | { kind: "behind"; count: number }
  | { kind: "diverged"; ahead: number; behind: number };

function syncStatusOf(line: VersionLine): SyncStatus {
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

function syncText(sync: SyncStatus, t: Translations): string {
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

/** The tip is published only when a remote branch is known to hold it: an
 * upstream that still exists and nothing waiting to be pushed. Anything else
 * is honestly "not published yet" rather than a guess either way. */
function isTipPublished(line: VersionLine): boolean {
  return line.upstream !== null && !line.upstreamGone && (line.upstreamAhead ?? 0) === 0;
}

function tipDate(line: VersionLine): Date | null {
  if (!line.tip.committedAt) {
    return null;
  }
  const date = new Date(line.tip.committedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** How many saved versions the detail lists while the comparison with the
 * main line has the panel's height — enough to see the line's latest work,
 * the rest one press away in History. */
const VERSIONS_BESIDE_CHANGES = 4;

/* ---------------------------------------------------------------- list ---- */

type GlyphTone = "neutral" | "positive" | "warning" | "protected" | "active";

/** One state a row flags, as a glyph. `label` is the short name the chip used
 * to spell out — what a screen reader hears, as the row's description —
 * and `tooltip` the sentence that says what the glyph means to someone who has
 * not learned it yet. */
type RowGlyph = {
  key: string;
  tone: GlyphTone;
  icon: React.ReactNode;
  /** Drawn beside the icon: how many versions an arrow stands for. */
  count?: string;
  label: string;
  tooltip: string;
};

/** The same two questions the chips answered — where the line stands against
 * its remote, and whether it can be cleared away — each as a glyph. In sync
 * with its remote says nothing, as it always did: the unremarkable state is
 * the one without a mark. */
function rowGlyphs(line: VersionLine, t: Translations, formats: LocaleFormats): RowGlyph[] {
  const glyphs: RowGlyph[] = [];
  // First, in the accent: where the project is. It carries no `label` — the
  // row's own accessible name already ends in "Active".
  if (line.isActive) {
    glyphs.push({
      key: "active",
      tone: "active",
      icon: <CircleDot />,
      label: "",
      tooltip: t.versionLinesGlyphActive,
    });
  }
  const sync = syncStatusOf(line);
  if (sync.kind === "none") {
    glyphs.push({
      key: "local",
      tone: "neutral",
      icon: <Laptop />,
      label: t.versionLinesNoUpstreamLabel,
      tooltip: t.versionLinesGlyphLocalOnly,
    });
  } else if (sync.kind === "gone") {
    glyphs.push({
      key: "gone",
      tone: "warning",
      icon: <CloudOff />,
      label: syncText(sync, t),
      tooltip: t.versionLinesGlyphGone,
    });
  } else if (sync.kind === "ahead" || sync.kind === "diverged") {
    const ahead = sync.kind === "ahead" ? sync.count : sync.ahead;
    glyphs.push({
      key: "ahead",
      tone: "neutral",
      icon: <ArrowUp />,
      count: formatNumber(ahead, formats),
      label: sync.kind === "ahead" ? syncText(sync, t) : "",
      tooltip: t.versionLinesSyncAhead(ahead),
    });
  }
  if (sync.kind === "behind" || sync.kind === "diverged") {
    const behind = sync.kind === "behind" ? sync.count : sync.behind;
    glyphs.push({
      key: "behind",
      tone: "neutral",
      icon: <ArrowDown />,
      count: formatNumber(behind, formats),
      // A diverged line is read out as one state, the way its chip said it,
      // rather than as two halves of one sentence.
      label: syncText(sync, t),
      tooltip: t.versionLinesSyncBehind(behind),
    });
  }

  const deletability = deletabilityOf(line);
  if (deletability === "protected") {
    glyphs.push({
      key: "protected",
      tone: "protected",
      icon: <ShieldCheck />,
      label: t.versionLinesDefaultLineChip,
      tooltip: t.versionLinesGlyphProtected,
    });
  } else if (!line.isActive && deletability === "ready") {
    glyphs.push({
      key: "ready",
      tone: "positive",
      icon: <CircleCheck />,
      label: t.versionLinesDeletablePill,
      tooltip: t.versionLinesGlyphDeletable,
    });
  } else if (!line.isActive && deletability === "unique-work") {
    glyphs.push({
      key: "unique",
      tone: "warning",
      icon: <TriangleAlert />,
      label: t.versionLinesNotDeletablePill,
      tooltip: t.versionLinesGlyphNotDeletable,
    });
  }
  return glyphs;
}

/** One line in the list column: the sibling of a History timeline row and of a
 * Changes file row, at the same tier — a name, the states worth flagging as
 * glyphs, and when it last moved, on one line. Its actions are not here: a row
 * that carries three buttons per line spends the column's width on controls
 * for lines nobody has selected. */
const VersionLineRow = React.memo(function VersionLineRow({
  line,
  selected,
  focusable,
  index,
  formats,
  onSelect,
  onMove,
  onOpenDetail,
  onContextMenu,
  onRename,
  onHoverIntent,
}: {
  line: VersionLine;
  selected: boolean;
  focusable: boolean;
  index: number;
  formats: LocaleFormats;
  onSelect: (name: string) => void;
  onMove: (index: number) => void;
  onOpenDetail: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  /** F2, the rename key every file list answers to. It opens the same edit
   * the detail's Rename does, in the strip, and only where Rename is offered. */
  onRename: (name: string) => void;
  /** The pointer came to rest on this row, or left it (`null`) — the panel
   * starts this line's detail read on the first, a moment before the press
   * that would otherwise start it. */
  onHoverIntent?: (line: VersionLine | null) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const glyphs = rowGlyphs(line, t, formats);
  /* What the glyphs say, in words, for a screen reader. A description rather
     than hidden text inside the row: the row's `aria-label` replaces its
     content, and a description that points at the row's own children is one
     assistive technology is free to drop. */
  const states = glyphs
    .map((glyph) => glyph.label)
    .filter(Boolean)
    .join(", ");
  const date = tipDate(line);
  const relative = date ? formatRelativeTime(date, formats) : "";
  const label = line.isActive ? `${line.name} — ${t.versionLinesActiveLabel}` : line.name;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "F2") {
      if (!versionLineActions(line).canRename) return;
      event.preventDefault();
      onRename(line.name);
      return;
    }
    const target =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? Number.MAX_SAFE_INTEGER
              : null;
    if (target === null) return;
    event.preventDefault();
    onMove(target);
  };

  return (
    <button
      id={`version-line-${line.name}`}
      className={`version-line-row${selected ? " version-line-row--selected" : ""}${line.isActive ? " version-line-row--active" : ""}`}
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={label}
      aria-description={states || undefined}
      tabIndex={focusable ? 0 : -1}
      onClick={() => {
        onSelect(line.name);
        onOpenDetail();
      }}
      // Selecting first, the way every list does: the menu names one line, and
      // the panel behind it must be describing that same one while it is open.
      onContextMenu={(event) => {
        onSelect(line.name);
        onContextMenu(event);
      }}
      onKeyDown={handleKeyDown}
      onPointerEnter={onHoverIntent && (() => onHoverIntent(line))}
      onPointerLeave={onHoverIntent && (() => onHoverIntent(null))}
    >
      {/* Two lines: the name alone, then the states as glyphs and the date,
          quieter, under it. The states used to be text chips — `Local only ·
          Can't be deleted yet` is most of a 272px row — and then one line of
          glyphs beside the name, which left a long name
          `feature/windows-installe…` in half the row. A name is what the
          reader scans the list for, so it gets the whole width; a glyph says
          its state in 14px on the line below, its tooltip in a sentence, and
          the row's description reads it out. `Active` is one of them — the
          first, in the accent: the word is in the detail strip beside the
          list, and saying it on the row as well put the same chip twice on
          one line of the screen. */}
      <span className="version-line-row__name-row">
        <span className="version-line-row__name" title={line.name}>
          {line.name}
        </span>
      </span>
      <span className="version-line-row__meta">
      {glyphs.length > 0 && (
        <span className="version-line-row__glyphs" aria-hidden="true">
          {glyphs.map((glyph) => (
            <span
              key={glyph.key}
              className={`version-line-glyph version-line-glyph--${glyph.tone}`}
              data-tooltip={glyph.tooltip}
            >
              <span className="version-line-glyph__icon">{glyph.icon}</span>
              {glyph.count && <span>{glyph.count}</span>}
            </span>
          ))}
        </span>
      )}
      {relative && <span className="version-line-row__date">{relative}</span>}
      </span>
    </button>
  );
});

/** Search's neighbour: the sort and the state/prefix filters behind one
 * trigger, the way the History timeline keeps its own. The trigger says *how
 * many* filters are on rather than what they are set to, which is the only
 * arrangement that does not grow with the number of them — a ~300px column
 * cannot pay for a menu per filter. */
function VersionLinesFilterPanel({
  sort,
  prefixCounts,
  stateCounts,
  selectedPrefixes,
  selectedStates,
  onSort,
  onTogglePrefix,
  onToggleState,
  onClear,
}: {
  sort: SortKey;
  prefixCounts: [string, number][];
  stateCounts: Record<StateFilter, number>;
  selectedPrefixes: string[];
  selectedStates: StateFilter[];
  onSort: (sort: SortKey) => void;
  onTogglePrefix: (prefix: string) => void;
  onToggleState: (state: StateFilter) => void;
  onClear: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const active = selectedPrefixes.length + selectedStates.length;

  return (
    <FilterPanel
      activeCount={active}
      labels={{
        open: t.versionLinesFiltersLabel,
        active: t.versionLinesFiltersActive,
        activeCount: t.versionLinesFiltersActiveCount,
        clear: t.versionLinesFilterClear,
      }}
      onClear={onClear}
    >
      {/* Capsules rather than radio rows: one choice out of a short, fixed set
          of the same kind of thing — and one row, which is what `dense` and
          three one-or-two-word answers are for. They used to be sentences:
          `Recently updated`, `Name (A–Z)` and `Local-only first` come to 321px
          in a panel group that is 238px wide, so the row this control is
          supposed to be wrapped onto a second line and then a third. The
          legend above them already says these are sorts. */}
      <FilterGroup label={t.versionLinesFilterSortGroup}>
        <FilterCapsules dense>
          {SORT_KEYS.map((key) => (
            <FilterCapsule
              key={key}
              name="version-lines-sort"
              checked={sort === key}
              onChange={() => onSort(key)}
            >
              {t[SORT_LABEL_KEYS[key]]}
            </FilterCapsule>
          ))}
        </FilterCapsules>
      </FilterGroup>

      <FilterGroup label={t.versionLinesFilterStateGroup}>
        {STATE_KEYS.map((state) => (
          <FilterSwitch
            key={state}
            checked={selectedStates.includes(state)}
            icon={
              <span className={`version-line-glyph version-line-glyph--${STATE_GLYPHS[state].tone}`} aria-hidden="true">
                {STATE_GLYPHS[state].icon}
              </span>
            }
            label={t[STATE_LABEL_KEYS[state]]}
            count={stateCounts[state]}
            onChange={() => onToggleState(state)}
          />
        ))}
      </FilterGroup>

      {prefixCounts.length > 0 && (
        <FilterGroup label={t.versionLinesFilterPrefixGroup}>
          {/* The one part of this panel that grows with the repository — a row
              per name prefix — so it is the one part that scrolls. The panel
              itself must not: `.filter-panel` deliberately has no overflow, and
              a group that keeps its heading in place while its options move is
              easier to read than a panel that slides everything. */}
          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            className="version-lines-filter__prefixes auto-hide-scrollbar"
          >
            {prefixCounts.map(([prefix, count]) => (
              <FilterSwitch
                key={prefix}
                checked={selectedPrefixes.includes(prefix)}
                label={prefix}
                count={count}
                onChange={() => onTogglePrefix(prefix)}
              />
            ))}
          </div>
        </FilterGroup>
      )}
    </FilterPanel>
  );
}

/* -------------------------------------------------------------- detail ---- */

/** What can be done to the line the reader has chosen, at the end of its
 * strip: Switch as the one labelled action, Rename and Delete as icon-only
 * circles named on their tooltips.
 *
 * The active line has no "new line from here": the composer under the list
 * starts a line from exactly that point, and a second button for the same
 * form is the route this screen stopped offering when the header's "New line"
 * went.
 *
 * Delete is out in the open rather than behind a `⋯`, which read as
 * "advanced" for one of the three ordinary things done to a line and put the
 * only destructive action a step further from the explanation of whether it
 * is safe. It is told apart by its glyph's danger tone, and by the tint it
 * takes only under the pointer.
 *
 * Every one of them is absent rather than disabled where it cannot apply, with
 * one exception — a line open in another workspace keeps a disabled Switch,
 * because that is a temporary condition the tooltip explains. */
function VersionLineActions({
  line,
  copiedInto,
  onSwitch,
  onRename,
  onDelete,
}: {
  line: VersionLine;
  /** The main line's name when this line's work reached it as copies. */
  copiedInto: string | null;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const isCheckedOutElsewhere = line.worktreePath !== null;
  const { canRename, canDelete } = versionLineActions(line);
  const deleteLabel = deleteActionLabel(line, t, copiedInto);

  return (
    <div className="version-lines-detail__actions">
      {/* Switch keeps its word — it is what the reader came to this screen to
          do, and "Switch" says it better than any glyph — in the quiet
          outlined capsule; Rename and Delete are its icon-only satellites, the
          circles History's version strip carries, named on their tooltips.
          A labelled capsule beside circles reads as the primary one without
          spending the accent on it (DESIGN.md, Shape). */}
      {!line.isActive && (
        <button
          className="version-lines-detail__switch"
          type="button"
          onClick={onSwitch}
          disabled={isCheckedOutElsewhere}
          aria-label={t.versionLinesSwitchToLineLabel(line.name)}
        >
          <ArrowLeftRight aria-hidden="true" />
          {t.versionLinesSwitchShort}
        </button>
      )}
      {canRename && (
        <button
          className="version-lines-detail__icon-action"
          type="button"
          onClick={onRename}
          aria-label={t.versionLinesRenameLineLabel(line.name)}
          data-tooltip={`${t.versionLinesRenameShort} (F2)`}
        >
          <PenLine aria-hidden="true" />
        </button>
      )}
      {/* The active line has no Delete at all: it is refused for a reason the
          reader can see for themselves, and a permanently disabled destructive
          button is chrome that never does anything. A line another workspace
          holds keeps a disabled one, because that is a passing condition and
          the tooltip says so. */}
      {!line.isActive && deletabilityOf(line) !== "protected" && (
        <button
          className="version-lines-detail__icon-action version-lines-detail__delete"
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          data-tooltip={deleteLabel}
          aria-label={deleteLabel}
        >
          <Trash2 aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

type RelationTone = "positive" | "neutral" | "warning" | "protected";

function RelationIcon({ tone }: { tone: RelationTone }): React.JSX.Element {
  if (tone === "positive") return <CircleCheck aria-hidden="true" />;
  if (tone === "warning") return <TriangleAlert aria-hidden="true" />;
  if (tone === "protected") return <ShieldCheck aria-hidden="true" />;
  return <Info aria-hidden="true" />;
}

/** What this line's state means, in the app's own words. Every entry is read
 * off the snapshot the list already holds — no new Git question, and no
 * concept the rest of the screen does not already name. */
function relationEntries(
  line: VersionLine,
  mainName: string | null,
  routeShown: boolean,
  t: Translations,
): { key: string; tone: RelationTone; title: string; detail: string }[] {
  const entries: { key: string; tone: RelationTone; title: string; detail: string }[] = [];
  const sync = syncStatusOf(line);
  const upstream = line.upstream ?? "";

  if (sync.kind === "none") {
    entries.push({
      key: "remote",
      tone: "neutral",
      title: t.versionLinesNoUpstreamLabel,
      detail: t.versionLinesRelationshipLocalOnlyDetail,
    });
  } else if (sync.kind === "synced") {
    entries.push({
      key: "remote",
      tone: "positive",
      title: t.versionLinesSyncUpToDate,
      detail: t.versionLinesRelationshipSyncedDetail(upstream),
    });
  } else if (sync.kind === "gone") {
    entries.push({
      key: "remote",
      tone: "warning",
      title: t.versionLinesSyncGone,
      detail: t.versionLinesRelationshipGoneDetail(upstream),
    });
  } else {
    entries.push({
      key: "remote",
      tone: "neutral",
      title: syncText(sync, t),
      detail:
        sync.kind === "ahead"
          ? t.versionLinesRelationshipAheadDetail(upstream)
          : sync.kind === "behind"
            ? t.versionLinesRelationshipBehindDetail(upstream)
            : t.versionLinesRelationshipDivergedDetail(upstream),
    });
  }

  if (line.isActive) {
    entries.push({
      key: "active",
      tone: "positive",
      title: t.versionLinesRelationshipActiveTitle,
      detail: t.versionLinesRelationshipActiveDetail,
    });
  }
  // Counted against the main line, for the active line too — the line the
  // route under this section is drawn against, so the number here and the
  // dots there are one answer. No main line, no count.
  // Not while the route is drawn under this section: its sentence says the
  // same count against the same line, and a fact is said once on a panel.
  if (routeShown) {
    // The route answers where this line stands against the main line.
  } else if (mainName !== null && line.uniqueCommitCount !== null && line.uniqueCommitCount > 0) {
    entries.push({
      key: "unique",
      tone: "neutral",
      title: t.versionLinesUniqueCommits(line.uniqueCommitCount, mainName),
      detail: t.versionLinesRelationshipUniqueDetail(mainName),
    });
  } else if (mainName !== null && line.uniqueCommitCount === 0) {
    entries.push({
      key: "merged",
      tone: "positive",
      title: t.versionLinesRelationshipMergedTitle(mainName),
      detail: t.versionLinesRelationshipMergedDetail(mainName),
    });
  }

  if (line.worktreePath !== null) {
    entries.push({
      key: "elsewhere",
      tone: "warning",
      title: t.versionLinesRelationshipElsewhereTitle,
      detail: t.versionLinesCheckedOutElsewhere(line.worktreePath),
    });
  }

  // Why Rename and Delete are not on the row above. A control that silently
  // is not there is a control the reader assumes they have missed.
  if (line.isDefault) {
    entries.push({
      key: "default",
      tone: "protected",
      title: t.versionLinesDefaultLineChip,
      detail: t.versionLinesDefaultLineNote,
    });
  }

  return entries;
}

/** The detail column: the selected line named once at the top with whatever
 * can be done to it, then where it stands and the versions on it. One surface
 * divided by rules — the sibling of the History saved-version card, and it
 * takes the same one. */
function VersionLineDetail({
  line,
  mainName,
  history,
  historyLoading,
  previousRoute,
  formats,
  onSwitch,
  onRename,
  onDelete,
  onOpenHistory,
  onBack,
  renameEditor,
}: {
  line: VersionLine;
  /** The project's main line, by name — what this line's own versions are
   * counted against. `null` when the project has none. */
  mainName: string | null;
  /** This line's recent saved versions, once the on-demand read has answered.
   * `null` while it is in flight, when it failed, or when the host does not
   * offer the read at all — every section below degrades to what the
   * inventory already knows rather than showing a placeholder. */
  history: VersionLineHistory | null;
  /** The history read is still out. The route keeps its place meanwhile. */
  historyLoading: boolean;
  /** The route drawn for the line selected before this one, if any. */
  previousRoute: DrawnRoute | null;
  formats: LocaleFormats;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** Open History reading this line, and — when a version is named — with that
   * version selected. Lines' own list of saved versions is a preview of the
   * one History draws in full. */
  onOpenHistory?: (name: string, commit?: string) => void;
  onBack: () => void;
  /** The strip in its editing state while this line is being renamed —
   * `VersionLineRenameStrip`, owned by the panel — drawn in place of the
   * strip at rest. */
  renameEditor?: React.ReactNode;
}): React.JSX.Element {
  const { t } = useLanguage();
  const published = isTipPublished(line);
  /* The route section is drawn for a line that has one, and — while the read
     is out — for any line that will: any but the main line, in a project that
     has one. */
  const routeShown =
    history?.route != null || (historyLoading && mainName !== null && line.name !== mainName);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  /* What the line changes against the main line comes with its route, and
     takes the height the panel has left — the saved versions, the least of
     the three, step down to a short preview under it. Kept in place while
     the read is out, like the route, so the versions do not jump when it
     lands. */
  const changesShown = routeShown && (history?.route ? history.route.changes !== null : true);
  const date = tipDate(line);
  /* The tip's own record in the read, matched by commit rather than taken as
   * the first one. The two answers come from two Git calls: the inventory
   * knows the tip, the history read lists the versions, and a save that lands
   * between them leaves the read one version ahead. Positionally, that read
   * puts a version the panel has never seen where the tip should be — and the
   * name beside `Latest saved` would then be whoever saved *that* one. */
  const tipRecord = history?.versions.find((version) => version.commit === line.tip.commit) ?? null;
  const author = tipRecord?.authorName ?? "";
  /* The tip first, then the versions behind it. The tip comes from the
   * inventory rather than from the history read, so the list stands at one row
   * on a host that does not offer the read at all — and the rest is the read
   * minus that same commit, which is what keeps a version out of the list when
   * the two calls disagree about which one is newest. */
  const versions = [
    { ...line.tip, authorName: author },
    ...(history?.versions ?? []).filter((version) => version.commit !== line.tip.commit),
  ];
  const shownVersions = changesShown ? versions.slice(0, VERSIONS_BESIDE_CHANGES) : versions;
  const moreVersions = (history?.totalCount ?? versions.length) - shownVersions.length;

  return (
    <section className="version-lines-detail" aria-label={t.versionLinesDetailAriaLabel(line.name)}>
      <button className="version-lines-detail__back secondary-button" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        {t.versionLinesBackToList}
      </button>
      <div className="version-lines-detail__card">
        {/* The line's strip: its name on the first line, who last saved to it
            and when on the second, its actions at the trailing
            end. A fixed `--strip-height`, the height the list panel's header
            beside it wears, so the two panels start their content on the same
            pixel row — the shape History's version strip has. It used to be a
            block of its own, a 34px branch glyph beside a 22px title over a
            meta line: taller than the header next to it, and the glyph was the
            rail's own icon a second time. */}
        {renameEditor ?? (
        <header className="version-lines-detail__strip">
          <div className="version-lines-detail__identity">
            <h2>
              <span className="version-lines-detail__name" title={line.name}>
                {line.name}
              </span>
              {line.isActive && (
                <span className="version-line-chip version-line-chip--active">{t.versionLinesActiveLabel}</span>
              )}
            </h2>
            {/* Not where the line lives: the first state under the strip
                already names the upstream, or says there is none, in a
                sentence about it. Stated here as well it was the panel saying
                one thing twice with a rule between them. */}
            {(author || date) && (
              <p className="version-lines-detail__meta">
                <span className="version-lines-detail__byline-label">{t.versionLinesLatestSavedLabel}</span>
                {author && <strong>{author}</strong>}
                {date && <span>{formatDate(date, formats)}</span>}
              </p>
            )}
          </div>
          <VersionLineActions
            line={line}
            copiedInto={
              history?.route?.merge && history.route.merge.kind !== "merge" ? history.route.base : null
            }
            onSwitch={onSwitch}
            onRename={onRename}
            onDelete={onDelete}
          />
        </header>
        )}

        {/* The panel does not scroll; the list inside it does. Where this line
            stands is three lines that never grow, and scrolling them out of
            reach to read the versions below was the panel moving the answer
            rather than the question. */}
        <div className="version-lines-detail__body">
          <div className="version-lines-detail__grid">
            {/* No heading: two or three states that each say what they are
                need no label over them, and the rule under the strip already
                says a new part of the panel has started. The name stays for a
                screen reader, on the list itself. */}
            <section className="version-lines-card">
              <ul className="version-lines-relations" aria-label={t.versionLinesRelationshipTitle}>
                {relationEntries(line, mainName, routeShown, t).map((entry) => (
                  <li key={entry.key} className={`version-lines-relations__item--${entry.tone}`}>
                    <RelationIcon tone={entry.tone} />
                    {/* One line each: the state and the sentence that explains
                        it, side by side. Stacked, three states filled half the
                        panel to say what fits across a third of it. */}
                    <span>
                      <strong>{entry.title}</strong>
                      {entry.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Where this line left the main line, drawn — between where it
                stands and the versions on it, the two things the drawing
                connects. Only for a line that has a route: the main line
                itself, a project with none, and a shallow clone draw nothing
                rather than a guess. While the read is out, a line that will
                have one — any but the main line, in a project that has one —
                keeps the section's place with the main lane already drawn, so
                the answer grows into a space that was waiting for it instead
                of pushing the versions down when it lands. */}
            {routeShown && (
              <section className="version-lines-card" aria-label={t.versionLinesRouteTitle}>
                <h3>{t.versionLinesRouteTitle}</h3>
                <VersionLineRoute
                  line={line}
                  route={history?.route ?? null}
                  base={history?.route?.base ?? mainName ?? ""}
                  previous={previousRoute}
                  highlightedCommit={highlighted}
                  onOpenVersion={onOpenHistory}
                />
              </section>
            )}

            {changesShown && (
              <VersionLineChanges
                changes={history?.route?.changes ?? null}
                base={history?.route?.base ?? mainName ?? ""}
                brought={Boolean(history?.route?.merge)}
              />
            )}

            {/* One list, not a card for the latest version and a list of the
                rest under it. They are the same sequence, and the split cost a
                heading and a rule to separate a row from the row below it. The
                newest carries what only it can say — whether it is published,
                and its hash — and the others carry when they landed. */}
            <section className={`version-lines-card${changesShown ? "" : " version-lines-card--fill"}`}>
              {/* The way on to History heads the list it continues rather than
                  closing the card as a band of its own: the versions here are
                  a preview of the sequence History draws in full, so "all of
                  them" belongs next to their name. The band spent a rule, a
                  glyph, a title and a sentence on one button, under the rows
                  it took the height from. */}
              <div className="version-lines-card__head">
                <h3>{t.versionLinesVersionsTitle}</h3>
                {onOpenHistory && (
                  <button
                    className="ghost-button version-lines-card__link"
                    type="button"
                    // The line being looked at, opened as the line being looked
                    // at — no checkout, and no landing on whichever line happens
                    // to be active. The tooltip says so for a line that is not.
                    title={
                      line.isActive
                        ? t.versionLinesHistoryDescription
                        : t.versionLinesHistoryScopedDescription(line.name)
                    }
                    onClick={() => onOpenHistory(line.name)}
                  >
                    {t.versionLinesHistoryAction}
                    <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </div>
              <ol
                {...autoHideScrollbarProps<HTMLOListElement>()}
                className="version-lines-recent auto-hide-scrollbar"
              >
                {shownVersions.map((version, index) => {
                  const savedAt = version.committedAt ? new Date(version.committedAt) : null;
                  const valid = savedAt !== null && !Number.isNaN(savedAt.getTime());
                  const body = (
                    <>
                      <span className="version-lines-recent__subject" title={version.subject}>
                        {version.subject}
                      </span>
                      {index === 0 && (
                        <span
                          className={`version-line-chip${published ? " version-line-chip--positive" : ""}`}
                        >
                          {published ? t.versionLinesPublishedPill : t.versionLinesUnpublishedPill}
                        </span>
                      )}
                      {index === 0 && <code>{version.shortCommit}</code>}
                      {valid && (
                        <span
                          className="version-lines-recent__date"
                          title={t.versionLinesSavedLabel(formatDate(savedAt, formats))}
                        >
                          {formatDate(savedAt, formats)}
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li
                      key={version.commit}
                      // The row the reader is on lights the same version's dot
                      // in the route above — by keyboard as well as pointer, so
                      // the drawing answers the list for someone who cannot
                      // reach its dots.
                      onFocus={() => setHighlighted(version.commit)}
                      onBlur={() => setHighlighted(null)}
                      onMouseEnter={() => setHighlighted(version.commit)}
                      onMouseLeave={() => setHighlighted(null)}
                    >
                      {/* A row opens this version in History, the way a row in
                          any of the three lists opens what it names. Without a
                          host to open it the row states the version and stays
                          a row rather than pretending to be a control. */}
                      {onOpenHistory ? (
                        <button
                          className="version-lines-recent__open"
                          type="button"
                          aria-label={t.versionLinesOpenVersionLabel(version.subject)}
                          onClick={() => onOpenHistory(line.name, version.commit)}
                        >
                          {body}
                        </button>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ol>
              {/* Cut short beside the comparison: how many more there are, and
                  the way to them — the same way the header offers. */}
              {changesShown && moreVersions > 0 && onOpenHistory && (
                <button
                  className="version-lines-recent__more"
                  type="button"
                  onClick={() => onOpenHistory(line.name)}
                >
                  {t.versionLinesVersionsMore(moreVersions, formatNumber(moreVersions, formats))}
                </button>
              )}
            </section>
          </div>
        </div>

      </div>
    </section>
  );
}

/* --------------------------------------------------------------- panel ---- */

export function VersionLinesPanel({
  projectPath,
  sessionEpoch,
  snapshot,
  error,
  isLoading,
  watcherState,
  onOpenSettings,
  onRefresh,
  onSnapshot,
  readHistory,
  peekHistory,
  onChanged,
  onSaveVersion,
  onOpenChanges,
  onOpenHistory,
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  autoOpenCreate,
  onAutoOpenCreateHandled,
  selectLineIntent,
  onSelectLineIntentHandled,
}: {
  projectPath: string;
  sessionEpoch: string;
  /** The project session's cached branch inventory, or `null` if this project
   * has never loaded one. Reading it (and the refresh that keeps it current)
   * belongs to `app/App.tsx`, so navigating away from this screen and back
   * re-renders the known answer instead of restarting from a spinner — see
   * task 019. */
  snapshot: VersionLinesSnapshot | null;
  /** A failed read, already localized. Shown as a full error screen only when
   * there is no `snapshot` to fall back on; alongside one it degrades to a
   * "this may be stale" note. */
  error: string | null;
  isLoading: boolean;
  watcherState: "starting" | "watching" | "off" | "unavailable";
  onOpenSettings: () => void;
  onRefresh: () => void;
  /** A fresh snapshot returned by a create/switch/delete, handed back so the
   * session cache reflects the mutation without waiting for a re-read. */
  onSnapshot: (snapshot: VersionLinesSnapshot) => void;
  /** Reads the selected line's recent saved versions. Optional because it is
   * the one thing on this screen that costs Git work beyond the inventory:
   * without it every section still renders what the inventory knows. */
  readHistory?: (name: string, tipCommit: string) => Promise<VersionLineHistory>;
  /** The same answer if the session already holds it, so returning to this
   * screen renders the detail whole instead of asking Git again merely
   * because it became visible. Never starts a read. */
  peekHistory?: (name: string, tipCommit: string) => VersionLineHistory | null;
  /** Called after any successful create/switch/delete so the rest of the
   * app (repository facts, working-tree status, selection) can invalidate
   * itself — see `app/App.tsx`'s `handleVersionLineChanged`. */
  onChanged: () => void;
  onSaveVersion: () => void;
  /** Navigates to the Changes screen — the only place conflicted files are
   * listed, which is where a blocked "unfinished Git operation" points. */
  onOpenChanges?: () => void;
  /** Opens the History screen reading the named line, whether or not it is the
   * active one. Nothing is checked out to get there. */
  /** Open History reading this line, and — when a version is named — with that
   * version selected. Lines' own list of saved versions is a preview of the
   * one History draws in full. */
  onOpenHistory?: (name: string, commit?: string) => void;
  /** Registers the dialog as a path-scoped mutation before it opens. Returns
   * false when another session sharing this Git directory owns a mutation. */
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  /** Set by the command palette's "New version line" action, which can fire
   * from any screen — this opens the create dialog as soon as the panel
   * mounts. The screen itself has no button into the dialog: its composer
   * starts a line. */
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
  /** A line another screen asked this one to select — History's "View line".
   *
   * One-shot, like `autoOpenCreate` and for the same reason: this screen stays
   * mounted for the session, so a standing prop would re-select on every render
   * of the composition root and undo a selection the reader has since made. */
  selectLineIntent?: string | null;
  onSelectLineIntentHandled?: () => void;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [search, setSearch] = useState("");
  const [prefixFilters, setPrefixFilters] = useState<string[]>([]);
  const [stateFilters, setStateFilters] = useState<StateFilter[]>([]);
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  /* The line whose name is being edited in the detail strip, if any. Tied to
     a name rather than to "the selection" so choosing another line drops it
     instead of carrying a half-typed name over to a line it was not for. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const selectLine = useCallback((name: string) => {
    setSelectedName(name);
    setRenaming((current) => (current === name ? current : null));
  }, []);
  /* One column at a time below 1024px, the way Changes and History narrow.
     Which of the two is showing is this screen's own state, not a filter on
     the data, so it survives every refresh underneath it. */
  const [showNarrowDetail, setShowNarrowDetail] = useState(false);
  const [contextMenu, setContextMenu] = useState<VersionLineContextMenuState | null>(null);
  /* The list's own scroll container, shared with `VersionLineQuickCreateBox`
   * so opening or closing it can keep the list's scroll position anchored to
   * its own foot — see `useScrollAnchoredResize`. */
  const listScrollRef = useRef<HTMLDivElement>(null);
  /* Announced rather than shown: a copy leaves no mark on screen, so the one
     confirmation a screen reader gets is this. Cleared on the next open so the
     same word is announced again the second time. */
  const [announcement, setAnnouncement] = useState("");
  const [dialog, setDialog] = useState<DialogRequest>(null);

  function openDialog(request: Exclude<DialogRequest, null>): void {
    if (onOperationStart()) {
      setDialog(request);
    }
  }

  function closeDialog(): void {
    setDialog(null);
    onOperationFinish();
  }

  /* Stable, and with the focus move outside the updater: an updater React may
     call twice is no place for a side effect, and an `onClose` with a new
     identity every render makes the menu re-subscribe its dismissal listeners
     on every keystroke in the search box. */
  const contextMenuRef = useRef<VersionLineContextMenuState | null>(null);
  contextMenuRef.current = contextMenu;
  const closeContextMenu = useCallback((restoreFocus: boolean): void => {
    if (restoreFocus) contextMenuRef.current?.focusTarget?.focus();
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (autoOpenCreate) {
      openDialog({ kind: "create", forceSwitch: false });
      onAutoOpenCreateHandled?.();
    }
    // Deliberately fires once per truthy transition of `autoOpenCreate`
    // (the parent flips it back to false right after), not on every render.
  }, [autoOpenCreate]);

  useEffect(() => {
    if (!selectLineIntent) return;
    setSelectedName(selectLineIntent);
    setShowNarrowDetail(true);
    onSelectLineIntentHandled?.();
    // Same one-shot shape as `autoOpenCreate`: applied once per truthy
    // transition, then handed back. Anything else would re-select on every
    // render of the composition root.
  }, [selectLineIntent]);

  // Derived from whatever names this project actually uses (`feature/`,
  // `bugfix/`, `claude/`, a team's own convention…) rather than a hardcoded
  // git-flow list, so the filter stays useful regardless of naming style.
  // Sorted by how common each prefix is, most common first.
  const prefixCounts = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const line of snapshot.lines) {
      if (line.isActive) {
        continue;
      }
      const slashIndex = line.name.indexOf("/");
      if (slashIndex <= 0) {
        continue;
      }
      const prefix = line.name.slice(0, slashIndex);
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [snapshot]);

  const stateCounts = useMemo(() => {
    const counts: Record<StateFilter, number> = {
      tracking: 0,
      "local-only": 0,
      deletable: 0,
      blocked: 0,
    };
    for (const line of snapshot?.lines ?? []) {
      if (line.isActive) {
        continue;
      }
      if (line.upstream === null) {
        counts["local-only"] += 1;
      } else {
        counts.tracking += 1;
      }
      const deletability = deletabilityOf(line);
      if (deletability === "ready") {
        counts.deletable += 1;
      } else if (deletability === "unique-work") {
        counts.blocked += 1;
      }
    }
    return counts;
  }, [snapshot]);

  // Drops a prefix filter that no longer matches anything (e.g. the last
  // branch under it was just deleted) instead of silently showing an empty
  // list with no visible explanation.
  useEffect(() => {
    setPrefixFilters((current) => {
      const kept = current.filter((prefix) => prefixCounts.some(([known]) => known === prefix));
      return kept.length === current.length ? current : kept;
    });
  }, [prefixCounts]);

  const others = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = search.trim().toLowerCase();
    const matches = snapshot.lines
      .filter((line) => !line.isActive)
      .filter((line) => !query || line.name.toLowerCase().includes(query))
      .filter(
        (line) => prefixFilters.length === 0 || prefixFilters.some((prefix) => line.name.startsWith(`${prefix}/`)),
      )
      .filter((line) => {
        if (stateFilters.length === 0) {
          return true;
        }
        const deletability = deletabilityOf(line);
        return stateFilters.some((state) =>
          state === "local-only"
            ? line.upstream === null
            : state === "tracking"
              ? line.upstream !== null
              : state === "deletable"
                ? deletability === "ready"
                : deletability === "unique-work",
        );
      });

    return [...matches].sort((a, b) => {
      if (sort === "name") {
        return a.name.localeCompare(b.name);
      }
      const byRecency = b.tip.committedAt.localeCompare(a.tip.committedAt);
      if (sort === "unpublished") {
        const unpublishedFirst = Number(a.upstream !== null) - Number(b.upstream !== null);
        return unpublishedFirst || byRecency;
      }
      return byRecency;
    });
  }, [snapshot, search, prefixFilters, stateFilters, sort]);

  const active = snapshot?.lines.find((line) => line.isActive) ?? null;
  /* The repository's default line — what `VersionLineQuickCreateBox` offers
     as the alternative starting point to `active` when the two differ. */
  const defaultLine = snapshot?.lines.find((line) => line.isDefault) ?? null;
  /* Every loaded line's name, for the quick create box to warn about a clash
     and to take its example's prefix from. The whole snapshot, not the
     filtered list: a search must not hide the line a new name clashes with. */
  const lineNames = useMemo(() => snapshot?.lines.map((line) => line.name) ?? [], [snapshot]);
  /* The active line heads the list and is exempt from search and filters: it
     is where the project *is*, and a screen that can hide it leaves the reader
     without the one row that answers "where am I". */
  const listed = useMemo(() => (active ? [active, ...others] : others), [active, others]);
  const isFiltered = search.trim().length > 0 || prefixFilters.length > 0 || stateFilters.length > 0;

  // Derived rather than stored: a line that a filter hides, or that a delete
  // removed, falls back to the active one without an effect racing the render
  // that noticed.
  const selected = listed.find((line) => line.name === selectedName) ?? listed[0] ?? null;
  const selectedTip = selected?.tip.commit ?? null;

  /* The one read this screen starts on its own, and it is keyed by the tip
     rather than by the selection: a line whose tip has not moved is already
     answered, so returning to this screen renders from the session cache and
     asks Git nothing. A failure leaves `history` null — every section it feeds
     falls back to what the inventory knows rather than showing an error for
     what is, on this screen, extra detail. */
  const [history, setHistory] = useState<VersionLineHistory | null>(() =>
    selected && selectedTip ? peekHistory?.(selected.name, selectedTip) ?? null : null,
  );
  /* Whether that read is still out — the detail keeps the route's place while
     it is, rather than letting the section arrive and push the versions down. */
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    const name = selected?.name;
    if (!readHistory || !name || !selectedTip) {
      setHistory(null);
      setHistoryLoading(false);
      return undefined;
    }
    const cached = peekHistory?.(name, selectedTip) ?? null;
    setHistory(cached);
    setHistoryLoading(cached === null);
    if (cached) return undefined;
    let cancelled = false;
    void readHistory(name, selectedTip)
      .then((answer) => {
        if (!cancelled) setHistory(answer);
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [peekHistory, readHistory, selected?.name, selectedTip]);

  /* The route the detail last drew, and whose line it was. The detail mounts
     afresh for each line, so the next one's drawing is handed the last one's
     to hold while it is read and to cross-fade from — see `VersionLineRoute`. */
  const [lastRoute, setLastRoute] = useState<DrawnRoute | null>(null);
  useEffect(() => {
    if (selected && history?.name === selected.name && history.route) {
      setLastRoute({ line: selected, route: history.route });
    }
  }, [history, selected]);

  /* A row the pointer rests on starts its line's detail read, so a press a
     moment later finds it answered or already on its way — the controller
     shares one request between the two. Only after a pause, so sweeping the
     pointer down the list asks Git nothing, and never for a line whose answer
     is already held. */
  const hoverTimerRef = useRef<number | null>(null);
  const handleHoverIntent = useCallback(
    (line: VersionLine | null) => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (!line || !readHistory || peekHistory?.(line.name, line.tip.commit)) return;
      hoverTimerRef.current = window.setTimeout(() => {
        hoverTimerRef.current = null;
        void readHistory(line.name, line.tip.commit).catch(() => undefined);
      }, 120);
    },
    [peekHistory, readHistory],
  );
  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  function moveSelection(target: number): void {
    const index = Math.max(0, Math.min(target, listed.length - 1));
    const line = listed[index];
    if (!line) return;
    selectLine(line.name);
    requestAnimationFrame(() => document.getElementById(`version-line-${line.name}`)?.focus());
  }

  function handleMutated(next: VersionLinesSnapshot): void {
    onSnapshot(next);
    setDialog(null);
    onChanged();
    onOperationFinish();
  }

  /** Opens the rename in the detail strip — from its Rename button, the row's
   * menu, or F2 on the row. The line is selected first, so the strip being
   * edited is the one describing it; in a one-column window the detail is
   * brought forward, since that is where the field is. */
  function startRename(name: string): void {
    setSelectedName(name);
    setRenaming(name);
    setShowNarrowDetail(true);
  }

  /** The row keeps the keyboard's place once the strip closes, under whatever
   * name the line now has. */
  function endRename(name: string): void {
    setRenaming(null);
    requestAnimationFrame(() => document.getElementById(`version-line-${name}`)?.focus());
  }

  const dialogs = (
    <>
      <CreateVersionLineDialog
        isOpen={dialog?.kind === "create"}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        forceSwitch={dialog?.kind === "create" ? dialog.forceSwitch : undefined}
        onClose={closeDialog}
        onCreated={handleMutated}
        onPhaseChange={onOperationPhaseChange}
      />
      <SwitchVersionLineDialog
        isOpen={dialog?.kind === "switch"}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        target={dialog?.kind === "switch" ? dialog.target : ""}
        onClose={closeDialog}
        onSwitched={handleMutated}
        onSaveVersion={onSaveVersion}
        onCreateWithWork={() => openDialog({ kind: "create", forceSwitch: false })}
        onPhaseChange={onOperationPhaseChange}
      />
      <DeleteVersionLineDialog
        isOpen={dialog?.kind === "delete"}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        target={dialog?.kind === "delete" ? dialog.target : ""}
        onClose={closeDialog}
        // The list and the rest of the app catch up at once, but the dialog
        // stays on its result until "Done" — that is where it says what
        // happened on the remote, and that a recovery point was kept. Closing
        // it (`closeDialog`) gives the mutation slot back.
        onDeleted={(next) => {
          onSnapshot(next);
          onChanged();
        }}
        // The mutation slot is already held by the delete dialog, so this
        // hands it over to the switch dialog rather than registering again.
        onSwitchInstead={() =>
          setDialog(dialog?.kind === "delete" ? { kind: "switch", target: dialog.target } : null)
        }
        onOpenChanges={
          onOpenChanges &&
          (() => {
            // Leaving the screen means the mutation slot has to go back, same
            // as any other way of closing the dialog.
            closeDialog();
            onOpenChanges();
          })
        }
        onPhaseChange={onOperationPhaseChange}
      />
    </>
  );

  const notices = (
    <div className="version-lines-notices">
      {(watcherState === "off" || watcherState === "unavailable") && (
        <AutomaticUpdatesNotice
          title={watcherState === "off" ? t.automaticUpdatesOffTitle : t.automaticUpdatesUnavailableTitle}
          description={t.automaticUpdatesOutdatedDescription}
          updateLabel={t.automaticUpdatesUpdateNow}
          updateAriaLabel={t.commandRefreshVersionLines}
          updatingLabel={t.automaticUpdatesUpdating}
          updatingAriaLabel={t.versionLinesLoading}
          busy={isLoading}
          settingsLabel={t.automaticUpdatesOpenSettings}
          onUpdate={onRefresh}
          onOpenSettings={onOpenSettings}
        />
      )}
      {/* A refresh that fails after a successful one keeps the known list
          visible, but must still say it may be out of date. */}
      {snapshot && error && !isLoading && (
        <div className="version-lines-refresh-error" role="alert">
          <span>{t.statusRefreshFailedNote}</span>
          <button className="secondary-button secondary-button--sm" type="button" onClick={onRefresh}>
            {t.versionLinesRetry}
          </button>
        </div>
      )}
      {snapshot?.headState === "detached" && (
        <div className="version-lines-banner" role="status">
          <h2>{t.versionLinesDetachedTitle}</h2>
          <p>{t.versionLinesDetachedDescription}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => openDialog({ kind: "create", forceSwitch: true })}
          >
            <GitBranch aria-hidden="true" />
            {t.versionLinesDetachedRecoverButton}
          </button>
        </div>
      )}
      {snapshot?.headState === "unborn" && (
        <div className="version-lines-banner" role="status">
          <h2>{t.versionLinesUnbornTitle}</h2>
          <p>{t.versionLinesUnbornDescription}</p>
        </div>
      )}
    </div>
  );

  // Only when there is genuinely nothing to show: with a cached snapshot the
  // background refresh stays invisible, which is the whole point of keeping it
  // in the session.
  if (!snapshot && isLoading) {
    return (
      <div className="version-lines-screen">
        {notices}
        <div className="empty-state" aria-busy="true">
          <LoadingBar label={t.versionLinesLoading} />
          <h1>{t.versionLinesTitle}</h1>
          <p>{t.versionLinesLoading}</p>
        </div>
        {dialogs}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="version-lines-screen">
        {notices}
        <div className="empty-state empty-state--error" role="alert">
          <div className="empty-state__icon" aria-hidden="true">
            <CircleAlert />
          </div>
          <h1>{t.versionLinesTitle}</h1>
          <p>{error ?? t.versionLinesErrorLoading}</p>
          <div className="empty-state__actions">
            <button className="primary-button" type="button" onClick={onRefresh}>
              {t.versionLinesRetry}
            </button>
          </div>
        </div>
        {dialogs}
      </div>
    );
  }


  return (
    <div className={`version-lines-screen${showNarrowDetail ? " version-lines-screen--narrow-detail" : ""}`}>
      {notices}
      <div className="version-lines-layout">
        <section className="version-lines-list-panel" aria-label={t.versionLinesListAriaLabel}>
          {/* One strip, the way the Changes file list and the History timeline
              have one. Searching, filtering and sorting answer the same
              question — which lines this column shows — so they share a
              control instead of stacking rows of chrome above the panel. */}
          {/* The panel's own header is the screen's name, the way the Work
              screen's list panel is headed by its tab pair: at the height of
              a strip, the glyph the rail gives Lines in the accent and the
              word in the title's type. There used to be a page row above both
              panels — the name, a sentence about what a line is, and "New
              line" — and with the composer under this list doing that job, the
              row was a name the rail already states. */}
          <header className="version-lines-list-panel__header">
            <GitBranch aria-hidden="true" />
            <h1>{t.versionLinesTitle}</h1>
          </header>
          <div className="version-lines-list-panel__toolbar">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={t.versionLinesSearchPlaceholder}
              ariaLabel={t.versionLinesSearchAriaLabel}
              clearLabel={t.commonClearSearch}
              trailing={
                <VersionLinesFilterPanel
                  sort={sort}
                  prefixCounts={prefixCounts}
                  stateCounts={stateCounts}
                  selectedPrefixes={prefixFilters}
                  selectedStates={stateFilters}
                  onSort={setSort}
                  onTogglePrefix={(prefix) =>
                    setPrefixFilters((current) =>
                      current.includes(prefix)
                        ? current.filter((value) => value !== prefix)
                        : [...current, prefix],
                    )
                  }
                  onToggleState={(state) =>
                    setStateFilters((current) =>
                      current.includes(state)
                        ? current.filter((value) => value !== state)
                        : [...current, state],
                    )
                  }
                  onClear={() => {
                    setPrefixFilters([]);
                    setStateFilters([]);
                  }}
                />
              }
            />
          </div>

          {isLoading && (
            <div className="version-lines-list-panel__progress">
              <LoadingBar label={t.versionLinesLoading} />
            </div>
          )}

          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            ref={listScrollRef}
            className="version-lines-list auto-hide-scrollbar"
            role="listbox"
            aria-label={t.versionLinesListAriaLabel}
          >
            {listed.map((line, index) => (
              <VersionLineRow
                key={line.name}
                line={line}
                index={index}
                selected={selected?.name === line.name}
                focusable={selected?.name === line.name}
                formats={formats}
                onSelect={selectLine}
                onMove={moveSelection}
                onRename={startRename}
                onHoverIntent={handleHoverIntent}
                onOpenDetail={() => setShowNarrowDetail(true)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setAnnouncement("");
                  setContextMenu({ ...contextMenuAnchorFrom(event), line });
                }}
              />
            ))}
            {others.length === 0 && (
              <p className="version-lines-list__empty">
                {isFiltered ? t.versionLinesNoSearchMatches : t.versionLinesEmptyOthers}
              </p>
            )}
          </div>

          {(snapshot.isTruncated || snapshot.unreadableCount > 0) && (
            <footer className="version-lines-list-panel__footer">
              {snapshot.isTruncated && (
                <p>{t.versionLinesTruncatedNote(snapshot.lines.length, snapshot.totalCount)}</p>
              )}
              {snapshot.unreadableCount > 0 && (
                <p role="status">{t.versionLinesUnreadableNote(snapshot.unreadableCount)}</p>
              )}
            </footer>
          )}

          {/* The one way to start a line on this screen — see
              `VersionLineQuickCreateBox`'s own doc. The dialog stays for the
              palette and the detached-`HEAD` banner. Absent on an unborn
              `HEAD`: there is no commit yet for a line to point at. */}
          {snapshot.headState !== "unborn" && (
            <VersionLineQuickCreateBox
              projectPath={projectPath}
              sessionEpoch={sessionEpoch}
              forceSwitch={snapshot.headState === "detached"}
              mainLine={defaultLine}
              activeLine={active}
              existingNames={lineNames}
              listRef={listScrollRef}
              onOperationStart={onOperationStart}
              onOperationFinish={onOperationFinish}
              onOperationPhaseChange={onOperationPhaseChange}
              onCreated={handleMutated}
            />
          )}
        </section>

        {selected ? (
          <VersionLineDetail
            key={selected.name}
            line={selected}
            mainName={defaultLine?.name ?? null}
            history={history?.name === selected.name ? history : null}
            historyLoading={historyLoading}
            previousRoute={lastRoute}
            formats={formats}
            onSwitch={() => openDialog({ kind: "switch", target: selected.name })}
            onRename={() => startRename(selected.name)}
            onDelete={() => openDialog({ kind: "delete", target: selected.name })}
            onOpenHistory={onOpenHistory}
            onBack={() => setShowNarrowDetail(false)}
            renameEditor={
              renaming === selected.name ? (
                <VersionLineRenameStrip
                  projectPath={projectPath}
                  sessionEpoch={sessionEpoch}
                  target={selected.name}
                  upstream={selected.upstream}
                  existingNames={lineNames}
                  onCancel={() => endRename(selected.name)}
                  onRenamed={(next, newName) => {
                    // The selection follows the rename — by the name it was
                    // given, not by looking for the tip commit again: a line
                    // branched from another and not yet advanced shares its
                    // tip, and the search would find whichever came first.
                    setSelectedName(newName);
                    handleMutated(next);
                    endRename(newName);
                  }}
                  onOperationStart={onOperationStart}
                  onOperationFinish={onOperationFinish}
                  onOperationPhaseChange={onOperationPhaseChange}
                />
              ) : undefined
            }
          />
        ) : (
          <section className="version-lines-detail version-lines-detail--empty">
            <p>{t.versionLinesEmptyOthers}</p>
          </section>
        )}
      </div>

      {/* Which items it shows is `lineActions`, the same functions the detail
          header's buttons read, so a right-click can never offer what the
          panel behind it refuses. */}
      <VersionLineContextMenu
        context={contextMenu}
        activeName={active?.name ?? null}
        copiedIntoOf={(line) => {
          const route = peekHistory?.(line.name, line.tip.commit)?.route;
          return route?.merge && route.merge.kind !== "merge" ? route.base : null;
        }}
        onClose={closeContextMenu}
        onCopied={() => setAnnouncement(t.versionLinesNameCopied)}
        onSwitch={(target) => openDialog({ kind: "switch", target })}
        onRename={startRename}
        onDelete={(target) => openDialog({ kind: "delete", target })}
      />
      <p className="visually-hidden" role="status">
        {announcement}
      </p>

      {dialogs}
    </div>
  );
}

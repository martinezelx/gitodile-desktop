import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleAlert,
  CircleCheck,
  GitBranch,
  Info,
  PenLine,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { formatDate, formatNumber, formatRelativeTime, type LocaleFormats } from "../../shared/i18n";
import {
  AutomaticUpdatesNotice,
  avatarInitials,
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
import {
  CreateVersionLineDialog,
  DeleteVersionLineDialog,
  RenameVersionLineDialog,
  SwitchVersionLineDialog,
} from "./VersionLinesDialog";

type DialogRequest =
  | { kind: "create"; forceSwitch: boolean }
  | { kind: "switch"; target: string }
  | { kind: "rename"; target: string; upstream: string | null }
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

/* ---------------------------------------------------------------- list ---- */

/** One line in the list column: the sibling of a History timeline row and of a
 * Changes file row, at the same tier — a name, the one fact under it that
 * names where the line lives, and only the states worth flagging. Its actions
 * are not here: a row that carries three buttons per line spends the column's
 * width on controls for lines nobody has selected. */
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
}): React.JSX.Element {
  const { t } = useLanguage();
  const sync = syncStatusOf(line);
  const deletability = deletabilityOf(line);
  const date = tipDate(line);
  const relative = date ? formatRelativeTime(date, formats) : "";
  const label = line.isActive ? `${line.name} — ${t.versionLinesActiveLabel}` : line.name;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
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
      className={`version-line-row${selected ? " version-line-row--selected" : ""}`}
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={label}
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
    >
      <span className="version-line-row__name-row">
        <span className="version-line-row__name" title={line.name}>
          {line.name}
        </span>
        {line.isActive && (
          <span className="version-line-chip version-line-chip--active">{t.versionLinesActiveLabel}</span>
        )}
        {relative && <span className="version-line-row__date">{relative}</span>}
      </span>
      {/* At most two chips, and always the same two questions: where this line
          stands against its remote, and whether it can be cleared away. A row
          that answers more than that stops being a list of names — the rest is
          one click away in the detail, which has room for a sentence about it.
          The upstream is one of the answers that moved there: spelled out here
          it was the row's own name truncated. */}
      <span className="version-line-row__states">
        {sync.kind === "gone" ? (
          <span className="version-line-chip version-line-chip--warning">{syncText(sync, t)}</span>
        ) : sync.kind === "ahead" || sync.kind === "behind" || sync.kind === "diverged" ? (
          <span className="version-line-chip">{syncText(sync, t)}</span>
        ) : sync.kind === "none" ? (
          <span className="version-line-chip">{t.versionLinesNoUpstreamLabel}</span>
        ) : null}
        {/* The active line is never a deletion candidate, and a line checked
            out elsewhere is refused for a reason the detail states in full. */}
        {deletability === "protected" ? (
          <span className="version-line-chip">{t.versionLinesDefaultLineChip}</span>
        ) : line.isActive ? null : deletability === "ready" ? (
          <span className="version-line-chip version-line-chip--positive">
            {t.versionLinesDeletablePill}
          </span>
        ) : deletability === "unique-work" ? (
          <span className="version-line-chip version-line-chip--warning">
            {t.versionLinesNotDeletablePill}
          </span>
        ) : null}
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

/** What can be done to the line the reader has chosen. All three sit together
 * on one row: Switch, Rename, Delete.
 *
 * Delete used to hide behind a `⋯` — which reads as "advanced", when it is one
 * of the three ordinary things you do to a version line, and it also put the
 * only destructive action one step further from the explanation of whether it
 * is safe. It is out in the open now and quiet instead: a bordered button that
 * takes the danger colour on hover, next to two that do not.
 *
 * Every one of them is absent rather than disabled where it cannot apply, with
 * one exception — a line open in another workspace keeps a disabled Switch,
 * because that is a temporary condition the tooltip explains. */
function VersionLineActions({
  line,
  onSwitch,
  onRename,
  onDelete,
  onNewFromLine,
}: {
  line: VersionLine;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
  onNewFromLine: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const isCheckedOutElsewhere = line.worktreePath !== null;
  const { canRename, canDelete } = versionLineActions(line);
  const deleteLabel = deleteActionLabel(line, t);

  return (
    <div className="version-lines-detail__actions">
      {line.isActive ? (
        // Branching starts from where the project is, so this is only ever the
        // active line's action — the create plan has no other starting point.
        <button className="secondary-button secondary-button--sm" type="button" onClick={onNewFromLine}>
          <Plus aria-hidden="true" />
          {t.versionLinesNewFromLine}
        </button>
      ) : (
        <button
          className="secondary-button secondary-button--sm"
          type="button"
          onClick={onSwitch}
          disabled={isCheckedOutElsewhere}
          aria-label={t.versionLinesSwitchToLineLabel(line.name)}
        >
          {t.versionLinesSwitchShort}
        </button>
      )}
      {canRename && (
        <button
          className="secondary-button secondary-button--sm"
          type="button"
          onClick={onRename}
          aria-label={t.versionLinesRenameLineLabel(line.name)}
        >
          <PenLine aria-hidden="true" />
          {t.versionLinesRenameShort}
        </button>
      )}
      {/* The active line has no Delete at all: it is refused for a reason the
          reader can see for themselves, and a permanently disabled destructive
          button is chrome that never does anything. A line another workspace
          holds keeps a disabled one, because that is a passing condition and
          the tooltip says so. */}
      {!line.isActive && deletabilityOf(line) !== "protected" && (
        <button
          className="secondary-button secondary-button--sm version-lines-detail__delete"
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={deleteLabel}
          aria-label={deleteLabel}
        >
          <Trash2 aria-hidden="true" />
          {t.versionLinesDeleteShort}
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
  } else if (line.uniqueCommitCount !== null && line.uniqueCommitCount > 0) {
    entries.push({
      key: "unique",
      tone: "neutral",
      title: t.versionLinesUniqueCommits(line.uniqueCommitCount),
      detail: t.versionLinesRelationshipUniqueDetail,
    });
  } else if (line.uniqueCommitCount === 0) {
    entries.push({
      key: "merged",
      tone: "positive",
      title: t.versionLinesRelationshipMergedTitle,
      detail: t.versionLinesRelationshipMergedDetail,
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
  history,
  formats,
  onSwitch,
  onRename,
  onDelete,
  onNewFromLine,
  onOpenHistory,
  onBack,
}: {
  line: VersionLine;
  /** This line's recent saved versions, once the on-demand read has answered.
   * `null` while it is in flight, when it failed, or when the host does not
   * offer the read at all — every section below degrades to what the
   * inventory already knows rather than showing a placeholder. */
  history: VersionLineHistory | null;
  formats: LocaleFormats;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
  onNewFromLine: () => void;
  /** Open History reading this line, and — when a version is named — with that
   * version selected. Lines' own list of saved versions is a preview of the
   * one History draws in full. */
  onOpenHistory?: (name: string, commit?: string) => void;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const published = isTipPublished(line);
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

  return (
    <section className="version-lines-detail" aria-label={t.versionLinesDetailAriaLabel(line.name)}>
      <button className="version-lines-detail__back secondary-button" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        {t.versionLinesBackToList}
      </button>
      <div className="version-lines-detail__card">
        {/* The name and its actions on one row, then everything else known
            about the line on the row under them — where it lives, and who
            saved the last version to it, when.

            The byline used to be a band of its own below this header: a rule
            across the panel, 44px tall, holding one right-aligned line with
            the width of the panel empty beside it. Two blocks of chrome for
            the identity of one line. */}
        <header className="version-lines-detail__summary">
          <div className="version-lines-detail__summary-top">
            <span className="version-lines-detail__icon" aria-hidden="true">
              <GitBranch />
            </span>
            <div className="version-lines-detail__identity">
              <h2>
                <span className="version-lines-detail__name">{line.name}</span>
                {line.isActive && (
                  <span className="version-line-chip version-line-chip--active">{t.versionLinesActiveLabel}</span>
                )}
              </h2>
            </div>
            <VersionLineActions
              line={line}
              onSwitch={onSwitch}
              onRename={onRename}
              onDelete={onDelete}
              onNewFromLine={onNewFromLine}
            />
          </div>
          <p className="version-lines-detail__meta">
            <span className="version-lines-detail__upstream">
              {line.upstream
                ? t.versionLinesUpstreamLabel(line.upstream)
                : t.versionLinesRelationshipLocalOnlyDetail}
            </span>
            {(author || date) && (
              <span className="version-lines-detail__byline">
                <span className="version-lines-detail__byline-label">{t.versionLinesLatestSavedLabel}</span>
                {author && (
                  <span className="version-lines-avatar" aria-hidden="true">
                    {avatarInitials(author)}
                  </span>
                )}
                {author && <strong>{author}</strong>}
                {date && <span>{formatDate(date, formats)}</span>}
              </span>
            )}
          </p>
        </header>

        {/* The panel does not scroll; the list inside it does. Where this line
            stands is three lines that never grow, and scrolling them out of
            reach to read the versions below was the panel moving the answer
            rather than the question. */}
        <div className="version-lines-detail__body">
          <div className="version-lines-detail__grid">
            <section className="version-lines-card">
              <h3>{t.versionLinesRelationshipTitle}</h3>
              <ul className="version-lines-relations">
                {relationEntries(line, t).map((entry) => (
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

            {/* One list, not a card for the latest version and a list of the
                rest under it. They are the same sequence, and the split cost a
                heading and a rule to separate a row from the row below it. The
                newest carries what only it can say — whether it is published,
                and its hash — and the others carry when they landed. */}
            <section className="version-lines-card version-lines-card--fill">
              <h3>{t.versionLinesVersionsTitle}</h3>
              <ol
                {...autoHideScrollbarProps<HTMLOListElement>()}
                className="version-lines-recent auto-hide-scrollbar"
              >
                {versions.map((version, index) => {
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
                    <li key={version.commit}>
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
            </section>
          </div>
        </div>

        {onOpenHistory && (
          <footer className="version-lines-detail__history">
            <BookOpen aria-hidden="true" />
            <div>
              <strong>{t.versionLinesHistoryTitle}</strong>
              {/* The line the reader is looking at, opened as the line the
                  reader is looking at — no checkout, and no landing on
                  whichever line happens to be active. */}
              <p>
                {line.isActive ? t.versionLinesHistoryDescription : t.versionLinesHistoryScopedDescription(line.name)}
              </p>
            </div>
            <button className="secondary-button secondary-button--sm" type="button" onClick={() => onOpenHistory(line.name)}>
              {t.versionLinesHistoryAction}
              <ArrowRight aria-hidden="true" />
            </button>
          </footer>
        )}
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
   * mounts instead of only reacting to its own "New line" button. */
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
  /* One column at a time below 1024px, the way Changes and History narrow.
     Which of the two is showing is this screen's own state, not a filter on
     the data, so it survives every refresh underneath it. */
  const [showNarrowDetail, setShowNarrowDetail] = useState(false);
  const [contextMenu, setContextMenu] = useState<VersionLineContextMenuState | null>(null);
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
  useEffect(() => {
    const name = selected?.name;
    if (!readHistory || !name || !selectedTip) {
      setHistory(null);
      return undefined;
    }
    const cached = peekHistory?.(name, selectedTip) ?? null;
    setHistory(cached);
    if (cached) return undefined;
    let cancelled = false;
    void readHistory(name, selectedTip)
      .then((answer) => {
        if (!cancelled) setHistory(answer);
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [peekHistory, readHistory, selected?.name, selectedTip]);

  function moveSelection(target: number): void {
    const index = Math.max(0, Math.min(target, listed.length - 1));
    const line = listed[index];
    if (!line) return;
    setSelectedName(line.name);
    requestAnimationFrame(() => document.getElementById(`version-line-${line.name}`)?.focus());
  }

  function handleMutated(next: VersionLinesSnapshot): void {
    onSnapshot(next);
    setDialog(null);
    onChanged();
    onOperationFinish();
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
      <RenameVersionLineDialog
        isOpen={dialog?.kind === "rename"}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        target={dialog?.kind === "rename" ? dialog.target : ""}
        upstream={dialog?.kind === "rename" ? dialog.upstream : null}
        onClose={closeDialog}
        onRenamed={(next, newName) => {
          // The selection follows the rename rather than snapping back to the
          // active line. By the name the rename was given, not by looking for
          // the tip commit again: a line branched from another and not yet
          // advanced shares its tip, and the search would have found whichever
          // of the two came first.
          setSelectedName(newName);
          handleMutated(next);
        }}
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
        onDeleted={handleMutated}
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
      {/* Title and state on one line, and nothing else: `.screen-header` in
          primitives.css, the row Changes and History open on too. Lines used to
          add a sentence of explanation under it, which was the one thing that
          made this header taller than the other two — and a screen reached from
          a rail that already names it does not need to introduce itself every
          time it is opened. The three now measure the same, so the panels below
          start on the same pixel row on all of them. */}
      <header className="screen-header">
        <div className="screen-header__heading">
          <h1>{t.versionLinesTitle}</h1>
          {/* One sentence saying what a version line is and what you do with
              one — the caption Changes and History both carry, spent here on
              the idea rather than on a tally. It used to count: lines, then
              how many were active, then how many were local only. Exactly one
              line is active at any moment and the list says which by putting
              it first, "local only" is a filter offered in the strip below,
              and the total is the list itself. Three numbers, none of them a
              fact the reader could not already see. */}
          <p>{t.versionLinesExplanation}</p>
        </div>
        {snapshot.headState !== "unborn" && (
          <button
            className="primary-button"
            type="button"
            onClick={() => openDialog({ kind: "create", forceSwitch: snapshot.headState === "detached" })}
          >
            <Plus aria-hidden="true" />
            {t.versionLinesNewButton}
          </button>
        )}
      </header>

      <div className="version-lines-layout">
        <section className="version-lines-list-panel" aria-label={t.versionLinesListAriaLabel}>
          {/* One strip, the way the Changes file list and the History timeline
              have one. Searching, filtering and sorting answer the same
              question — which lines this column shows — so they share a
              control instead of stacking rows of chrome above the panel. */}
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
                onSelect={setSelectedName}
                onMove={moveSelection}
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
        </section>

        {selected ? (
          <VersionLineDetail
            key={selected.name}
            line={selected}
            history={history?.name === selected.name ? history : null}
            formats={formats}
            onSwitch={() => openDialog({ kind: "switch", target: selected.name })}
            onRename={() =>
              openDialog({ kind: "rename", target: selected.name, upstream: selected.upstream })
            }
            onDelete={() => openDialog({ kind: "delete", target: selected.name })}
            onNewFromLine={() => openDialog({ kind: "create", forceSwitch: false })}
            onOpenHistory={onOpenHistory}
            onBack={() => setShowNarrowDetail(false)}
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
        onClose={closeContextMenu}
        onCopied={() => setAnnouncement(t.versionLinesNameCopied)}
        onSwitch={(target) => openDialog({ kind: "switch", target })}
        onRename={(target) =>
          openDialog({
            kind: "rename",
            target,
            upstream: snapshot.lines.find((line) => line.name === target)?.upstream ?? null,
          })
        }
        onDelete={(target) => openDialog({ kind: "delete", target })}
      />
      <p className="visually-hidden" role="status">
        {announcement}
      </p>

      {dialogs}
    </div>
  );
}

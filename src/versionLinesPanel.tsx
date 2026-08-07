import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  CircleAlert,
  Eye,
  GitBranch,
  ListFilter,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useLanguage, type Translations } from "./i18n";
import { handlePopupMenuKeyDown, useAnchoredPopup } from "./popupMenu";
import type { VersionLine, VersionLinesSnapshot } from "./versionLines";
import { CreateVersionLineDialog, DeleteVersionLineDialog, SwitchVersionLineDialog } from "./versionLinesDialog";
import { LoadingBar } from "./loadingBar";

type DialogRequest =
  | { kind: "create"; forceSwitch: boolean }
  | { kind: "switch"; target: string }
  | { kind: "delete"; target: string }
  | null;

/** How the "Other lines" list is ordered. `unpublished` leans on
 * `upstream === null` — a fact the snapshot already carries — rather than on
 * any commit count, which would mean asking Git something new (task 034). */
type SortKey = "recent" | "name" | "unpublished";

/** The state filters offered next to the name-prefix ones. They intentionally
 * mirror the pills a row can show, so what you filter by is what you see. */
type StateFilter = "local-only" | "deletable" | "blocked";

/** Whether this line can be deleted, decided by the same proof the delete
 * plan requires, so the list can say so up front instead of letting the user
 * find out only after opening the dialog. */
type Deletability = "ready" | "unique-work" | "elsewhere";

function deletabilityOf(line: VersionLine): Deletability {
  if (line.worktreePath !== null) {
    return "elsewhere";
  }
  return line.isRetainedElsewhere ? "ready" : "unique-work";
}

/** How this line compares to its upstream, derived from the last local
 * fetch — never a live remote check. `"none"` and `"synced"` are the two
 * unremarkable states; everything else is worth a row pill. */
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

function VersionLineRow({
  line,
  language,
  onSwitch,
  onDelete,
  onNewFromLine,
}: {
  line: VersionLine;
  language: string;
  onSwitch: () => void;
  onDelete: () => void;
  /** Active row only: branch a new line from the one you're already on. */
  onNewFromLine?: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);
  const savedDate = line.tip.committedAt
    ? new Date(line.tip.committedAt).toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric" })
    : "";
  const isCheckedOutElsewhere = line.worktreePath !== null;
  const deletability = deletabilityOf(line);
  const deleteLabel =
    deletability === "elsewhere"
      ? t.versionLinesDeleteElsewhereTooltip(line.name)
      : deletability === "unique-work"
        ? t.versionLinesDeleteBlockedTooltip(line.name)
        : t.versionLinesDeleteReadyTooltip(line.name);
  const detailsLabel = t.versionLinesDetailsToggleLabel(line.name);
  const sync = syncStatusOf(line);
  const syncText =
    sync.kind === "none"
      ? t.versionLinesSyncNoUpstream
      : sync.kind === "synced"
        ? t.versionLinesSyncUpToDate
        : sync.kind === "gone"
          ? t.versionLinesSyncGone
          : sync.kind === "ahead"
            ? t.versionLinesSyncAhead(sync.count)
            : sync.kind === "behind"
              ? t.versionLinesSyncBehind(sync.count)
              : t.versionLinesSyncAheadBehind(sync.ahead, sync.behind);

  return (
    <li className={`version-line-row${line.isActive ? " version-line-row--active" : ""}`}>
      <div className="version-line-row__main">
        <div className="version-line-row__icon" aria-hidden="true">
          <GitBranch />
        </div>
        <div className="version-line-row__body">
          <div className="version-line-row__name-row">
            <span className="version-line-row__name">{line.name}</span>
            {line.isActive && <span className="version-line-row__badge">{t.versionLinesActiveLabel}</span>}
          </div>
          <p className="version-line-row__meta">
            {t.versionLinesLatestLabel(line.tip.subject)}
            {savedDate && <> · {savedDate}</>}
          </p>
          <div className="version-lines-pills">
            {line.upstream ? (
              // A remote-tracking name can be arbitrarily long; truncating it
              // keeps row heights even, and the full value stays on hover and
              // in the technical details.
              <span
                className="publish-stays__pill version-line-row__pill--upstream"
                title={t.versionLinesUpstreamLabel(line.upstream)}
              >
                {t.versionLinesUpstreamLabel(line.upstream)}
              </span>
            ) : (
              <span className="publish-stays__pill publish-stays__pill--unsaved">
                {t.versionLinesNoUpstreamLabel}
              </span>
            )}
            {line.uniqueCommitCount !== null && line.uniqueCommitCount > 0 && (
              <span className="publish-stays__pill">{t.versionLinesUniqueCommits(line.uniqueCommitCount)}</span>
            )}
            {/* Only the states worth flagging get a pill: a line that's fully
                pushed and pulled doesn't need to say so twice (the "Tracks
                x" pill already implies it's published). */}
            {sync.kind === "gone" && (
              <span className="publish-stays__pill version-line-row__pill--warning">{syncText}</span>
            )}
            {(sync.kind === "ahead" || sync.kind === "behind" || sync.kind === "diverged") && (
              <span className="publish-stays__pill">{syncText}</span>
            )}
            {!line.isActive &&
              (deletability === "ready" ? (
                <span className="publish-stays__pill version-line-row__pill--deletable">
                  {t.versionLinesDeletablePill}
                </span>
              ) : deletability === "unique-work" ? (
                <span className="publish-stays__pill version-line-row__pill--blocked">
                  {t.versionLinesNotDeletablePill}
                </span>
              ) : null)}
          </div>
          {isCheckedOutElsewhere && (
            <p className="save-version-note">{t.versionLinesCheckedOutElsewhere(line.worktreePath ?? "")}</p>
          )}
        </div>

        <div className="version-line-row__actions">
          {line.isActive ? (
            <>
              <button
                className="secondary-button"
                type="button"
                aria-expanded={showDetails}
                aria-label={detailsLabel}
                onClick={() => setShowDetails((open) => !open)}
              >
                <Eye aria-hidden="true" />
                {t.versionLinesViewDetails}
              </button>
              {onNewFromLine && (
                <button className="secondary-button" type="button" onClick={onNewFromLine}>
                  <Plus aria-hidden="true" />
                  {t.versionLinesNewFromLine}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                className="version-line-row__details-toggle"
                type="button"
                aria-expanded={showDetails}
                aria-label={detailsLabel}
                onClick={() => setShowDetails((open) => !open)}
              >
                {t.versionLinesDetailsToggle}
                <ChevronDown
                  aria-hidden="true"
                  className={`version-line-row__chevron${showDetails ? " version-line-row__chevron--open" : ""}`}
                />
              </button>
              <span className="version-line-row__actions-divider" aria-hidden="true" />
              <button
                className="secondary-button"
                type="button"
                onClick={onSwitch}
                disabled={isCheckedOutElsewhere}
                aria-label={t.versionLinesSwitchToLineLabel(line.name)}
              >
                {t.versionLinesSwitchShort}
              </button>
              {/* Left enabled for an unmergeable line on purpose: the dialog
                  is where the refusal is explained and where the way forward
                  is offered, which beats a dead button with no reason. */}
              <button
                className="secondary-button version-line-row__delete"
                type="button"
                onClick={onDelete}
                disabled={deletability === "elsewhere"}
                title={deleteLabel}
                aria-label={deleteLabel}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {showDetails && (
        <dl className="version-line-row__details-panel">
          <div>
            <dt>{t.versionLinesRefNameLabel}</dt>
            <dd>{line.name}</dd>
          </div>
          <div>
            <dt>{t.versionLinesTipCommitLabel}</dt>
            <dd>{line.tip.shortCommit}</dd>
          </div>
          <div>
            <dt>{t.versionLinesDetailsUpstreamLabel}</dt>
            <dd>{line.upstream ?? t.versionLinesDetailsUpstreamNone}</dd>
          </div>
          <div>
            <dt>{t.versionLinesDetailsSyncLabel}</dt>
            <dd className="version-line-row__details-panel-prose">{syncText}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}

const SORT_LABEL_KEYS = {
  recent: "versionLinesSortRecent",
  name: "versionLinesSortName",
  unpublished: "versionLinesSortUnpublished",
} as const satisfies Record<SortKey, keyof Translations>;

/** The sort picker. Was a native `<select>`, which is the one control the
 * app cannot theme: `appearance: none` styles the closed trigger, but the
 * open option list is still drawn by the platform — so it arrived
 * light-on-light over the dark theme and looked nothing like the app's other
 * dropdowns. Now the same `.app-menu` popup the Overview branch picker and
 * the Changes view picker use. */
function SortMenu({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };
  const { containerRef, popupRef: menuRef } = useAnchoredPopup(
    isOpen,
    triggerRef,
    closeMenu,
    "selected-menu-item",
  );

  return (
    <div className="version-lines-sort" ref={containerRef}>
      <button
        ref={triggerRef}
        className="version-lines-select"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${t.versionLinesSortAriaLabel} (${t[SORT_LABEL_KEYS[value]]})`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ArrowUpDown aria-hidden="true" />
        <span>{t[SORT_LABEL_KEYS[value]]}</span>
        <ChevronDown aria-hidden="true" className="version-lines-select__chevron" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="app-menu version-lines-sort__menu"
          role="menu"
          aria-label={t.versionLinesSortAriaLabel}
          onKeyDown={(event) => handlePopupMenuKeyDown(event, menuRef.current, () => closeMenu(false))}
        >
          {(["recent", "name", "unpublished"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={value === key}
              className={`app-menu__item${value === key ? " app-menu__item--selected" : ""}`}
              onClick={() => {
                closeMenu(false);
                onChange(key);
                triggerRef.current?.focus();
              }}
            >
              {t[SORT_LABEL_KEYS[key]]}
              {value === key && <Check aria-hidden="true" className="app-menu__check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Search's neighbour: name prefixes and line states in one popup. Filters
 * combine — prefixes OR together, states OR together, and the two groups AND
 * with each other and with the search text — so narrowing is additive. */
function FilterMenu({
  prefixCounts,
  stateCounts,
  selectedPrefixes,
  selectedStates,
  onTogglePrefix,
  onToggleState,
  onClear,
}: {
  prefixCounts: [string, number][];
  stateCounts: Record<StateFilter, number>;
  selectedPrefixes: string[];
  selectedStates: StateFilter[];
  onTogglePrefix: (prefix: string) => void;
  onToggleState: (state: StateFilter) => void;
  onClear: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closePopup = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };
  const { containerRef, popupRef } = useAnchoredPopup(isOpen, triggerRef, closePopup, "first-control");
  const activeCount = selectedPrefixes.length + selectedStates.length;
  const stateLabels: Record<StateFilter, string> = {
    "local-only": t.versionLinesNoUpstreamLabel,
    deletable: t.versionLinesDeletablePill,
    blocked: t.versionLinesNotDeletablePill,
  };

  return (
    <div className="version-lines-filter" ref={containerRef}>
      <button
        ref={triggerRef}
        className={`version-lines-select${activeCount > 0 ? " version-lines-select--active" : ""}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={t.versionLinesFilterAriaLabel}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ListFilter aria-hidden="true" />
        <span>
          {activeCount === 0 ? t.versionLinesFilterButtonAll : t.versionLinesFilterButtonCount(activeCount)}
        </span>
        <ChevronDown aria-hidden="true" className="version-lines-select__chevron" />
      </button>
      {isOpen && (
        <div
          ref={popupRef}
          className="version-lines-filter__popup"
          role="dialog"
          aria-modal="false"
          aria-label={t.versionLinesFilterAriaLabel}
        >
          <div className="version-lines-filter__options">
            <p className="version-lines-filter__group-label">{t.versionLinesFilterStateGroup}</p>
            {(Object.keys(stateLabels) as StateFilter[]).map((state) => (
              <label key={state} className="version-lines-filter__option">
                <input
                  type="checkbox"
                  checked={selectedStates.includes(state)}
                  onChange={() => onToggleState(state)}
                />
                <span>{stateLabels[state]}</span>
                <span className="version-lines-filter__count">{stateCounts[state]}</span>
              </label>
            ))}

            {prefixCounts.length > 0 && (
              <>
                <p className="version-lines-filter__group-label">{t.versionLinesFilterPrefixGroup}</p>
                {prefixCounts.map(([prefix, count]) => (
                  <label key={prefix} className="version-lines-filter__option">
                    <input
                      type="checkbox"
                      checked={selectedPrefixes.includes(prefix)}
                      onChange={() => onTogglePrefix(prefix)}
                    />
                    <span>{prefix}</span>
                    <span className="version-lines-filter__count">{count}</span>
                  </label>
                ))}
              </>
            )}
          </div>

          {activeCount > 0 && (
            <button className="version-lines-filter__clear" type="button" onClick={onClear}>
              {t.versionLinesFilterClear}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function VersionLinesPanel({
  projectPath,
  snapshot,
  error,
  isLoading,
  onRefresh,
  onSnapshot,
  onChanged,
  onSaveVersion,
  onOpenChanges,
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  autoOpenCreate,
  onAutoOpenCreateHandled,
}: {
  projectPath: string;
  /** The project session's cached branch inventory, or `null` if this project
   * has never loaded one. Reading it (and the refresh that keeps it current)
   * belongs to `main.tsx`, so navigating away from this screen and back
   * re-renders the known answer instead of restarting from a spinner — see
   * task 019. */
  snapshot: VersionLinesSnapshot | null;
  /** A failed read, already localized. Shown as a full error screen only when
   * there is no `snapshot` to fall back on; alongside one it degrades to a
   * "this may be stale" note. */
  error: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  /** A fresh snapshot returned by a create/switch/delete, handed back so the
   * session cache reflects the mutation without waiting for a re-read. */
  onSnapshot: (snapshot: VersionLinesSnapshot) => void;
  /** Called after any successful create/switch/delete so the rest of the
   * app (repository facts, working-tree status, selection) can invalidate
   * itself — see `main.tsx`'s `handleVersionLineChanged`. */
  onChanged: () => void;
  onSaveVersion: () => void;
  /** Navigates to the Changes screen — the only place conflicted files are
   * listed, which is where a blocked "unfinished Git operation" points. */
  onOpenChanges?: () => void;
  /** Registers the dialog as a path-scoped mutation before it opens. Returns
   * false when another session sharing this Git directory owns a mutation. */
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  /** Set by the command palette's "New version line" action, which can fire
   * from any screen — this opens the create dialog as soon as the panel
   * mounts instead of only reacting to its own "New version line" button. */
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
}): React.JSX.Element {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
  const [prefixFilters, setPrefixFilters] = useState<string[]>([]);
  const [stateFilters, setStateFilters] = useState<StateFilter[]>([]);
  const [sort, setSort] = useState<SortKey>("recent");
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

  useEffect(() => {
    if (autoOpenCreate) {
      openDialog({ kind: "create", forceSwitch: false });
      onAutoOpenCreateHandled?.();
    }
    // Deliberately fires once per truthy transition of `autoOpenCreate`
    // (the parent flips it back to false right after), not on every render.
  }, [autoOpenCreate]);

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
    const counts: Record<StateFilter, number> = { "local-only": 0, deletable: 0, blocked: 0 };
    for (const line of snapshot?.lines ?? []) {
      if (line.isActive) {
        continue;
      }
      if (line.upstream === null) {
        counts["local-only"] += 1;
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
  const isFiltered = search.trim().length > 0 || prefixFilters.length > 0 || stateFilters.length > 0;

  function handleMutated(next: VersionLinesSnapshot): void {
    onSnapshot(next);
    setDialog(null);
    onChanged();
    onOperationFinish();
  }

  return (
    <div className="version-lines-view">
      <header className="version-lines-view__header">
        <div>
          <h1>{t.versionLinesTitle}</h1>
          <p>{t.versionLinesExplanation}</p>
          {snapshot && (
            <p className="version-lines-stats">
              <GitBranch aria-hidden="true" />
              <span>{t.versionLinesStatsLines(snapshot.totalCount)}</span>
              {active && (
                <>
                  <span className="version-lines-stats__separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="version-lines-stats__item">
                    <span className="version-lines-stats__dot version-lines-stats__dot--active" aria-hidden="true" />
                    {t.versionLinesStatsActive(1)}
                  </span>
                </>
              )}
              {stateCounts["local-only"] > 0 && (
                <>
                  <span className="version-lines-stats__separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="version-lines-stats__item">
                    <span className="version-lines-stats__dot" aria-hidden="true" />
                    {t.versionLinesStatsLocalOnly(stateCounts["local-only"])}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        {snapshot?.headState !== "unborn" && (
          <button
            className="primary-button"
            type="button"
            onClick={() => openDialog({ kind: "create", forceSwitch: snapshot?.headState === "detached" })}
          >
            <Plus aria-hidden="true" />
            {t.versionLinesNewButton}
          </button>
        )}
      </header>

      {/* Only when there is genuinely nothing to show: with a cached snapshot
          the background refresh stays invisible, which is the whole point of
          keeping it in the session. */}
      {!snapshot && isLoading && <LoadingBar label={t.versionLinesLoading} showLabel />}

      {!snapshot && !isLoading && error && (
        <div className="changes-empty">
          <p role="alert">
            <CircleAlert aria-hidden="true" />
            {error}
          </p>
          <button className="primary-button" type="button" onClick={onRefresh}>
            {t.versionLinesRetry}
          </button>
        </div>
      )}

      {snapshot && (
        <>
          {/* A refresh that fails after a successful one keeps the known list
              visible, but must still say it may be out of date. */}
          {error && !isLoading && (
            <p className="save-version-note" role="alert">
              {t.statusRefreshFailedNote}
            </p>
          )}
          {snapshot.headState === "detached" && (
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

          {snapshot.headState === "unborn" && (
            <div className="version-lines-banner" role="status">
              <h2>{t.versionLinesUnbornTitle}</h2>
              <p>{t.versionLinesUnbornDescription}</p>
            </div>
          )}

          <div className="version-lines-toolbar">
            <label className="version-lines-search-box__input">
              <Search aria-hidden="true" />
              <span className="visually-hidden">{t.versionLinesSearchAriaLabel}</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.versionLinesSearchPlaceholder}
                aria-label={t.versionLinesSearchAriaLabel}
              />
            </label>

            <FilterMenu
              prefixCounts={prefixCounts}
              stateCounts={stateCounts}
              selectedPrefixes={prefixFilters}
              selectedStates={stateFilters}
              onTogglePrefix={(prefix) =>
                setPrefixFilters((current) =>
                  current.includes(prefix) ? current.filter((value) => value !== prefix) : [...current, prefix],
                )
              }
              onToggleState={(state) =>
                setStateFilters((current) =>
                  current.includes(state) ? current.filter((value) => value !== state) : [...current, state],
                )
              }
              onClear={() => {
                setPrefixFilters([]);
                setStateFilters([]);
              }}
            />

            <SortMenu value={sort} onChange={setSort} />
          </div>

          {active && (
            <section className="version-lines-section">
              <h2 className="version-lines-section__title version-lines-section__title--active">
                {t.versionLinesSectionActive}
              </h2>
              <ul className="version-lines-list version-lines-list--active">
                <VersionLineRow
                  line={active}
                  language={language}
                  onSwitch={() => undefined}
                  onDelete={() => undefined}
                  onNewFromLine={() => openDialog({ kind: "create", forceSwitch: false })}
                />
              </ul>
            </section>
          )}

          <section className="version-lines-section">
            <h2 className="version-lines-section__title">{t.versionLinesSectionOthers}</h2>
            {others.length === 0 ? (
              <p className="version-lines-empty-note">
                {isFiltered ? t.versionLinesNoSearchMatches : t.versionLinesEmptyOthers}
              </p>
            ) : (
              <ul className="version-lines-list">
                {others.map((line) => (
                  <VersionLineRow
                    key={line.name}
                    line={line}
                    language={language}
                    onSwitch={() => openDialog({ kind: "switch", target: line.name })}
                    onDelete={() => openDialog({ kind: "delete", target: line.name })}
                  />
                ))}
              </ul>
            )}
          </section>

          {snapshot.isTruncated && (
            <p className="save-version-note">
              {t.versionLinesTruncatedNote(snapshot.lines.length, snapshot.totalCount)}
            </p>
          )}

          {snapshot.unreadableCount > 0 && (
            <p className="save-version-note" role="status">
              {t.versionLinesUnreadableNote(snapshot.unreadableCount)}
            </p>
          )}
        </>
      )}

      <CreateVersionLineDialog
        isOpen={dialog?.kind === "create"}
        projectPath={projectPath}
        forceSwitch={dialog?.kind === "create" ? dialog.forceSwitch : undefined}
        onClose={closeDialog}
        onCreated={handleMutated}
        onPhaseChange={onOperationPhaseChange}
      />
      <SwitchVersionLineDialog
        isOpen={dialog?.kind === "switch"}
        projectPath={projectPath}
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
    </div>
  );
}

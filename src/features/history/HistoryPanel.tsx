import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft, Check, CircleAlert, Cloud, CloudOff,
  CalendarDays, Copy, Folder, GitBranch, GitMerge,
  GitCommitHorizontal, HardDrive, Info, ListFilter,
  Tag, UserRound, X,
} from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { getFileTypeIcon } from "../../shared/file-icons";
import { formatNumber, type LocaleFormats } from "../../shared/i18n";
import { AutomaticUpdatesNotice, autoHideScrollbarProps, handlePopupMenuKeyDown, LoadingBar, SearchBox, useAnchoredPopup } from "../../shared/ui";
import { ChangesContextMenu, DiffResultView, DiffStepNav, DiffViewSelector, PictureDiffControls, usePictureDiff, type ChangesContextMenuState, type DiffViewMode, type FileDiff, type ImagePreviewLoader } from "../changes";
import { CHANGE_CATEGORY_ICONS, splitPath, type ChangeCategory } from "../status";
import { MAX_HISTORY_ROWS, type HistoryController } from "./controller";
import type { HistoryFileChange, HistoryState, PublicationState, SavedVersionDetail, SavedVersionSummary } from "./domain";
import { formatHistoryDate } from "./formatHistoryDate";
import { decorationLabel, HistoryMetaDot, HistoryRefBadge, primaryDecoration } from "./HistoryRefBadge";
import { countActiveFilters, NO_HISTORY_FILTERS, type HistoryFilters, type HistoryQuery } from "./port";

const CATEGORY_LABEL_KEYS = {
  changed: "changesCategoryLabelChanged", new: "changesCategoryLabelNew",
  deleted: "changesCategoryLabelDeleted", renamed: "changesCategoryLabelRenamed",
  conflicted: "changesCategoryLabelConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

type HistoryTab = "overview" | "diff";

function changedAreas(files: HistoryFileChange[]): Array<{ path: string; count: number }> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const parts = file.path.split("/");
    const area = parts.length > 1 ? parts.slice(0, Math.min(parts.length - 1, 2)).join("/") : ".";
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()].map(([path, count]) => ({ path, count })).sort((left, right) => right.count - left.count || left.path.localeCompare(right.path)).slice(0, 5);
}

function versionTitle(version: SavedVersionSummary, t: Translations): string {
  if (version.messageUnavailable === "tooLarge") return t.historyMessageTooLarge;
  if (version.messageUnavailable === "pageBudget") return t.historyMessagePageLimit;
  if (version.messageUnavailable === "malformed") return t.historyMessageMalformed;
  return version.subject.trim() || t.historyNoDescription;
}

function publicationCopy(publication: PublicationState, t: Translations): string {
  if (publication === "published") return t.historyPublished;
  if (publication === "local-only") return t.historyLocalOnly;
  return t.historyPublicationUnknown;
}

function PublicationIcon({ publication }: { publication: PublicationState }): React.JSX.Element {
  if (publication === "published") return <Cloud aria-hidden="true" />;
  if (publication === "local-only") return <HardDrive aria-hidden="true" />;
  return <CloudOff aria-hidden="true" />;
}

function HistoryBanner({ tone, title, action, children }: { tone: "neutral" | "warning" | "danger"; title: string; action?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return <section className={`history-banner history-banner--${tone}`}><CircleAlert aria-hidden="true" /><div className="history-banner__body"><strong>{title}</strong><p>{children}</p></div>{action}</section>;
}

function HistoryWatchingNotice({ watcherState, busy, onRefresh, onOpenSettings }: { watcherState: "starting" | "watching" | "off" | "unavailable"; busy: boolean; onRefresh: () => void; onOpenSettings: () => void }): React.JSX.Element | null {
  const { t } = useLanguage();
  if (watcherState !== "off" && watcherState !== "unavailable") return null;
  return <AutomaticUpdatesNotice title={watcherState === "off" ? t.automaticUpdatesOffTitle : t.automaticUpdatesUnavailableTitle} description={t.automaticUpdatesOutdatedDescription} updateLabel={t.automaticUpdatesUpdateNow} updateAriaLabel={t.historyRefresh} updatingLabel={t.automaticUpdatesUpdating} updatingAriaLabel={t.historyRefreshing} busy={busy} settingsLabel={t.automaticUpdatesOpenSettings} onUpdate={onRefresh} onOpenSettings={onOpenSettings} />;
}

/** How much of this row's rail belongs to the stretch between the top of the
 * list and the selected version: all of it, as far as this row's own node, or
 * none. A fact about where the selection sits, and the only thing the timeline
 * draws that is not either structure or the selection itself. */
type RailFill = "filled" | "half" | null;

const TimelineRow = React.memo(function TimelineRow({ version, index, first, last, selected, rail, focusable, formats, currentBranch, onSelect, onMove, onOpenDetail }: {
  version: SavedVersionSummary; index: number; first: boolean; last: boolean; selected: boolean; rail: RailFill; focusable: boolean; formats: LocaleFormats; currentBranch: string | null; onSelect: (commit: string) => void; onMove: (index: number) => void; onOpenDetail: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const title = versionTitle(version, t);
  const date = formatHistoryDate(version.authoredAt, formats);
  const author = version.author?.name.trim() || t.historyAuthorUnknown;
  // The row is a button with an explicit `aria-label`, which replaces its
  // subtree, so the reference has to be spoken here or not at all.
  const decoration = primaryDecoration(version, currentBranch);
  const name = selected ? t.historySelectedVersion(title) : title;
  const label = decoration ? `${name} — ${decorationLabel(decoration, t)}` : name;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const target = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1
      : event.key === "Home" ? 0 : event.key === "End" ? Number.MAX_SAFE_INTEGER
        : event.key === "PageDown" ? index + 8 : event.key === "PageUp" ? index - 8 : null;
    if (target === null) return;
    event.preventDefault();
    onMove(target);
  };
  return (
    <button id={`history-version-${version.commit}`} className={`history-row${selected ? " history-row--selected" : ""}`} type="button" role="option" aria-selected={selected} aria-label={label} tabIndex={focusable ? 0 : -1} data-first={first || undefined} data-last={last || undefined} data-rail={rail ?? undefined} onClick={() => { onSelect(version.commit); onOpenDetail(); }} onKeyDown={handleKeyDown}>
      <span className="history-row__node" aria-hidden="true" />
      <span className="history-row__body"><span className="history-row__title" title={title}>{title}</span><span className="history-row__meta"><span className="history-row__author" title={author}>{author}</span><HistoryRefBadge version={version} currentBranch={currentBranch} />{date && <><HistoryMetaDot /><span className="history-row__date" title={t.historyVersionDate(date.absolute)}>{date.relative}</span></>}</span></span>
    </button>
  );
});

const HistoryTimeline = React.memo(function HistoryTimeline({ versions, selectedCommit, scrollOffset, isLoading, hasMore, isLoadingMore, hasMoreError, clientTruncated, formats, currentBranch, search, filters, authorSuggestions, canFilterPublication, onSearch, onFilters, onSelect, onLoadMore, onScrollOffset, onOpenDetail }: {
  versions: SavedVersionSummary[]; selectedCommit: string | null; scrollOffset: number; isLoading: boolean; hasMore: boolean; isLoadingMore: boolean; hasMoreError: boolean; clientTruncated: boolean; formats: LocaleFormats; currentBranch: string | null; search: string; filters: HistoryFilters; authorSuggestions: string[]; canFilterPublication: boolean;
  onSearch: (value: string) => void; onFilters: (filters: HistoryFilters) => void; onSelect: (commit: string) => void; onLoadMore: () => void; onScrollOffset: (offset: number) => void; onOpenDetail: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusCommit = versions.some((version) => version.commit === selectedCommit) ? selectedCommit : versions[0]?.commit ?? null;
  const selectedIndex = versions.findIndex((version) => version.commit === selectedCommit);
  const filtered = countActiveFilters(filters) > 0;
  const virtualizer = useVirtualizer({ count: versions.length, getScrollElement: () => scrollRef.current, estimateSize: () => 82, overscan: 6, getItemKey: (index) => versions[index]?.commit ?? index });
  const rows = virtualizer.getVirtualItems();
  const lastIndex = rows.at(-1)?.index ?? -1;

  useLayoutEffect(() => {
    if (restoredRef.current || !scrollRef.current || search || filtered) return;
    scrollRef.current.scrollTop = scrollOffset;
    restoredRef.current = true;
  }, [filtered, scrollOffset, search]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const save = (): void => { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => onScrollOffset(element.scrollTop), 120); };
    element.addEventListener("scroll", save, { passive: true });
    return () => { element.removeEventListener("scroll", save); if (saveTimer.current) clearTimeout(saveTimer.current); if (!search && !filtered) onScrollOffset(element.scrollTop); };
  }, [filtered, onScrollOffset, search]);

  useEffect(() => {
    // The search box still narrows the rows on screen, so it is the one thing
    // that can make the tail arrive early and stall paging; the filters are
    // answered by Git and page normally underneath them.
    //
    // `isLoading` matters as much as `isLoadingMore`: while the first page of
    // a new question is in flight the rows on screen still belong to the old
    // one, and their tail says nothing about where the new history ends.
    if (!search && !isLoading && lastIndex >= versions.length - 18 && hasMore && !isLoadingMore) onLoadMore();
  }, [hasMore, isLoading, isLoadingMore, lastIndex, onLoadMore, search, versions.length]);

  const moveSelection = useCallback((target: number): void => {
    const index = Math.max(0, Math.min(target, versions.length - 1));
    const version = versions[index];
    if (!version) return;
    onSelect(version.commit);
    virtualizer.scrollToIndex(index, { align: "auto" });
    requestAnimationFrame(() => document.getElementById(`history-version-${version.commit}`)?.focus());
  }, [onSelect, versions, virtualizer]);
  return (
    <section className="history-timeline" aria-label={t.historyTimelineAriaLabel} aria-busy={isLoading || undefined}>
      {/* One strip, the way the Changes file list has one. Searching and
          filtering answer the same question — which saved versions this column
          lists — so they share a control instead of stacking two rows of chrome
          above the panel; the title and the count they used to sit under moved
          out to the screen header, where Changes keeps its own. That also puts
          this panel's top edge back on the detail card's, which three rows of
          header had pushed ~150px below it. */}
      <div className="history-timeline__toolbar">
        <SearchBox
          value={search}
          onChange={onSearch}
          placeholder={t.historySearchPlaceholder}
          ariaLabel={t.historySearchAriaLabel}
          clearLabel={t.commonClearSearch}
          trailing={<HistoryFilterPanel
            filters={filters}
            authorSuggestions={authorSuggestions}
            canFilterPublication={canFilterPublication}
            onChange={onFilters}
          />}
        />
      </div>
      <HistoryFilterChips filters={filters} onChange={onFilters} />
      {/* A thread while Git answers, rather than an emptied list: the rows
          below are the previous answer and the strip says they are being
          replaced. */}
      {isLoading && versions.length > 0 && <div className="history-timeline__progress"><LoadingBar label={t.historyLoading} /></div>}
      <div {...autoHideScrollbarProps<HTMLDivElement>()} ref={scrollRef} className="history-timeline__scroll auto-hide-scrollbar" role="listbox" aria-label={t.historyTimelineAriaLabel}>
        {versions.length ? <div className="history-timeline__virtual" style={{ height: virtualizer.getTotalSize() }}>
          {rows.map((virtualRow) => { const version = versions[virtualRow.index]; const rail: RailFill = selectedIndex < 0 ? null : virtualRow.index < selectedIndex ? "filled" : virtualRow.index === selectedIndex ? "half" : null; return <div key={virtualRow.key} className="history-timeline__virtual-row" style={{ transform: `translateY(${virtualRow.start}px)` }}><TimelineRow version={version} index={virtualRow.index} first={virtualRow.index === 0} last={virtualRow.index === versions.length - 1} selected={version.commit === selectedCommit} rail={rail} focusable={version.commit === focusCommit} formats={formats} currentBranch={currentBranch} onSelect={onSelect} onMove={moveSelection} onOpenDetail={onOpenDetail} /></div>; })}
        </div> : isLoading ? <div className="history-timeline__empty"><LoadingBar label={t.historyLoading} /></div> : <div className="history-timeline__empty">
          <p>{t.historyNoMatches}</p>
          {filtered && <button className="secondary-button secondary-button--sm" type="button" onClick={() => onFilters(NO_HISTORY_FILTERS)}>{t.historyFiltersClear}</button>}
        </div>}
        <div className="history-timeline__footer">
          {hasMoreError && <div className="history-inline-error" role="alert"><span>{t.historyMoreError}</span><button className="secondary-button" type="button" onClick={onLoadMore}>{t.historyRetry}</button></div>}
          {hasMore && !clientTruncated && (isLoadingMore ? <div className="history-timeline__loading-more"><LoadingBar label={t.historyLoadingMore} showLabel /></div> : <button className="secondary-button" type="button" onClick={onLoadMore}>{t.historyLoadMore}</button>)}
        </div>
      </div>
    </section>
  );
});

function HistoryFileButton({ file, selected, onSelect }: { file: HistoryFileChange; selected: boolean; onSelect: () => void }): React.JSX.Element {
  const { t } = useLanguage();
  const { name, dir } = splitPath(file.path);
  const category = t[CATEGORY_LABEL_KEYS[file.category]];
  const FileTypeIcon = getFileTypeIcon(file.path);
  return <button className={`history-file${selected ? " history-file--selected" : ""}`} type="button" role="option" aria-selected={selected} aria-label={`${file.path} — ${category}`} onClick={onSelect}><span className="history-file__type" aria-hidden="true"><FileTypeIcon /></span><span className="history-file__path"><strong>{name}</strong>{dir && <span>{dir}</span>}</span><span className={`history-file__category history-file__category--${file.category}`} title={category} aria-hidden="true">{CHANGE_CATEGORY_ICONS[file.category]}</span></button>;
}

function ChangedFiles({ files, selectedPath, onSelect }: { files: HistoryFileChange[]; selectedPath: string | null; onSelect: (path: string) => void }): React.JSX.Element {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: files.length, getScrollElement: () => scrollRef.current, estimateSize: () => 58, overscan: 6, getItemKey: (index) => files[index]?.path ?? index });
  return <div {...autoHideScrollbarProps<HTMLDivElement>()} ref={scrollRef} className="history-files auto-hide-scrollbar" role="listbox" aria-label={t.historyFilesAriaLabel}><div className="history-files__virtual" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((row) => { const file = files[row.index]; return <div key={row.key} className="history-files__row" style={{ transform: `translateY(${row.start}px)` }}><HistoryFileButton file={file} selected={file.path === selectedPath} onSelect={() => onSelect(file.path)} /></div>; })}</div></div>;
}

function OverviewChangedFiles({ files, selectedPath, onSelect }: { files: HistoryFileChange[]; selectedPath: string | null; onSelect: (path: string) => void }): React.JSX.Element {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 58,
    overscan: 6,
    getItemKey: (index) => files[index]?.path ?? index,
  });

  if (files.length === 0) {
    return <p className="history-overview-files__empty">{t.historyNoChangedFiles}</p>;
  }

  return (
    <div
      {...autoHideScrollbarProps<HTMLDivElement>()}
      ref={scrollRef}
      className="history-overview-files auto-hide-scrollbar"
      role="listbox"
      aria-label={t.historyFilesAriaLabel}
    >
      <div className="history-overview-files__virtual" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const file = files[row.index];
          return (
            <div
              key={row.key}
              className="history-overview-files__row"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <HistoryFileButton file={file} selected={file.path === selectedPath} onSelect={() => onSelect(file.path)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function authorInitials(version: SavedVersionSummary, fallback: string): string {
  const name = version.author?.name.trim() || fallback;
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase();
}

function HistoryDetailHeader({ detail, formats, activeTab, onTab }: {
  detail: SavedVersionDetail; formats: LocaleFormats; activeTab: HistoryTab;
  onTab: (tab: HistoryTab) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const version = detail.version;
  const title = versionTitle(version, t);
  const date = formatHistoryDate(version.authoredAt, formats);
  const tabs: Array<{ id: HistoryTab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: "overview", label: t.historyOverviewTab, icon: <Info aria-hidden="true" /> },
    { id: "diff", label: t.historyDiffTab, icon: <GitCommitHorizontal aria-hidden="true" /> },
  ];
  return <header className="history-detail__summary"><div className="history-detail__summary-top"><div className="history-detail__identity"><h2 id="history-detail-title">{title}</h2><div className="history-detail__compact-info"><p className="history-detail__meta"><span className="history-author-avatar" aria-hidden="true">{authorInitials(version, t.historyAuthorUnknown)}</span><strong>{version.author?.name || t.historyAuthorUnknown}</strong>{date && <span title={t.historyVersionDate(date.absolute)}>{date.relative}</span>}<code>{version.shortCommit}</code><span className={`history-publication history-publication--${version.publication}`}><PublicationIcon publication={version.publication} />{publicationCopy(version.publication, t)}</span></p>
    <div className="history-detail__badges">{version.isRoot && <span className="history-kind-chip">{t.historyRoot}</span>}{version.isMerge && <span className="history-kind-chip">{t.historyMerge}</span>}{version.decorations.slice(0, 3).map((decoration) => <span key={decoration.fullRef} className="history-ref-chip" title={decoration.fullRef}>{decoration.kind === "tag" && <Tag aria-hidden="true" />}{decoration.name}</span>)}</div></div>
    </div></div>
    <div className="history-tabs" role="tablist" aria-label={t.historyTitle}>{tabs.map((tab) => <button key={tab.id} id={`history-tab-${tab.id}`} className={activeTab === tab.id ? "history-tab history-tab--active" : "history-tab"} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`history-panel-${tab.id}`} onClick={() => onTab(tab.id)}>{tab.icon}<span>{tab.label}</span>{tab.count !== undefined && <span className="history-tab__count">{formatNumber(tab.count, formats)}</span>}</button>)}</div></header>;
}

function OverviewMetric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }): React.JSX.Element {
  return <div className="history-overview-metric"><span>{label}</span><strong className={tone ? `history-overview-metric__value--${tone}` : undefined}>{tone === "positive" ? "+" : tone === "negative" ? "−" : ""}{value}</strong></div>;
}

function HistoryOverview({ detail, state, formats, comparison, onSelectFile }: { detail: SavedVersionDetail; state: HistoryState; formats: LocaleFormats; comparison: string; onSelectFile: (path: string) => void }): React.JSX.Element {
  const { t } = useLanguage();
  const version = detail.version;
  const authored = formatHistoryDate(version.authoredAt, formats);
  const committed = formatHistoryDate(version.committedAt, formats);
  const areas = changedAreas(detail.files);
  const description = version.description.trim();
  return <div id="history-panel-overview" className="history-workspace history-workspace--overview" role="tabpanel" aria-labelledby="history-tab-overview">
    <div {...autoHideScrollbarProps<HTMLDivElement>()} className="history-overview-grid auto-hide-scrollbar">
      <div className="history-overview-column">
        <div className="history-overview-metrics">
          <OverviewMetric label={t.historyFilesTab} value={formatNumber(detail.fileCounts.total, formats)} />
          <OverviewMetric label={t.historyNewFiles} value={formatNumber(detail.fileCounts.new, formats)} tone="positive" />
          <OverviewMetric label={t.historyDeletedFiles} value={formatNumber(detail.fileCounts.deleted, formats)} tone="negative" />
        </div>
        {description && <section className="history-overview-section"><h3>{t.historyDescriptionTitle}</h3><p className="history-overview-description">{description}</p>{version.descriptionTruncated && <p className="history-detail__truncated" role="note">{t.historyDescriptionTruncated}</p>}</section>}
        <section className="history-overview-section"><h3>{t.historyChangedAreas}</h3><ul className="history-area-list">{areas.map((area) => <li key={area.path}><Folder aria-hidden="true" /><span>{area.path}</span><strong>{formatNumber(area.count, formats)}</strong></li>)}</ul></section>
      </div>
      <section className="history-overview-section history-overview-changed-files"><h3>{t.historyFilesTab}</h3><OverviewChangedFiles files={detail.files} selectedPath={state.selectedFilePath} onSelect={onSelectFile} /></section>
      <div className="history-overview-column history-overview-column--technical">
        <section className="history-overview-section history-technical-card"><h3>{t.historyTechnicalDetails}</h3><dl>
          <div><dt>{t.historyCommitLabel}</dt><dd><code>{version.shortCommit}</code></dd></div>
          <div><dt>{t.historyParentsLabel}</dt><dd>{version.parents.length ? version.parents.map((parent) => <code key={parent}>{parent.slice(0, 10)}</code>) : t.historyNoParents}</dd></div>
          <div><dt>{t.historyAuthorLabel}</dt><dd><span>{version.author?.name || t.historyAuthorUnknown}</span>{version.author?.email && <small>{version.author.email}</small>}</dd></div>
          <div><dt>{t.historyCommittedLabel}</dt><dd>{committed?.absolute ?? authored?.absolute ?? "—"}</dd></div>
          <div><dt>{t.historyRefsLabel}</dt><dd>{version.decorations.length ? version.decorations.slice(0, 4).map((item) => <span className="history-technical-chip" key={item.fullRef}>{item.name}</span>) : "—"}</dd></div>
        </dl></section>
        <section className="history-overview-section"><h3>{t.historyComparisonTitle}</h3><p>{comparison}</p></section>
      </div>
    </div>
    <footer className="history-overview-footer">
      <span><CalendarDays aria-hidden="true" />{authored?.relative ?? "—"}</span>
      <span><UserRound aria-hidden="true" />{t.historyContributorCount(version.author ? 1 : 0)}</span>
      <span><GitBranch aria-hidden="true" />{t.historyParentCount(version.parents.length)}</span>
    </footer>
  </div>;
}

function diffTotals(diff: FileDiff | null): { added: number; removed: number } | null {
  if (!diff || !("hunks" in diff)) return null;
  let added = 0; let removed = 0;
  for (const hunk of diff.hunks) for (const line of hunk.lines) { if (line.kind === "addition") added += 1; if (line.kind === "deletion") removed += 1; }
  return { added, removed };
}

function diffHunkCount(diff: FileDiff | null): number { return diff && "hunks" in diff ? diff.hunks.length : 0; }

/** Calendar day, `YYYY-MM-DD`, `days` before today — the shape Rust validates
 * and the only date vocabulary that means the same thing tomorrow. */
function dayBefore(days: number): string {
  const day = new Date();
  day.setDate(day.getDate() - days);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function dateRanges(t: Translations): Array<{ label: string; since: string | null }> {
  return [
    { label: t.historyFilterDateAny, since: null },
    { label: t.historyFilterDateWeek, since: dayBefore(7) },
    { label: t.historyFilterDateMonth, since: dayBefore(30) },
    { label: t.historyFilterDateYear, since: dayBefore(365) },
  ];
}

/** What is currently narrowing the list, said once, in the order the panel
 * asks for it. The chips under the search box and the panel's own footer both
 * read this, so the two can never disagree about what "3 filters" means. */
function activeFilters(filters: HistoryFilters, t: Translations): Array<{ key: string; label: string; cleared: Partial<HistoryFilters> }> {
  const described: Array<{ key: string; label: string; cleared: Partial<HistoryFilters> }> = [];
  if (filters.author) described.push({ key: "author", label: filters.author, cleared: { author: null } });
  if (filters.since) {
    // A range chosen yesterday is still a date today, so the name is looked up
    // rather than assumed: an unmatched date says itself instead of nothing.
    const named = dateRanges(t).find((range) => range.since === filters.since);
    described.push({ key: "since", label: named?.label ?? filters.since, cleared: { since: null } });
  }
  // `until` has no control of its own yet, but it is part of the filter set
  // Rust answers and `countActiveFilters` counts. Describing it here is what
  // keeps the badge and the chips talking about the same six things — a count
  // that says three beside two chips is worse than either alone.
  if (filters.until) described.push({ key: "until", label: filters.until, cleared: { until: null } });
  if (filters.path) described.push({ key: "path", label: filters.path, cleared: { path: null } });
  if (filters.noMerges) described.push({ key: "noMerges", label: t.historyFilterHideMerges, cleared: { noMerges: false } });
  if (filters.unpublishedOnly) described.push({ key: "unpublishedOnly", label: t.historyFilterUnpublishedOnly, cleared: { unpublishedOnly: false } });
  return described;
}

/** The filters that are on, under the strip that set them, each removable on
 * its own. The trigger's badge says how many; this says which — and a row of
 * its own is what lets it, where chips inside the search pill would have taken
 * the width from the field they sit in. */
function HistoryFilterChips({ filters, onChange }: {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const chips = activeFilters(filters, t);
  if (chips.length === 0) return null;
  return <div className="history-filter-chips">
    {chips.map((chip) => <span key={chip.key} className="history-filter-chip">
      <span className="history-filter-chip__label" title={chip.label}>{chip.label}</span>
      <button
        type="button"
        className="history-filter-chip__remove"
        aria-label={t.historyFilterRemove(chip.label)}
        onClick={() => onChange({ ...filters, ...chip.cleared })}
      >
        <X aria-hidden="true" />
      </button>
    </span>)}
  </div>;
}

/** The filters, behind one trigger.
 *
 * They used to be two menus sitting in the search box, which spent the strip's
 * width on saying what they were set to. A sidebar column has ~300px and five
 * filters; the trigger says *how many* are on and the panel says which, which
 * is the only arrangement that does not grow with the number of filters.
 *
 * Toggles and ranges apply as they are chosen — one click, one answer. The two
 * text fields commit on Enter or on leaving them, because every apply is a
 * fresh read of the repository and a keystroke is not an intention. */
function HistoryFilterPanel({ filters, authorSuggestions, canFilterPublication, onChange }: {
  filters: HistoryFilters;
  authorSuggestions: string[];
  canFilterPublication: boolean;
  onChange: (filters: HistoryFilters) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [authorDraft, setAuthorDraft] = useState(filters.author ?? "");
  const [pathDraft, setPathDraft] = useState(filters.path ?? "");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closePanel = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { containerRef, popupRef } = useAnchoredPopup(isOpen, triggerRef, closePanel, "container");

  useEffect(() => { setAuthorDraft(filters.author ?? ""); }, [filters.author]);
  useEffect(() => { setPathDraft(filters.path ?? ""); }, [filters.path]);

  const active = countActiveFilters(filters);
  const apply = (patch: Partial<HistoryFilters>): void => onChange({ ...filters, ...patch });
  const commitText = (key: "author" | "path", draft: string): void => {
    const value = draft.trim();
    apply({ [key]: value.length > 0 ? value : null });
  };
  const ranges = dateRanges(t);

  return <div className="history-filter" ref={containerRef}>
    <button
      ref={triggerRef}
      className={`history-filter__trigger${active > 0 ? " history-filter__trigger--active" : ""}`}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={active > 0 ? t.historyFiltersActive(active) : t.historyFiltersLabel}
      data-tooltip={active > 0 ? t.historyFiltersActive(active) : t.historyFiltersLabel}
      onClick={() => setIsOpen((open) => !open)}
    >
      <ListFilter aria-hidden="true" />
      {/* A count, not a dot: the trigger has to say that something is on and
          how much of it, without the panel being open to read. */}
      {active > 0 && <span className="history-filter__badge" aria-hidden="true">{active}</span>}
    </button>
    {isOpen && <div
      ref={popupRef}
      className="history-filter__panel"
      role="dialog"
      aria-label={t.historyFiltersLabel}
      tabIndex={-1}
      onKeyDown={(event) => handlePopupMenuKeyDown(event, popupRef.current, () => closePanel(true))}
    >
      <div className="history-filter__group">
        <label className="history-filter__label" htmlFor="history-filter-author">{t.historyFilterAuthorLabel}</label>
        {/* The same pill the search boxes wear, with the glyph naming what goes
            in it — a person, a folder — so the two fields are told apart before
            their labels are read. */}
        <div className="history-filter__field">
          <UserRound aria-hidden="true" />
          <input
            id="history-filter-author"
            type="text"
            value={authorDraft}
            list="history-filter-authors"
            placeholder={t.historyFilterAuthorPlaceholder}
            onChange={(event) => setAuthorDraft(event.target.value)}
            onBlur={() => commitText("author", authorDraft)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitText("author", authorDraft); } }}
          />
        </div>
        {/* Suggestions from the versions on screen; the filter itself still
            asks Git about all of them, so the list is a shortcut and never a
            limit on what can be typed. */}
        <datalist id="history-filter-authors">
          {authorSuggestions.map((name) => <option key={name} value={name} />)}
        </datalist>
      </div>

      {/* Four capsules rather than four radio rows: they are one choice out of
          a short, fixed set of the same kind of thing, which is the shape a
          segmented choice takes. Still real radios underneath — the input is
          hidden, not replaced, so arrow keys and assistive technology keep the
          grouping they would otherwise lose. */}
      <fieldset className="history-filter__group">
        <legend className="history-filter__label">{t.historyFilterDateLabel}</legend>
        <div className="history-filter__ranges">
          {ranges.map((range) => <label key={range.label} className={`history-filter__range${filters.since === range.since ? " history-filter__range--active" : ""}`}>
            <input
              className="visually-hidden"
              type="radio"
              name="history-filter-date"
              checked={filters.since === range.since}
              onChange={() => apply({ since: range.since })}
            />
            <span>{range.label}</span>
          </label>)}
        </div>
      </fieldset>

      <div className="history-filter__group">
        <label className="history-filter__label" htmlFor="history-filter-path">{t.historyFilterPathLabel}</label>
        <div className="history-filter__field">
          <Folder aria-hidden="true" />
          <input
            id="history-filter-path"
            type="text"
            value={pathDraft}
            placeholder={t.historyFilterPathPlaceholder}
            onChange={(event) => setPathDraft(event.target.value)}
            onBlur={() => commitText("path", pathDraft)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitText("path", pathDraft); } }}
          />
        </div>
      </div>

      <div className="history-filter__group">
        <label className="history-filter__switch">
          <input className="app-checkbox" type="checkbox" checked={filters.noMerges} onChange={(event) => apply({ noMerges: event.target.checked })} />
          <GitMerge aria-hidden="true" />
          <span>{t.historyFilterHideMerges}</span>
        </label>
        {canFilterPublication && <label className="history-filter__switch">
          <input className="app-checkbox" type="checkbox" checked={filters.unpublishedOnly} onChange={(event) => apply({ unpublishedOnly: event.target.checked })} />
          <HardDrive aria-hidden="true" />
          <span>{t.historyFilterUnpublishedOnly}</span>
        </label>}
      </div>

      {/* What is on, and the one way to end all of it — a count beside its own
          undo, rather than a button spanning the panel for a state that is
          usually empty. */}
      <footer className="history-filter__footer">
        <span>{active > 0 ? t.historyFiltersActiveCount(active) : ""}</span>
        <button
          className="ghost-button"
          type="button"
          disabled={active === 0}
          onClick={() => onChange(NO_HISTORY_FILTERS)}
        >
          {t.historyFiltersClear}
        </button>
      </footer>
    </div>}
  </div>;
}

function HistoryDetail({ state, formats, onSelectFile, onRetryDetail, onRetryDiff, onBack, readImagePreview, sourceKey }: {
  state: HistoryState; formats: LocaleFormats; onSelectFile: (path: string) => void; onRetryDetail: () => void; onRetryDiff: () => void; onBack: () => void; readImagePreview: ImagePreviewLoader; sourceKey: string;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<HistoryTab>("diff");
  const [fileSearch, setFileSearch] = useState("");
  const [diffSearch, setDiffSearch] = useState("");
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");
  const [hunkTarget, setHunkTarget] = useState({ index: 0, token: 0 });
  const [copiedPath, setCopiedPath] = useState(false);
  const [contextMenu, setContextMenu] = useState<ChangesContextMenuState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const selectedVersion = state.versions.find((version) => version.commit === state.selectedCommit) ?? null;

  useEffect(() => { setFileSearch(""); setDiffSearch(""); setContextMenu(null); }, [state.selectedCommit]);
  useEffect(() => setHunkTarget({ index: 0, token: 0 }), [state.selectedFilePath]);
  const picture = usePictureDiff(state.fileDiff.diff, sourceKey, readImagePreview);
  // The reading-mode picker lays out lines; a drawing has none.
  const showsReadingMode = picture === null || (picture.isSvg && !picture.showsDrawing);

  if (state.detail.isLoading) return <section className="history-detail history-detail--loading" aria-labelledby="history-detail-title" aria-busy="true">{selectedVersion && <div className="history-detail__loading-title"><h2 id="history-detail-title">{versionTitle(selectedVersion, t)}</h2></div>}<div className="history-detail__loading"><LoadingBar label={t.historyDetailLoading} /><p>{t.historyDetailLoading}</p></div></section>;
  if (state.detail.error) return <section className="history-detail history-detail--state" role="alert"><CircleAlert /><h2>{t.historyDetailError}</h2><button className="secondary-button" type="button" onClick={onRetryDetail}>{t.historyRetry}</button></section>;
  const detail = state.detail.detail;
  if (!detail) return <section className="history-detail history-detail--state"><p>{t.historySelectFilePrompt}</p></section>;

  const normalizedFileSearch = fileSearch.trim().toLocaleLowerCase();
  const visibleFiles = detail.files.filter((file) => !normalizedFileSearch || file.path.toLocaleLowerCase().includes(normalizedFileSearch));
  const comparison = detail.comparisonIsEmptyTree ? t.historyRootComparison : detail.comparisonIsFirstParent ? t.historyMergeComparison : t.historyNormalComparison;
  const fileCount = detail.countsAreMinimum ? t.historyChangedFilesMinimum(detail.fileCounts.total) : t.historyChangedFiles(detail.fileCounts.total);
  const totals = diffTotals(state.fileDiff.diff);
  const hunkCount = diffHunkCount(state.fileDiff.diff);
  const selectedFile = detail.files.find((file) => file.path === state.selectedFilePath) ?? null;
  // Stepped through the list as it is filtered, not through every changed file
  // in the version: the arrows move the same selection the pane beside them
  // shows, and a search that narrows that pane narrows what they walk.
  const fileIndex = visibleFiles.findIndex((file) => file.path === state.selectedFilePath);
  const selectFileAt = (index: number): void => {
    const file = visibleFiles[index];
    if (file) onSelectFile(file.path);
  };
  const goToHunk = (index: number): void => setHunkTarget((current) => ({ index, token: current.token + 1 }));
  const copySelectedPath = (): void => {
    if (!state.selectedFilePath) return;
    void navigator.clipboard.writeText(state.selectedFilePath).then(() => { setCopiedPath(true); window.setTimeout(() => setCopiedPath(false), 1_500); }).catch(() => undefined);
  };
  const closeContextMenu = (restoreFocus: boolean): void => {
    if (restoreFocus) contextMenu?.focusTarget?.focus();
    setContextMenu(null);
  };
  const openCodeContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    const source = event.target instanceof Element ? event.target.closest<HTMLElement>(".diff-code") : null;
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    const selection = window.getSelection();
    const belongsToDiff = selection?.anchorNode && selection.focusNode
      ? source.contains(selection.anchorNode) && source.contains(selection.focusNode)
      : false;
    setContextMenu({
      kind: "copy",
      x: event.clientX,
      y: event.clientY,
      text: belongsToDiff ? selection?.toString() ?? "" : "",
      focusTarget: source,
    });
  };
  const openFileFromOverview = (path: string): void => {
    onSelectFile(path);
    setActiveTab("diff");
  };

  const fileSearchControl = <SearchBox className="history-files-search" value={fileSearch} onChange={setFileSearch} placeholder={t.historyFilterFilesPlaceholder} ariaLabel={t.historyFilterFilesAriaLabel} clearLabel={t.commonClearSearch} />;
  const fileList = visibleFiles.length ? <ChangedFiles files={visibleFiles} selectedPath={state.selectedFilePath} onSelect={onSelectFile} /> : <p className="history-files__empty">{normalizedFileSearch ? t.historyNoFileMatches : t.historyNoChangedFiles}</p>;

  return <section className="history-detail" aria-labelledby="history-detail-title">
    <button className="history-detail__back secondary-button" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />{t.historyBackToTimeline}</button>
    {/* One card: identity, the tabs that cut it, and whichever of them is
        open. The back button stays outside it — it leaves the card rather
        than acting on it. */}
    <div className="history-detail__card">
    <HistoryDetailHeader detail={detail} formats={formats} activeTab={activeTab} onTab={setActiveTab} />
    {activeTab === "overview" && <HistoryOverview detail={detail} state={state} formats={formats} comparison={comparison} onSelectFile={openFileFromOverview} />}
    {activeTab === "diff" && <div id="history-panel-diff" className="history-workspace history-workspace--diff" role="tabpanel" aria-labelledby="history-tab-diff">
      <header className="history-workspace__toolbar"><div className="history-change-summary"><strong>{fileCount}</strong>{totals && <><span className="history-lines-added">+{totals.added}</span><span className="history-lines-removed">−{totals.removed}</span></>}</div><div className="history-diff-controls"><SearchBox className="history-diff-search" value={diffSearch} onChange={setDiffSearch} placeholder={t.historySearchDiffPlaceholder} ariaLabel={t.historySearchDiffAriaLabel} clearLabel={t.commonClearSearch} />{picture?.hasControls && <PictureDiffControls picture={picture} t={t} />}{showsReadingMode && <DiffViewSelector value={viewMode} onChange={setViewMode} t={t} />}</div></header>
      <div className="history-diff-grid"><aside className="history-files-pane">{fileSearchControl}{fileList}</aside><div className="history-diff-pane"><header className="history-diff-pane__header">{selectedFile ? <><span className="history-file__type" aria-hidden="true">{React.createElement(getFileTypeIcon(selectedFile.path))}</span><strong>{splitPath(selectedFile.path).name}</strong><span>{splitPath(selectedFile.path).dir}</span><button className="history-icon-button" type="button" aria-label={copiedPath ? t.historyFilePathCopied : t.historyCopyFilePath} data-tooltip={copiedPath ? t.historyFilePathCopied : t.historyCopyFilePath} onClick={copySelectedPath}>{copiedPath ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button></> : <span>{t.historySelectFilePrompt}</span>}
        {/* The same two pairs the Changes diff header carries, in the same
            place and the same shape. They used to be a footer of labelled
            buttons under the diff — a second vocabulary for one job, and the
            only control in the app sized below the scale. */}
        <div className="history-diff-pane__controls">
          {visibleFiles.length > 0 && <DiffStepNav kind="file" position={fileIndex + 1} total={visibleFiles.length} onPrevious={() => selectFileAt(fileIndex - 1)} onNext={() => selectFileAt(fileIndex + 1)} t={t} />}
          {hunkCount > 0 && viewMode !== "accessible" && <DiffStepNav kind="hunk" position={hunkTarget.index + 1} total={hunkCount} onPrevious={() => goToHunk(hunkTarget.index - 1)} onNext={() => goToHunk(hunkTarget.index + 1)} t={t} />}
        </div></header>
        <div className="history-detail__diff" onContextMenu={openCodeContextMenu}>{state.fileDiff.isLoading && <div className="history-diff-state" aria-busy="true"><LoadingBar label={t.historyDiffLoading} /><p>{t.historyDiffLoading}</p></div>}{state.fileDiff.error !== null && <div className="history-diff-state" role="alert"><p>{t.historyDiffError}</p><button className="secondary-button" type="button" onClick={onRetryDiff}>{t.historyRetry}</button></div>}{state.fileDiff.diff && <DiffResultView diff={state.fileDiff.diff} viewMode={viewMode} hunkTarget={hunkTarget} searchQuery={diffSearch} picture={picture} t={t} />}{!state.fileDiff.isLoading && !state.fileDiff.error && !state.fileDiff.diff && detail.files.length > 0 && <p className="history-diff-state">{t.historySelectFilePrompt}</p>}</div>
      </div></div>
    </div>}
    </div>
    <span className="visually-hidden" role="status">{announcement}</span>
    <ChangesContextMenu context={contextMenu} onClose={closeContextMenu} onCopied={() => setAnnouncement(t.changesCopied)} onDiscard={() => undefined} t={t} />
  </section>;
}

export function HistoryPanel({ controller, query, state, watcherState, onOpenSettings, error }: { controller: HistoryController; query: HistoryQuery; state: HistoryState; watcherState: "starting" | "watching" | "off" | "unavailable"; onOpenSettings: () => void; error: string | null }): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [showNarrowDetail, setShowNarrowDetail] = useState(false);
  const [search, setSearch] = useState("");
  const warnings = state.snapshot?.warnings ?? [];
  // "Has this left my machine yet?" is only answerable against a place it
  // could have gone. Without an upstream every version reads `unknown`, so the
  // switch would empty the list and call it a filter; the screen already says
  // the upstream is unknown in a banner of its own.
  const canFilterPublication = Boolean(state.snapshot?.upstream);
  // The filters are answered by Git over the whole history. This is the search
  // box only, and it is deliberately a different thing: a quick find over the
  // rows on screen, across everything a row shows rather than the message
  // alone. The count beside the title says which of the two is narrowing.
  const visibleVersions = useMemo(() => {
    const queryText = search.trim().toLocaleLowerCase();
    if (!queryText) return state.versions;
    return state.versions.filter((version) =>
      [version.subject, version.description, version.author?.name ?? "", version.shortCommit, ...version.decorations.map((item) => item.name)].some((value) => value.toLocaleLowerCase().includes(queryText)));
  }, [search, state.versions]);
  // Names taken from what is loaded, offered as completions to a field that
  // still asks Git about every version — a shortcut, never a limit.
  const authorSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const version of state.versions) {
      const name = version.author?.name.trim();
      if (name) names.add(name);
    }
    return [...names].sort((left, right) => left.localeCompare(right)).slice(0, 40);
  }, [state.versions]);
  const refreshHistory = useCallback(() => { void controller.refresh(query); }, [controller, query]);
  const loadMore = useCallback(() => { void controller.loadMore(query); }, [controller, query]);
  const selectVersion = useCallback((commit: string) => controller.selectVersion(query, commit), [controller, query]);
  const selectFile = useCallback((path: string) => controller.selectFile(query, path), [controller, query]);
  const retryDetail = useCallback(() => controller.retryDetail(query), [controller, query]);
  const retryDiff = useCallback(() => controller.retryFileDiff(query), [controller, query]);
  // A picture is read from the selected saved version and its parent, so the
  // loader carries the commit rather than the snapshot token the text diff
  // uses. A file can only be open once a version is selected.
  const selectedCommit = state.selectedCommit;
  const readImagePreview = useCallback<ImagePreviewLoader>(
    (filePath, originalPath) =>
      selectedCommit === null
        ? // Unreachable through the UI, and stated rather than papered over:
          // an empty commit-ish makes `:path` — which Git resolves to the
          // *index* — so this must never be sent as one.
          Promise.reject(new Error("no saved version is selected"))
        : controller.readImagePreview(query, selectedCommit, filePath, originalPath),
    [controller, query, selectedCommit],
  );
  const saveScrollOffset = useCallback((offset: number) => controller.setScrollOffset(query, offset), [controller, query]);
  const applyFilters = useCallback((filters: HistoryFilters) => { void controller.setFilters(query, filters); }, [controller, query]);
  const filtersActive = search.trim().length > 0 || countActiveFilters(state.filters) > 0;

  const openNarrowDetail = useCallback(() => setShowNarrowDetail(true), []);
  const closeNarrowDetail = useCallback(() => setShowNarrowDetail(false), []);

  if (!state.snapshot && state.isLoading) return <div className="history-screen"><div className="empty-state" aria-busy="true"><LoadingBar label={t.historyLoading} /><h1>{t.historyTitle}</h1><p>{t.historyLoading}</p></div></div>;
  if (!state.snapshot && error) return <div className="history-screen"><div className="empty-state empty-state--error" role="alert"><div className="empty-state__icon" aria-hidden="true"><CircleAlert /></div><h1>{t.historyErrorTitle}</h1><p>{error}</p><div className="empty-state__actions"><button className="secondary-button" type="button" onClick={refreshHistory}>{t.historyRetry}</button></div></div></div>;
  // "No saved versions yet" is a fact about the repository, and one this
  // screen may only state when it is not in the middle of asking. A filter
  // that matches nothing is a fact about the filter and belongs in the list
  // beside the way to undo it; an empty list with a read in flight is not a
  // fact about anything yet.
  //
  // Both halves were learned the hard way. Without the filter clause this
  // swallowed the whole screen the instant a filter was applied. Without the
  // loading clause it swallowed it again on Clear all — the filters are off by
  // then, and the empty list still on screen is the answer to the question
  // that was just retired.
  if (state.snapshot && state.versions.length === 0 && !filtersActive && !state.isLoading) return <div className="history-screen"><div className="history-notices"><HistoryWatchingNotice watcherState={watcherState} busy={state.isLoading} onRefresh={refreshHistory} onOpenSettings={onOpenSettings} /></div><div className="empty-state"><div className="empty-state__icon" aria-hidden="true"><GitCommitHorizontal /></div><h2>{t.historyNoVersionsTitle}</h2><p>{t.historyNoVersionsDescription}</p></div></div>;

  return <div className={`history-screen${showNarrowDetail ? " history-screen--narrow-detail" : ""}`}>
    <div className="history-notices">
      <HistoryWatchingNotice watcherState={watcherState} busy={state.isLoading} onRefresh={refreshHistory} onOpenSettings={onOpenSettings} />
      {state.staleNotice && <HistoryBanner tone="neutral" title={t.historyStaleNotice}>{t.historyLoadedCount(state.versions.length)}</HistoryBanner>}
      {state.snapshot && error && <HistoryBanner tone="danger" title={t.historyErrorTitle} action={<button className="secondary-button" type="button" onClick={refreshHistory}>{t.historyRetry}</button>}>{error}</HistoryBanner>}
      {state.selectionRemoved && <p className="history-announcement" role="status">{t.historySelectionRemoved}</p>}
      {state.snapshot?.shallow && <HistoryBanner tone="warning" title={t.historyShallowTitle}>{t.historyShallowDescription}</HistoryBanner>}
      {state.snapshot?.headState === "detached" && <HistoryBanner tone="warning" title={t.historyDetachedTitle}>{t.historyDetachedDescription}</HistoryBanner>}
      {!state.snapshot?.upstream && state.snapshot?.headState === "branch" && <HistoryBanner tone="neutral" title={t.historyUnknownUpstreamTitle}>{t.historyUnknownUpstreamDescription}</HistoryBanner>}
      {warnings.includes("unreadableMetadata") && <p className="history-meta-warning" role="status">{t.historyUnreadableMetadata}</p>}
      {(warnings.includes("messagesTruncated") || warnings.includes("decorationsTruncated")) && <p className="history-meta-warning" role="status">{t.historyTruncatedMetadata}</p>}
      {state.clientTruncated && <p className="history-meta-warning" role="status">{t.historyClientLimit(formatNumber(MAX_HISTORY_ROWS, formats))}</p>}
    </div>
    {/* Title and state on one line, as on Changes: the count is a caption for
        the word beside it, and it describes the screen rather than the column
        it used to sit inside. */}
    <header className="history-view__header">
      <div className="history-view__heading">
        <h1>{t.historyTitle}</h1>
        <p>{filtersActive ? t.historyFilteredCount(visibleVersions.length, state.versions.length) : t.historyLoadedCount(state.versions.length)}</p>
      </div>
    </header>
    <div className="history-layout">
      <HistoryTimeline key={showNarrowDetail ? "detail-open" : "timeline-open"} versions={visibleVersions} selectedCommit={state.selectedCommit} scrollOffset={state.scrollOffset} isLoading={state.isLoading} hasMore={state.snapshot?.hasMore ?? false} isLoadingMore={state.isLoadingMore} hasMoreError={state.moreError !== null} clientTruncated={state.clientTruncated} formats={formats} currentBranch={state.snapshot?.branch ?? null} search={search} filters={state.filters} authorSuggestions={authorSuggestions} canFilterPublication={canFilterPublication} onSearch={setSearch} onFilters={applyFilters} onSelect={selectVersion} onLoadMore={loadMore} onScrollOffset={saveScrollOffset} onOpenDetail={openNarrowDetail} />
      <HistoryDetail state={state} formats={formats} onSelectFile={selectFile} onRetryDetail={retryDetail} onRetryDiff={retryDiff} onBack={closeNarrowDetail} readImagePreview={readImagePreview} sourceKey={`${query.projectId}\0${query.sessionEpoch}\0${selectedCommit ?? ""}`} />
    </div>
  </div>;
}

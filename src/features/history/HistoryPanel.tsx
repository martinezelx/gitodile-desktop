import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CircleAlert, Cloud, CloudOff,
  CalendarDays, ChevronDown, Copy, Folder, GitBranch,
  GitCommitHorizontal, HardDrive, Info, ListFilter, Search,
  Tag, UserRound,
} from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { getFileTypeIcon } from "../../shared/file-icons";
import { formatNumber, type LocaleFormats } from "../../shared/i18n";
import { AutomaticUpdatesNotice, autoHideScrollbarProps, handlePopupMenuKeyDown, LoadingBar, useAnchoredPopup } from "../../shared/ui";
import { ChangesContextMenu, DiffResultView, DiffViewSelector, PictureDiffControls, usePictureDiff, type ChangesContextMenuState, type DiffViewMode, type FileDiff, type ImagePreviewLoader } from "../changes";
import { CHANGE_CATEGORY_ICONS, splitPath, type ChangeCategory } from "../status";
import { MAX_HISTORY_ROWS, type HistoryController } from "./controller";
import type { HistoryFileChange, HistoryState, PublicationState, SavedVersionDetail, SavedVersionSummary } from "./domain";
import { formatHistoryDate } from "./formatHistoryDate";
import { decorationLabel, HistoryMetaDot, HistoryRefBadge, primaryDecoration } from "./HistoryRefBadge";
import type { HistoryQuery } from "./port";

const CATEGORY_LABEL_KEYS = {
  changed: "changesCategoryLabelChanged", new: "changesCategoryLabelNew",
  deleted: "changesCategoryLabelDeleted", renamed: "changesCategoryLabelRenamed",
  conflicted: "changesCategoryLabelConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

type HistoryTab = "overview" | "diff";
type PublicationFilter = "all" | PublicationState;
type HistorySort = "newest" | "oldest";

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

const TimelineRow = React.memo(function TimelineRow({ version, index, first, last, selected, selectionDirection, hoverDirection, focusable, formats, currentBranch, onSelect, onMove, onHover, onOpenDetail }: {
  version: SavedVersionSummary; index: number; first: boolean; last: boolean; selected: boolean; selectionDirection: "up" | "down"; hoverDirection: "up" | "down" | null; focusable: boolean; formats: LocaleFormats; currentBranch: string | null; onSelect: (commit: string) => void; onMove: (index: number) => void; onHover: (index: number) => void; onOpenDetail: () => void;
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
    <button id={`history-version-${version.commit}`} className={`history-row${selected ? " history-row--selected" : ""}`} type="button" role="option" aria-selected={selected} aria-label={label} tabIndex={focusable ? 0 : -1} data-first={first || undefined} data-last={last || undefined} data-selection-direction={selected ? selectionDirection : undefined} data-hover-direction={hoverDirection ?? undefined} onPointerEnter={() => onHover(index)} onFocus={() => onHover(index)} onClick={() => { onSelect(version.commit); onOpenDetail(); }} onKeyDown={handleKeyDown}>
      <span className="history-row__node" aria-hidden="true" />
      <span className="history-row__body"><span className="history-row__title" title={title}>{title}</span><span className="history-row__meta"><span className="history-row__author" title={author}>{author}</span><HistoryRefBadge version={version} currentBranch={currentBranch} />{date && <><HistoryMetaDot /><span className="history-row__date" title={t.historyVersionDate(date.absolute)}>{date.relative}</span></>}</span></span>
    </button>
  );
});

const HistoryTimeline = React.memo(function HistoryTimeline({ versions, loadedCount, selectedCommit, scrollOffset, hasMore, isLoadingMore, hasMoreError, clientTruncated, formats, currentBranch, search, publicationFilter, sort, onSearch, onPublicationFilter, onSort, onSelect, onLoadMore, onScrollOffset, onOpenDetail }: {
  versions: SavedVersionSummary[]; loadedCount: number; selectedCommit: string | null; scrollOffset: number; hasMore: boolean; isLoadingMore: boolean; hasMoreError: boolean; clientTruncated: boolean; formats: LocaleFormats; currentBranch: string | null; search: string; publicationFilter: PublicationFilter; sort: HistorySort;
  onSearch: (value: string) => void; onPublicationFilter: (value: PublicationFilter) => void; onSort: (value: HistorySort) => void; onSelect: (commit: string) => void; onLoadMore: () => void; onScrollOffset: (offset: number) => void; onOpenDetail: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSelectedCommitRef = useRef(selectedCommit);
  const previousHoveredIndexRef = useRef(-1);
  const [hoverTravel, setHoverTravel] = useState<{ index: number; direction: "up" | "down" }>({ index: -1, direction: "down" });
  const focusCommit = versions.some((version) => version.commit === selectedCommit) ? selectedCommit : versions[0]?.commit ?? null;
  const selectedIndex = versions.findIndex((version) => version.commit === selectedCommit);
  const previousSelectedIndex = versions.findIndex((version) => version.commit === previousSelectedCommitRef.current);
  const selectionDirection = previousSelectedIndex >= 0 && selectedIndex >= 0 && selectedIndex < previousSelectedIndex ? "up" : "down";
  const virtualizer = useVirtualizer({ count: versions.length, getScrollElement: () => scrollRef.current, estimateSize: () => 80, overscan: 6, getItemKey: (index) => versions[index]?.commit ?? index });
  const rows = virtualizer.getVirtualItems();
  const lastIndex = rows.at(-1)?.index ?? -1;

  useLayoutEffect(() => {
    if (restoredRef.current || !scrollRef.current || search || publicationFilter !== "all" || sort !== "newest") return;
    scrollRef.current.scrollTop = scrollOffset;
    restoredRef.current = true;
  }, [publicationFilter, scrollOffset, search, sort]);

  useLayoutEffect(() => { previousSelectedCommitRef.current = selectedCommit; }, [selectedCommit]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const save = (): void => { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => onScrollOffset(element.scrollTop), 120); };
    element.addEventListener("scroll", save, { passive: true });
    return () => { element.removeEventListener("scroll", save); if (saveTimer.current) clearTimeout(saveTimer.current); if (!search && publicationFilter === "all" && sort === "newest") onScrollOffset(element.scrollTop); };
  }, [onScrollOffset, publicationFilter, search, sort]);

  useEffect(() => {
    const isNaturalTimeline = !search && publicationFilter === "all" && sort === "newest";
    if (isNaturalTimeline && lastIndex >= versions.length - 18 && hasMore && !isLoadingMore) onLoadMore();
  }, [hasMore, isLoadingMore, lastIndex, onLoadMore, publicationFilter, search, sort, versions.length]);

  const moveSelection = useCallback((target: number): void => {
    const index = Math.max(0, Math.min(target, versions.length - 1));
    const version = versions[index];
    if (!version) return;
    onSelect(version.commit);
    virtualizer.scrollToIndex(index, { align: "auto" });
    requestAnimationFrame(() => document.getElementById(`history-version-${version.commit}`)?.focus());
  }, [onSelect, versions, virtualizer]);
  const markHoverDirection = useCallback((index: number): void => {
    const previous = previousHoveredIndexRef.current;
    const direction = previous >= 0 && index < previous ? "up" : "down";
    previousHoveredIndexRef.current = index;
    setHoverTravel({ index, direction });
  }, []);
  const filtersActive = search.trim().length > 0 || publicationFilter !== "all";
  return (
    <section className="history-timeline" aria-label={t.historyTimelineAriaLabel}>
      <header className="history-timeline__header">
        <div className="history-timeline__heading"><div><h1>{t.historyTitle}</h1><p>{filtersActive ? t.historyFilteredCount(versions.length, loadedCount) : t.historyLoadedCount(loadedCount)}</p></div></div>
        <div className="history-timeline__tools">
          <HistoryFilterMenu label={t.historyPublicationFilterLabel} value={publicationFilter} options={[
            { value: "all", label: t.historyFilterAll, icon: <ListFilter aria-hidden="true" /> },
            { value: "published", label: t.historyFilterPublished, icon: <Cloud aria-hidden="true" /> },
            { value: "local-only", label: t.historyFilterLocalOnly, icon: <HardDrive aria-hidden="true" /> },
            { value: "unknown", label: t.historyFilterUnknown, icon: <CloudOff aria-hidden="true" /> },
          ]} onChange={(value) => onPublicationFilter(value as PublicationFilter)} />
          <HistoryFilterMenu label={t.historySortLabel} value={sort} options={[
            { value: "newest", label: t.historySortNewest, icon: <ArrowDown aria-hidden="true" /> },
            { value: "oldest", label: t.historySortOldest, icon: <ArrowUp aria-hidden="true" /> },
          ]} onChange={(value) => onSort(value as HistorySort)} />
        </div>
        <label className="history-search-box"><Search aria-hidden="true" /><input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.historySearchPlaceholder} aria-label={t.historySearchAriaLabel} /></label>
      </header>
      <div {...autoHideScrollbarProps<HTMLDivElement>()} ref={scrollRef} className="history-timeline__scroll auto-hide-scrollbar" role="listbox" aria-label={t.historyTimelineAriaLabel}>
        {versions.length ? <div className="history-timeline__virtual" style={{ height: virtualizer.getTotalSize() }}>
          {rows.map((virtualRow) => { const version = versions[virtualRow.index]; return <div key={virtualRow.key} className="history-timeline__virtual-row" style={{ transform: `translateY(${virtualRow.start}px)` }}><TimelineRow version={version} index={virtualRow.index} first={virtualRow.index === 0} last={virtualRow.index === versions.length - 1} selected={version.commit === selectedCommit} selectionDirection={selectionDirection} hoverDirection={hoverTravel.index === virtualRow.index ? hoverTravel.direction : null} focusable={version.commit === focusCommit} formats={formats} currentBranch={currentBranch} onSelect={onSelect} onMove={moveSelection} onHover={markHoverDirection} onOpenDetail={onOpenDetail} /></div>; })}
        </div> : <p className="history-timeline__empty">{t.historyNoMatches}</p>}
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

function HistoryFilterMenu({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; icon: React.ReactNode }>;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { containerRef, popupRef: menuRef } = useAnchoredPopup(isOpen, triggerRef, closeMenu, "selected-menu-item");
  const selected = options.find((option) => option.value === value) ?? options[0];

  return <div className="history-filter-menu" ref={containerRef}>
    <button ref={triggerRef} className="history-filter-menu__trigger" type="button" aria-haspopup="menu" aria-expanded={isOpen} aria-label={`${label}: ${selected.label}`} data-tooltip={`${label}: ${selected.label}`} onClick={() => setIsOpen((open) => !open)}>
      <span className="history-filter-menu__icon" aria-hidden="true">{selected.icon}</span>
      <span className="history-filter-menu__copy"><small>{label}</small><strong>{selected.label}</strong></span>
      <ChevronDown className="history-filter-menu__chevron" aria-hidden="true" />
    </button>
    {isOpen && <div ref={menuRef} className="app-menu history-filter-menu__menu" role="menu" aria-label={label} onKeyDown={(event) => handlePopupMenuKeyDown(event, menuRef.current, () => closeMenu(false))}>
      {options.map((option) => <button key={option.value} className={`app-menu__item${option.value === value ? " app-menu__item--selected" : ""}`} type="button" role="menuitemradio" tabIndex={-1} aria-checked={option.value === value} onClick={() => { closeMenu(false); onChange(option.value); triggerRef.current?.focus(); }}>
        {option.icon}<span>{option.label}</span>{option.value === value && <Check className="app-menu__check" aria-hidden="true" />}
      </button>)}
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

  const fileSearchControl = <label className="history-search-box history-search-box--files"><Search aria-hidden="true" /><input type="search" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder={t.historyFilterFilesPlaceholder} aria-label={t.historyFilterFilesAriaLabel} /></label>;
  const fileList = visibleFiles.length ? <ChangedFiles files={visibleFiles} selectedPath={state.selectedFilePath} onSelect={onSelectFile} /> : <p className="history-files__empty">{normalizedFileSearch ? t.historyNoFileMatches : t.historyNoChangedFiles}</p>;

  return <section className="history-detail" aria-labelledby="history-detail-title">
    <button className="history-detail__back secondary-button" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />{t.historyBackToTimeline}</button>
    <HistoryDetailHeader detail={detail} formats={formats} activeTab={activeTab} onTab={setActiveTab} />
    {activeTab === "overview" && <HistoryOverview detail={detail} state={state} formats={formats} comparison={comparison} onSelectFile={openFileFromOverview} />}
    {activeTab === "diff" && <div id="history-panel-diff" className="history-workspace history-workspace--diff" role="tabpanel" aria-labelledby="history-tab-diff">
      <header className="history-workspace__toolbar"><div className="history-change-summary"><strong>{fileCount}</strong>{totals && <><span className="history-lines-added">+{totals.added}</span><span className="history-lines-removed">−{totals.removed}</span></>}</div><div className="history-diff-controls"><label className="history-search-box history-search-box--diff"><Search aria-hidden="true" /><input type="search" value={diffSearch} onChange={(event) => setDiffSearch(event.target.value)} placeholder={t.historySearchDiffPlaceholder} aria-label={t.historySearchDiffAriaLabel} /></label>{picture?.hasControls && <PictureDiffControls picture={picture} t={t} />}{showsReadingMode && <DiffViewSelector value={viewMode} onChange={setViewMode} t={t} />}</div></header>
      <div className="history-diff-grid"><aside className="history-files-pane">{fileSearchControl}{fileList}</aside><div className="history-diff-pane"><header className="history-diff-pane__header">{selectedFile ? <><span className="history-file__type" aria-hidden="true">{React.createElement(getFileTypeIcon(selectedFile.path))}</span><strong>{splitPath(selectedFile.path).name}</strong><span>{splitPath(selectedFile.path).dir}</span><button className="history-icon-button" type="button" aria-label={copiedPath ? t.historyFilePathCopied : t.historyCopyFilePath} data-tooltip={copiedPath ? t.historyFilePathCopied : t.historyCopyFilePath} onClick={copySelectedPath}>{copiedPath ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button></> : <span>{t.historySelectFilePrompt}</span>}</header>
        <div className="history-detail__diff" onContextMenu={openCodeContextMenu}>{state.fileDiff.isLoading && <div className="history-diff-state" aria-busy="true"><LoadingBar label={t.historyDiffLoading} /><p>{t.historyDiffLoading}</p></div>}{state.fileDiff.error !== null && <div className="history-diff-state" role="alert"><p>{t.historyDiffError}</p><button className="secondary-button" type="button" onClick={onRetryDiff}>{t.historyRetry}</button></div>}{state.fileDiff.diff && <DiffResultView diff={state.fileDiff.diff} viewMode={viewMode} hunkTarget={hunkTarget} searchQuery={diffSearch} picture={picture} t={t} />}{!state.fileDiff.isLoading && !state.fileDiff.error && !state.fileDiff.diff && detail.files.length > 0 && <p className="history-diff-state">{t.historySelectFilePrompt}</p>}</div>
        {hunkCount > 0 && viewMode !== "accessible" && <footer className="history-diff-pane__footer"><span>{t.changesHunkPosition(hunkTarget.index + 1, hunkCount)}</span><div><button className="secondary-button" type="button" disabled={hunkTarget.index <= 0} onClick={() => goToHunk(hunkTarget.index - 1)}><ArrowUp aria-hidden="true" />{t.changesPreviousHunk}</button><button className="secondary-button" type="button" disabled={hunkTarget.index >= hunkCount - 1} onClick={() => goToHunk(hunkTarget.index + 1)}>{t.changesNextHunk}<ArrowDown aria-hidden="true" /></button></div></footer>}
      </div></div>
    </div>}
    <span className="visually-hidden" role="status">{announcement}</span>
    <ChangesContextMenu context={contextMenu} onClose={closeContextMenu} onCopied={() => setAnnouncement(t.changesCopied)} onDiscard={() => undefined} t={t} />
  </section>;
}

export function HistoryPanel({ controller, query, state, watcherState, onOpenSettings, error }: { controller: HistoryController; query: HistoryQuery; state: HistoryState; watcherState: "starting" | "watching" | "off" | "unavailable"; onOpenSettings: () => void; error: string | null }): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [showNarrowDetail, setShowNarrowDetail] = useState(false);
  const [search, setSearch] = useState("");
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>("all");
  const [sort, setSort] = useState<HistorySort>("newest");
  const warnings = state.snapshot?.warnings ?? [];
  const visibleVersions = useMemo(() => {
    const queryText = search.trim().toLocaleLowerCase();
    const filtered = state.versions.filter((version) => {
      if (publicationFilter !== "all" && version.publication !== publicationFilter) return false;
      if (!queryText) return true;
      return [version.subject, version.description, version.author?.name ?? "", version.shortCommit, ...version.decorations.map((item) => item.name)].some((value) => value.toLocaleLowerCase().includes(queryText));
    });
    return sort === "newest" ? filtered : [...filtered].reverse();
  }, [publicationFilter, search, sort, state.versions]);
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
  const openNarrowDetail = useCallback(() => setShowNarrowDetail(true), []);
  const closeNarrowDetail = useCallback(() => setShowNarrowDetail(false), []);

  if (!state.snapshot && state.isLoading) return <div className="history-screen"><div className="empty-state" aria-busy="true"><LoadingBar label={t.historyLoading} /><h1>{t.historyTitle}</h1><p>{t.historyLoading}</p></div></div>;
  if (!state.snapshot && error) return <div className="history-screen"><div className="empty-state empty-state--error" role="alert"><div className="empty-state__icon" aria-hidden="true"><CircleAlert /></div><h1>{t.historyErrorTitle}</h1><p>{error}</p><div className="empty-state__actions"><button className="secondary-button" type="button" onClick={refreshHistory}>{t.historyRetry}</button></div></div></div>;
  if (state.snapshot && state.versions.length === 0) return <div className="history-screen"><div className="history-notices"><HistoryWatchingNotice watcherState={watcherState} busy={state.isLoading} onRefresh={refreshHistory} onOpenSettings={onOpenSettings} /></div><div className="empty-state"><div className="empty-state__icon" aria-hidden="true"><GitCommitHorizontal /></div><h2>{t.historyNoVersionsTitle}</h2><p>{t.historyNoVersionsDescription}</p></div></div>;

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
    <div className="history-layout">
      <HistoryTimeline key={showNarrowDetail ? "detail-open" : "timeline-open"} versions={visibleVersions} loadedCount={state.versions.length} selectedCommit={state.selectedCommit} scrollOffset={state.scrollOffset} hasMore={state.snapshot?.hasMore ?? false} isLoadingMore={state.isLoadingMore} hasMoreError={state.moreError !== null} clientTruncated={state.clientTruncated} formats={formats} currentBranch={state.snapshot?.branch ?? null} search={search} publicationFilter={publicationFilter} sort={sort} onSearch={setSearch} onPublicationFilter={setPublicationFilter} onSort={setSort} onSelect={selectVersion} onLoadMore={loadMore} onScrollOffset={saveScrollOffset} onOpenDetail={openNarrowDetail} />
      <HistoryDetail state={state} formats={formats} onSelectFile={selectFile} onRetryDetail={retryDetail} onRetryDiff={retryDiff} onBack={closeNarrowDetail} readImagePreview={readImagePreview} sourceKey={`${query.projectId}\0${query.sessionEpoch}\0${selectedCommit ?? ""}`} />
    </div>
  </div>;
}

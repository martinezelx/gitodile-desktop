import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Check, CircleAlert, Cloud, CloudOff,
  CalendarDays, ChevronDown, Columns2, Copy, FileText, Folder, GitBranch,
  GitCommitHorizontal, HardDrive, Info, ListFilter, RefreshCw, Rows3, Search,
  Tag, UserRound,
} from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { getFileTypeIcon } from "../../fileIcons";
import { autoHideScrollbarProps, LoadingBar } from "../../shared/ui";
import { DiffResultView, type DiffViewMode, type FileDiff } from "../changes";
import { CHANGE_CATEGORY_ICONS, splitPath, type ChangeCategory } from "../status";
import { MAX_HISTORY_ROWS, type HistoryController } from "./controller";
import type { HistoryFileChange, HistoryState, HistoryTimestamp, PublicationState, SavedVersionDetail, SavedVersionSummary } from "./domain";
import type { HistoryQuery } from "./port";

const CATEGORY_LABEL_KEYS = {
  changed: "changesCategoryLabelChanged", new: "changesCategoryLabelNew",
  deleted: "changesCategoryLabelDeleted", renamed: "changesCategoryLabelRenamed",
  conflicted: "changesCategoryLabelConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

type HistoryTab = "overview" | "files" | "diff";
type PublicationFilter = "all" | PublicationState;
type HistorySort = "newest" | "oldest";
type HistoryFileType = "all" | "code" | "docs" | "assets" | "config" | "other";
type HistoryFileStatus = "all" | ChangeCategory;
type HistoryFileSort = "path" | "status";

const CODE_EXTENSIONS = new Set(["c", "cc", "cpp", "cs", "css", "dart", "ex", "fs", "go", "h", "hpp", "html", "java", "js", "jsx", "kt", "lua", "php", "py", "r", "rb", "rs", "scss", "sh", "sql", "svelte", "swift", "ts", "tsx", "vue"]);
const DOC_EXTENSIONS = new Set(["md", "mdx", "pdf", "txt"]);
const ASSET_EXTENSIONS = new Set(["bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);
const CONFIG_EXTENSIONS = new Set(["json", "jsonc", "toml", "yaml", "yml", "ini", "cfg", "conf"]);

function historyFileType(path: string): Exclude<HistoryFileType, "all"> {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLocaleLowerCase() : "";
  if (CODE_EXTENSIONS.has(extension)) return "code";
  if (DOC_EXTENSIONS.has(extension) || path.startsWith("docs/") || path.startsWith("work/")) return "docs";
  if (ASSET_EXTENSIONS.has(extension)) return "assets";
  if (CONFIG_EXTENSIONS.has(extension) || name.startsWith(".") || /^(package|tsconfig|vite|cargo)/i.test(name)) return "config";
  return "other";
}

function changedAreas(files: HistoryFileChange[]): Array<{ path: string; count: number }> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const parts = file.path.split("/");
    const area = parts.length > 1 ? parts.slice(0, Math.min(parts.length - 1, 2)).join("/") : ".";
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()].map(([path, count]) => ({ path, count })).sort((left, right) => right.count - left.count || left.path.localeCompare(right.path)).slice(0, 5);
}

function dateFromTimestamp(timestamp: HistoryTimestamp | null): Date | null {
  if (!timestamp || !Number.isFinite(timestamp.unixSeconds)) return null;
  const date = new Date(timestamp.unixSeconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatHistoryDate(timestamp: HistoryTimestamp | null, language: string, now = Date.now()): { relative: string; absolute: string } | null {
  const date = dateFromTimestamp(timestamp);
  if (!date) return null;
  const deltaSeconds = Math.round((date.getTime() - now) / 1_000);
  const absolute = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
  const relativeFormatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60], ["month", 30 * 24 * 60 * 60], ["week", 7 * 24 * 60 * 60],
    ["day", 24 * 60 * 60], ["hour", 60 * 60], ["minute", 60],
  ];
  const [unit, seconds] = units.find(([, size]) => Math.abs(deltaSeconds) >= size) ?? ["second", 1];
  return { relative: relativeFormatter.format(Math.round(deltaSeconds / seconds), unit), absolute };
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

function publicationFilterCopy(filter: PublicationFilter, t: Translations): string {
  if (filter === "published") return t.historyFilterPublished;
  if (filter === "local-only") return t.historyFilterLocalOnly;
  if (filter === "unknown") return t.historyFilterUnknown;
  return t.historyFilterAll;
}

function nextPublicationFilter(filter: PublicationFilter): PublicationFilter {
  if (filter === "all") return "published";
  if (filter === "published") return "local-only";
  if (filter === "local-only") return "unknown";
  return "all";
}

function PublicationIcon({ publication }: { publication: PublicationState }): React.JSX.Element {
  if (publication === "published") return <Cloud aria-hidden="true" />;
  if (publication === "local-only") return <HardDrive aria-hidden="true" />;
  return <CloudOff aria-hidden="true" />;
}

function HistoryBanner({ tone, title, children }: { tone: "neutral" | "warning" | "danger"; title: string; children: React.ReactNode }): React.JSX.Element {
  return <section className={`history-banner history-banner--${tone}`}><CircleAlert aria-hidden="true" /><div><strong>{title}</strong><p>{children}</p></div></section>;
}

function TimelineRow({ version, index, first, last, selected, focusable, language, onSelect, onMove }: {
  version: SavedVersionSummary; index: number; first: boolean; last: boolean; selected: boolean; focusable: boolean; language: string; onSelect: () => void; onMove: (index: number) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const title = versionTitle(version, t);
  const date = formatHistoryDate(version.authoredAt, language);
  const author = version.author?.name.trim() || t.historyAuthorUnknown;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const target = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1
      : event.key === "Home" ? 0 : event.key === "End" ? Number.MAX_SAFE_INTEGER
        : event.key === "PageDown" ? index + 8 : event.key === "PageUp" ? index - 8 : null;
    if (target === null) return;
    event.preventDefault();
    onMove(target);
  };
  return (
    <button id={`history-version-${version.commit}`} className={`history-row${selected ? " history-row--selected" : ""}`} type="button" role="option" aria-selected={selected} aria-label={selected ? t.historySelectedVersion(title) : title} tabIndex={focusable ? 0 : -1} data-first={first || undefined} data-last={last || undefined} onClick={onSelect} onKeyDown={handleKeyDown}>
      <span className="history-row__node" aria-hidden="true" />
      <span className="history-row__body"><span className="history-row__title" title={title}>{title}</span><span className="history-row__meta"><span>{author}</span>{date && <span title={t.historyVersionDate(date.absolute)}>{date.relative}</span>}</span></span>
    </button>
  );
}

function HistoryTimeline({ state, versions, language, search, publicationFilter, sort, onSearch, onCycleFilter, onToggleSort, onSelect, onLoadMore, onScrollOffset, onOpenDetail }: {
  state: HistoryState; versions: SavedVersionSummary[]; language: string; search: string; publicationFilter: PublicationFilter; sort: HistorySort;
  onSearch: (value: string) => void; onCycleFilter: () => void; onToggleSort: () => void; onSelect: (commit: string) => void; onLoadMore: () => void; onScrollOffset: (offset: number) => void; onOpenDetail: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusCommit = versions.some((version) => version.commit === state.selectedCommit) ? state.selectedCommit : versions[0]?.commit ?? null;
  const virtualizer = useVirtualizer({ count: versions.length, getScrollElement: () => scrollRef.current, estimateSize: () => 84, measureElement: (element) => element.getBoundingClientRect().height, overscan: 8, getItemKey: (index) => versions[index]?.commit ?? index });
  const rows = virtualizer.getVirtualItems();
  const lastIndex = rows.at(-1)?.index ?? -1;

  useLayoutEffect(() => {
    if (restoredRef.current || !scrollRef.current || search || publicationFilter !== "all" || sort !== "newest") return;
    scrollRef.current.scrollTop = state.scrollOffset;
    restoredRef.current = true;
  }, [publicationFilter, search, sort, state.scrollOffset]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const save = (): void => { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => onScrollOffset(element.scrollTop), 120); };
    element.addEventListener("scroll", save, { passive: true });
    return () => { element.removeEventListener("scroll", save); if (saveTimer.current) clearTimeout(saveTimer.current); if (!search && publicationFilter === "all" && sort === "newest") onScrollOffset(element.scrollTop); };
  }, [onScrollOffset, publicationFilter, search, sort]);

  useEffect(() => { if (lastIndex >= versions.length - 6 && state.snapshot?.hasMore && !state.isLoadingMore) onLoadMore(); }, [lastIndex, onLoadMore, state.isLoadingMore, state.snapshot?.hasMore, versions.length]);

  const moveSelection = (target: number): void => {
    const index = Math.max(0, Math.min(target, versions.length - 1));
    const version = versions[index];
    if (!version) return;
    onSelect(version.commit);
    virtualizer.scrollToIndex(index, { align: "auto" });
    requestAnimationFrame(() => document.getElementById(`history-version-${version.commit}`)?.focus());
  };
  const filterCopy = publicationFilterCopy(publicationFilter, t);
  const sortCopy = sort === "newest" ? t.historySortNewest : t.historySortOldest;
  return (
    <section className="history-timeline" aria-label={t.historyTimelineAriaLabel}>
      <header className="history-timeline__header">
        <div className="history-timeline__heading"><div><h1>{t.historyTitle}</h1><p>{t.historyLoadedCount(state.versions.length)}</p></div><div className="history-timeline__tools">
          <button className={`history-icon-button${publicationFilter !== "all" ? " history-icon-button--active" : ""}`} type="button" aria-label={`${t.historyFilterAriaLabel}: ${filterCopy}`} data-tooltip={filterCopy} onClick={onCycleFilter}><ListFilter aria-hidden="true" /></button>
          <button className="history-icon-button" type="button" aria-label={sortCopy} data-tooltip={sortCopy} onClick={onToggleSort}><ArrowUpDown aria-hidden="true" /></button>
        </div></div>
        <label className="history-search-box"><Search aria-hidden="true" /><input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.historySearchPlaceholder} aria-label={t.historySearchAriaLabel} /></label>
      </header>
      <div {...autoHideScrollbarProps<HTMLDivElement>()} ref={scrollRef} className="history-timeline__scroll auto-hide-scrollbar" role="listbox" aria-label={t.historyTimelineAriaLabel}>
        {versions.length ? <div className="history-timeline__virtual" style={{ height: virtualizer.getTotalSize() }}>
          {rows.map((virtualRow) => { const version = versions[virtualRow.index]; return <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index} className="history-timeline__virtual-row" style={{ transform: `translateY(${virtualRow.start}px)` }}><TimelineRow version={version} index={virtualRow.index} first={virtualRow.index === 0} last={virtualRow.index === versions.length - 1} selected={version.commit === state.selectedCommit} focusable={version.commit === focusCommit} language={language} onSelect={() => { onSelect(version.commit); onOpenDetail(); }} onMove={moveSelection} /></div>; })}
        </div> : <p className="history-timeline__empty">{t.historyNoMatches}</p>}
        <div className="history-timeline__footer">
          {state.moreError !== null && <div className="history-inline-error" role="alert"><span>{t.historyMoreError}</span><button className="secondary-button" type="button" onClick={onLoadMore}>{t.historyRetry}</button></div>}
          {state.snapshot?.hasMore && !state.clientTruncated && <button className="secondary-button" type="button" disabled={state.isLoadingMore} onClick={onLoadMore}>{state.isLoadingMore && <RefreshCw className="spin" aria-hidden="true" />}{state.isLoadingMore ? t.historyLoadingMore : t.historyLoadMore}</button>}
        </div>
      </div>
    </section>
  );
}

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

function authorInitials(version: SavedVersionSummary, fallback: string): string {
  const name = version.author?.name.trim() || fallback;
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase();
}

function HistoryDetailHeader({ detail, language, activeTab, isRefreshing, onTab, onRefresh }: {
  detail: SavedVersionDetail; language: string; activeTab: HistoryTab; isRefreshing: boolean;
  onTab: (tab: HistoryTab) => void; onRefresh: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const version = detail.version;
  const title = versionTitle(version, t);
  const date = formatHistoryDate(version.authoredAt, language);
  const tabs: Array<{ id: HistoryTab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: "overview", label: t.historyOverviewTab, icon: <Info aria-hidden="true" /> },
    { id: "files", label: t.historyFilesTab, icon: <FileText aria-hidden="true" />, count: detail.fileCounts.total },
    { id: "diff", label: t.historyDiffTab, icon: <GitCommitHorizontal aria-hidden="true" /> },
  ];
  return <header className="history-detail__summary"><div className="history-detail__summary-top"><div className="history-detail__identity"><h2 id="history-detail-title">{title}</h2><div className="history-detail__compact-info"><p className="history-detail__meta"><span className="history-author-avatar" aria-hidden="true">{authorInitials(version, t.historyAuthorUnknown)}</span><strong>{version.author?.name || t.historyAuthorUnknown}</strong>{date && <span title={t.historyVersionDate(date.absolute)}>{date.relative}</span>}<code>{version.shortCommit}</code><span className={`history-publication history-publication--${version.publication}`}><PublicationIcon publication={version.publication} />{publicationCopy(version.publication, t)}</span></p>
    <div className="history-detail__badges">{version.isRoot && <span className="history-kind-chip">{t.historyRoot}</span>}{version.isMerge && <span className="history-kind-chip">{t.historyMerge}</span>}{version.decorations.slice(0, 3).map((decoration) => <span key={decoration.fullRef} className="history-ref-chip" title={decoration.fullRef}>{decoration.kind === "tag" && <Tag aria-hidden="true" />}{decoration.name}</span>)}</div></div>
    </div><button className="secondary-button history-refresh-button" type="button" disabled={isRefreshing} aria-label={isRefreshing ? t.historyRefreshing : t.historyRefresh} onClick={onRefresh}><RefreshCw className={isRefreshing ? "spin" : undefined} aria-hidden="true" />{t.historyRefresh}</button></div>
    <div className="history-tabs" role="tablist" aria-label={t.historyTitle}>{tabs.map((tab) => <button key={tab.id} id={`history-tab-${tab.id}`} className={activeTab === tab.id ? "history-tab history-tab--active" : "history-tab"} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`history-panel-${tab.id}`} onClick={() => onTab(tab.id)}>{tab.icon}<span>{tab.label}</span>{tab.count !== undefined && <span className="history-tab__count">{tab.count}</span>}</button>)}</div></header>;
}

function OverviewMetric({ label, value, tone }: { label: string; value: number; tone?: "positive" | "negative" }): React.JSX.Element {
  return <div className="history-overview-metric"><span>{label}</span><strong className={tone ? `history-overview-metric__value--${tone}` : undefined}>{tone === "positive" ? "+" : tone === "negative" ? "−" : ""}{value}</strong></div>;
}

function HistoryOverview({ detail, state, language, comparison }: { detail: SavedVersionDetail; state: HistoryState; language: string; comparison: string }): React.JSX.Element {
  const { t } = useLanguage();
  const version = detail.version;
  const authored = formatHistoryDate(version.authoredAt, language);
  const committed = formatHistoryDate(version.committedAt, language);
  const areas = changedAreas(detail.files);
  const selectedTotals = diffTotals(state.fileDiff.diff);
  const topFiles = detail.files.slice(0, 6);
  const summary = version.description.trim() || comparison;
  return <div id="history-panel-overview" className="history-workspace history-workspace--overview" role="tabpanel" aria-labelledby="history-tab-overview">
    <div className="history-overview-grid">
      <div className="history-overview-column">
        <div className="history-overview-metrics">
          <OverviewMetric label={t.historyFilesTab} value={detail.fileCounts.total} />
          <OverviewMetric label={t.historyNewFiles} value={detail.fileCounts.new} tone="positive" />
          <OverviewMetric label={t.historyDeletedFiles} value={detail.fileCounts.deleted} tone="negative" />
        </div>
        <section className="history-overview-section"><h3>{t.historyChangeSummary}</h3><p>{summary}</p>{version.description && <p className="history-overview-section__secondary">{comparison}</p>}{version.descriptionTruncated && <p className="history-detail__truncated" role="note">{t.historyDescriptionTruncated}</p>}</section>
        <section className="history-overview-section"><h3>{t.historyChangedAreas}</h3><ul className="history-area-list">{areas.map((area) => <li key={area.path}><Folder aria-hidden="true" /><span>{area.path}</span><strong>{area.count}</strong></li>)}</ul></section>
      </div>
      <section className="history-overview-section history-overview-top-files"><h3>{t.historyTopFiles}</h3><ul>{topFiles.map((file) => {
        const FileTypeIcon = getFileTypeIcon(file.path);
        const path = splitPath(file.path);
        const isSelected = file.path === state.selectedFilePath;
        return <li key={file.path}><span className="history-file__type" aria-hidden="true"><FileTypeIcon /></span><span><strong>{path.name}</strong><small>{path.dir}</small></span>{isSelected && selectedTotals && <span className="history-top-file__totals"><b>+{selectedTotals.added}</b><b>−{selectedTotals.removed}</b></span>}</li>;
      })}</ul></section>
      <div className="history-overview-column history-overview-column--technical">
        <section className="history-overview-section history-technical-card"><h3>{t.historyTechnicalDetails}</h3><dl>
          <div><dt>{t.historyCommitLabel}</dt><dd><code>{version.shortCommit}</code></dd></div>
          <div><dt>{t.historyParentsLabel}</dt><dd>{version.parents.length ? version.parents.map((parent) => <code key={parent}>{parent.slice(0, 10)}</code>) : t.historyNoParents}</dd></div>
          <div><dt>{t.historyAuthorLabel}</dt><dd><span>{version.author?.name || t.historyAuthorUnknown}</span>{version.author?.email && <small>{version.author.email}</small>}</dd></div>
          <div><dt>{t.historyCommittedLabel}</dt><dd>{committed?.absolute ?? authored?.absolute ?? "—"}</dd></div>
          <div><dt>{t.historyBranchLabel}</dt><dd>{state.snapshot?.branch ? <span className="history-technical-chip">{state.snapshot.branch}</span> : "—"}</dd></div>
          <div><dt>{t.historyRefsLabel}</dt><dd>{version.decorations.length ? version.decorations.slice(0, 4).map((item) => <span className="history-technical-chip" key={item.fullRef}>{item.name}</span>) : "—"}</dd></div>
        </dl></section>
        <section className="history-overview-section"><h3>{t.historyCommitNotes}</h3><p>{comparison}</p>{version.descriptionTruncated && <p className="history-detail__truncated">{t.historyDescriptionTruncated}</p>}</section>
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

function HistoryFilterSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return <label className="history-filter-select"><span>{label}:</span><select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown aria-hidden="true" /></label>;
}

function FileDiffPreview({ diff, t }: { diff: FileDiff; t: Translations }): React.JSX.Element {
  if (diff.kind === "text" || diff.kind === "conflict") {
    const lines = diff.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind !== "context").slice(0, 3);
    if (lines.length) return <div className="history-file-preview">{lines.map((line, index) => <code key={`${line.kind}-${index}`} className={`history-file-preview__line history-file-preview__line--${line.kind}`}><span>{line.newLineNumber ?? line.oldLineNumber ?? ""}</span><b aria-hidden="true">{line.kind === "addition" ? "+" : "−"}</b><em>{line.content}</em></code>)}</div>;
  }
  const label = diff.kind === "binary" ? t.changesDiffBinaryTitle : diff.kind === "too-large" ? t.changesDiffTooLargeTitle : diff.kind === "unchanged" ? t.changesDiffUnchangedTitle : t.changesDiffConflictTitle;
  return <div className="history-file-preview history-file-preview--note">{label}</div>;
}

function ChangedFileCards({ files, selectedPath, fileDiff, isLoading, onSelect }: {
  files: HistoryFileChange[];
  selectedPath: string | null;
  fileDiff: FileDiff | null;
  isLoading: boolean;
  onSelect: (path: string) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: files.length, getScrollElement: () => scrollRef.current, estimateSize: () => 108, measureElement: (element) => element.getBoundingClientRect().height, overscan: 5, getItemKey: (index) => files[index]?.path ?? index });
  const selectedIndex = files.findIndex((file) => file.path === selectedPath);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const frame = window.requestAnimationFrame(() => virtualizer.scrollToIndex(selectedIndex, { align: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedIndex, virtualizer]);

  return <div {...autoHideScrollbarProps<HTMLDivElement>()} ref={scrollRef} className="history-file-cards auto-hide-scrollbar" role="listbox" aria-label={t.historyFilesAriaLabel}><div className="history-file-cards__virtual" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((row) => {
    const file = files[row.index];
    const selected = file.path === selectedPath;
    const path = splitPath(file.path);
    const FileTypeIcon = getFileTypeIcon(file.path);
    const totals = selected ? diffTotals(fileDiff) : null;
    return <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} className="history-file-card-row" style={{ transform: `translateY(${row.start}px)` }}><button className={`history-file-card${selected ? " history-file-card--selected" : ""}`} type="button" role="option" aria-selected={selected} onClick={() => onSelect(file.path)}>
      <span className="history-file-card__identity"><span className="history-file__type" aria-hidden="true"><FileTypeIcon /></span><span><strong>{path.name}</strong><small>{path.dir}</small></span></span>
      <span className="history-file-card__stats">{totals && <><b>+{totals.added}</b><b>−{totals.removed}</b></>}<span>{t[CATEGORY_LABEL_KEYS[file.category]]}</span><i className={`history-file-card__status history-file-card__status--${file.category}`} aria-hidden="true" /></span>
      <span className="history-file-card__preview">{selected ? isLoading ? <LoadingBar label={t.historyDiffLoading} /> : fileDiff ? <FileDiffPreview diff={fileDiff} t={t} /> : t.historySelectForPreview : t.historySelectForPreview}</span>
      <ChevronDown className={selected ? "history-file-card__chevron history-file-card__chevron--open" : "history-file-card__chevron"} aria-hidden="true" />
    </button></div>;
  })}</div></div>;
}

function HistoryDetail({ state, language, onSelectFile, onRetryDetail, onRetryDiff, onRefresh, onBack }: {
  state: HistoryState; language: string; onSelectFile: (path: string) => void; onRetryDetail: () => void; onRetryDiff: () => void; onRefresh: () => void; onBack: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<HistoryTab>("diff");
  const [fileSearch, setFileSearch] = useState("");
  const [fileType, setFileType] = useState<HistoryFileType>("all");
  const [fileStatus, setFileStatus] = useState<HistoryFileStatus>("all");
  const [fileSort, setFileSort] = useState<HistoryFileSort>("path");
  const [diffSearch, setDiffSearch] = useState("");
  const [viewMode, setViewMode] = useState<Exclude<DiffViewMode, "accessible">>("unified");
  const [hunkTarget, setHunkTarget] = useState({ index: 0, token: 0 });
  const [copiedPath, setCopiedPath] = useState(false);
  const selectedVersion = state.versions.find((version) => version.commit === state.selectedCommit) ?? null;

  useEffect(() => { setFileSearch(""); setFileType("all"); setFileStatus("all"); setFileSort("path"); setDiffSearch(""); }, [state.selectedCommit]);
  useEffect(() => setHunkTarget({ index: 0, token: 0 }), [state.selectedFilePath]);

  if (state.detail.isLoading) return <section className="history-detail history-detail--loading" aria-labelledby="history-detail-title" aria-busy="true">{selectedVersion && <div className="history-detail__loading-title"><h2 id="history-detail-title">{versionTitle(selectedVersion, t)}</h2></div>}<div className="history-detail__loading"><LoadingBar label={t.historyDetailLoading} /><p>{t.historyDetailLoading}</p></div></section>;
  if (state.detail.error) return <section className="history-detail history-detail--state" role="alert"><CircleAlert /><h2>{t.historyDetailError}</h2><button className="secondary-button" type="button" onClick={onRetryDetail}>{t.historyRetry}</button></section>;
  const detail = state.detail.detail;
  if (!detail) return <section className="history-detail history-detail--state"><p>{t.historySelectFilePrompt}</p></section>;

  const normalizedFileSearch = fileSearch.trim().toLocaleLowerCase();
  const visibleFiles = detail.files.filter((file) => {
    if (normalizedFileSearch && !file.path.toLocaleLowerCase().includes(normalizedFileSearch)) return false;
    if (fileType !== "all" && historyFileType(file.path) !== fileType) return false;
    return fileStatus === "all" || file.category === fileStatus;
  }).sort((left, right) => fileSort === "path" ? left.path.localeCompare(right.path) : left.category.localeCompare(right.category) || left.path.localeCompare(right.path));
  const comparison = detail.comparisonIsEmptyTree ? t.historyRootComparison : detail.comparisonIsFirstParent ? t.historyMergeComparison : t.historyNormalComparison;
  const fileCount = detail.countsAreMinimum ? t.historyChangedFilesMinimum(detail.fileCounts.total) : t.historyChangedFiles(detail.fileCounts.total);
  const totals = diffTotals(state.fileDiff.diff);
  const hunkCount = diffHunkCount(state.fileDiff.diff);
  const selectedFile = detail.files.find((file) => file.path === state.selectedFilePath) ?? null;
  const goToHunk = (index: number): void => setHunkTarget((current) => ({ index, token: current.token + 1 }));
  const selectedVisibleIndex = visibleFiles.findIndex((file) => file.path === state.selectedFilePath);
  const selectVisibleFile = (offset: number): void => {
    const next = visibleFiles[selectedVisibleIndex + offset];
    if (next) onSelectFile(next.path);
  };
  const copySelectedPath = (): void => {
    if (!state.selectedFilePath) return;
    void navigator.clipboard.writeText(state.selectedFilePath).then(() => { setCopiedPath(true); window.setTimeout(() => setCopiedPath(false), 1_500); }).catch(() => undefined);
  };

  const fileSearchControl = <label className="history-search-box history-search-box--files"><Search aria-hidden="true" /><input type="search" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder={t.historyFilterFilesPlaceholder} aria-label={t.historyFilterFilesAriaLabel} /></label>;
  const fileList = visibleFiles.length ? <ChangedFiles files={visibleFiles} selectedPath={state.selectedFilePath} onSelect={onSelectFile} /> : <p className="history-files__empty">{normalizedFileSearch ? t.historyNoFileMatches : t.historyNoChangedFiles}</p>;
  const fileTypeOptions = [
    { value: "all", label: t.historyFilterAllFiles }, { value: "code", label: t.historyFileTypeCode },
    { value: "docs", label: t.historyFileTypeDocs }, { value: "assets", label: t.historyFileTypeAssets },
    { value: "config", label: t.historyFileTypeConfig }, { value: "other", label: t.historyFileTypeOther },
  ];
  const fileStatusOptions = [{ value: "all", label: t.historyFilterAllFiles }, ...(["changed", "new", "deleted", "renamed"] as const).map((category) => ({ value: category, label: t[CATEGORY_LABEL_KEYS[category]] }))];

  return <section className="history-detail" aria-labelledby="history-detail-title">
    <button className="history-detail__back secondary-button" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />{t.historyBackToTimeline}</button>
    <HistoryDetailHeader detail={detail} language={language} activeTab={activeTab} isRefreshing={state.isLoading} onTab={setActiveTab} onRefresh={onRefresh} />
    {activeTab === "overview" && <HistoryOverview detail={detail} state={state} language={language} comparison={comparison} />}
    {activeTab === "files" && <div id="history-panel-files" className="history-workspace history-workspace--files history-workspace--file-inspector" role="tabpanel" aria-labelledby="history-tab-files">
      <header className="history-workspace__toolbar history-files-toolbar"><div className="history-change-summary"><strong>{fileCount}</strong>{totals && <><span className="history-lines-added">+{totals.added}</span><span className="history-lines-removed">−{totals.removed}</span></>}</div><div className="history-files-filters">{fileSearchControl}<HistoryFilterSelect label={t.historyFileTypeLabel} value={fileType} options={fileTypeOptions} onChange={(value) => setFileType(value as HistoryFileType)} /><HistoryFilterSelect label={t.historyFileStatusLabel} value={fileStatus} options={fileStatusOptions} onChange={(value) => setFileStatus(value as HistoryFileStatus)} /><HistoryFilterSelect label={t.historyFileSortLabel} value={fileSort} options={[{ value: "path", label: t.historySortByPath }, { value: "status", label: t.historySortByStatus }]} onChange={(value) => setFileSort(value as HistoryFileSort)} /></div></header>
      {visibleFiles.length ? <ChangedFileCards files={visibleFiles} selectedPath={state.selectedFilePath} fileDiff={state.fileDiff.diff} isLoading={state.fileDiff.isLoading} onSelect={onSelectFile} /> : <p className="history-files__empty">{t.historyNoFileMatches}</p>}
      <footer className="history-files-footer"><span>{t.historyFilesShown(visibleFiles.length, detail.files.length)}</span><div><button className="secondary-button" type="button" disabled={selectedVisibleIndex <= 0} onClick={() => selectVisibleFile(-1)}><ArrowUp aria-hidden="true" />{t.historyPreviousFile}</button><button className="secondary-button" type="button" disabled={selectedVisibleIndex < 0 || selectedVisibleIndex >= visibleFiles.length - 1} onClick={() => selectVisibleFile(1)}>{t.historyNextFile}<ArrowDown aria-hidden="true" /></button></div></footer>
    </div>}
    {activeTab === "diff" && <div id="history-panel-diff" className="history-workspace history-workspace--diff" role="tabpanel" aria-labelledby="history-tab-diff">
      <header className="history-workspace__toolbar"><div className="history-change-summary"><strong>{fileCount}</strong>{totals && <><span className="history-lines-added">+{totals.added}</span><span className="history-lines-removed">−{totals.removed}</span></>}</div><div className="history-diff-controls"><label className="history-search-box history-search-box--diff"><Search aria-hidden="true" /><input type="search" value={diffSearch} onChange={(event) => setDiffSearch(event.target.value)} placeholder={t.historySearchDiffPlaceholder} aria-label={t.historySearchDiffAriaLabel} /></label><div className="history-view-toggle" aria-label={t.changesViewAriaLabel}><button className={viewMode === "unified" ? "history-view-toggle__button history-view-toggle__button--active" : "history-view-toggle__button"} type="button" aria-pressed={viewMode === "unified"} onClick={() => setViewMode("unified")}><Rows3 aria-hidden="true" />{t.changesViewUnified}</button><button className={viewMode === "split" ? "history-view-toggle__button history-view-toggle__button--active" : "history-view-toggle__button"} type="button" aria-pressed={viewMode === "split"} onClick={() => setViewMode("split")}><Columns2 aria-hidden="true" />{t.changesViewSplit}</button></div></div></header>
      <div className="history-diff-grid"><aside className="history-files-pane">{fileSearchControl}{fileList}</aside><div className="history-diff-pane"><header className="history-diff-pane__header">{selectedFile ? <><span className="history-file__type" aria-hidden="true">{React.createElement(getFileTypeIcon(selectedFile.path))}</span><strong>{splitPath(selectedFile.path).name}</strong><span>{splitPath(selectedFile.path).dir}</span><button className="history-icon-button" type="button" aria-label={copiedPath ? t.historyFilePathCopied : t.historyCopyFilePath} data-tooltip={copiedPath ? t.historyFilePathCopied : t.historyCopyFilePath} onClick={copySelectedPath}>{copiedPath ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button></> : <span>{t.historySelectFilePrompt}</span>}</header>
        <div className="history-detail__diff">{state.fileDiff.isLoading && <div className="history-diff-state" aria-busy="true"><LoadingBar label={t.historyDiffLoading} /><p>{t.historyDiffLoading}</p></div>}{state.fileDiff.error !== null && <div className="history-diff-state" role="alert"><p>{t.historyDiffError}</p><button className="secondary-button" type="button" onClick={onRetryDiff}>{t.historyRetry}</button></div>}{state.fileDiff.diff && <DiffResultView diff={state.fileDiff.diff} viewMode={viewMode} hunkTarget={hunkTarget} searchQuery={diffSearch} t={t} />}{!state.fileDiff.isLoading && !state.fileDiff.error && !state.fileDiff.diff && detail.files.length > 0 && <p className="history-diff-state">{t.historySelectFilePrompt}</p>}</div>
        {hunkCount > 0 && <footer className="history-diff-pane__footer"><span>{t.changesHunkPosition(hunkTarget.index + 1, hunkCount)}</span><div><button className="secondary-button" type="button" disabled={hunkTarget.index <= 0} onClick={() => goToHunk(hunkTarget.index - 1)}><ArrowUp aria-hidden="true" />{t.changesPreviousHunk}</button><button className="secondary-button" type="button" disabled={hunkTarget.index >= hunkCount - 1} onClick={() => goToHunk(hunkTarget.index + 1)}>{t.changesNextHunk}<ArrowDown aria-hidden="true" /></button></div></footer>}
      </div></div>
    </div>}
  </section>;
}

export function HistoryPanel({ controller, query, state, error }: { controller: HistoryController; query: HistoryQuery; state: HistoryState; error: string | null }): React.JSX.Element {
  const { t, language } = useLanguage();
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

  if (!state.snapshot && state.isLoading) return <div className="history-screen"><div className="empty-state" aria-busy="true"><LoadingBar label={t.historyLoading} /><h1>{t.historyTitle}</h1><p>{t.historyLoading}</p></div></div>;
  if (!state.snapshot && error) return <div className="history-screen"><div className="empty-state empty-state--error" role="alert"><CircleAlert /><h1>{t.historyErrorTitle}</h1><p>{error}</p><button className="secondary-button" type="button" onClick={() => void controller.refresh(query)}>{t.historyRetry}</button></div></div>;
  if (state.snapshot && state.versions.length === 0) return <div className="history-screen"><div className="empty-state"><GitCommitHorizontal aria-hidden="true" /><h2>{t.historyNoVersionsTitle}</h2><p>{t.historyNoVersionsDescription}</p><button className="secondary-button history-refresh-button" type="button" onClick={() => void controller.refresh(query)}><RefreshCw aria-hidden="true" />{t.historyRefresh}</button></div></div>;

  return <div className={`history-screen${showNarrowDetail ? " history-screen--narrow-detail" : ""}`}>
    <div className="history-notices">
      {state.staleNotice && <HistoryBanner tone="neutral" title={t.historyStaleNotice}>{t.historyLoadedCount(state.versions.length)}</HistoryBanner>}
      {state.snapshot && error && <HistoryBanner tone="danger" title={t.historyErrorTitle}>{error}</HistoryBanner>}
      {state.selectionRemoved && <p className="history-announcement" role="status">{t.historySelectionRemoved}</p>}
      {state.snapshot?.shallow && <HistoryBanner tone="warning" title={t.historyShallowTitle}>{t.historyShallowDescription}</HistoryBanner>}
      {state.snapshot?.headState === "detached" && <HistoryBanner tone="warning" title={t.historyDetachedTitle}>{t.historyDetachedDescription}</HistoryBanner>}
      {!state.snapshot?.upstream && state.snapshot?.headState === "branch" && <HistoryBanner tone="neutral" title={t.historyUnknownUpstreamTitle}>{t.historyUnknownUpstreamDescription}</HistoryBanner>}
      {warnings.includes("unreadableMetadata") && <p className="history-meta-warning" role="status">{t.historyUnreadableMetadata}</p>}
      {(warnings.includes("messagesTruncated") || warnings.includes("decorationsTruncated")) && <p className="history-meta-warning" role="status">{t.historyTruncatedMetadata}</p>}
      {state.clientTruncated && <p className="history-meta-warning" role="status">{t.historyClientLimit(MAX_HISTORY_ROWS)}</p>}
    </div>
    <div className="history-layout">
      <HistoryTimeline key={showNarrowDetail ? "detail-open" : "timeline-open"} state={state} versions={visibleVersions} language={language} search={search} publicationFilter={publicationFilter} sort={sort} onSearch={setSearch} onCycleFilter={() => setPublicationFilter((value) => nextPublicationFilter(value))} onToggleSort={() => setSort((value) => value === "newest" ? "oldest" : "newest")} onSelect={(commit) => controller.selectVersion(query, commit)} onLoadMore={() => void controller.loadMore(query)} onScrollOffset={(offset) => controller.setScrollOffset(query, offset)} onOpenDetail={() => setShowNarrowDetail(true)} />
      <HistoryDetail state={state} language={language} onSelectFile={(path) => controller.selectFile(query, path)} onRetryDetail={() => controller.retryDetail(query)} onRetryDiff={() => controller.retryFileDiff(query)} onRefresh={() => void controller.refresh(query)} onBack={() => setShowNarrowDetail(false)} />
    </div>
  </div>;
}

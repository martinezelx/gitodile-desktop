import React, { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Ellipsis,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import { getFileTypeIcon } from "../../shared/file-icons";
import { AutomaticUpdatesNotice, autoHideScrollbarProps } from "../../shared/ui";
import { SaveVersionDialog } from "../save-version";
import { LoadingBar, SearchBox } from "../../shared/ui";
import { handlePopupMenuKeyDown, useAnchoredPopup } from "../../shared/ui";
import { CHANGE_CATEGORY_ICONS, getOrderedChangeEntries, splitPath } from "../status";
import type { ChangeCategory, WorkingTreeEntry, WorkingTreeStatus } from "../status";
import type { ChangesController } from "./controller";
import { DiffResultView, type DiffViewMode } from "./DiffResultView";
import { DiffViewSelector } from "./DiffViewSelector";
import { DiffStepNav } from "./DiffStepNav";
import { PictureDiffControls, usePictureDiff } from "./pictureDiff";
import type { DiscardRecovery, FileDiff } from "./domain";
import { useDirectDiscard, type DirectDiscardOutcome } from "./directDiscard";
import type { DiscardDialogRequest } from "./DiscardChangesDialog";
import type { ChangesContextMenuState } from "./ChangesContextMenu";

const DiscardChangesDialog = React.lazy(async () => {
  const module = await import("./DiscardChangesDialog");
  return { default: module.DiscardChangesDialog };
});

const ChangesContextMenu = React.lazy(async () => {
  const module = await import("./ChangesContextMenu");
  return { default: module.ChangesContextMenu };
});

export type { DiffHunk, DiffLine, DiffLineKind, FileDiff } from "./domain";

/** Whether this project has any discarded work stored at all.
 *
 * The cheap question first — is there a newest recovery — and the whole list
 * only when that rejects. A discard that never finished has no restorable
 * state, so the cheap check says no while older records may still be there;
 * that is a reason to open the door to the list, not to hide it. Reading the
 * list costs a status pass per stored record, which is not what a menu should
 * pay on every open. */
async function hasStoredRecoveries(
  controller: ChangesController,
  projectPath: string,
  sessionEpoch: string,
): Promise<boolean> {
  try {
    await controller.getDiscardRecovery(projectPath, sessionEpoch);
    return true;
  } catch {
    return (await controller.listDiscardRecoveries(projectPath, sessionEpoch)).length > 0;
  }
}

function ChangesActionsMenu({
  controller,
  projectPath,
  sessionEpoch,
  selectedPath,
  disabled,
  onChoose,
  t,
}: {
  controller: ChangesController;
  projectPath: string;
  sessionEpoch: string;
  selectedPath: string | null;
  disabled: boolean;
  onChoose: (request: DiscardDialogRequest) => void;
  t: Translations;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { containerRef, popupRef } = useAnchoredPopup(open, triggerRef, close, "selected-menu-item");
  const choose = (request: DiscardDialogRequest): void => {
    close(true);
    onChoose(request);
  };
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next) {
      hasStoredRecoveries(controller, projectPath, sessionEpoch)
        .then((value) => setCanRestore(value))
        .catch(() => setCanRestore(false));
    }
  };
  return (
    <div className="changes-actions-menu" ref={containerRef}>
      <button ref={triggerRef} className="secondary-button secondary-button--sm changes-actions-menu__trigger" type="button" aria-label={t.changesMoreActions} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={toggle} data-tooltip={t.changesMoreActions}>
        <Ellipsis aria-hidden="true" />
      </button>
      {open && <div ref={popupRef} className="app-menu changes-actions-menu__popup" role="menu" aria-label={t.changesMoreActions} tabIndex={-1} onKeyDown={(event) => handlePopupMenuKeyDown(event, popupRef.current, () => close(true))}>
        <button className="app-menu__item app-menu__item--danger" role="menuitem" type="button" disabled={!selectedPath} onClick={() => choose({ mode: "selected", selectedPath })}><Trash2 aria-hidden="true" />{t.changesDiscardSelected}</button>
        <button className="app-menu__item app-menu__item--danger" role="menuitem" type="button" onClick={() => choose({ mode: "all", selectedPath: null })}><Trash2 aria-hidden="true" />{t.changesDiscardAll}</button>
        {canRestore && <button className="app-menu__item" role="menuitem" type="button" onClick={() => choose({ mode: "restore", selectedPath: null })}><RotateCcw aria-hidden="true" />{t.changesRestoreDiscarded}</button>}
      </div>}
    </div>
  );
}

// ---- Types mirroring the Rust `FileDiff` contract (src-tauri/src/lib.rs) ----
// Rust owns Git's diff grammar entirely; this module only renders the typed
// result. It never parses patch text.

// ---- Pure list ordering ----

// Ordering and path splitting live with the status domain so Overview's
// changes preview can share them without importing this module — which would
// pull the whole Changes screen (and the file-type icon set) into the initial
// bundle. Re-exported here so this screen's own consumers keep their import.
export { getOrderedChangeEntries };

/** Preserves the current selection if it is still present in `entries`,
 * otherwise falls back to the first entry (or `null` if the list is empty). */
export function resolveSelectedPath(entries: WorkingTreeEntry[], previousPath: string | null): string | null {
  if (previousPath !== null && entries.some((entry) => entry.path === previousPath)) {
    return previousPath;
  }
  return entries[0]?.path ?? null;
}

/** Case-insensitive substring match over the whole repository-relative path,
 * so typing either a file name or a folder narrows the list — the same
 * behavior the Version lines screen's search box has. An all-whitespace query
 * is treated as no query at all, rather than as a filter nothing matches. */
export function filterEntriesBySearch(entries: WorkingTreeEntry[], search: string): WorkingTreeEntry[] {
  const query = search.trim().toLowerCase();
  if (query.length === 0) {
    return entries;
  }
  return entries.filter((entry) => entry.path.toLowerCase().includes(query));
}

export type DiffLineTotals = { added: number; removed: number };

/** Added and removed line counts for one file's diff. Only `text` and
 * `conflict` diffs carry hunks; the binary/too-large/unchanged kinds
 * contribute nothing, which is the honest answer — GitOdile never read their
 * contents. */
export function countDiffLines(diff: FileDiff): DiffLineTotals {
  const totals = { added: 0, removed: 0 };
  if (diff.kind !== "text" && diff.kind !== "conflict") {
    return totals;
  }
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "addition") {
        totals.added += 1;
      } else if (line.kind === "deletion") {
        totals.removed += 1;
      }
    }
  }
  return totals;
}

/** Screen-wide totals, summed over whichever diffs the snapshot's cache
 * currently holds. Returns `null` until every listed file is present, so the
 * subtitle shows nothing rather than a number that keeps climbing while the
 * batch prefetch fills in — a total that is briefly wrong is worse than one
 * that is briefly absent. */
/** True when a diff's line counts would be a floor rather than the answer:
 * Git stopped early (`truncated`), or the file was never read at all
 * (`too-large`). Binary and unchanged files are not in this set — they
 * genuinely contribute no lines, which is a fact, not a gap. */
function hasUncountableLines(diff: FileDiff): boolean {
  if (diff.kind === "too-large") {
    return true;
  }
  return (diff.kind === "text" || diff.kind === "conflict") && diff.truncated;
}

export function sumCachedDiffLines(entries: WorkingTreeEntry[], cache: Map<string, FileDiff>): DiffLineTotals | null {
  if (entries.length === 0) {
    return null;
  }
  const totals = { added: 0, removed: 0 };
  for (const entry of entries) {
    const diff = cache.get(entry.path);
    // Same rule for "not read yet" and "cannot be counted": show nothing
    // rather than a total the user would read as exact. A subtitle that
    // quietly understates a huge change set is worse than one that omits the
    // number until it can be trusted.
    if (!diff || hasUncountableLines(diff)) {
      return null;
    }
    const fileTotals = countDiffLines(diff);
    totals.added += fileTotals.added;
    totals.removed += fileTotals.removed;
  }
  return totals;
}

/* The screen's heading carries one action now. Discarding acts on the files
   in the list — the selected one, or all of them — so its menu moved down to
   the strip that owns that list, where what it will affect is on screen with
   it. */
function ChangesHeaderActions({
  workingTree,
  isChecking,
  canChooseFiles,
  canSaveSelection,
  isEverythingSelected,
  onSave,
  t,
}: {
  workingTree: WorkingTreeStatus | null;
  isChecking: boolean;
  canChooseFiles: boolean;
  canSaveSelection: boolean;
  isEverythingSelected: boolean;
  onSave: () => void;
  t: Translations;
}): React.JSX.Element {
  const hasSavableChanges = workingTree !== null && !workingTree.isClean;
  const actionsDisabled = !hasSavableChanges || isChecking;

  return (
    <div className="changes-header-actions">
      <div className="changes-header-actions__buttons" role="group" aria-label={t.changesHeading}>
        <button
          className="primary-button changes-header-actions__save"
          type="button"
          onClick={onSave}
          disabled={actionsDisabled || !canSaveSelection}
          data-tooltip={
            !hasSavableChanges
              ? t.changesSaveVersionDisabledHint
              : !canSaveSelection
                ? t.changesSaveVersionNoSelectionHint
                : undefined
          }
        >
          <Save aria-hidden="true" />
          {/* The label qualifies itself only when there is something to
              qualify. Saving everything is just saving a version, so it says
              so; leaving files out is the case worth naming, and the count
              belongs to the summary line rather than to a second copy of it on
              the button. A truncated status has no trustworthy selection, so
              it reads as the whole thing too. */}
          {canChooseFiles && canSaveSelection && !isEverythingSelected
            ? t.changesSaveSelected
            : t.changesSaveVersion}
        </button>
      </div>
    </div>
  );
}

function ChangesStatusNotice({ watcherState, error, busy, onRefresh, onOpenSettings, t }: {
  watcherState: "starting" | "watching" | "off" | "unavailable";
  error: string | null;
  busy: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  t: Translations;
}): React.JSX.Element | null {
  if (error) {
    return <section className="changes-status-notice changes-status-notice--danger" role="alert">
      <CircleAlert aria-hidden="true" />
      <div className="changes-status-notice__body"><strong>{t.changesRefreshFailedTitle}</strong><p>{error}</p></div>
      <button className="secondary-button" type="button" onClick={onRefresh}>{t.changesCheckLocal}</button>
    </section>;
  }
  if (watcherState !== "off" && watcherState !== "unavailable") return null;
  return <AutomaticUpdatesNotice title={watcherState === "off" ? t.automaticUpdatesOffTitle : t.automaticUpdatesUnavailableTitle} description={t.automaticUpdatesOutdatedDescription} updateLabel={t.automaticUpdatesUpdateNow} updateAriaLabel={t.changesCheckLocal} updatingLabel={t.automaticUpdatesUpdating} updatingAriaLabel={t.statusCheckingMessage} busy={busy} settingsLabel={t.automaticUpdatesOpenSettings} onUpdate={onRefresh} onOpenSettings={onOpenSettings} />;
}


/** What a discard that was never confirmed reports back. The Undo is the
 * recovery point Rust already created, offered in place rather than left to be
 * found under the actions menu.
 *
 * One fixed `role="status"` rather than swapping to `alert` for the failure:
 * the region is already on screen and showing "Discarding…" by the time an
 * error replaces it, and changing a live region's role in place is the one
 * update screen readers are least reliable about announcing. The danger border
 * and icon carry the severity. */
function DiscardOutcomeNotice({
  outcome,
  onUndo,
  onDismiss,
  t,
}: {
  outcome: DirectDiscardOutcome | null;
  onUndo: (recovery: DiscardRecovery) => Promise<void>;
  onDismiss: () => void;
  t: Translations;
}): React.JSX.Element | null {
  if (!outcome) {
    return null;
  }
  return (
    <div className={`changes-notice changes-notice--${outcome.status}`} role="status">
      {outcome.status === "running" ? (
        <LoaderCircle aria-hidden="true" className="icon--spinning" />
      ) : outcome.status === "error" ? (
        <CircleAlert aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      <p>
        {outcome.status === "running"
          ? t.changesDiscardingNow
          : outcome.status === "error"
            ? outcome.message
            : outcome.status === "restored"
              ? t.changesRestoreSuccess(outcome.restoredFiles)
              : t.changesDiscardSuccess(outcome.discardedFiles)}
      </p>
      {outcome.status === "discarded" && (
        <button className="secondary-button" type="button" onClick={() => void onUndo(outcome.recovery)}>
          <RotateCcw aria-hidden="true" />
          {t.changesUndoDiscard}
        </button>
      )}
      {outcome.status !== "running" && (
        <button className="changes-notice__dismiss" type="button" aria-label={t.commonClose} onClick={onDismiss}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const CATEGORY_LABEL_KEYS = {
  changed: "changesCategoryLabelChanged",
  new: "changesCategoryLabelNew",
  deleted: "changesCategoryLabelDeleted",
  renamed: "changesCategoryLabelRenamed",
  conflicted: "changesCategoryLabelConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

type DiffState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; diff: FileDiff };

const DIFF_LOADING_DELAY_MS = 140;
/** How many files on each side of the current selection get quietly
 * prefetched in the background. Small on purpose: this rides on the same
 * per-file `git diff` process spawn as a real click, so it trades a couple
 * of extra background processes for near-instant "next file" clicks during
 * the common sequential-review flow, without eagerly fetching an entire
 * (possibly huge) change set up front. */

/** How many hunks the currently shown diff has. Only the two kinds that carry
 * hunks can be navigated; the rest have nothing to step through. */
function getHunkCount(diffState: DiffState): number {
  if (diffState.status !== "ready") {
    return 0;
  }
  const diff = diffState.diff;
  return diff.kind === "text" || diff.kind === "conflict" ? diff.hunks.length : 0;
}

function DiffWorkspace({
  projectPath,
  sessionEpoch,
  controller,
  selectedPath,
  entry,
  diffState,
  filePosition,
  fileTotal,
  onSelectPreviousFile,
  onSelectNextFile,
  onRetry,
  onBackToList,
  onCodeContextMenu,
  t,
}: {
  projectPath: string;
  sessionEpoch: string;
  controller: ChangesController;
  selectedPath: string | null;
  entry: WorkingTreeEntry | null;
  diffState: DiffState;
  /** 1-based, matching what the toolbar shows. `0` means the selected file
   * isn't in the (possibly filtered) list, which disables both arrows. */
  filePosition: number;
  fileTotal: number;
  onSelectPreviousFile: () => void;
  onSelectNextFile: () => void;
  onRetry: () => void;
  onBackToList: () => void;
  onCodeContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  t: Translations;
}): React.JSX.Element {
  // Both live here rather than in `ChangesPanel` because they describe how
  // this pane is being read, not what the screen is showing: the view mode
  // deliberately survives moving between files, and the change target is
  // reset per file by the effect below.
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");
  const [hunkTarget, setHunkTarget] = useState({ index: 0, token: 0 });
  const hunkCount = getHunkCount(diffState);
  const picture = usePictureDiff(
    diffState.status === "ready" ? diffState.diff : null,
    `${projectPath}\0${sessionEpoch}`,
    (filePath, originalPath) =>
      controller.readFileImagePreview(projectPath, sessionEpoch, filePath, originalPath),
  );
  // A picture showing the only version it has needs no control, and the
  // reading-mode picker would be one that does nothing: unified, split and
  // accessible text are ways of laying out lines, and a drawing has none. The
  // strip itself stays either way — it names the open file — so what a picture
  // drops is the picker, not a row, and the file keeps its header.
  const showsReadingMode = picture === null || (picture.isSvg && !picture.showsDrawing);
  const hasViewControls = showsReadingMode || picture.hasControls;

  useEffect(() => {
    setHunkTarget({ index: 0, token: 0 });
  }, [selectedPath]);

  const goToHunk = (index: number): void => {
    setHunkTarget((current) => ({ index, token: current.token + 1 }));
  };

  if (!selectedPath) {
    // Only reachable transiently, between the list becoming empty and the
    // parent switching to the clean empty state.
    return <div className="changes-diff" />;
  }

  const { name, dir } = splitPath(selectedPath);
  const FileTypeIcon = getFileTypeIcon(selectedPath);

  return (
    <div className="changes-diff" aria-label={t.changesDiffAriaLabel(selectedPath)}>
      <button type="button" className="changes-diff__back" onClick={onBackToList}>
        <ArrowLeft aria-hidden="true" />
        {t.changesBackToList}
      </button>
      {/* One strip, not two. The file being read and the controls for reading
          it were a header stacked on a toolbar, which cost this panel two
          rules and ~100px before the first line of code appeared. They ask
          one question between them — which file, shown how — so they are one
          row now, paired with the file list's. See `.changes-layout` in
          changes.css. */}
      <header className="changes-diff__header">
        <span className="changes-diff__header-icon" aria-hidden="true">
          <FileTypeIcon className="changes-diff__type-icon" />
        </span>
        <div className="changes-diff__title-row">
          {/* Name first and dir after, the same shape the file rows use, so
              the open file is recognizable as the row it was chosen from. The
              full path stays on the pane's accessible name. */}
          <p className="changes-diff__path">
            <span className="changes-diff__name">{name}</span>
            <span className="changes-diff__dir">{dir ?? t.changesProjectRoot}</span>
          </p>
          {entry && (
            <span className={`changes-diff__category changes-diff__category--${entry.category}`}>
              {t[CATEGORY_LABEL_KEYS[entry.category]]}
            </span>
          )}
          {/* Inline, not a second line: a line of its own grew this header
              past the height it shares with the file list's, putting the
              two panels' rules back out of step for exactly the renamed
              files this text appears on. It truncates like the path, with
              the full value on the tooltip. */}
          {entry?.originalPath && (
            <span className="changes-diff__origin" data-tooltip={t.changesRenamedFrom(entry.originalPath)}>
              {t.changesRenamedFrom(entry.originalPath)}
            </span>
          )}
        </div>
        <div className="changes-diff__controls">
          {fileTotal > 0 && (
            <DiffStepNav
              kind="file"
              position={filePosition}
              total={fileTotal}
              onPrevious={onSelectPreviousFile}
              onNext={onSelectNextFile}
              t={t}
            />
          )}
          {hunkCount > 0 && viewMode !== "accessible" && (
            <DiffStepNav
              kind="hunk"
              position={hunkTarget.index + 1}
              total={hunkCount}
              onPrevious={() => goToHunk(hunkTarget.index - 1)}
              onNext={() => goToHunk(hunkTarget.index + 1)}
              t={t}
            />
          )}
          {/* Last, at the far edge: the arrows move within this file, and the
              picker changes the file's whole shape. A picture answers the same
              question with its own pickers, in the same place and the same
              shape as the reading-mode picker a text file gets. Each picker
              names itself to a screen reader, so nothing labels them a second
              time in a row this dense. */}
          {hasViewControls && (
            <div className="changes-diff__view">
              {picture?.hasControls && <PictureDiffControls picture={picture} t={t} />}
              {showsReadingMode && <DiffViewSelector value={viewMode} onChange={setViewMode} t={t} />}
            </div>
          )}
        </div>
      </header>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="changes-diff__body auto-hide-scrollbar"
      >
        {diffState.status === "loading" && <LoadingBar label={t.changesDiffLoadingTitle} showLabel />}
        {diffState.status === "error" && (
          <div className="changes-diff__status changes-diff__status--error" role="alert">
            <CircleAlert aria-hidden="true" />
            <p>{diffState.message}</p>
            <button type="button" className="secondary-button" onClick={onRetry}>
              {t.changesDiffRetry}
            </button>
          </div>
        )}
        {diffState.status === "ready" && (
          <div className="changes-diff-context-scope" onContextMenu={onCodeContextMenu}>
            <DiffResultView
              diff={diffState.diff}
              projectPath={projectPath}
              sessionEpoch={sessionEpoch}
              readFileLines={(filePath, startLine, endLine) =>
                controller.readFileLines(projectPath, sessionEpoch, filePath, startLine, endLine)
              }
              picture={picture}
              viewMode={viewMode}
              hunkTarget={hunkTarget}
              t={t}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FileListItem({
  entry,
  isSelected,
  isIncluded,
  canChoose,
  onSelect,
  onToggleIncluded,
  onContextMenu,
  virtualPosition,
  virtualIndex,
  virtualCount,
  measureElement,
  t,
}: {
  entry: WorkingTreeEntry;
  isSelected: boolean;
  isIncluded: boolean;
  canChoose: boolean;
  onSelect: () => void;
  onToggleIncluded: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  virtualPosition?: number;
  virtualIndex?: number;
  virtualCount?: number;
  measureElement?: (node: Element | null) => void;
  t: Translations;
}): React.JSX.Element {
  const { name, dir } = splitPath(entry.path);
  const categoryLabel = t[CATEGORY_LABEL_KEYS[entry.category]];
  const FileTypeIcon = getFileTypeIcon(entry.path);
  // The icon's shape (not just its color) already distinguishes the
  // category, so the label doesn't need to stay always-visible in a row that
  // is otherwise just a file name — it stays available as the accessible
  // name. Deliberately no tooltip: the row already shows the file name and
  // its folder, so one popping up on every row hover is pure noise.
  const accessibleName = entry.originalPath
    ? `${entry.path} — ${categoryLabel} — ${t.changesRenamedFrom(entry.originalPath)}`
    : `${entry.path} — ${categoryLabel}`;

  return (
    <li
      className={`changes-file-row${virtualPosition === undefined ? "" : " changes-file-row--virtual"}`}
      data-index={virtualIndex}
      ref={measureElement}
      aria-posinset={virtualIndex === undefined ? undefined : virtualIndex + 1}
      aria-setsize={virtualCount}
      style={virtualPosition === undefined ? undefined : { transform: `translateY(${virtualPosition}px)` }}
    >
      <input
        className="app-checkbox changes-file-row__checkbox"
        type="checkbox"
        checked={isIncluded}
        disabled={!canChoose}
        aria-label={t.changesIncludeFile(entry.path)}
        onChange={onToggleIncluded}
      />
      <button
        type="button"
        className={`changes-file-item${isSelected ? " changes-file-item--active" : ""}${
          entry.category === "conflicted" ? " changes-file-item--attention" : ""
        }`}
        aria-current={isSelected ? "true" : undefined}
        aria-label={accessibleName}
        onClick={onSelect}
        onContextMenu={onContextMenu}
      >
        <span className="changes-file-item__icon" aria-hidden="true">
          <FileTypeIcon className="changes-file-item__type-icon" />
        </span>
        <span className="changes-file-item__details">
          <span className="changes-file-item__name">{name}</span>
          <span className="changes-file-item__dir">{dir || t.changesProjectRoot}</span>
          {entry.originalPath && (
            <span className="changes-file-item__origin">{t.changesRenamedFrom(entry.originalPath)}</span>
          )}
        </span>
        <span className={`changes-file-item__category-icon changes-file-item__category-icon--${entry.category}`} aria-hidden="true">
          {CHANGE_CATEGORY_ICONS[entry.category]}
        </span>
      </button>
    </li>
  );
}

const FILE_LIST_VIRTUALIZATION_THRESHOLD = 100;
const FILE_LIST_ESTIMATED_ROW_HEIGHT = 54;

type FileListRowsProps = {
  entries: WorkingTreeEntry[];
  selectedPath: string | null;
  excludedPaths: Set<string>;
  canChoose: boolean;
  scrollElement: React.RefObject<HTMLDivElement | null>;
  onSelect: (entry: WorkingTreeEntry) => void;
  onToggleIncluded: (entry: WorkingTreeEntry) => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>, entry: WorkingTreeEntry) => void;
  t: Translations;
};

function fileListItem(
  entry: WorkingTreeEntry,
  props: FileListRowsProps,
  virtual?: {
    index: number;
    start: number;
    count: number;
    measureElement: (node: Element | null) => void;
  },
): React.JSX.Element {
  return (
    <FileListItem
      key={entry.path}
      entry={entry}
      isSelected={entry.path === props.selectedPath}
      isIncluded={!props.excludedPaths.has(entry.path)}
      canChoose={props.canChoose}
      onSelect={() => props.onSelect(entry)}
      onToggleIncluded={() => props.onToggleIncluded(entry)}
      onContextMenu={(event) => props.onContextMenu(event, entry)}
      virtualPosition={virtual?.start}
      virtualIndex={virtual?.index}
      virtualCount={virtual?.count}
      measureElement={virtual?.measureElement}
      t={props.t}
    />
  );
}

function VirtualizedFileListRows(props: FileListRowsProps): React.JSX.Element {
  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: () => props.scrollElement.current,
    getItemKey: (index) => props.entries[index]?.path ?? index,
    estimateSize: () => FILE_LIST_ESTIMATED_ROW_HEIGHT,
    overscan: 6,
    // jsdom and the first pre-layout render have no measured viewport yet.
    // A conservative initial desktop rect makes that frame useful; the real
    // ResizeObserver measurement replaces it immediately in WebView2/WebKit.
    initialRect: { width: 320, height: 480 },
  });
  const selectedIndex = props.entries.findIndex((entry) => entry.path === props.selectedPath);

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, virtualizer]);

  return (
    <ul
      className="changes-file-list__virtual"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const entry = props.entries[virtualRow.index];
        return entry
          ? fileListItem(entry, props, {
              index: virtualRow.index,
              start: virtualRow.start,
              count: props.entries.length,
              measureElement: virtualizer.measureElement,
            })
          : null;
      })}
    </ul>
  );
}

function FileListRows(props: FileListRowsProps): React.JSX.Element {
  if (props.entries.length > FILE_LIST_VIRTUALIZATION_THRESHOLD) {
    return <VirtualizedFileListRows {...props} />;
  }
  return <ul>{props.entries.map((entry) => fileListItem(entry, props))}</ul>;
}

export function ChangesPanel({
  projectPath,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  controller,
  sessionEpoch,
  watcherState,
  confirmBeforeDiscarding,
  runGitHooks,
  onRefresh,
  onOpenSettings,
  onSaveCompleted,
  onNavigateOverview,
  onPublishNow,
  selectedPath,
  onSelectedPathChange,
  isSaveVersionOpen,
  onOpenSaveVersion,
  onCloseSaveVersion,
  onSaveVersionPhaseChange,
  onBeginDiscard,
  onDiscardClose,
  onDiscardPhaseChange,
}: {
  projectPath: string;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  /** Owned by the caller, not this component, so already-read diffs survive
   * navigating away from Changes and back within the same project (see task
   * 019). Invalidation is unchanged: `getDiffStore` replaces the store
   * whenever the project or the working-tree snapshot changes. */
  controller: ChangesController;
  sessionEpoch: string;
  /** Actual watcher registration state for this project session. A stored
   * preference is not enough: manual recovery is hidden only after Rust has
   * confirmed the current epoch is being watched. */
  watcherState: "starting" | "watching" | "off" | "unavailable";
  /** Whether discarding opens the confirmation dialog. Off means the discard
   * runs immediately and reports its result — with an Undo — in the header. */
  confirmBeforeDiscarding: boolean;
  /** Passed straight through to the save dialog: this panel owns neither the
   * preference nor the save request, only the button that opens it. */
  runGitHooks: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onSaveCompleted: () => void;
  onNavigateOverview: () => void;
  onPublishNow: () => void;
  /** Which file is selected, lifted to the caller so it survives switching
   * away to another project's session and back (see task 012's per-session
   * UI state). `excludedPaths` (the save-version checkbox picks) stays local
   * below — it's a working selection for the *next* save, not something a
   * project session needs to remember across navigation. */
  selectedPath: string | null;
  onSelectedPathChange: (path: string | null) => void;
  isSaveVersionOpen: boolean;
  onOpenSaveVersion: () => void;
  onCloseSaveVersion: () => void;
  onSaveVersionPhaseChange: (
    phase: "planning" | "executing" | "error" | "success"
  ) => void;
  onBeginDiscard: () => boolean;
  onDiscardClose: () => void;
  onDiscardPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const entries = useMemo(() => (workingTree ? getOrderedChangeEntries(workingTree) : []), [workingTree]);
  const [announcement, setAnnouncement] = useState("");
  const [search, setSearch] = useState("");
  const [discardRequest, setDiscardRequest] = useState<DiscardDialogRequest | null>(null);
  const [contextMenu, setContextMenu] = useState<ChangesContextMenuState | null>(null);
  /* Only asked while this screen is empty, and only then: with a file list on
     screen the same question is answered when its menu opens, and a screen
     that has something to review does not need to know. */
  const [hasRecoveries, setHasRecoveries] = useState(false);
  const isClean = workingTree?.isClean === true;
  useEffect(() => {
    if (!isClean) return undefined;
    let cancelled = false;
    hasStoredRecoveries(controller, projectPath, sessionEpoch)
      .then((value) => { if (!cancelled) setHasRecoveries(value); })
      .catch(() => { if (!cancelled) setHasRecoveries(false); });
    return () => { cancelled = true; };
  }, [controller, isClean, projectPath, sessionEpoch, discardRequest]);
  const directDiscard = useDirectDiscard({
    controller,
    projectPath,
    sessionEpoch,
    t,
    onBegin: onBeginDiscard,
    onFinish: onDiscardClose,
    onMutationCompleted: onSaveCompleted,
    onPhaseChange: onDiscardPhaseChange,
  });
  /** The one place a discard is asked for, whichever menu asked. Restoring
   * keeps its dialog either way: it is a recovery action, and the preference
   * is about being asked before throwing work away. */
  const requestDiscard = (request: DiscardDialogRequest): void => {
    if (request.mode !== "restore" && !confirmBeforeDiscarding) {
      void directDiscard.discard({ mode: request.mode, selectedPath: request.selectedPath });
      return;
    }
    if (onBeginDiscard()) {
      setDiscardRequest(request);
    }
  };
  // The list the user is actually looking at. Selection, the save-version
  // checkboxes, and the totals all keep working off the full `entries`: a
  // search narrows what is *shown*, it does not silently drop files from the
  // version being saved.
  const visibleEntries = useMemo(() => filterEntriesBySearch(entries, search), [entries, search]);
  const store = controller.getStore(projectPath, sessionEpoch, workingTree);
  // Seeded from the cache rather than starting at `idle`: on a remount with a
  // warm cache (navigating back to this screen) that difference is the one
  // frame of empty detail pane between mounting and the effect below running.
  const [diffState, setDiffState] = useState<DiffState>(() => {
    const cached = selectedPath ? store.cache.get(selectedPath) : undefined;
    return cached ? { status: "ready", diff: cached } : { status: "idle" };
  });
  const [retryToken, setRetryToken] = useState(0);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(() => new Set());
  // Below ~1024px the list and the diff can't sit side by side legibly, so
  // the layout becomes list/detail: this tracks which one is showing.
  const [isDetailFocused, setIsDetailFocused] = useState(false);
  // Preserves the current selection across a refresh when it is still
  // present; otherwise moves to the next available file and announces the
  // material change without stealing focus.
  useEffect(() => {
    const resolved = resolveSelectedPath(entries, selectedPath);
    if (resolved === selectedPath) {
      return;
    }
    onSelectedPathChange(resolved);
    if (resolved) {
      setAnnouncement(t.changesSelectionAnnouncement(resolved));
    }
  }, [entries, selectedPath, t, onSelectedPathChange]);

  // Local to this project's session: a switch away and back (or the working
  // tree simply refreshing) must not leave a previous project's checkbox
  // exclusions applied to a different one's file list.
  useEffect(() => {
    setExcludedPaths(new Set());
    setSearch("");
  }, [projectPath]);

  useEffect(() => {
    const available = new Set(entries.map((entry) => entry.path));
    setExcludedPaths((current) => {
      const next = new Set([...current].filter((path) => available.has(path)));
      return next.size === current.size ? current : next;
    });
  }, [entries]);

  // Diffs are cached only for the current working-tree snapshot. A refresh or
  // project switch replaces the whole store, while revisiting a file within
  // the same snapshot is instant — including after leaving this screen and
  // coming back, since the store outlives the component. In-flight requests
  // are shared too, avoiding duplicate Git processes when the user switches
  // away and back quickly.
  useEffect(() => {
    if (!selectedPath) {
      setDiffState({ status: "idle" });
      return undefined;
    }

    const cachedDiff = store.cache.get(selectedPath);
    if (cachedDiff) {
      setDiffState({ status: "ready", diff: cachedDiff });
      return undefined;
    }

    let cancelled = false;
    setDiffState({ status: "idle" });
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) {
        setDiffState({ status: "loading" });
      }
    }, DIFF_LOADING_DELAY_MS);

    controller.fetchDiff(store, selectedPath)
      .then((diff) => {
        if (!cancelled) {
          window.clearTimeout(loadingTimer);
          setDiffState({ status: "ready", diff });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          window.clearTimeout(loadingTimer);
          setDiffState({ status: "error", message: localizeAppError(error, t, t.changesDiffErrorTitle) });
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [store, projectPath, selectedPath, workingTree, retryToken, t]);

  const isLoadingList = isCheckingChanges && !workingTree;
  const selectedEntry = entries.find((entry) => entry.path === selectedPath) ?? null;

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
  const canChooseFiles = !workingTree?.truncated;
  const includedPaths = useMemo(
    () => entries.filter((entry) => !excludedPaths.has(entry.path)).map((entry) => entry.path),
    [entries, excludedPaths],
  );
  const selectedPathsForSave = canChooseFiles ? includedPaths : null;
  const includedCount = canChooseFiles ? includedPaths.length : (workingTree?.counts.total ?? 0);
  const canSaveSelection = includedCount > 0;
  const totalCount = workingTree?.counts.total ?? 0;
  const allSelected = totalCount > 0 && includedCount === totalCount;
  const selectAllRef = useRef<HTMLInputElement>(null);
  const fileListScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = includedCount > 0 && includedCount < totalCount;
    }
  }, [includedCount, totalCount]);

  const lineTotals = sumCachedDiffLines(entries, store.cache);

  // File-to-file navigation walks the list the user can actually see, so
  // "next file" during a search means the next match, not the next file
  // hidden behind the filter.
  const visibleIndex = visibleEntries.findIndex((entry) => entry.path === selectedPath);
  const selectFileAt = (index: number): void => {
    const next = visibleEntries[index];
    if (next) {
      onSelectedPathChange(next.path);
    }
  };

  let headerMessage: React.ReactNode = null;
  if (isLoadingList) {
    headerMessage = <p>{t.statusCheckingMessage}</p>;
  } else if (workingTree) {
    const { conflicted, total } = workingTree.counts;
    headerMessage = (
      <p className="changes-view__summary">
        <span>
          {workingTree.isClean
            ? t.changesSummaryClean
            : conflicted > 0
              ? t.changesSummaryWithConflicts(conflicted, total)
              : t.changesSummaryTotal(total)}
        </span>
        {!workingTree.isClean && lineTotals && (
          <>
            <span className="changes-view__summary-separator" aria-hidden="true">
              ·
            </span>
            <span className="changes-view__line-totals">
              <span className="changes-view__lines changes-view__lines--added">
                <span aria-hidden="true">{t.changesLinesAddedTotal(lineTotals.added)}</span>
                <span className="visually-hidden">{t.changesLinesAddedTotalAriaLabel(lineTotals.added)}</span>
              </span>
              <span className="changes-view__lines changes-view__lines--removed">
                <span aria-hidden="true">{t.changesLinesRemovedTotal(lineTotals.removed)}</span>
                <span className="visually-hidden">{t.changesLinesRemovedTotalAriaLabel(lineTotals.removed)}</span>
              </span>
            </span>
          </>
        )}
        {/* The selection belongs with the other things this screen says about
            its changes, not beside the search box: the strip's job is finding
            a file, and the count was taking a third of it to answer a question
            nobody asks while typing. */}
        {!workingTree.isClean && (
          <>
            <span className="changes-view__summary-separator" aria-hidden="true">
              ·
            </span>
            <span className="changes-view__selection">
              {t.changesSelectionSummary(includedCount, total)}
            </span>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="changes-view" aria-busy={isCheckingChanges}>
      <ChangesStatusNotice watcherState={watcherState} error={workingTreeError} busy={isCheckingChanges} onRefresh={onRefresh} onOpenSettings={onOpenSettings} t={t} />
      {/* Title and state on one line, with the screen's own actions at the far
          end. `.screen-header` is the shared definition of that row — History
          opens on the same one, so the two screens' panels start on the same
          pixel row as well as in the same shape. */}
      <header className="screen-header">
        <div className="screen-header__heading">
          <h1>{t.changesHeading}</h1>
          {headerMessage}
        </div>
        <ChangesHeaderActions
          workingTree={workingTree}
          isChecking={isCheckingChanges}
          canChooseFiles={canChooseFiles}
          canSaveSelection={canSaveSelection}
          isEverythingSelected={allSelected}
          onSave={onOpenSaveVersion}
          t={t}
        />
      </header>

      <DiscardOutcomeNotice
        outcome={directDiscard.outcome}
        onUndo={directDiscard.undo}
        onDismiss={directDiscard.dismiss}
        t={t}
      />

      {isLoadingList ? (
        <LoadingBar label={t.commonLoading} />
      ) : !workingTree ? null : workingTree.isClean ? (
        <div className="changes-empty">
          <div className="changes-empty__icon" aria-hidden="true">
            <CheckCircle2 />
          </div>
          <h2>{t.changesEmptyTitle}</h2>
          <p>{t.changesEmptyDescription}</p>
          <div className="changes-empty__actions">
            <button className="secondary-button" type="button" onClick={onNavigateOverview}>
              {t.changesBackToOverview}
            </button>
            {/* Discarding everything empties this screen, and the file list
                takes the menu that reaches stored copies with it. Without this
                the way back would exist only while there was still something
                to review — which is exactly when nobody needs it. */}
            {hasRecoveries && (
              <button className="ghost-button" type="button" onClick={() => requestDiscard({ mode: "restore", selectedPath: null })}>
                <RotateCcw aria-hidden="true" />
                {t.changesRestoreDiscarded}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={`changes-layout${isDetailFocused ? " changes-layout--detail" : ""}`}>
          <nav className="changes-file-list" aria-label={t.changesListAriaLabel}>
            {/* One strip: what is included, and what is listed. The selection
                summary had a band of its own above the search box, which is a
                whole row of chrome for a fraction like "3/12"; beside the
                checkbox it names it holds the same meaning in a quarter of
                the space, and the files start ~50px higher. Paired with the
                diff header — see `.changes-layout` in changes.css. */}
            <div className="changes-file-list__toolbar">
              <span className="changes-file-list__select-all">
                {canChooseFiles ? (
                  <input
                    ref={selectAllRef}
                    className="app-checkbox changes-file-row__checkbox"
                    type="checkbox"
                    checked={allSelected}
                    aria-label={allSelected ? t.changesSelectNone : t.changesSelectAll}
                    onChange={() =>
                      allSelected
                        ? setExcludedPaths(new Set(entries.map((entry) => entry.path)))
                        : setExcludedPaths(new Set())
                    }
                  />
                ) : (
                  <input
                    className="app-checkbox changes-file-row__checkbox"
                    type="checkbox"
                    checked
                    disabled
                    aria-label={t.changesPartialUnavailableTruncated}
                    data-tooltip={t.changesPartialUnavailableTruncated}
                    readOnly
                  />
                )}
              </span>
              <SearchBox
                value={search}
                onChange={setSearch}
                placeholder={t.changesSearchPlaceholder}
                ariaLabel={t.changesSearchAriaLabel}
                clearLabel={t.commonClearSearch}
              />
              <ChangesActionsMenu
                controller={controller}
                projectPath={projectPath}
                sessionEpoch={sessionEpoch}
                selectedPath={selectedPath}
                disabled={isCheckingChanges}
                onChoose={requestDiscard}
                t={t}
              />
            </div>
            <div
              {...autoHideScrollbarProps<HTMLDivElement>()}
              ref={fileListScrollRef}
              className="changes-file-list__scroll auto-hide-scrollbar"
            >
              {workingTree.truncated && (
                <p className="changes-file-list__truncated" role="status">
                  {t.statusTruncatedNote(entries.length)}
                </p>
              )}
              {visibleEntries.length === 0 && (
                <p className="changes-file-list__empty" role="status">
                  {t.changesNoSearchMatches}
                </p>
              )}
              <FileListRows
                entries={visibleEntries}
                selectedPath={selectedPath}
                excludedPaths={excludedPaths}
                canChoose={canChooseFiles}
                scrollElement={fileListScrollRef}
                onSelect={(entry) => {
                  onSelectedPathChange(entry.path);
                  setIsDetailFocused(true);
                }}
                onToggleIncluded={(entry) =>
                  setExcludedPaths((current) => {
                    const next = new Set(current);
                    if (next.has(entry.path)) {
                      next.delete(entry.path);
                    } else {
                      next.add(entry.path);
                    }
                    return next;
                  })
                }
                onContextMenu={(event, entry) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({
                    kind: "file",
                    x: event.clientX,
                    y: event.clientY,
                    path: entry.path,
                    focusTarget: event.currentTarget,
                  });
                }}
                t={t}
              />
            </div>
          </nav>
          <DiffWorkspace
            projectPath={projectPath}
            sessionEpoch={sessionEpoch}
            controller={controller}
            selectedPath={selectedPath}
            entry={selectedEntry}
            diffState={diffState}
            filePosition={visibleIndex + 1}
            fileTotal={visibleEntries.length}
            onSelectPreviousFile={() => selectFileAt(visibleIndex - 1)}
            onSelectNextFile={() => selectFileAt(visibleIndex + 1)}
            onRetry={() => setRetryToken((token) => token + 1)}
            onBackToList={() => setIsDetailFocused(false)}
            onCodeContextMenu={openCodeContextMenu}
            t={t}
          />
        </div>
      )}

      <span className="visually-hidden" role="status">
        {announcement}
      </span>

      <React.Suspense fallback={null}>
        <ChangesContextMenu
          context={contextMenu}
          onClose={closeContextMenu}
          onCopied={() => setAnnouncement(t.changesCopied)}
          onDiscard={(path) => {
            closeContextMenu(false);
            requestDiscard({ mode: "selected", selectedPath: path });
          }}
          t={t}
        />
      </React.Suspense>

      <SaveVersionDialog
        isOpen={isSaveVersionOpen}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        selectedPaths={selectedPathsForSave}
        runHooks={runGitHooks}
        onClose={onCloseSaveVersion}
        onSaved={onSaveCompleted}
        onPublishNow={onPublishNow}
        onPhaseChange={onSaveVersionPhaseChange}
      />
      <React.Suspense fallback={null}>
        <DiscardChangesDialog
          request={discardRequest}
          projectPath={projectPath}
          sessionEpoch={sessionEpoch}
          controller={controller}
          onClose={() => { setDiscardRequest(null); onDiscardClose(); }}
          onMutationCompleted={onSaveCompleted}
          onPhaseChange={onDiscardPhaseChange}
        />
      </React.Suspense>
    </div>
  );
}

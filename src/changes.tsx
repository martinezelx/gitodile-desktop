import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  CircleAlert,
  FileMinus,
  FilePlus,
  FileQuestion,
  FileWarning,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Save,
  TriangleAlert,
} from "lucide-react";
import { useLanguage, type Translations } from "./i18n";
import { localizeAppError } from "./appError";
import { getFileTypeIcon } from "./fileIcons";
import { SaveVersionDialog } from "./saveVersionDialog";
import type { ChangeCategory, WorkingTreeEntry, WorkingTreeStatus } from "./repositoryOverview";

// ---- Types mirroring the Rust `FileDiff` contract (src-tauri/src/lib.rs) ----
// Rust owns Git's diff grammar entirely; this module only renders the typed
// result. It never parses patch text.

export type DiffLineKind = "context" | "addition" | "deletion";

export type DiffLine = {
  kind: DiffLineKind;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

export type DiffHunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

export type FileDiff =
  | {
      kind: "text";
      path: string;
      originalPath: string | null;
      change: ChangeCategory;
      hunks: DiffHunk[];
      truncated: boolean;
    }
  | { kind: "binary"; path: string; originalPath: string | null; change: ChangeCategory }
  | {
      kind: "too-large";
      path: string;
      originalPath: string | null;
      change: ChangeCategory;
      limitBytes: number;
    }
  | { kind: "conflict"; path: string; hunks: DiffHunk[]; truncated: boolean; detail: string | null }
  | { kind: "unchanged"; path: string; originalPath: string | null; change: ChangeCategory };

// ---- Pure list ordering ----

/** Conflicts need attention, so they lead. `Array.prototype.sort` is stable
 * per spec, so entries within the same category keep the order the backend
 * returned them in — a documented, deterministic ordering. */
const CATEGORY_ORDER: ChangeCategory[] = ["conflicted", "changed", "new", "deleted", "renamed"];

export function getOrderedChangeEntries(status: WorkingTreeStatus): WorkingTreeEntry[] {
  const rank = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
  return [...status.entries].sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99));
}

/** Preserves the current selection if it is still present in `entries`,
 * otherwise falls back to the first entry (or `null` if the list is empty). */
export function resolveSelectedPath(entries: WorkingTreeEntry[], previousPath: string | null): string | null {
  if (previousPath !== null && entries.some((entry) => entry.path === previousPath)) {
    return previousPath;
  }
  return entries[0]?.path ?? null;
}

/** Splits a repository-relative path into its file name and containing
 * directory, so the list can show the name prominently with the directory as
 * a muted second line — the reading order most Git clients (GitHub Desktop,
 * GitKraken, Sourcetree) use. Paths always use `/` as the porcelain output
 * separator, regardless of platform. */
function splitPath(path: string): { name: string; dir: string | null } {
  const slash = path.lastIndexOf("/");
  if (slash === -1) {
    return { name: path, dir: null };
  }
  return { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

function formatByteLimit(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}

export const CATEGORY_ICONS: Record<ChangeCategory, React.JSX.Element> = {
  changed: <Pencil aria-hidden="true" />,
  new: <FilePlus aria-hidden="true" />,
  deleted: <FileMinus aria-hidden="true" />,
  renamed: <ArrowRightLeft aria-hidden="true" />,
  conflicted: <TriangleAlert aria-hidden="true" />,
};

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

type DiffStore = {
  projectPath: string;
  workingTree: WorkingTreeStatus | null;
  cache: Map<string, FileDiff>;
  requests: Map<string, Promise<FileDiff>>;
  /** Guards the one-shot `read_working_tree_diffs` warm-up below. Unlike
   * per-file fetches, that call has no per-path key to dedupe through
   * `requests`, so without this flag React re-running the effect for the
   * same store (development's StrictMode double-invoke, a fast-refresh, ...)
   * would fire the whole-snapshot batch more than once. */
  batchStarted: boolean;
};

const DIFF_LOADING_DELAY_MS = 140;
/** How many files on each side of the current selection get quietly
 * prefetched in the background. Small on purpose: this rides on the same
 * per-file `git diff` process spawn as a real click, so it trades a couple
 * of extra background processes for near-instant "next file" clicks during
 * the common sequential-review flow, without eagerly fetching an entire
 * (possibly huge) change set up front. */
const PREFETCH_RADIUS = 2;

/** Single point of truth for turning a path into a diff: checks the cache,
 * then joins an in-flight request for that path if one exists, otherwise
 * starts one. Every caller (the active selection and the background
 * prefetcher below) shares the same cache and in-flight map, so two
 * simultaneous callers for the same path only ever spawn one Git process. */
function fetchDiff(store: DiffStore, projectPath: string, path: string): Promise<FileDiff> {
  const cached = store.cache.get(path);
  if (cached) {
    return Promise.resolve(cached);
  }
  let request = store.requests.get(path);
  if (!request) {
    request = invoke<FileDiff>("read_file_diff", { path: projectPath, filePath: path }).then(
      (diff) => {
        store.cache.set(path, diff);
        store.requests.delete(path);
        return diff;
      },
      (error: unknown) => {
        store.requests.delete(path);
        throw error;
      },
    );
    store.requests.set(path, request);
  }
  return request;
}

function EmptyDiffNote({
  icon,
  title,
  description,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "neutral" | "attention";
}): React.JSX.Element {
  return (
    <div className={`changes-diff__note changes-diff__note--${tone}`}>
      <div className="changes-diff__note-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function DiffLineRow({ line, t }: { line: DiffLine; t: Translations }): React.JSX.Element {
  const sign = line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " ";
  const label =
    line.kind === "addition" ? t.changesLineAddedLabel : line.kind === "deletion" ? t.changesLineRemovedLabel : null;
  // One column, not two: a context line's old and new numbers are often the
  // same (or a line apart), so showing both read as the number appearing
  // twice. The new-file number is the meaningful one for context/additions;
  // a deletion has no new number, so it falls back to the old one.
  const lineNumber = line.newLineNumber ?? line.oldLineNumber;

  return (
    <div className={`diff-line diff-line--${line.kind}`}>
      <span className="diff-line__number">{lineNumber ?? ""}</span>
      <span className="diff-line__sign" aria-hidden="true">
        {sign}
      </span>
      {label && <span className="visually-hidden">{label}</span>}
      <span className="diff-line__content">{line.content}</span>
    </div>
  );
}

/** How many unchanged lines sit between this hunk and the previous one (or
 * the start of the file, for the first hunk) — computed from the same
 * `oldStart`/`oldLines` fields Rust already provides, so no raw `@@ -a,b
 * +c,d @@` syntax needs to reach a beginner-facing screen. */
function hiddenLinesBeforeHunk(hunk: DiffHunk, previousHunk: DiffHunk | null): number {
  const previousEnd = previousHunk ? previousHunk.oldStart + previousHunk.oldLines : 1;
  return Math.max(0, hunk.oldStart - previousEnd);
}

/** One renderable row of a diff: either the "N unchanged lines" marker that
 * opens a hunk, or a single line within it. Flattening every hunk into one
 * list of rows (rather than nesting them, as the DOM used to) is what makes
 * the list virtualizable below — a virtualizer needs one flat, indexable
 * sequence of same-shaped items, not a tree. */
export type DiffRow =
  | { kind: "marker"; hunkIndex: number; hiddenLines: number }
  | { kind: "line"; hunkIndex: number; line: DiffLine };

export function flattenDiffRows(hunks: DiffHunk[]): DiffRow[] {
  const rows: DiffRow[] = [];
  hunks.forEach((hunk, hunkIndex) => {
    const hiddenLines = hiddenLinesBeforeHunk(hunk, hunks[hunkIndex - 1] ?? null);
    if (hiddenLines > 0) {
      rows.push({ kind: "marker", hunkIndex, hiddenLines });
    }
    for (const line of hunk.lines) {
      rows.push({ kind: "line", hunkIndex, line });
    }
  });
  return rows;
}

/** A row is the first of its hunk when nothing before it in `rows` shares
 * the same `hunkIndex` — used to draw the dashed separator between hunks
 * that DOM nesting (one `.diff-hunk` wrapper per hunk) used to provide for
 * free via a `.diff-hunk + .diff-hunk` sibling selector. Flattening for
 * virtualization means every row is now a sibling, so that boundary has to
 * be marked per-row instead. */
export function isFirstRowOfHunk(rows: DiffRow[], index: number): boolean {
  return index === 0 || rows[index - 1].hunkIndex !== rows[index].hunkIndex;
}

/** Rough starting guesses only: `useVirtualizer`'s `measureElement` corrects
 * each row's real height after its first render, so these never need to
 * track the CSS exactly — they just need to be close enough that the
 * initial scroll position and scrollbar size aren't visibly wrong for a
 * frame. Line rows are always exactly one line tall (`.diff-line__content`
 * is `white-space: pre`, so content never wraps); marker rows are a short,
 * single-line pill. */
const ESTIMATED_LINE_ROW_HEIGHT = 20;
const ESTIMATED_MARKER_ROW_HEIGHT = 32;

/** Renders only the diff rows currently scrolled into view (plus a small
 * overscan buffer), instead of the whole file's worth of DOM nodes at once.
 * A large file with thousands of changed lines (this codebase's own
 * `lib.rs` is a good stress test) would otherwise force the browser to lay
 * out and paint every line up front just to show the first screenful,
 * which is the actual source of "it's a bit laggy to open" — not the Git
 * read, which the caching/prefetch/batching above already made fast. */
function DiffHunkList({ hunks, t }: { hunks: DiffHunk[]; t: Translations }): React.JSX.Element {
  const rows = useMemo(() => flattenDiffRows(hunks), [hunks]);
  const scrollRef = useRef<HTMLPreElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      rows[index].kind === "marker" ? ESTIMATED_MARKER_ROW_HEIGHT : ESTIMATED_LINE_ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <pre className="diff-code" tabIndex={0} ref={scrollRef}>
      <code style={{ display: "block", position: "relative", height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          // The "N unchanged lines" chip already signals the jump between
          // hunks on its own, so the dashed hunk-start border is reserved for
          // a line row that opens a hunk directly (no marker before it) —
          // applying it to the marker row too stacked its own vertical
          // margin with the border's `padding-top`, pushing the chip down
          // and off-center on every hunk after the first.
          const isHunkStart = row.kind === "line" && row.hunkIndex > 0 && isFirstRowOfHunk(rows, virtualRow.index);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={isHunkStart ? "diff-row diff-row--hunk-start" : "diff-row"}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.kind === "marker" ? (
                <div className="diff-hunk__marker">{t.changesDiffHiddenLines(row.hiddenLines)}</div>
              ) : (
                <DiffLineRow line={row.line} t={t} />
              )}
            </div>
          );
        })}
      </code>
    </pre>
  );
}

export function DiffResultView({ diff, t }: { diff: FileDiff; t: Translations }): React.JSX.Element {
  switch (diff.kind) {
    case "text": {
      const lineCount = diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
      return (
        <>
          {diff.truncated && (
            <p className="changes-diff__truncated" role="status">
              {t.changesDiffTruncatedNote(lineCount)}
            </p>
          )}
          <DiffHunkList hunks={diff.hunks} t={t} />
        </>
      );
    }
    case "binary":
      return (
        <EmptyDiffNote
          icon={<FileQuestion aria-hidden="true" />}
          title={t.changesDiffBinaryTitle}
          description={t.changesDiffBinaryDescription}
        />
      );
    case "too-large":
      return (
        <EmptyDiffNote
          icon={<FileWarning aria-hidden="true" />}
          title={t.changesDiffTooLargeTitle}
          description={t.changesDiffTooLargeDescription(formatByteLimit(diff.limitBytes))}
        />
      );
    case "unchanged":
      return (
        <EmptyDiffNote
          icon={<Pencil aria-hidden="true" />}
          title={t.changesDiffUnchangedTitle}
          description={t.changesDiffUnchangedDescription}
        />
      );
    case "conflict":
      return (
        <>
          <EmptyDiffNote
            icon={<TriangleAlert aria-hidden="true" />}
            title={t.changesDiffConflictTitle}
            description={t.changesDiffConflictDescription}
            tone="attention"
          />
          {diff.detail === "unavailable" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictUnavailable}
            </p>
          )}
          {diff.detail === "binary" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictBinary}
            </p>
          )}
          {diff.detail === "too-large" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictTooLarge}
            </p>
          )}
          {diff.hunks.length > 0 && (
            <>
              {diff.truncated && (
                <p className="changes-diff__truncated" role="status">
                  {t.changesDiffTruncatedNote(diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0))}
                </p>
              )}
              <DiffHunkList hunks={diff.hunks} t={t} />
            </>
          )}
        </>
      );
  }
}

function DiffWorkspace({
  selectedPath,
  entry,
  diffState,
  onRetry,
  onBackToList,
  t,
}: {
  selectedPath: string | null;
  entry: WorkingTreeEntry | null;
  diffState: DiffState;
  onRetry: () => void;
  onBackToList: () => void;
  t: Translations;
}): React.JSX.Element {
  if (!selectedPath) {
    // Only reachable transiently, between the list becoming empty and the
    // parent switching to the clean empty state.
    return <div className="changes-diff" />;
  }

  return (
    <div className="changes-diff" aria-label={t.changesDiffAriaLabel(selectedPath)}>
      <button type="button" className="changes-diff__back" onClick={onBackToList}>
        <ArrowLeft aria-hidden="true" />
        {t.changesBackToList}
      </button>
      <header className="changes-diff__header">
        <span
          className="changes-diff__header-icon"
          aria-hidden="true"
          title={entry ? t[CATEGORY_LABEL_KEYS[entry.category]] : undefined}
        >
          {entry ? CATEGORY_ICONS[entry.category] : null}
        </span>
        <div className="changes-diff__header-text">
          <div className="changes-diff__title-row">
            <p className="changes-diff__path" title={selectedPath}>
              {selectedPath}
            </p>
            {entry && (
              <span className={`changes-diff__category changes-diff__category--${entry.category}`}>
                {t[CATEGORY_LABEL_KEYS[entry.category]]}
              </span>
            )}
          </div>
          {entry?.originalPath && <p className="changes-diff__origin">{t.changesRenamedFrom(entry.originalPath)}</p>}
        </div>
      </header>
      <div className="changes-diff__body">
        {diffState.status === "loading" && (
          <div className="changes-diff__status" role="status">
            <LoaderCircle aria-hidden="true" className="icon--spinning" />
            {t.changesDiffLoadingTitle}
          </div>
        )}
        {diffState.status === "error" && (
          <div className="changes-diff__status changes-diff__status--error" role="alert">
            <CircleAlert aria-hidden="true" />
            <p>{diffState.message}</p>
            <button type="button" className="secondary-button" onClick={onRetry}>
              {t.changesDiffRetry}
            </button>
          </div>
        )}
        {diffState.status === "ready" && <DiffResultView diff={diffState.diff} t={t} />}
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
  t,
}: {
  entry: WorkingTreeEntry;
  isSelected: boolean;
  isIncluded: boolean;
  canChoose: boolean;
  onSelect: () => void;
  onToggleIncluded: () => void;
  t: Translations;
}): React.JSX.Element {
  const { name, dir } = splitPath(entry.path);
  const categoryLabel = t[CATEGORY_LABEL_KEYS[entry.category]];
  const FileTypeIcon = getFileTypeIcon(entry.path);
  // The icon's shape (not just its color) already distinguishes the
  // category, so the label doesn't need to stay always-visible in a row that
  // is otherwise just a file name — it stays available as the accessible
  // name and as a hover tooltip instead.
  const accessibleName = entry.originalPath
    ? `${entry.path} — ${categoryLabel} — ${t.changesRenamedFrom(entry.originalPath)}`
    : `${entry.path} — ${categoryLabel}`;

  return (
    <li className="changes-file-row">
      <input
        className="changes-file-row__checkbox"
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
        title={accessibleName}
        onClick={onSelect}
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
          {CATEGORY_ICONS[entry.category]}
        </span>
      </button>
    </li>
  );
}

export function ChangesPanel({
  projectPath,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  onRefresh,
  onNavigateOverview,
  onPublishNow,
}: {
  projectPath: string;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  onRefresh: () => void;
  onNavigateOverview: () => void;
  onPublishNow: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const entries = useMemo(() => (workingTree ? getOrderedChangeEntries(workingTree) : []), [workingTree]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [diffState, setDiffState] = useState<DiffState>({ status: "idle" });
  const [retryToken, setRetryToken] = useState(0);
  const [isSaveVersionOpen, setIsSaveVersionOpen] = useState(false);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(() => new Set());
  const diffStoreRef = useRef<DiffStore>({
    projectPath,
    workingTree,
    cache: new Map(),
    requests: new Map(),
    batchStarted: false,
  });
  if (
    diffStoreRef.current.projectPath !== projectPath ||
    diffStoreRef.current.workingTree !== workingTree
  ) {
    diffStoreRef.current = {
      projectPath,
      workingTree,
      cache: new Map(),
      requests: new Map(),
      batchStarted: false,
    };
  }
  // Below ~1024px the list and the diff can't sit side by side legibly, so
  // the layout becomes list/detail: this tracks which one is showing.
  const [isDetailFocused, setIsDetailFocused] = useState(false);
  // Read inside the batch-prefetch effect's `.then`, so it reacts to
  // whichever file is selected *when the batch resolves* rather than
  // whichever was selected when the effect last ran.
  const selectedPathRef = useRef(selectedPath);
  selectedPathRef.current = selectedPath;

  // Preserves the current selection across a refresh when it is still
  // present; otherwise moves to the next available file and announces the
  // material change without stealing focus.
  useEffect(() => {
    const resolved = resolveSelectedPath(entries, selectedPath);
    if (resolved === selectedPath) {
      return;
    }
    setSelectedPath(resolved);
    if (resolved) {
      setAnnouncement(t.changesSelectionAnnouncement(resolved));
    }
  }, [entries, selectedPath, t]);

  useEffect(() => {
    const available = new Set(entries.map((entry) => entry.path));
    setExcludedPaths((current) => {
      const next = new Set([...current].filter((path) => available.has(path)));
      return next.size === current.size ? current : next;
    });
  }, [entries]);

  // Diffs are cached only for the current working-tree snapshot. A refresh or
  // project switch replaces the whole store, while revisiting a file within
  // the same snapshot is instant. In-flight requests are shared too, avoiding
  // duplicate Git processes when the user switches away and back quickly.
  useEffect(() => {
    if (!selectedPath) {
      setDiffState({ status: "idle" });
      return undefined;
    }

    const store = diffStoreRef.current;
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

    fetchDiff(store, projectPath, selectedPath)
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
  }, [projectPath, selectedPath, workingTree, retryToken, t]);

  // Warms the entire cache in one Git process per working-tree snapshot
  // (`read_working_tree_diffs`), instead of one process per file
  // (`read_file_diff`) — the dominant cost of switching between files
  // quickly. Best-effort and additive: a path this doesn't cover (a
  // conflict, an oversized section, or the call failing outright) simply
  // falls back to the on-demand fetch above, so this can never make things
  // worse, only faster. `selectedPathRef` reads whichever file is current
  // *when the batch resolves*, not whichever was selected when the effect
  // started, so a same-tick reselection is still handled correctly.
  useEffect(() => {
    if (!workingTree || workingTree.isClean) {
      return undefined;
    }
    const store = diffStoreRef.current;
    if (store.batchStarted) {
      return undefined;
    }
    store.batchStarted = true;
    invoke<FileDiff[]>("read_working_tree_diffs", { path: projectPath })
      .then((diffs) => {
        // Guards against a real project/snapshot switch that happened while
        // this was in flight — deliberately *not* an effect-cleanup
        // `cancelled` flag. Combined with the one-shot `batchStarted` guard
        // above, that pattern breaks under React's development StrictMode:
        // its synchronous mount → cleanup → mount would cancel this exact
        // call, and the guard would then block the second mount from ever
        // starting a real replacement, permanently discarding the result.
        // Comparing store identity survives that double-invoke correctly
        // while still discarding a result that genuinely no longer applies.
        if (diffStoreRef.current !== store) {
          return;
        }
        for (const diff of diffs) {
          if (!store.cache.has(diff.path)) {
            store.cache.set(diff.path, diff);
          }
          if (diff.path === selectedPathRef.current) {
            setDiffState({ status: "ready", diff });
          }
        }
      })
      .catch(() => {
        // Silent: a best-effort cache warm-up, not the file the user is
        // actually looking at. Its own fetch (above) reports real errors.
      });
  }, [projectPath, workingTree]);

  // Quietly warms the cache for files near the current selection, so the
  // common "review sequentially, click next" flow finds a warm cache instead
  // of paying a fresh Git process spawn on every click. Never touches
  // `diffState`: a slow or failed prefetch is invisible unless the user
  // actually selects that file, at which point the effect above handles it
  // (and reports the error) normally.
  useEffect(() => {
    if (!selectedPath) {
      return;
    }
    const store = diffStoreRef.current;
    const index = entries.findIndex((entry) => entry.path === selectedPath);
    if (index === -1) {
      return;
    }
    for (let offset = 1; offset <= PREFETCH_RADIUS; offset += 1) {
      for (const neighbor of [entries[index - offset], entries[index + offset]]) {
        if (neighbor && !store.cache.has(neighbor.path) && !store.requests.has(neighbor.path)) {
          fetchDiff(store, projectPath, neighbor.path).catch(() => {
            // Silent: this path isn't visible to the user yet.
          });
        }
      }
    }
  }, [entries, projectPath, selectedPath]);

  const isLoadingList = isCheckingChanges && !workingTree;
  const selectedEntry = entries.find((entry) => entry.path === selectedPath) ?? null;
  const canChooseFiles = !workingTree?.truncated;
  const includedPaths = useMemo(
    () => entries.filter((entry) => !excludedPaths.has(entry.path)).map((entry) => entry.path),
    [entries, excludedPaths],
  );
  const selectedPathsForSave = canChooseFiles ? includedPaths : null;
  const includedCount = canChooseFiles ? includedPaths.length : (workingTree?.counts.total ?? 0);
  const canSaveSelection = includedCount > 0;

  let headerMessage: React.ReactNode = null;
  if (isLoadingList) {
    headerMessage = <p>{t.statusCheckingMessage}</p>;
  } else if (!workingTree && workingTreeError) {
    headerMessage = (
      <p role="alert" className="changes-header__error">
        {workingTreeError}
      </p>
    );
  } else if (workingTree) {
    const { conflicted, total } = workingTree.counts;
    headerMessage = (
      <p>
        {workingTree.isClean
          ? t.changesSummaryClean
          : conflicted > 0
            ? t.changesSummaryWithConflicts(conflicted, total)
            : t.changesSummaryTotal(total)}
      </p>
    );
  }

  return (
    <div className="changes-view" aria-busy={isCheckingChanges}>
      <header className="changes-view__header">
        <div>
          <h1>{t.changesHeading}</h1>
          {headerMessage}
          {workingTree && workingTreeError && !isCheckingChanges && (
            <p className="changes-header__note" role="alert">
              {t.statusRefreshFailedNote}
            </p>
          )}
        </div>
        <div className="changes-view__actions">
          <button
            className="secondary-button changes-view__refresh"
            type="button"
            onClick={onRefresh}
            disabled={isCheckingChanges}
          >
            <RefreshCw aria-hidden="true" className={isCheckingChanges ? "icon--spinning" : undefined} />
            {isCheckingChanges ? t.statusRefreshing : t.statusRefresh}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => setIsSaveVersionOpen(true)}
            disabled={!workingTree || workingTree.isClean || isCheckingChanges || !canSaveSelection}
            title={
              !workingTree || workingTree.isClean
                ? t.changesSaveVersionDisabledHint
                : !canSaveSelection
                  ? t.changesSaveVersionNoSelectionHint
                  : undefined
            }
          >
            <Save aria-hidden="true" />
            {t.changesSaveVersion}
          </button>
        </div>
      </header>

      {isLoadingList ? (
        <div className="changes-loading" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
        </div>
      ) : !workingTree ? null : workingTree.isClean ? (
        <div className="changes-empty">
          <div className="changes-empty__icon" aria-hidden="true">
            <CheckCircle2 />
          </div>
          <h2>{t.changesEmptyTitle}</h2>
          <p>{t.changesEmptyDescription}</p>
          <button className="secondary-button" type="button" onClick={onNavigateOverview}>
            {t.changesBackToOverview}
          </button>
        </div>
      ) : (
        <div className={`changes-layout${isDetailFocused ? " changes-layout--detail" : ""}`}>
          <nav className="changes-file-list" aria-label={t.changesListAriaLabel}>
            <div className="changes-file-list__selection">
              <span>{t.changesSelectionSummary(includedCount, workingTree.counts.total)}</span>
              {canChooseFiles ? (
                <div>
                  <button type="button" onClick={() => setExcludedPaths(new Set())}>
                    {t.changesSelectAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcludedPaths(new Set(entries.map((entry) => entry.path)))}
                  >
                    {t.changesSelectNone}
                  </button>
                </div>
              ) : (
                <span title={t.changesPartialUnavailableTruncated}>{t.changesSelectAll}</span>
              )}
            </div>
            <div className="changes-file-list__scroll">
              {workingTree.truncated && (
                <p className="changes-file-list__truncated" role="status">
                  {t.statusTruncatedNote(entries.length)}
                </p>
              )}
              <ul>
                {entries.map((entry) => (
                  <FileListItem
                    key={entry.path}
                    entry={entry}
                    isSelected={entry.path === selectedPath}
                    isIncluded={!excludedPaths.has(entry.path)}
                    canChoose={canChooseFiles}
                    onSelect={() => {
                      setSelectedPath(entry.path);
                      setIsDetailFocused(true);
                    }}
                    onToggleIncluded={() =>
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
                    t={t}
                  />
                ))}
              </ul>
            </div>
          </nav>
          <DiffWorkspace
            selectedPath={selectedPath}
            entry={selectedEntry}
            diffState={diffState}
            onRetry={() => setRetryToken((token) => token + 1)}
            onBackToList={() => setIsDetailFocused(false)}
            t={t}
          />
        </div>
      )}

      <span className="visually-hidden" role="status">
        {announcement}
      </span>

      <SaveVersionDialog
        isOpen={isSaveVersionOpen}
        projectPath={projectPath}
        selectedPaths={selectedPathsForSave}
        onClose={() => setIsSaveVersionOpen(false)}
        onSaved={onRefresh}
        onPublishNow={onPublishNow}
      />
    </div>
  );
}

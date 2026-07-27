import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  TriangleAlert,
} from "lucide-react";
import { useLanguage, type Translations } from "./i18n";
import { localizeAppError } from "./appError";
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

const CATEGORY_ICONS: Record<ChangeCategory, React.JSX.Element> = {
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

function DiffHunkView({
  hunk,
  hiddenLines,
  t,
}: {
  hunk: DiffHunk;
  hiddenLines: number;
  t: Translations;
}): React.JSX.Element {
  return (
    <div className="diff-hunk">
      {hiddenLines > 0 && <div className="diff-hunk__marker">{t.changesDiffHiddenLines(hiddenLines)}</div>}
      {hunk.lines.map((line, index) => (
        <DiffLineRow key={index} line={line} t={t} />
      ))}
    </div>
  );
}

function DiffHunkList({ hunks, t }: { hunks: DiffHunk[]; t: Translations }): React.JSX.Element {
  return (
    <pre className="diff-code" tabIndex={0}>
      <code>
        {hunks.map((hunk, index) => (
          <DiffHunkView
            key={index}
            hunk={hunk}
            hiddenLines={hiddenLinesBeforeHunk(hunk, hunks[index - 1] ?? null)}
            t={t}
          />
        ))}
      </code>
    </pre>
  );
}

function DiffResultView({ diff, t }: { diff: FileDiff; t: Translations }): React.JSX.Element {
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
  onSelect,
  t,
}: {
  entry: WorkingTreeEntry;
  isSelected: boolean;
  onSelect: () => void;
  t: Translations;
}): React.JSX.Element {
  const { name, dir } = splitPath(entry.path);
  const categoryLabel = t[CATEGORY_LABEL_KEYS[entry.category]];
  // The icon's shape (not just its color) already distinguishes the
  // category, so the label doesn't need to stay always-visible in a row that
  // is otherwise just a file name — it stays available as the accessible
  // name and as a hover tooltip instead.
  const accessibleName = entry.originalPath
    ? `${entry.path} — ${categoryLabel} — ${t.changesRenamedFrom(entry.originalPath)}`
    : `${entry.path} — ${categoryLabel}`;

  return (
    <li>
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
          {CATEGORY_ICONS[entry.category]}
        </span>
        <span className="changes-file-item__details">
          <span className="changes-file-item__name">{name}</span>
          {dir && <span className="changes-file-item__dir">{dir}</span>}
          {entry.originalPath && (
            <span className="changes-file-item__origin">{t.changesRenamedFrom(entry.originalPath)}</span>
          )}
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
}: {
  projectPath: string;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  onRefresh: () => void;
  onNavigateOverview: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const entries = useMemo(() => (workingTree ? getOrderedChangeEntries(workingTree) : []), [workingTree]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [diffState, setDiffState] = useState<DiffState>({ status: "idle" });
  const [retryToken, setRetryToken] = useState(0);
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
    setSelectedPath(resolved);
    if (resolved) {
      setAnnouncement(t.changesSelectionAnnouncement(resolved));
    }
  }, [entries, selectedPath, t]);

  // Fetches only the current selection's diff. Re-running whenever
  // `workingTree` changes keeps the diff fresh after a list refresh; the
  // `cancelled` flag discards a response that arrives after the selection,
  // project, or refresh token has already moved on.
  useEffect(() => {
    if (!selectedPath) {
      setDiffState({ status: "idle" });
      return undefined;
    }
    let cancelled = false;
    setDiffState({ status: "loading" });
    invoke<FileDiff>("read_file_diff", { path: projectPath, filePath: selectedPath })
      .then((diff) => {
        if (!cancelled) {
          setDiffState({ status: "ready", diff });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiffState({ status: "error", message: localizeAppError(error, t, t.changesDiffErrorTitle) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, selectedPath, workingTree, retryToken, t]);

  const isLoadingList = isCheckingChanges && !workingTree;
  const selectedEntry = entries.find((entry) => entry.path === selectedPath) ?? null;

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
        <button
          className="secondary-button changes-view__refresh"
          type="button"
          onClick={onRefresh}
          disabled={isCheckingChanges}
        >
          <RefreshCw aria-hidden="true" className={isCheckingChanges ? "icon--spinning" : undefined} />
          {isCheckingChanges ? t.statusRefreshing : t.statusRefresh}
        </button>
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
                    onSelect={() => {
                      setSelectedPath(entry.path);
                      setIsDetailFocused(true);
                    }}
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
    </div>
  );
}

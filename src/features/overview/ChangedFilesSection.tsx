import React, { Suspense, lazy, useId } from "react";
import {
  ArrowRightLeft,
  ChevronRight,
  CircleAlert,
  FileDiff,
  FileMinus,
  FilePlus,
  LoaderCircle,
  Pencil,
  TriangleAlert,
} from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { splitPath, type ChangeCategory, type WorkingTreeStatus } from "../status";
import { CHANGES_PREVIEW_LIMIT, sampleChangesPreview } from "./changesPreview";

/** The Changes screen's own one-word category names, so a row here is
 * announced the way the same row is announced there. */
const CATEGORY_ROW_LABEL_KEYS = {
  changed: "changesCategoryLabelChanged",
  new: "changesCategoryLabelNew",
  deleted: "changesCategoryLabelDeleted",
  renamed: "changesCategoryLabelRenamed",
  conflicted: "changesCategoryLabelConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

/** Category glyphs stay local because they are also the immediate Suspense
 * fallback for file-type icons. The full vscode-icons catalog is loaded only
 * when the card actually has files, so it does not block first paint. */
const CATEGORY_ICONS: Record<ChangeCategory, React.JSX.Element> = {
  changed: <Pencil aria-hidden="true" />,
  new: <FilePlus aria-hidden="true" />,
  deleted: <FileMinus aria-hidden="true" />,
  renamed: <ArrowRightLeft aria-hidden="true" />,
  conflicted: <TriangleAlert aria-hidden="true" />,
};

const FileTypeIcon = lazy(async () => {
  const { getFileTypeIcon } = await import("../../shared/file-icons");
  return {
    default: function OverviewFileTypeIcon({ path }: { path: string }): React.JSX.Element {
      const Icon = getFileTypeIcon(path);
      return <Icon className="changes-preview__file-type-icon" />;
    },
  };
});

/**
 * A read-only sample of the working tree: one row per file, its category
 * marked the way the Changes screen marks it — by the icon at the end of the
 * row — so the same file looks the same on both screens. Each row is a
 * shortcut into Changes with that file already selected; the card as a whole
 * is the "which files" behind the count in the band above it.
 */
export function ChangedFilesSection({
  workingTree,
  workingTreeError,
  isCheckingChanges,
  onOpenFile,
  onSeeAll,
  onCheckAgain,
}: {
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  onOpenFile: (path: string) => void;
  onSeeAll: () => void;
  onCheckAgain: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const headingId = useId();
  const shown = workingTree ? sampleChangesPreview(workingTree.entries, CHANGES_PREVIEW_LIMIT) : [];
  const isLoading = !workingTree && (isCheckingChanges || !workingTreeError);

  return (
    <section className="changed-files" aria-labelledby={headingId} aria-busy={isCheckingChanges}>
      <header className="changed-files__header">
        <div className="changed-files__heading">
          <span className="changed-files__icon" aria-hidden="true">
            {isCheckingChanges ? <LoaderCircle className="icon--spinning" /> : <FileDiff />}
          </span>
          <div>
            <h2 id={headingId}>{t.overviewChangedFilesTitle}</h2>
            <p>{t.overviewChangedFilesSince}</p>
          </div>
        </div>
        {/* The same trailing action Recent history carries, in the same
            place and the same words. */}
        {workingTree && workingTree.counts.total > 0 && (
          <button className="changed-files__all" type="button" onClick={onSeeAll}>
            {t.overviewHistoryViewAll}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </header>

      {isLoading ? (
        <div className="changed-files__state" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          <span>{t.statusCheckingTitle}</span>
        </div>
      ) : !workingTree ? (
        <div className="changed-files__state changed-files__state--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>{t.statusCheckFailedTitle}</strong>
            <p>{workingTreeError}</p>
            <button className="secondary-button" type="button" onClick={onCheckAgain}>
              {t.overviewCheckLocalAgain}
            </button>
          </div>
        </div>
      ) : workingTree.counts.total === 0 ? (
        /* Nothing to list is the good outcome here, so it is said the way the
           band says a step is done — the light "done" tile — and it arrives:
           the tile pops in and the tick draws itself, once, when the card
           reaches this state. A drawn check is the oldest "all done" there is,
           and it is over in half a second. */
        <div className="changed-files__state changed-files__state--empty">
          <span className="changed-files__done" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path className="changed-files__done-tick" d="M6 12.5l4 4 8-9" pathLength="1" />
            </svg>
          </span>
          <div>
            <strong>{t.statusCleanTitle}</strong>
            <p>{t.statusCleanMessage}</p>
          </div>
        </div>
      ) : (
        <>
          {/* A refresh that fails after a successful one keeps the known list
              visible, but must still say it is stale. */}
          {workingTreeError && !isCheckingChanges && (
            <p className="changed-files__stale" role="alert">
              <TriangleAlert aria-hidden="true" />
              {t.statusRefreshFailedNote}
            </p>
          )}
          <ul className="changes-preview__list" aria-label={t.overviewChangesPreviewLabel}>
            {shown.map((entry, index) => {
              // The folder rides beside the name, dimmed, and is the first
              // thing to give way: two `index.ts` are told apart by it, and the
              // full path stays one hover away.
              const { name, dir } = splitPath(entry.path);
              const fullPath =
                entry.category === "renamed" && entry.originalPath
                  ? `${entry.originalPath} → ${entry.path}`
                  : entry.path;
              const categoryLabel = t[CATEGORY_ROW_LABEL_KEYS[entry.category]];
              return (
                <li key={entry.path} className="row-in" style={{ "--row-index": index } as React.CSSProperties}>
                  <button
                    className={`changes-preview__item changes-preview__item--${entry.category}`}
                    type="button"
                    onClick={() => onOpenFile(entry.path)}
                    aria-label={`${t.overviewChangesPreviewOpenFile(fullPath)} — ${categoryLabel}`}
                    data-tooltip={fullPath}
                  >
                    <span className="changes-preview__icon" aria-hidden="true">
                      <Suspense fallback={CATEGORY_ICONS[entry.category]}>
                        <FileTypeIcon path={entry.path} />
                      </Suspense>
                    </span>
                    <span className="changes-preview__name">{name}</span>
                    <span className="changes-preview__dir">{dir || t.changesProjectRoot}</span>
                    <span className="changes-preview__category" aria-hidden="true">
                      {CATEGORY_ICONS[entry.category]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

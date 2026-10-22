import React from "react";
import {
  ArrowRightLeft,
  ChevronRight,
  CircleAlert,
  FileMinus,
  FilePlus,
  Pencil,
  TriangleAlert,
} from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { LoadingPlaceholder, TextPlaceholder } from "../../shared/ui";
import { getWorkingTreeBreakdown, type ChangeCategory, type WorkingTreeStatus } from "../status";

/** The Changes rows' own category glyphs, shared with the side column. */
export const CHANGE_ICONS: Record<ChangeCategory, React.JSX.Element> = {
  changed: <Pencil aria-hidden="true" />,
  new: <FilePlus aria-hidden="true" />,
  deleted: <FileMinus aria-hidden="true" />,
  renamed: <ArrowRightLeft aria-hidden="true" />,
  conflicted: <TriangleAlert aria-hidden="true" />,
};

/** The status feature's own counted category names ("3 edited"), read out
 * after the glyphs, which are only marks. */
const CATEGORY_COUNT_KEYS = {
  changed: "statusCategoryChanged",
  new: "statusCategoryNew",
  deleted: "statusCategoryDeleted",
  renamed: "statusCategoryRenamed",
  conflicted: "statusCategoryConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

/**
 * The timeline's first node: the working tree, before any saved version. One
 * line — "Now · 4 unsaved changes" — with the kinds of change as small glyph
 * counts, and the whole line a way into Changes. It names no files: the side
 * column already lists what the next version will hold. With nothing unsaved
 * it is one quiet line.
 */
export function OverviewNow({
  workingTree,
  workingTreeError,
  isCheckingChanges,
  onReview,
  onCheckAgain,
}: {
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  /** Opens Changes. */
  onReview: () => void;
  onCheckAgain: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  if (!workingTree) {
    if (workingTreeError && !isCheckingChanges) {
      return (
        <div className="overview-now overview-now--error" role="alert">
          <span className="overview-now__node" aria-hidden="true" />
          <div className="overview-now__body">
            <p className="overview-now__title">
              <CircleAlert aria-hidden="true" />
              {t.statusCheckFailedTitle}
            </p>
            <button className="overview-now__link" type="button" onClick={onCheckAgain}>
              {t.overviewCheckLocalAgain}
            </button>
          </div>
        </div>
      );
    }
    // Not read yet: the row's label stays, its answer is a run of placeholder.
    return (
      <LoadingPlaceholder label={t.statusCheckingTitle} className="overview-now overview-now--quiet">
        <span className="overview-now__node" aria-hidden="true" />
        <p className="overview-now__title" aria-hidden="true">
          <span className="overview-now__label">{t.overviewNowLabel}</span>
          <span>·</span>
          <TextPlaceholder width="7em" />
        </p>
      </LoadingPlaceholder>
    );
  }

  const { total, conflicted } = workingTree.counts;
  if (total === 0) {
    return (
      <div className="overview-now overview-now--quiet">
        <span className="overview-now__node" aria-hidden="true" />
        <p className="overview-now__title">
          <span className="overview-now__label">{t.overviewNowLabel}</span>
          <span aria-hidden="true">·</span>
          {t.overviewNowClean}
        </p>
      </div>
    );
  }

  const hasConflicts = conflicted > 0;
  const breakdown = getWorkingTreeBreakdown(workingTree);
  const summary = hasConflicts ? t.overviewNowConflicts(conflicted) : t.statusBarUnsaved(total);
  const kinds = breakdown.map((item) => t[CATEGORY_COUNT_KEYS[item.category]](item.count)).join(", ");

  return (
    <button
      className={`overview-now overview-now--active${hasConflicts ? " overview-now--conflicts" : " overview-now--unsaved"}`}
      type="button"
      onClick={onReview}
      aria-label={`${t.overviewNowLabel}: ${summary} — ${kinds}. ${t.overviewReviewChanges}`}
    >
      <span className="overview-now__node" aria-hidden="true" />
      <span className="overview-now__title" aria-hidden="true">
        <span className="overview-now__label">{t.overviewNowLabel}</span>
        <span>·</span>
        <strong>{summary}</strong>
      </span>
      <span className="overview-now__kinds" aria-hidden="true">
        {breakdown.map((item) => (
          <span key={item.category} className={`overview-now__kind overview-now__kind--${item.category}`}>
            {CHANGE_ICONS[item.category]}
            {item.count}
          </span>
        ))}
      </span>
      <ChevronRight className="overview-now__chevron" aria-hidden="true" />
      {/* A refresh that fails after a successful one keeps the known count on
          show, but must still say it may be stale. */}
      {workingTreeError && !isCheckingChanges && (
        <span className="overview-now__stale" role="alert">
          <TriangleAlert aria-hidden="true" />
          {t.statusRefreshFailedNote}
        </span>
      )}
    </button>
  );
}

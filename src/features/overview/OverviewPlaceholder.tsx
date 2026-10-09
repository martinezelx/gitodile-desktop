import React from "react";

import { useLanguage } from "../../i18n";
import { LoadingPlaceholder, TextPlaceholder } from "../../shared/ui";

/** Subject and date lengths for Recent history's first-read rows, one per
 * previewed version. */
const HISTORY_PLACEHOLDER_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["62%", "18%"],
  ["48%", "14%"],
  ["70%", "20%"],
  ["54%", "16%"],
];

/** Recent history's list before its first read answers. Shared with the whole
 * screen's placeholder, so the card looks the same either way it loads. */
export function HistoryPlaceholderList(): React.JSX.Element {
  return (
    <ol className="overview-timeline">
      {HISTORY_PLACEHOLDER_WIDTHS.map(([subject, meta]) => (
        <li key={subject} className="overview-timeline__item">
          <span className="overview-history__row">
            <span className="overview-history__node" />
            <span className="overview-history__body">
              <span className="overview-history__subject"><TextPlaceholder width={subject} /></span>
              <span className="overview-history__meta"><TextPlaceholder width={meta} /></span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The next-step card before the project's state is known, shared with the
 * card itself so it looks the same either way it loads. */
export function NextStepPlaceholder({ label }: { label?: string }): React.JSX.Element {
  return (
    <LoadingPlaceholder label={label} className="next-step next-step--calm">
      <span className="next-step__glyph" aria-hidden="true"><TextPlaceholder className="text-placeholder--glyph" /></span>
      <div className="next-step__copy" aria-hidden="true">
        <p className="next-step__kicker"><TextPlaceholder width="6em" /></p>
        <p className="next-step__title"><TextPlaceholder width="40%" /></p>
        <p className="next-step__hint"><TextPlaceholder width="60%" /></p>
      </div>
    </LoadingPlaceholder>
  );
}

/** The scene's own shape — two places and the path between them — until it
 * knows where the work is. */
export function WorkScenePlaceholder({ size, label }: { size: "large" | "small"; label?: string }): React.JSX.Element {
  const shape = (
    <>
      <div className="work-scene__row" aria-hidden="true">
        <TextPlaceholder className="work-scene__place-placeholder" />
        <span className="work-scene__path" />
        <TextPlaceholder className="work-scene__place-placeholder" />
      </div>
      <div className="work-scene__captions" aria-hidden="true">
        <p className="work-scene__caption"><TextPlaceholder width="3.5em" /><TextPlaceholder width="5em" /></p>
        <span />
        <p className="work-scene__caption"><TextPlaceholder width="3.5em" /><TextPlaceholder width="4em" /></p>
      </div>
    </>
  );
  // Inside the whole screen's placeholder the label is already said once.
  return (
    <LoadingPlaceholder label={label} className={`work-scene work-scene--${size} work-scene--loading`}>
      {shape}
    </LoadingPlaceholder>
  );
}

/** Name and folder lengths for a detail card's rows before they are read. */
const DETAIL_PLACEHOLDER_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["38%", "30%"],
  ["30%", "36%"],
  ["44%", "22%"],
];

/** A detail card's summary and rows while what it lists is being read. */
export function DetailListPlaceholder({ label }: { label: string }): React.JSX.Element {
  return (
    <LoadingPlaceholder label={label}>
      <p className="overview-detail__sum" aria-hidden="true"><TextPlaceholder width="45%" /></p>
      <ul className="overview-detail__files" aria-hidden="true">
        {DETAIL_PLACEHOLDER_WIDTHS.map(([name, dir]) => (
          <li key={name} className="overview-detail__placeholder-row">
            <TextPlaceholder className="overview-detail__placeholder-kind" />
            <TextPlaceholder width={name} />
            <TextPlaceholder width={dir} />
          </li>
        ))}
      </ul>
    </LoadingPlaceholder>
  );
}

/**
 * The whole of Overview before launch restore has a project to show: the
 * breadcrumb, the next-step card, the timeline and the scene beside it, drawn
 * with the real content's classes so the project lands in the space that was
 * held for it. Only the label is said; the shape is hidden from assistive tech.
 */
export function OverviewPlaceholder(): React.JSX.Element {
  const { t } = useLanguage();

  return (
    <LoadingPlaceholder label={t.overviewOpeningTitle} className="project-overview">
      <div className="overview-header" aria-hidden="true">
        <span className="overview-header__icon">
          <TextPlaceholder className="overview-placeholder__avatar" />
        </span>
        <span className="overview-header__name overview-placeholder__name"><TextPlaceholder width="8em" /></span>
        <span className="overview-header__slash">/</span>
        <TextPlaceholder className="overview-placeholder__switch" />
        <TextPlaceholder className="overview-header__tool overview-header__tool--first overview-placeholder__tool" />
        <TextPlaceholder className="overview-header__tool overview-placeholder__tool" />
      </div>

      <NextStepPlaceholder />

      <div className="overview-body" aria-hidden="true">
        <div className="overview-history">
          <div className="overview-history__header">
            <h2>{t.overviewHistoryTitle}</h2>
          </div>
          <HistoryPlaceholderList />
        </div>
        <div className="overview-side">
          <WorkScenePlaceholder size="large" />
        </div>
      </div>
    </LoadingPlaceholder>
  );
}

import React from "react";
import { FileDiff, GitCommitHorizontal } from "lucide-react";

import { useLanguage } from "../../i18n";
import { LoadingPlaceholder, TextPlaceholder } from "../../shared/ui";

/** Name and folder lengths for Changed files' first-check rows. */
const CHANGES_PLACEHOLDER_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["96px", "64px"],
  ["72px", "88px"],
  ["112px", "48px"],
];

/** Subject and author/date lengths for Recent history's first-read rows, one
 * per previewed version. */
const HISTORY_PLACEHOLDER_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["62%", "34%"],
  ["48%", "28%"],
  ["70%", "38%"],
  ["54%", "30%"],
];

/** Changed files' list before its first check answers. Shared with the whole
 * screen's placeholder, so the card looks the same either way it loads. */
export function ChangedFilesPlaceholderList(): React.JSX.Element {
  return (
    <ul className="changes-preview__list">
      {CHANGES_PLACEHOLDER_WIDTHS.map(([name, dir]) => (
        <li key={name}>
          <span className="changes-preview__item">
            <span className="changes-preview__icon"><TextPlaceholder className="text-placeholder--glyph" /></span>
            <span className="changes-preview__name"><TextPlaceholder width={name} /></span>
            <span className="changes-preview__dir"><TextPlaceholder width={dir} /></span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Recent history's list before its first read answers; see above. */
export function HistoryPlaceholderList(): React.JSX.Element {
  return (
    <ol className="overview-history__list">
      {HISTORY_PLACEHOLDER_WIDTHS.map(([subject, meta]) => (
        <li key={subject}>
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

/**
 * The whole of Overview before launch restore has a project to show: the
 * header, the band and both cards, drawn with the real content's classes so
 * the project lands in the space that was waiting for it. Only what does not
 * depend on the project — the step names and the card titles — is written
 * out; everything else is a run of placeholder text. The shape is hidden
 * from assistive tech, which hears only the placeholder's own label.
 */
export function OverviewPlaceholder(): React.JSX.Element {
  const { t } = useLanguage();
  const steps = [t.overviewJourneyChanges, t.overviewJourneySave, t.overviewJourneyPublish];

  return (
    <LoadingPlaceholder label={t.overviewOpeningTitle} className="project-overview">
      <div className="overview-header" aria-hidden="true">
        <div className="overview-header__identity">
          <span className="overview-header__icon">
            <TextPlaceholder className="overview-placeholder__avatar" />
          </span>
          <div className="overview-header__copy">
            <div className="overview-header__title overview-placeholder__name">
              <TextPlaceholder width="9em" />
            </div>
            <div className="overview-header__subline overview-placeholder__path">
              <TextPlaceholder width="18em" />
            </div>
          </div>
        </div>
        <div className="overview-header__actions">
          <TextPlaceholder className="overview-placeholder__switch" />
        </div>
      </div>

      <div className="journey" aria-hidden="true">
        <ol className="journey__steps">
          {steps.map((label, index) => (
            <React.Fragment key={label}>
              {index > 0 && (
                <li>
                  <span className="journey-connector" />
                </li>
              )}
              <li>
                <div className="journey-step journey-step--muted">
                  <span className="journey-step__icon">
                    <TextPlaceholder className="text-placeholder--glyph" />
                  </span>
                  <span className="journey-step__copy">
                    <span className="journey-step__label">{label}</span>
                    <span className="journey-step__value"><TextPlaceholder width="60%" /></span>
                    <span className="journey-step__hint"><TextPlaceholder width="80%" /></span>
                  </span>
                </div>
              </li>
            </React.Fragment>
          ))}
        </ol>
        <p className="journey__note overview-placeholder__note">
          <TextPlaceholder width="46%" />
        </p>
      </div>

      <div className="overview-columns" aria-hidden="true">
        <div className="changed-files">
          <div className="changed-files__header">
            <div className="changed-files__heading">
              <span className="changed-files__icon"><FileDiff /></span>
              <div>
                <h2>{t.overviewChangedFilesTitle}</h2>
                <p>{t.overviewChangedFilesSince}</p>
              </div>
            </div>
          </div>
          <ChangedFilesPlaceholderList />
        </div>
        <div className="overview-history">
          <div className="overview-history__header">
            <div className="overview-history__heading">
              <span className="overview-history__icon"><GitCommitHorizontal /></span>
              <div>
                <h2>{t.overviewHistoryTitle}</h2>
                <p>{t.overviewHistoryDescription}</p>
              </div>
            </div>
          </div>
          <HistoryPlaceholderList />
        </div>
      </div>
    </LoadingPlaceholder>
  );
}

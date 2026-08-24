import { useMemo } from "react";
import {
  ChevronRight,
  CircleAlert,
  Cloud,
  CloudOff,
  GitCommitHorizontal,
  HardDrive,
  LoaderCircle,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import {
  formatHistoryDate,
  useActiveHistoryState,
  type HistoryController,
  type PublicationState,
  type SavedVersionSummary,
} from "../history";

const HISTORY_PREVIEW_LIMIT = 4;

function versionTitle(version: SavedVersionSummary, fallback: string): string {
  return version.subject.trim() || fallback;
}

function PublicationIcon({ publication }: { publication: PublicationState }): React.JSX.Element {
  if (publication === "published") return <Cloud aria-hidden="true" />;
  if (publication === "local-only") return <HardDrive aria-hidden="true" />;
  return <CloudOff aria-hidden="true" />;
}

export function HistorySummarySection({
  controller,
  projectPath,
  sessionEpoch,
  onOpenHistory,
}: {
  controller: HistoryController;
  projectPath: string;
  sessionEpoch: string;
  onOpenHistory: () => void;
}): React.JSX.Element {
  const { language, t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveHistoryState(controller, query);
  const versions = state.versions.slice(0, HISTORY_PREVIEW_LIMIT);
  const error = state.error ? localizeAppError(state.error, t, t.overviewHistoryError) : null;

  const openVersion = (commit: string): void => {
    controller.selectVersion(query, commit);
    onOpenHistory();
  };

  return (
    <section className="overview-history" aria-labelledby="overview-history-title" aria-busy={state.isLoading}>
      <header className="overview-history__header">
        <div className="overview-history__heading">
          <span className="overview-history__icon" aria-hidden="true">
            <GitCommitHorizontal />
          </span>
          <div>
            <h2 id="overview-history-title">{t.overviewHistoryTitle}</h2>
            <p>{t.overviewHistoryDescription}</p>
          </div>
        </div>
        {state.snapshot && state.versions.length > 0 && (
          <button className="overview-history__all" type="button" onClick={onOpenHistory}>
            {t.overviewHistoryViewAll}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </header>

      {!state.snapshot && !error ? (
        <div className="overview-history__loading" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          <span>{t.overviewHistoryLoading}</span>
        </div>
      ) : !state.snapshot && error ? (
        <div className="overview-history__state overview-history__state--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>{t.overviewHistoryErrorTitle}</strong>
            <p>{error}</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => void controller.refresh(query)}>
            {t.overviewHistoryRetry}
          </button>
        </div>
      ) : versions.length === 0 ? (
        <div className="overview-history__state">
          <GitCommitHorizontal aria-hidden="true" />
          <div>
            <strong>{t.overviewHistoryEmptyTitle}</strong>
            <p>{t.overviewHistoryEmptyDescription}</p>
          </div>
        </div>
      ) : (
        <ol className="overview-history__list" aria-label={t.overviewHistoryListLabel}>
          {versions.map((version) => {
            const title = versionTitle(version, t.overviewHistoryUntitled);
            const author = version.author?.name.trim() || t.overviewHistoryUnknownAuthor;
            const date = formatHistoryDate(version.authoredAt, language);
            const publication =
              version.publication === "published"
                ? t.overviewHistoryPublished
                : version.publication === "local-only"
                  ? t.overviewHistoryLocalOnly
                  : t.overviewHistoryPublicationUnknown;
            return (
              <li key={version.commit}>
                <button
                  className="overview-history__row"
                  type="button"
                  onClick={() => openVersion(version.commit)}
                  aria-label={t.overviewHistoryOpenVersion(title)}
                >
                  <span className="overview-history__node" aria-hidden="true" />
                  <span className="overview-history__body">
                    <span className="overview-history__subject" title={title}>{title}</span>
                    <span className="overview-history__meta">
                      <span>{author}</span>
                      {date && <span title={date.absolute}>{date.relative}</span>}
                      <code>{version.shortCommit}</code>
                    </span>
                  </span>
                  <span className={`overview-history__publication overview-history__publication--${version.publication}`}>
                    <PublicationIcon publication={version.publication} />
                    {publication}
                  </span>
                  <ChevronRight className="overview-history__chevron" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {state.snapshot && error && (
        <div className="overview-history__stale" role="alert">
          <span>{t.overviewHistoryRefreshFailed}</span>
          <button type="button" onClick={() => void controller.refresh(query)}>{t.overviewHistoryRetry}</button>
        </div>
      )}
    </section>
  );
}

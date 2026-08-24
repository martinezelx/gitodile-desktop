import { useMemo } from "react";
import {
  ChevronRight,
  CircleAlert,
  GitCommitHorizontal,
  LoaderCircle,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import {
  formatHistoryDate,
  useActiveHistoryState,
  type HistoryController,
  type SavedVersionSummary,
} from "../history";

const HISTORY_PREVIEW_LIMIT = 4;

function versionTitle(version: SavedVersionSummary, fallback: string): string {
  return version.subject.trim() || fallback;
}

export function HistorySummarySection({
  controller,
  projectPath,
  sessionEpoch,
  isRefreshing = false,
  onOpenHistory,
}: {
  controller: HistoryController;
  projectPath: string;
  sessionEpoch: string;
  isRefreshing?: boolean;
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
    <section className="overview-history" aria-labelledby="overview-history-title" aria-busy={state.isLoading || isRefreshing}>
      <header className="overview-history__header">
        <div className="overview-history__heading">
          <span className="overview-history__icon" aria-hidden="true">
            {state.isLoading || isRefreshing ? <LoaderCircle className="icon--spinning" /> : <GitCommitHorizontal />}
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
                    </span>
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
        </div>
      )}
    </section>
  );
}

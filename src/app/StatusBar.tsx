import React from "react";
import { Cloud, FileDiff, GitBranch, RotateCw } from "lucide-react";

import { useLanguage } from "../i18n";

/**
 * VISUAL PREVIEW — NOT WIRED TO ANYTHING.
 *
 * Every value below is a fixed sample chosen to show the bar at a realistic
 * width: a short branch name, a non-zero change count, a settled sync state.
 * Nothing here reads the open project, and the bar will keep saying exactly
 * this whatever the repository is doing.
 *
 * That is deliberate for now — the point is to settle how the bar looks before
 * deciding what it reports — but it also makes this the one thing in the app
 * that can state something untrue about a repository. Wire it before it ships:
 * the branch comes from the active session, the counts from the changes
 * feature, and the sync line from the sync controller.
 */
const PREVIEW = {
  branch: "main",
  unsavedCount: 4,
  lastChecked: "hace 3 min",
} as const;

export function StatusBar(): React.JSX.Element {
  const { t } = useLanguage();

  return (
    <footer className="status-bar" aria-label={t.statusBarAriaLabel}>
      <div className="status-bar__group">
        <span className="status-bar__item">
          <GitBranch aria-hidden="true" />
          <span>{PREVIEW.branch}</span>
        </span>
        <span className="status-bar__item">
          <FileDiff aria-hidden="true" />
          <span>{t.statusBarUnsaved(PREVIEW.unsavedCount)}</span>
        </span>
      </div>

      <div className="status-bar__group">
        {/* One fact, three parts: state, when it was learned, and how to learn
            it again. They sit closer to each other than to anything else, so
            the grouping is read from the spacing rather than drawn. */}
        <span className="status-bar__cluster">
          <span className="status-bar__item">
            <Cloud aria-hidden="true" />
            <span>{t.statusBarUpToDate}</span>
          </span>
          <span className="status-bar__item status-bar__item--muted">
            {t.statusBarLastChecked(PREVIEW.lastChecked)}
          </span>
          {/* Disabled on purpose while the bar is a preview: a control that
              silently does nothing is worse than one that says it cannot. */}
          <button
            className="status-bar__action"
            type="button"
            disabled
            aria-label={t.statusBarCheckNow}
          >
            <RotateCw aria-hidden="true" />
          </button>
        </span>
        <span className="status-bar__item status-bar__item--muted">
          {t.statusBarVersion(__APP_VERSION__)}
        </span>
      </div>
    </footer>
  );
}

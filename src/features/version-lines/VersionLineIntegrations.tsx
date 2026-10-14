import React from "react";
import { GitCommitHorizontal, GitCompare, GitMerge } from "lucide-react";
import { useLanguage } from "../../i18n";
import { formatNumber } from "../../shared/i18n";
import type { VersionLine, VersionLineRoute } from "./domain";

type Integration = {
  key: string;
  icon: React.ReactNode;
  /** The quick switch's and the row menu's own words, Git's verb included,
   * so the action is called the same wherever it is offered. */
  title: string;
  /** What it would do, in plain words. */
  detail: string;
  /** Why it cannot run now, in a word, when the reason is the line's state
   * rather than the flow still to come. */
  blocked?: string;
};

/** What the selected line can do with another one: the quick switch's three
 * actions, each naming both ends, with what it would do in one sentence.
 *
 * For another line the other end is the line the project is on — bringing
 * this one into it, moving it on top of this one, comparing the two — exactly
 * the row menu's three, in their words. For the active line it is the main line the route is
 * measured against: bringing in what main did meanwhile, bringing this line
 * into main, comparing with it. Nothing to say for the main line itself, or
 * with no line checked out.
 *
 * None of the flows exists yet, so every row is stated and marked `Soon`
 * rather than hidden; a row that could not run anyway says why instead. */
export function VersionLineIntegrations({
  line,
  activeName,
  mainName,
  route,
}: {
  line: VersionLine;
  /** The line the project is on, `null` when none is checked out. */
  activeName: string | null;
  mainName: string | null;
  /** The route read, `null` while it is out or when there is none: the
   * sentences fall back to what holds without its numbers. */
  route: VersionLineRoute | null;
}): React.JSX.Element | null {
  const { t, formats } = useLanguage();
  const items: Integration[] = [];

  if (line.isActive) {
    const base = route?.base ?? mainName;
    if (!base || base === line.name) return null;
    /* What main saved since this line's tip. For a line still away that is
       the route's count; for one that came back the route counts only up to
       the merge, so the merge and what followed it are added. */
    const newer = route === null ? 0 : route.merge ? route.baseCount + 1 + route.merge.afterCount : route.baseCount;
    const upToDate = route !== null && newer === 0;
    items.push({
      key: "update",
      icon: <GitMerge />,
      title: t.versionLinesMergeFrom(base),
      detail: route === null
        ? t.versionLinesActionUpdateFromDetail(base)
        : upToDate
          ? t.versionLinesActionUpdateFromCurrent(base)
          : t.versionLinesActionUpdateFromNews(base, newer, formatNumber(newer, formats)),
      blocked: upToDate ? t.versionLinesActionUpToDate : undefined,
    });
    // A line that already came back has nothing left to bring.
    if (!route?.merge) {
      items.push({
        key: "merge",
        icon: <GitMerge />,
        title: t.versionLinesMergeInto(base),
        detail: t.versionLinesActionBringIntoBase(
          base,
          route?.ownCount ?? null,
          formatNumber(route?.ownCount ?? 0, formats),
        ),
      });
    }
    const changes = route?.changes ?? null;
    items.push({
      key: "compare",
      icon: <GitCompare />,
      title: t.versionLinesCompareWith(base),
      detail: changes
        ? t.versionLinesActionCompareTotals(
            changes.filesChanged,
            formatNumber(changes.filesChanged, formats),
            formatNumber(changes.additions, formats),
            formatNumber(changes.deletions, formats),
          )
        : t.versionLinesActionCompareDetail,
    });
  } else {
    if (!activeName) return null;
    items.push(
      {
        key: "merge",
        icon: <GitMerge />,
        title: t.versionLinesMergeInto(activeName),
        detail: t.versionLinesActionBringIntoActive,
      },
      {
        key: "rebase",
        icon: <GitCommitHorizontal />,
        title: t.versionLinesRebaseOnto(activeName),
        detail: t.versionLinesActionMoveOntoDetail,
      },
      {
        key: "compare",
        icon: <GitCompare />,
        title: t.versionLinesCompareWith(activeName),
        detail: t.versionLinesActionCompareLinesDetail,
      },
    );
  }

  return (
    <section className="version-lines-card" aria-label={t.versionLinesActionsTitle}>
      <div className="version-lines-card__head">
        <h3>{t.versionLinesActionsTitle}</h3>
      </div>
      {/* Rows rather than buttons while no flow is behind them: a disabled
          button with nothing to become is a control pretending. The tile and
          the `Soon` keep the shape they will have once they open a preview. */}
      <ul className="version-lines-integrations">
        {items.map((item) => (
          <li key={item.key} aria-disabled="true">
            <span className="version-lines-integrations__tile" aria-hidden="true">{item.icon}</span>
            <span className="version-lines-integrations__text">
              <span className="version-lines-integrations__title">{item.title}</span>
              <span className="version-lines-integrations__detail">{item.detail}</span>
            </span>
            <span className="version-lines-quick-switch__soon">{item.blocked ?? t.versionLinesSoon}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

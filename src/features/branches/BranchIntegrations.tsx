import React from "react";
import { GitCommitHorizontal, GitCompare, GitMerge } from "lucide-react";
import { useLanguage } from "../../i18n";
import { formatNumber } from "../../shared/i18n";
import type { Branch, BranchRoute } from "./domain";

type Integration = {
  key: string;
  icon: React.ReactNode;
  /** The quick switch's and the row menu's own words, Git's verb included,
   * so the action is called the same wherever it is offered. */
  title: string;
  /** What it would do, in plain words. */
  detail: string;
  /** Why it cannot run now, in a word, when the reason is the branch's state
   * rather than the flow still to come. */
  blocked?: string;
};

/** What the selected branch can do with another one: the quick switch's three
 * actions, each naming both ends, with what it would do in one sentence.
 *
 * For another branch the other end is the branch the project is on — bringing
 * this one into it, moving it on top of this one, comparing the two — exactly
 * the row menu's three, in their words. For the active branch it is the main branch the route is
 * measured against: bringing in what main did meanwhile, bringing this branch
 * into main, comparing with it. Nothing to say for the main branch itself, or
 * with no branch checked out.
 *
 * None of the flows exists yet, so every row is stated and marked `Soon`
 * rather than hidden; a row that could not run anyway says why instead. */
export function BranchIntegrations({
  branch,
  activeName,
  mainName,
  route,
}: {
  branch: Branch;
  /** The branch the project is on, `null` when none is checked out. */
  activeName: string | null;
  mainName: string | null;
  /** The route read, `null` while it is out or when there is none: the
   * sentences fall back to what holds without its numbers. */
  route: BranchRoute | null;
}): React.JSX.Element | null {
  const { t, formats } = useLanguage();
  const items: Integration[] = [];

  if (branch.isActive) {
    const base = route?.base ?? mainName;
    if (!base || base === branch.name) return null;
    /* What main saved since this branch's tip. For a branch still away that is
       the route's count; for one that came back the route counts only up to
       the merge, so the merge and what followed it are added. */
    const newer = route === null ? 0 : route.merge ? route.baseCount + 1 + route.merge.afterCount : route.baseCount;
    const upToDate = route !== null && newer === 0;
    items.push({
      key: "update",
      icon: <GitMerge />,
      title: t.branchesMergeFrom(base),
      detail: route === null
        ? t.branchesActionUpdateFromDetail(base)
        : upToDate
          ? t.branchesActionUpdateFromCurrent(base)
          : t.branchesActionUpdateFromNews(base, newer, formatNumber(newer, formats)),
      blocked: upToDate ? t.branchesActionUpToDate : undefined,
    });
    // A branch that already came back has nothing left to bring.
    if (!route?.merge) {
      items.push({
        key: "merge",
        icon: <GitMerge />,
        title: t.branchesMergeInto(base),
        detail: t.branchesActionBringIntoBase(
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
      title: t.branchesCompareWith(base),
      detail: changes
        ? t.branchesActionCompareTotals(
            changes.filesChanged,
            formatNumber(changes.filesChanged, formats),
            formatNumber(changes.additions, formats),
            formatNumber(changes.deletions, formats),
          )
        : t.branchesActionCompareDetail,
    });
  } else {
    if (!activeName) return null;
    items.push(
      {
        key: "merge",
        icon: <GitMerge />,
        title: t.branchesMergeInto(activeName),
        detail: t.branchesActionBringIntoActive,
      },
      {
        key: "rebase",
        icon: <GitCommitHorizontal />,
        title: t.branchesRebaseOnto(activeName),
        detail: t.branchesActionMoveOntoDetail,
      },
      {
        key: "compare",
        icon: <GitCompare />,
        title: t.branchesCompareWith(activeName),
        detail: t.branchesActionCompareBranchesDetail,
      },
    );
  }

  return (
    <section className="branches-card" aria-label={t.branchesActionsTitle}>
      <div className="branches-card__head">
        <h3>{t.branchesActionsTitle}</h3>
      </div>
      {/* Rows rather than buttons while no flow is behind them: a disabled
          button with nothing to become is a control pretending. The tile and
          the `Soon` keep the shape they will have once they open a preview. */}
      <ul className="branches-integrations">
        {items.map((item) => (
          <li key={item.key} aria-disabled="true">
            <span className="branches-integrations__tile" aria-hidden="true">{item.icon}</span>
            <span className="branches-integrations__text">
              <span className="branches-integrations__title">{item.title}</span>
              <span className="branches-integrations__detail">{item.detail}</span>
            </span>
            <span className="branches-quick-switch__soon">{item.blocked ?? t.branchesSoon}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

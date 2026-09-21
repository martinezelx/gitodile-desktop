import { useEffect, useRef } from "react";

import { useLanguage } from "../../i18n";
import type { WorkbenchTab } from "../../runtime/project/sessions";

export const WORKBENCH_TABS: readonly WorkbenchTab[] = ["changes", "history"];

export function workbenchTabId(tab: WorkbenchTab): string {
  return `workbench-tab-${tab}`;
}

export function workbenchPanelId(tab: WorkbenchTab): string {
  return `workbench-panel-${tab}`;
}

/** The pair is rendered once per view, inside that view's header, and the
 * view that held the pressed tab is hidden the moment the tab changes — so
 * the focused button goes out of the tree with it and focus would fall to
 * the body. A change made from the tabs asks the *visible* copy to take
 * focus on its next render; a change made from elsewhere (a deep link, the
 * palette) does not move focus at all. */
let focusAfterChange = false;

/** The pair at the head of the list panel: two equal halves, the way GitHub
 * Desktop heads its sidebar. It replaces the title the panel used to carry
 * (task 126), so it is rendered *by* the panel, in its header, rather than
 * as a row above it — the tab is what names the column now.
 *
 * Roving focus in the WAI-ARIA tabs shape: one tab in the tab order, arrows
 * move between them and select as they go, since there are two and the
 * panels are already mounted. */
export function WorkbenchTabs({
  active,
  onChange,
}: {
  active: WorkbenchTab;
  onChange: (tab: WorkbenchTab) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const buttons = useRef<Partial<Record<WorkbenchTab, HTMLButtonElement | null>>>({});
  const labels: Record<WorkbenchTab, string> = {
    changes: t.workbenchTabChanges,
    history: t.workbenchTabHistory,
  };

  const select = (tab: WorkbenchTab): void => {
    if (tab === active) {
      buttons.current[tab]?.focus();
      return;
    }
    focusAfterChange = true;
    onChange(tab);
  };

  // On every render rather than on `active`: the copy inside a hidden view
  // is frozen while it is hidden, so it never saw the tab change and comes
  // back rendering the same `active` it left with.
  useEffect(() => {
    if (!focusAfterChange) return;
    const button = buttons.current[active];
    if (!button || button.closest("[hidden]")) return;
    focusAfterChange = false;
    button.focus();
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const index = WORKBENCH_TABS.indexOf(active);
    let next: WorkbenchTab | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = WORKBENCH_TABS[(index + 1) % WORKBENCH_TABS.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = WORKBENCH_TABS[(index - 1 + WORKBENCH_TABS.length) % WORKBENCH_TABS.length];
    } else if (event.key === "Home") {
      next = WORKBENCH_TABS[0];
    } else if (event.key === "End") {
      next = WORKBENCH_TABS[WORKBENCH_TABS.length - 1];
    }
    if (next) {
      event.preventDefault();
      select(next);
    }
  };

  return (
    <div className="workbench-tabs" role="tablist" aria-label={t.workbenchTabsAriaLabel}>
      {WORKBENCH_TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            ref={(element) => {
              buttons.current[tab] = element;
            }}
            id={workbenchTabId(tab)}
            className={`workbench-tabs__tab${isActive ? " workbench-tabs__tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={workbenchPanelId(tab)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => select(tab)}
            onKeyDown={onKeyDown}
          >
            {labels[tab]}
          </button>
        );
      })}
    </div>
  );
}

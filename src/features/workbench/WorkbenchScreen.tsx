import { Suspense } from "react";

import { useLanguage } from "../../i18n";
import type { WorkbenchTab } from "../../runtime/project/sessions";
import { KeepAliveViewSlot } from "../../runtime/screen/module";
import { LoadingBar } from "../../shared/ui";
import { WORKBENCH_TABS, WorkbenchTabs, workbenchPanelId, workbenchTabId } from "./WorkbenchTabs";

/** The Work screen: Changes and History in one place, switched by the tab
 * pair at the head of the list panel.
 *
 * The screen owns the tabs and the two keep-alive slots; the panels own their
 * layouts, unchanged from when each was a screen of its own. Each render prop
 * is handed the tab pair to draw in its list panel's header — the row its
 * title used to fill — so the panel decides where the tabs sit in every one of
 * its states, including the ones that used to drop the list panel altogether.
 *
 * Which tab shows is the caller's state (the project session's), not this
 * component's: a deep link from another screen sets it before navigating, and
 * a project remembers it across screen switches. */
export function WorkbenchScreen({
  tab,
  onTabChange,
  renderChanges,
  renderHistory,
}: {
  tab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  renderChanges: (tabs: React.ReactNode) => React.ReactNode;
  renderHistory: (tabs: React.ReactNode) => React.ReactNode;
}): React.JSX.Element {
  const { t } = useLanguage();
  const tabs = <WorkbenchTabs active={tab} onChange={onTabChange} />;
  const render: Record<WorkbenchTab, (tabs: React.ReactNode) => React.ReactNode> = {
    changes: renderChanges,
    history: renderHistory,
  };
  return (
    <div className="workbench">
      {/* The screen's one heading, for a screen reader: the tab names the
          view for the eye, and the rail names the screen. */}
      <h1 className="visually-hidden">{tab === "changes" ? t.workbenchTabChanges : t.workbenchTabHistory}</h1>
      {WORKBENCH_TABS.map((id) => (
        <KeepAliveViewSlot
          key={id}
          className="workbench__view"
          isActive={id === tab}
          id={workbenchPanelId(id)}
          role="tabpanel"
          aria-labelledby={workbenchTabId(id)}
        >
          {/* Each panel is a chunk of its own feature. The boundary sits here
              rather than around the panel so the tabs stay on screen while a
              chunk loads: the fallback is the list panel's shell with the tab
              pair in its header. Normally masked by the idle prefetch. */}
          <Suspense
            fallback={
              <div className="workbench__loading">
                <div className="workbench__loading-panel">
                  <header className="workbench__loading-header">{tabs}</header>
                  <LoadingBar label={t.commonLoading} />
                </div>
              </div>
            }
          >
            {render[id](tabs)}
          </Suspense>
        </KeepAliveViewSlot>
      ))}
    </div>
  );
}

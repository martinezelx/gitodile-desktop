import React from "react";
import { StatusBar, type StatusBarProps } from "../../app/StatusBar";
import { LanguageProvider } from "../../i18n";
import { EMPTY_TEAM_SYNC_STATE } from "../../features/sync";

const noop = (): void => undefined;

/** The strip at the foot of every project screen, with a project open: what
 * the names are given at each window width is the thing to check here. */
const props: StatusBarProps = {
  project: { name: "project-gitodile", branch: "release/0.4.1", headState: "branch" },
  workingTree: {
    isClean: false,
    counts: { changed: 2, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 3 },
    lineTotals: { added: 12, removed: 3 },
    entries: [],
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: true,
    upstream: { branch: "release/0.4.1", upstream: "origin/release/0.4.1", ahead: 0, behind: 0 },
  },
  workingTreeError: null,
  isCheckingChanges: false,
  branches: null,
  isLoadingBranches: false,
  teamSync: EMPTY_TEAM_SYNC_STATE,
  onSwitchBranch: noop,
  onSeeAllBranches: noop,
  onCheckTeamChanges: noop,
  projectSwitch: {
    entries: [{ id: "/repo", name: "project-gitodile", path: "/repo", contextLabel: null, branch: "release/0.4.1", hasError: false, hasOperationInProgress: false, hasUnsavedChanges: true, isFavourite: false }],
    recent: [],
    activeId: "/repo",
    canSwitch: true,
    isOpening: false,
    onActivate: noop, onOpenRecent: noop, onClose: noop, onOpenAnother: noop, onCreate: noop, onClone: noop,
    onToggleFavourite: noop, onOpenProjectSettings: noop, onOpenFolder: noop, onOpenHome: noop,
  },
  onPublish: noop,
  onGetChanges: noop,
  onGetAndPublish: noop,
  commandPalette: {
    isOpen: false, query: "", inputRef: React.createRef<HTMLInputElement>(), keyShortcuts: "Control+K",
    onOpen: noop, onQueryChange: noop, onKeyDown: noop,
  },
};

/** `windowWidth` is the whole window: the strip measures its field against
 * it, and sits inside it where the rail and the sheet's frame leave it. */
export function StatusBarSpecimen({ windowWidth }: { windowWidth: number }): React.JSX.Element {
  return (
    <div className="gallery__window" style={{ width: windowWidth }}>
      <div className="gallery__statusbar" data-width={windowWidth}>
        <LanguageProvider><StatusBar {...props} /></LanguageProvider>
      </div>
    </div>
  );
}

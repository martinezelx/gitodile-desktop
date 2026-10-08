import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  CloudDownload,
  CornerDownLeft,
  FolderInput,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Search,
  Star,
  X,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useActiveScreenEffect } from "../../runtime/screen/module";
import type { RecentProject } from "../../runtime/project/recentProjects";
import { formatRelativeTime } from "../../shared/i18n";
import {
  HostingProviderIcon,
  Mascot,
  TextPlaceholder,
  ProjectAvatar,
  type ProjectAvatarStyle,
  type ProjectIconChoice,
  type TechnologyId,
} from "../../shared/ui";
import type { RepositoryBrowserController } from "../repository-browser";
import {
  ACCOUNT_KIND_NAMES,
  classifyLauncherQuery,
  daySlot,
  groupAccountsByKind,
  greetingName,
  isPlausibleProjectName,
  matchRecentProjects,
  nextPromptIndex,
  planSetup,
  type HomeAccountKind,
  type HomeSetup,
} from "./launcher";
import { AccountResults, GitNotice, SetupStatus, SetupSteps, SetupStepsPlaceholder } from "./LauncherSetup";

/** A recent project plus whether it is one of the app's favourite projects —
 * the *same* favourites the rail and the project switcher show, from the same
 * store, so a project starred in either place is starred in both. Entries
 * arrive newest first: recency is what "Continue" and the Recent tab are about,
 * and favourites have a tab of their own. */
export type HomeRecentEntry = RecentProject & {
  isFavourite: boolean;
  iconChoice?: ProjectIconChoice;
  technology?: TechnologyId | null;
  avatarStyle?: ProjectAvatarStyle;
};

/** Rows the Recent tab lists with an empty query, "Continue" included. The
 * store keeps more (see `RECENT_PROJECTS_LIMIT`); searching reaches all of
 * them, so the resting list stays a launcher rather than a file manager. */
const RESTING_RECENTS = 5;
/** Matches listed while typing. */
const MATCHES_SHOWN = 6;

export type HomeLauncherProps = {
  isOpening: boolean;
  recentProjects: readonly HomeRecentEntry[];
  /** The Git identity's name, or null while unknown or unset. */
  userName?: string | null;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloneProject: () => void;
  /** Opens a recent project, or a folder path typed into the launcher. */
  onOpenRecentProject: (path: string) => void;
  /** Clone with a pasted address already filled in. Without it the launcher
   * still offers to clone, through the plain dialog. */
  onCloneFromUrl?: (url: string) => void;
  /** Create with a typed folder name already filled in. */
  onCreateNamedProject?: (name: string) => void;
  onToggleFavouriteRecentProject: (path: string) => void;
  onForgetRecentProject: (path: string) => void;
  hasOpenProjects?: boolean;
  playGreeting?: boolean;
  /** What this computer is set up with. Without it Home shows no setup
   * steps, Git notice or status line. */
  setup?: HomeSetup;
  /** Lists a connected account's projects under its tab, read only when
   * that tab is chosen. Without it there are no account tabs. */
  repositoryBrowser?: RepositoryBrowserController;
  onInstallGit?: () => void;
  onRecheckGit?: () => void;
  onOpenGitSettings?: () => void;
  onConfigureIdentity?: () => void;
  onConnectAccount?: () => void;
  onOpenAccountSettings?: (kind: HomeAccountKind) => void;
};

/** "recent", "favourites", or `account:<kind>` for a provider's accounts. */
type Tab = string;

const SETUP_HIDDEN_STORAGE_KEY = "gitodile-home-setup-hidden";

function readSetupHidden(): boolean {
  try {
    return localStorage.getItem(SETUP_HIDDEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const NO_BROWSER = {
  subscribe: () => () => {},
  snapshot: () => null,
};

/**
 * Home: a greeting, then one field that takes whatever the person has —
 * part of a project's name, a folder path, a remote address — and turns it
 * into the matching action, with recent and favourite projects underneath.
 *
 * With nothing typed, the most recently opened project leads as "Continue",
 * the one accent on the screen, and Enter in the empty field opens it. The
 * three ways to start something new stay at the foot as peers; the launcher
 * only ever *suggests* — a pasted address opens Clone filled in, a path goes
 * through the same open (and the same Rust validation) as the folder picker.
 */
export function HomeLauncher({
  isOpening,
  recentProjects,
  userName = null,
  onOpenProject,
  onCreateProject,
  onCloneProject,
  onOpenRecentProject,
  onCloneFromUrl,
  onCreateNamedProject,
  onToggleFavouriteRecentProject,
  onForgetRecentProject,
  hasOpenProjects = false,
  playGreeting = true,
  setup,
  repositoryBrowser,
  onInstallGit = () => {},
  onRecheckGit = () => {},
  onOpenGitSettings = () => {},
  onConfigureIdentity = () => {},
  onConnectAccount = () => {},
  onOpenAccountSettings = () => {},
}: HomeLauncherProps): React.JSX.Element {
  const { t, formats } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("recent");
  // Chosen per visit: a question that changed under the reader would be a
  // distraction, but each return to Home asks a different one.
  const [promptIndex, setPromptIndex] = useState(() => nextPromptIndex());
  const hasBeenActive = useRef(false);
  useActiveScreenEffect(() => {
    if (!hasBeenActive.current) {
      hasBeenActive.current = true;
      return;
    }
    // Coming back: a new question, an empty field, and the cursor in it —
    // `autoFocus` only covered the first arrival.
    setPromptIndex(nextPromptIndex());
    setQuery("");
    inputRef.current?.focus();
  }, []);
  const slot = daySlot(new Date().getHours());
  const now = Date.now();

  const [setupHidden, setSetupHidden] = useState(readSetupHidden);
  /* Which account a provider's tab shows, when it has more than one. */
  const [chosenAccounts, setChosenAccounts] = useState<Partial<Record<HomeAccountKind, string>>>({});
  const browserSource = repositoryBrowser ?? NO_BROWSER;
  const browser = useSyncExternalStore(browserSource.subscribe, browserSource.snapshot, browserSource.snapshot);

  const intent = classifyLauncherQuery(query);
  const favourites = recentProjects.filter((entry) => entry.isFavourite);
  const hasRecents = recentProjects.length > 0;
  const plan = setup ? planSetup(setup) : null;
  const gitBlocked = plan?.gitBlocked ?? false;
  const accountGroups = groupAccountsByKind(repositoryBrowser ? (setup?.accounts ?? []) : []);
  const tabGroup = accountGroups.find((group) => tab === `account:${group.kind}`);
  const tabIsValid = tab === "recent" || (tab === "favourites" && favourites.length > 0) || tabGroup !== undefined;
  // Saved connections still being checked: their tabs are coming, so the
  // row holds a place for them instead of appearing under the reader later.
  const pendingKinds = (setup?.pendingAccountKinds ?? []).filter(
    (kind) => !accountGroups.some((group) => group.kind === kind),
  );
  // One place per provider still being checked; one in all when nothing is
  // listed yet and the count is not known.
  const tabPlaceholders = !repositoryBrowser || !setup ? 0 : setup.accounts === null ? 1 : pendingKinds.length;
  const accountsLoading = tabPlaceholders > 0;
  const hasTabs = favourites.length > 0 || accountGroups.length > 0 || accountsLoading;
  // Searching reaches every recent project, so the tabs step aside, except
  // inside an account, where typing narrows that account's projects.
  const showTabs = hasTabs && (intent.kind === "empty" || (tabGroup !== undefined && intent.kind === "text"));
  const activeTab: Tab = showTabs && tabIsValid ? tab : "recent";
  const activeGroup = activeTab === tab ? tabGroup : undefined;
  const activeAccount = activeGroup
    ? (activeGroup.accounts.find((account) => account.id === chosenAccounts[activeGroup.kind]) ?? activeGroup.accounts[0])
    : undefined;
  // "Continue" is about returning to where you were. With projects already
  // open, Home is answering "what else?", and the newest closed project is no
  // more "where you left off" than any other.
  const continueEntry =
    intent.kind === "empty" && activeTab === "recent" && !hasOpenProjects ? recentProjects[0] : undefined;
  // The first-run steps fill the space recent projects will take, and wait
  // until every answer is in, so a step never flashes as missing.
  const setupLoaded =
    !!setup &&
    setup.git.state !== "checking" &&
    setup.identity !== null &&
    setup.accounts !== null &&
    (setup.pendingAccountKinds ?? []).length === 0;
  const showSetupSteps =
    !!plan &&
    setupLoaded &&
    !hasRecents &&
    !plan.complete &&
    !plan.gitBlocked &&
    !setupHidden &&
    intent.kind === "empty";
  const showStatus = !!setup && !!plan && !showSetupSteps;
  const rowsDisabled = isOpening || gitBlocked;

  const hideSetup = (): void => {
    setSetupHidden(true);
    try {
      localStorage.setItem(SETUP_HIDDEN_STORAGE_KEY, "true");
    } catch {
      // Hidden for this session only.
    }
  };

  const showAccount = (accountId: string): void => {
    if (!repositoryBrowser) return;
    // The one network read Home makes, and only on an explicit choice.
    repositoryBrowser.select(accountId);
    const state = repositoryBrowser.snapshot();
    if (!state.page && !state.pending) void repositoryBrowser.load(1);
  };

  const chooseTab = (next: Tab): void => {
    setTab(next);
    const group = accountGroups.find((candidate) => next === `account:${candidate.kind}`);
    if (!group) return;
    const account = group.accounts.find((candidate) => candidate.id === chosenAccounts[group.kind]) ?? group.accounts[0];
    showAccount(account.id);
  };

  const chooseAccount = (kind: HomeAccountKind, accountId: string): void => {
    setChosenAccounts((current) => ({ ...current, [kind]: accountId }));
    showAccount(accountId);
  };

  // The tab can come to show another account than the browser holds — its
  // chosen account was removed in Settings and the first remaining one stands
  // in. Load that one rather than leave an empty section with no state.
  const activeAccountId = activeAccount?.id ?? null;
  useEffect(() => {
    if (!activeAccountId || !repositoryBrowser) return;
    if (repositoryBrowser.snapshot().accountId !== activeAccountId) showAccount(activeAccountId);
    // `showAccount` only reads the controller, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, repositoryBrowser]);

  const run = (action: () => void): void => {
    setQuery("");
    action();
  };
  const openPath = (path: string): void => run(() => onOpenRecentProject(path));
  const cloneUrl = (url: string): void => run(() => (onCloneFromUrl ? onCloneFromUrl(url) : onCloneProject()));
  const createNamed = (name: string): void =>
    run(() => (onCreateNamedProject ? onCreateNamedProject(name) : onCreateProject()));

  const openedLabel = (entry: HomeRecentEntry): string | null =>
    entry.openedAt === undefined ? null : formatRelativeTime(new Date(entry.openedAt), formats, now);

  /* What Enter in the field does: the first suggestion, which is also the one
     drawn as selected. */
  let primary: (() => void) | null = null;
  let results: React.ReactNode = null;

  const recentRow = (entry: HomeRecentEntry, index: number, isPrimary: boolean): React.JSX.Element => (
    <RecentRow
      key={entry.path}
      index={index}
      entry={entry}
      opened={openedLabel(entry)}
      isPrimary={isPrimary}
      isDisabled={rowsDisabled}
      onOpen={openPath}
      onToggleFavourite={onToggleFavouriteRecentProject}
      onForget={onForgetRecentProject}
    />
  );

  if (activeAccount && (intent.kind === "empty" || intent.kind === "text")) {
    const repositories = browser?.accountId === activeAccount.id ? (browser.page?.repositories ?? null) : null;
    const text = intent.kind === "text" ? intent.text : "";
    const first = repositories
      ? matchRecentProjects(
          repositories.map((repository) => ({ ...repository, path: repository.fullName })),
          text,
        )[0]
      : undefined;
    primary = first ? () => cloneUrl(first.cloneUrl) : null;
    results = (
      <AccountResults
        account={activeAccount}
        siblings={activeGroup?.accounts ?? [activeAccount]}
        onChooseAccount={(accountId) => chooseAccount(activeAccount.kind, accountId)}
        repositories={repositories}
        hasMore={!!browser?.page?.nextPage}
        isPending={browser?.pending ?? false}
        hasError={!!browser?.error}
        query={text}
        isDisabled={rowsDisabled}
        onRetry={() => void repositoryBrowser?.load(1)}
        onClone={cloneUrl}
        onBrowseAll={() => run(onCloneProject)}
      />
    );
  } else if (
    intent.kind === "empty" &&
    !hasRecents &&
    !!plan &&
    !setupLoaded &&
    !plan.gitBlocked &&
    !setupHidden
  ) {
    results = <SetupStepsPlaceholder />;
  } else if (showSetupSteps && setup && plan) {
    results = (
      <SetupSteps
        setup={setup}
        plan={plan}
        onConfigureIdentity={onConfigureIdentity}
        onConnectAccount={onConnectAccount}
        onOpenGitSettings={onOpenGitSettings}
        onHide={hideSetup}
      />
    );
  } else if (intent.kind === "empty") {
    if (activeTab === "favourites") {
      primary = favourites[0] ? () => openPath(favourites[0].path) : null;
      results = (
        <>
          <ul className="home-launcher__list" aria-label={t.homeTabFavourites}>
            {favourites.map((entry, index) => recentRow(entry, index, index === 0))}
          </ul>
          {favourites.length <= 2 && (
            <p className="home-launcher__note">
              <Star aria-hidden="true" />
              {t.homeFavouritesEmpty}
            </p>
          )}
        </>
      );
    } else if (hasRecents) {
      const rest = recentProjects.slice(continueEntry ? 1 : 0, RESTING_RECENTS);
      primary = continueEntry ? () => openPath(continueEntry.path) : null;
      results = (
        <>
          {continueEntry && (
            <ContinueRow
              entry={continueEntry}
              opened={openedLabel(continueEntry)}
              isDisabled={rowsDisabled}
              isQuiet={gitBlocked}
              onOpen={openPath}
            />
          )}
          {rest.length > 0 && (
            <ul className="home-launcher__list" aria-label={t.homeRecentProjectsTitle}>
              {rest.map((entry, index) => recentRow(entry, index, false))}
            </ul>
          )}
        </>
      );
    }
  } else if (intent.kind === "url") {
    const sameName = intent.name
      ? recentProjects.filter((entry) => entry.name.toLocaleLowerCase() === intent.name?.toLocaleLowerCase())
      : [];
    primary = () => cloneUrl(intent.url);
    results = (
      <>
        <LauncherSection label={t.homeSectionRemote}>
          <ActionRow
            icon={<CloudDownload />}
            label={t.homeCloneUrl(intent.name)}
            hint={t.homeCloneUrlHint}
            enterLabel={t.homeActionClone}
            isPrimary
            isDisabled={rowsDisabled}
            onActivate={() => cloneUrl(intent.url)}
          />
        </LauncherSection>
        {sameName.length > 0 && (
          <LauncherSection label={t.homeSectionSameName}>
            <ul className="home-launcher__list">{sameName.map((entry, index) => recentRow(entry, index, false))}</ul>
          </LauncherSection>
        )}
      </>
    );
  } else if (intent.kind === "path") {
    const matches = matchRecentProjects(recentProjects, intent.path).slice(0, MATCHES_SHOWN);
    primary = () => openPath(intent.path);
    results = (
      <>
        <LauncherSection label={t.homeSectionActions}>
          <ActionRow
            icon={<FolderOpen />}
            label={t.homeOpenPath}
            hint={intent.path}
            enterLabel={t.homeActionOpen}
            isPrimary
            isDisabled={rowsDisabled}
            onActivate={() => openPath(intent.path)}
          />
        </LauncherSection>
        {matches.length > 0 && (
          <LauncherSection label={t.homeSectionProjects}>
            <ul className="home-launcher__list">{matches.map((entry, index) => recentRow(entry, index, false))}</ul>
          </LauncherSection>
        )}
      </>
    );
  } else {
    const matches = matchRecentProjects(recentProjects, intent.text).slice(0, MATCHES_SHOWN);
    const canCreate = isPlausibleProjectName(intent.text);
    primary = matches[0] ? () => openPath(matches[0].path) : canCreate ? () => createNamed(intent.text) : null;
    results = (
      <>
        {matches.length > 0 ? (
          <LauncherSection label={t.homeSectionProjects}>
            <ul className="home-launcher__list">{matches.map((entry, index) => recentRow(entry, index, index === 0))}</ul>
          </LauncherSection>
        ) : (
          <p className="home-launcher__note home-launcher__note--plain">{t.homeNoMatches(intent.text)}</p>
        )}
        {canCreate && (
          <LauncherSection label={t.homeSectionActions}>
            <ActionRow
              icon={<FolderInput />}
              label={t.homeCreateNamed(intent.text)}
              hint={t.homeCreateNamedHint}
              enterLabel={t.homeActionCreate}
              isPrimary={matches.length === 0}
              isDisabled={rowsDisabled}
              onActivate={() => createNamed(intent.text)}
            />
          </LauncherSection>
        )}
      </>
    );
  }

  /* Arrow keys walk the field and every row's main control; the star and
     Remove stay on Tab, where the row's own order puts them. */
  const moveFocus = (from: Element | null, step: 1 | -1): void => {
    const items = Array.from(
      resultsRef.current?.querySelectorAll<HTMLButtonElement>("[data-launcher-item]:not(:disabled)") ?? [],
    );
    const index = from === inputRef.current ? -1 : items.findIndex((item) => item === from);
    const next = index + step;
    if (next < 0) inputRef.current?.focus();
    else items[Math.min(next, items.length - 1)]?.focus();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && primary && !rowsDisabled) {
      event.preventDefault();
      primary();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(event.currentTarget, 1);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  };

  const handleResultsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute("data-launcher-item")) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(event.target, event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="home-launcher" aria-busy={isOpening}>
      {/* The front door is a brand moment, so the mascot greets here: once a
          session it draws itself and builds its history, then the commits on
          its crest light amber up to the HEAD now and then. Decorative; the
          h1 names the screen. */}
      <header className="home-launcher__hello">
        <Mascot motion="commits" entrance={playGreeting} className="home-launcher__mascot" />
        <div className="home-launcher__greeting">
          <h1>{t.homeGreeting(slot, greetingName(userName))}</h1>
          <p className="home-launcher__prompt">{t.homePrompt(slot, promptIndex)}</p>
        </div>
      </header>

      <div className="home-launcher__box">
        <label className="home-launcher__field">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            // The launcher is the screen's reason to exist; landing on Home
            // with the cursor already in it is the whole point of the field.
            autoFocus
            value={query}
            spellCheck={false}
            autoComplete="off"
            aria-label={t.homeLauncherLabel}
            placeholder={
              activeAccount
                ? t.homeAccountSearchPlaceholder(ACCOUNT_KIND_NAMES[activeAccount.kind])
                : hasRecents
                  ? t.homeLauncherPlaceholder
                  : t.homeLauncherPlaceholderFirst
            }
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
        </label>

        {showTabs && (
          <div className="home-launcher__tabs" role="group" aria-label={t.homeTabsLabel}>
            <button
              type="button"
              className="home-launcher__tab"
              aria-pressed={activeTab === "recent"}
              onClick={() => chooseTab("recent")}
            >
              {t.homeTabRecent}
            </button>
            {favourites.length > 0 && (
              <button
                type="button"
                className="home-launcher__tab"
                aria-pressed={activeTab === "favourites"}
                onClick={() => chooseTab("favourites")}
              >
                <Star aria-hidden="true" />
                {t.homeTabFavourites}
              </button>
            )}
            {accountGroups.map((group) => (
              <button
                key={group.kind}
                type="button"
                className="home-launcher__tab home-launcher__tab--account"
                aria-pressed={activeTab === `account:${group.kind}`}
                onClick={() => chooseTab(`account:${group.kind}`)}
              >
                <span className="home-launcher__tab-mark" aria-hidden="true">
                  <HostingProviderIcon provider={group.kind} />
                </span>
                {ACCOUNT_KIND_NAMES[group.kind]}
              </button>
            ))}
            {Array.from({ length: tabPlaceholders }, (_, index) => (
              <span
                key={index}
                className="home-launcher__tab home-launcher__tab--placeholder loading-placeholder"
                aria-hidden="true"
              >
                <TextPlaceholder className="text-placeholder--glyph" />
                <TextPlaceholder width={44} />
              </span>
            ))}
          </div>
        )}

        {gitBlocked && setup && (setup.git.state === "missing" || setup.git.state === "unusable") && (
          <GitNotice
            state={setup.git.state}
            isRechecking={setup.git.isRechecking}
            onInstallGit={onInstallGit}
            onRecheckGit={onRecheckGit}
          />
        )}

        {results && (
          <div className="home-launcher__results" ref={resultsRef} onKeyDown={handleResultsKeyDown}>
            {results}
          </div>
        )}

        <div className="home-launcher__footer">
          <StartButton
            icon={<FolderInput />}
            label={t.homeActionCreate}
            name={t.homeCreateLocalProject}
            hint={t.homeCreateLocalProjectHint}
            disabled={isOpening || gitBlocked}
            onClick={onCreateProject}
          />
          <StartButton
            // Opening is the only one of the three that runs here rather than
            // in a dialog, so its own button carries the progress.
            icon={isOpening ? <LoaderCircle className="icon--spinning" /> : <FolderPlus />}
            label={isOpening ? t.overviewOpening : t.homeActionOpen}
            name={isOpening ? t.overviewOpening : t.overviewOpenProject}
            hint={t.homeOpenProjectHint}
            disabled={isOpening || gitBlocked}
            onClick={onOpenProject}
          />
          <StartButton
            icon={<CloudDownload />}
            label={t.homeActionClone}
            name={t.homeCloneRemoteProject}
            hint={t.homeCloneRemoteProjectHint}
            disabled={isOpening || gitBlocked}
            onClick={onCloneProject}
          />
          {/* The window takes a dropped folder, and a gesture nobody is told
              about is a gesture nobody uses. */}
          <span className="home-launcher__drop">{t.homeDropHint}</span>
        </div>

        {showStatus && setup && plan && (
          <SetupStatus
            setup={setup}
            plan={plan}
            onOpenGitSettings={onOpenGitSettings}
            onConfigureIdentity={onConfigureIdentity}
            onOpenAccount={onOpenAccountSettings}
            onConnectAccount={onConnectAccount}
            showAccounts={accountGroups.length === 0}
          />
        )}
      </div>
    </div>
  );
}

function LauncherSection({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const id = useId();
  return (
    <section className="home-launcher__section" aria-labelledby={id}>
      <h2 className="home-launcher__section-title" id={id}>
        {label}
      </h2>
      {children}
    </section>
  );
}

function EnterHint({ label }: { label: string }): React.JSX.Element {
  return (
    <span className="home-launcher__enter" aria-hidden="true">
      <CornerDownLeft />
      {label}
    </span>
  );
}

/** The project to go back to: the Recent tab's first row, drawn as the one
 * thing to do — the accent pill breathes, as the Overview band's next step
 * does — and what Enter in the empty field opens. */
function ContinueRow({
  entry,
  opened,
  isDisabled,
  isQuiet = false,
  onOpen,
}: {
  entry: HomeRecentEntry;
  opened: string | null;
  isDisabled: boolean;
  /** Something more urgent holds the accent (a missing Git). */
  isQuiet?: boolean;
  onOpen: (path: string) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const nameId = useId();
  const detailId = useId();
  return (
    <button
      className="home-launcher__continue"
      type="button"
      data-launcher-item
      disabled={isDisabled}
      aria-labelledby={nameId}
      aria-describedby={detailId}
      onClick={() => onOpen(entry.path)}
    >
      <ProjectAvatar
        id={entry.path}
        name={entry.name}
        className="home-launcher__avatar home-launcher__avatar--large"
        iconChoice={entry.iconChoice}
        technology={entry.technology}
        style={entry.avatarStyle}
      />
      <span className="home-launcher__copy">
        <span className="home-launcher__kicker">{t.homeContinueKicker}</span>
        <span className="home-launcher__name home-launcher__name--large" id={nameId}>
          {entry.name}
        </span>
        <span className="home-launcher__path" id={detailId} data-tooltip={entry.path}>
          {opened ? `${entry.path} · ${opened}` : entry.path}
        </span>
      </span>
      <span className={isQuiet ? "home-launcher__go home-launcher__go--quiet" : "home-launcher__go attention-breathe"} aria-hidden="true">
        <CornerDownLeft />
        {t.homeContinueAction}
      </span>
    </button>
  );
}

/** A project this machine has opened before. The name is the accessible name
 * and the path is its description, so two projects that share a folder name
 * are still told apart. */
function RecentRow({
  index,
  entry,
  opened,
  isPrimary,
  isDisabled,
  onOpen,
  onToggleFavourite,
  onForget,
}: {
  index: number;
  entry: HomeRecentEntry;
  opened: string | null;
  isPrimary: boolean;
  /** Gates opening only. Starring and forgetting touch nothing but this
   * machine's own lists, so an open in flight is no reason to block them. */
  isDisabled: boolean;
  onOpen: (path: string) => void;
  onToggleFavourite: (path: string) => void;
  onForget: (path: string) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const nameId = useId();
  const pathId = useId();

  return (
    <li
      className={`home-launcher__item home-launcher__item--recent row-in${isPrimary ? " home-launcher__item--primary" : ""}${entry.isFavourite ? " home-launcher__item--favourite" : ""}`}
      style={{ "--row-index": index } as React.CSSProperties}
    >
      <button
        className="home-launcher__open"
        type="button"
        data-launcher-item
        disabled={isDisabled}
        aria-labelledby={nameId}
        aria-describedby={pathId}
        onClick={() => onOpen(entry.path)}
      >
        <ProjectAvatar
          id={entry.path}
          name={entry.name}
          className="home-launcher__avatar"
          iconChoice={entry.iconChoice}
          technology={entry.technology}
          style={entry.avatarStyle}
        />
        <span className="home-launcher__copy">
          <span className="home-launcher__name" id={nameId}>
            {entry.name}
          </span>
          <span className="home-launcher__path" id={pathId} data-tooltip={entry.path}>
            {entry.path}
          </span>
        </span>
        {isPrimary ? (
          <EnterHint label={t.homeActionOpen} />
        ) : (
          opened && <span className="home-launcher__time">{opened}</span>
        )}
      </button>
      {/* Before Remove, so the destructive control stays last in reading and
          tab order — and rendered at rest, because a marked favourite has to
          be readable without pointing at it. The same mark, strings and store
          as the switcher's own star. */}
      <button
        className={`home-launcher__favourite${entry.isFavourite ? " home-launcher__favourite--on" : ""}`}
        type="button"
        aria-pressed={entry.isFavourite}
        aria-label={
          entry.isFavourite ? t.projectSwitcherUnfavourite(entry.name) : t.projectSwitcherFavourite(entry.name)
        }
        data-tooltip={entry.isFavourite ? t.projectSwitcherUnfavouriteHint : t.projectSwitcherFavouriteHint}
        onClick={() => onToggleFavourite(entry.path)}
      >
        <Star aria-hidden="true" />
      </button>
      <button
        className="home-launcher__forget"
        type="button"
        aria-label={t.homeForgetRecentProject(entry.name)}
        data-tooltip={t.homeForgetRecentProjectShort}
        onClick={() => onForget(entry.path)}
      >
        <X aria-hidden="true" />
      </button>
    </li>
  );
}

/** A suggestion that is not a project: clone this address, open this folder,
 * create a project with this name. */
function ActionRow({
  icon,
  label,
  hint,
  enterLabel,
  isPrimary,
  isDisabled,
  onActivate,
}: {
  icon: React.JSX.Element;
  label: string;
  hint: string;
  enterLabel: string;
  isPrimary: boolean;
  isDisabled: boolean;
  onActivate: () => void;
}): React.JSX.Element {
  const labelId = useId();
  const hintId = useId();
  return (
    <button
      className={`home-launcher__action${isPrimary ? " home-launcher__action--primary" : ""}`}
      type="button"
      data-launcher-item
      disabled={isDisabled}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      onClick={onActivate}
    >
      <span className="home-launcher__glyph" aria-hidden="true">
        {icon}
      </span>
      <span className="home-launcher__copy">
        <span className="home-launcher__name" id={labelId}>
          {label}
        </span>
        <span className="home-launcher__path" id={hintId}>
          {hint}
        </span>
      </span>
      {isPrimary && <EnterHint label={enterLabel} />}
    </button>
  );
}

/** One of the three ways to start, at the launcher's foot. Peers: same shape,
 * no accent. The visible label is short; the accessible name is the full one
 * it begins with, and the hint is its description. */
function StartButton({
  icon,
  label,
  name,
  hint,
  disabled,
  onClick,
}: {
  icon: React.JSX.Element;
  label: string;
  name: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const hintId = useId();
  return (
    <button
      className="home-launcher__start"
      type="button"
      disabled={disabled}
      aria-label={name}
      aria-describedby={hintId}
      data-tooltip={hint}
      onClick={() => onClick()}
    >
      <span aria-hidden="true">{icon}</span>
      <span aria-hidden="true">{label}</span>
      <span className="visually-hidden" id={hintId}>
        {hint}
      </span>
    </button>
  );
}

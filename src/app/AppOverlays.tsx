import React, { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Dispatch, SetStateAction } from "react";
import { ArrowUpRight, Check, CircleAlert, Copy } from "lucide-react";
import { useLanguage } from "../i18n";
import type { DiffPreferences } from "../features/changes";
import {
  SettingsPanel,
  isGitInstallationBroken,
  readGitVersion,
  type DefaultBranchState,
  type GitIdentityState,
  type GitToolingState,
  type LineEndingsState,
  type NavigationPreferences,
  type RemoteCheckIntervalMinutes,
  type SettingsSection,
  type ThemePreference,
} from "../features/settings";
import {
  ProjectSettingsPanel,
  type ProjectSettingsCache,
  type ProjectSettingsSection,
  type ProjectSettingsTarget,
} from "../features/project-settings";
import {
  ChannelGlyph,
  DialogCloseButton,
  autoHideScrollbarProps,
  type ProjectAvatarStyle,
  type ProjectIconChoice,
  type TechnologyId,
} from "../shared/ui";
import { useModalFocus } from "../shared/ui/modalFocus";
import { CROCODILE_MARK, MOD_KEY_LABEL } from "./branding";
import { CURRENT_APP_RELEASE } from "./appRelease";
import { ChangelogDialog } from "./ChangelogDialog";
import { IssueReportDialog } from "./IssueReportDialog";
import type { IssueReportState } from "./useIssueReport";
import type { AppUpdatesController, AppUpdatesSnapshot, UpdateState } from "../features/app-updates";
import { AppUpdateDialog, AppUpdateSettingsControl, appUpdateTranslations } from "../features/app-updates";
import { describePlatform, formatDiagnostics, readWebviewVersion, useSystemInfo } from "./systemInfo";
import { describeStack, describeStackHost } from "./stack";
import { OperatingSystemMark, StackMark } from "./vendorMarks";

type BooleanSetter = Dispatch<SetStateAction<boolean>>;

/** The one line About can honestly say about updates: what the release model
 * knows and a person can act on. Every state names itself, so the line is never
 * blank — a development build with no feed reads "Updates unavailable" rather
 * than going silent — and only the one transient state with nothing useful to
 * say (`installing`) yields null. The design's own message is `upToDateLabel`
 * ("Up to date"), kept short because it rides the version line; the rest reuse
 * the update copy so the two surfaces cannot describe one build differently. */
function aboutUpdateStatus(
  state: UpdateState | undefined,
  t: ReturnType<typeof appUpdateTranslations>,
  upToDateLabel: string,
  unavailableLabel: string,
): { tone: "ok" | "attention" | "busy" | "muted"; label: string } | null {
  if (state === undefined) {
    return null;
  }
  switch (state.kind) {
    case "current":
      return { tone: "ok", label: upToDateLabel };
    case "idle":
      return { tone: "muted", label: t.status.idle };
    case "unavailable":
    case "failed":
    case "cancelled":
      return { tone: "muted", label: unavailableLabel };
    case "checking":
      return { tone: "busy", label: t.checking };
    case "downloading":
      return { tone: "busy", label: t.downloading };
    case "verifying":
      return { tone: "busy", label: t.verifying };
    case "available":
      return { tone: "attention", label: t.available(state.candidate.version) };
    case "ready":
      return { tone: "attention", label: t.ready };
    case "blocked":
      return { tone: "attention", label: t.status.blocked };
    default:
      return null;
  }
}

export type AppOverlaysProps = {
  issueReport: IssueReportState;
  settings: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    theme: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
    reducedMotion: boolean;
    setReducedMotion: BooleanSetter;
    projectAvatarStyle?: ProjectAvatarStyle;
    setProjectAvatarStyle?: (style: ProjectAvatarStyle) => void;
    section: SettingsSection;
    setSection: (section: SettingsSection) => void;
    gitTooling: GitToolingState;
    reopenLastProject: boolean;
    setReopenLastProject: BooleanSetter;
    confirmCloseProject: boolean;
    setConfirmCloseProject: BooleanSetter;
    watchProjects: boolean;
    setWatchProjects: BooleanSetter;
    remoteCheckInterval: RemoteCheckIntervalMinutes;
    setRemoteCheckInterval: Dispatch<SetStateAction<RemoteCheckIntervalMinutes>>;
    confirmDiscard: boolean;
    setConfirmDiscard: BooleanSetter;
    notificationsEnabled: boolean;
    setNotificationsEnabled: BooleanSetter;
    runGitHooks: boolean;
    setRunGitHooks: BooleanSetter;
    navigationItems: Array<{ id: string; label: string; icon: React.JSX.Element }>;
    navigationPreferences: NavigationPreferences;
    setNavigationPreferences: Dispatch<SetStateAction<NavigationPreferences>>;
    diffPreferences: DiffPreferences;
    setDiffPreferences: Dispatch<SetStateAction<DiffPreferences>>;
    /** Both read once after first paint and kept above this dialog, which is
     * unmounted on every close. The line-endings state already knows about the
     * open project, so the overlay never has to pass one down. */
    identity: GitIdentityState;
    defaultBranch: DefaultBranchState;
    lineEndings: LineEndingsState;
    automaticAppUpdates?: boolean;
    setAutomaticAppUpdates?: BooleanSetter;
    appUpdates?: AppUpdatesSnapshot;
    appUpdatesController?: AppUpdatesController;
  };
  /** The per-project panel. `project` is null exactly when no project is open,
   * which is also when nothing can open this dialog: every read behind it is
   * repository-scoped and needs a live session epoch. */
  projectSettings: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    project: (ProjectSettingsTarget & { name: string }) | null;
    section: ProjectSettingsSection;
    setSection: (section: ProjectSettingsSection) => void;
    /** Kept by the shell because this dialog is unmounted on every close: it is
     * what makes reopening it show the project's settings on the first frame
     * instead of a spinner. */
    cache: ProjectSettingsCache;
    /** The project's own icon choice and detected technology, for the icon
     * section; the choice is persisted by the shell, per project. */
    iconChoice?: ProjectIconChoice;
    technology?: TechnologyId | null;
    /** True when the technology read failed, so the section can say so rather
     * than claim nothing was detected. */
    technologyFailed?: boolean;
    avatarStyle?: ProjectAvatarStyle;
    onChooseIcon?: (choice: ProjectIconChoice) => void;
  };
  about: { isOpen: boolean; setOpen: BooleanSetter };
  changelog: { isOpen: boolean; setOpen: BooleanSetter };
  appUpdate?: { isOpen: boolean; setOpen: BooleanSetter };
  shortcuts: { isOpen: boolean; setOpen: BooleanSetter };
  closeConfirmation: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    projectName: string | null;
    onConfirm: () => void;
  };
  error: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    title: string;
    message: string | null;
    /** The way *out* of the failure — "turn this folder into a project" after
     * opening an ordinary folder. It is the constructive choice, so it takes
     * the primary button and Close steps down to secondary; when there is no
     * recovery, Close is the only action and keeps the primary treatment. */
    recoveryAction?: { label: string; onAction: () => void } | null;
  };
};

export function AppOverlays({
  issueReport,
  settings,
  projectSettings,
  about,
  changelog,
  appUpdate,
  shortcuts,
  closeConfirmation,
  error,
}: AppOverlaysProps): React.JSX.Element {
  const { t, language } = useLanguage();
  const systemInfo = useSystemInfo();
  const [didCopyDiagnostics, setDidCopyDiagnostics] = useState(false);
  /* The rail badges Updates only while there is something the reader can act
     on — a release to download or one ready to install — and names it. */
  const appUpdateState = settings.appUpdates?.state;
  const updateAttention =
    appUpdateState?.kind === "available" || appUpdateState?.kind === "ready"
      ? appUpdateTranslations(language).available(appUpdateState.candidate.version)
      : null;
  const aboutUpdate = aboutUpdateStatus(appUpdateState, appUpdateTranslations(language), t.aboutUpToDate, t.aboutUpdateUnavailable);
  const settingsRef = useRef<HTMLDivElement>(null);
  const projectSettingsRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The panel registers this when it has an identity draft that dismissing
  // would throw away. It returns true when it has taken over the close — by
  // saving first, or by asking — so the shell must not close behind it.
  const settingsCloseGuardRef = useRef<(() => boolean) | null>(null);
  const registerSettingsCloseGuard = useCallback((guard: (() => boolean) | null) => {
    settingsCloseGuardRef.current = guard;
  }, []);
  // `settings` is rebuilt by the caller on every render, so its setter is read
  // through a ref: a changing callback identity would make `useModalFocus`
  // reinstall its listener and re-steal focus on every keystroke in the panel.
  const setSettingsOpenRef = useRef(settings.setOpen);
  setSettingsOpenRef.current = settings.setOpen;
  const closeSettings = useCallback(() => {
    settingsCloseGuardRef.current = null;
    setSettingsOpenRef.current(false);
  }, []);
  // Shaped as a state setter because that is what `useModalFocus` takes; it
  // only ever calls it with `false`, exactly as SaveVersionDialog does.
  const requestSettingsClose = useCallback<BooleanSetter>(() => {
    if (settingsCloseGuardRef.current?.()) {
      return;
    }
    setSettingsOpenRef.current(false);
  }, []);

  /* The project panel guards its close the same way Settings does, and for the
     same reason: an ignore file being edited is work the user would lose
     without being asked. The guard returns true when it has taken the close
     over, so the shell must not close behind it. */
  const projectSettingsCloseGuardRef = useRef<(() => boolean) | null>(null);
  const registerProjectSettingsCloseGuard = useCallback((guard: (() => boolean) | null) => {
    projectSettingsCloseGuardRef.current = guard;
  }, []);
  const setProjectSettingsOpenRef = useRef(projectSettings.setOpen);
  setProjectSettingsOpenRef.current = projectSettings.setOpen;
  const closeProjectSettings = useCallback(() => {
    projectSettingsCloseGuardRef.current = null;
    setProjectSettingsOpenRef.current(false);
  }, []);
  const requestProjectSettingsClose = useCallback<BooleanSetter>(() => {
    if (projectSettingsCloseGuardRef.current?.()) {
      return;
    }
    setProjectSettingsOpenRef.current(false);
  }, []);

  // Read off the settings props because that is where Git tooling already
  // lives; About reports it, it does not own it.
  const gitVersion = readGitVersion(settings.gitTooling.diagnostics);
  // Both are constants for the life of the window, so they are read inline
  // rather than held in state: a regex over the user agent and a lookup over
  // four build-time strings cost less than the hook that would cache them.
  const webviewVersion = readWebviewVersion(navigator.userAgent);
  const stack = describeStack();
  const copyDiagnostics = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(
        formatDiagnostics({
          appVersion: CURRENT_APP_RELEASE.version,
          system: systemInfo,
          webview: webviewVersion,
          gitVersion,
        }),
      );
      setDidCopyDiagnostics(true);
    } catch {
      // Nothing useful to say: the button simply does not confirm.
    }
  };
  useEffect(() => {
    if (!didCopyDiagnostics) {
      return undefined;
    }
    const timer = window.setTimeout(() => setDidCopyDiagnostics(false), 2000);
    return () => window.clearTimeout(timer);
  }, [didCopyDiagnostics]);

  useModalFocus(settings.isOpen, settingsRef, requestSettingsClose);
  useModalFocus(projectSettings.isOpen, projectSettingsRef, requestProjectSettingsClose);
  useModalFocus(about.isOpen, aboutRef, about.setOpen);
  useModalFocus(shortcuts.isOpen, shortcutsRef, shortcuts.setOpen);
  useModalFocus(closeConfirmation.isOpen, closeRef, closeConfirmation.setOpen);
  useModalFocus(error.isOpen, errorRef, error.setOpen);

  return (
    <>
      <IssueReportDialog report={issueReport} />
      {settings.isOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => requestSettingsClose(false)}>
          <div
            ref={settingsRef}
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-dialog__header">
              <div className="settings-dialog__heading">
                <h2 id="settings-dialog-title">{t.navSettings}</h2>
              </div>
              {/* A broken Git installation stops every screen in the app, so it
                  cannot wait in the third section for someone to look. */}
              {isGitInstallationBroken(settings.gitTooling.diagnostics) && (
                <button
                  className={`settings-dialog__alert${
                    settings.section === "git" ? " settings-dialog__alert--active" : ""
                  }`}
                  type="button"
                  onClick={() => settings.setSection("git")}
                >
                  <CircleAlert aria-hidden="true" />
                  {t.settingsGitNeedsAttention}
                </button>
              )}
              <DialogCloseButton label={t.commonClose} onClick={() => requestSettingsClose(false)} />
            </header>
            <SettingsPanel
              theme={settings.theme}
              setTheme={settings.setTheme}
              reducedMotion={settings.reducedMotion}
              setReducedMotion={settings.setReducedMotion}
              projectAvatarStyle={settings.projectAvatarStyle}
              setProjectAvatarStyle={settings.setProjectAvatarStyle}
              activeSection={settings.section}
              onSectionChange={settings.setSection}
              gitDiagnostics={settings.gitTooling.diagnostics}
              gitUpdateStatus={settings.gitTooling.updateStatus}
              onCheckGitUpdate={settings.gitTooling.checkUpdate}
              isCheckingGitUpdate={settings.gitTooling.isCheckingUpdate}
              onRefreshGitDiagnostics={settings.gitTooling.refreshDiagnostics}
              isRefreshingGitDiagnostics={settings.gitTooling.isRefreshingDiagnostics}
              reopenLastProject={settings.reopenLastProject}
              setReopenLastProject={settings.setReopenLastProject}
              confirmCloseProject={settings.confirmCloseProject}
              setConfirmCloseProject={settings.setConfirmCloseProject}
              watchProjects={settings.watchProjects}
              setWatchProjects={settings.setWatchProjects}
              remoteCheckInterval={settings.remoteCheckInterval}
              setRemoteCheckInterval={settings.setRemoteCheckInterval}
              confirmDiscard={settings.confirmDiscard}
              setConfirmDiscard={settings.setConfirmDiscard}
              notificationsEnabled={settings.notificationsEnabled}
              setNotificationsEnabled={settings.setNotificationsEnabled}
              runGitHooks={settings.runGitHooks}
              setRunGitHooks={settings.setRunGitHooks}
              navigationItems={settings.navigationItems}
              navigationPreferences={settings.navigationPreferences}
              setNavigationPreferences={settings.setNavigationPreferences}
              diffPreferences={settings.diffPreferences}
              setDiffPreferences={settings.setDiffPreferences}
              identity={settings.identity}
              defaultBranch={settings.defaultBranch}
              lineEndingsState={settings.lineEndings}
              applicationUpdates={settings.appUpdates && settings.appUpdatesController && settings.setAutomaticAppUpdates ? (
                <AppUpdateSettingsControl
                  snapshot={settings.appUpdates}
                  controller={settings.appUpdatesController}
                  installed={CURRENT_APP_RELEASE}
                  enabled={settings.automaticAppUpdates ?? false}
                  setEnabled={settings.setAutomaticAppUpdates}
                  onOpenDialog={appUpdate ? () => appUpdate.setOpen(true) : undefined}
                />
              ) : null}
              applicationUpdateAttention={updateAttention}
              onClose={closeSettings}
              onRegisterCloseGuard={registerSettingsCloseGuard}
            />
          </div>
        </div>
      )}

      {projectSettings.isOpen && projectSettings.project && (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={() => requestProjectSettingsClose(false)}
        >
          <div
            ref={projectSettingsRef}
            className="settings-dialog project-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-settings-dialog-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-dialog__header">
              <div className="settings-dialog__heading">
                <h2 id="project-settings-dialog-title">{t.projectSettingsTitle}</h2>
                {/* The project is named in the header rather than only in the
                    body: this dialog looks like Settings, and the one thing it
                    must never be mistaken for is Settings. */}
                <p className="project-settings-dialog__project">{projectSettings.project.name}</p>
              </div>
              <DialogCloseButton
                label={t.commonClose}
                onClick={() => requestProjectSettingsClose(false)}
              />
            </header>
            <ProjectSettingsPanel
              project={{
                path: projectSettings.project.path,
                sessionEpoch: projectSettings.project.sessionEpoch,
              }}
              projectName={projectSettings.project.name}
              cache={projectSettings.cache}
              iconChoice={projectSettings.iconChoice}
              technology={projectSettings.technology}
              technologyFailed={projectSettings.technologyFailed}
              avatarStyle={projectSettings.avatarStyle}
              onChooseIcon={projectSettings.onChooseIcon}
              activeSection={projectSettings.section}
              onSectionChange={projectSettings.setSection}
              onClose={closeProjectSettings}
              onRegisterCloseGuard={registerProjectSettingsCloseGuard}
            />
          </div>
        </div>
      )}

      {about.isOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => about.setOpen(false)}>
          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            ref={aboutRef}
            className="about-dialog auto-hide-scrollbar"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <DialogCloseButton label={t.commonClose} onClick={() => about.setOpen(false)} />
            {/* The mark at hero scale, then the name, then the promise. The
                mark is decorative and stays out of the accessibility tree, and
                the h2 still carries the product name, so the dialog is named by
                the app it belongs to before it states its promise. */}
            <div className="about-dialog__hero">
              <span className="about-dialog__mark">{CROCODILE_MARK}</span>
              <h2 id="about-title">
                <span className="about-dialog__product-name">{t.aboutProductName}</span>{" "}
                <span className="about-dialog__tagline">{t.aboutHeading}</span>
              </h2>
            </div>
            <p className="about-dialog__release" aria-label={`GitOdile ${CURRENT_APP_RELEASE.version} ${CURRENT_APP_RELEASE.channel}`}>
              <span className="about-dialog__release-version">v{CURRENT_APP_RELEASE.version}</span>
              <ChannelGlyph channel={CURRENT_APP_RELEASE.channel} />
            </p>
            {/* The one line About can say about updates, and the way to the
                release notes. The state is named whenever the release model has
                one, so the slot is never blank and never an alarm About cannot
                explain; only `installing` leaves it to the link alone. */}
            <p className="about-dialog__update">
              {aboutUpdate && (
                <>
                  <span className={`about-dialog__update-status about-dialog__update-status--${aboutUpdate.tone}`}>
                    {aboutUpdate.tone === "ok" && <Check aria-hidden="true" />}
                    {aboutUpdate.label}
                  </span>
                  <span className="about-dialog__update-dot" aria-hidden="true">·</span>
                </>
              )}
              <button
                className="about-dialog__update-link"
                type="button"
                onClick={() => { about.setOpen(false); changelog.setOpen(true); }}
              >
                {t.changelogTitle}
              </button>
            </p>
            <p className="about-dialog__description">{t.aboutDescription}</p>
            <div className="about-dialog__rule" aria-hidden="true" />
            {(systemInfo || webviewVersion || gitVersion) && (
              <section className="about-technical" aria-labelledby="about-technical-title">
                {/* The copy control heads the rows it copies rather than
                    following them: "Your system" and the way to put it on the
                    clipboard are one thing, and a full-width button under the
                    list spent a line of height on the same idea. */}
                <div className="about-technical__head">
                  <h3 id="about-technical-title">{t.aboutTechnicalDetails}</h3>
                  <button
                    className="about-technical__copy"
                    type="button"
                    aria-label={didCopyDiagnostics ? undefined : t.aboutCopySystemInfo}
                    onClick={() => void copyDiagnostics()}
                  >
                    {didCopyDiagnostics ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {didCopyDiagnostics ? t.aboutCopied : t.aboutCopy}
                  </button>
                </div>
                <dl className="about-details">
                  {systemInfo && (
                    <>
                      {/* Name and build are separate rows on purpose. Windows 11
                          reports NT 10.0, so a combined "Windows 10.0.26200" tells
                          a Windows 11 user the wrong thing. */}
                      <div>
                        <dt>{t.aboutSystem}</dt>
                        <dd>
                          {/* The mark restates the value beside it rather than
                              adding a fact, so it sits inside the value and not
                              in a column of its own. */}
                          <span className="about-details__value">
                            <OperatingSystemMark platform={systemInfo.platform} />
                            {describePlatform(systemInfo)} ({systemInfo.arch})
                          </span>
                        </dd>
                      </div>
                      <div><dt>{t.aboutSystemVersion}</dt><dd>{systemInfo.version}</dd></div>
                    </>
                  )}
                  {webviewVersion && <div><dt>{t.aboutWebview}</dt><dd>{webviewVersion}</dd></div>}
                  {gitVersion && <div><dt>{t.aboutGitVersion}</dt><dd>{gitVersion}</dd></div>}
                </dl>
              </section>
            )}
            {/* Credits, kept apart from the diagnostics above because they are
                not diagnostics: every user on this build runs these same
                versions, so none of them can explain a machine-specific bug.
                One inline line rather than a row of tiles — a name and a number
                do not need a surface of their own. */}
            {stack.length > 0 && (
              <section className="about-stack" aria-labelledby="about-stack-title">
                <h3 id="about-stack-title">{t.aboutBuiltWith}</h3>
                <ul className="about-stack__list">
                  {stack.map((layer) => (
                    <li key={layer.id}>
                      {/* A button rather than an anchor: the destination is a
                          browser outside the app, not a document this webview
                          can navigate to, and an `href` here would let a middle
                          click replace the window the dialog is sitting in. */}
                      <button
                        className="about-stack__item"
                        type="button"
                        aria-label={t.aboutStackLink(layer.name, describeStackHost(layer.url))}
                        onClick={() => void openUrl(layer.url).catch(() => undefined)}
                      >
                        <StackMark layer={layer.id} />
                        <span className="about-stack__name">{layer.name}</span>
                        <span className="about-stack__version">{layer.version}</span>
                        <ArrowUpRight className="about-stack__go" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="about-dialog__footer">
              {t.aboutFooterMadeWith}{" "}
              <span className="about-dialog__heart" role="img" aria-label={t.aboutHeartLabel}>♥</span>{" "}
              {t.aboutFooterByAuthor}
            </p>
            <div className="about-dialog__legal">
              <span>{t.aboutLicense}</span>
              <span className="about-dialog__legal-links">
                <button type="button" onClick={() => void openUrl("https://github.com/martinezelx/gitodile-desktop/blob/main/LICENSE").catch(() => undefined)}>{t.aboutViewLicense}</button>
                <button type="button" onClick={() => void openUrl("https://github.com/martinezelx/gitodile-desktop").catch(() => undefined)}>{t.aboutViewSource}</button>
              </span>
            </div>
          </div>
        </div>
      )}

      <ChangelogDialog
        isOpen={changelog.isOpen}
        setOpen={changelog.setOpen}
        onCheckForUpdates={appUpdate && settings.appUpdatesController ? () => {
          changelog.setOpen(false);
          appUpdate.setOpen(true);
          void settings.appUpdatesController?.check();
        } : undefined}
      />
      {appUpdate && settings.appUpdates && settings.appUpdatesController && (
        <AppUpdateDialog isOpen={appUpdate.isOpen} setOpen={appUpdate.setOpen} snapshot={settings.appUpdates} controller={settings.appUpdatesController} installed={CURRENT_APP_RELEASE} />
      )}

      {shortcuts.isOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => shortcuts.setOpen(false)}>
          <div ref={shortcutsRef} className="about-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
            <DialogCloseButton label={t.commonClose} onClick={() => shortcuts.setOpen(false)} />
            <h2 id="shortcuts-title">{t.shortcutsDialogTitle}</h2>
            <ul className="shortcuts-list">
              <li><span>{t.shortcutsOpenPalette}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>K</kbd></span></li>
              <li><span>{t.shortcutsOpenSettings}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>,</kbd></span></li>
              <li><span>{t.shortcutsToggleSidebar}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>B</kbd></span></li>
              <li><span>{t.shortcutsNextProject}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>Tab</kbd></span></li>
              <li><span>{t.shortcutsPreviousProject}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>Shift</kbd><kbd>Tab</kbd></span></li>
              <li><span>{t.shortcutsCloseDialogs}</span><span className="shortcuts-list__keys"><kbd>Esc</kbd></span></li>
            </ul>
          </div>
        </div>
      )}

      {closeConfirmation.isOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => closeConfirmation.setOpen(false)}>
          <div ref={closeRef} className="message-dialog" role="dialog" aria-modal="true" aria-labelledby="close-confirm-title" aria-describedby="close-confirm-body" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="close-confirm-title">{t.closeConfirmTitle}</h2>
            <p id="close-confirm-body">{closeConfirmation.projectName ? t.closeConfirmBodyNamed(closeConfirmation.projectName) : t.closeConfirmBodyGeneric}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => closeConfirmation.setOpen(false)}>{t.commonCancel}</button>
              <button className="primary-button" type="button" onClick={closeConfirmation.onConfirm}>{t.overviewCloseProject}</button>
            </div>
          </div>
        </div>
      )}

      {error.isOpen && error.message && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => error.setOpen(false)}>
          {/* `aria-describedby` rather than a `role="alert"` on the message:
              an alertdialog already announces its own body on open, and the
              live region made a screen reader read the failure twice. */}
          <div ref={errorRef} className="message-dialog" role="alertdialog" aria-modal="true" aria-labelledby="open-error-title" aria-describedby="open-error-message" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
            <span className="message-dialog__icon" aria-hidden="true">
              <CircleAlert />
            </span>
            <h2 id="open-error-title">{error.title}</h2>
            <p id="open-error-message">{error.message}</p>
            {/* Dismiss first, constructive last — the order every other dialog
                in the app uses (Cancel then Close project, Cancel then Save). */}
            <div className="dialog-actions">
              <button
                className={error.recoveryAction ? "secondary-button" : "primary-button"}
                type="button"
                onClick={() => error.setOpen(false)}
              >
                {t.commonClose}
              </button>
              {error.recoveryAction && (
                <button className="primary-button" type="button" onClick={error.recoveryAction.onAction}>
                  {error.recoveryAction.label}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

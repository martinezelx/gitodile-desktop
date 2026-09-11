import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Cloud,
  EyeOff,
  Info,
  LoaderCircle,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { localizeAppError } from "../../shared/i18n";
import { autoHideScrollbarProps, moveFocusWithinRadioGroup } from "../../shared/ui";
import {
  IGNORE_SCOPES,
  PROJECT_SETTINGS_SECTIONS,
  hasIdentityDraftChanged,
  hasIgnoreDraftChanged,
  hasRemoteUrlChanged,
  identityDraftFrom,
  isIdentityDraftValid,
  projectSettingsSectionLabel,
  type ConnectRemotePlan,
  type IdentityDraft,
  type IgnoreFile,
  type IgnoreScope,
  type ProjectIdentity,
  type ProjectRemotes,
  type ProjectSettingsSection,
  type ProjectSettingsTarget,
} from "./domain";
import { remotesCacheKey, type ProjectSettingsCache } from "./cache";
import type { ProjectSettingsPort } from "./port";
import { projectSettingsPort } from "./tauriAdapter";

const SECTION_ICONS: Record<ProjectSettingsSection, React.JSX.Element> = {
  remote: <Cloud />,
  ignored: <EyeOff />,
  identity: <UserRound />,
};

type Notice = { tone: "success" | "neutral" | "warning" | "danger"; message: string };

const NOTICE_ICONS: Record<Notice["tone"], React.JSX.Element> = {
  success: <CheckCircle2 aria-hidden="true" />,
  neutral: <Info aria-hidden="true" />,
  warning: <TriangleAlert aria-hidden="true" />,
  danger: <CircleAlert aria-hidden="true" />,
};

/** `isLive` is what separates the outcome of an action — which a screen reader
 * has to hear without being asked — from a caption that is simply part of the
 * form. A permanent live region would announce the caption on mount and again
 * on every tone change. */
function NoticeLine({
  notice,
  isLive = true,
}: {
  notice: Notice | null;
  isLive?: boolean;
}): React.JSX.Element | null {
  if (!notice) {
    return null;
  }
  return (
    <p
      className={`settings-row__hint settings-row__hint--${notice.tone}`}
      role={isLive ? "status" : undefined}
    >
      {NOTICE_ICONS[notice.tone]}
      <span>{notice.message}</span>
    </p>
  );
}

/** One tab stop for the whole rail, arrows to move inside it — the same rule
 * the app-wide Settings rail follows, so the two panels are navigated
 * identically. */
function ProjectSettingsNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: ProjectSettingsSection;
  onSectionChange: (section: ProjectSettingsSection) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    const count = PROJECT_SETTINGS_SECTIONS.length;
    const next =
      step !== 0
        ? (index + step + count) % count
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? count - 1
            : -1;
    if (next < 0) {
      return;
    }
    event.preventDefault();
    onSectionChange(PROJECT_SETTINGS_SECTIONS[next]);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      className="settings-nav"
      role="tablist"
      aria-orientation="vertical"
      aria-label={t.projectSettingsSectionsAriaLabel}
    >
      {PROJECT_SETTINGS_SECTIONS.map((section, index) => {
        const isActive = section === activeSection;
        return (
          <button
            key={section}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`project-settings-tab-${section}`}
            aria-selected={isActive}
            aria-controls="project-settings-panel"
            tabIndex={isActive ? 0 : -1}
            data-autofocus={isActive ? "" : undefined}
            className={`settings-nav__item${isActive ? " settings-nav__item--active" : ""}`}
            onClick={() => onSectionChange(section)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span aria-hidden="true">{SECTION_ICONS[section]}</span>
            {projectSettingsSectionLabel(section, t)}
          </button>
        );
      })}
    </div>
  );
}

type Resource<T> = {
  data: T | null;
  error: unknown;
  isLoading: boolean;
  reload: () => void;
  set: (value: T) => void;
};

/**
 * One repository read, started when its section is first opened and repeated
 * only when the project or the thing being read changes.
 *
 * Sections load on demand rather than all at once: a user who came to fix a
 * remote URL should not pay for three `git config` processes and two file
 * reads. `key` is `null` while a section has never been visited, which is what
 * keeps that promise.
 */
function useResource<T>(
  key: string | null,
  load: () => Promise<T>,
  cache: ProjectSettingsCache | null,
): Resource<T> {
  // Seeded from the cache during the first render, so a reopened panel paints
  // real values on its first frame instead of a spinner it has to replace. The
  // key travels with the data: without it, an answer would be shown under a
  // question it was not the answer to — the other ignore list, most obviously.
  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    error: unknown;
    isLoading: boolean;
  }>(() => ({
    key,
    data: (key === null ? undefined : cache?.peek<T>(key)) ?? null,
    error: null,
    isLoading: key !== null,
  }));
  const [attempt, setAttempt] = useState(0);
  // Read through a ref so a fresh closure per render cannot restart the read.
  const loadRef = useRef(load);
  loadRef.current = load;
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  useEffect(() => {
    if (key === null) {
      return undefined;
    }
    let isCurrent = true;
    const remembered = cacheRef.current?.peek<T>(key);
    // A remembered answer stays on screen while it is being revalidated; only a
    // key with nothing behind it clears to a loading state.
    setState((current) => ({
      key,
      // Revalidating the same question keeps its answer on screen; a different
      // one starts empty rather than showing the previous answer as this one's.
      data: remembered ?? (current.key === key ? current.data : null),
      error: null,
      isLoading: true,
    }));
    const read = cacheRef.current
      ? cacheRef.current.read<T>(key, () => loadRef.current())
      : loadRef.current();
    read
      .then((data) => {
        if (isCurrent) setState({ key, data, error: null, isLoading: false });
      })
      .catch((error: unknown) => {
        if (isCurrent) setState({ key, data: null, error, isLoading: false });
      });
    return () => {
      isCurrent = false;
    };
  }, [key, attempt]);

  const reload = useCallback(() => {
    if (key !== null) cacheRef.current?.forget(key);
    setAttempt((value) => value + 1);
  }, [key]);
  const set = useCallback(
    (data: T) => {
      if (key !== null) cacheRef.current?.write(key, data);
      setState({ key, data, error: null, isLoading: false });
    },
    [key],
  );

  return { data: state.data, error: state.error, isLoading: state.isLoading, reload, set };
}

function SectionState({
  isLoading,
  error,
  onRetry,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  if (isLoading) {
    return (
      <p className="settings-row__hint" role="status">
        <LoaderCircle aria-hidden="true" className="icon--spinning" />
        <span>{t.projectSettingsLoading}</span>
      </p>
    );
  }
  if (error) {
    return (
      <div className="project-settings-failure">
        <p className="settings-row__hint settings-row__hint--danger" role="status">
          <CircleAlert aria-hidden="true" />
          <span>{localizeAppError(error, t, t.projectSettingsReadFailed)}</span>
        </p>
        <button className="secondary-button" type="button" onClick={onRetry}>
          {t.projectSettingsRetry}
        </button>
      </div>
    );
  }
  return null;
}

function RemoteSection({
  project,
  port,
  resource,
}: {
  project: ProjectSettingsTarget;
  port: ProjectSettingsPort;
  resource: Resource<ProjectRemotes>;
}): React.JSX.Element {
  const { t } = useLanguage();
  const remotes = resource.data;
  /* One edit per remote, held against the address it started from. Reseeding
     the fields from an effect whenever a fresh read landed meant a revalidation
     — which now happens on every opening, behind the cached answer — could
     overwrite what the user was typing. Comparing against `base` instead drops
     an edit exactly when Git's own value moved under it, and never otherwise. */
  const [edits, setEdits] = useState<Record<string, { base: string; text: string }>>({});
  const [pendingChange, setPendingChange] = useState<{ name: string; url: string } | null>(null);
  const [connectName, setConnectName] = useState("origin");
  const [connectUrl, setConnectUrl] = useState("");
  const [connectPlan, setConnectPlan] = useState<ConnectRemotePlan | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const hasRemoteDraft =
    Object.values(edits).some((edit) => edit.text !== edit.base) ||
    connectName !== "origin" ||
    connectUrl.trim() !== "" ||
    connectPlan !== null ||
    pendingChange !== null;
  useInstallDraftBlocker(
    `project-settings-remotes:${project.path}`,
    "project remote address",
    hasRemoteDraft,
  );

  const commitChange = async (name: string, url: string): Promise<void> => {
    setIsBusy(true);
    setNotice(null);
    try {
      resource.set(await port.setRemoteUrl(project, name, url));
      setNotice({ tone: "success", message: t.projectSettingsRemoteChanged(name) });
    } catch (error) {
      setNotice({ tone: "danger", message: localizeAppError(error, t, t.projectSettingsReadFailed) });
    } finally {
      setIsBusy(false);
      setPendingChange(null);
    }
  };

  const planConnect = async (): Promise<void> => {
    setIsBusy(true);
    setNotice(null);
    try {
      setConnectPlan(await port.planConnectRemote(project, connectName, connectUrl));
    } catch (error) {
      setNotice({ tone: "danger", message: localizeAppError(error, t, t.projectSettingsReadFailed) });
    } finally {
      setIsBusy(false);
    }
  };

  const commitConnect = async (plan: ConnectRemotePlan): Promise<void> => {
    setIsBusy(true);
    try {
      await port.connectRemote(project, plan.remoteName, connectUrl, plan.stateToken);
      setConnectPlan(null);
      setConnectUrl("");
      setNotice({ tone: "success", message: t.projectSettingsRemoteConnected(plan.remoteName) });
      resource.reload();
    } catch (error) {
      setNotice({ tone: "danger", message: localizeAppError(error, t, t.projectSettingsReadFailed) });
    } finally {
      setIsBusy(false);
    }
  };

  if (!remotes) {
    return (
      <div className="settings-groups">
        <section className="settings-group">
          <header className="settings-group__header">
            <h3>{t.projectSettingsRemoteTitle}</h3>
          </header>
          <div className="settings-group__body project-settings-body">
            <SectionState isLoading={resource.isLoading} error={resource.error} onRetry={resource.reload} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="settings-groups">
      <section className="settings-group">
        <header className="settings-group__header">
          <h3>
            {remotes.remotes.length === 0
              ? t.projectSettingsRemoteNoneTitle
              : t.projectSettingsRemoteTitle}
          </h3>
          <p>
            {remotes.remotes.length === 0
              ? t.projectSettingsRemoteNoneDescription
              : t.projectSettingsRemoteDescription}
          </p>
        </header>
        <div className="settings-group__body project-settings-body">
          {remotes.remotes.map((remote) => {
            const edit = edits[remote.name];
            const draft = edit && edit.base === remote.url ? edit.text : remote.url;
            const canSave = hasRemoteUrlChanged(draft, remote) && !isBusy;
            const isConfirming = pendingChange?.name === remote.name;
            return (
              <div className="project-settings-remote" key={remote.name}>
                <div className="project-settings-remote__head">
                  <strong>{remote.name}</strong>
                  {remotes.upstreamRemote === remote.name && (
                    <span className="project-settings-remote__badge">
                      {t.projectSettingsRemotePublishesHere}
                    </span>
                  )}
                </div>
                <div className="project-settings-remote__row">
                  <label className="text-field">
                    <span>{t.projectSettingsRemoteUrlLabel(remote.name)}</span>
                    <input
                      type="text"
                      spellCheck={false}
                      value={draft}
                      onChange={(event) => {
                        setEdits((current) => ({
                          ...current,
                          [remote.name]: { base: remote.url, text: event.target.value },
                        }));
                        // An open confirmation names the address it will write.
                        // Editing the field behind it means that address is no
                        // longer the one being asked about.
                        if (pendingChange?.name === remote.name) setPendingChange(null);
                      }}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!canSave}
                    onClick={() => setPendingChange({ name: remote.name, url: draft.trim() })}
                  >
                    {t.projectSettingsRemoteChange}
                  </button>
                </div>
                {remote.pushUrl && (
                  <p className="settings-row__hint">
                    <Info aria-hidden="true" />
                    <span>{t.projectSettingsRemotePushUrl(remote.pushUrl)}</span>
                  </p>
                )}
                {remote.hasHiddenCredentials && (
                  <p className="settings-row__hint settings-row__hint--warning">
                    <TriangleAlert aria-hidden="true" />
                    <span>{t.projectSettingsRemoteHiddenCredentials}</span>
                  </p>
                )}
                {isConfirming && (
                  <div className="project-settings-confirm">
                    <strong>{t.projectSettingsRemoteConfirmTitle}</strong>
                    <p>{t.projectSettingsRemoteConfirmFrom(remote.url)}</p>
                    <p>{t.projectSettingsRemoteConfirmTo(pendingChange.url)}</p>
                    <p>{t.projectSettingsRemoteConfirmEffect}</p>
                    {remote.hasHiddenCredentials && (
                      <p>{t.projectSettingsRemoteConfirmCredentials}</p>
                    )}
                    <div className="project-settings-confirm__actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setPendingChange(null)}
                      >
                        {t.projectSettingsCancel}
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void commitChange(remote.name, pendingChange.url)}
                      >
                        {isBusy ? t.projectSettingsSaving : t.projectSettingsRemoteConfirmAction}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {remotes.remotes.length === 0 && (
            <div className="project-settings-remote">
              <div className="project-settings-remote__row">
                <label className="text-field project-settings-remote__name">
                  <span>{t.projectSettingsRemoteNameLabel}</span>
                  <input
                    type="text"
                    spellCheck={false}
                    value={connectName}
                    onChange={(event) => {
                      setConnectName(event.target.value);
                      // The plan was made for the previous name and carries a
                      // token bound to it, so confirming it now would connect
                      // under a name this field no longer shows.
                      setConnectPlan(null);
                    }}
                  />
                </label>
                <label className="text-field">
                  <span>{t.projectSettingsRemoteNewUrlLabel}</span>
                  <input
                    type="text"
                    spellCheck={false}
                    value={connectUrl}
                    onChange={(event) => {
                      setConnectUrl(event.target.value);
                      setConnectPlan(null);
                    }}
                  />
                </label>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy || connectUrl.trim() === "" || connectName.trim() === ""}
                  onClick={() => void planConnect()}
                >
                  {t.projectSettingsRemoteConnect}
                </button>
              </div>
              {connectPlan && (
                <div className="project-settings-confirm">
                  <strong>{t.projectSettingsRemoteConnectConfirmTitle}</strong>
                  <p>{t.projectSettingsRemoteConfirmTo(connectPlan.fetchUrlDisplay)}</p>
                  <p>
                    {connectPlan.futureNetworkAccess
                      ? t.projectSettingsRemoteConnectNetwork
                      : t.projectSettingsRemoteConnectNoNetwork}
                  </p>
                  {connectPlan.credentialExpectation === "git-credential-helper" && (
                    <p>{t.projectSettingsRemoteCredentialHelper}</p>
                  )}
                  {connectPlan.credentialExpectation === "ssh-agent-or-key" && (
                    <p>{t.projectSettingsRemoteSshKey}</p>
                  )}
                  <div className="project-settings-confirm__actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setConnectPlan(null)}
                    >
                      {t.projectSettingsCancel}
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void commitConnect(connectPlan)}
                    >
                      {isBusy ? t.projectSettingsSaving : t.projectSettingsRemoteConnectAction}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <NoticeLine notice={notice} />
        </div>
      </section>
    </div>
  );
}

const IGNORE_UNAVAILABLE_KEYS = {
  too_large: "projectSettingsIgnoredTooLarge",
  not_text: "projectSettingsIgnoredNotText",
  unreadable: "projectSettingsIgnoredUnreadable",
} as const;

function IgnoredSection({
  project,
  port,
  scope,
  onScopeChange,
  resource,
  draft,
  onDraftChange,
  onSaved,
}: {
  project: ProjectSettingsTarget;
  port: ProjectSettingsPort;
  scope: IgnoreScope;
  onScopeChange: (scope: IgnoreScope) => void;
  resource: Resource<IgnoreFile>;
  draft: string;
  onDraftChange: (value: string) => void;
  /** Retires the edit that produced this save, so the close guard stops asking
   * about work that is now on disk. */
  onSaved: (scope: IgnoreScope) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const file = resource.data;
  const editorId = useId();
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const isDirty = hasIgnoreDraftChanged(draft, file);

  const save = async (): Promise<void> => {
    if (!file?.stateToken) return;
    setIsSaving(true);
    setNotice(null);
    try {
      const saved = await port.writeIgnoreFile(project, scope, draft, file.stateToken);
      // The fresh state token retires the edit that produced it, so the editor
      // shows what Git now has without a second copy of the text to keep in
      // step.
      resource.set(saved);
      onSaved(scope);
      setNotice({ tone: "success", message: t.projectSettingsIgnoredSaved(saved.relativePath) });
    } catch (error) {
      setNotice({ tone: "danger", message: localizeAppError(error, t, t.projectSettingsReadFailed) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-groups">
      <section className="settings-group">
        <header className="settings-group__header">
          <h3>{t.projectSettingsIgnoredTitle}</h3>
          <p>{t.projectSettingsIgnoredDescription}</p>
        </header>
        <div className="settings-group__body project-settings-body">
          <div className="settings-row">
            <div>
              <strong>{t.projectSettingsIgnoredScopeLabel}</strong>
              <p>
                {scope === "project"
                  ? t.projectSettingsIgnoredSharedDescription
                  : t.projectSettingsIgnoredPersonalDescription}
              </p>
            </div>
            <div
              className="segmented-control"
              role="radiogroup"
              aria-label={t.projectSettingsIgnoredScopeLabel}
              onKeyDown={moveFocusWithinRadioGroup}
            >
              {IGNORE_SCOPES.map((option) => {
                const isActive = option === scope;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    tabIndex={isActive ? 0 : -1}
                    className={`segmented-control__option${isActive ? " segmented-control__option--active" : ""}`}
                    onClick={() => onScopeChange(option)}
                  >
                    {option === "project"
                      ? t.projectSettingsIgnoredShared
                      : t.projectSettingsIgnoredPersonal}
                  </button>
                );
              })}
            </div>
          </div>

          {!file ? (
            <SectionState isLoading={resource.isLoading} error={resource.error} onRetry={resource.reload} />
          ) : file.unavailable ? (
            /* Not a live region: this is a property of the file, read in
               document order like the rest of the section, not the outcome of
               something the user just did. */
            <p className="settings-row__hint settings-row__hint--warning">
              <TriangleAlert aria-hidden="true" />
              <span>{t[IGNORE_UNAVAILABLE_KEYS[file.unavailable]]}</span>
            </p>
          ) : (
            <div className="project-settings-ignore">
              <label className="project-settings-ignore__label" htmlFor={editorId}>
                {t.projectSettingsIgnoredEditorLabel(file.relativePath)}
              </label>
              <textarea
                id={editorId}
                className="project-settings-ignore__editor"
                spellCheck={false}
                rows={12}
                placeholder={t.projectSettingsIgnoredPlaceholder}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
              />
              {!file.exists && (
                <p className="settings-row__hint">
                  <Info aria-hidden="true" />
                  <span>{t.projectSettingsIgnoredNotCreated(file.relativePath)}</span>
                </p>
              )}
              <div className="project-settings-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!isDirty || isSaving}
                  onClick={() => onDraftChange(file.contents ?? "")}
                >
                  {t.projectSettingsRevert}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!isDirty || isSaving}
                  onClick={() => void save()}
                >
                  {isSaving ? t.projectSettingsSaving : t.projectSettingsSave}
                </button>
              </div>
              <NoticeLine notice={notice} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function IdentitySection({
  project,
  port,
  resource,
  draft,
  onDraftChange,
  isOverriding,
  onOverrideChange,
}: {
  project: ProjectSettingsTarget;
  port: ProjectSettingsPort;
  resource: Resource<ProjectIdentity>;
  draft: IdentityDraft;
  onDraftChange: (draft: IdentityDraft) => void;
  isOverriding: boolean;
  onOverrideChange: (isOverriding: boolean) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const identity = resource.data;
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const nameId = useId();
  const emailId = useId();

  const isDirty = identity !== null && hasIdentityDraftChanged(draft, identity);
  const canSave = isDirty && isIdentityDraftValid(draft) && !isSaving;

  const save = async (): Promise<void> => {
    setIsSaving(true);
    setNotice(null);
    try {
      resource.set(await port.setIdentity(project, { name: draft.name.trim(), email: draft.email.trim() }));
      setNotice({ tone: "success", message: t.projectSettingsIdentitySaved });
    } catch (error) {
      setNotice({ tone: "danger", message: localizeAppError(error, t, t.projectSettingsReadFailed) });
    } finally {
      setIsSaving(false);
    }
  };

  const stopOverriding = async (): Promise<void> => {
    setIsSaving(true);
    setNotice(null);
    try {
      const cleared = await port.clearIdentity(project);
      resource.set(cleared);
      onDraftChange(identityDraftFrom(cleared));
      onOverrideChange(false);
      setNotice({ tone: "success", message: t.projectSettingsIdentityCleared });
    } catch (error) {
      setNotice({ tone: "danger", message: localizeAppError(error, t, t.projectSettingsReadFailed) });
      onOverrideChange(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (!identity) {
    return (
      <div className="settings-groups">
        <section className="settings-group">
          <header className="settings-group__header">
            <h3>{t.projectSettingsIdentityTitle}</h3>
          </header>
          <div className="settings-group__body project-settings-body">
            <SectionState isLoading={resource.isLoading} error={resource.error} onRetry={resource.reload} />
          </div>
        </section>
      </div>
    );
  }

  const hasInherited = Boolean(identity.inheritedName && identity.inheritedEmail);
  const isUnset = !identity.effectiveName || !identity.effectiveEmail;

  const chooseInherited = (): void => {
    if (isSaving || !isOverriding) return;
    // With a local override in place this is a write, not just a choice: the
    // project's own keys have to go for it to inherit again.
    if (identity.source === "project") {
      void stopOverriding();
      return;
    }
    onOverrideChange(false);
  };
  const chooseOverride = (): void => {
    if (isSaving || isOverriding) return;
    onOverrideChange(true);
    onDraftChange(identityDraftFrom(identity));
  };

  return (
    <div className="settings-groups">
      <section className="settings-group">
        <header className="settings-group__header">
          <h3>{t.projectSettingsIdentityTitle}</h3>
          <p>{t.projectSettingsIdentityDescription}</p>
        </header>
        <div className="settings-group__body project-settings-body">
          {/* The same stacked option cards Settings uses for line endings: each
              option needs a sentence, and the inherited one names the identity
              it actually means rather than making the reader look it up in a
              second block. */}
          <div
            className="choice-list"
            role="radiogroup"
            aria-label={t.projectSettingsIdentitySourceLabel}
            onKeyDown={moveFocusWithinRadioGroup}
          >
            <button
              type="button"
              role="radio"
              aria-checked={!isOverriding}
              tabIndex={isOverriding ? -1 : 0}
              disabled={isSaving}
              className={`choice-list__option${isOverriding ? "" : " choice-list__option--active"}`}
              onClick={chooseInherited}
            >
              <span className="choice-list__label">
                {t.projectSettingsIdentityUseGlobal}
                {!isOverriding && (
                  <span className="choice-list__badge">{t.projectSettingsIdentityInUse}</span>
                )}
              </span>
              <span className="choice-list__description">
                {hasInherited
                  ? t.projectSettingsIdentityGlobalDescription(
                      identity.inheritedName ?? "",
                      identity.inheritedEmail ?? "",
                    )
                  : t.projectSettingsIdentityGlobalUnsetDescription}
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isOverriding}
              tabIndex={isOverriding ? 0 : -1}
              disabled={isSaving}
              className={`choice-list__option${isOverriding ? " choice-list__option--active" : ""}`}
              onClick={chooseOverride}
            >
              <span className="choice-list__label">
                {t.projectSettingsIdentityUseProject}
                {isOverriding && (
                  <span className="choice-list__badge">{t.projectSettingsIdentityInUse}</span>
                )}
              </span>
              <span className="choice-list__description">
                {t.projectSettingsIdentityProjectDescription}
              </span>
            </button>
          </div>

          {/* The fields belong to the second option and appear with it, rather
              than sitting there disabled: the card above already spells out the
              inherited identity, so a read-only copy of it would be the third
              place saying the same thing. */}
          {isOverriding && (
            <div className="project-settings-identity__override">
              <div className="project-settings-identity__fields">
                <label className="text-field" htmlFor={nameId}>
                  <span>{t.projectSettingsIdentityNameLabel}</span>
                  <input
                    id={nameId}
                    type="text"
                    value={draft.name}
                    onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                  />
                </label>
                <label className="text-field" htmlFor={emailId}>
                  <span>{t.projectSettingsIdentityEmailLabel}</span>
                  <input
                    id={emailId}
                    type="email"
                    aria-invalid={isDirty && !isIdentityDraftValid(draft)}
                    value={draft.email}
                    onChange={(event) => onDraftChange({ ...draft, email: event.target.value })}
                  />
                </label>
              </div>
              <div className="project-settings-actions">
                {isDirty && !isIdentityDraftValid(draft) && (
                  <p className="settings-row__hint settings-row__hint--danger">
                    <CircleAlert aria-hidden="true" />
                    <span>{t.projectSettingsIdentityInvalid}</span>
                  </p>
                )}
                <button
                  className="primary-button"
                  type="button"
                  disabled={!canSave}
                  onClick={() => void save()}
                >
                  {isSaving ? t.projectSettingsSaving : t.projectSettingsSave}
                </button>
              </div>
            </div>
          )}

          {/* One quiet line of provenance under the list, the way the
              line-endings group states its own. The selected card says what was
              chosen; this says what Git will do with it. */}
          <div className="project-settings-status">
            {isUnset ? (
              <p className="project-settings-caveat">
                <TriangleAlert aria-hidden="true" />
                <span>{t.projectSettingsIdentityUnset}</span>
              </p>
            ) : (
              <p className="project-settings-status__source">
                {t.projectSettingsIdentityEffective(
                  identity.effectiveName ?? "",
                  identity.effectiveEmail ?? "",
                )}
              </p>
            )}
            <NoticeLine notice={notice} />
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The settings that belong to one open project: where it publishes, what it
 * ignores, and who it saves as.
 *
 * Everything here is repository-scoped, which is why the panel takes a project
 * with its session epoch rather than reading an ambient current one, and why
 * it is mounted only while a project is open.
 */
export function ProjectSettingsPanel({
  project,
  projectName,
  activeSection,
  onSectionChange,
  port = projectSettingsPort,
  cache,
  onClose,
  onRegisterCloseGuard,
}: {
  project: ProjectSettingsTarget;
  projectName: string;
  activeSection: ProjectSettingsSection;
  onSectionChange: (section: ProjectSettingsSection) => void;
  port?: ProjectSettingsPort;
  /** Answers kept between openings, owned by the shell because this panel is
   * unmounted every time it closes. Absent in tests that want a cold read. */
  cache?: ProjectSettingsCache | null;
  onClose?: () => void;
  /** Registered while an edit would be lost by closing, exactly as the
   * app-wide Settings panel guards its identity draft. */
  onRegisterCloseGuard?: (guard: (() => boolean) | null) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [visited, setVisited] = useState<ProjectSettingsSection[]>([activeSection]);
  const [ignoreScope, setIgnoreScope] = useState<IgnoreScope>("project");
  /* One edit per ignore list, held against the state token it started from
     rather than mirrored into state of its own.
     - Per **scope**, because two ignore files can hash to the same token (both
       absent, or holding the same rules), and keying on the token alone let one
       list's unsaved edit appear inside — and save into — the other.
     - Per **token**, because that is what retires an edit when the file is
       re-read: a saved write, a retry, or a switch to the other list.
     - Kept for both scopes at once, so switching lists to look at the other one
       is not a way to lose what you typed.
     `contents` rides along so the close guard can tell an edit from an untouched
     file without the other list's read still being loaded. */
  const [ignoreEdits, setIgnoreEdits] = useState<
    Partial<Record<IgnoreScope, { token: string; text: string; contents: string }>>
  >({});
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft>({ name: "", email: "" });
  const [isOverriding, setIsOverriding] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  /* Adjusted during render rather than from an effect: an effect would leave
     the newly opened section's read `null` for one committed frame, which is a
     wasted render and a wasted frame before the first Git process even starts.
     This is React's documented "adjust state when props change" path — the
     re-render happens before anything is shown. */
  if (!visited.includes(activeSection)) {
    setVisited([...visited, activeSection]);
  }

  const remotes = useResource(
    visited.includes("remote") ? remotesCacheKey(project) : null,
    () => port.readRemotes(project),
    cache ?? null,
  );
  /* Never cached, unlike the other two: it is the one read whose value the user
     edits, and serving a remembered copy while a fresh one is on its way would
     mean swapping the editor's contents out from under a draft. It is also the
     only read that costs no Git process, so there is nothing to save. */
  const ignoreFile = useResource(
    visited.includes("ignored")
      ? `ignore:${project.path}:${project.sessionEpoch}:${ignoreScope}`
      : null,
    () => port.readIgnoreFile(project, ignoreScope),
    null,
  );
  const identity = useResource(
    visited.includes("identity") ? `identity:${project.path}:${project.sessionEpoch}` : null,
    () => port.readIdentity(project),
    cache ?? null,
  );

  const ignoreToken = ignoreFile.data?.stateToken ?? null;
  const ignoreContents = ignoreFile.data?.contents ?? "";
  const ignoreEdit = ignoreEdits[ignoreScope];
  const ignoreDraft =
    ignoreEdit && ignoreEdit.token === ignoreToken ? ignoreEdit.text : ignoreContents;
  const setIgnoreDraft = (text: string): void => {
    if (ignoreToken === null) return;
    setIgnoreEdits((edits) => ({
      ...edits,
      [ignoreScope]: { token: ignoreToken, text, contents: ignoreContents },
    }));
  };
  const forgetIgnoreEdit = (scope: IgnoreScope): void => {
    setIgnoreEdits(({ [scope]: _saved, ...rest }) => rest);
  };

  // The override switch starts from what Git reports, and only when a fresh
  // read lands, so it never overwrites a choice already made.
  const identityData = identity.data;
  useEffect(() => {
    if (!identityData) return;
    setIsOverriding(identityData.source === "project");
    setIdentityDraft(identityDraftFrom(identityData));
  }, [identityData]);

  /** Which list has something unsaved, including one the user has switched
   * away from — losing it quietly on the way out is the whole reason the guard
   * exists. */
  const unsavedIgnoreScope =
    IGNORE_SCOPES.find((scope) => {
      const edit = ignoreEdits[scope];
      return edit !== undefined && edit.text !== edit.contents;
    }) ?? null;
  const hasUnsavedIdentity =
    isOverriding && identity.data !== null && hasIdentityDraftChanged(identityDraft, identity.data);
  useInstallDraftBlocker(
    `project-settings-editor:${project.path}`,
    unsavedIgnoreScope !== null ? "project ignore rules" : "project identity",
    unsavedIgnoreScope !== null || hasUnsavedIdentity,
  );

  /* Registered once and reading the current drafts through a ref: the shell
     stores the guard in a ref of its own, so re-registering per keystroke
     would be churn. It never saves on the user's behalf — writing an ignore
     file nobody asked to save is worse than asking. */
  const guardRef = useRef<() => boolean>(() => false);
  guardRef.current = () => {
    if (unsavedIgnoreScope === null && !hasUnsavedIdentity) {
      return false;
    }
    // Show the edit being asked about, which may be in the list the user is not
    // currently looking at.
    if (unsavedIgnoreScope !== null) {
      onSectionChange("ignored");
      setIgnoreScope(unsavedIgnoreScope);
    } else {
      onSectionChange("identity");
    }
    setIsConfirmingDiscard(true);
    return true;
  };

  useEffect(() => {
    onRegisterCloseGuard?.(() => guardRef.current());
    return () => onRegisterCloseGuard?.(null);
  }, [onRegisterCloseGuard]);

  return (
    <div className="settings-layout">
      <ProjectSettingsNav activeSection={activeSection} onSectionChange={onSectionChange} />
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="settings-view auto-hide-scrollbar"
        role="tabpanel"
        id="project-settings-panel"
        aria-labelledby={`project-settings-tab-${activeSection}`}
        tabIndex={0}
      >
        <p className="project-settings-scope">{t.projectSettingsScopeNote(projectName)}</p>

        {isConfirmingDiscard && (
          <div className="project-settings-confirm project-settings-confirm--discard">
            <strong>{t.projectSettingsUnsavedTitle}</strong>
            <p>{t.projectSettingsUnsavedBody}</p>
            <div className="project-settings-confirm__actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsConfirmingDiscard(false)}
              >
                {t.projectSettingsKeepEditing}
              </button>
              <button className="primary-button" type="button" onClick={() => onClose?.()}>
                {t.projectSettingsDiscardAndClose}
              </button>
            </div>
          </div>
        )}

        {activeSection === "remote" && (
          <RemoteSection project={project} port={port} resource={remotes} />
        )}
        {activeSection === "ignored" && (
          <IgnoredSection
            project={project}
            port={port}
            scope={ignoreScope}
            onScopeChange={setIgnoreScope}
            resource={ignoreFile}
            draft={ignoreDraft}
            onDraftChange={setIgnoreDraft}
            onSaved={forgetIgnoreEdit}
          />
        )}
        {activeSection === "identity" && (
          <IdentitySection
            project={project}
            port={port}
            resource={identity}
            draft={identityDraft}
            onDraftChange={setIdentityDraft}
            isOverriding={isOverriding}
            onOverrideChange={setIsOverriding}
          />
        )}
      </div>
    </div>
  );
}

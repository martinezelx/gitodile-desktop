import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, CircleAlert, LoaderCircle, Send } from "lucide-react";
import { useLanguage, type Translations } from "./i18n";
import { localizeAppError, isAppError } from "./appError";
import { useModalFocus } from "./modalFocus";
import { CATEGORY_ICONS } from "./changes";
import type { CommitFileChange, PublishPlan, PublishResult, RemoteDiscovery, RemoteInfo } from "./publish";

type DialogState =
  | { status: "loading" }
  | { status: "remote-selection"; remotes: RemoteInfo[] }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: PublishPlan }
  | { status: "submitting"; plan: PublishPlan }
  | { status: "verifying"; plan: PublishPlan; result: PublishResult }
  | { status: "publish-error"; plan: PublishPlan; error: unknown }
  | { status: "success"; result: PublishResult };

/** Cache of one commit's file summary, keyed by full hash. `undefined` means
 * not requested yet — the details panel fetches lazily, only the first time
 * a given commit is expanded, and keeps the result for the rest of this
 * dialog session. */
type FileChangesState = "loading" | "error" | CommitFileChange[];

function CommitFilesPanel({
  files,
  t,
}: {
  files: FileChangesState | undefined;
  t: Translations;
}): React.JSX.Element | null {
  if (files === undefined || files === "loading") {
    return (
      <div className="publish-commit-list__files" role="status">
        <LoaderCircle aria-hidden="true" className="icon--spinning" />
        {t.publishLoadingFiles}
      </div>
    );
  }
  if (files === "error") {
    return (
      <p className="publish-commit-list__files publish-commit-list__files--error" role="alert">
        {t.publishFilesError}
      </p>
    );
  }
  if (files.length === 0) {
    return null;
  }
  return (
    <div className="publish-commit-list__files">
      {files.map((file) => (
        <div key={file.path} className="publish-commit-list__file">
          {CATEGORY_ICONS[file.category]}
          <span className="publish-commit-list__file-path">{file.path}</span>
        </div>
      ))}
    </div>
  );
}

function PublishSummary({
  plan,
  projectPath,
  t,
}: {
  plan: PublishPlan;
  projectPath: string;
  t: Translations;
}): React.JSX.Element {
  const [fileChanges, setFileChanges] = useState<Record<string, FileChangesState>>({});

  const handleToggle = useCallback(
    (commit: string, isOpen: boolean) => {
      if (!isOpen || fileChanges[commit] !== undefined) {
        return;
      }
      setFileChanges((current) => ({ ...current, [commit]: "loading" }));
      invoke<CommitFileChange[]>("read_commit_file_changes", { path: projectPath, commit })
        .then((files) => setFileChanges((current) => ({ ...current, [commit]: files })))
        .catch(() => setFileChanges((current) => ({ ...current, [commit]: "error" })));
    },
    [fileChanges, projectPath],
  );

  return (
    <div className="save-version-summary publish-plan">
      <section className="publish-plan__section" aria-labelledby="publish-destination-heading">
        <h3 id="publish-destination-heading">{t.publishDestinationLabel}</h3>
        <p className="publish-plan__destination">
          <code>{plan.target.remote}</code>
          <span aria-hidden="true">→</span>
          <code>{plan.target.destinationBranch}</code>
        </p>
      </section>
      <section className="publish-plan__section" aria-labelledby="publish-included-heading">
        <h3 id="publish-included-heading">{t.publishWillPublishLabel}</h3>
        <p>{t.publishCommitCount(plan.commitCount)}</p>
      {plan.commitSummary.length > 0 && (
        <ul className="publish-commit-list" aria-label={t.publishCommitListLabel}>
          {plan.commitSummary.map((entry) => (
            <li key={entry.commit} className="publish-commit-list__item">
              <details onToggle={(event) => handleToggle(entry.commit, event.currentTarget.open)}>
                <summary className="publish-commit-list__summary">
                  <ChevronDown aria-hidden="true" className="publish-commit-list__chevron" />
                  <span className="publish-commit-list__description">{entry.description}</span>
                  <code className="publish-commit-list__hash">{entry.shortCommit}</code>
                </summary>
                <CommitFilesPanel files={fileChanges[entry.commit]} t={t} />
              </details>
            </li>
          ))}
        </ul>
      )}
      </section>
      {(plan.hasUnsavedFiles || plan.remainingAfterPublish > 0) && (
        <section className="publish-plan__section" aria-labelledby="publish-stays-heading">
          <h3 id="publish-stays-heading">{t.publishWillStayLabel}</h3>
          <div className="publish-stays__pills">
            {plan.remainingCommitSummary.map((entry) => (
              <span key={entry.commit} className="publish-stays__pill">
                {entry.description}
              </span>
            ))}
            {plan.hasUnsavedFiles && (
              <span className="publish-stays__pill publish-stays__pill--unsaved">{t.publishUnsavedChangesPill}</span>
            )}
          </div>
          {plan.remainingCommitSummary.length < plan.remainingAfterPublish && (
            <p className="save-version-note">{t.publishRemainingNote(plan.remainingAfterPublish)}</p>
          )}
          {plan.hasUnsavedFiles && <p className="save-version-note">{t.publishUnsavedFilesNote}</p>}
        </section>
      )}
      <section className="publish-plan__section" aria-labelledby="publish-visibility-heading">
        <h3 id="publish-visibility-heading">{t.publishVisibilityLabel}</h3>
        <p className="save-version-note">{t.publishTeammatesNote}</p>
      </section>
      {plan.willCreateUpstream && <p className="save-version-note">{t.publishUpstreamNote}</p>}
    </div>
  );
}

function FailureDetail({ error, t }: { error: unknown; t: Translations }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (!isAppError(error) || !error.detail) {
    return null;
  }
  return (
    <div className="save-version-detail">
      <button type="button" className="save-version-detail__toggle" onClick={() => setExpanded((value) => !value)}>
        {expanded ? t.saveVersionHideDetail : t.saveVersionShowDetail}
      </button>
      {expanded && (
        <div>
          <p className="save-version-detail__heading">{t.saveVersionDetailHeading}</p>
          <pre className="save-version-detail__body">{error.detail}</pre>
        </div>
      )}
    </div>
  );
}

export function PublishDialog({
  isOpen,
  projectPath,
  upTo,
  onClose,
  onPublished,
}: {
  isOpen: boolean;
  projectPath: string;
  /** Publish only up to (and including) this commit, leaving any newer
   * pending saved versions unpublished for now. `undefined` publishes
   * everything pending, same as before this existed. */
  upTo?: string;
  onClose: () => void;
  onPublished: () => Promise<void>;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
  const [state, setState] = useState<DialogState>({ status: "loading" });

  // Same rationale as `SaveVersionDialog`'s `onCloseRef`: keeps this callback's
  // identity stable across renders so `useModalFocus`'s effect doesn't tear
  // down and reinstall its keydown listener on every state change.
  const onCloseRef = useRef(onClose);
  const isBusyRef = useRef(false);
  onCloseRef.current = onClose;
  const setOpenState = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? (next as (previous: boolean) => boolean)(true) : next;
    if (!value && !isBusyRef.current) {
      onCloseRef.current();
    }
  }, []);
  useModalFocus(isOpen, dialogRef, setOpenState);

  // Resets the remote choice on every fresh open — this instance stays
  // mounted across open/close cycles, so a remote picked in a previous
  // session must not silently carry over into the next one.
  useEffect(() => {
    if (isOpen) {
      setSelectedRemote(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    invoke<PublishPlan>("plan_publish", { path: projectPath, remote: selectedRemote ?? undefined, upTo })
      .then((plan) => {
        if (!cancelled) {
          setState({ status: "ready", plan });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (isAppError(error) && error.code === "remote_selection_required") {
          invoke<RemoteDiscovery>("discover_remotes", { path: projectPath })
            .then((discovery) => {
              if (!cancelled) {
                setState({ status: "remote-selection", remotes: discovery.remotes });
              }
            })
            .catch((discoveryError: unknown) => {
              if (!cancelled) {
                setState({ status: "blocked", error: discoveryError });
              }
            });
          return;
        }
        setState({ status: "blocked", error });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectPath, retryToken, selectedRemote, upTo]);

  if (!isOpen) {
    return null;
  }

  const plan = "plan" in state ? state.plan : null;
  const isFirstPublish = plan?.willCreateUpstream ?? false;
  const isBusy = state.status === "submitting" || state.status === "verifying";
  isBusyRef.current = isBusy;
  const isStalePlan =
    state.status === "publish-error" && isAppError(state.error) && state.error.code === "stale_publish_plan";

  function requestClose(): void {
    if (!isBusy) {
      onClose();
    }
  }

  function handleReplan(): void {
    setState({ status: "loading" });
    setRetryToken((token) => token + 1);
  }

  function handleConfirm(): void {
    if (!plan) {
      return;
    }
    setState({ status: "submitting", plan });
    invoke<PublishResult>("publish", {
      path: projectPath,
      remote: plan.target.remote,
      stateToken: plan.stateToken,
      upTo,
    })
      .then(async (result) => {
        setState({ status: "verifying", plan, result });
        await onPublished();
        setState({ status: "success", result });
      })
      .catch((error: unknown) => {
        setState({ status: "publish-error", plan, error });
      });
  }

  return (
    <div className="save-version-backdrop" role="presentation" onMouseDown={requestClose}>
      <div
        ref={dialogRef}
        className="save-version-dialog publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="publish-dialog-title">
          {state.status === "success"
            ? t.publishSuccessTitle
            : isFirstPublish
              ? t.publishDialogTitleFirst
              : t.publishDialogTitle}
        </h2>

        {state.status === "loading" && (
          <div className="save-version-status" role="status">
            <LoaderCircle aria-hidden="true" className="icon--spinning" />
            <p>{t.publishLoadingTitle}</p>
          </div>
        )}

        {state.status === "remote-selection" && (
          <>
            <p>{t.publishChooseRemoteDescription}</p>
            <div className="publish-remote-list" role="list" aria-label={t.publishChooseRemoteTitle}>
              {state.remotes.map((remote) => (
                <button
                  key={remote.name}
                  type="button"
                  role="listitem"
                  className="secondary-button publish-remote-option"
                  onClick={() => setSelectedRemote(remote.name)}
                >
                  <span className="publish-remote-option__name">{remote.name}</span>
                  <span className="publish-remote-option__url">{remote.url}</span>
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose}>
                {t.commonCancel}
              </button>
            </div>
          </>
        )}

        {state.status === "blocked" && (
          <>
            <p className="save-version-error" role="alert">
              <CircleAlert aria-hidden="true" />
              {localizeAppError(state.error, t, t.errorGitCommandFailed)}
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={() => setRetryToken((token) => token + 1)}>
                {t.saveVersionRetry}
              </button>
            </div>
          </>
        )}

        {plan && state.status !== "success" && (
          <>
            <PublishSummary plan={plan} projectPath={projectPath} t={t} />

            {state.status === "publish-error" && (
              <div>
                <p className="save-version-error" role="alert">
                  <CircleAlert aria-hidden="true" />
                  {localizeAppError(state.error, t, t.errorGitCommandFailed)}
                </p>
                <FailureDetail error={state.error} t={t} />
              </div>
            )}

            {isBusy && (
              <p className="publish-operation-status" role="status">
                <LoaderCircle aria-hidden="true" className="icon--spinning" />
                <span>
                  {state.status === "verifying" ? t.publishVerifying : t.publishPublishing}
                  <small>{t.publishCannotCloseNote}</small>
                </span>
              </p>
            )}

            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
                {t.commonCancel}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={isStalePlan ? handleReplan : handleConfirm}
                disabled={isBusy}
              >
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {state.status === "verifying" ? t.publishVerifying : t.publishPublishing}
                  </>
                ) : (
                  <>
                    <Send aria-hidden="true" />
                    {isStalePlan ? t.publishReviewUpdatedPlan : t.publishConfirm}
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {state.status === "success" && (
          <>
            <p>{t.publishSuccessDescription(state.result.publishedCount, state.result.target.remote)}</p>
            {state.result.createdUpstream && <p className="save-version-note">{t.publishSuccessUpstreamNote}</p>}
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={requestClose}>
                {t.publishDone}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

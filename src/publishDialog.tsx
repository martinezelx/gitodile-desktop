import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CircleAlert, LoaderCircle, Send } from "lucide-react";
import { useLanguage, type Translations } from "./i18n";
import { localizeAppError, isAppError } from "./appError";
import { useModalFocus } from "./modalFocus";
import type { PublishPlan, PublishResult, RemoteDiscovery, RemoteInfo } from "./publish";

type DialogState =
  | { status: "loading" }
  | { status: "remote-selection"; remotes: RemoteInfo[] }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: PublishPlan }
  | { status: "submitting"; plan: PublishPlan }
  | { status: "publish-error"; plan: PublishPlan; error: unknown }
  | { status: "success"; result: PublishResult };

function PublishSummary({ plan, t }: { plan: PublishPlan; t: Translations }): React.JSX.Element {
  return (
    <div className="save-version-summary">
      <p>{t.publishSummary(plan.remote, plan.localBranch)}</p>
      <p>{t.publishCommitCount(plan.commitCount)}</p>
      {plan.willCreateUpstream && <p className="save-version-note">{t.publishUpstreamNote}</p>}
      {plan.hasUnsavedFiles && <p className="save-version-note">{t.publishUnsavedFilesNote}</p>}
      <p className="save-version-note">{t.publishTeammatesNote}</p>
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
  onClose,
  onPublished,
}: {
  isOpen: boolean;
  projectPath: string;
  onClose: () => void;
  onPublished: () => void;
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
  onCloseRef.current = onClose;
  const setOpenState = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? (next as (previous: boolean) => boolean)(true) : next;
    if (!value) {
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
    invoke<PublishPlan>("plan_publish", { path: projectPath, remote: selectedRemote ?? undefined })
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
  }, [isOpen, projectPath, retryToken, selectedRemote]);

  if (!isOpen) {
    return null;
  }

  const plan = "plan" in state ? state.plan : null;
  const isFirstPublish = plan?.willCreateUpstream ?? false;
  const isBusy = state.status === "submitting";

  function handleConfirm(): void {
    if (!plan) {
      return;
    }
    setState({ status: "submitting", plan });
    invoke<PublishResult>("publish", {
      path: projectPath,
      remote: plan.remote,
      stateToken: plan.stateToken,
    })
      .then((result) => {
        setState({ status: "success", result });
        onPublished();
      })
      .catch((error: unknown) => {
        setState({ status: "publish-error", plan, error });
      });
  }

  return (
    <div className="save-version-backdrop" role="presentation" onMouseDown={() => onClose()}>
      <div
        ref={dialogRef}
        className="save-version-dialog"
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
              <button className="secondary-button" type="button" onClick={onClose}>
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
              <button className="secondary-button" type="button" onClick={onClose}>
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
            <PublishSummary plan={plan} t={t} />

            {state.status === "publish-error" && (
              <div>
                <p className="save-version-error" role="alert">
                  <CircleAlert aria-hidden="true" />
                  {localizeAppError(state.error, t, t.errorGitCommandFailed)}
                </p>
                <FailureDetail error={state.error} t={t} />
              </div>
            )}

            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onClose} disabled={isBusy}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={handleConfirm} disabled={isBusy}>
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.publishPublishing}
                  </>
                ) : (
                  <>
                    <Send aria-hidden="true" />
                    {t.publishConfirm}
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {state.status === "success" && (
          <>
            <p>{t.publishSuccessDescription(state.result.publishedCount, state.result.remote)}</p>
            {state.result.createdUpstream && <p className="save-version-note">{t.publishSuccessUpstreamNote}</p>}
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={onClose}>
                {t.publishDone}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

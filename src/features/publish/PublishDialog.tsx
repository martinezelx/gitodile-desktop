import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, CircleAlert, CloudUpload, Info, Laptop, LoaderCircle, Users } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { localizeAppError, isAppError } from "../../shared/i18n";
import { Dialog, DialogBanner, DialogFacts, autoHideScrollbarProps, useModalFocus, useToast } from "../../shared/ui";
import { CHANGE_CATEGORY_ICONS } from "../status";
import { getFileTypeIcon } from "../../shared/file-icons";
import type { CommitFileChange, PublishPlan, PublishResult, RemoteInfo } from "./domain";
import type { PublishController } from "./controller";
import { createPublishController } from "./controller";
import { publishPort } from "./tauriAdapter";

const defaultController = createPublishController(publishPort);

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
      {files.map((file) => {
        const FileTypeIcon = getFileTypeIcon(file.path);
        return (
          <div key={file.path} className="publish-commit-list__file">
            <FileTypeIcon aria-hidden="true" className="publish-commit-list__file-type-icon" />
            <span className="publish-commit-list__file-path">{file.path}</span>
            <span className="publish-commit-list__file-category" aria-hidden="true">
              {CHANGE_CATEGORY_ICONS[file.category]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PublishSummary({
  plan,
  controller = defaultController,
  projectPath,
  sessionEpoch,
  t,
}: {
  plan: PublishPlan;
  controller?: PublishController;
  projectPath: string;
  sessionEpoch: string;
  t: Translations;
}): React.JSX.Element {
  const [fileChanges, setFileChanges] = useState<Record<string, FileChangesState>>({});

  const handleToggle = useCallback(
    (commit: string, isOpen: boolean) => {
      if (!isOpen || fileChanges[commit] !== undefined) {
        return;
      }
      setFileChanges((current) => ({ ...current, [commit]: "loading" }));
      controller.readCommitFileChanges({ projectId: projectPath, sessionEpoch, commit })
        .then((files) => setFileChanges((current) => ({ ...current, [commit]: files })))
        .catch(() => setFileChanges((current) => ({ ...current, [commit]: "error" })));
    },
    [controller, fileChanges, projectPath, sessionEpoch],
  );

  return (
    <>
      <p className="app-dialog__summary">
        <strong>{t.publishPlanLine(plan.commitCount, plan.target.remote, plan.target.destinationBranch)}</strong>
      </p>
      {plan.commitSummary.length > 0 && (
        <ul
          {...autoHideScrollbarProps<HTMLUListElement>()}
          className="publish-commit-list auto-hide-scrollbar"
          aria-label={t.publishCommitListLabel}
        >
          {plan.commitSummary.map((entry) => (
            <li key={entry.commit} className="publish-commit-list__item">
              <details onToggle={(event) => handleToggle(entry.commit, event.currentTarget.open)}>
                <summary className="publish-commit-list__summary">
                  <ChevronDown aria-hidden="true" className="publish-commit-list__chevron" />
                  <span className="publish-commit-list__description">{entry.title}</span>
                  <code className="publish-commit-list__hash">{entry.shortCommit}</code>
                </summary>
                {entry.description && (
                  <p className="publish-commit-list__message-body">{entry.description}</p>
                )}
                <CommitFilesPanel files={fileChanges[entry.commit]} t={t} />
              </details>
            </li>
          ))}
        </ul>
      )}
      {/* What stays behind and who will see it: the facts under the plan,
          one line each, rather than a section with a heading per sentence. */}
      <DialogFacts
        facts={[
          ...(plan.remainingAfterPublish > 0
            ? [{ icon: <Laptop />, text: t.publishRemainingNote(plan.remainingAfterPublish) }]
            : []),
          ...(plan.hasUnsavedFiles ? [{ icon: <Laptop />, text: t.publishUnsavedFilesNote }] : []),
          { icon: <Users />, text: t.publishTeammatesNote },
        ]}
      />
    </>
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
          <pre
            {...autoHideScrollbarProps<HTMLPreElement>()}
            className="save-version-detail__body auto-hide-scrollbar"
          >
            {error.detail}
          </pre>
        </div>
      )}
    </div>
  );
}

export function PublishDialog({
  isOpen,
  controller = defaultController,
  projectPath,
  sessionEpoch,
  upTo,
  runHooks,
  onClose,
  onPublished,
  onPhaseChange,
}: {
  isOpen: boolean;
  controller?: PublishController;
  projectPath: string;
  sessionEpoch: string;
  /** Publish only up to (and including) this commit, leaving any newer
   * pending saved versions unpublished for now. `undefined` publishes
   * everything pending, same as before this existed. */
  upTo?: string;
  /** The Settings switch, passed in rather than read here: this feature owns
   * the publish request, not the app's preferences. */
  runHooks: boolean;
  onClose: () => void;
  onPublished: (result: PublishResult) => Promise<void>;
  onPhaseChange?: (
    phase: "planning" | "executing" | "verifying" | "uncertain" | "error" | "success"
  ) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const showToast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
  const [state, setState] = useState<DialogState>({ status: "loading" });

  // Same rationale as `SaveVersionDialog`'s `onCloseRef`: keeps this callback's
  // identity stable across renders so `useModalFocus`'s effect doesn't tear
  // down and reinstall its keydown listener on every state change.
  const onCloseRef = useRef(onClose);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const isBusyRef = useRef(false);
  onCloseRef.current = onClose;
  onPhaseChangeRef.current = onPhaseChange;
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
    onPhaseChangeRef.current?.("planning");
    setState({ status: "loading" });
    controller.plan({ projectId: projectPath, sessionEpoch, remote: selectedRemote ?? undefined, upTo })
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
          controller.discoverRemotes({ projectId: projectPath, sessionEpoch })
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
  }, [controller, isOpen, projectPath, retryToken, selectedRemote, sessionEpoch, upTo]);

  if (!isOpen) {
    return null;
  }

  const plan = "plan" in state ? state.plan : null;
  const isFirstPublish = plan?.willCreateUpstream ?? false;
  const isUncertain =
    state.status === "publish-error" &&
    isAppError(state.error) &&
    state.error.code === "publish_uncertain";
  const isBusy = state.status === "submitting" || state.status === "verifying";
  isBusyRef.current = isBusy || isUncertain;
  const isStalePlan =
    state.status === "publish-error" && isAppError(state.error) && state.error.code === "stale_publish_plan";

  function requestClose(): void {
    if (!isBusy && !isUncertain) {
      onClose();
    }
  }

  function handleReplan(): void {
    onPhaseChangeRef.current?.("planning");
    setState({ status: "loading" });
    setRetryToken((token) => token + 1);
  }

  function handleConfirm(): void {
    if (!plan) {
      return;
    }
    setState({ status: "submitting", plan });
    onPhaseChangeRef.current?.("executing");
    controller.publish({
      projectId: projectPath,
      sessionEpoch,
      remote: plan.target.remote,
      stateToken: plan.stateToken,
      upTo,
      runHooks,
    })
      .then(async (result) => {
        setState({ status: "verifying", plan, result });
        onPhaseChangeRef.current?.("verifying");
        await onPublished(result);
        setState({ status: "success", result });
        onPhaseChangeRef.current?.("success");
        // A publish has no next step, so its result is a toast rather than a
        // screen to dismiss (DESIGN.md § Dialogs).
        showToast({
          icon: <CloudUpload />,
          message: t.publishSuccessDescription(result.publishedCount, result.target.remote),
        });
        onCloseRef.current();
      })
      .catch((error: unknown) => {
        setState({ status: "publish-error", plan, error });
        onPhaseChangeRef.current?.(
          isAppError(error) && error.code === "publish_uncertain" ? "uncertain" : "error",
        );
      });
  }

  // Retrying can't make versions appear: "everything is published" only
  // offers the way out. Any other planning failure may pass on a retry.
  const isNothingToPublish = state.status === "blocked" && isAppError(state.error) && state.error.code === "nothing_to_publish";
  const title = state.status === "remote-selection"
    ? t.publishChooseRemoteHeading
    : isFirstPublish && plan
      ? t.publishDialogTitleFirst(plan.target.destinationBranch)
      : t.publishDialogTitle;

  return (
    <Dialog
      size="m"
      title={title}
      titleId="publish-dialog-title"
      subtitle={state.status === "remote-selection" ? t.publishChooseRemoteDescription : undefined}
      onClose={onClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy && !isUncertain}
      dialogRef={dialogRef}
      className="publish-dialog auto-hide-scrollbar"
      bodyProps={autoHideScrollbarProps<HTMLDivElement>()}
    >
      {state.status === "loading" && (
        <p className="app-dialog__note" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          {t.publishLoadingTitle}
        </p>
      )}

      {state.status === "remote-selection" && (
        <>
          <div className="choice-list" role="list" aria-label={t.publishChooseRemoteTitle}>
            {state.remotes.map((remote) => (
              <button
                key={remote.name}
                type="button"
                role="listitem"
                className="choice-list__option"
                onClick={() => setSelectedRemote(remote.name)}
              >
                <span className="choice-list__label">{remote.name}</span>
                <span className="choice-list__description">{remote.url}</span>
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
          <p className="app-dialog__text" role="alert">
            {localizeAppError(state.error, t, t.errorGitCommandFailed)}
          </p>
          <div className="dialog-actions">
            {isNothingToPublish ? (
              <button className="primary-button" type="button" onClick={requestClose}>
                {t.commonClose}
              </button>
            ) : (
              <>
                <button className="secondary-button" type="button" onClick={requestClose}>
                  {t.commonCancel}
                </button>
                <button className="primary-button" type="button" onClick={() => setRetryToken((token) => token + 1)}>
                  {t.saveVersionRetry}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {plan && state.status !== "success" && (
        <>
          <PublishSummary
            plan={plan}
            controller={controller}
            projectPath={projectPath}
            sessionEpoch={sessionEpoch}
            t={t}
          />

          {state.status === "publish-error" && (
            <DialogBanner tone="danger" icon={<CircleAlert />}>
              <p role="alert">{localizeAppError(state.error, t, t.errorGitCommandFailed)}</p>
              <FailureDetail error={state.error} t={t} />
            </DialogBanner>
          )}

          <div className="app-dialog__foot">
            {isBusy && (
              <p className="app-dialog__note" role="status">
                <Info aria-hidden="true" />
                {t.publishCannotCloseNote}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={requestClose}
                disabled={isBusy || isUncertain}
              >
                {t.commonCancel}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={isStalePlan || isUncertain ? handleReplan : handleConfirm}
                disabled={isBusy}
              >
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {state.status === "verifying" ? t.publishVerifying : t.publishPublishing}
                  </>
                ) : (
                  <>
                    <CloudUpload aria-hidden="true" />
                    {isUncertain
                      ? t.publishCheckRemoteAgain
                      : isStalePlan
                        ? t.publishReviewUpdatedPlan
                        : t.publishConfirm}
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}

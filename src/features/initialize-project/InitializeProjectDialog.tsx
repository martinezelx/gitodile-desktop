import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  FolderPlus,
  GitBranch,
  KeyRound,
  Laptop,
  Link2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import type { RepositoryInfo } from "../repository";
import type { SaveVersionController } from "../save-version";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { Dialog, DialogBanner, DialogFacts, FieldError, useFieldErrors, useModalFocus, useToast } from "../../shared/ui";
import type {
  ConnectRemoteAttempt,
  InitializeAttempt,
  InitializeProjectController,
} from "./controller";
import {
  readLastCreateParent,
  writeLastCreateParent,
  type InitializeProgressPhase,
  type InitializeProjectRequest,
  type InitializeProjectResult,
  type InitializeTargetKind,
} from "./domain";

/* Six phases on the wire, three steps on screen, the last shared with opening
   the project and saving its first version: re-checking the folder is how
   creation stays safe, not something to follow (DESIGN.md § Content design). */
const PROGRESS_STEPS: { step: "folder" | "project" | "opening"; phases: InitializeProgressPhase[] }[] = [
  { step: "folder", phases: ["revalidating", "preparingFolder"] },
  { step: "project", phases: ["initializingGit", "creatingReadme", "verifying"] },
  { step: "opening", phases: ["finalizing"] },
];

type DialogStep =
  | "input"
  | "planning"
  | "executing"
  | "cleanup"
  | "opening"
  | "saving"
  | "remote-input"
  | "remote-planning"
  | "remote-preview"
  | "remote-connecting"
  | "remote-error"
  | "success"
  | "error"
  | "open-error";

const BUSY_STEPS = new Set<DialogStep>([
  "planning",
  "executing",
  "opening",
  "saving",
  "remote-planning",
  "remote-connecting",
]);

export type InitializeProjectDialogProps = {
  isOpen: boolean;
  initialMode: InitializeTargetKind;
  initialExistingPath?: string;
  controller: InitializeProjectController;
  saveVersionController: SaveVersionController;
  /** The user's default version-line name, already resolved by the caller —
   * the stored `init.defaultBranch`, or the app's fallback when there is none.
   * It seeds the field below; the field, not this, is what the project is
   * created with, so a one-off name is still one edit away. */
  defaultBranchName: string;
  /** The Settings hooks switch, for the optional first save. */
  runHooks: boolean;
  onClose: () => void;
  onInitialized: (
    result: InitializeProjectResult,
    isCurrent: () => boolean,
  ) => Promise<RepositoryInfo | null>;
  onProjectChanged: (projectId: string) => Promise<void>;
  onOpenIdentitySettings: () => void;
};

export function InitializeProjectDialog({
  isOpen,
  initialMode,
  initialExistingPath = "",
  controller,
  saveVersionController,
  defaultBranchName,
  runHooks,
  onClose,
  onInitialized,
  onProjectChanged,
  onOpenIdentitySettings,
}: InitializeProjectDialogProps): React.JSX.Element | null {
  const { t } = useLanguage();
  const showToast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [identityMissing, setIdentityMissing] = useState(false);
  const [targetKind, setTargetKind] = useState<InitializeTargetKind>(initialMode);
  const [destinationParent, setDestinationParent] = useState(readLastCreateParent);
  const [destinationName, setDestinationName] = useState("");
  const [existingPath, setExistingPath] = useState(initialExistingPath);
  const [initialBranch, setInitialBranch] = useState(defaultBranchName);
  const [createReadme, setCreateReadme] = useState(false);
  const [saveInitialVersion, setSaveInitialVersion] = useState(false);
  const [firstVersionTitle, setFirstVersionTitle] = useState("First version");
  const [firstVersionDescription, setFirstVersionDescription] = useState("");
  const [connectRemote, setConnectRemote] = useState(false);
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [step, setStep] = useState<DialogStep>("input");
  const [attempt, setAttempt] = useState<InitializeAttempt | null>(null);
  const [remoteAttempt, setRemoteAttempt] = useState<ConnectRemoteAttempt | null>(null);
  const [result, setResult] = useState<InitializeProjectResult | null>(null);
  const [openedProject, setOpenedProject] = useState<RepositoryInfo | null>(null);
  const [phase, setPhase] = useState<InitializeProgressPhase>("revalidating");
  const [error, setError] = useState<unknown>(null);
  const [firstSaveError, setFirstSaveError] = useState<unknown>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupAfterFailure, setCleanupAfterFailure] = useState(false);
  const [connectedRemoteName, setConnectedRemoteName] = useState<string | null>(null);
  const { errors, formProps, fieldProps, validate, reset: resetFieldErrors } = useFieldErrors();
  useInstallDraftBlocker(
    "initialize-project-dialog",
    "new project details",
    isOpen && step !== "success",
  );

  const resetTransientState = (): void => {
    setStep("input");
    setAttempt(null);
    setRemoteAttempt(null);
    setResult(null);
    setOpenedProject(null);
    setPhase("revalidating");
    setError(null);
    setFirstSaveError(null);
    setIsCleaning(false);
    setCleanupAfterFailure(false);
    setConnectedRemoteName(null);
    setIdentityMissing(false);
    resetFieldErrors();
  };

  useEffect(() => {
    if (!isOpen) return;
    setTargetKind(initialMode);
    setExistingPath(initialExistingPath);
    setDestinationName("");
    setInitialBranch(defaultBranchName);
    setCreateReadme(false);
    setSaveInitialVersion(false);
    setFirstVersionTitle(t.initializeFirstVersionTitlePlaceholder);
    setFirstVersionDescription("");
    setConnectRemote(false);
    setRemoteName("origin");
    setRemoteUrl("");
    setAdvancedOpen(false);
    resetTransientState();
  }, [
    defaultBranchName,
    initialExistingPath,
    initialMode,
    isOpen,
    t.initializeFirstVersionTitlePlaceholder,
  ]);

  const finishClose = (): void => {
    controller.supersede();
    setRemoteUrl("");
    resetTransientState();
    onClose();
  };

  const requestOpenChange: React.Dispatch<React.SetStateAction<boolean>> = useCallback(
    (value): void => {
      const open = typeof value === "function" ? value(true) : value;
      if (open || BUSY_STEPS.has(step)) return;
      finishClose();
    },
    [controller, onClose, step],
  );

  useModalFocus(isOpen, dialogRef, requestOpenChange);

  const request: InitializeProjectRequest = {
    targetKind,
    destinationParent,
    destinationName,
    existingPath,
    initialBranch,
    createReadme,
    saveInitialVersion,
  };

  const requiredCheck = (field: string, value: string) => ({
    field,
    invalid: !value.trim(),
    message: t.commonRequiredField,
  });

  const validateLocalInput = (): boolean => {
    const hiddenFieldMissing = !initialBranch.trim() || (connectRemote && (!remoteName.trim() || !remoteUrl.trim()));
    if (hiddenFieldMissing) setAdvancedOpen(true);
    return validateFields();
  };

  const validateFields = (): boolean => validate([
    ...(targetKind === "new-folder"
      ? [requiredCheck("initialize-parent", destinationParent), requiredCheck("initialize-name", destinationName)]
      : [requiredCheck("initialize-existing", existingPath)]),
    requiredCheck("initialize-branch", initialBranch),
    ...(saveInitialVersion ? [requiredCheck("initialize-first-version-title", firstVersionTitle)] : []),
    ...(connectRemote
      ? [requiredCheck("initialize-remote-name", remoteName), requiredCheck("initialize-remote-url", remoteUrl)]
      : []),
  ]);

  const validateRemoteInput = (): boolean => validate([
    requiredCheck("initialize-remote-name", remoteName),
    requiredCheck("initialize-remote-url", remoteUrl),
  ]);

  /* One step: the form already says what will happen, so a valid plan is
     carried out at once. The plan still runs first — it is what re-checks the
     folder and holds the state token — and the one thing it can add, a missing
     Git identity for the first version, comes back to the form as a notice. */
  const createProject = async (): Promise<void> => {
    setStep("planning");
    setError(null);
    setIdentityMissing(false);
    try {
      const planned = await controller.plan(request);
      if (!planned) return;
      setAttempt(planned);
      if (planned.plan.saveInitialVersion && !planned.plan.identityReady) {
        setIdentityMissing(true);
        setStep("input");
        return;
      }
      await executeAttempt(planned);
    } catch (planError) {
      setError(planError);
      setStep("error");
    }
  };

  const chooseParent = async (): Promise<void> => {
    const chosen = await controller.chooseFolder(
      destinationParent || undefined,
      t.initializeChooseParentDialogTitle,
    );
    if (chosen) setDestinationParent(chosen);
  };

  const chooseExisting = async (): Promise<void> => {
    const chosen = await controller.chooseFolder(
      existingPath || undefined,
      t.initializeChooseExistingDialogTitle,
    );
    if (chosen) setExistingPath(chosen);
  };

  const planRemote = async (project: RepositoryInfo, generation: number): Promise<void> => {
    setStep("remote-planning");
    setError(null);
    try {
      const planned = await controller.planRemote(generation, {
        projectId: project.path,
        sessionEpoch: project.sessionEpoch,
        remoteName,
        remoteUrl,
      });
      if (!planned) return;
      setRemoteAttempt(planned);
      setStep("remote-preview");
    } catch (remotePlanError) {
      setError(remotePlanError);
      setStep("remote-input");
    }
  };

  const openInitializedProject = async (
    current: InitializeAttempt,
    initialized: InitializeProjectResult,
  ): Promise<void> => {
    if (!controller.isCurrent(current)) return;
    setStep("opening");
    setError(null);
    try {
      if (current.plan.targetKind === "new-folder") {
        writeLastCreateParent(destinationParent);
      }
      const project = await onInitialized(initialized, () => controller.isCurrent(current));
      if (!project || !controller.isCurrent(current)) return;
      setOpenedProject(project);
      if (current.plan.saveInitialVersion) {
        setStep("saving");
        try {
          const savePlan = await saveVersionController.plan({
            projectId: project.path,
            sessionEpoch: project.sessionEpoch,
            selectedPaths: null,
          });
          if (!controller.isCurrent(current)) return;
          await saveVersionController.save({
            projectId: project.path,
            sessionEpoch: project.sessionEpoch,
            selectedPaths: null,
            title: firstVersionTitle,
            description: firstVersionDescription.trim() || null,
            stateToken: savePlan.stateToken,
            runHooks,
          });
          if (!controller.isCurrent(current)) return;
          await onProjectChanged(project.path);
        } catch (saveError) {
          if (!controller.isCurrent(current)) return;
          setFirstSaveError(saveError);
        }
      }
      if (connectRemote) {
        await planRemote(project, current.generation);
      } else {
        setStep("success");
      }
    } catch (openError) {
      setError(openError);
      setStep("open-error");
    }
  };

  const executeAttempt = async (attempt: InitializeAttempt): Promise<void> => {
    setStep("executing");
    setPhase("revalidating");
    setError(null);
    try {
      const initialized = await controller.execute(attempt, setPhase);
      if (!initialized) return;
      setResult(initialized);
      if (initialized.outcome === "cleanup-required") {
        setCleanupAfterFailure(false);
        setStep("cleanup");
      } else {
        await openInitializedProject(attempt, initialized);
      }
    } catch (initializeError) {
      if (!controller.isCurrent(attempt)) return;
      setError(initializeError);
      if (isAppError(initializeError) && initializeError.code === "initialize_cleanup_required") {
        setCleanupAfterFailure(true);
        setStep("cleanup");
      } else {
        setStep("error");
      }
    }
  };

  const retryCleanup = async (): Promise<void> => {
    if (!attempt) return;
    setIsCleaning(true);
    try {
      await controller.cleanup(attempt);
      if (!controller.isCurrent(attempt)) return;
      if (result && !cleanupAfterFailure) {
        await openInitializedProject(attempt, { ...result, outcome: "completed", cleanupPath: null });
      } else {
        setStep("error");
      }
    } catch (cleanupError) {
      setError(cleanupError);
    } finally {
      setIsCleaning(false);
    }
  };

  const connectReviewedRemote = async (): Promise<void> => {
    if (!remoteAttempt) return;
    setStep("remote-connecting");
    setError(null);
    try {
      const connected = await controller.connectRemote(remoteAttempt);
      if (!connected) return;
      await onProjectChanged(connected.projectId);
      setConnectedRemoteName(connected.remoteName);
      setRemoteUrl("");
      // Connected is the end of the flow: a toast, and the dialog closes.
      showToast({ icon: <Link2 />, message: t.initializeRemoteConnectedToast(connected.remoteName) });
      finishClose();
    } catch (connectError) {
      setError(connectError);
      setStep("remote-error");
    }
  };

  if (!isOpen) return null;

  const localizedError = error ? localizeAppError(error, t, t.initializeErrorTitle) : null;
  const localizedSaveError = firstSaveError
    ? localizeAppError(firstSaveError, t, t.initializeFirstSaveFailedDescription)
    : null;
  const technicalDetail = isAppError(error) ? error.detail : null;
  const projectName = targetKind === "new-folder"
    ? destinationName.trim()
    : existingPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? existingPath;
  const separator = destinationParent.includes("\\") ? "\\" : "/";
  const newPath = destinationParent.trim() && destinationName.trim()
    ? `${destinationParent.replace(/[\\/]+$/, "")}${separator}${destinationName.trim()}`
    : null;
  const currentStepIndex = step === "opening" || step === "saving"
    ? PROGRESS_STEPS.length - 1
    : PROGRESS_STEPS.findIndex((item) => item.phases.includes(phase));
  const isBusy = BUSY_STEPS.has(step);
  const close = (): void => requestOpenChange(false);

  // A result or a failure is a short message: the small shell and a status
  // glyph. The flow — form, progress, the remote — keeps its own size.
  if (step === "success" || step === "error" || step === "open-error" || step === "cleanup" || step === "remote-error") {
    const isFailure = step === "error" || step === "open-error" || step === "remote-error";
    const title = step === "success"
      ? firstSaveError ? t.initializeFirstSaveFailedTitle : t.initializeReadyTitle(openedProject?.name ?? projectName)
      : step === "cleanup"
        ? cleanupAfterFailure ? t.initializeFailureCleanupTitle : t.initializeCleanupTitle
        : step === "open-error" ? t.initializeOpenFailedTitle
          : step === "remote-error" ? t.initializeRemoteErrorTitle
            : t.initializeErrorTitle;
    return (
      <Dialog
        size="s"
        role={isFailure ? "alertdialog" : "dialog"}
        title={title}
        titleId="initialize-dialog-title"
        icon={isFailure ? <CircleAlert /> : step === "cleanup" ? <ShieldCheck /> : <Check />}
        tone={isFailure ? "danger" : step === "cleanup" || firstSaveError ? "warning" : "success"}
        onClose={step === "cleanup" ? undefined : finishClose}
        closeLabel={t.commonClose}
        dialogRef={dialogRef}
      >
        <p className="app-dialog__text" role={isFailure ? undefined : "status"}>
          {step === "success"
            ? firstSaveError ? t.initializeFirstSaveFailedDescription : t.initializeCreatedDescription
            : step === "cleanup"
              ? cleanupAfterFailure ? t.initializeFailureCleanupDescription : t.initializeCleanupDescription
              : step === "open-error" ? t.initializeOpenFailedDescription : localizedError}
        </p>
        {step === "success" && localizedSaveError && <p className="app-dialog__text">{localizedSaveError}</p>}
        {step === "cleanup" && localizedError && <p className="app-dialog__text">{localizedError}</p>}
        {isFailure && technicalDetail && (
          <details className="app-dialog__details"><summary>{t.initializeTechnicalDetails}</summary><pre>{technicalDetail}</pre></details>
        )}
        <div className="dialog-actions">
          {step === "success" && (
            <>
              {openedProject && !connectRemote && (
                <button className="secondary-button" type="button" onClick={() => setStep("remote-input")}>
                  {t.initializeConnectRemoteAction}
                </button>
              )}
              <button className="primary-button" type="button" onClick={finishClose}>{t.initializeFinishAction}</button>
            </>
          )}
          {step === "cleanup" && (
            <button className="primary-button" type="button" disabled={isCleaning} onClick={() => void retryCleanup()}>
              {isCleaning ? t.initializeCleaningUp : t.initializeCleanupAction}
            </button>
          )}
          {(step === "error" || step === "open-error") && (
            <>
              <button className="secondary-button" type="button" onClick={finishClose}>{t.commonClose}</button>
              {step === "error" && <button className="primary-button" type="button" onClick={() => setStep("input")}>{t.initializeRetryAction}</button>}
            </>
          )}
          {step === "remote-error" && (
            <>
              <button className="secondary-button" type="button" onClick={() => setStep("success")}>{t.initializeSkipRemote}</button>
              <button className="primary-button" type="button" onClick={() => setStep("remote-input")}>{t.initializeEditRemote}</button>
            </>
          )}
        </div>
      </Dialog>
    );
  }

  if (step === "remote-input" || step === "remote-planning" || step === "remote-preview" || step === "remote-connecting") {
    const sameAddress = remoteAttempt?.plan.fetchUrlDisplay === remoteAttempt?.plan.pushUrlDisplay;
    return (
      <Dialog
        size="m"
        title={t.initializeRemoteDialogTitle}
        titleId="initialize-dialog-title"
        subtitle={step === "remote-preview" ? t.initializeRemoteReviewDescription : t.initializeRemoteHelp}
        icon={<Link2 />}
        onClose={isBusy ? undefined : () => setStep("success")}
        closeLabel={t.commonClose}
        dismissible={!isBusy}
        dialogRef={dialogRef}
      >
        {localizedSaveError && (
          <DialogBanner tone="warning" icon={<CircleAlert />}>
            <p><strong>{t.initializeFirstSaveFailedTitle}</strong> {localizedSaveError}</p>
          </DialogBanner>
        )}
        {(step === "remote-input" || step === "remote-planning") && (
          <form
            className="initialize-dialog__form"
            {...formProps}
            onSubmit={(event) => {
              event.preventDefault();
              if (!validateRemoteInput()) return;
              if (openedProject && attempt) void planRemote(openedProject, attempt.generation);
            }}
          >
            {localizedError && (
              <DialogBanner tone="danger" icon={<CircleAlert />}><p role="alert">{localizedError}</p></DialogBanner>
            )}
            <label className="text-field initialize-dialog__field">
              <span>{t.initializeRemoteNameLabel}</span>
              <input {...fieldProps("initialize-remote-name")} value={remoteName} onChange={(event) => setRemoteName(event.target.value)} autoComplete="off" required data-autofocus />
              <FieldError field="initialize-remote-name" errors={errors} />
            </label>
            <label className="text-field initialize-dialog__field">
              <span>{t.initializeRemoteUrlLabel}</span>
              <input {...fieldProps("initialize-remote-url")} value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} placeholder={t.initializeRemoteUrlPlaceholder} autoComplete="off" spellCheck={false} required />
              <FieldError field="initialize-remote-url" errors={errors} />
            </label>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setStep("success")} disabled={isBusy}>{t.initializeSkipRemote}</button>
              <button className="primary-button" type="submit" disabled={isBusy}>
                {step === "remote-planning" && <LoaderCircle className="icon--spinning" aria-hidden="true" />}
                {t.initializeReviewRemoteAction}
              </button>
            </div>
          </form>
        )}
        {(step === "remote-preview" || step === "remote-connecting") && remoteAttempt && (
          <>
            <dl className="app-dialog__kv">
              <dt>{t.initializeRemoteNamePreview}</dt><dd><code>{remoteAttempt.plan.remoteName}</code></dd>
              {sameAddress ? (
                <><dt>{t.initializeRemoteAddressLabel}</dt><dd><code>{remoteAttempt.plan.fetchUrlDisplay}</code></dd></>
              ) : (
                <>
                  <dt>{t.initializeRemoteFetchPreview}</dt><dd><code>{remoteAttempt.plan.fetchUrlDisplay}</code></dd>
                  <dt>{t.initializeRemotePushPreview}</dt><dd><code>{remoteAttempt.plan.pushUrlDisplay}</code></dd>
                </>
              )}
            </dl>
            <DialogFacts
              facts={[
                { icon: <Laptop />, text: t.initializeRemoteLocalEffects },
                {
                  icon: <ShieldCheck />,
                  text: remoteAttempt.plan.futureNetworkAccess ? t.initializeRemoteFutureNetwork : t.initializeRemoteLocalOnly,
                  safe: true,
                },
              ]}
            />
            <details className="app-dialog__details">
              <summary>{t.initializeTechnicalDetails}</summary>
              <pre>{`${t.initializeRemoteCredentials(remoteAttempt.plan.credentialExpectation)}\n${t.initializeRemoteSafety}`}</pre>
            </details>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setStep("remote-input")} disabled={isBusy}>{t.initializeEditRemote}</button>
              <button className="primary-button" type="button" onClick={() => void connectReviewedRemote()} disabled={isBusy}>
                {step === "remote-connecting" && <LoaderCircle className="icon--spinning" aria-hidden="true" />}
                {step === "remote-connecting" ? t.initializeConnectingRemote : t.initializeConnectRemote}
              </button>
            </div>
          </>
        )}
      </Dialog>
    );
  }

  if (step === "executing" || step === "opening" || step === "saving") {
    return (
      <Dialog
        size="l"
        title={t.initializeCreatingTitle(projectName)}
        titleId="initialize-dialog-title"
        icon={<FolderPlus />}
        dismissible={false}
        dialogRef={dialogRef}
      >
        <ol className="app-dialog__steps" aria-label={t.initializeProgressTitle} aria-busy="true">
          {PROGRESS_STEPS.map((item, index) => (
            <li
              key={item.step}
              className={`app-dialog__step${index === currentStepIndex ? " app-dialog__step--active" : index < currentStepIndex ? " app-dialog__step--done" : ""}`}
              aria-current={index === currentStepIndex ? "step" : undefined}
            >
              <span className="app-dialog__step-dot" aria-hidden="true">{index < currentStepIndex && <Check />}</span>
              {t.initializeStep(item.step)}
            </li>
          ))}
        </ol>
        <p className="visually-hidden" role="status">
          {step === "opening" ? t.initializeOpeningTitle : step === "saving" ? t.initializeSavingTitle : t.initializeProgressPhase(phase)}
        </p>
        {targetKind === "existing-folder" && <p className="app-dialog__note"><ShieldCheck aria-hidden="true" />{t.initializeProgressDescription}</p>}
      </Dialog>
    );
  }

  // The form, with what will happen said under it: no separate review step.
  const facts = [
    {
      icon: <FolderPlus />,
      text: targetKind === "new-folder"
        ? newPath ? t.initializeNewFact(newPath) : t.initializeNewModeDescription
        : t.initializeExistingFact,
    },
    ...(saveInitialVersion ? [{ icon: <GitBranch />, text: t.initializeFirstVersionEffect }] : []),
    ...(connectRemote ? [{ icon: <Link2 />, text: t.initializeRemoteLaterEffect }] : []),
    { icon: <ShieldCheck />, text: t.initializeSafetyBody, safe: true },
  ];
  return (
    <Dialog
      size="l"
      title={t.initializeDialogTitle}
      titleId="initialize-dialog-title"
      subtitle={<span id="initialize-dialog-description">{t.initializeDialogDescription}</span>}
      descriptionId="initialize-dialog-description"
      icon={<FolderPlus />}
      onClose={close}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
      className="initialize-dialog auto-hide-scrollbar"
    >
      <form className="initialize-dialog__form" {...formProps} onSubmit={(event) => { event.preventDefault(); if (!validateLocalInput()) return; void createProject(); }}>
        <fieldset className="initialize-dialog__mode">
          <legend className="visually-hidden">{t.initializeDialogTitle}</legend>
          <label className={targetKind === "new-folder" ? "is-selected" : ""}>
            <input type="radio" name="initialize-mode" value="new-folder" checked={targetKind === "new-folder"} onChange={() => setTargetKind("new-folder")} />
            <span><strong>{t.initializeNewMode}</strong><small>{t.initializeNewModeDescription}</small></span>
          </label>
          <label className={targetKind === "existing-folder" ? "is-selected" : ""}>
            <input type="radio" name="initialize-mode" value="existing-folder" checked={targetKind === "existing-folder"} onChange={() => setTargetKind("existing-folder")} />
            <span><strong>{t.initializeExistingMode}</strong><small>{t.initializeExistingModeDescription}</small></span>
          </label>
        </fieldset>

        {targetKind === "new-folder" ? (
          <>
            <label className="text-field initialize-dialog__field">
              <span id="initialize-parent-label">{t.initializeParentLabel}</span>
              <span className="initialize-dialog__path-picker">
                <input {...fieldProps("initialize-parent")} aria-labelledby="initialize-parent-label" value={destinationParent} onChange={(event) => setDestinationParent(event.target.value)} placeholder={t.initializeParentPlaceholder} required data-autofocus />
                <button className="secondary-button" type="button" onClick={() => void chooseParent()}>{t.initializeChooseParent}</button>
              </span>
              <FieldError field="initialize-parent" errors={errors} />
            </label>
            <label className="text-field initialize-dialog__field">
              <span>{t.initializeNameLabel}</span>
              <input {...fieldProps("initialize-name")} value={destinationName} onChange={(event) => setDestinationName(event.target.value)} placeholder={t.initializeNamePlaceholder} required />
              <FieldError field="initialize-name" errors={errors} />
            </label>
          </>
        ) : (
          <label className="text-field initialize-dialog__field">
            <span id="initialize-existing-label">{t.initializeExistingLabel}</span>
            <span className="initialize-dialog__path-picker">
              <input {...fieldProps("initialize-existing")} aria-labelledby="initialize-existing-label" value={existingPath} onChange={(event) => setExistingPath(event.target.value)} placeholder={t.initializeExistingPlaceholder} required data-autofocus />
              <button className="secondary-button" type="button" onClick={() => void chooseExisting()}>{t.initializeChooseExisting}</button>
            </span>
            <FieldError field="initialize-existing" errors={errors} />
          </label>
        )}

        <label className="app-dialog__check">
          <input className="app-checkbox" type="checkbox" checked={saveInitialVersion} onChange={(event) => { setSaveInitialVersion(event.target.checked); setIdentityMissing(false); }} />
          {t.initializeFirstVersionLabel}
        </label>
        {saveInitialVersion && (
          <div className="initialize-dialog__nested-fields">
            <label className="text-field initialize-dialog__field"><span>{t.initializeFirstVersionTitleLabel}</span><input {...fieldProps("initialize-first-version-title")} value={firstVersionTitle} onChange={(event) => setFirstVersionTitle(event.target.value)} placeholder={t.initializeFirstVersionTitlePlaceholder} required /><FieldError field="initialize-first-version-title" errors={errors} /></label>
            <label className="text-field initialize-dialog__field"><span>{t.initializeFirstVersionDescriptionLabel}</span><textarea value={firstVersionDescription} onChange={(event) => setFirstVersionDescription(event.target.value)} placeholder={t.initializeFirstVersionDescriptionPlaceholder} rows={2} /></label>
          </div>
        )}
        {identityMissing && (
          <DialogBanner tone="warning" icon={<KeyRound />}>
            <p>{t.initializeIdentityMissingShort}</p>
            <button className="app-dialog__link" type="button" onClick={() => { finishClose(); onOpenIdentitySettings(); }}>{t.initializeAddIdentity}</button>
          </DialogBanner>
        )}

        {/* What most people never change: the main line's name, a README and
            a remote to connect afterwards. */}
        <details className="initialize-dialog__advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary>{t.initializeAdvancedLabel}</summary>
          <div className="initialize-dialog__advanced-body">
            <label className="text-field initialize-dialog__field">
              <span>{t.initializeBranchLabel}</span>
              <input {...fieldProps("initialize-branch")} value={initialBranch} onChange={(event) => setInitialBranch(event.target.value)} autoComplete="off" spellCheck={false} required />
              <small>{t.initializeBranchHelp}</small>
              <FieldError field="initialize-branch" errors={errors} />
            </label>
            <label className="app-dialog__check">
              <input className="app-checkbox" type="checkbox" checked={createReadme} onChange={(event) => setCreateReadme(event.target.checked)} />
              <span>{t.initializeReadmeLabel}<small>{t.initializeReadmeHelp}</small></span>
            </label>
            <label className="app-dialog__check">
              <input className="app-checkbox" type="checkbox" checked={connectRemote} onChange={(event) => setConnectRemote(event.target.checked)} />
              <span>{t.initializeRemoteLabel}<small>{t.initializeRemoteHelp}</small></span>
            </label>
            {connectRemote && (
              <div className="initialize-dialog__nested-fields initialize-dialog__nested-fields--remote">
                <label className="text-field initialize-dialog__field"><span>{t.initializeRemoteNameLabel}</span><input {...fieldProps("initialize-remote-name")} value={remoteName} onChange={(event) => setRemoteName(event.target.value)} autoComplete="off" required /><FieldError field="initialize-remote-name" errors={errors} /></label>
                <label className="text-field initialize-dialog__field"><span>{t.initializeRemoteUrlLabel}</span><input {...fieldProps("initialize-remote-url")} value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} placeholder={t.initializeRemoteUrlPlaceholder} autoComplete="off" spellCheck={false} required /><FieldError field="initialize-remote-url" errors={errors} /></label>
              </div>
            )}
          </div>
        </details>

        <DialogFacts facts={facts} />

        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={close} disabled={isBusy}>{t.commonCancel}</button>
          <button className="primary-button" type="submit" disabled={isBusy}>
            {step === "planning" && <LoaderCircle className="icon--spinning" aria-hidden="true" />}
            {t.initializeConfirmAction}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

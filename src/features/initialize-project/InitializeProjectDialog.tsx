import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  FilePlus2,
  FolderInput,
  FolderOpen,
  GitBranch,
  KeyRound,
  Link2,
  LoaderCircle,
  Network,
  ShieldCheck,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import type { RepositoryInfo } from "../repository";
import type { SaveVersionController } from "../save-version";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { DialogCloseButton, FieldError, LoadingBar, useFieldErrors, useModalFocus } from "../../shared/ui";
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

const PROGRESS_PHASES: InitializeProgressPhase[] = [
  "revalidating",
  "preparingFolder",
  "initializingGit",
  "creatingReadme",
  "verifying",
  "finalizing",
];

type DialogStep =
  | "input"
  | "planning"
  | "preview"
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
  const dialogRef = useRef<HTMLDivElement>(null);
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

  const validateLocalInput = (): boolean => validate([
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

  const planAttempt = async (): Promise<void> => {
    setStep("planning");
    setError(null);
    try {
      const planned = await controller.plan(request);
      if (!planned) return;
      setAttempt(planned);
      setStep("preview");
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

  const executeAttempt = async (): Promise<void> => {
    if (!attempt) return;
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
      setStep("success");
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
  const currentPhaseIndex = PROGRESS_PHASES.indexOf(phase);

  const renderRemoteInput = (): React.JSX.Element => (
    <form
      className="initialize-dialog__form"
      {...formProps}
      onSubmit={(event) => {
        event.preventDefault();
        if (!validateRemoteInput()) return;
        if (openedProject && attempt) void planRemote(openedProject, attempt.generation);
      }}
    >
      <div className="initialize-dialog__intro">
        <h3>{t.initializeRemoteReviewTitle}</h3>
        <p>{t.initializeRemoteReviewDescription}</p>
      </div>
      {localizedError && <p className="initialize-dialog__notice initialize-dialog__notice--danger" role="alert"><CircleAlert aria-hidden="true" />{localizedError}</p>}
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
      <div className="dialog-actions initialize-dialog__actions">
        <button className="secondary-button" type="button" onClick={() => setStep("success")}>{t.initializeSkipRemote}</button>
        <button className="primary-button" type="submit">{t.initializeReviewRemoteAction}</button>
      </div>
    </form>
  );

  return (
    <div className="initialize-backdrop" onMouseDown={() => requestOpenChange(false)}>
      <div
        ref={dialogRef}
        className="initialize-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="initialize-dialog-title"
        aria-describedby="initialize-dialog-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="initialize-dialog__header">
          <span className="initialize-dialog__header-icon" aria-hidden="true"><FolderInput /></span>
          <div>
            <h2 id="initialize-dialog-title">{t.initializeDialogTitle}</h2>
            <p id="initialize-dialog-description">{t.initializeDialogDescription}</p>
          </div>
          {!BUSY_STEPS.has(step) && (
            <DialogCloseButton label={t.commonClose} onClick={finishClose} />
          )}
        </header>

        {step === "input" && (
          <form className="initialize-dialog__form" {...formProps} onSubmit={(event) => { event.preventDefault(); if (!validateLocalInput()) return; void planAttempt(); }}>
            <fieldset className="initialize-dialog__mode">
              <legend className="visually-hidden">{t.initializeDialogTitle}</legend>
              <label className={targetKind === "new-folder" ? "is-selected" : ""}>
                <input type="radio" name="initialize-mode" value="new-folder" checked={targetKind === "new-folder"} onChange={() => setTargetKind("new-folder")} />
                <FolderInput aria-hidden="true" /><span><strong>{t.initializeNewMode}</strong><small>{t.initializeNewModeDescription}</small></span>
              </label>
              <label className={targetKind === "existing-folder" ? "is-selected" : ""}>
                <input type="radio" name="initialize-mode" value="existing-folder" checked={targetKind === "existing-folder"} onChange={() => setTargetKind("existing-folder")} />
                <FolderOpen aria-hidden="true" /><span><strong>{t.initializeExistingMode}</strong><small>{t.initializeExistingModeDescription}</small></span>
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
                  <small>{t.initializeNameHelp}</small>
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

            <label className="text-field initialize-dialog__field">
              <span>{t.initializeBranchLabel}</span>
              <input {...fieldProps("initialize-branch")} value={initialBranch} onChange={(event) => setInitialBranch(event.target.value)} autoComplete="off" spellCheck={false} required />
              <small>{t.initializeBranchHelp}</small>
              <FieldError field="initialize-branch" errors={errors} />
            </label>

            <div className="initialize-dialog__options">
              <label className="initialize-dialog__option"><input type="checkbox" checked={createReadme} onChange={(event) => setCreateReadme(event.target.checked)} /><FilePlus2 aria-hidden="true" /><span><strong>{t.initializeReadmeLabel}</strong><small>{t.initializeReadmeHelp}</small></span></label>
              <label className="initialize-dialog__option"><input type="checkbox" checked={saveInitialVersion} onChange={(event) => setSaveInitialVersion(event.target.checked)} /><Check aria-hidden="true" /><span><strong>{t.initializeFirstVersionLabel}</strong><small>{t.initializeFirstVersionHelp}</small></span></label>
              {saveInitialVersion && (
                <div className="initialize-dialog__nested-fields">
                  <label className="text-field initialize-dialog__field"><span>{t.initializeFirstVersionTitleLabel}</span><input {...fieldProps("initialize-first-version-title")} value={firstVersionTitle} onChange={(event) => setFirstVersionTitle(event.target.value)} placeholder={t.initializeFirstVersionTitlePlaceholder} required /><FieldError field="initialize-first-version-title" errors={errors} /></label>
                  <label className="text-field initialize-dialog__field"><span>{t.initializeFirstVersionDescriptionLabel}</span><textarea value={firstVersionDescription} onChange={(event) => setFirstVersionDescription(event.target.value)} placeholder={t.initializeFirstVersionDescriptionPlaceholder} rows={2} /></label>
                </div>
              )}
              <label className="initialize-dialog__option"><input type="checkbox" checked={connectRemote} onChange={(event) => setConnectRemote(event.target.checked)} /><Link2 aria-hidden="true" /><span><strong>{t.initializeRemoteLabel}</strong><small>{t.initializeRemoteHelp}</small></span></label>
              {connectRemote && (
                <div className="initialize-dialog__nested-fields initialize-dialog__nested-fields--remote">
                  <label className="text-field initialize-dialog__field"><span>{t.initializeRemoteNameLabel}</span><input {...fieldProps("initialize-remote-name")} value={remoteName} onChange={(event) => setRemoteName(event.target.value)} autoComplete="off" required /><FieldError field="initialize-remote-name" errors={errors} /></label>
                  <label className="text-field initialize-dialog__field"><span>{t.initializeRemoteUrlLabel}</span><input {...fieldProps("initialize-remote-url")} value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} placeholder={t.initializeRemoteUrlPlaceholder} autoComplete="off" spellCheck={false} required /><FieldError field="initialize-remote-url" errors={errors} /></label>
                </div>
              )}
            </div>
            <div className="dialog-actions initialize-dialog__actions"><button className="primary-button" type="submit">{t.initializeReviewAction}</button></div>
          </form>
        )}

        {step === "planning" && <div className="initialize-dialog__body initialize-dialog__center" aria-busy="true"><LoadingBar label={t.initializePlanning} /><LoaderCircle aria-hidden="true" /><h3>{t.initializePlanning}</h3></div>}

        {step === "preview" && attempt && (
          <div className="initialize-dialog__body">
            <div className="initialize-dialog__intro"><h3>{t.initializeReviewTitle}</h3><p>{t.initializeReviewDescription}</p></div>
            <dl className="initialize-dialog__summary"><div><dt>{t.initializeDestinationLabel}</dt><dd>{attempt.plan.destinationPath}</dd></div><div><dt>{t.initializeBranchPreviewLabel}</dt><dd>{attempt.plan.initialBranch}</dd></div></dl>
            <div className="initialize-dialog__effects">
              <section><FolderInput aria-hidden="true" /><div><h3>{t.initializeLocalEffectsTitle}</h3><p>{attempt.plan.targetKind === "new-folder" ? t.initializeNewLocalEffects : t.initializeExistingLocalEffects(attempt.plan.existingEntryCount, attempt.plan.existingEntriesTruncated)}</p></div></section>
              <section><FilePlus2 aria-hidden="true" /><div><h3>{t.initializeReadmeLabel}</h3><p>{attempt.plan.createReadme ? t.initializeReadmeEffect : t.initializeNoReadmeEffect}</p></div></section>
              <section><GitBranch aria-hidden="true" /><div><h3>{t.initializeFirstVersionLabel}</h3><p>{attempt.plan.saveInitialVersion ? t.initializeFirstVersionEffect : t.initializeNoFirstVersionEffect}</p></div></section>
              {connectRemote && <section><Link2 aria-hidden="true" /><div><h3>{t.initializeRemoteLabel}</h3><p>{t.initializeRemoteLaterEffect}</p></div></section>}
              <section><ShieldCheck aria-hidden="true" /><div><h3>{t.initializeSafetyTitle}</h3><p>{t.initializeSafetyBody}</p></div></section>
            </div>
            {attempt.plan.saveInitialVersion && <p className={`initialize-dialog__notice${attempt.plan.identityReady ? "" : " initialize-dialog__notice--warning"}`}><KeyRound aria-hidden="true" /><span><strong>{t.initializeIdentityTitle}</strong>{attempt.plan.identityReady ? t.initializeIdentityReady : t.initializeIdentityMissing}</span></p>}
            <div className="dialog-actions initialize-dialog__actions">
              <button className="secondary-button" type="button" onClick={() => setStep("input")}>{t.initializeEditAction}</button>
              {attempt.plan.saveInitialVersion && !attempt.plan.identityReady ? <button className="primary-button" type="button" onClick={() => { finishClose(); onOpenIdentitySettings(); }}>{t.initializeOpenIdentitySettings}</button> : <button className="primary-button" type="button" onClick={() => void executeAttempt()}>{t.initializeConfirmAction}</button>}
            </div>
          </div>
        )}

        {step === "executing" && (
          <div className="initialize-dialog__body initialize-dialog__progress" aria-busy="true">
            <LoadingBar label={t.initializeProgressTitle} />
            <div className="initialize-dialog__intro"><h3>{t.initializeProgressTitle}</h3><p>{t.initializeProgressDescription}</p></div>
            <ol aria-label={t.initializeProgressTitle}>{PROGRESS_PHASES.filter((item) => createReadme || item !== "creatingReadme").map((item) => { const index = PROGRESS_PHASES.indexOf(item); return <li key={item} className={index < currentPhaseIndex ? "is-complete" : index === currentPhaseIndex ? "is-current" : ""}>{index < currentPhaseIndex ? <Check aria-hidden="true" /> : index === currentPhaseIndex ? <LoaderCircle aria-hidden="true" /> : <span aria-hidden="true" />}{t.initializeProgressPhase(item)}</li>; })}</ol>
            <p className="visually-hidden" role="status">{t.initializeProgressPhase(phase)}</p>
          </div>
        )}

        {step === "cleanup" && (
          <div className="initialize-dialog__body initialize-dialog__center" role="alert"><ShieldCheck aria-hidden="true" /><h3>{cleanupAfterFailure ? t.initializeFailureCleanupTitle : t.initializeCleanupTitle}</h3><p>{cleanupAfterFailure ? t.initializeFailureCleanupDescription : t.initializeCleanupDescription}</p>{localizedError && <p>{localizedError}</p>}<div className="dialog-actions initialize-dialog__actions"><button className="primary-button" type="button" disabled={isCleaning} onClick={() => void retryCleanup()}>{isCleaning ? t.initializeCleaningUp : t.initializeCleanupAction}</button></div></div>
        )}

        {(step === "opening" || step === "saving") && <div className="initialize-dialog__body initialize-dialog__center" aria-busy="true"><LoadingBar label={step === "opening" ? t.initializeOpeningTitle : t.initializeSavingTitle} /><LoaderCircle aria-hidden="true" /><h3>{step === "opening" ? t.initializeOpeningTitle : t.initializeSavingTitle}</h3><p>{step === "opening" ? t.initializeOpeningDescription : t.initializeSavingDescription}</p></div>}

        {step === "remote-input" && renderRemoteInput()}
        {step === "remote-planning" && <div className="initialize-dialog__body initialize-dialog__center" aria-busy="true"><LoadingBar label={t.initializeRemotePlanning} /><LoaderCircle aria-hidden="true" /><h3>{t.initializeRemotePlanning}</h3></div>}

        {step === "remote-preview" && remoteAttempt && (
          <div className="initialize-dialog__body">
            <div className="initialize-dialog__intro"><h3>{t.initializeRemoteReviewTitle}</h3><p>{t.initializeRemoteReviewDescription}</p></div>
            {localizedSaveError && <p className="initialize-dialog__notice initialize-dialog__notice--warning"><CircleAlert aria-hidden="true" /><span><strong>{t.initializeFirstSaveFailedTitle}</strong>{localizedSaveError}</span></p>}
            <dl className="initialize-dialog__summary"><div><dt>{t.initializeRemoteNamePreview}</dt><dd>{remoteAttempt.plan.remoteName}</dd></div><div><dt>{t.initializeRemoteFetchPreview}</dt><dd>{remoteAttempt.plan.fetchUrlDisplay}</dd></div><div><dt>{t.initializeRemotePushPreview}</dt><dd>{remoteAttempt.plan.pushUrlDisplay}</dd></div></dl>
            <div className="initialize-dialog__effects">
              <section><Link2 aria-hidden="true" /><div><h3>{t.initializeRemoteLocalEffectsTitle}</h3><p>{t.initializeRemoteLocalEffects}</p></div></section>
              <section><Network aria-hidden="true" /><div><h3>{t.initializeRemoteNetworkEffectsTitle}</h3><p>{t.initializeRemoteNoNetworkNow} {remoteAttempt.plan.futureNetworkAccess ? t.initializeRemoteFutureNetwork : t.initializeRemoteLocalOnly}</p></div></section>
              <section><KeyRound aria-hidden="true" /><div><h3>{t.initializeRemoteCredentialsTitle}</h3><p>{t.initializeRemoteCredentials(remoteAttempt.plan.credentialExpectation)}</p></div></section>
              <section><ShieldCheck aria-hidden="true" /><div><h3>{t.initializeRemoteSafetyTitle}</h3><p>{t.initializeRemoteSafety}</p></div></section>
            </div>
            <div className="dialog-actions initialize-dialog__actions"><button className="secondary-button" type="button" onClick={() => setStep("remote-input")}>{t.initializeEditRemote}</button><button className="primary-button" type="button" onClick={() => void connectReviewedRemote()}>{t.initializeConnectRemote}</button></div>
          </div>
        )}

        {step === "remote-connecting" && <div className="initialize-dialog__body initialize-dialog__center" aria-busy="true"><LoadingBar label={t.initializeConnectingRemote} /><LoaderCircle aria-hidden="true" /><h3>{t.initializeConnectingRemote}</h3><p>{t.initializeRemoteNoNetworkNow}</p></div>}

        {step === "remote-error" && <div className="initialize-dialog__body initialize-dialog__center" role="alert"><CircleAlert aria-hidden="true" /><h3>{t.initializeRemoteErrorTitle}</h3><p>{localizedError}</p>{technicalDetail && <details><summary>{t.initializeTechnicalDetails}</summary><pre>{technicalDetail}</pre></details>}<div className="dialog-actions initialize-dialog__actions"><button className="secondary-button" type="button" onClick={() => setStep("success")}>{t.initializeSkipRemote}</button><button className="primary-button" type="button" onClick={() => setStep("remote-input")}>{t.initializeEditRemote}</button></div></div>}

        {step === "success" && <div className="initialize-dialog__body initialize-dialog__center" role="status"><Check aria-hidden="true" /><h3>{connectedRemoteName ? t.initializeRemoteConnectedTitle : firstSaveError ? t.initializeFirstSaveFailedTitle : t.initializeCreatedTitle}</h3><p>{connectedRemoteName ? t.initializeRemoteConnectedDescription(connectedRemoteName) : firstSaveError ? t.initializeFirstSaveFailedDescription : t.initializeCreatedDescription}</p>{localizedSaveError && <p className="initialize-dialog__notice initialize-dialog__notice--warning"><CircleAlert aria-hidden="true" />{localizedSaveError}</p>}<div className="dialog-actions initialize-dialog__actions"><button className="primary-button" type="button" onClick={finishClose}>{t.initializeFinishAction}</button></div></div>}

        {(step === "error" || step === "open-error") && <div className="initialize-dialog__body initialize-dialog__center" role="alert"><CircleAlert aria-hidden="true" /><h3>{step === "open-error" ? t.initializeOpenFailedTitle : t.initializeErrorTitle}</h3><p>{step === "open-error" ? t.initializeOpenFailedDescription : localizedError}</p>{technicalDetail && <details><summary>{t.initializeTechnicalDetails}</summary><pre>{technicalDetail}</pre></details>}<div className="dialog-actions initialize-dialog__actions"><button className="secondary-button" type="button" onClick={finishClose}>{t.commonClose}</button>{step === "error" && <button className="primary-button" type="button" onClick={() => setStep("input")}>{t.initializeRetryAction}</button>}</div></div>}
      </div>
    </div>
  );
}

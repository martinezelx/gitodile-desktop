export interface PublishTranslations {
  publishDialogTitle: string;
  /** Titles fit one line, so the branch's name is in the plan's sentence. */
  publishDialogTitleFirst: string;
  /** The branch tracks a branch the remote deleted: publishing creates it again. */
  publishDialogTitleAgain: string;
  /** The dead ends, each a short message of its own. */
  publishNothingTitle: string;
  publishBlockedTitle: string;
  /** What stays safe, the plan's last fact. */
  publishSafeNote: string;
  publishRecreateWarningTitle: (remote: string) => string;
  publishRecreateWarningBody: string;
  /** Recreating a branch whose versions the remote already has elsewhere. */
  publishRecreateOnlyBranch: (remote: string, branch: string) => string;
  publishRecreateConfirm: string;
  /** A new remote branch whose versions the remote already has elsewhere. */
  publishCreateOnlyBranch: (remote: string, branch: string) => string;
  /** The toast for a publish that created a branch and sent no new version. */
  publishBranchCreatedDescription: (branch: string, remote: string) => string;
  publishChooseRemoteHeading: string;
  /** The plan in one line: how many versions, to which branch on which remote. */
  publishPlanLine: (count: number, remote: string, branch: string) => string;
  publishLoadingTitle: string;
  publishChooseRemoteTitle: string;
  publishChooseRemoteDescription: string;
  publishSummary: (remote: string, branch: string) => string;
  publishCommitListLabel: string;
  publishLoadingFiles: string;
  publishFilesError: string;
  publishLoadingDiff: string;
  publishDiffError: string;
  publishUnsavedFilesNote: string;
  publishRemainingNote: (count: number) => string;
  publishTeammatesNote: string;
  publishConfirm: string;
  /** The held-back primary action while the fresh plan's remote check runs. */
  publishCheckingRemote: string;
  publishPublishing: string;
  publishVerifying: string;
  publishCannotCloseNote: string;
  publishReviewUpdatedPlan: string;
  publishCheckRemoteAgain: string;
  publishSuccessDescription: (count: number, remote: string) => string;
}

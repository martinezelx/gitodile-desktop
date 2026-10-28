import type { PublishTranslations } from "./translations";

export const en: PublishTranslations = {
  publishDialogTitle: "Publish changes",
  publishDialogTitleFirst: "Publish a new branch",
  publishDialogTitleAgain: "Publish the branch again",
  publishNothingTitle: "Everything is published",
  publishBlockedTitle: "Can't publish yet",
  publishSafeNote: "Nothing already on the remote is overwritten.",
  publishRecreateWarningTitle: (remote) => `This branch was deleted on “${remote}”.`,
  publishRecreateWarningBody:
    "Publishing creates it there again. If its pull request was already merged, switching to the main branch is usually better.",
  publishRecreateOnlyBranch: (remote, branch) =>
    `“${branch}” will be created again on “${remote}”. Its versions are already on the remote.`,
  publishRecreateConfirm: "Recreate and publish",
  publishCreateOnlyBranch: (remote, branch) =>
    `“${branch}” will be created on “${remote}”. Its versions are already on the remote.`,
  publishBranchCreatedDescription: (branch, remote) => `“${branch}” is now on “${remote}”.`,
  publishChooseRemoteHeading: "Where to publish?",
  publishPlanLine: (count, remote, branch) =>
    count === 1
      ? `1 version will be published to “${branch}” on “${remote}”.`
      : `${count} versions will be published to “${branch}” on “${remote}”.`,
  publishLoadingTitle: "Checking what's ready to publish…",
  publishChooseRemoteTitle: "Choose a remote",
  publishChooseRemoteDescription: "This project has several remotes.",
  publishSummary: (remote, branch) => `Publish to “${remote}” (${branch}).`,
  publishCommitListLabel: "Versions to publish",
  publishLoadingFiles: "Loading changed files…",
  publishFilesError: "Couldn't load the changed files.",
  publishLoadingDiff: "Loading changes…",
  publishDiffError: "Couldn't load this file's changes.",
  publishUnsavedFilesNote: "Your unsaved changes stay on this computer.",
  publishRemainingNote: (count) =>
    count === 1
      ? "1 more version stays unpublished for now."
      : `${count} more versions stay unpublished for now.`,
  publishTeammatesNote: "Anyone with access to the remote project will see them.",
  publishConfirm: "Publish changes",
  publishCheckingRemote: "Checking the remote…",
  publishPublishing: "Publishing…",
  publishVerifying: "Checking the result…",
  publishCannotCloseNote: "Keep this window open until it finishes.",
  publishReviewUpdatedPlan: "Review again",
  publishCheckRemoteAgain: "Check remote again",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `1 version published to “${remote}”.`
      : `${count} versions published to “${remote}”.`,
};


import { prepareRendererForInstall } from "../../runtime/install";

import type { UpdateState } from "./domain";
import type { AppUpdatesPort } from "./port";

export type InstallSubmission =
  | Readonly<{ kind: "blocked"; label: string }>
  | Readonly<{ kind: "submitted"; state: UpdateState }>;

/** The future updater UI calls this only after explicit user consent. Drafts
 * are synchronously inspected first, then renderer participants suspend, then
 * the native service closes admission and stops watchers. */
export async function installReadyUpdate(
  port: AppUpdatesPort,
  candidateId: string,
): Promise<InstallSubmission> {
  const renderer = prepareRendererForInstall();
  if (renderer.kind === "blocked") {
    return { kind: "blocked", label: renderer.label };
  }
  try {
    const { drafts } = renderer.preparation;
    const state = await port.install(candidateId, {
      protectedCount: drafts.protected.length,
      blockers: drafts.blockers.map((blocker) => blocker.label),
    });
    return { kind: "submitted", state };
  } finally {
    // On a successful native handoff the process exits/restarts before this
    // resolves. Every returned rejection or failure restores normal work.
    renderer.preparation.release();
  }
}

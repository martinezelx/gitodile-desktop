import { prepareInstallDrafts, type DraftPreparation } from "../drafts";

type Resume = () => void;
export type InstallParticipant = Readonly<{
  id: string;
  label: string;
  suspend: () => Resume;
}>;

const participants = new Map<string, InstallParticipant>();

export function registerInstallParticipant(participant: InstallParticipant): () => void {
  if (participants.has(participant.id)) {
    throw new Error(`duplicate install participant: ${participant.id}`);
  }
  participants.set(participant.id, participant);
  return () => {
    if (participants.get(participant.id) === participant) participants.delete(participant.id);
  };
}

export type RendererInstallPreparation = Readonly<{
  drafts: DraftPreparation;
  release: () => void;
}>;

/** Suspends renderer-owned timers/speculative work before native admission.
 * A failed participant rolls back those already suspended; draft blockers are
 * reported before any background owner changes state. */
export function prepareRendererForInstall():
  | { kind: "ready"; preparation: RendererInstallPreparation }
  | { kind: "blocked"; drafts: DraftPreparation; label: string } {
  const drafts = prepareInstallDrafts();
  if (drafts.blockers.length > 0) {
    return { kind: "blocked", drafts, label: drafts.blockers[0].label };
  }
  const resumes: Resume[] = [];
  try {
    for (const participant of participants.values()) {
      resumes.push(participant.suspend());
    }
  } catch {
    for (const resume of resumes.reverse()) resume();
    return { kind: "blocked", drafts, label: "background work" };
  }
  let released = false;
  return {
    kind: "ready",
    preparation: {
      drafts,
      release() {
        if (released) return;
        released = true;
        for (const resume of resumes.reverse()) resume();
      },
    },
  };
}

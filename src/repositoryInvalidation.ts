import type { ProjectSession } from "./projectSessions";

export type RepositoryInvalidationKind =
  | "worktree"
  | "head_or_refs"
  | "shared_repository";

export type RepositoryInvalidation = {
  projectId: string;
  sessionEpoch: string;
  sequence: number;
  kind: RepositoryInvalidationKind;
};

export function acceptsRepositoryInvalidation(
  session: ProjectSession | undefined,
  event: RepositoryInvalidation,
  previousSequence: number,
): boolean {
  return Boolean(
    session &&
      session.id === event.projectId &&
      session.epoch === event.sessionEpoch &&
      Number.isSafeInteger(event.sequence) &&
      event.sequence > previousSequence,
  );
}

export function invalidationNeedsSharedRefresh(kind: RepositoryInvalidationKind): boolean {
  return kind === "head_or_refs" || kind === "shared_repository";
}

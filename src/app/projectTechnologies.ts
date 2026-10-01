import { useEffect, useMemo, useRef, useState } from "react";
import { projectSettingsPort, type ProjectSettingsPort } from "../features/project-settings";
import { isTechnologyId, type TechnologyId } from "../shared/ui/projectIdentity";

/** One open project, addressed the way its detection read is scoped. */
export type ProjectTechnologyTarget = {
  /** The canonical worktree root, which the session reducer already uses as id. */
  id: string;
  path: string;
  sessionEpoch: string;
};

/** Detected technology by project id; `null` means nothing was recognised. */
export type ProjectTechnologyMap = ReadonlyMap<string, TechnologyId | null>;

export type ProjectTechnologyResult = {
  technologies: ProjectTechnologyMap;
  /** Projects whose read failed. A failure is not the same as "nothing
   * detected": the avatar falls back to initials either way, but a surface
   * that explains the icon should be allowed to say which happened. */
  failed: ReadonlySet<string>;
};

type Detection = {
  sessionEpoch: string;
  technology: TechnologyId | null;
  failed: boolean;
};

/**
 * Reads the detected technology for every open project, once each, and keeps
 * the answers for the identity chip.
 *
 * Detection is a bounded read of a few root manifests, so it runs as soon as a
 * project is open rather than waiting for an idle slot; the session epoch is
 * part of the request key, so reopening a project re-reads it. A failed read is
 * not retried in a loop — the project falls back to its initials and is
 * recorded in `failed`.
 *
 * There is deliberately no "still mounted" guard: a read that resolves after
 * the hook has gone calls `setState` on an unmounted component, which React
 * ignores, whereas a guard ref that a development StrictMode remount forgets to
 * re-arm silently drops every answer for the rest of the session.
 */
export function useProjectTechnologies(
  projects: readonly ProjectTechnologyTarget[],
  port: ProjectSettingsPort = projectSettingsPort,
): ProjectTechnologyResult {
  const [detections, setDetections] = useState<ReadonlyMap<string, Detection>>(() => new Map());
  const requested = useRef<Map<string, string>>(new Map());
  // Updated only by the committed effect. Mutating a ref during render would
  // let an abandoned concurrent render reject a still-current IPC answer.
  const activeEpochs = useRef<ReadonlyMap<string, string>>(new Map());

  // A result from a closed incarnation must not appear during the next one's
  // read, even for a single frame. Only the matching epoch is visible.
  const { technologies, failed } = useMemo(() => {
    const technologies = new Map<string, TechnologyId | null>();
    const failed = new Set<string>();
    for (const project of projects) {
      const detection = detections.get(project.id);
      if (detection?.sessionEpoch !== project.sessionEpoch) continue;
      technologies.set(project.id, detection.technology);
      if (detection.failed) failed.add(project.id);
    }
    return { technologies, failed };
  }, [detections, projects]);

  useEffect(() => {
    const currentProjects = projects;
    activeEpochs.current = new Map(
      currentProjects.map((project) => [project.id, project.sessionEpoch]),
    );
    for (const [id, epoch] of requested.current) {
      if (activeEpochs.current.get(id) !== epoch) requested.current.delete(id);
    }
    setDetections((current) => {
      const retained = [...current].filter(([id, detection]) =>
        currentProjects.some((project) =>
          project.id === id && project.sessionEpoch === detection.sessionEpoch,
        ),
      );
      return retained.length === current.size ? current : new Map(retained);
    });
    for (const project of currentProjects) {
      // A session without an epoch cannot be read (the command requires one),
      // so asking would only manufacture a failure.
      if (project.sessionEpoch.length === 0) continue;
      if (requested.current.get(project.id) === project.sessionEpoch) continue;
      requested.current.set(project.id, project.sessionEpoch);
      void port.readTechnology({ path: project.path, sessionEpoch: project.sessionEpoch }).then(
        (result) => {
          if (activeEpochs.current.get(project.id) !== project.sessionEpoch) return;
          const technology = isTechnologyId(result.technology) ? result.technology : null;
          setDetections((current) => new Map(current).set(project.id, {
            sessionEpoch: project.sessionEpoch,
            technology,
            failed: false,
          }));
        },
        () => {
          if (activeEpochs.current.get(project.id) !== project.sessionEpoch) return;
          setDetections((current) => new Map(current).set(project.id, {
            sessionEpoch: project.sessionEpoch,
            technology: null,
            failed: true,
          }));
        },
      );
    }
  }, [projects, port]);

  return { technologies, failed };
}

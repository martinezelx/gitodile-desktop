import { useEffect, useRef } from "react";
import { registerInstallParticipant } from "../../runtime/install";

type AutomaticRemoteCheckOptions = {
  intervalMinutes: number;
  projectId: string | null;
  sessionEpoch: string | null;
  eligible: boolean;
  onCheck: () => void;
};

/** One timer for the active project, owned above every screen. Navigation does
 * not affect it; changing project/session or preference starts a fresh cadence.
 * The sync controller deduplicates a tick that overlaps a manual check. */
export function useAutomaticRemoteCheck({
  intervalMinutes,
  projectId,
  sessionEpoch,
  eligible,
  onCheck,
}: AutomaticRemoteCheckOptions): void {
  const onCheckRef = useRef(onCheck);
  onCheckRef.current = onCheck;

  useEffect(() => {
    if (intervalMinutes === 0 || !projectId || !sessionEpoch || !eligible) {
      return undefined;
    }
    let timer: number | null = null;
    const start = (): void => {
      timer = window.setInterval(() => onCheckRef.current(), intervalMinutes * 60_000);
    };
    const stop = (): void => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    start();
    const unregister = registerInstallParticipant({
      id: `automatic-remote-check:${projectId}:${sessionEpoch}`,
      label: "automatic project-change checks",
      suspend() {
        stop();
        return start;
      },
    });
    return () => {
      unregister();
      stop();
    };
  }, [eligible, intervalMinutes, projectId, sessionEpoch]);
}

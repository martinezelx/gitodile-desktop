import { useEffect, useRef } from "react";

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
    const timer = window.setInterval(() => onCheckRef.current(), intervalMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [eligible, intervalMinutes, projectId, sessionEpoch]);
}

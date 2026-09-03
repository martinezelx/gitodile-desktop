import { useCallback, useEffect, useRef, useState } from "react";
import { useIssueReportUrl } from "./issueReport";
import { issueReportPort, type IssueReportPort } from "./issueReportAdapter";

/** The shell owns browser launch failures; repository state is never involved. */
export function useIssueReport(gitVersion: string | null, port: IssueReportPort = issueReportPort) {
  const url = useIssueReportUrl(gitVersion);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [isOpening, setOpening] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const generation = useRef(0);
  const opening = useRef(false);
  const copying = useRef(false);

  const dismiss = useCallback(() => {
    generation.current++;
    opening.current = false;
    copying.current = false;
    setFailedUrl(null);
    setOpening(false);
    setCopyState("idle");
  }, []);
  useEffect(() => () => { generation.current++; }, []);

  const launch = async (target: string): Promise<void> => {
    if (opening.current) return;
    opening.current = true;
    copying.current = false;
    const attempt = ++generation.current;
    setOpening(true);
    setCopyState("idle");
    try {
      await port.open(target);
      if (attempt === generation.current) setFailedUrl(null);
    } catch {
      if (attempt === generation.current) setFailedUrl(target);
    } finally {
      if (attempt === generation.current) {
        opening.current = false;
        setOpening(false);
      }
    }
  };

  const copyLink = async (): Promise<void> => {
    if (failedUrl === null || copying.current || opening.current) return;
    const attempt = generation.current;
    copying.current = true;
    setCopyState("copying");
    try {
      await port.copy(failedUrl);
      if (attempt === generation.current) setCopyState("copied");
    } catch {
      if (attempt === generation.current) setCopyState("failed");
    } finally {
      if (attempt === generation.current) copying.current = false;
    }
  };

  return {
    failedUrl, isOpening, copyState, dismiss, copyLink,
    report: () => launch(url),
    // Keep the exact diagnostics and language from the failed attempt.
    retry: () => launch(failedUrl ?? url),
  };
}

export type IssueReportState = ReturnType<typeof useIssueReport>;

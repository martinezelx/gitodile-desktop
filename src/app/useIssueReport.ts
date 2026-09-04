import { useCallback, useEffect, useRef, useState } from "react";
import { buildIssueReportUrl, useIssueReportEnvironment } from "./issueReport";
import { issueReportPort, type IssueReportPort } from "./issueReportAdapter";

type FlowPhase = "closed" | "preparing" | "review" | "opening" | "failed";
type ActionState = "idle" | "working" | "done" | "failed";

/** The shell owns the review and browser launch; repository state is never
 * read here. Rust supplies a bounded snapshot of session activity. */
export function useIssueReport(gitVersion: string | null, port: IssueReportPort = issueReportPort) {
  const { environment, language } = useIssueReportEnvironment(gitVersion);
  const [phase, setPhase] = useState<FlowPhase>("closed");
  const [reportText, setReportText] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [copyReportState, setCopyReportState] = useState<ActionState>("idle");
  const [saveState, setSaveState] = useState<ActionState>("idle");
  const [copyLinkState, setCopyLinkState] = useState<ActionState>("idle");
  const generation = useRef(0);
  const busy = useRef(false);

  const dismiss = useCallback(() => {
    generation.current++;
    busy.current = false;
    setPhase("closed");
    setReportText(null);
    setFailedUrl(null);
    setCopyReportState("idle");
    setSaveState("idle");
    setCopyLinkState("idle");
  }, []);
  useEffect(() => () => { generation.current++; }, []);

  const report = async (): Promise<void> => {
    if (busy.current || phase !== "closed") return;
    busy.current = true;
    const attempt = ++generation.current;
    setPhase("preparing");
    try {
      const rendered = await port.render(environment);
      if (attempt === generation.current) {
        setReportText(rendered);
        setPhase("review");
      }
    } catch {
      // Keep issue reporting usable in a plain Vite browser and if the native
      // diagnostic command itself fails. Every byte still remains reviewable.
      if (attempt === generation.current) {
        setReportText(`Environment\n-----------\n${environment}\n\nSession activity\n----------------\nSession activity was unavailable.`);
        setPhase("review");
      }
    } finally {
      if (attempt === generation.current) busy.current = false;
    }
  };

  const continueToGitHub = async (): Promise<void> => {
    if (busy.current || reportText === null) return;
    busy.current = true;
    const attempt = ++generation.current;
    const target = buildIssueReportUrl(reportText, language);
    setPhase("opening");
    setCopyReportState("idle");
    setSaveState("idle");
    try {
      await port.open(target);
      if (attempt === generation.current) dismiss();
    } catch {
      if (attempt === generation.current) {
        setFailedUrl(target);
        setPhase("failed");
      }
    } finally {
      if (attempt === generation.current) busy.current = false;
    }
  };

  const retry = async (): Promise<void> => {
    if (busy.current || failedUrl === null) return;
    busy.current = true;
    const attempt = ++generation.current;
    setPhase("opening");
    setCopyLinkState("idle");
    try {
      await port.open(failedUrl);
      if (attempt === generation.current) dismiss();
    } catch {
      if (attempt === generation.current) setPhase("failed");
    } finally {
      if (attempt === generation.current) busy.current = false;
    }
  };

  const runReportAction = async (
    action: (value: string) => Promise<unknown>,
    setState: (state: ActionState) => void,
  ): Promise<void> => {
    if (reportText === null) return;
    const attempt = generation.current;
    setState("working");
    try {
      const outcome = await action(reportText);
      if (attempt === generation.current) setState(outcome === false ? "idle" : "done");
    } catch {
      if (attempt === generation.current) setState("failed");
    }
  };

  const copyLink = async (): Promise<void> => {
    if (failedUrl === null || copyLinkState === "working" || busy.current) return;
    const attempt = generation.current;
    setCopyLinkState("working");
    try {
      await port.copy(failedUrl);
      if (attempt === generation.current) setCopyLinkState("done");
    } catch {
      if (attempt === generation.current) setCopyLinkState("failed");
    }
  };

  return {
    phase,
    isOpen: phase !== "closed",
    isOpening: phase === "preparing" || phase === "opening",
    reportText,
    failedUrl,
    copyReportState,
    saveState,
    copyLinkState,
    dismiss,
    report,
    continueToGitHub,
    retry,
    copyReport: () => {
      setSaveState("idle");
      return runReportAction(port.copy, setCopyReportState);
    },
    saveReport: () => {
      setCopyReportState("idle");
      return runReportAction(port.save, setSaveState);
    },
    copyLink,
  };
}

export type IssueReportState = ReturnType<typeof useIssueReport>;

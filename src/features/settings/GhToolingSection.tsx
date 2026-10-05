import { useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleArrowUp,
  ExternalLink,
  Info,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { ToolInstallationRow, type ToolChip } from "../../shared/ui";
import { GitHubIcon } from "./GitHubIcon";
import type { GitDiagnostics, GitInstallationResult, GitUpdateLaunchResult, GitUpdateStatus } from "./domain";
import { ToolRecheckButton } from "./ToolRecheckButton";
import type { SettingsPort } from "./port";
import type { GitToolingState } from "./useGitTooling";
import { useToolNotice, type ToolNotice } from "./useToolNotice";

export type HostingToolingCopy = { ghAccountDescription: string; ghAccountTitle: string; ghActionFailed: string; ghCheckFailed: string; ghChipCheckFailed: string; ghChipInstalled: string; ghChipMissing: string; ghChipUnusable: string; ghDescription: string; ghGuidanceOpened: string; ghInstall: string; ghInstallerLaunched: string; ghInstructions: string; ghMissing: string; ghName: string; ghTitle: string; ghUnusable: string; ghUpdateCheckFailed: string; ghUpdateCheckTimedOut: string; ghUpdateChecking: string; ghUpdateUnavailable: string; ghUpdateUpToDate: string;  };
export interface HostingToolingPort { readDiagnostics(): Promise<GitDiagnostics>; checkUpdate(): Promise<GitUpdateStatus>; install(): Promise<GitInstallationResult>; update(): Promise<GitUpdateLaunchResult> }

type NoticeTone = ToolNotice["tone"];

const NOTICE_ICONS: Record<NoticeTone, ReactNode> = {
  success: <CheckCircle2 aria-hidden="true" />,
  neutral: <Info aria-hidden="true" />,
  warning: <TriangleAlert aria-hidden="true" />,
  danger: <CircleAlert aria-hidden="true" />,
};

const UPDATE_ICONS: Record<string, ReactNode> = {
  checking: <LoaderCircle aria-hidden="true" className="icon--spinning" />,
  success: <CheckCircle2 aria-hidden="true" />,
  accent: <CircleArrowUp aria-hidden="true" />,
  warning: <TriangleAlert aria-hidden="true" />,
};

/** Optional machine tooling. Installation never implies GitHub authentication. */
export function GhToolingSection({ port, tooling, account, copy, mark, actions, guidanceUrl = "https://github.com/cli/cli#installation" }: {
  port: SettingsPort;
  tooling: GitToolingState;
  account?: ReactNode;
  copy?: HostingToolingCopy; mark?: ReactNode; actions?: HostingToolingPort; guidanceUrl?: string;
}): React.JSX.Element {
  const { t } = useLanguage();
  const text = copy ?? t;
  const { notice, clear: clearNotice, begin: beginNotice } = useToolNotice();
  const [isStarting, setIsStarting] = useState(false);
  const starting = useRef(false);
  const [platform] = useState(() => port.readPlatform());
  const isWindows = platform === "windows";
  const diagnostics = tooling.diagnostics;
  const available = diagnostics?.state === "available";
  const update = tooling.updateStatus?.state ?? null;

  const instructions = async (): Promise<void> => {
    const report = beginNotice();
    try {
      // A fixed official URL; the renderer never chooses an installer or command.
      await port.openGuidance(guidanceUrl);
      report({ tone: "neutral", message: text.ghGuidanceOpened });
    } catch {
      report({ tone: "danger", message: text.ghActionFailed });
    }
  };

  const start = async (action: "install" | "update"): Promise<void> => {
    if (starting.current) return;
    starting.current = true;
    setIsStarting(true);
    const report = beginNotice();
    try {
      if (action === "install") {
        const result = await (actions ? actions.install() : port.installGh());
        if (result.guidanceUrl) await port.openGuidance(result.guidanceUrl);
        report(result.outcome === "started" ? { tone: "success", message: text.ghInstallerLaunched }
          : result.outcome === "guidance" ? { tone: "neutral", message: text.ghGuidanceOpened }
            : result.outcome === "already_starting" ? { tone: "neutral", message: t.gitInstallerAlreadyStarting }
              : { tone: "danger", message: text.ghActionFailed });
      } else {
        const result = await (actions ? actions.update() : port.updateGh());
        report(result.outcome === "started" ? { tone: "success", message: text.ghInstallerLaunched }
          : result.outcome === "already_starting" ? { tone: "neutral", message: t.gitInstallerAlreadyStarting }
            : result.outcome === "unavailable" ? { tone: "warning", message: text.ghUpdateUnavailable }
              : { tone: "danger", message: text.ghActionFailed });
      }
    } catch {
      report({ tone: "danger", message: text.ghActionFailed });
    } finally {
      starting.current = false;
      setIsStarting(false);
    }
  };

  const chip: ToolChip =
    diagnostics === null
      ? { label: t.settingsToolChipChecking, tone: "neutral", icon: <LoaderCircle aria-hidden="true" className="icon--spinning" /> }
      : diagnostics.state === "missing"
        ? { label: text.ghChipMissing, tone: "neutral" }
        : diagnostics.state === "unusable"
          ? { label: text.ghChipUnusable, tone: "warning", icon: <TriangleAlert aria-hidden="true" /> }
          : diagnostics.state === "check_failed"
            ? { label: text.ghChipCheckFailed, tone: "warning", icon: <TriangleAlert aria-hidden="true" /> }
            : update === "update_available"
              ? { label: t.settingsGeneralUpdateAvailable, tone: "accent", icon: <CircleArrowUp aria-hidden="true" /> }
              : { label: text.ghChipInstalled, tone: "success", icon: <CheckCircle2 aria-hidden="true" /> };

  const detail =
    diagnostics === null ? (
      <span>{t.settingsToolCheckingDetail}</span>
    ) : diagnostics.state === "missing" ? (
      <strong>{text.ghMissing}</strong>
    ) : diagnostics.state === "unusable" ? (
      <p className="status-line status-line--warning">
        <TriangleAlert aria-hidden="true" />
        <span>{text.ghUnusable}</span>
      </p>
    ) : diagnostics.state === "check_failed" ? (
      <p className="status-line status-line--warning">
        <TriangleAlert aria-hidden="true" />
        <span>{text.ghCheckFailed}</span>
      </p>
    ) : (
      <p className="version-line">
        <span className="version-line__label">{t.settingsGitInstalledVersionLabel}</span>
        <span className="version-line__value">{diagnostics.version}</span>
      </p>
    );

  const status =
    notice !== null ? (
      <p className={`status-line status-line--${notice.tone}`} role="status">
        {NOTICE_ICONS[notice.tone]}
        <span>{notice.message}</span>
      </p>
    ) : available && update !== null ? (
      <p className={`status-line status-line--${update === "checking" ? "progress" : update === "update_available" ? "accent" : update === "up_to_date" ? "success" : "warning"}`} role="status">
        {UPDATE_ICONS[update === "checking" ? "checking" : update === "update_available" ? "accent" : update === "up_to_date" ? "success" : "warning"]}
        <span>
          {update === "checking" ? text.ghUpdateChecking
            : update === "update_available" ? t.settingsToolUpdateAvailableDetail
              : update === "up_to_date" ? text.ghUpdateUpToDate
                : update === "unavailable" ? text.ghUpdateUnavailable
                  : update === "timed_out" ? text.ghUpdateCheckTimedOut
                    : text.ghUpdateCheckFailed}
        </span>
      </p>
    ) : null;

  const installable = diagnostics !== null && diagnostics.state !== "available";
  const hint =
    diagnostics === null ? null
      : installable ? (
        <>
          <Info aria-hidden="true" />
          <span>{isWindows ? t.settingsInstallHintWindows : t.settingsInstallHintGuided}</span>
        </>
      ) : update === "update_available" && isWindows ? (
        <>
          <Info aria-hidden="true" />
          <span>{t.settingsUpdateHintWindows}</span>
        </>
      ) : null;

  const recheck = (
    <ToolRecheckButton
      label={t.settingsGeneralCheckAgain}
      busyLabel={t.settingsToolChipChecking}
      busy={tooling.isRefreshingDiagnostics}
      disabled={isStarting || tooling.isCheckingUpdate}
      onClick={() => {
        clearNotice();
        void tooling.refreshDiagnostics();
      }}
    />
  );

  const primaryAction =
    diagnostics === null ? (
      <button className="primary-button" type="button" disabled>
        {t.settingsToolChipChecking}
      </button>
    ) : installable ? (
      <button className="primary-button" type="button" disabled={isStarting || tooling.isRefreshingDiagnostics} onClick={() => void start("install")}>
        {isStarting ? t.gitStartingInstaller : isWindows ? text.ghInstall : t.settingsInstallGuided}
      </button>
    ) : update === "update_available" ? (
      <button className="primary-button" type="button" disabled={isStarting || tooling.isRefreshingDiagnostics} onClick={() => void start("update")}>
        {isStarting ? t.gitUpdateStarting : t.settingsGeneralUpdate}
      </button>
    ) : (
      <button className="primary-button" type="button" disabled={tooling.isCheckingUpdate || tooling.isRefreshingDiagnostics || isStarting} onClick={() => {
        clearNotice();
        void tooling.checkUpdate();
      }}>
        {tooling.isCheckingUpdate ? t.settingsToolSearching : t.gitUpdateCheck}
      </button>
    );

  const docs = (
    <button className="tool-row__docs-link" type="button" onClick={() => void instructions()}>
      {text.ghInstructions}
      <ExternalLink aria-hidden="true" />
    </button>
  );

  return (
    <>
      <section className="settings-group" aria-label={text.ghAccountTitle}>
        <header className="settings-group__header">
          <h3>{text.ghAccountTitle}</h3>
          <p>{text.ghAccountDescription}</p>
        </header>
        {account && <div className="settings-group__body">{account}</div>}
      </section>
      <section className="settings-group" aria-label={text.ghTitle}>
        <header className="settings-group__header">
          <h3>{text.ghTitle}</h3>
          <p>{text.ghDescription}</p>
        </header>
        <div className="settings-group__body">
          <ToolInstallationRow
            mark={mark ?? <GitHubIcon />}
            name={text.ghName}
            chip={chip}
            detail={detail}
            status={status}
            hint={hint}
            recheck={recheck}
            primaryAction={primaryAction}
            docs={docs}
          />
        </div>
      </section>

    </>
  );
}

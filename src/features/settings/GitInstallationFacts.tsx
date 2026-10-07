import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, CircleAlert, Copy, FolderSearch, LoaderCircle } from "lucide-react";

import { useLanguage } from "../../i18n";
import { copyTextToClipboard } from "../../shared/ui";
import type { GitDiagnostics, GitInstallationDetails, GitLocation, GitLocationTarget, GitPathFact } from "./domain";
import type { SettingsPort } from "./port";
import type { GitInstallationCopy } from "./translations";

const COPIED_FEEDBACK_MS = 1_500;

/** The origin line under the Git row: who installed it and, for Git for
 * Windows, for whom. */
export function gitOriginText(location: GitLocation, copy: GitInstallationCopy): string {
  const origin = copy.origin[location.distribution];
  return location.scope ? `${origin}, ${copy.scope[location.scope]}` : origin;
}

/** Git's `cpu:` build option in words. Unknown values are shown as Git
 * reports them rather than guessed at. */
export function architectureText(cpu: string, copy: GitInstallationCopy): string {
  switch (cpu.toLowerCase()) {
    case "x86_64":
    case "amd64":
      return copy.architecture["64"];
    case "arm64":
    case "aarch64":
      return copy.architecture.arm64;
    case "i686":
    case "i386":
    case "x86":
      return copy.architecture["32"];
    default:
      return cpu;
  }
}

/** The file manager by the name the reader knows it by, as VS Code and
 * GitHub Desktop name it: Explorer, Finder, or a plain folder elsewhere. */
function revealLabel(platform: string | null, copy: GitInstallationCopy): string {
  return platform === "windows" ? copy.reveal.windows : platform === "macos" ? copy.reveal.macos : copy.reveal.other;
}

/** Copy, and optionally show in the file manager, for one path. Like the
 * project path's copy in Overview they are borderless and surface on hover or
 * focus, so at rest the row shows only facts. The reveal names a place; Rust
 * finds the path again, so nothing here reaches the OS. */
function PathActions({ path, reveal, port, onProblem }: {
  path: string;
  reveal?: GitLocationTarget;
  port: SettingsPort;
  onProblem: (message: string | null) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const copy = t.gitInstallation;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const copyLabel = copied ? copy.copied : copy.copyPath;
  const showLabel = revealLabel(port.readPlatform(), copy);
  return (
    <span className="git-path__actions">
      <button
        className={`secondary-button${copied ? " is-copied" : ""}`}
        type="button"
        aria-label={copyLabel}
        data-tooltip={copyLabel}
        onClick={() => {
          onProblem(null);
          copyTextToClipboard(path).then(() => {
            setCopied(true);
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              timer.current = null;
              setCopied(false);
            }, COPIED_FEEDBACK_MS);
          }).catch(() => onProblem(copy.copyFailed));
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      {reveal && (
        <button
          className="secondary-button"
          type="button"
          aria-label={showLabel}
          data-tooltip={showLabel}
          onClick={() => {
            onProblem(null);
            port.revealGitLocation(reveal).catch(() => onProblem(copy.revealFailed));
          }}
        >
          <FolderSearch aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

function Problem({ message }: { message: string | null }): React.JSX.Element | null {
  if (!message) return null;
  return (
    <p className="status-line status-line--danger" role="status">
      <CircleAlert aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

/** The two settled facts that answer "which Git is this?" at a glance: how it
 * was installed and where the executable lives. They come with the Git check
 * itself, so they cost no extra process. */
export function GitLocationFacts({ location, port }: { location: GitLocation; port: SettingsPort }): React.JSX.Element {
  const { t } = useLanguage();
  const copy = t.gitInstallation;
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <p className="git-origin">{gitOriginText(location, copy)}</p>
      {/* Named as a group rather than with hidden text inside the value, so
          selecting the path by hand copies the path alone. */}
      <div className="git-path" role="group" aria-label={copy.pathLabel}>
        <span className="git-path__value">{location.executable}</span>
        <PathActions path={location.executable} reveal="executable" port={port} onProblem={setProblem} />
      </div>
      <Problem message={problem} />
    </>
  );
}

function Fact({ label, value, note, mono = false, actions }: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  mono?: boolean;
  actions?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="git-fact">
      <dt className="git-fact__label">{label}</dt>
      <dd className={`git-fact__value${mono ? " git-fact__value--mono" : ""}`}>
        {value}
        {note && <span className="git-fact__note">{note}</span>}
      </dd>
      <dd className="git-fact__actions">{actions}</dd>
    </div>
  );
}

type DetailsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; details: GitInstallationDetails }
  | { status: "failed" };

/** "Technical details": read when the reader opens it, because it costs
 * several Git processes and nothing else on the screen needs it. A recheck
 * can find a different Git, so new diagnostics discard what was read. */
export function GitTechnicalDetails({ diagnostics, port }: { diagnostics: GitDiagnostics; port: SettingsPort }): React.JSX.Element {
  const { t } = useLanguage();
  const copy = t.gitInstallation;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DetailsState>({ status: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const id = ++request.current;
    setState({ status: "loading" });
    try {
      const details = await port.readInstallationDetails();
      if (id === request.current) setState({ status: "loaded", details });
    } catch {
      if (id === request.current) setState({ status: "failed" });
    }
  }, [port]);

  useEffect(() => {
    request.current += 1;
    setState({ status: "idle" });
    setProblem(null);
  }, [diagnostics]);

  useEffect(() => {
    if (open && state.status === "idle") void load();
  }, [open, state.status, load]);

  const pathFact = (label: string, fact: GitPathFact | null, reveal?: GitLocationTarget, note?: string, missing?: string): ReactNode => (
    <Fact
      label={label}
      mono={fact !== null}
      value={fact?.path ?? copy.unknown}
      note={fact && !fact.exists && missing ? missing : note}
      actions={fact && (
        <PathActions path={fact.path} reveal={fact.exists ? reveal : undefined} port={port} onProblem={setProblem} />
      )}
    />
  );

  return (
    <details className="git-details" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <ChevronRight aria-hidden="true" className="git-details__chevron" />
        <span>{copy.detailsTitle}</span>
      </summary>
      {state.status === "loading" || state.status === "idle" ? (
        <p className="git-details__state" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          <span>{copy.detailsLoading}</span>
        </p>
      ) : state.status === "failed" ? (
        <div className="git-details__state">
          <p className="status-line status-line--danger" role="status">
            <CircleAlert aria-hidden="true" />
            <span>{copy.detailsFailed}</span>
          </p>
          <button className="secondary-button" type="button" onClick={() => void load()}>{copy.detailsRetry}</button>
        </div>
      ) : (
        <>
          <dl className="git-facts">
            <Fact
              label={copy.version}
              value={[diagnostics.version ?? copy.unknown, state.details.architecture && architectureText(state.details.architecture, copy)]
                .filter(Boolean)
                .join(" · ")}
              note={diagnostics.location ? gitOriginText(diagnostics.location, copy) : undefined}
            />
            {pathFact(copy.execPath, state.details.execPath)}
            {pathFact(copy.globalConfig, state.details.globalConfig, "global_config", copy.globalConfigNote, copy.globalConfigMissing)}
            {pathFact(copy.systemConfig, state.details.systemConfig, "system_config", copy.systemConfigNote)}
            <Fact
              label={copy.signIns}
              value={copy.credentialHelpers[state.details.credentialHelper]}
              note={copy.credentialNotes[state.details.credentialHelper]}
            />
            <Fact
              label={copy.largeFiles}
              value={state.details.largeFilesVersion
                ? copy.largeFilesInstalled.replace("{version}", state.details.largeFilesVersion)
                : copy.largeFilesMissing}
              note={copy.largeFilesNote}
            />
            <Fact label={copy.editor} value={state.details.editor ?? copy.editorNotSet} note={copy.editorNote} />
          </dl>
          <Problem message={problem} />
        </>
      )}
    </details>
  );
}

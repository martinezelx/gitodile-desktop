import { openUrl } from "@tauri-apps/plugin-opener";
import { CURRENT_APP_RELEASE } from "./appRelease";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export type IssueReportPort = {
  render: (environment: string) => Promise<string>;
  open: (url: string) => Promise<void>;
  copy: (text: string) => Promise<void>;
  save: (report: string) => Promise<boolean>;
};

/** One saved report per press, named so a maintainer holding several of them
 * can tell which build and which session each came from. The stamp is UTC to
 * match the report's own header, and nothing identifying the machine or the
 * person goes into a name that ends up attached to a public issue. */
export function diagnosticReportFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const version = CURRENT_APP_RELEASE.version.replace(/[^A-Za-z0-9.]+/g, "-");
  return `gitodile-report-${version}-${stamp}.txt`;
}

export const issueReportPort: IssueReportPort = {
  render: (environment) => invoke("render_diagnostic_report", { environment }),
  open: (url) => openUrl(url),
  copy: (text) => navigator.clipboard.writeText(text),
  save: async (report) => {
    const path = await save({
      defaultPath: diagnosticReportFileName(),
      filters: [{ name: "Plain text", extensions: ["txt"] }],
    });
    if (path === null) return false;
    await invoke("save_diagnostic_report", { path, report });
    return true;
  },
};

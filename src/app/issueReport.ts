import { CURRENT_APP_RELEASE } from "./appRelease";
import { useLanguage, type Language } from "../i18n";
import contract from "./issueReportContract.json";
import { formatDiagnostics, readWebviewVersion, useSystemInfo } from "./systemInfo";

/** User support has a stable public home independent of source visibility. */
export const FEEDBACK_REPOSITORY_URL = `https://github.com/${contract.repository}`;

const ENVIRONMENT_HEADING = "Environment\n-----------\n";
const ACTIVITY_HEADING = "\n\nSession activity\n----------------";

/** The versions alone, without the headings that only make sense in the full
 * plain-text report. */
function environmentPrefill(report: string): string {
  const start = report.startsWith(ENVIRONMENT_HEADING) ? ENVIRONMENT_HEADING.length : 0;
  const end = report.indexOf(ACTIVITY_HEADING, start);
  return report.slice(start, end === -1 ? undefined : end).trim();
}

/** Share the reviewed environment and the publication check's form IDs.
 * Unknown query parameters are silently ignored by GitHub, so filenames and
 * IDs in issueReportContract.json must remain compatible with shipped builds.
 *
 * Only the versions travel in the address. A session's activity is thousands of
 * characters — past what GitHub accepts before it answers 414 rather than a
 * form — and it belongs to the report the user pastes or attaches, which is the
 * route that carries it whole and the one they have already been shown. */
export function buildIssueReportUrl(report: string, language: Language = "en"): string {
  const params = new URLSearchParams({
    template: contract.bugTemplates[language],
    [contract.diagnosticsField]: environmentPrefill(report),
  });
  return `${FEEDBACK_REPOSITORY_URL}/issues/new?${params.toString()}`;
}

/** No repository reads or network requests: reuse the cached Git diagnostics
 * and the system information that remains constant for this window. Rust adds
 * the bounded session activity when the review dialog is requested. */
export function useIssueReportEnvironment(gitVersion: string | null): { environment: string; language: Language } {
  const { language } = useLanguage();
  const system = useSystemInfo();
  return {
    environment: formatDiagnostics({
      appVersion: CURRENT_APP_RELEASE.version,
      system,
      webview: readWebviewVersion(navigator.userAgent),
      gitVersion,
    }),
    language,
  };
}

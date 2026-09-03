import { CURRENT_APP_RELEASE } from "./appRelease";
import { useLanguage, type Language } from "../i18n";
import contract from "./issueReportContract.json";
import { formatDiagnostics, readWebviewVersion, useSystemInfo } from "./systemInfo";

/** User support is public even though the application's source is private. */
export const FEEDBACK_REPOSITORY_URL = `https://github.com/${contract.repository}`;

/** Share About's available diagnostics and the publication check's form IDs.
 * Unknown query parameters are silently ignored by GitHub, so filenames and
 * IDs in issueReportContract.json must remain compatible with shipped builds. */
export function buildIssueReportUrl(parts: Parameters<typeof formatDiagnostics>[0], language: Language = "en"): string {
  const params = new URLSearchParams({
    template: contract.bugTemplates[language],
    [contract.diagnosticsField]: formatDiagnostics(parts),
  });
  return `${FEEDBACK_REPOSITORY_URL}/issues/new?${params.toString()}`;
}

/** No repository reads or network requests: reuse the cached Git diagnostics
 * and the system information that remains constant for this window. */
export function useIssueReportUrl(gitVersion: string | null): string {
  const { language } = useLanguage();
  const system = useSystemInfo();
  return buildIssueReportUrl({
    appVersion: CURRENT_APP_RELEASE.version,
    system,
    webview: readWebviewVersion(navigator.userAgent),
    gitVersion,
  }, language);
}

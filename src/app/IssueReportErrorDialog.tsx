import { useRef } from "react";
import { CircleAlert } from "lucide-react";
import { useLanguage } from "../i18n";
import { useModalFocus } from "../shared/ui/modalFocus";
import type { IssueReportState } from "./useIssueReport";

export function IssueReportErrorDialog({ report }: { report: IssueReportState }): React.JSX.Element | null {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(report.failedUrl !== null, ref, report.dismiss);
  if (report.failedUrl === null) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={report.dismiss}>
      <div ref={ref} className="message-dialog" role="alertdialog" aria-modal="true"
        aria-labelledby="issue-report-error-title" aria-describedby="issue-report-error-message"
        tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <span className="message-dialog__icon" aria-hidden="true"><CircleAlert /></span>
        <h2 id="issue-report-error-title">{t.issueReportFailedTitle}</h2>
        <p id="issue-report-error-message">{t.issueReportFailedMessage}</p>
        <label className="text-field">
          {t.issueReportLink}
          <input readOnly value={report.failedUrl} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <p role="status">{report.copyState === "failed" ? t.issueReportCopyFailed : report.copyState === "copied" ? t.issueReportCopied : ""}</p>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={report.dismiss}>{t.commonClose}</button>
          <button className="secondary-button" type="button" disabled={report.isOpening || report.copyState === "copying"}
            onClick={() => void report.copyLink()}>{t.issueReportCopyLink}</button>
          <button className="primary-button" type="button" data-autofocus disabled={report.isOpening}
            onClick={() => void report.retry()}>{report.isOpening ? t.issueReportOpening : t.issueReportRetry}</button>
        </div>
      </div>
    </div>
  );
}

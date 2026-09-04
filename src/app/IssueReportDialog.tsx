import { useRef } from "react";
import { CircleAlert, Copy, ExternalLink, Info, LoaderCircle, Save } from "lucide-react";
import { useLanguage } from "../i18n";
import { autoHideScrollbarProps } from "../shared/ui/autoHideScrollbar";
import { DialogCloseButton } from "../shared/ui/dialogCloseButton";
import { useModalFocus } from "../shared/ui/modalFocus";
import type { IssueReportState } from "./useIssueReport";

export function IssueReportDialog({ report }: { report: IssueReportState }): React.JSX.Element | null {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(report.isOpen, ref, report.dismiss);
  if (!report.isOpen) return null;

  const reviewing = report.phase === "review" || report.phase === "opening";
  const reportStatus = report.copyReportState === "failed"
    ? t.issueReportCopyReportFailed
    : report.copyReportState === "done"
      ? t.issueReportReportCopied
      : report.saveState === "failed"
        ? t.issueReportSaveFailed
        : report.saveState === "done"
          ? t.issueReportSaved
          : "";

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={report.dismiss}>
      <div
        ref={ref}
        className="message-dialog issue-report-dialog"
        role={report.phase === "failed" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="issue-report-title"
        aria-describedby={report.phase === "failed" ? "issue-report-error-message" : "issue-report-description"}
        aria-busy={report.phase === "preparing" || report.phase === "opening"}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogCloseButton label={t.commonClose} onClick={report.dismiss} />
        {report.phase === "preparing" && (
          <>
            <LoaderCircle className="issue-report-dialog__loader" aria-hidden="true" />
            <h2 id="issue-report-title">{t.issueReportPreparingTitle}</h2>
            <p id="issue-report-description">{t.issueReportPreparingMessage}</p>
          </>
        )}

        {reviewing && report.reportText !== null && (
          <>
            <h2 id="issue-report-title">{t.issueReportReviewTitle}</h2>
            <p id="issue-report-description">{t.issueReportReviewMessage}</p>
            {/* The report is shown exactly as it will be published. Re-rendering
                its parts as labelled chips reads tidier but shows the user a
                depiction of the payload rather than the payload, which is the
                one thing this consent step exists to prevent. */}
            {/* The frame and the scroller are two elements on purpose: an
                element's own border-radius does not clip the scrollbar it
                paints, so a rounded viewer let the thumb spill past the corner
                curve. The frame clips; the <pre> scrolls inside it. */}
            <div className="issue-report-dialog__report">
              <pre
                {...autoHideScrollbarProps<HTMLPreElement>()}
                className="issue-report-dialog__report-body auto-hide-scrollbar"
                role="region"
                aria-label={t.issueReportContentsLabel}
                tabIndex={0}
              >{report.reportText}</pre>
            </div>
            <p className="issue-report-dialog__note">
              <Info aria-hidden="true" />
              {t.issueReportAttachmentNote}
            </p>
            <p className="issue-report-dialog__status" role="status">{reportStatus}</p>
            <div className="dialog-actions issue-report-dialog__actions">
              <button className="secondary-button" type="button" disabled={report.phase === "opening" || report.copyReportState === "working"} onClick={() => void report.copyReport()}>
                <Copy aria-hidden="true" /> {t.issueReportCopyReport}
              </button>
              <button className="secondary-button" type="button" disabled={report.phase === "opening" || report.saveState === "working"} onClick={() => void report.saveReport()}>
                <Save aria-hidden="true" /> {report.saveState === "working" ? t.issueReportSaving : t.issueReportSaveReport}
              </button>
              <button className="primary-button" type="button" data-autofocus disabled={report.phase === "opening"} onClick={() => void report.continueToGitHub()}>
                <ExternalLink aria-hidden="true" /> {report.phase === "opening" ? t.issueReportOpening : t.issueReportContinue}
              </button>
            </div>
          </>
        )}

        {report.phase === "failed" && report.failedUrl !== null && (
          <>
            <span className="message-dialog__icon" aria-hidden="true"><CircleAlert /></span>
            <h2 id="issue-report-title">{t.issueReportFailedTitle}</h2>
            <p id="issue-report-error-message">{t.issueReportFailedMessage}</p>
            <label className="text-field">
              {t.issueReportLink}
              <input readOnly value={report.failedUrl} onFocus={(event) => event.currentTarget.select()} />
            </label>
            <p role="status">{report.copyLinkState === "failed" ? t.issueReportCopyFailed : report.copyLinkState === "done" ? t.issueReportCopied : ""}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" disabled={report.copyLinkState === "working"} onClick={() => void report.copyLink()}>{t.issueReportCopyLink}</button>
              <button className="primary-button" type="button" data-autofocus onClick={() => void report.retry()}>{t.issueReportRetry}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

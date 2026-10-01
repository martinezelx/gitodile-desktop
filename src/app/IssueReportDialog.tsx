import { useRef } from "react";
import { CircleAlert, Copy, ExternalLink, LoaderCircle, Save } from "lucide-react";
import { useLanguage } from "../i18n";
import { autoHideScrollbarProps } from "../shared/ui/autoHideScrollbar";
import { Dialog } from "../shared/ui/dialog";
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

  const isFailed = report.phase === "failed" && report.failedUrl !== null;
  return (
    <Dialog
      size={isFailed ? "s" : "l"}
      role={isFailed ? "alertdialog" : "dialog"}
      title={report.phase === "preparing" ? t.issueReportPreparingTitle : isFailed ? t.issueReportFailedTitle : t.issueReportReviewTitle}
      titleId="issue-report-title"
      subtitle={reviewing ? <span id="issue-report-description">{t.issueReportReviewMessage}</span> : undefined}
      descriptionId={isFailed ? "issue-report-error-message" : "issue-report-description"}
      icon={isFailed ? <CircleAlert /> : undefined}
      tone="warning"
      onClose={report.dismiss}
      closeLabel={t.commonClose}
      dialogRef={ref}
      className="issue-report-dialog"
      bodyProps={{ "aria-busy": report.phase === "preparing" || report.phase === "opening" }}
    >
      {report.phase === "preparing" && (
        <p className="app-dialog__note" id="issue-report-description" role="status">
          <LoaderCircle className="icon--spinning" aria-hidden="true" />
          {t.issueReportPreparingMessage}
        </p>
      )}

      {reviewing && report.reportText !== null && (
        <>
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
          <p className="issue-report-dialog__status" role="status">{reportStatus}</p>
          <div className="dialog-actions">
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

      {isFailed && report.failedUrl !== null && (
        <>
          <p className="app-dialog__text" id="issue-report-error-message">{t.issueReportFailedMessage}</p>
          {/* The copy button sits beside the field, outside its label, so the
              field's name stays "Report link" and not the button's words too. */}
          <div className="text-field">
            <span id="issue-report-link-label">{t.issueReportLink}</span>
            <span className="issue-report-dialog__link">
              <input readOnly aria-labelledby="issue-report-link-label" value={report.failedUrl} onFocus={(event) => event.currentTarget.select()} />
              <button className="secondary-button" type="button" disabled={report.copyLinkState === "working"} onClick={() => void report.copyLink()}>{t.issueReportCopyLink}</button>
            </span>
          </div>
          <p className="issue-report-dialog__status" role="status">{report.copyLinkState === "failed" ? t.issueReportCopyFailed : report.copyLinkState === "done" ? t.issueReportCopied : ""}</p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={report.dismiss}>{t.commonClose}</button>
            <button className="primary-button" type="button" data-autofocus onClick={() => void report.retry()}>{t.issueReportRetry}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

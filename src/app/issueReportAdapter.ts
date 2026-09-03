import { openUrl } from "@tauri-apps/plugin-opener";

export type IssueReportPort = {
  open: (url: string) => Promise<void>;
  copy: (text: string) => Promise<void>;
};

export const issueReportPort: IssueReportPort = {
  open: (url) => openUrl(url),
  copy: (text) => navigator.clipboard.writeText(text),
};

import { useState } from "react";
import type { DiffViewMode } from "./DiffResultView";

export const MARKDOWN_VIEW_STORAGE_KEY = "gitodile-markdown-view";
type MarkdownView = DiffViewMode | "markdown";

/** Markdown has its own preference: reading code must not change how the
 * next document opens. Storage failure still leaves a working session choice. */
export function useMarkdownView(): [MarkdownView, (view: MarkdownView) => void] {
  const [view, setView] = useState<MarkdownView>(() => {
    try {
      const saved = localStorage.getItem(MARKDOWN_VIEW_STORAGE_KEY);
      if (saved === "unified" || saved === "split" || saved === "accessible") return saved;
    } catch { /* Storage can be unavailable in a restricted WebView. */ }
    return "markdown";
  });
  return [view, (next) => {
    setView(next);
    try { localStorage.setItem(MARKDOWN_VIEW_STORAGE_KEY, next); }
    catch { /* Keep the session choice even when it cannot be persisted. */ }
  }];
}

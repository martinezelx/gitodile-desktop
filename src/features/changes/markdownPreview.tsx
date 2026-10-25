import { memo, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useActiveScreenEffect } from "../../runtime/screen/module";
import type { Translations } from "../../i18n";
import { LoadingBar } from "../../shared/ui";
import type { FileDiff, MarkdownPreview } from "./domain";
import { buildUnifiedMarkdown, remarkUnifiedMarkdown, type UnifiedMarkdown, type MarkdownExcerpt } from "./markdownChanges";
import type { Root } from "mdast";

type PreviewState = { status: "loading" } | { status: "error" } |
  { status: "ready"; preview: MarkdownPreview };
type Request = { diff: FileDiff; sourceKey: string; attempt: number; result: Promise<PreviewState> };

/** One selected document, read only on request. A hidden view detaches its
 * listener but retains the promise, so returning attaches to the same read.
 * A fresh diff snapshot invalidates the document, even at the same path. */
export function useMarkdownPreview(
  diff: FileDiff | null,
  sourceKey: string,
  enabled: boolean,
  load: (filePath: string) => Promise<MarkdownPreview>,
): { state: PreviewState; retry: () => void } {
  const request = useRef<Request | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ request: Request; state: PreviewState } | null>(null);
  useActiveScreenEffect(() => {
    if (!enabled || diff === null) return;
    if (request.current?.diff !== diff || request.current.sourceKey !== sourceKey || request.current.attempt !== attempt) {
      request.current = {
        diff, sourceKey, attempt,
        result: loadRef.current(diff.path).then(
          (preview): PreviewState => ({ status: "ready", preview }),
          (): PreviewState => ({ status: "error" }),
        ),
      };
    }
    const current = request.current;
    let cancelled = false;
    void current.result.then((state) => {
      if (!cancelled) setSettled({ request: current, state });
    });
    return () => { cancelled = true; };
  }, [diff, sourceKey, enabled, attempt]);
  const current = settled?.request;
  return {
    state: settled && current?.diff === diff && current?.sourceKey === sourceKey && current?.attempt === attempt
      ? settled.state : { status: "loading" },
    retry: () => setAttempt((value) => value + 1),
  };
}

/** Repository links stay inert: a preview must never navigate the WebView or
 * resolve a relative path through the development server. Images remain text
 * placeholders, including data URLs and local paths. No raw HTML plugins. */
export function MarkdownPreviewView({ state, retry, t, comparison, excerpt, changeTarget }: {
  state: PreviewState;
  retry: () => void;
  t: Translations;
  comparison?: UnifiedMarkdown | null;
  excerpt?: MarkdownExcerpt | null;
  changeTarget?: { index: number; token: number };
}): React.JSX.Element {
  const container = useRef<HTMLElement>(null);
  const lastScroll = useRef<{ target: typeof changeTarget; comparison: typeof comparison; excerpt: typeof excerpt } | null>(null);
  useActiveScreenEffect(() => {
    if (!changeTarget?.token) return;
    const target = container.current?.querySelector<HTMLElement>(`[data-markdown-change="${changeTarget.index}"]`);
    if (!target) return;
    if (lastScroll.current?.target !== changeTarget || lastScroll.current.comparison !== comparison || lastScroll.current.excerpt !== excerpt) {
      lastScroll.current = { target: changeTarget, comparison, excerpt };
      target.scrollIntoView({ block: "center", behavior: "auto" });
    }
    target.setAttribute("data-current-markdown-change", "true");
    return () => target.removeAttribute("data-current-markdown-change");
  }, [changeTarget, comparison, excerpt]);
  if (state.status === "loading") return <LoadingBar label={t.changesMarkdownLoading} showLabel />;
  if (state.status === "error") return (
    <div className="changes-diff__status changes-diff__status--error" role="alert">
      <p>{t.changesMarkdownError}</p>
      <button className="secondary-button" type="button" onClick={retry}>{t.changesDiffRetry}</button>
    </div>
  );
  if (state.preview.kind === "too-large" && !excerpt) return (
    <p className="changes-diff__status" role="status">{t.changesMarkdownTooLarge(state.preview.limitBytes / 1024)}</p>
  );
  return (
    <section ref={container} className="markdown-preview" aria-label={t.changesMarkdownPreview}>
      <p className="markdown-preview__notice">{t.changesMarkdownNotice}</p>
      {state.preview.kind === "too-large" && excerpt ? <>
        <p className="markdown-preview__notice" role="status">{t.changesMarkdownExcerpt} {excerpt.limited && t.changesMarkdownExcerptLimited}</p>
        <article className="markdown-preview__document" tabIndex={0} aria-label={t.changesMarkdownUnified}>
          {excerpt.chunks.map((chunk, index) => <section className="markdown-preview__excerpt" key={index}>
            <p className="markdown-preview__summary">{t.changesMarkdownExcerptPosition(chunk.oldStart, chunk.newStart)}</p>
            <MarkdownContent tree={chunk.comparison.tree} t={t} idPrefix={`markdown-excerpt-${index}-`} />
          </section>)}
        </article>
      </> : state.preview.kind === "ready" && <MarkdownComparison before={state.preview.beforeContent} after={state.preview.content} t={t} comparison={comparison} />}
    </section>
  );
}

// A repository status or toolbar update must not reparse an unchanged document.
const MarkdownComparison = memo(function MarkdownComparison({ before, after, t, comparison }: {
  before: string | null; after: string | null; t: Translations;
  comparison?: UnifiedMarkdown | null;
}) {
  const changes = useMemo(() => comparison === undefined ? buildUnifiedMarkdown(before, after) : comparison, [before, after, comparison]);
  if (!changes) return <p className="changes-diff__status" role="status">{t.changesMarkdownComplex}</p>;
  const hasChanges = changes.removed.size > 0 || changes.added.size > 0 ||
    (before !== after && (before === null || after === null));
  return <>
    <p className="markdown-preview__summary" role="status">
      {hasChanges ? t.changesMarkdownCounts(changes.removed.size, changes.added.size) : t.changesMarkdownUnchanged}
    </p>
    {after === null && <p className="markdown-preview__summary">{t.changesMarkdownDeleted}</p>}
    {(before ?? "").trim() === "" && (after ?? "").trim() === "" ?
      <p className="changes-diff__status">{t.changesMarkdownEmpty}</p> :
      <MarkdownDocument tree={changes.tree} t={t} />}
  </>;
});

const MarkdownDocument = memo(function MarkdownDocument({ tree, t }: {
  tree: Root; t: Translations;
}) {
  return (
    <article className="markdown-preview__document" tabIndex={0} aria-label={t.changesMarkdownUnified}>
      <MarkdownContent tree={tree} t={t} />
    </article>
  );
});

const MarkdownContent = memo(function MarkdownContent({ tree, t, idPrefix }: { tree: Root; t: Translations; idPrefix?: string }) {
  return (
      <Markdown
        skipHtml
        remarkRehypeOptions={idPrefix ? { clobberPrefix: idPrefix } : undefined}
        remarkPlugins={[remarkGfm, [remarkUnifiedMarkdown, { tree }]]}
        urlTransform={() => ""}
        components={{
          h2: ({ node: _node, ...props }) => <h2 {...props} id={idPrefix && props.id === "footnote-label" ? `${idPrefix}footnote-label` : props.id} />,
          a: ({ children }) => <span className="markdown-preview__link">{children}</span>,
          img: ({ alt }) => <span className="markdown-preview__image">{t.changesMarkdownImage(alt || "")}</span>,
        }}
      >{""}</Markdown>
  );
});

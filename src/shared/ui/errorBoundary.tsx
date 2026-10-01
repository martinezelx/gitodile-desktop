import React from "react";
import { CircleAlert, RefreshCw } from "lucide-react";

/** What a failed view says, in the reader's language — the host supplies it,
 * as every primitive here takes its words. */
export type ViewErrorLabels = {
  title: string;
  message: string;
  action: string;
  details: string;
};

type BoundaryProps = {
  /** What stands in the failed view's place. `retry` renders it again. */
  fallback: (error: Error, retry: () => void) => React.ReactNode;
  children: React.ReactNode;
};

/** Keeps a render error inside the view it happened in.
 *
 * Without one, React unmounts the whole tree on any error thrown while
 * rendering, and a mistake in one panel left the window blank until it was
 * reloaded. A boundary per screen, per Work tab and one around the app means
 * the failure stays where it happened, says so, and offers the way back.
 *
 * Only render and lifecycle errors reach it — React's rule — so an event
 * handler or a promise still reports through its own error path. */
export class ErrorBoundary extends React.Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // The console is where a developer or an issue report looks; the reader
    // gets the plain notice and the message behind a disclosure.
    console.error("A view failed to render.", error, info.componentStack);
  }

  private readonly retry = (): void => this.setState({ error: null });

  render(): React.ReactNode {
    return this.state.error ? this.props.fallback(this.state.error, this.retry) : this.props.children;
  }
}

/** The notice a failed view shows: the error state of the shared empty-state
 * block (DESIGN.md § Core screens), a sentence saying the project was not
 * touched, one action, and the technical message behind a disclosure — never
 * as the headline. */
export function ViewErrorNotice({ error, labels, onAction }: {
  error: Error;
  labels: ViewErrorLabels;
  onAction: () => void;
}): React.JSX.Element {
  return (
    <div className="empty-state empty-state--error view-error" role="alert">
      <div className="empty-state__icon" aria-hidden="true"><CircleAlert /></div>
      <h2>{labels.title}</h2>
      <p>{labels.message}</p>
      <div className="empty-state__actions">
        <button className="primary-button" type="button" onClick={onAction}>
          <RefreshCw aria-hidden="true" />
          {labels.action}
        </button>
      </div>
      <details className="view-error__details">
        <summary>{labels.details}</summary>
        <pre>{error.message || error.name}</pre>
      </details>
    </div>
  );
}

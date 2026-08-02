/**
 * The app's loading indicator for anything that fills a panel: a thin track
 * with a segment sweeping across it, the pattern GitHub and YouTube use for
 * page-level work.
 *
 * Chosen over a centred spinner because it sits along one edge instead of
 * claiming the middle of the panel, and over a skeleton because a skeleton
 * draws *fake content* — in a Git client, where the whole point is seeing
 * what actually changed, ghost rows that get replaced by different real rows
 * read as noise rather than as progress.
 *
 * Indeterminate on purpose: none of these reads report progress, so the bar
 * never pretends to know how far along it is (see the reduced-motion note in
 * styles.css for why the static fallback spans the full width).
 *
 * Lives in the main chunk, not a lazy one — `ViewLoadingFallback` renders it
 * precisely while a lazy chunk is still in flight.
 */
export function LoadingBar({
  label,
  /** Show `label` on screen as well. Off where the surrounding UI already
   * says what's happening, in which case it stays screen-reader only rather
   * than being dropped — an unlabelled bar tells assistive tech nothing. */
  showLabel = false,
}: {
  label: string;
  showLabel?: boolean;
}): React.JSX.Element {
  return (
    <div className="loading-state" role="status" aria-busy="true">
      <span className="loading-bar" aria-hidden="true">
        <span className="loading-bar__indicator" />
      </span>
      {showLabel ? (
        <p className="loading-state__message">{label}</p>
      ) : (
        <span className="visually-hidden">{label}</span>
      )}
    </div>
  );
}

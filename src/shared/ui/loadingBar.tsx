/**
 * The app's loading indicator for content whose shape can't be known before
 * it arrives: a diff, a screen still loading its code, a page of older
 * versions being appended, a refresh drawn over what is already there. A thin
 * track with a segment sweeping across it, the pattern GitHub and YouTube use
 * for page-level work.
 *
 * A first load whose shape *is* known — a list, a sentence, a form — draws
 * that shape instead (`LoadingPlaceholder`): the answer then lands in a space
 * that was waiting for it, and a quick read shows nothing at all.
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

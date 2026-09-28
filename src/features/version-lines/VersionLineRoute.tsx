import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLanguage, type Translations } from "../../i18n";
import { formatDate, formatNumber, type LocaleFormats } from "../../shared/i18n";
import { LoadingPlaceholder, TextPlaceholder } from "../../shared/ui";
import type { VersionLine, VersionLineRoute as Route, VersionLineVersion } from "./domain";

/** At most this many dots per lane — the versions `get_version_line_history`
 * sends with the route. Each dot is a real saved version; past this the lane
 * says how many earlier ones it leaves out, and the sentence under the drawing
 * says the whole number. */
const MAX_DOTS = 8;

const HEIGHT = 76;
/* A line that never left the main one is a mark on that one lane, and the
   drawing is only as tall as the lane and its labels. */
const HEIGHT_ON_MAIN = 44;
const MAIN_Y = 20;
const LINE_Y = 54;
const INSET = 10;
/* Where the line leaves the main one: far enough in that the main line's name
   sits over the lane before it, and the date of the parting under it. It is a
   constant, not a date on a scale, which is what keeps the parting — and the
   main lane and its name — on the same pixels from one line to the next. */
const FORK_X = 104;
/* The curve from one lane to the other, and the room it takes. */
const BEND = 40;
/* Room a dot keeps from a curve's end, so the two never touch. */
const DOT_GAP = 14;
/* How long the drawing of one line takes to give way to the next's. */
const CROSSFADE_MS = 200;

/** A route and the line it belongs to — what the drawing needs to draw it. */
export type DrawnRoute = { line: VersionLine; route: Route };

/** How many of this line's own versions have not left this machine. A line
 * with no upstream, or whose upstream is gone, has published none of them;
 * otherwise the ones ahead of the upstream, never more than the line's own. */
function unpublishedOf(line: VersionLine, own: number): number {
  if (line.upstream === null || line.upstreamGone) return own;
  return Math.min(line.upstreamAhead ?? 0, own);
}

/** `count` positions between `from` and `to`. A lane that ends now ends on
 * its newest version, so `"end"` puts the last one on `to`; a stretch closed
 * at both ends — the main line between the parting and the merge, the line's
 * own excursion — keeps its dots off both, `"within"`. */
function spread(count: number, from: number, to: number, mode: "end" | "within"): number[] {
  if (count <= 0) return [];
  if (mode === "within") {
    return Array.from({ length: count }, (_, index) => from + ((to - from) * (index + 1)) / (count + 1));
  }
  if (count === 1) return [to];
  return Array.from({ length: count }, (_, index) => from + ((to - from) * index) / (count - 1));
}

type Dot = { x: number; version: VersionLineVersion | null };

/** A lane's dots, oldest on the left: one per version the route sent (newest
 * first), or — should a count arrive without its versions — one per counted
 * version up to `MAX_DOTS`, drawn but not named. */
function laneDots(
  count: number,
  versions: VersionLineVersion[],
  from: number,
  to: number,
  mode: "end" | "within",
): Dot[] {
  const shown = [...versions].reverse();
  const total = shown.length > 0 ? shown.length : Math.min(count, MAX_DOTS);
  return spread(total, from, to, mode).map((x, index) => ({ x, version: shown[index] ?? null }));
}

function versionTooltip(version: VersionLineVersion, formats: LocaleFormats): string {
  const saved = new Date(version.committedAt);
  const date = Number.isNaN(saved.getTime()) ? "" : formatDate(saved, formats);
  return [version.subject, date, version.shortCommit].filter(Boolean).join(" · ");
}

function dateOf(iso: string, formats: LocaleFormats): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatDate(date, formats);
}

/** A line whose versions were always the main line's own: a mark on its lane. */
function isOnMain(route: Route): boolean {
  return route.ownCount === 0 && route.merge === null;
}

function heightOf(route: Route): number {
  return isOnMain(route) ? HEIGHT_ON_MAIN : HEIGHT;
}

function sentenceOf({ line, route }: DrawnRoute, t: Translations, formats: LocaleFormats): string {
  const { merge } = route;
  const own = route.ownCount;
  const since = route.baseCount;
  const forkDate = dateOf(route.forkedAt, formats);
  if (merge && merge.kind !== "merge") {
    return t.versionLinesRouteCopied({
      base: route.base,
      left: forkDate,
      back: dateOf(merge.mergedAt, formats),
      own: formatNumber(own, formats),
      squashed: merge.kind === "squash",
      since: merge.afterCount > 0 ? formatNumber(merge.afterCount, formats) : null,
    });
  }
  if (merge) {
    return t.versionLinesRouteReturned({
      base: route.base,
      left: forkDate,
      back: dateOf(merge.mergedAt, formats),
      own: formatNumber(own, formats),
      since: merge.afterCount > 0 ? formatNumber(merge.afterCount, formats) : null,
    });
  }
  if (own === 0) {
    return since === 0
      ? t.versionLinesRouteSame(route.base)
      : t.versionLinesRouteMerged(route.base, formatNumber(since, formats));
  }
  const unpublished = unpublishedOf(line, own);
  return t.versionLinesRouteSummary({
    base: route.base,
    date: forkDate,
    own: formatNumber(own, formats),
    unpublished: unpublished > 0 ? formatNumber(unpublished, formats) : null,
    since: since > 0 ? formatNumber(since, formats) : null,
  });
}

/** Whether the reader has asked for no animated movement, by the system or by
 * GitOdile's own switch. The crossfade leans on an animation to take the old
 * drawing away, so without one there is no old drawing to take away. */
function prefersReducedMotion(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.reducedMotion === "true") return true;
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** One route, drawn at `width`. `interactive` names every dot on its tooltip
 * and opens it on a press; the drawing a crossfade is taking away, or one held
 * while the next line is read, is only a picture. */
function RouteDrawing({
  drawn,
  width,
  className,
  interactive,
  highlightedCommit,
  onOpenVersion,
}: {
  drawn: DrawnRoute;
  width: number;
  className?: string;
  interactive: boolean;
  /** A version the list under the drawing is on: its dot is lit. */
  highlightedCommit?: string | null;
  onOpenVersion?: (lineName: string, commit: string) => void;
}): React.JSX.Element {
  const { formats } = useLanguage();
  const { line, route } = drawn;
  const { merge } = route;
  const own = route.ownCount;
  const since = route.baseCount;
  const unpublished = merge ? 0 : unpublishedOf(line, own);
  const forkDate = dateOf(route.forkedAt, formats);
  const mergeDate = merge ? dateOf(merge.mergedAt, formats) : "";
  const end = Math.max(FORK_X + BEND * 3, width - INSET);
  const onMain = isOnMain(route);
  const height = heightOf(route);

  /* Where the merge meets the main line: most of the way along when the main
     line has saved versions since, leaving them their stretch after it, and at
     the end when it has not. */
  const mergeX = merge && merge.afterCount > 0 ? FORK_X + (end - FORK_X) * 0.68 : end;
  /* Where the line stands on the main one when it never left it: its newest
     version, which is where the main line's own later versions begin — at the
     end of the lane when there are none. */
  const markX = since === 0 ? end : FORK_X;

  const lineStart = FORK_X + BEND;
  const lineEnd = merge ? mergeX - BEND : end;
  const ownDots = onMain
    ? []
    : merge
      ? laneDots(own, route.ownVersions, lineStart, lineEnd, "within")
      : laneDots(own, route.ownVersions, lineStart + DOT_GAP, lineEnd, "end");
  const hollowFrom = ownDots.length - Math.min(unpublished, ownDots.length);
  const solidTo =
    unpublished === 0 ? lineEnd : hollowFrom > 0 ? (ownDots[hollowFrom - 1]?.x ?? lineStart) : lineStart;

  /* The main line's versions after the parting: up to the merge for a line
     that came back, then the ones after it; up to now otherwise. */
  const firstMain = (onMain ? markX : FORK_X) + DOT_GAP;
  const baseDots =
    since === 0
      ? []
      : merge
        ? laneDots(since, route.baseVersions, FORK_X, mergeX, "within")
        : laneDots(since, route.baseVersions, firstMain, end, "end");
  const afterDots =
    merge && merge.afterCount > 0 ? laneDots(merge.afterCount, merge.afterVersions, mergeX + DOT_GAP, end, "end") : [];

  const ownEarlier = Math.max(0, own - ownDots.length);
  const baseEarlier = Math.max(0, since - baseDots.length);

  const renderDot = (dot: Dot, lineName: string, dotClass: string, cy: number, r: number): React.JSX.Element => {
    const version = interactive ? dot.version : null;
    const opens = version !== null && onOpenVersion !== undefined;
    return (
      <g
        key={`${cy}-${dot.x}`}
        className={`version-lines-route__version${
          highlightedCommit && dot.version?.commit === highlightedCommit ? " version-lines-route__version--lit" : ""
        }`}
        // Its place in the order the dots appear in on arrival, left to right.
        style={{ "--route-order": Math.round(dot.x / 40) } as React.CSSProperties}
        data-tooltip={version ? versionTooltip(version, formats) : undefined}
        onClick={opens ? () => onOpenVersion(lineName, version.commit) : undefined}
      >
        {/* A target the pointer can find: the drawn dot is 7px across. */}
        <circle className="version-lines-route__hit" cx={dot.x} cy={cy} r={9} />
        <circle className={dotClass} cx={dot.x} cy={cy} r={r} />
      </g>
    );
  };

  return (
    <svg className={className} width={width} height={height} aria-hidden="true" focusable="false">
      <line className="version-lines-route__main" x1={INSET} y1={MAIN_Y} x2={end} y2={MAIN_Y} />
      <text className="version-lines-route__label" x={INSET} y={MAIN_Y - 8}>
        {route.base}
      </text>
      {/* How many of the main line's versions since the parting the lane
          leaves out, over the oldest one it draws. */}
      {baseEarlier > 0 && baseDots[0] && (
        <text className="version-lines-route__label" x={baseDots[0].x} y={MAIN_Y - 8} textAnchor="middle">
          {`+${formatNumber(baseEarlier, formats)}`}
        </text>
      )}

      {!onMain && (
        <>
          <path
            className="version-lines-route__line version-lines-route__line--leave"
            pathLength={1}
            d={`M${FORK_X} ${MAIN_Y} C ${FORK_X + BEND / 2} ${MAIN_Y}, ${FORK_X + BEND / 2} ${LINE_Y}, ${lineStart} ${LINE_Y} L ${solidTo} ${LINE_Y}`}
          />
          {unpublished > 0 && (
            <line
              className="version-lines-route__line version-lines-route__line--unpublished"
              x1={solidTo}
              y1={LINE_Y}
              x2={lineEnd}
              y2={LINE_Y}
            />
          )}
          {/* A copy came back, not the line: the return is drawn fainter,
              and it lands on a ring rather than a filled mark — the work is
              on the main line, the versions on this lane are not. */}
          {merge && (
            <path
              className={`version-lines-route__line version-lines-route__line--return${
                merge.kind === "merge" ? "" : " version-lines-route__line--copied"
              }`}
              pathLength={1}
              d={`M${lineEnd} ${LINE_Y} C ${lineEnd + BEND / 2} ${LINE_Y}, ${lineEnd + BEND / 2} ${MAIN_Y}, ${mergeX} ${MAIN_Y}`}
            />
          )}
          {ownEarlier > 0 && ownDots[0] && (
            <text className="version-lines-route__label" x={ownDots[0].x} y={LINE_Y + 18} textAnchor="middle">
              {`+${formatNumber(ownEarlier, formats)}`}
            </text>
          )}
          <circle className="version-lines-route__fork" cx={FORK_X} cy={MAIN_Y} r={4.5} />
          {forkDate && (
            <text className="version-lines-route__label" x={FORK_X - 10} y={LINE_Y + 4} textAnchor="end">
              {forkDate}
            </text>
          )}
          {merge && mergeDate && (
            <text className="version-lines-route__label" x={mergeX + 10} y={LINE_Y + 4}>
              {mergeDate}
            </text>
          )}
        </>
      )}

      {baseDots.map((dot) => renderDot(dot, route.base, "version-lines-route__main-dot", MAIN_Y, 3))}
      {afterDots.map((dot) => renderDot(dot, route.base, "version-lines-route__main-dot", MAIN_Y, 3))}
      {ownDots.map((dot, index) =>
        renderDot(
          dot,
          line.name,
          `version-lines-route__dot${index >= hollowFrom ? " version-lines-route__dot--unpublished" : ""}`,
          LINE_Y,
          3.5,
        ),
      )}

      {onMain ? (
        <>
          <circle className="version-lines-route__mark" cx={markX} cy={MAIN_Y} r={5} />
          {forkDate && (
            <text
              className="version-lines-route__label"
              x={markX}
              y={MAIN_Y + 20}
              textAnchor={since === 0 ? "end" : "middle"}
            >
              {forkDate}
            </text>
          )}
          {line.isActive && <circle className="version-lines-route__here" cx={markX} cy={MAIN_Y} r={8.5} />}
        </>
      ) : merge ? (
        <circle
          className={`version-lines-route__mark${merge.kind === "merge" ? "" : " version-lines-route__mark--copy"}`}
          cx={mergeX}
          cy={MAIN_Y}
          r={5}
        />
      ) : (
        line.isActive && <circle className="version-lines-route__here" cx={end} cy={LINE_Y} r={8} />
      )}
    </svg>
  );
}

/** Where the selected line left the project's main line, drawn: the main line
 * along the top, and this line leaving it at the version where the two parted,
 * its own saved versions along a second lane — the ones not yet published
 * hollow, on a dotted stretch, the way the project map draws them — and, for a
 * line that came back by a merge, the curve back up to the merge and the main
 * line going on after it. A line whose versions were always the main line's
 * own is a mark on the main lane at its newest version.
 *
 * Every dot is a saved version: its subject, date and short commit are on its
 * tooltip, and a press opens it in History on the line it belongs to. The
 * dots are for the pointer only — the list of saved versions under this
 * section is the same answer for the keyboard, and the sentence under the
 * drawing says the numbers for a screen reader, which the drawing is hidden
 * from.
 *
 * Moving from one line to the next, the drawing does not blink out and redraw:
 * the previous line's route is held, quieter, while the next one is read, and
 * the two then cross-fade. The main lane, its name and the parting sit on the
 * same pixels in both, so they stay still, and only what differs dissolves —
 * the way the whole window cross-fades a theme change. The route draws itself
 * out only when there was nothing before it. */
export function VersionLineRoute({
  line,
  route,
  base,
  previous,
  highlightedCommit,
  onOpenVersion,
}: {
  line: VersionLine;
  /** `null` while the read is out. */
  route: Route | null;
  /** The main line's name, known before the route is. */
  base: string;
  /** The route the section showed for the line selected before this one, if
   * it showed one — held while this line's is read, and faded out from. */
  previous?: DrawnRoute | null;
  /** The version the list of saved versions is on, lit in the drawing. */
  highlightedCommit?: string | null;
  /** Opens a version in History, reading the line it is on. */
  onOpenVersion?: (lineName: string, commit: string) => void;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /* The drawing being taken away, captured once: this component mounts for
     each line, and a later `previous` is a later line's business. Dropped at
     once under reduced motion, where nothing would fade it out. */
  const [from, setFrom] = useState<DrawnRoute | null>(() =>
    previous && previous.line.name !== line.name ? previous : null,
  );
  /* Drawn out only when the section had nothing to show before this route. */
  const waitedRef = useRef(route === null && from === null);
  const reveal = waitedRef.current && route !== null;

  // Drawn in the panel's own pixels rather than scaled from a viewBox, so the
  // labels keep the caption's size at any panel width.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    setWidth(frame.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setWidth(frame.clientWidth));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Once this line's route is here, the one it replaces fades and goes.
  useEffect(() => {
    if (route === null || from === null) return undefined;
    if (prefersReducedMotion()) {
      setFrom(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setFrom(null), CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [route, from]);

  const current: DrawnRoute | null = route ? { line, route } : null;
  const height = current ? heightOf(current.route) : from ? heightOf(from.route) : HEIGHT;
  const crossfading = current !== null && from !== null;

  return (
    <div
      className={`version-lines-route${reveal ? " version-lines-route--reveal" : ""}${current ? "" : " version-lines-route--pending"}`}
    >
      <div ref={frameRef} className="version-lines-route__frame" style={{ height }}>
        {width > 0 &&
          (current ? (
            <>
              <RouteDrawing
                drawn={current}
                width={width}
                className={crossfading ? "version-lines-route__layer--in" : undefined}
                interactive
                highlightedCommit={highlightedCommit}
                onOpenVersion={onOpenVersion}
              />
              {from && (
                <RouteDrawing
                  drawn={from}
                  width={width}
                  className="version-lines-route__layer version-lines-route__layer--out"
                  interactive={false}
                />
              )}
            </>
          ) : from ? (
            // The line before this one, quieter, until this one's is read.
            <RouteDrawing drawn={from} width={width} className="version-lines-route__layer--held" interactive={false} />
          ) : (
            <svg width={width} height={HEIGHT} aria-hidden="true" focusable="false">
              <line className="version-lines-route__main" x1={INSET} y1={MAIN_Y} x2={width - INSET} y2={MAIN_Y} />
              <text className="version-lines-route__label" x={INSET} y={MAIN_Y - 8}>
                {base}
              </text>
            </svg>
          ))}
      </div>
      {current ? (
        <p className={`version-lines-route__sentence${crossfading ? " version-lines-route__layer--in" : ""}`}>
          {sentenceOf(current, t, formats)}
        </p>
      ) : (
        <LoadingPlaceholder
          label={t.versionLinesRouteLoading}
          className="version-lines-route__sentence version-lines-route__sentence--pending"
        >
          <TextPlaceholder width="72%" />
        </LoadingPlaceholder>
      )}
    </div>
  );
}

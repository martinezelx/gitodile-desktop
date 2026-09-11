import { useEffect, useRef, useState } from "react";
import { Blend, Code, Columns2, Image as ImageIcon, ImageOff, MoveHorizontal } from "lucide-react";

import type { Translations } from "../../i18n";
import { DiffOptionPicker } from "./DiffOptionPicker";
import {
  imagePreviewDataUrl,
  isSvgPath,
  type FileDiff,
  type ImagePreview,
  type ImagePreviewLoader,
  type ImagePreviewSide,
} from "./domain";

/** How the two versions are put on top of each other. Named for what the eye
 * does, not for the technique — "onion skin" is a term borrowed from a craft
 * nobody in this audience practises. */
export type ImageComparisonMode = "side-by-side" | "swipe" | "fade";

/** Which half of an SVG change is on screen: the drawing it produces, or the
 * text diff that produced it. */
export type SvgDiffMode = "drawing" | "source";

const COMPARISON_MODES: ImageComparisonMode[] = ["side-by-side", "swipe", "fade"];

const MODE_ICONS: Record<ImageComparisonMode, React.JSX.Element> = {
  "side-by-side": <Columns2 aria-hidden="true" />,
  swipe: <MoveHorizontal aria-hidden="true" />,
  fade: <Blend aria-hidden="true" />,
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; preview: ImagePreview };

type Dimensions = { width: number; height: number };

/** Everything a surface needs to show one changed picture: what was read, how
 * the user is looking at it, and the handles to change that.
 *
 * It is a hook rather than component-local state because the controls belong
 * in the screen's own toolbar, next to (or in place of) the reading-mode
 * picker, while the pictures are rendered by the diff view far below it. One
 * owner, two places on screen. */
export type PictureDiff = {
  isSvg: boolean;
  filePath: string;
  originalPath: string | null;
  state: LoadState;
  /** True when both versions are drawable, which is the only case where
   * comparing means anything. An added or deleted picture has one version. */
  canCompare: boolean;
  /** True when the picture is what is on screen: always for an image, and for
   * an SVG until the reader asks for its source. */
  showsDrawing: boolean;
  /** Whether `PictureDiffControls` will render anything. A surface asks this
   * before it draws a label or reserves a toolbar row, so an added picture —
   * one version, one way to show it — leaves no empty strip behind. */
  hasControls: boolean;
  mode: ImageComparisonMode;
  setMode: (mode: ImageComparisonMode) => void;
  position: number;
  setPosition: (position: number) => void;
  svgView: SvgDiffMode;
  setSvgView: (view: SvgDiffMode) => void;
  retry: () => void;
};

/** `null` when this file has no picture to show, or when the surface cannot
 * say which two versions to compare — both mean the diff renders exactly as
 * it did before this feature existed.
 *
 * `sourceKey` names *which* two versions: the project and session for a
 * working-tree comparison, the commit for a saved one. It is required, and
 * part of what triggers a re-read, because a path alone does not identify a
 * picture — the same `logo.png` in two saved versions is two different
 * pictures, and keying only on the path would leave the first one on screen. */
export function usePictureDiff(
  diff: FileDiff | null,
  sourceKey: string,
  readImagePreview?: ImagePreviewLoader,
): PictureDiff | null {
  const isPicture =
    diff !== null &&
    (diff.kind === "image" || (diff.kind === "text" && isSvgPath(diff.path)));
  const filePath = isPicture ? diff.path : null;
  const originalPath = isPicture && "originalPath" in diff ? diff.originalPath : null;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [mode, setMode] = useState<ImageComparisonMode>("side-by-side");
  const [position, setPosition] = useState(50);
  const [svgView, setSvgView] = useState<SvgDiffMode>("drawing");
  const [attempt, setAttempt] = useState(0);
  // The loader is rebuilt by its host on every render; keeping it in a ref
  // means the picture is fetched when the file changes, not when the parent
  // happens to re-render.
  const loadRef = useRef(readImagePreview);
  loadRef.current = readImagePreview;

  useEffect(() => {
    // Moving to another picture starts over: mode and position are how *this*
    // one is being read.
    setSvgView("drawing");
    setMode("side-by-side");
    setPosition(50);
  }, [filePath, sourceKey]);

  useEffect(() => {
    const load = loadRef.current;
    if (filePath === null || load === undefined) {
      // Drop what was held, rather than keeping it for a file that is no
      // longer on screen: a preview is two base64 strings, up to ~13 MiB
      // each, and moving to a text file should free them.
      setState({ status: "loading" });
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    load(filePath, originalPath)
      .then((preview) => {
        if (!cancelled) setState({ status: "ready", preview });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, originalPath, sourceKey, attempt]);

  if (!isPicture || filePath === null || readImagePreview === undefined) {
    return null;
  }

  const preview = state.status === "ready" ? state.preview : null;
  const canCompare = preview?.before?.kind === "ready" && preview.after?.kind === "ready";
  const isSvg = isSvgPath(filePath);
  const showsDrawing = !isSvg || svgView === "drawing";
  return {
    isSvg,
    filePath,
    originalPath,
    state,
    canCompare,
    showsDrawing,
    hasControls: isSvg || (showsDrawing && canCompare),
    mode: canCompare ? mode : "side-by-side",
    setMode,
    position,
    setPosition,
    svgView,
    setSvgView,
    retry: () => setAttempt((value) => value + 1),
  };
}

/** The pickers, for the toolbar the surface already has. Returns `null` when
 * there is nothing to choose — a picture with only one version, showing the
 * only way it can be shown, needs no control at all. */
export function PictureDiffControls({
  picture,
  t,
}: {
  picture: PictureDiff;
  t: Translations;
}): React.JSX.Element | null {
  const showsComparison = picture.showsDrawing && picture.canCompare;
  if (!picture.hasControls) {
    return null;
  }
  return (
    <>
      {picture.isSvg && (
        <DiffOptionPicker
          value={picture.svgView}
          ariaLabel={t.changesSvgViewLabel}
          onChange={picture.setSvgView}
          options={[
            { value: "drawing", label: t.changesSvgDrawing, icon: <ImageIcon aria-hidden="true" /> },
            { value: "source", label: t.changesSvgSource, icon: <Code aria-hidden="true" /> },
          ]}
        />
      )}
      {showsComparison && (
        <DiffOptionPicker
          value={picture.mode}
          ariaLabel={t.changesImageComparisonLabel}
          onChange={picture.setMode}
          options={COMPARISON_MODES.map((option) => ({
            value: option,
            label: modeLabel(option, t),
            icon: MODE_ICONS[option],
          }))}
        />
      )}
      {showsComparison && picture.mode !== "side-by-side" && (
        <label className="image-diff__slider">
          <span className="visually-hidden">
            {picture.mode === "swipe" ? t.changesImageSwipePosition : t.changesImageFadeAmount}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={picture.position}
            onChange={(event) => picture.setPosition(Number(event.target.value))}
          />
        </label>
      )}
    </>
  );
}

function formatImageBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  const [value, unit] = kilobytes < 1024 ? [kilobytes, "KB"] : ([kilobytes / 1024, "MB"] as const);
  const rounded = value.toLocaleString(undefined, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  });
  return `${rounded} ${unit}`;
}

/** The picture is what the user came for, so its size is stated in the same
 * breath as its dimensions rather than left to a tooltip. */
function measurements(side: ImagePreviewSide, dimensions: Dimensions | null): string {
  const size = formatImageBytes(side.byteLength);
  if (!dimensions) return size;
  const shape = `${dimensions.width} × ${dimensions.height}`;
  return size ? `${shape} · ${size}` : shape;
}

function sizeChange(
  before: ImagePreviewSide,
  after: ImagePreviewSide,
  t: Translations,
): string | null {
  const difference = after.byteLength - before.byteLength;
  if (!Number.isFinite(difference)) return null;
  if (difference === 0) return t.changesImageSameSize;
  return difference > 0
    ? t.changesImageLarger(formatImageBytes(difference))
    : t.changesImageSmaller(formatImageBytes(-difference));
}

function modeLabel(mode: ImageComparisonMode, t: Translations): string {
  return mode === "side-by-side"
    ? t.changesImageModeSideBySide
    : mode === "swipe"
      ? t.changesImageModeSwipe
      : t.changesImageModeFade;
}

/** One version's content: the picture, or the plain reason there isn't one. */
function SideBody({
  side,
  alt,
  onMeasure,
  t,
}: {
  side: ImagePreviewSide;
  alt: string;
  onMeasure?: (dimensions: Dimensions | null) => void;
  t: Translations;
}): React.JSX.Element {
  if (side.kind === "too-large") {
    return (
      <p className="image-diff__side-note">
        {t.changesImageTooLarge(formatImageBytes(side.limitBytes))}
      </p>
    );
  }
  if (side.kind === "unsupported") {
    return <p className="image-diff__side-note">{t.changesImageUnsupported}</p>;
  }
  return (
    <img
      className="image-diff__image"
      src={imagePreviewDataUrl(side)}
      alt={alt}
      onLoad={(event) => {
        const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
        // An SVG with only a `viewBox` has no intrinsic size, and "0 × 0" is
        // worse than saying nothing.
        onMeasure?.(width > 0 && height > 0 ? { width, height } : null);
      }}
    />
  );
}

function SideFigure({
  side,
  label,
  alt,
  caption,
  onMeasure,
  t,
}: {
  side: ImagePreviewSide;
  label: string;
  alt: string;
  caption: string | null;
  onMeasure?: (dimensions: Dimensions | null) => void;
  t: Translations;
}): React.JSX.Element {
  return (
    <figure className="image-diff__figure">
      <div className="image-diff__frame">
        <SideBody side={side} alt={alt} onMeasure={onMeasure} t={t} />
      </div>
      <figcaption className="image-diff__caption">
        <strong>{label}</strong>
        {caption && <span>{caption}</span>}
      </figcaption>
    </figure>
  );
}

/** Draws a changed picture: an image, or the drawing behind an SVG.
 *
 * Every version is drawn as an `<img>` with a `data:` URL and never inserted
 * as markup: in an `img` context the engine runs no script and fetches no
 * external resource, which is what makes rendering an SVG that came out of a
 * repository safe. */
export function PictureDiffBody({
  picture,
  t,
}: {
  picture: PictureDiff;
  t: Translations;
}): React.JSX.Element {
  const [beforeSize, setBeforeSize] = useState<Dimensions | null>(null);
  const [afterSize, setAfterSize] = useState<Dimensions | null>(null);
  const { filePath, state } = picture;

  // Keyed on the read rather than on the path: the same path in two saved
  // versions is two different pictures, and a caption carrying the previous
  // one's dimensions would be a wrong fact rather than a missing one. Every
  // reload passes through `loading`.
  const isLoading = state.status === "loading";
  useEffect(() => {
    if (isLoading) {
      setBeforeSize(null);
      setAfterSize(null);
    }
  }, [isLoading]);

  if (state.status === "loading") {
    return (
      <p className="image-diff__status" role="status">
        {t.changesImageLoading}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="image-diff__status image-diff__status--error" role="alert">
        <ImageOff aria-hidden="true" />
        <p>{t.changesImageError}</p>
        <button type="button" className="secondary-button" onClick={picture.retry}>
          {t.changesDiffRetry}
        </button>
      </div>
    );
  }

  const { before, after } = state.preview;
  const beforeAlt = t.changesImageBeforeAlt(filePath);
  const afterAlt = t.changesImageAfterAlt(filePath);

  // Only one version exists: a picture was added, or removed. There is nothing
  // to compare, and the control that compares is not offered either.
  if (before === null || after === null) {
    const side = before ?? after;
    if (side === null) {
      return (
        <p className="image-diff__status" role="status">
          {t.changesImageUnavailable}
        </p>
      );
    }
    const isAddition = before === null;
    return (
      <div className="image-diff">
        <SideFigure
          side={side}
          label={isAddition ? t.changesImageAdded : t.changesImageRemoved}
          alt={isAddition ? afterAlt : beforeAlt}
          caption={measurements(side, isAddition ? afterSize : beforeSize)}
          onMeasure={isAddition ? setAfterSize : setBeforeSize}
          t={t}
        />
      </div>
    );
  }

  const beforeCaption = measurements(before, beforeSize);
  const change = sizeChange(before, after, t);
  const afterMeasurements = measurements(after, afterSize);
  const afterCaption = change ? `${afterMeasurements} · ${change}` : afterMeasurements;

  if (picture.mode === "side-by-side") {
    return (
      <div className="image-diff">
        <div className="image-diff__pair">
          <SideFigure
            side={before}
            label={t.changesImageBefore}
            alt={beforeAlt}
            caption={beforeCaption}
            onMeasure={setBeforeSize}
            t={t}
          />
          <SideFigure
            side={after}
            label={t.changesImageAfter}
            alt={afterAlt}
            caption={afterCaption}
            onMeasure={setAfterSize}
            t={t}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="image-diff">
      <figure className="image-diff__figure image-diff__figure--overlay">
        <div className="image-diff__frame">
          {/* The stage is its own box, hugging the pictures rather than the
              frame, and both layers fill it. That is what makes the divider
              land exactly on the cut: the line's offset and the clip's inset
              are then percentages of the same box. Measured against the frame
              they were not — the frame is wider by its padding and by however
              much room a centred picture leaves on either side. */}
          <div
            className={`image-diff__stage image-diff__stage--${picture.mode}`}
            style={
              {
                "--image-diff-position": `${picture.position}%`,
                "--image-diff-opacity": picture.position / 100,
              } as React.CSSProperties
            }
          >
            <div className="image-diff__layer">
              <SideBody side={before} alt={beforeAlt} onMeasure={setBeforeSize} t={t} />
            </div>
            <div className="image-diff__layer image-diff__layer--after">
              <SideBody side={after} alt={afterAlt} onMeasure={setAfterSize} t={t} />
            </div>
            {picture.mode === "swipe" && (
              <span className="image-diff__swipe-line" aria-hidden="true" />
            )}
          </div>
        </div>
        <figcaption className="image-diff__caption">
          <strong>{t.changesImageBefore}</strong>
          <span>{beforeCaption}</span>
          <strong>{t.changesImageAfter}</strong>
          <span>{afterCaption}</span>
        </figcaption>
      </figure>
    </div>
  );
}

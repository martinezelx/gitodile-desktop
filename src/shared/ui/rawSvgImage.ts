import { createElement, type ComponentType, type ImgHTMLAttributes } from "react";

export type RawSvgImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "draggable" | "src">;
export type RawSvgImage = ComponentType<RawSvgImageProps>;

const IMAGE_COMPONENTS = new Map<string, RawSvgImage>();

/** Renders a raw SVG string as an image rather than inlining it into the page.
 *
 * Vendor artwork is full-colour and does not inherit `currentColor`, so it
 * gives up nothing by living in an image — and it gains the one thing inlining
 * cannot offer: its own SVG document per instance, so gradients, masks and
 * filters can safely reuse the source collection's internal IDs across
 * keep-alive screens. Hand-drawn marks that *do* need `currentColor` stay
 * inline instead; see `src/app/vendorMarks.tsx`.
 *
 * Cached by source string: the same artwork rendered in a hundred rows builds
 * one component and one data URL.
 *
 * ADR 0003 admits a primitive here only once two consumers share the same
 * stable requirement. This one arrived with the file-type icon set and moved
 * here when About's stack chips needed the identical treatment. It is imported
 * by file rather than through `index.ts`: the barrel is the eager/lazy hinge
 * for feature chunks, and the file-type set is deliberately kept out of the
 * entry chunk. */
export function rawSvgImage(source: string): RawSvgImage {
  const cached = IMAGE_COMPONENTS.get(source);
  if (cached) {
    return cached;
  }

  // `unplugin-icons` emits markup intended for inline DOM use and therefore
  // omits the XML namespace. A standalone SVG image needs it to load in
  // WebView2, Safari, and other XML-based image decoders.
  const standaloneSource = source.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(standaloneSource)}`;
  const Rendered: RawSvgImage = (props) =>
    createElement("img", {
      ...props,
      "aria-hidden": true,
      alt: "",
      draggable: false,
      src: dataUrl,
    });
  Rendered.displayName = "RawSvgImage";
  IMAGE_COMPONENTS.set(source, Rendered);
  return Rendered;
}

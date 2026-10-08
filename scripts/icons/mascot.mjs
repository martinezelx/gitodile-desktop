// The GitOdile mascot, drawn once, and everything generated from it.
//
// The crocodile is a single drawing in one 1215x1095 drawing space (ADR 0018):
// the r14 mascot with its sunglasses, the commit-graph crest, amber belly
// plates and four teeth. Every surface crops that one drawing:
//
//   body       the whole crocodile: the in-app mark (welcome, About), the
//              console welcome's ASCII art, the Windows installer's side
//              panel and brand material
//   head       the head, crest to snout tip: a brand asset and the Windows
//              installer's header
//   portrait   crest to snout tip across, the body running off the bottom
//              edge: the application icon, on the slate tile, at every size
//              and on every platform
//
// The drawing is a small element tree, written out several ways:
//
//   src/assets/gitodile-mascot*.svg    standalone SVGs in the brand colours
//   src/assets/brand/*.svg             the application icon, as shipped and on
//                                      Apple's macOS grid
//   src/shared/ui/mascotArtwork.ts     the same tree for the in-app React mark,
//                                      whose green body follows the theme
//   src/features/console/mascotAscii.ts
//                                      the whole mascot as the ASCII art the
//                                      console's welcome prints
//   icon sources for `pnpm icons`      1024px squares; `pnpm icons` also renders
//                                      the PNGs under src/assets/brand
//   installer sources for `pnpm icons` the Windows installer's side panel and
//                                      header, on the icon's slate
//
//   node scripts/icons/mascot.mjs            rewrite the generated files
//   node scripts/icons/mascot.mjs --check    fail if they drift from this file
//
// Edit the drawing here and regenerate; never edit a generated file by hand.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { asciiArt } from "./ascii-art.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const assetsDir = path.join(root, "src", "assets");
export const brandDir = path.join(assetsDir, "brand");

export const colors = {
  /** The body's green (the key predates v4). The in-app mark swaps it for the theme's accent outside the GitOdile themes. */
  lime: "#86b640",
  ink: "#13251f",
  /** The crest's deep teal. The in-app mark swaps it for a deep shade of the theme's accent outside the GitOdile themes. */
  crest: "#0f4a43",
  amber: "#e7b448",
  white: "#ffffff",
  lens: "#0f1513",
  /** The icon tile: slate lit from above (Apple's icon guidance), the same on every platform (ADR 0029). */
  tileTop: "#2c3542",
  tileBottom: "#161b22",
};
const c = colors;

/**
 * Groups the in-app mark addresses by class: `fill` is recoloured per theme
 * and `crest` with it, as a deep shade of the same colour;
 * `outline` (the silhouette's ink, drawn first) is what the welcome's entrance
 * traces, `glasses` (frame, lenses, arm and glints) is what the About sweep crosses,
 * `commits` are the crest's white commits the welcome lights in turn, and
 * `head-node` the amber HEAD that breathes when the wave reaches it. The
 * in-app class is `gitodile-mascot__<part>`; standalone SVGs drop it.
 */
const partClass = (part) => `gitodile-mascot__${part}`;
export const THEMED_FILL_CLASS = partClass("fill");

// ---- The drawing ------------------------------------------------------------
//
// Paint order: the silhouette's outline first (every outer part stroked once,
// so the parts share one edge), then the crest with its commit graph, the body,
// the teeth, the belly with its plates, the limbs and feet, and the sunglasses
// last. Everything is absolute M/L/H/V/C/Q/Z paths, circles and rects, which is
// what `ascii-art.mjs` can sample.

const DRAWING = [
  ["g", { part: "outline", stroke: c.ink, "stroke-width": 20, "stroke-linejoin": "round", fill: c.ink }, [
    ["path", { d: "M431 392 L371 384 C252 370 237 492 357 506 C246 492 231 614 342 628 C240 614 223 735 325 749 C232 733 211 854 304 870 C221 849 191 968 274 989 C216 939 136 1033 194 1082 C174 1018 58 1054 78 1118 L300 1180 L480 420 Z" }],
    ["path", { d: "M362 420 C372 332 432 290 560 286 C690 284 742 312 764 382 C780 436 786 486 788 524 L1010 506 C1016 478 1042 466 1080 466 C1120 466 1144 480 1146 520 C1150 572 1148 612 1136 640 C1090 660 830 686 722 702 C744 770 768 850 782 930 C796 1010 794 1100 770 1170 L740 1302 L374 1302 C240 1298 100 1256 30 1190 C10 1170 -12 1140 -30 1112 C90 1112 222 1082 266 1010 C292 964 302 900 312 822 Z" }],
    ["path", { d: "M765 847 C821 887 876 952 912 1012 L888 1046 L875 1016 L856 1050 L843 1016 L825 1040 L821 1010 L792 1016 L791 1013 L791 1010 L791 1007 L791 1004 L791 1001 L791 998 L791 995 L790 991 L790 988 L790 985 L790 982 L789 979 L789 976 L789 973 L789 970 L788 967 L788 963 L787 960 L787 957 L787 954 L786 951 L786 948 L785 945 L785 942 L785 939 L784 936 L784 933 L783 930 L782 927 L782 924 L781 921 L781 918 L780 915 L780 912 L779 909 L779 906 L778 903 L777 900 L777 897 L776 894 L775 891 L775 888 L774 885 L773 882 L773 879 L772 876 L771 873 L771 870 L770 867 L769 864 L769 861 L768 858 L767 855 L767 852 L766 849 L765 847 Z" }],
    ["path", { d: "M740 1302 C736 1210 752 1128 792 1104 C846 1112 872 1196 872 1302 Z" }],
    ["path", { d: "M456 1302 V1260 C456 1240 472 1230 496 1230 H654 C684 1230 700 1252 700 1276 V1302 Z" }],
    ["path", { d: "M736 1302 V1260 C736 1240 752 1230 776 1230 H926 C956 1230 972 1252 972 1276 V1302 Z" }],
  ]],
  ["g", { part: "crest", fill: c.crest }, [
    ["path", { d: "M431 392 L371 384 C252 370 237 492 357 506 C246 492 231 614 342 628 C240 614 223 735 325 749 C232 733 211 854 304 870 C221 849 191 968 274 989 C216 939 136 1033 194 1082 C174 1018 58 1054 78 1118 L300 1180 L480 420 Z" }],
  ]],
  ["path", { d: "M318 441 L307 563 L295 685 L278 805 L261 927 L217 1019 L129 1081", fill: "none", stroke: c.amber, "stroke-width": 9, "stroke-linejoin": "round", "stroke-linecap": "round" }],
  ["circle", { part: "head-node", cx: 318, cy: 441, r: 27, fill: c.amber }],
  // The commits, newest (at the neck) to oldest (at the tail). The welcome
  // lights them amber one after another, tail to HEAD.
  ["g", { part: "commits", fill: c.white }, [
    ["circle", { cx: 307, cy: 563, r: 20 }],
    ["circle", { cx: 295, cy: 685, r: 18 }],
    ["circle", { cx: 278, cy: 805, r: 16 }],
    ["circle", { cx: 261, cy: 927, r: 15 }],
    ["circle", { cx: 217, cy: 1019, r: 13 }],
    ["circle", { cx: 129, cy: 1081, r: 12 }],
  ]],
  ["g", { part: "fill", fill: c.lime }, [
    ["path", { d: "M362 420 C372 332 432 290 560 286 C690 284 742 312 764 382 C780 436 786 486 788 524 L1010 506 C1016 478 1042 466 1080 466 C1120 466 1144 480 1146 520 C1150 572 1148 612 1136 640 C1090 660 830 686 722 702 C744 770 768 850 782 930 C796 1010 794 1100 770 1170 L740 1302 L374 1302 C240 1298 100 1256 30 1190 C10 1170 -12 1140 -30 1112 C90 1112 222 1082 266 1010 C292 964 302 900 312 822 Z" }],
  ]],
  ["g", { fill: c.white, stroke: c.ink, "stroke-width": 10, "stroke-linejoin": "round" }, [
    ["path", { d: "M831.0 697 L875.0 691 L857 719 Q853 726 849 719 Z" }],
    ["path", { d: "M903.0 688 L953.0 681 L932 716 Q928 723 924 716 Z" }],
    ["path", { d: "M977.0 678 L1033.0 670 L1009 710 Q1005 717 1001 710 Z" }],
    ["path", { d: "M1055.0 667 L1117.0 655 L1091 702 Q1086 709 1081 702 Z" }],
  ]],
  ["path", { fill: c.white, d: "M722 702 C680 706 630 710 600 716 C574 744 566 800 572 852 L596 1062 C606 1150 620 1240 660 1302 L740 1302 L770 1170 C794 1100 796 1010 782 930 C768 850 744 770 722 702 Z" }],
  ["g", { fill: c.amber }, [
    ["path", { d: "M650 813 L755.3 813 L764.1 847 L650 847 C627.3 847 627.3 813 650 813 Z" }],
    ["path", { d: "M678 953 L785.6 953 L789 987 L678 987 C655.3 987 655.3 953 678 953 Z" }],
    ["path", { d: "M664 1103 L785.8 1103 L779.3 1137 L664 1137 C641.3 1137 641.3 1103 664 1103 Z" }],
  ]],
  ["g", { part: "fill", fill: c.lime }, [
    ["path", { d: "M765 847 C821 887 876 952 912 1012 L888 1046 L875 1016 L856 1050 L843 1016 L825 1040 L821 1010 L792 1016 L791 1013 L791 1010 L791 1007 L791 1004 L791 1001 L791 998 L791 995 L790 991 L790 988 L790 985 L790 982 L789 979 L789 976 L789 973 L789 970 L788 967 L788 963 L787 960 L787 957 L787 954 L786 951 L786 948 L785 945 L785 942 L785 939 L784 936 L784 933 L783 930 L782 927 L782 924 L781 921 L781 918 L780 915 L780 912 L779 909 L779 906 L778 903 L777 900 L777 897 L776 894 L775 891 L775 888 L774 885 L773 882 L773 879 L772 876 L771 873 L771 870 L770 867 L769 864 L769 861 L768 858 L767 855 L767 852 L766 849 L765 847 Z" }],
  ]],
  ["path", { part: "fill", d: "M476 1074 C564 1070 610 1150 612 1250 L612 1302 L374 1302 L374 1200 Z", fill: c.lime }],
  ["g", { part: "fill", fill: c.lime }, [
    ["path", { d: "M740 1302 C736 1210 752 1128 792 1104 C846 1112 872 1196 872 1302 Z" }],
  ]],
  ["g", { part: "fill", fill: c.lime }, [
    ["path", { d: "M456 1302 V1260 C456 1240 472 1230 496 1230 H654 C684 1230 700 1252 700 1276 V1302 Z" }],
    ["path", { d: "M736 1302 V1260 C736 1240 752 1230 776 1230 H926 C956 1230 972 1252 972 1276 V1302 Z" }],
  ]],
  ["path", { part: "fill", d: "M570 850 C616 902 646 960 656 1004 L618 998 L612 1028 L588 1004 L572 1038 L546 1004 L530 1034 L498 1000 C518 960 546 904 570 850 Z", fill: c.lime }],
  ["g", { fill: "none", stroke: c.ink, "stroke-width": 12, "stroke-linecap": "round" }, [
    ["path", { d: "M769.1 846.5 L770.3 851.2 L771.5 856 L772.6 860.7 L773.7 865.4 L774.8 870.2 L775.9 874.9 L777 879.7 L778 884.5 L779.1 889.3 L780.1 894 L781.1 898.8 L782 903.6 L783 908.4 L783.9 913.2 L784.8 918 L785.7 922.8 L786.6 927.6 L787.4 932.4 L788.2 937.2 L789 942.1 L789.7 946.9 L790.4 951.8 L791 956.7 L791.6 961.6 L792.2 966.6 L792.7 971.5 L793.2 976.5 L793.6 981.4 L794 986.4 L794.4 991.4 L794.7 996.4 L795 1001.4 L795.2 1006.4 L795.4 1011.4 L795.6 1016.4 L795.7 1021.4 L795.7 1021.4", "stroke-width": 10, "stroke-linejoin": "round" }],
    ["path", { d: "M570 850 C616 902 646 960 656 1004" }],
  ]],
  ["g", { fill: "none", stroke: c.ink, "stroke-width": 11, "stroke-linecap": "round", "stroke-linejoin": "round" }, [
    ["path", { d: "M498 1000 L530 1034 L546 1004 L572 1038 L588 1004 L612 1028 L618 998 L656 1004" }],
  ]],
  ["g", { part: "fill", fill: c.lime, stroke: c.ink, "stroke-width": 12, "stroke-linejoin": "round" }, [
    ["path", { d: "M456 1302 V1260 C456 1240 472 1230 496 1230 H654 C684 1230 700 1252 700 1276 V1302 Z" }],
    ["path", { d: "M736 1302 V1260 C736 1240 752 1230 776 1230 H926 C956 1230 972 1252 972 1276 V1302 Z" }],
  ]],
  ["g", { stroke: c.ink, "stroke-linecap": "round", "stroke-width": 12 }, [
    ["path", { d: "M624 1302 V1270" }],
    ["path", { d: "M660 1302 V1270" }],
    ["path", { d: "M896 1302 V1270" }],
    ["path", { d: "M932 1302 V1270" }],
  ]],
  ["g", { part: "glasses" }, [
    ["path", { d: "M649 423 L791 423 L781 529 Q720 538 663 527 Z", fill: c.lens, stroke: c.ink, "stroke-width": 20, "stroke-linejoin": "round" }],
    ["g", { part: "glints", fill: c.white }, [
      ["path", { d: "M746.5 423 L700.4 532 L691.8 531.3 L682.1 530.1 L675.6 529.2 L720.5 423 Z" }],
      ["path", { d: "M721 533 L716.1 532.8 L761.5 423 L773.5 423 L727 533 L721 533 Z" }],
    ]],
    ["path", { d: "M478 420 L630 420 L619 532 Q554 542 493 530 Z", fill: c.lens, stroke: c.ink, "stroke-width": 20, "stroke-linejoin": "round" }],
    ["g", { part: "glints", fill: c.white }, [
      ["path", { d: "M581.5 420 L533.2 535.5 L523.8 534.6 L513.4 533.4 L506.6 532.4 L554.4 420 Z" }],
      ["path", { d: "M562 536 L549 536 L598.4 420 L610.5 420 Z" }],
    ]],
    ["path", { d: "M630 440 Q639 422 649 442", fill: "none", stroke: c.ink, "stroke-width": 20, "stroke-linecap": "round" }],
    ["path", { d: "M478 432 L372 446", stroke: c.ink, "stroke-width": 20, "stroke-linecap": "round" }],
  ]],
];

/** Where each crop sits in the drawing, outline included, plus a hair of air. */
const boxes = {
  body: { x: -50, y: 225, width: 1215, height: 1095 },
  head: { x: 170, y: 244, width: 1000, height: 540 },
  /** Square; below the jaw the body continues and the icon tile cuts it. */
  portrait: { x: 176, y: 250, width: 990, height: 990 },
};

/** The variants rendered as standalone SVGs and in the app. */
export const variantNames = ["body", "head"];

const oneLine = (d) => d.replace(/\s+/g, " ").trim();

/** The lens outlines, for clipping the in-app shine across the glasses. */
function lensOutline() {
  const lenses = [];
  const walk = (nodes) => {
    for (const [tag, attrs, children] of nodes) {
      if (tag === "path" && attrs.fill === c.lens) lenses.push(oneLine(attrs.d));
      if (children) walk(children);
    }
  };
  walk(DRAWING);
  return lenses.join(" ");
}

function viewBox(name) {
  const { x, y, width, height } = boxes[name];
  return `${x} ${y} ${width} ${height}`;
}

function toSvg(nodes, indent) {
  return nodes
    .map(([tag, attrs, children]) => {
      const text = Object.entries(attrs)
        .filter(([key]) => key !== "part")
        .map(([key, value]) => ` ${key}="${value}"`)
        .join("");
      if (!children) return `${indent}<${tag}${text}/>`;
      return `${indent}<${tag}${text}>\n${toSvg(children, `${indent}  `)}\n${indent}</${tag}>`;
    })
    .join("\n");
}

/** A standalone SVG of one variant, cropped to the drawing. */
export function mascotSvg(name) {
  const { width, height } = boxes[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox(name)}">
  <title>GitOdile</title>
${toSvg(DRAWING, "  ")}
</svg>
`;
}

const n4 = (value) => Number(value.toFixed(4));

/** `name`'s box scaled into a `size` square area at (`left`, `top`), centred. */
function placed(name, left, top, size) {
  const { x, y, width, height } = boxes[name];
  const k = size / Math.max(width, height);
  const dx = left + (size - width * k) / 2 - x * k;
  const dy = top + (size - height * k) / 2 - y * k;
  return `<g transform="translate(${n4(dx)} ${n4(dy)}) scale(${n4(k)})">
${toSvg(DRAWING, "    ")}
  </g>`;
}

/**
 * The application icon on a 1024px canvas: the portrait on the slate tile.
 * `platform: "default"` fills the canvas the way Windows and Linux icons do;
 * `"macos"` sits on Apple's grid, an 824px tile centred with room for the
 * shadow macOS draws. Both are the same icon at a different margin.
 */
export function iconSourceSvg({ platform }) {
  const mac = platform === "macos";
  const start = mac ? 100 : 24;
  const tile = 1024 - 2 * start;
  const radius = n4(tile * 0.225);
  // The portrait fills 90% of the tile's width and starts 16% down, so the
  // crest clears the top edge and the body runs off the bottom one.
  const area = tile * 0.9;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>GitOdile</title>
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.tileTop}"/>
      <stop offset="1" stop-color="${c.tileBottom}"/>
    </linearGradient>
    <clipPath id="tile-shape">
      <rect x="${start}" y="${start}" width="${tile}" height="${tile}" rx="${radius}"/>
    </clipPath>
  </defs>
  <rect x="${start}" y="${start}" width="${tile}" height="${tile}" rx="${radius}" fill="url(#tile)"/>
  <g clip-path="url(#tile-shape)">
  ${placed("portrait", n4(start + tile * 0.05), n4(start + tile * 0.16), n4(area))}
  </g>
</svg>
`;
}

/**
 * The Windows installer's bitmaps on the icon's slate (ADR 0029): `sidebar` is
 * the whole mascot on the Welcome and Finish pages, `header` its head on every
 * other page. The composition is drawn at its exact pixel size in the top-left
 * corner of a square canvas, because `tauri icon` only renders squares;
 * `pnpm icons` crops it back to `width`x`height`.
 */
export function installerSourceSvg(name, { width, height }) {
  const side = Math.max(width, height);
  let art;
  if (name === "sidebar") {
    // The whole crocodile, 12px clear of each side, sitting a little below the
    // middle so it rests in the panel rather than floating in it.
    const size = width - 24;
    art = placed("body", 12, n4(height * 0.56 - size / 2), size);
  } else if (name === "header") {
    // The head 45px tall, centred in the strip.
    const box = boxes.head;
    const size = n4((45 * box.width) / box.height);
    art = placed("head", n4((width - size) / 2), n4(height / 2 - size / 2), size);
  } else {
    throw new Error(`unknown installer image: ${name}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">
  <defs>
    <linearGradient id="slate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.tileTop}"/>
      <stop offset="1" stop-color="${c.tileBottom}"/>
    </linearGradient>
    <clipPath id="frame">
      <rect width="${width}" height="${height}"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#slate)"/>
  <g clip-path="url(#frame)">
  ${art}
  </g>
</svg>
`;
}

/** A 1024px transparent square with `name` centred, for rendering brand PNGs. */
export function brandSourceSvg(name) {
  const margin = 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${placed(name, margin, margin, 1024 - 2 * margin)}
</svg>
`;
}

// ---- In-app module -----------------------------------------------------------

const camel = (key) => key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

function toModuleNodes(nodes, inOutline = false) {
  return nodes.map(([tag, attrs, children]) => {
    const props = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "part") props.className = partClass(value);
      else props[camel(key)] = value;
    }
    // The welcome's entrance draws the outline with a dash as long as each
    // path, so every outline path measures 1 whatever its real length.
    if (inOutline && tag === "path") props.pathLength = 1;
    const outline = inOutline || attrs.part === "outline";
    return children ? [tag, props, toModuleNodes(children, outline)] : [tag, props];
  });
}

/** `src/shared/ui/mascotArtwork.ts`: the tree with React prop names, per variant. */
export function artworkModule() {
  const data = Object.fromEntries(
    variantNames.map((name) => [name, { viewBox: viewBox(name), nodes: toModuleNodes(DRAWING), glasses: lensOutline() }]),
  );
  return `// Generated by scripts/icons/mascot.mjs. Do not edit; run \`node scripts/icons/mascot.mjs\`.
//
// The mascot as SVG element nodes with React prop names. Classed groups:
// \`${partClass("outline")}\` the silhouette's ink (its paths measure pathLength 1),
// \`${THEMED_FILL_CLASS}\` is the lime the in-app mark recolours per theme,
// \`${partClass("crest")}\` the crest, recoloured with it,
// \`${partClass("glasses")}\` the frame, lenses, arm and glints, \`${partClass("glints")}\`
// the white glints on each lens, \`${partClass("commits")}\` the crest's commits
// and \`${partClass("head-node")}\` its HEAD.

export type MascotNode = readonly [tag: string, props: Readonly<Record<string, string | number>>, children?: readonly MascotNode[]];

export interface MascotArtwork {
  readonly viewBox: string;
  readonly nodes: readonly MascotNode[];
  /** Outline of the two lenses, for clipping the shine across them. */
  readonly glasses: string;
}

export const MASCOT_ARTWORK: Readonly<Record<"body" | "head", MascotArtwork>> = ${JSON.stringify(data, null, 2)};
`;
}

// ---- Console ASCII art --------------------------------------------------------

/** Characters across the body's box: the console prints one per cell. */
export const CONSOLE_ASCII_COLUMNS = 64;

/** Light to dense, as ASCII art shades. */
const ASCII_RAMP = " .:-=+*#%@";

/**
 * The drawing with every colour inside the `part` group renamed through
 * `names`, so the ASCII art can tone that part apart from identical colours
 * elsewhere (the glasses' ink from the body's outline).
 */
function renamePartColours(nodes, part, names, inside = false) {
  return nodes.map(([tag, attrs, children]) => {
    const within = inside || attrs.part === part;
    const renamed = { ...attrs };
    if (within) for (const key of ["fill", "stroke"]) if (names[renamed[key]]) renamed[key] = names[renamed[key]];
    return children ? [tag, renamed, renamePartColours(children, part, names, within)] : [tag, renamed];
  });
}

/** `src/features/console/mascotAscii.ts`: the whole mascot as ASCII art and its tones. */
export function consoleAsciiModule() {
  const glasses = { [c.ink]: "glasses", [c.lens]: "glasses", [c.white]: "glint" };
  const art = asciiArt(renamePartColours(DRAWING, "glasses", glasses), boxes.body, {
    columns: CONSOLE_ASCII_COLUMNS,
    ramp: ASCII_RAMP,
    // Five console tones, each themed in console.css: 1 the skin (the body),
    // 2 the outline and crest, 3 the amber (HEAD, graph line and plates), 4 the
    // sunglasses (frame, lenses and arm) and 5 their glints. The glasses are
    // their own tone because the outline prints in the text colour, which on a
    // dark console would draw them white. The weight is how dense a colour
    // prints: the outline densest, the white belly, commits and teeth not at
    // all, so they read as holes the way hand-made ASCII art leaves its
    // highlights; the glints print as dense as the lens so they stay marks.
    tones: {
      [c.lime]: { tone: 1, weight: 0.55 },
      [c.ink]: { tone: 2, weight: 1 },
      [c.crest]: { tone: 2, weight: 0.8 },
      [c.amber]: { tone: 3, weight: 0.7 },
      glasses: { tone: 4, weight: 1 },
      glint: { tone: 5, weight: 1.2 },
      [c.white]: { tone: 0, weight: 0 },
    },
    // A cell is ~19 drawing units wide and ~32 tall: at the drawing's own
    // weight the outline would thin to scattered dots.
    strokeScale: 1.8,
  });
  const list = (rows) => rows.map((row) => `  ${JSON.stringify(row)},`).join("\n");
  return `// Generated by scripts/icons/mascot.mjs. Do not edit; run \`node scripts/icons/mascot.mjs\`.
//
// The whole mascot as ASCII art, ${CONSOLE_ASCII_COLUMNS} characters across its box, empty
// edges trimmed. MASCOT_ASCII_TONES colours each character: 0 space, 1 skin,
// 2 outline and crest, 3 amber (HEAD, graph line and plates), 4 sunglasses,
// 5 their glints. MASCOT_ASCII_COVER is 1 where the silhouette covers the cell,
// the white belly included, so the rain behind the art passes under it.

export const MASCOT_ASCII: readonly string[] = [
${list(art.text)}
];

export const MASCOT_ASCII_TONES: readonly string[] = [
${list(art.tones)}
];

export const MASCOT_ASCII_COVER: readonly string[] = [
${list(art.cover)}
];
`;
}

/** Every text file this module generates, keyed by path. */
export function generatedFiles() {
  return {
    [path.join(assetsDir, "gitodile-mascot.svg")]: mascotSvg("body"),
    [path.join(assetsDir, "gitodile-mascot-head.svg")]: mascotSvg("head"),
    [path.join(brandDir, "gitodile-icon.svg")]: iconSourceSvg({ platform: "default" }),
    [path.join(brandDir, "gitodile-icon-macos.svg")]: iconSourceSvg({ platform: "macos" }),
    [path.join(root, "src", "shared", "ui", "mascotArtwork.ts")]: artworkModule(),
    [path.join(root, "src", "features", "console", "mascotAscii.ts")]: consoleAsciiModule(),
  };
}

// --- CLI ---------------------------------------------------------------------

function main(argv) {
  const check = argv.includes("--check");
  let drift = false;
  for (const [file, text] of Object.entries(generatedFiles())) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    if (check) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n") : null;
      if (current !== text) {
        console.error(`${rel}: differs from scripts/icons/mascot.mjs; run \`node scripts/icons/mascot.mjs\``);
        drift = true;
      }
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      console.log(`${rel}: written`);
    }
  }
  if (check && !drift) console.log("mascot files match scripts/icons/mascot.mjs");
  if (drift) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

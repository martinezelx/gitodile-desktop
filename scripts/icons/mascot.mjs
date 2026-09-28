// The GitOdile mascot, drawn once and assembled into every variant.
//
// The crocodile is built from shared parts in one 1536x1024 drawing space:
// outlines are centre-line paths stroked at a single weight, so the body and
// the head can never drift apart. Two drawings come out of it:
//
//   body   the full crocodile, for everything shown at 48px and up
//   head   the same head with a skull behind it, for icons under 48px
//
// The drawing is a small element tree, written out three ways:
//
//   src/assets/gitodile-mascot*.svg   standalone SVGs in the brand colours
//   src/shared/ui/mascotArtwork.ts    the same tree for the in-app React mark,
//                                     whose lime fill follows the theme
//   src/features/console/mascotPixels.ts
//                                     the head sampled into the pixel grid the
//                                     console's welcome draws
//   icon sources for `pnpm icons`     1024px squares, transparent for Windows
//                                     and Linux, on the emerald tile for macOS
//
//   node scripts/icons/mascot.mjs            rewrite the generated files
//   node scripts/icons/mascot.mjs --check    fail if they drift from this file
//
// Edit the parts here and regenerate; never edit a generated file by hand.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pixelGrid } from "./pixel-grid.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const assetsDir = path.join(root, "src", "assets");

export const colors = {
  fill: "#a8f442",
  ink: "#000000",
  glint: "#ffffff",
  /** macOS tile: lit from above, darker below (Apple's icon guidance). */
  tileTop: "#3f7c58",
  tileBottom: "#1b4631",
};

/**
 * Groups the in-app mark addresses by class: `fill` is recoloured per theme,
 * `glasses` (strap, frame and glints) moves as one piece, and `glints` twinkle.
 * The in-app class is `gitodile-mascot__<part>`; standalone SVGs drop it.
 */
const partClass = (part) => `gitodile-mascot__${part}`;
export const THEMED_FILL_CLASS = partClass("fill");

/** Outline weight, in drawing units, shared by every stroke. */
const STROKE = 50;

// ---- Shared head parts ------------------------------------------------------

const CROWN = `C660 300 720 232 800 232
  C835 232 862 250 875 272
  C890 245 925 222 962 222
  C1030 222 1080 270 1095 330
  L1100 352
  C1180 356 1270 358 1340 356
  C1405 354 1434 390 1434 445
  C1434 495 1414 540 1388 572
  C1335 650 1250 712 1150 732`;
const SMILE = "M885 540 C960 588 1055 600 1175 594 C1255 590 1330 572 1392 555";
/** The console's pixel head starts the smile a little later along the same
 * curve: at one pixel per character its first stretch meets the glasses. */
const CONSOLE_SMILE = "M932 565 C999 592 1079 599 1175 594 C1255 590 1330 572 1392 555";
const GLASSES = `M765 345 L1250 300 C1262 300 1266 318 1258 340
  C1250 420 1200 485 1140 485 C1085 485 1048 455 1035 420 L1015 422
  C1000 460 950 498 885 498 C815 498 770 440 765 345 Z`;
const GLINTS = ["M920 353 L955 351 L875 458 L843 452 Z", "M1175 338 L1212 335 L1133 441 L1100 435 Z"];
const NOSTRIL = { cx: 1335, cy: 450, r: 27 };

// ---- Body ------------------------------------------------------------------

const TAIL_AND_RIDGE = `M118 580
  C118 500 158 445 208 445
  C250 445 272 482 296 516
  C324 490 336 478 352 478
  C370 478 390 490 398 500
  C425 462 444 432 462 432
  C482 432 505 446 515 458
  C548 395 568 355 590 355
  C615 355 640 375 655 392`;
const BELLY_AND_LEGS = `L950 731
  Q920 731 920 761 L920 800 Q920 830 890 830 L770 830 Q740 830 740 800 L740 760 Q740 730 710 730
  L520 730
  Q490 730 490 760 L490 800 Q490 830 460 830 L320 830 Q290 830 290 800 L290 752
  C200 732 125 670 118 575 Z`;

// ---- Head: the body's head closed by the back of the skull -------------------

const HEAD_BACK = `L840 732
  C680 732 588 662 588 560
  C588 492 614 438 655 392 Z`;

const oneLine = (d) => d.replace(/\s+/g, " ").trim();

const variants = {
  body: {
    silhouette: [
      // The far front leg, drawn first so the body covers its top.
      ["rect", { x: 1000, y: 660, width: 112, height: 170, rx: 28 }],
      ["path", { d: oneLine(`${TAIL_AND_RIDGE} ${CROWN} ${BELLY_AND_LEGS}`) }],
    ],
    strap: "M655 378 H780",
    // Outer edge of the drawing, stroke included, plus a hair of air.
    box: { x: 68, y: 176, width: 1400, height: 700 },
  },
  head: {
    silhouette: [["path", { d: oneLine(`M655 392 ${CROWN} ${HEAD_BACK}`) }]],
    strap: "M605 378 H780",
    box: { x: 545, y: 170, width: 915, height: 610 },
  },
};

export const variantNames = Object.keys(variants);

/**
 * The mascot as `[tag, attributes, children?]` nodes, in drawing units.
 * The first group holds everything painted in the lime fill (`part: "fill"`,
 * recoloured per theme in the app). The second is the sunglasses with their
 * strap, so the strap follows the frame when the app animates the glasses.
 */
function artwork(name, { smile = SMILE } = {}) {
  const v = variants[name];
  return [
    [
      "g",
      {
        part: "fill",
        fill: colors.fill,
        stroke: colors.ink,
        "stroke-width": STROKE,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      },
      [...v.silhouette, ["path", { fill: "none", "stroke-width": STROKE * 0.96, d: smile }]],
    ],
    [
      "g",
      { part: "glasses" },
      [
        ["path", { fill: "none", stroke: colors.ink, "stroke-width": STROKE, "stroke-linecap": "round", d: v.strap }],
        ["path", { fill: colors.ink, stroke: colors.ink, "stroke-width": 16, "stroke-linejoin": "round", d: oneLine(GLASSES) }],
        ["g", { part: "glints", fill: colors.glint }, GLINTS.map((d) => ["path", { d }])],
      ],
    ],
    ["circle", { cx: NOSTRIL.cx, cy: NOSTRIL.cy, r: NOSTRIL.r, fill: colors.ink }],
  ];
}

function viewBox(name) {
  const { x, y, width, height } = variants[name].box;
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
  const { width, height } = variants[name].box;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox(name)}">
  <title>GitOdile</title>
${toSvg(artwork(name), "  ")}
</svg>
`;
}

/** The variant scaled into a `size` square area at (`left`, `top`), centred. */
function placed(name, left, top, size) {
  const { x, y, width, height } = variants[name].box;
  const k = size / Math.max(width, height);
  const dx = left + (size - width * k) / 2 - x * k;
  const dy = top + (size - height * k) / 2 - y * k;
  const n = (value) => Number(value.toFixed(4));
  return `  <g transform="translate(${n(dx)} ${n(dy)}) scale(${n(k)})">
${toSvg(artwork(name), "    ")}
  </g>`;
}

/**
 * A 1024px square icon source for `tauri icon`.
 * `tile: false` is the transparent Windows/Linux icon; `tile: true` is macOS.
 */
export function iconSourceSvg(name, { tile }) {
  if (!tile) {
    const margin = 24;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
${placed(name, margin, margin, 1024 - 2 * margin)}
</svg>
`;
  }
  // Apple's macOS icon grid: an 824px rounded tile centred on the 1024 canvas.
  const tileStart = 100;
  const tileSize = 824;
  const inset = name === "body" ? 64 : 88;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${colors.tileTop}"/>
      <stop offset="1" stop-color="${colors.tileBottom}"/>
    </linearGradient>
  </defs>
  <rect x="${tileStart}" y="${tileStart}" width="${tileSize}" height="${tileSize}" rx="185" fill="url(#tile)"/>
${placed(name, tileStart + inset, tileStart + inset, tileSize - 2 * inset)}
</svg>
`;
}

// ---- In-app module -----------------------------------------------------------

const camel = (key) => key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function toModuleNodes(nodes) {
  return nodes.map(([tag, attrs, children]) => {
    const props = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "part") props.className = partClass(value);
      else props[camel(key)] = value;
    }
    return children ? [tag, props, toModuleNodes(children)] : [tag, props];
  });
}

/** `src/shared/ui/mascotArtwork.ts`: the tree with React prop names, per variant. */
export function artworkModule() {
  const data = Object.fromEntries(
    variantNames.map((name) => [
      name,
      { viewBox: viewBox(name), nodes: toModuleNodes(artwork(name)), glasses: oneLine(GLASSES) },
    ]),
  );
  return `// Generated by scripts/icons/mascot.mjs. Do not edit; run \`node scripts/icons/mascot.mjs\`.
//
// The mascot as SVG element nodes with React prop names. Classed groups:
// \`${THEMED_FILL_CLASS}\` is the lime fill the in-app mark recolours per theme,
// \`${partClass("glasses")}\` the strap, frame and glints that move together, and
// \`${partClass("glints")}\` the two white glints.

export type MascotNode = readonly [tag: string, props: Readonly<Record<string, string | number>>, children?: readonly MascotNode[]];

export interface MascotArtwork {
  readonly viewBox: string;
  readonly nodes: readonly MascotNode[];
  /** Outline of the sunglasses, for clipping the shine across the lenses. */
  readonly glasses: string;
}

export const MASCOT_ARTWORK: Readonly<Record<"body" | "head", MascotArtwork>> = ${JSON.stringify(data, null, 2)};
`;
}

// ---- Console pixel art ---------------------------------------------------------

/** Pixel columns across the head's box: one pixel is one console character. */
export const CONSOLE_PIXEL_COLUMNS = 40;

/** `src/features/console/mascotPixels.ts`: the head as rows of palette indices. */
export function consolePixelsModule() {
  const rows = pixelGrid(artwork("head", { smile: CONSOLE_SMILE }), variants.head.box, {
    columns: CONSOLE_PIXEL_COLUMNS,
    palette: [colors.fill, colors.ink, colors.glint],
  });
  return `// Generated by scripts/icons/mascot.mjs. Do not edit; run \`node scripts/icons/mascot.mjs\`.
//
// The head mark sampled into square cells ${CONSOLE_PIXEL_COLUMNS} across its box, empty
// edges trimmed. 0 empty, 1 lime fill, 2 ink (outline and glasses), 3 glint.

export const MASCOT_PIXELS: readonly string[] = [
${rows.map((row) => `  "${row}",`).join("\n")}
];
`;
}

/** Every file this module generates, keyed by path. */
export function generatedFiles() {
  return {
    [path.join(assetsDir, "gitodile-mascot.svg")]: mascotSvg("body"),
    [path.join(assetsDir, "gitodile-mascot-head.svg")]: mascotSvg("head"),
    [path.join(root, "src", "shared", "ui", "mascotArtwork.ts")]: artworkModule(),
    [path.join(root, "src", "features", "console", "mascotPixels.ts")]: consolePixelsModule(),
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

import { createElement, type ComponentType, type ImgHTMLAttributes } from "react";
import Assembly from "~icons/vscode-icons/file-type-assembly";
import Babel from "~icons/vscode-icons/file-type-babel";
import CSharp from "~icons/vscode-icons/file-type-csharp2";
import Css from "~icons/vscode-icons/file-type-css";
import C from "~icons/vscode-icons/file-type-c";
import Clojure from "~icons/vscode-icons/file-type-clojure";
import Composer from "~icons/vscode-icons/file-type-composer";
import Cpp from "~icons/vscode-icons/file-type-cpp";
import Dart from "~icons/vscode-icons/file-type-dartlang";
import DefaultFile from "~icons/vscode-icons/default-file";
import Docker from "~icons/vscode-icons/file-type-docker2";
import EditorConfig from "~icons/vscode-icons/file-type-editorconfig";
import Elixir from "~icons/vscode-icons/file-type-elixir";
import Env from "~icons/vscode-icons/file-type-dotenv";
import Eslint from "~icons/vscode-icons/file-type-eslint";
import FSharp from "~icons/vscode-icons/file-type-fsharp2";
import Git from "~icons/vscode-icons/file-type-git";
import Go from "~icons/vscode-icons/file-type-go";
import Gradle from "~icons/vscode-icons/file-type-gradle";
import GraphQl from "~icons/vscode-icons/file-type-graphql";
import Haskell from "~icons/vscode-icons/file-type-haskell";
import Html from "~icons/vscode-icons/file-type-html";
import Image from "~icons/vscode-icons/file-type-image";
import Ini from "~icons/vscode-icons/file-type-ini";
import Java from "~icons/vscode-icons/file-type-java";
import Jenkins from "~icons/vscode-icons/file-type-jenkins";
import Jest from "~icons/vscode-icons/file-type-jest";
import JsOfficial from "~icons/vscode-icons/file-type-js-official";
import JsConfig from "~icons/vscode-icons/file-type-jsconfig";
import JsonOfficial from "~icons/vscode-icons/file-type-json-official";
import Kotlin from "~icons/vscode-icons/file-type-kotlin";
import Less from "~icons/vscode-icons/file-type-less";
import License from "~icons/vscode-icons/file-type-license";
import LightPnpm from "~icons/vscode-icons/file-type-light-pnpm";
import Log from "~icons/vscode-icons/file-type-log";
import Lua from "~icons/vscode-icons/file-type-lua";
import Markdown from "~icons/vscode-icons/file-type-markdown";
import Npm from "~icons/vscode-icons/file-type-npm";
import ObjectiveC from "~icons/vscode-icons/file-type-objectivec";
import ObjectiveCpp from "~icons/vscode-icons/file-type-objectivecpp";
import Pdf from "~icons/vscode-icons/file-type-pdf2";
import Perl from "~icons/vscode-icons/file-type-perl";
import Php from "~icons/vscode-icons/file-type-php";
import Powershell from "~icons/vscode-icons/file-type-powershell";
import Prettier from "~icons/vscode-icons/file-type-prettier";
import Python from "~icons/vscode-icons/file-type-python";
import R from "~icons/vscode-icons/file-type-r";
import ReactJs from "~icons/vscode-icons/file-type-reactjs";
import ReactTs from "~icons/vscode-icons/file-type-reactts";
import Ruby from "~icons/vscode-icons/file-type-ruby";
import Rust from "~icons/vscode-icons/file-type-rust";
import Scala from "~icons/vscode-icons/file-type-scala";
import Scss from "~icons/vscode-icons/file-type-scss";
import Shell from "~icons/vscode-icons/file-type-shell";
import Sql from "~icons/vscode-icons/file-type-sql";
import Svelte from "~icons/vscode-icons/file-type-svelte";
import Swift from "~icons/vscode-icons/file-type-swift";
import Terraform from "~icons/vscode-icons/file-type-terraform";
import Text from "~icons/vscode-icons/file-type-text";
import Toml from "~icons/vscode-icons/file-type-toml";
import TsConfig from "~icons/vscode-icons/file-type-tsconfig";
import TypescriptOfficial from "~icons/vscode-icons/file-type-typescript-official";
import Vim from "~icons/vscode-icons/file-type-vim";
import Vitest from "~icons/vscode-icons/file-type-vitest";
import Vue from "~icons/vscode-icons/file-type-vue";
import Webpack from "~icons/vscode-icons/file-type-webpack";
import Word from "~icons/vscode-icons/file-type-word";
import Xml from "~icons/vscode-icons/file-type-xml";
import Yaml from "~icons/vscode-icons/file-type-yaml-official";
import Yarn from "~icons/vscode-icons/file-type-yarn";
import Zip from "~icons/vscode-icons/file-type-zip";

type FileTypeIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "draggable" | "src">;
export type FileTypeIcon = ComponentType<FileTypeIconProps>;
type FileTypeIconSource = string;

const ICON_COMPONENTS = new Map<FileTypeIconSource, FileTypeIcon>();

/** File icons are full-colour artwork, not controls, so they do not need to
 * inherit `currentColor`. Rendering each raw SVG as an image also gives every
 * instance its own SVG document: gradients, masks, and filters can safely
 * reuse the collection's internal IDs across keep-alive screens. */
function iconComponent(source: FileTypeIconSource): FileTypeIcon {
  const cached = ICON_COMPONENTS.get(source);
  if (cached) {
    return cached;
  }

  // `unplugin-icons` emits markup intended for inline DOM use and therefore
  // omits the XML namespace. A standalone SVG image needs it to load in
  // WebView2, Safari, and other XML-based image decoders.
  const standaloneSource = source.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(standaloneSource)}`;
  const Icon: FileTypeIcon = (props) =>
    createElement("img", {
      ...props,
      "aria-hidden": true,
      alt: "",
      draggable: false,
      src: dataUrl,
    });
  Icon.displayName = "FileTypeIcon";
  ICON_COMPONENTS.set(source, Icon);
  return Icon;
}

/** Extension → icon from the vscode-icons set (MIT), covering common
 * languages and tooling beyond whatever happens to be in this repo today —
 * a project in Java, Go, or PHP should get real per-type icons too, not just
 * the generic fallback. Only the icons named here are ever imported, so
 * `unplugin-icons` (wired in `vite.config.ts`) generates just this subset
 * into the bundle — the other ~1500 icons in the collection are never
 * touched, so growing this list costs a few KB per addition, not the whole
 * set. */
const EXTENSION_ICONS: Record<string, FileTypeIconSource> = {
  ts: TypescriptOfficial,
  tsx: ReactTs,
  js: JsOfficial, mjs: JsOfficial, cjs: JsOfficial,
  jsx: ReactJs,
  json: JsonOfficial, jsonc: JsonOfficial,
  md: Markdown, mdx: Markdown,
  css: Css,
  scss: Scss,
  less: Less,
  html: Html, htm: Html,
  xml: Xml,
  yaml: Yaml, yml: Yaml,
  toml: Toml,
  ini: Ini, cfg: Ini, conf: Ini,
  png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, webp: Image, ico: Image, bmp: Image,
  pdf: Pdf,
  doc: Word, docx: Word,
  zip: Zip, tar: Zip, gz: Zip, rar: Zip, "7z": Zip,
  rs: Rust,
  py: Python,
  java: Java,
  c: C, h: C,
  cpp: Cpp, cc: Cpp, cxx: Cpp, hpp: Cpp,
  cs: CSharp,
  go: Go,
  kt: Kotlin, kts: Kotlin,
  swift: Swift,
  php: Php,
  rb: Ruby,
  sh: Shell, bash: Shell, zsh: Shell,
  sql: Sql,
  vue: Vue,
  svelte: Svelte,
  graphql: GraphQl, gql: GraphQl,
  pl: Perl, pm: Perl,
  lua: Lua,
  r: R,
  dart: Dart,
  scala: Scala, sc: Scala,
  hs: Haskell,
  clj: Clojure, cljs: Clojure,
  ex: Elixir, exs: Elixir,
  fs: FSharp, fsx: FSharp,
  m: ObjectiveC, mm: ObjectiveCpp,
  asm: Assembly, s: Assembly,
  vim: Vim,
  ps1: Powershell, psm1: Powershell, psd1: Powershell,
  tf: Terraform, tfvars: Terraform,
  txt: Text,
  log: Log,
};

/** Matched on the bare file name before falling back to the extension table
 * — a lockfile's real identity is "which package manager wrote this", not
 * its `.json`/`.yaml`/`.lock` extension, and tools like Docker, ESLint, or
 * an editor config are named files with no meaningful extension at all. */
const NAME_ICONS: Record<string, FileTypeIconSource> = {
  "package-lock.json": Npm,
  "pnpm-lock.yaml": LightPnpm,
  "yarn.lock": Yarn,
  "Cargo.lock": Rust,
  ".gitignore": Git,
  ".gitattributes": Git,
  ".editorconfig": EditorConfig,
  ".env": Env,
  ".npmrc": Npm,
  ".gitmodules": Git,
  ".vimrc": Vim,
  Dockerfile: Docker,
  Jenkinsfile: Jenkins,
  LICENSE: License,
  "LICENSE.md": License,
  "LICENSE.txt": License,
  "tsconfig.json": TsConfig,
  "jsconfig.json": JsConfig,
  "composer.json": Composer,
};

/** Matched by prefix so `.eslintrc.json`, `webpack.config.ts`, etc. resolve
 * to the tool's icon rather than their trailing extension — the extension
 * table would otherwise route `.eslintrc.json` to the generic JSON icon and
 * `webpack.config.ts` to the plain TypeScript one. */
const NAME_PREFIX_ICONS: [prefix: string, icon: FileTypeIconSource][] = [
  [".eslintrc", Eslint],
  [".prettierrc", Prettier],
  [".babelrc", Babel],
  ["babel.config", Babel],
  ["webpack.config", Webpack],
  ["jest.config", Jest],
  ["vitest.config", Vitest],
  ["build.gradle", Gradle],
];

export function getFileTypeIcon(path: string): FileTypeIcon {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (NAME_ICONS[name]) {
    return iconComponent(NAME_ICONS[name]);
  }
  const prefixMatch = NAME_PREFIX_ICONS.find(([prefix]) => name.startsWith(prefix));
  if (prefixMatch) {
    return iconComponent(prefixMatch[1]);
  }
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return iconComponent(DefaultFile);
  }
  return iconComponent(EXTENSION_ICONS[name.slice(dot + 1).toLowerCase()] ?? DefaultFile);
}

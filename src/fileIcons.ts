import type { ComponentType, SVGProps } from "react";
import { File, FileCode2, FileCog, FileImage, FileJson2, FileLock2, FileText } from "lucide-react";

export type FileTypeIcon = ComponentType<SVGProps<SVGSVGElement>>;

/** Extension → icon, grouped by the shape of file it represents rather than
 * by language, since the goal is a quick visual sort ("this is code", "this
 * is config", "this is a picture") and not a precise per-language badge. */
const EXTENSION_ICONS: Record<string, FileTypeIcon> = {
  ts: FileCode2, tsx: FileCode2, js: FileCode2, jsx: FileCode2, mjs: FileCode2, cjs: FileCode2,
  rs: FileCode2, py: FileCode2, go: FileCode2, java: FileCode2, kt: FileCode2, swift: FileCode2,
  c: FileCode2, h: FileCode2, cpp: FileCode2, hpp: FileCode2, cs: FileCode2, rb: FileCode2, php: FileCode2,
  css: FileCode2, scss: FileCode2, less: FileCode2, html: FileCode2, xml: FileCode2, sh: FileCode2,
  json: FileJson2, jsonc: FileJson2,
  md: FileText, mdx: FileText, txt: FileText,
  yaml: FileCog, yml: FileCog, toml: FileCog, ini: FileCog, env: FileCog,
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage, svg: FileImage, webp: FileImage,
  ico: FileImage, bmp: FileImage,
};

/** Matched on the bare file name before falling back to the extension table,
 * since lockfiles carry a meaningful extension (`.json`, `.yaml`, `.lock`)
 * that would otherwise route them to the wrong icon. */
const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "composer.lock",
]);

export function getFileTypeIcon(path: string): FileTypeIcon {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (LOCKFILE_NAMES.has(name) || name.endsWith(".lock")) {
    return FileLock2;
  }
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return File;
  }
  return EXTENSION_ICONS[name.slice(dot + 1).toLowerCase()] ?? File;
}

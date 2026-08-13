import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".agents", ".git", "dist", "node_modules", "target"]);

function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function readFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/))
      .filter(Boolean)
      .map((entry) => [entry[1], entry[2].replace(/^['"]|['"]$/g, "")]),
  );
}

const errors = [];
const markdownFiles = collectMarkdownFiles(root);

for (const file of markdownFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/.test(rawTarget)) continue;
    const localTarget = decodeURIComponent(rawTarget.split("#", 1)[0]);
    if (!localTarget) continue;
    const resolved = path.resolve(path.dirname(file), localTarget);
    if (!fs.existsSync(resolved)) {
      errors.push(`${relative(file)} links to missing ${rawTarget}`);
    }
  }
}

const taskIds = new Map();
for (const area of ["active", "blocked", "done"]) {
  const directory = path.join(root, "work", area);
  if (!fs.existsSync(directory)) continue;
  for (const file of collectMarkdownFiles(directory)) {
    const source = fs.readFileSync(file, "utf8");
    const metadata = readFrontmatter(source);
    if (!metadata) {
      errors.push(`${relative(file)} has no task frontmatter`);
      continue;
    }
    if (metadata.status !== area) {
      errors.push(`${relative(file)} has status ${metadata.status || "<missing>"}; expected ${area}`);
    }
    if (area === "done" && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.completed ?? "")) {
      errors.push(`${relative(file)} is done but has no valid completed date`);
    }
    if (area !== "done" && metadata.completed) {
      errors.push(`${relative(file)} is ${area} but already has completed: ${metadata.completed}`);
    }
    if (metadata.id) {
      const previous = taskIds.get(metadata.id);
      if (previous) errors.push(`${relative(file)} duplicates task id ${metadata.id} from ${previous}`);
      else taskIds.set(metadata.id, relative(file));
    }
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const cargoToml = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
for (const [owner, version] of [
  ["src-tauri/Cargo.toml", cargoVersion],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
]) {
  if (version !== packageJson.version) {
    errors.push(`${owner} version ${version || "<missing>"} differs from package.json ${packageJson.version}`);
  }
}
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
for (const expected of [packageJson.version, packageJson.packageManager, packageJson.engines.node]) {
  if (!readme.includes(expected)) errors.push(`README.md must mention current package metadata: ${expected}`);
}

if (errors.length > 0) {
  process.stderr.write(`Documentation check failed:\n- ${errors.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Documentation check passed over ${markdownFiles.length} Markdown files and ${taskIds.size} task ids.\n`,
  );
}

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cruiserBin = path.join(repositoryRoot, "node_modules", "dependency-cruiser", "bin", "dependency-cruise.mjs");
const configPath = path.join(repositoryRoot, ".dependency-cruiser.mjs");

function normalize(filePath) {
  return filePath.replaceAll("\\", "/");
}

function isTestFile(filePath) {
  return /(?:^|\/)(?:test-fixtures|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(filePath);
}

function featureOwner(filePath) {
  return normalize(filePath).match(/(?:^|\/)features\/([^/]+)\//)?.[1] ?? null;
}

/** `ui` or `i18n` for anything inside `shared/<module>/`. */
function sharedOwner(filePath) {
  return normalize(filePath).match(/(?:^|\/)shared\/([^/]+)\//)?.[1] ?? null;
}

function isPublicEntry(filePath) {
  return /\/index\.[cm]?[jt]sx?$/.test(normalize(filePath));
}

function isTypeOnly(dependency) {
  return dependency.dependencyTypes?.some((kind) => kind === "type-only" || kind === "type-import") ?? false;
}

function isDynamic(dependency) {
  return dependency.dynamic || dependency.dependencyTypes?.includes("dynamic-import");
}

export function findArchitectureViolations(cruiseResult) {
  const violations = [];
  const productionStaticGraph = new Map();

  for (const module of cruiseResult.modules ?? []) {
    const source = normalize(module.source);
    const sourceIsTest = isTestFile(source);
    const sourceOwner = featureOwner(source);
    const staticTargets = [];

    for (const dependency of module.dependencies ?? []) {
      const target = normalize(dependency.resolved || dependency.module || "");
      const targetIsTest = isTestFile(target);
      const targetOwner = featureOwner(target);

      if (!sourceIsTest && targetIsTest) {
        violations.push(`Production module ${source} imports test-only module ${target}.`);
      }
      if (
        sourceOwner &&
        /(?:^|\/)(?:src|architecture-fixtures)\/(?:app\/|bootstrap\.[jt]sx?$|main\.[jt]sx?$|screens\.[jt]sx?$)/.test(target)
      ) {
        violations.push(
          `Feature "${sourceOwner}" owns ${source} and may not import app composition ${target}. ` +
            "Depend on the neutral runtime contract or an owning feature public API.",
        );
      }
      if (sourceOwner && targetOwner && sourceOwner !== targetOwner && !/(?:^|\/)features\/[^/]+\/index\.[jt]sx?$/.test(target)) {
        violations.push(
          `Feature "${sourceOwner}" imports internal module ${target} owned by feature "${targetOwner}". ` +
            `Import features/${targetOwner}/index.ts instead.`,
        );
      }
      // A feature takes a shared module through its public entry point, so a
      // primitive can be reshaped without hunting for deep imports.
      //
      // Scoped to features on purpose, exactly like the rule above. The app
      // shell imports primitives by file because the barrel would otherwise
      // pull every primitive into the entry chunk: `shared/ui/index.ts` is
      // imported by lazy feature chunks too, and one shared module reachable
      // from both ends up eagerly bundled. Measured, not assumed — routing
      // `main.tsx` through the barrel moved popupMenu's 1.8 kB into the entry
      // and left 0.45 kB under the task-023 warning.
      //
      // Stylesheets are exempt because `styles.css` is a deliberate, tested
      // cascade manifest that names files directly.
      const targetShared = sharedOwner(target);
      if (
        sourceOwner &&
        targetShared &&
        sharedOwner(source) !== targetShared &&
        !isPublicEntry(target) &&
        !/\.css$/.test(target)
      ) {
        violations.push(
          `Feature "${sourceOwner}" imports internal module ${target} owned by shared/${targetShared}. ` +
            `Import shared/${targetShared}/index.ts instead.`,
        );
      }
      if (!sourceIsTest && dependency.circular && !isTypeOnly(dependency)) {
        violations.push(`Production cycle: ${source} -> ${target}. Move orchestration to the owning module.`);
      }
      if (!sourceIsTest && !targetIsTest && !isTypeOnly(dependency) && !isDynamic(dependency) && target) {
        staticTargets.push(target);
      }
    }
    productionStaticGraph.set(source, staticTargets);
  }

  const entry = [...productionStaticGraph.keys()].find((source) => /(?:^|\/)src\/bootstrap\.tsx$/.test(source));
  if (entry) {
    const queue = [entry];
    const previous = new Map([[entry, null]]);
    while (queue.length > 0) {
      const source = queue.shift();
      for (const target of productionStaticGraph.get(source) ?? []) {
        if (previous.has(target)) continue;
        previous.set(target, source);
        queue.push(target);
      }
    }
    const fileIcons = [...previous.keys()].find((source) => /(?:^|\/)src\/fileIcons\.tsx?$/.test(source));
    if (fileIcons) {
      const pathToIcons = [];
      for (let current = fileIcons; current; current = previous.get(current)) pathToIcons.unshift(current);
      violations.push(`Entry chunk has a static path to fileIcons: ${pathToIcons.join(" -> ")}. Keep the icon set deferred.`);
    }
  }

  return [...new Set(violations)];
}

function cruise(target, useConfig) {
  const args = [cruiserBin, "--output-type", "json"];
  if (useConfig) args.push("--config", configPath);
  else args.push("--no-config");
  args.push(target);
  const result = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (!result.stdout) {
    throw new Error(result.stderr || `dependency-cruiser exited ${result.status}`);
  }
  const graph = JSON.parse(result.stdout);
  const configuredErrors = graph.summary?.error ?? 0;
  if (configuredErrors > 0) {
    throw new Error(`dependency-cruiser reported ${configuredErrors} configured error(s).\n${result.stderr}`);
  }
  return graph;
}

function main() {
  const actual = cruise("src", true);
  const violations = findArchitectureViolations(actual);
  if (violations.length > 0) {
    process.stderr.write(`Frontend architecture check failed:\n- ${violations.join("\n- ")}\n`);
    process.exitCode = 1;
    return;
  }

  // Every rule that protects a boundary carries a seeded violation, because a
  // rule nobody has seen fail is a rule nobody knows still works.
  const seeded = cruise("scripts/architecture-fixtures", false);
  const seededViolations = findArchitectureViolations(seeded);
  const selfTests = [
    {
      label: "feature -> app composition",
      match: (message) =>
        message.includes('Feature "history" owns') && message.includes("may not import app composition"),
    },
    {
      label: "deep import past shared/ui",
      match: (message) => message.includes("owned by shared/ui"),
    },
    {
      label: "production -> test-only module",
      match: (message) => message.includes("imports test-only module"),
    },
  ];
  const reported = [];
  for (const selfTest of selfTests) {
    const found = seededViolations.find(selfTest.match);
    if (!found) {
      process.stderr.write(
        `Frontend architecture guard self-test failed: the seeded ${selfTest.label} edge was not reported.\n`,
      );
      process.exitCode = 1;
      return;
    }
    reported.push(found);
  }

  process.stdout.write(
    `Frontend architecture check passed. Seeded guards:\n- ${reported.join("\n- ")}\n`,
  );
}

main();

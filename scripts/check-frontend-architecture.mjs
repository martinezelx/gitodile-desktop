import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

function isFeatureTauriAdapter(filePath) {
  return /(?:^|\/)features\/[^/]+\/tauriAdapter\.[cm]?[jt]sx?$/.test(normalize(filePath));
}

function isTauriApiDependency(dependency) {
  return /^@tauri-apps\/api(?:\/|$)/.test(dependency.module);
}

function isDynamic(dependency) {
  return dependency.dynamic || dependency.dependencyTypes?.includes("dynamic-import");
}

/**
 * Cross-feature edges allowed against the ownership rule, each with a reason.
 *
 * Keep this list at zero or near it. An entry is a debt, not a pattern: it says
 * two rules disagree and the code has not been reshaped yet.
 */
const ALLOWED_FEATURE_EDGES = [];

function isAllowedFeatureEdge(source, target) {
  return ALLOWED_FEATURE_EDGES.some((edge) => edge.from.test(source) && edge.to.test(target));
}

/** `->` rather than a raw separator byte: paths never contain it, and it keeps
 * this file readable to `grep`, which reports a NUL as a binary match. */
const edgeKey = (from, to) => `${normalize(from)}->${normalize(to)}`;

export function findArchitectureViolations(cruiseResult) {
  const violations = [];
  const productionStaticGraph = new Map();
  const modules = cruiseResult.modules ?? [];

  // Pass one classifies every edge, for two reasons.
  //
  // An edge is erased only if **every** import of it is type-only.
  // dependency-cruiser reports one record per import statement, so a specifier
  // imported both ways — `import { useEffect } from "react"` beside
  // `import type React from "react"` — arrives as two records, one flagged
  // `type-only` and one not. Reading a single record would erase an edge the
  // bundler still follows.
  //
  // And a cycle is real only if every hop in it survives compilation. The
  // `circular` flag is computed over a graph where erased imports still connect
  // modules, so a genuine runtime edge is reported as circular when the path
  // *home* runs through an `import type`. Checking only the reported edge left
  // 46 such cycles standing when this was written.
  const erasedEdges = new Map();
  for (const module of modules) {
    for (const dependency of module.dependencies ?? []) {
      const key = edgeKey(module.source, dependency.resolved || dependency.module || "");
      const typeOnly = dependency.dependencyTypes?.includes("type-only") ?? false;
      erasedEdges.set(key, (erasedEdges.get(key) ?? true) && typeOnly);
    }
  }
  const typeOnlyEdges = new Set(
    [...erasedEdges].filter(([, isErased]) => isErased).map(([key]) => key),
  );

  /** A cycle survives compilation only if no hop in it was erased. */
  const isRuntimeCycle = (source, cycle) => {
    const hops = [normalize(source), ...(cycle ?? []).map((hop) => normalize(hop.name))];
    for (let index = 0; index < hops.length - 1; index += 1) {
      if (typeOnlyEdges.has(edgeKey(hops[index], hops[index + 1]))) return false;
    }
    return true;
  };

  for (const module of modules) {
    const source = normalize(module.source);
    const sourceIsTest = isTestFile(source);
    const sourceOwner = featureOwner(source);
    const staticTargets = [];

    for (const dependency of module.dependencies ?? []) {
      const target = normalize(dependency.resolved || dependency.module || "");
      const isTypeOnlyEdge = typeOnlyEdges.has(edgeKey(module.source, dependency.resolved || dependency.module || ""));
      const targetIsTest = isTestFile(target);
      const targetOwner = featureOwner(target);

      if (!sourceIsTest && targetIsTest) {
        violations.push(`Production module ${source} imports test-only module ${target}.`);
      }
      if (
        sourceOwner &&
        !sourceIsTest &&
        isTauriApiDependency(dependency) &&
        !isFeatureTauriAdapter(source)
      ) {
        violations.push(
          `Feature "${sourceOwner}" owns ${source} and may import @tauri-apps/api only from ` +
            `features/${sourceOwner}/tauriAdapter.ts. Depend on the feature's typed port elsewhere.`,
        );
      }
      if (
        sourceOwner &&
        /(?:^|\/)(?:src|architecture-fixtures)\/(?:app\/|bootstrap\.[jt]sx?$)/.test(target)
      ) {
        violations.push(
          `Feature "${sourceOwner}" owns ${source} and may not import app composition ${target}. ` +
            "Depend on the neutral runtime contract or an owning feature public API.",
        );
      }
      if (
        sourceOwner &&
        targetOwner &&
        sourceOwner !== targetOwner &&
        !/(?:^|\/)features\/[^/]+\/index\.[jt]sx?$/.test(target) &&
        !isAllowedFeatureEdge(source, target)
      ) {
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
      // `app/App.tsx` through the barrel moved popupMenu's 1.8 kB into the entry
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
      // Cycle and bundle-eagerness rules use runtime edges only; ownership
      // rules above deliberately apply to type imports too (ADR 0003).
      if (!sourceIsTest && dependency.circular && !isTypeOnlyEdge && isRuntimeCycle(module.source, dependency.cycle)) {
        violations.push(`Production cycle: ${source} -> ${target}. Move orchestration to the owning module.`);
      }
      if (!sourceIsTest && !targetIsTest && !isTypeOnlyEdge && !isDynamic(dependency) && target) {
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
    const fileIcons = [...previous.keys()].find((source) =>
      /(?:^|\/)src\/shared\/file-icons\/index\.tsx?$/.test(source),
    );
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
    // The dependency graph is a JSON document of every cruised module and its
    // edges. It passed Node's 1 MB default once already and truncated the
    // output mid-string, so the ceiling is deliberately generous rather than a
    // limit the graph can quietly outgrow.
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`dependency-cruiser could not be run: ${result.error.message}`);
  }
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

/** dependency-cruiser scans this directory using the TypeScript compiler. It
 * cruised **zero** modules until task 049 put the project back on a TypeScript
 * version it can load, so the floor below stays: a target that stops matching
 * must fail loudly instead of passing every rule vacuously. */
const SOURCE_TARGET = "src";
const MINIMUM_EXPECTED_MODULES = 150;

function main() {
  const actual = cruise(SOURCE_TARGET, true);
  const cruised = (actual.modules ?? []).length;
  if (cruised < MINIMUM_EXPECTED_MODULES) {
    process.stderr.write(
      `Frontend architecture check aborted: cruised ${cruised} modules, expected at least ` +
        `${MINIMUM_EXPECTED_MODULES}. The target "${SOURCE_TARGET}" is matching almost nothing, ` +
        "which would make every rule below pass without inspecting anything.\n",
    );
    process.exitCode = 1;
    return;
  }
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
      label: "cross-feature internal import",
      match: (message) =>
        message.includes('Feature "overview" imports internal module') &&
        message.includes('feature "changes"'),
    },
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
    {
      label: "feature transport outside tauriAdapter",
      match: (message) =>
        message.includes('Feature "history" owns') && message.includes("may import @tauri-apps/api only from"),
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
    `Frontend architecture check passed over ${cruised} modules. Seeded guards:\n- ${reported.join("\n- ")}\n`,
  );
}

// Importable for tests and tooling; only the CLI entry runs the check.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

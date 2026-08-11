/** Types for the architecture guard, so its rules can be unit-tested from
 * `src/` without weakening `strict` there. The script itself stays plain
 * JavaScript: it runs from `package.json` with no build step. */

export type CruiseDependency = {
  /** The specifier as written, which is how a type-only import is matched. */
  module: string;
  resolved?: string;
  circular?: boolean;
  /** Path from this edge's target back to its source. */
  cycle?: { name: string }[];
  dynamic?: boolean;
  dependencyTypes?: string[];
};

export type CruiseModule = {
  source: string;
  dependencies?: CruiseDependency[];
};

export type CruiseResult = { modules?: CruiseModule[] };

/** `null` when the file cannot be read; the caller then assumes no type-only
 * imports, which is the conservative direction. */
export type ReadSource = (file: string) => string | null;

export function findArchitectureViolations(
  cruiseResult: CruiseResult,
  readSource?: ReadSource,
): string[];

/** Types for the architecture guard, so its rules can be unit-tested from
 * `src/` without weakening `strict` there. The script itself stays plain
 * JavaScript: it runs from `package.json` with no build step. */

export type CruiseDependency = {
  /** The specifier as written. */
  module: string;
  resolved?: string;
  circular?: boolean;
  /** Path from this edge's target back to its source. */
  cycle?: { name: string }[];
  dynamic?: boolean;
  /**
   * Includes `type-only` when this particular import was erased at compile
   * time. One record per import statement, so a specifier imported both as a
   * type and as a value produces two records and only one carries the flag.
   */
  dependencyTypes?: string[];
};

export type CruiseModule = {
  source: string;
  dependencies?: CruiseDependency[];
};

export type CruiseResult = { modules?: CruiseModule[] };

export function findArchitectureViolations(cruiseResult: CruiseResult): string[];

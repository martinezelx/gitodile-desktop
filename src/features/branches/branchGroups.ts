import type { Branch } from "./domain";
import { deletabilityOf } from "./branchActions";

/** The two blocks the Branches list is cut into under the branches it pins. They are
 * cut by what the reader can do with a branch, not by its name: one block is
 * still work, the other is safe to clear away. The names come back *inside*
 * each block, as prefix clusters. */
export type BranchBucketKey = "in-progress" | "clean-up";

/** Branches in one bucket that share a first name segment (`feature/…`). */
export type BranchCluster = { prefix: string; branches: Branch[] };

export type BranchBucket = {
  key: BranchBucketKey;
  count: number;
  /** Branches whose prefix nobody else in this bucket shares, or that have none.
   * A heading over a single row is a second row saying the same thing. */
  loose: Branch[];
  clusters: BranchCluster[];
};

export type GroupedBranches = {
  /** Where the project is, then the main branch: the two rows the reader looks
   * for first, above every block and without a heading. */
  pinned: Branch[];
  buckets: BranchBucket[];
};

const BUCKET_ORDER: readonly BranchBucketKey[] = ["in-progress", "clean-up"];

/** Which block a branch belongs in, or `null` for the pinned rows. A branch is
 * ready to clean up when it is finished — its work is on the main branch and
 * was its own (Rust's `finished_branches`) — and could be deleted from here. Not
 * merely when deleting it would lose nothing: a published branch in progress
 * is kept by its own remote copy, and is still in progress. */
export function bucketOf(branch: Branch): BranchBucketKey | null {
  if (branch.isActive || branch.isDefault) return null;
  return branch.isFinished && deletabilityOf(branch) === "ready" ? "clean-up" : "in-progress";
}

/** The first segment of a branch's name, or `null` when it has none. */
export function prefixOf(name: string): string | null {
  const slash = name.indexOf("/");
  return slash > 0 ? name.slice(0, slash) : null;
}

/** Groups branches that are already filtered and sorted. Order is kept
 * everywhere — inside a cluster, and between clusters, which follow their
 * first branch — so the reader's sort still decides what comes first. */
export function groupBranches(active: Branch | null, others: readonly Branch[]): GroupedBranches {
  const pinned = [...(active ? [active] : []), ...others.filter((branch) => !branch.isActive && branch.isDefault)];
  const buckets: BranchBucket[] = [];
  for (const key of BUCKET_ORDER) {
    const branches = others.filter((branch) => bucketOf(branch) === key);
    if (branches.length === 0) continue;
    const counts = new Map<string, number>();
    for (const branch of branches) {
      const prefix = prefixOf(branch.name);
      if (prefix !== null) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    const loose: Branch[] = [];
    const clusters = new Map<string, Branch[]>();
    for (const branch of branches) {
      const prefix = prefixOf(branch.name);
      if (prefix === null || (counts.get(prefix) ?? 0) < 2) {
        loose.push(branch);
      } else {
        const cluster = clusters.get(prefix);
        if (cluster) cluster.push(branch);
        else clusters.set(prefix, [branch]);
      }
    }
    buckets.push({
      key,
      count: branches.length,
      loose,
      clusters: [...clusters].map(([prefix, clustered]) => ({ prefix, branches: clustered })),
    });
  }
  return { pinned, buckets };
}

export const bucketItemId = (key: BranchBucketKey): string => `bucket:${key}`;
export const clusterItemId = (key: BranchBucketKey, prefix: string): string => `cluster:${key}:${prefix}`;

/** A cluster this long starts folded: one prefix with a crowd of branches
 * (`dependabot/…`) would otherwise push everything else out of the column. */
export const LARGE_CLUSTER_SIZE = 8;

/** A branch's name in two parts: the quiet part the eye can skip, and its own
 * last segment. Inside a cluster the cluster's prefix is dropped — its
 * heading already says it — and only any middle part stays, quiet. */
export function branchNameParts(name: string, clusterPrefix: string | null): { quiet: string; own: string } {
  const rest = clusterPrefix !== null && name.startsWith(`${clusterPrefix}/`) ? name.slice(clusterPrefix.length + 1) : name;
  const slash = rest.lastIndexOf("/");
  return { quiet: rest.slice(0, slash + 1), own: rest.slice(slash + 1) };
}

export type BranchTreeItem =
  | {
      kind: "branch";
      id: string;
      branch: Branch;
      level: number;
      parentId: string | null;
      clusterPrefix: string | null;
    }
  | { kind: "bucket"; id: string; key: BranchBucketKey; count: number; level: 1; parentId: null; expanded: boolean }
  | {
      kind: "cluster";
      id: string;
      key: BranchBucketKey;
      prefix: string;
      count: number;
      level: 2;
      parentId: string;
      expanded: boolean;
    };

/** The rows a tree draws and the keyboard walks, top to bottom: everything
 * that is not inside a collapsed heading.
 *
 * `isExpanded` is told how each heading opens before the reader touches it:
 * work in progress opens, what is safe to clear away is a count until it is
 * asked for, and so is a cluster of more than `LARGE_CLUSTER_SIZE` branches. */
export function visibleBranchTree(
  grouped: GroupedBranches,
  isExpanded: (id: string, byDefault: boolean) => boolean,
  branchId: (name: string) => string,
): BranchTreeItem[] {
  const items: BranchTreeItem[] = grouped.pinned.map((branch) => ({
    kind: "branch",
    id: branchId(branch.name),
    branch,
    level: 1,
    parentId: null,
    clusterPrefix: null,
  }));
  for (const bucket of grouped.buckets) {
    const id = bucketItemId(bucket.key);
    const expanded = isExpanded(id, bucket.key !== "clean-up");
    items.push({ kind: "bucket", id, key: bucket.key, count: bucket.count, level: 1, parentId: null, expanded });
    if (!expanded) continue;
    for (const branch of bucket.loose) {
      items.push({ kind: "branch", id: branchId(branch.name), branch, level: 2, parentId: id, clusterPrefix: null });
    }
    for (const cluster of bucket.clusters) {
      const clusterId = clusterItemId(bucket.key, cluster.prefix);
      const clusterExpanded = isExpanded(clusterId, cluster.branches.length <= LARGE_CLUSTER_SIZE);
      items.push({
        kind: "cluster",
        id: clusterId,
        key: bucket.key,
        prefix: cluster.prefix,
        count: cluster.branches.length,
        level: 2,
        parentId: id,
        expanded: clusterExpanded,
      });
      if (!clusterExpanded) continue;
      for (const branch of cluster.branches) {
        items.push({
          kind: "branch",
          id: branchId(branch.name),
          branch,
          level: 3,
          parentId: clusterId,
          clusterPrefix: cluster.prefix,
        });
      }
    }
  }
  return items;
}

/** The headings a branch sits under, outermost first — what has to be open for
 * its row to be drawn. Empty for a pinned branch or one not in `grouped`. */
export function headingsAbove(grouped: GroupedBranches, name: string): string[] {
  for (const bucket of grouped.buckets) {
    if (bucket.loose.some((branch) => branch.name === name)) return [bucketItemId(bucket.key)];
    const cluster = bucket.clusters.find((entry) => entry.branches.some((branch) => branch.name === name));
    if (cluster) return [bucketItemId(bucket.key), clusterItemId(bucket.key, cluster.prefix)];
  }
  return [];
}

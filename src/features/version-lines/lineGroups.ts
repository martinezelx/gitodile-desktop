import type { VersionLine } from "./domain";
import { deletabilityOf } from "./lineActions";

/** The two blocks the Lines list is cut into under the lines it pins. They are
 * cut by what the reader can do with a line, not by its name: one block is
 * still work, the other is safe to clear away. The names come back *inside*
 * each block, as prefix clusters. */
export type LineBucketKey = "in-progress" | "clean-up";

/** Lines in one bucket that share a first name segment (`feature/…`). */
export type LineCluster = { prefix: string; lines: VersionLine[] };

export type LineBucket = {
  key: LineBucketKey;
  count: number;
  /** Lines whose prefix nobody else in this bucket shares, or that have none.
   * A heading over a single row is a second row saying the same thing. */
  loose: VersionLine[];
  clusters: LineCluster[];
};

export type GroupedVersionLines = {
  /** Where the project is, then the main line: the two rows the reader looks
   * for first, above every block and without a heading. */
  pinned: VersionLine[];
  buckets: LineBucket[];
};

const BUCKET_ORDER: readonly LineBucketKey[] = ["in-progress", "clean-up"];

/** Which block a line belongs in, or `null` for the pinned rows. A line is
 * ready to clean up when it is finished — its work is on the main line and
 * was its own (Rust's `finished_lines`) — and could be deleted from here. Not
 * merely when deleting it would lose nothing: a published line in progress
 * is kept by its own remote copy, and is still in progress. */
export function bucketOf(line: VersionLine): LineBucketKey | null {
  if (line.isActive || line.isDefault) return null;
  return line.isFinished && deletabilityOf(line) === "ready" ? "clean-up" : "in-progress";
}

/** The first segment of a line's name, or `null` when it has none. */
export function prefixOf(name: string): string | null {
  const slash = name.indexOf("/");
  return slash > 0 ? name.slice(0, slash) : null;
}

/** Groups lines that are already filtered and sorted. Order is kept
 * everywhere — inside a cluster, and between clusters, which follow their
 * first line — so the reader's sort still decides what comes first. */
export function groupVersionLines(active: VersionLine | null, others: readonly VersionLine[]): GroupedVersionLines {
  const pinned = [...(active ? [active] : []), ...others.filter((line) => !line.isActive && line.isDefault)];
  const buckets: LineBucket[] = [];
  for (const key of BUCKET_ORDER) {
    const lines = others.filter((line) => bucketOf(line) === key);
    if (lines.length === 0) continue;
    const counts = new Map<string, number>();
    for (const line of lines) {
      const prefix = prefixOf(line.name);
      if (prefix !== null) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    const loose: VersionLine[] = [];
    const clusters = new Map<string, VersionLine[]>();
    for (const line of lines) {
      const prefix = prefixOf(line.name);
      if (prefix === null || (counts.get(prefix) ?? 0) < 2) {
        loose.push(line);
      } else {
        const cluster = clusters.get(prefix);
        if (cluster) cluster.push(line);
        else clusters.set(prefix, [line]);
      }
    }
    buckets.push({
      key,
      count: lines.length,
      loose,
      clusters: [...clusters].map(([prefix, clustered]) => ({ prefix, lines: clustered })),
    });
  }
  return { pinned, buckets };
}

export const bucketItemId = (key: LineBucketKey): string => `bucket:${key}`;
export const clusterItemId = (key: LineBucketKey, prefix: string): string => `cluster:${key}:${prefix}`;

/** A cluster this long starts folded: one prefix with a crowd of lines
 * (`dependabot/…`) would otherwise push everything else out of the column. */
export const LARGE_CLUSTER_SIZE = 8;

/** A line's name in two parts: the quiet part the eye can skip, and its own
 * last segment. Inside a cluster the cluster's prefix is dropped — its
 * heading already says it — and only any middle part stays, quiet. */
export function lineNameParts(name: string, clusterPrefix: string | null): { quiet: string; own: string } {
  const rest = clusterPrefix !== null && name.startsWith(`${clusterPrefix}/`) ? name.slice(clusterPrefix.length + 1) : name;
  const slash = rest.lastIndexOf("/");
  return { quiet: rest.slice(0, slash + 1), own: rest.slice(slash + 1) };
}

export type LineTreeItem =
  | {
      kind: "line";
      id: string;
      line: VersionLine;
      level: number;
      parentId: string | null;
      clusterPrefix: string | null;
    }
  | { kind: "bucket"; id: string; key: LineBucketKey; count: number; level: 1; parentId: null; expanded: boolean }
  | {
      kind: "cluster";
      id: string;
      key: LineBucketKey;
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
 * asked for, and so is a cluster of more than `LARGE_CLUSTER_SIZE` lines. */
export function visibleLineTree(
  grouped: GroupedVersionLines,
  isExpanded: (id: string, byDefault: boolean) => boolean,
  lineId: (name: string) => string,
): LineTreeItem[] {
  const items: LineTreeItem[] = grouped.pinned.map((line) => ({
    kind: "line",
    id: lineId(line.name),
    line,
    level: 1,
    parentId: null,
    clusterPrefix: null,
  }));
  for (const bucket of grouped.buckets) {
    const id = bucketItemId(bucket.key);
    const expanded = isExpanded(id, bucket.key !== "clean-up");
    items.push({ kind: "bucket", id, key: bucket.key, count: bucket.count, level: 1, parentId: null, expanded });
    if (!expanded) continue;
    for (const line of bucket.loose) {
      items.push({ kind: "line", id: lineId(line.name), line, level: 2, parentId: id, clusterPrefix: null });
    }
    for (const cluster of bucket.clusters) {
      const clusterId = clusterItemId(bucket.key, cluster.prefix);
      const clusterExpanded = isExpanded(clusterId, cluster.lines.length <= LARGE_CLUSTER_SIZE);
      items.push({
        kind: "cluster",
        id: clusterId,
        key: bucket.key,
        prefix: cluster.prefix,
        count: cluster.lines.length,
        level: 2,
        parentId: id,
        expanded: clusterExpanded,
      });
      if (!clusterExpanded) continue;
      for (const line of cluster.lines) {
        items.push({
          kind: "line",
          id: lineId(line.name),
          line,
          level: 3,
          parentId: clusterId,
          clusterPrefix: cluster.prefix,
        });
      }
    }
  }
  return items;
}

/** The headings a line sits under, outermost first — what has to be open for
 * its row to be drawn. Empty for a pinned line or one not in `grouped`. */
export function headingsAbove(grouped: GroupedVersionLines, name: string): string[] {
  for (const bucket of grouped.buckets) {
    if (bucket.loose.some((line) => line.name === name)) return [bucketItemId(bucket.key)];
    const cluster = bucket.clusters.find((entry) => entry.lines.some((line) => line.name === name));
    if (cluster) return [bucketItemId(bucket.key), clusterItemId(bucket.key, cluster.prefix)];
  }
  return [];
}

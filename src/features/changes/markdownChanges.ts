import { diffArrays, diffLines } from "diff";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Definition, List, Nodes, Root, RootContent } from "mdast";
import type { DiffHunk } from "./domain";

export type MarkdownChanges = { removed: Set<number>; added: Set<number> };

/** Compare the complete texts independently of cached/truncated diff hunks.
 * Bound Myers' worst case; a refusal must never look like an unchanged file. */
export function compareMarkdown(before: string | null, after: string | null): MarkdownChanges | null {
  const parts = diffLines(before ?? "", after ?? "", {
    stripTrailingCr: true, ignoreNewlineAtEof: true, timeout: 60, maxEditLength: 4000,
  });
  if (!parts) return null;
  const removed = new Set<number>();
  const added = new Set<number>();
  let oldLine = 1;
  let newLine = 1;
  for (const part of parts) {
    const count = part.count;
    if (part.removed) {
      for (let offset = 0; offset < count; offset++) removed.add(oldLine + offset);
      oldLine += count;
    } else if (part.added) {
      for (let offset = 0; offset < count; offset++) added.add(newLine + offset);
      newLine += count;
    } else {
      oldLine += count;
      newLine += count;
    }
  }
  return { removed, added };
}

const BLOCKS = new Set(["paragraph", "heading", "listItem", "tableRow", "code", "thematicBreak"]);

function walk(node: Nodes, visit: (node: Nodes) => void, depth = 0): void {
  if (depth > 80) throw new ComparisonLimit();
  visit(node);
  if ("children" in node) node.children.forEach((child) => walk(child, visit, depth + 1));
}

function mark(node: Nodes, tone: "added" | "removed"): void {
  if (BLOCKS.has(node.type)) {
    node.data ??= {};
    node.data.hProperties = {
      ...node.data.hProperties,
      className: [`markdown-preview__${tone}`, ...(node.type === "listItem" && typeof node.checked === "boolean" ? ["task-list-item"] : [])],
    };
  } else if ("children" in node) {
    node.children.forEach((child) => mark(child, tone));
  }
}

const parser = unified().use(remarkParse).use(remarkGfm);
class ComparisonLimit extends Error {}

/** Parse each complete version first. Resolve reference links/images within
 * their own version, then namespace footnotes so a removed reference cannot
 * accidentally use the current document's definition. Keys are captured before
 * namespacing, allowing unchanged context to be shared. */
function prepare(source: string, side: string, keys: WeakMap<Nodes, string>): Root {
  // Normalise before parsing as well as comparing raw slices: multiline
  // text/code values otherwise retain CRLF and create false semantic edits.
  source = source.replace(/\r\n/g, "\n");
  const deadline = Date.now() + 150;
  const root = parser.parse(source);
  const definitions = new Map<string, Definition>();
  const footnotes = new Map<string, string>();
  const serialise = (node: Nodes): string => JSON.stringify(node, (key, value: unknown) => key === "position" || key === "data" ? undefined : value);
  walk(root, (node) => {
    if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node);
  });
  walk(root, (parent) => {
    if (!("children" in parent)) return;
    // Only phrasing references are replaced, by the corresponding phrasing
    // link/image. Every container retains the child types its parser produced.
    const children = parent.children as RootContent[];
    children.forEach((node, index) => {
      if (node.type !== "linkReference" && node.type !== "imageReference") return;
      const definition = definitions.get(node.identifier);
      if (!definition) return;
      children[index] = node.type === "linkReference"
        ? { type: "link", children: node.children, url: definition.url, title: definition.title, position: node.position }
        : { type: "image", alt: node.alt, url: definition.url, title: definition.title, position: node.position };
    });
  });
  walk(root, (node) => {
    if (node.type === "footnoteDefinition" && !footnotes.has(node.identifier)) footnotes.set(node.identifier, serialise(node));
  });
  walk(root, (node) => {
    if (Date.now() > deadline) throw new ComparisonLimit();
    if (!BLOCKS.has(node.type) && node.type !== "list" && node.type !== "blockquote" && node.type !== "table") return;
    const raw = source.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0).replace(/\r\n/g, "\n");
    const semantic = JSON.stringify(node, (key, value: unknown) => {
      if (key === "position" || key === "data") return undefined;
      if (value !== null && typeof value === "object" && "type" in value && value.type === "footnoteReference" && "identifier" in value && typeof value.identifier === "string") {
        return { ...value, definitionContent: footnotes.get(value.identifier) };
      }
      return value;
    });
    keys.set(node, `${raw}\0${semantic}`);
  });
  walk(root, (node) => {
    if (node.type === "footnoteReference" || node.type === "footnoteDefinition") node.identifier = `${side}-${node.identifier}`;
  });
  return root;
}

export type UnifiedMarkdown = MarkdownChanges & { tree: Root; changeCount: number };

/** Consecutive removed/added blocks form one stop. Descend through unchanged
 * containers, but never create a second stop inside an already marked item. */
function anchorChanges(tree: Root, offset = 0): number {
  let count = offset;
  let changing = false;
  const visit = (node: Nodes): void => {
    const classes = node.data?.hProperties?.className;
    const changed = Array.isArray(classes) && classes.some((value) => value === "markdown-preview__added" || value === "markdown-preview__removed");
    if (changed) {
      if (!changing) {
        node.data!.hProperties!["data-markdown-change"] = String(count++);
      }
      changing = true;
      return;
    }
    if (BLOCKS.has(node.type) && node.type !== "listItem") changing = false;
    if ("children" in node) node.children.forEach(visit);
  };
  // Footnotes render after the body, regardless of their source position.
  const body = tree.children.filter((node) => node.type !== "footnoteDefinition");
  body.forEach(visit);
  const references = new Set<string>();
  const collect = (node: Nodes): void => { if (node.type === "footnoteReference") references.add(node.identifier); };
  body.forEach((node) => walk(node, collect));
  const notes = new Map<string, Nodes>();
  for (const node of tree.children) if (node.type === "footnoteDefinition" && !notes.has(node.identifier)) notes.set(node.identifier, node);
  for (const reference of references) {
    const note = notes.get(reference);
    if (note) { changing = false; visit(note); walk(note, collect); }
  }
  return count - offset;
}

export function buildUnifiedMarkdown(before: string | null, after: string | null): UnifiedMarkdown | null {
  const changes = compareMarkdown(before, after);
  if (!changes) return null;
  try {
    const keys = new WeakMap<Nodes, string>();
    const previous = prepare(before ?? "", "removed", keys);
    const current = prepare(after ?? "", "current", keys);
    const deadline = Date.now() + 60;
    const key = (node: Nodes): string => keys.get(node) ?? "";
    const compatible = (oldNode: RootContent, newNode: RootContent): boolean => {
      if (oldNode.type === "list" && newNode.type === "list") return oldNode.ordered === newNode.ordered && oldNode.start === newNode.start;
      if (oldNode.type === "blockquote" && newNode.type === "blockquote") return true;
      if (oldNode.type === "listItem" && newNode.type === "listItem") return oldNode.checked === newNode.checked && [...oldNode.children, ...newNode.children].some((child) => child.type === "list" || child.type === "blockquote");
      return oldNode.type === "table" && newNode.type === "table" && key(oldNode.children[0]) === key(newNode.children[0]) && JSON.stringify(oldNode.align) === JSON.stringify(newNode.align);
    };

    const merge = <Child extends RootContent>(oldNodes: Child[], newNodes: Child[]): Child[] => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new ComparisonLimit();
      const parts = diffArrays(oldNodes, newNodes, {
        comparator: (oldNode, newNode) => key(oldNode) === key(newNode), timeout: remaining, maxEditLength: 4000,
      });
      if (!parts) throw new ComparisonLimit();
      const result: Child[] = [];
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        const next = parts[index + 1];
        if (part.removed && next?.added) {
          let oldIndex = 0;
          let newIndex = 0;
          while (oldIndex < part.value.length || newIndex < next.value.length) {
            if (Date.now() > deadline) throw new ComparisonLimit();
            const oldNode = part.value[oldIndex];
            const newNode = next.value[newIndex];
            if (!oldNode) { mark(newNode, "added"); result.push(newNode); newIndex++; continue; }
            if (!newNode) { mark(oldNode, "removed"); result.push(oldNode); oldIndex++; continue; }
            if (!compatible(oldNode, newNode)) {
              // An inserted paragraph must not force an otherwise compatible
              // list/table below it to be duplicated as two whole versions.
              if (next.value.slice(newIndex + 1).some((candidate) => compatible(oldNode, candidate))) {
                mark(newNode, "added"); result.push(newNode); newIndex++; continue;
              }
              if (part.value.slice(oldIndex + 1).some((candidate) => compatible(candidate, newNode))) {
                mark(oldNode, "removed"); result.push(oldNode); oldIndex++; continue;
              }
            }
            if (oldNode.type === "list" && newNode.type === "list" && oldNode.ordered === newNode.ordered && oldNode.start === newNode.start) {
              if (newNode.ordered) {
                const lists: List[] = [oldNode, newNode];
                for (const list of lists) list.children.forEach((item, itemIndex) => {
                  item.data ??= {};
                  item.data.hProperties = { ...item.data.hProperties, value: String((list.start ?? 1) + itemIndex) };
                });
              }
              newNode.children = merge(oldNode.children, newNode.children);
              result.push(newNode);
            } else if (oldNode.type === "blockquote" && newNode.type === "blockquote") {
              newNode.children = merge(oldNode.children, newNode.children);
              result.push(newNode);
            } else if (oldNode.type === "listItem" && newNode.type === "listItem" && compatible(oldNode, newNode)) {
              newNode.children = merge(oldNode.children, newNode.children);
              // Tight Markdown lists unwrap paragraphs and would lose their
              // change classes; retain those wrappers for a nested item merge.
              newNode.spread = true;
              result.push(newNode);
            } else if (oldNode.type === "table" && newNode.type === "table" && key(oldNode.children[0]) === key(newNode.children[0]) && JSON.stringify(oldNode.align) === JSON.stringify(newNode.align)) {
              newNode.children = merge(oldNode.children, newNode.children);
              result.push(newNode);
            } else {
              mark(oldNode, "removed"); mark(newNode, "added");
              result.push(oldNode, newNode);
            }
            oldIndex++;
            newIndex++;
          }
          index++;
        } else {
          if (part.removed || part.added) part.value.forEach((node) => mark(node, part.removed ? "removed" : "added"));
          result.push(...part.value);
        }
      }
      return result;
    };

    const visible = (root: Root): RootContent[] => root.children.filter((node) => node.type !== "definition" && node.type !== "footnoteDefinition");
    const children = merge(visible(previous), visible(current));
    // Unreferenced footnotes do not render. Keep both namespaces available to
    // the merged document, colouring old notes only when old references survive.
    for (const node of previous.children) if (node.type === "footnoteDefinition") { mark(node, "removed"); children.push(node); }
    for (const node of current.children) if (node.type === "footnoteDefinition") {
      const start = node.position?.start.line ?? 0;
      const end = node.position?.end.line ?? 0;
      if ([...changes.added].some((line) => line >= start && line <= end)) mark(node, "added");
      children.push(node);
    }
    const tree: Root = { type: "root", children };
    return { ...changes, tree, changeCount: anchorChanges(tree) };
  } catch (error) {
    if (error instanceof ComparisonLimit) return null;
    throw error;
  }
}

export type MarkdownExcerpt = {
  chunks: Array<{ oldStart: number; newStart: number; comparison: UnifiedMarkdown }>;
  changeCount: number;
  limited: boolean;
};

/** Oversized documents reuse the already bounded diff payload. Each complete
 * hunk is isolated so unrelated fragments never form a list, table or fence.
 * This deliberately cannot recover structure/definitions outside that context.
 * Refuse a single oversized hunk rather than inventing a cut-off Markdown block. */
export function buildMarkdownExcerpt(hunks: DiffHunk[], truncated: boolean): MarkdownExcerpt | null {
  const deadline = Date.now() + 250;
  const chunks: MarkdownExcerpt["chunks"] = [];
  let characters = 0;
  let lines = 0;
  let changeCount = 0;
  let limited = truncated;
  for (const hunk of hunks) {
    if (!hunk.lines.some((line) => line.kind !== "context")) continue;
    if (hunk.lines.filter((line) => line.kind !== "addition").length !== hunk.oldLines ||
        hunk.lines.filter((line) => line.kind !== "deletion").length !== hunk.newLines) {
      limited = true;
      continue;
    }
    const size = hunk.lines.reduce((total, line) => total + line.content.length + 1, 0);
    if (chunks.length >= 24 || characters + size > 32 * 1024 || lines + hunk.lines.length > 400 || Date.now() > deadline) {
      limited = true;
      break;
    }
    const before = hunk.lines.filter((line) => line.kind !== "addition").map((line) => line.content).join("\n");
    const after = hunk.lines.filter((line) => line.kind !== "deletion").map((line) => line.content).join("\n");
    const comparison = buildUnifiedMarkdown(before, after);
    if (!comparison || Date.now() > deadline) { limited = true; break; }
    // Replace local anchor numbers with document-wide stops.
    walk(comparison.tree, (node) => {
      if (node.data?.hProperties) delete node.data.hProperties["data-markdown-change"];
    });
    comparison.changeCount = anchorChanges(comparison.tree, changeCount);
    changeCount += comparison.changeCount;
    chunks.push({ oldStart: hunk.oldStart, newStart: hunk.newStart, comparison });
    characters += size;
    lines += hunk.lines.length;
  }
  return chunks.length ? { chunks, changeCount, limited } : null;
}

/** Only the internally prepared AST enters the renderer, with no reparsing of
 * isolated fragments. Raw HTML and URL suppression remain renderer policies. */
export function remarkUnifiedMarkdown({ tree }: { tree: Root }) {
  return (): Root => tree;
}

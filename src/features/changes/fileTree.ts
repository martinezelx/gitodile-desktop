import { useCallback, useState, useSyncExternalStore } from "react";

/** How a list of changed files is laid out: flat, by name, or grouped in the
 * folders the files live in. One preference for every file list — Changes and
 * a saved version's files in History — so choosing it in one is the choice in
 * both. */
export type FileListView = "list" | "tree";

export const FILE_LIST_VIEW_STORAGE_KEY = "gitodile-file-list-view";

/** One row of a file tree as drawn: a folder, or a file under it. `depth` is
 * how many folders stand above the row. */
export type FileTreeRow<T> =
  | {
      kind: "folder";
      /** The folder's repository-relative path — for a compacted chain, the
       * deepest folder of it. The key a collapsed set remembers it by. */
      path: string;
      /** What the row prints: a chain of folders that hold nothing but the
       * next folder is one row, `src/features/history`, as an IDE shows it. */
      label: string;
      depth: number;
      expanded: boolean;
      /** Every file anywhere under it, visible or folded away. */
      files: T[];
    }
  | { kind: "file"; path: string; depth: number; item: T };

type FolderNode<T> = { name: string; path: string; folders: Map<string, FolderNode<T>>; files: Array<{ name: string; item: T }> };

function folderNode<T>(name: string, path: string): FolderNode<T> {
  return { name, path, folders: new Map(), files: [] };
}

function filesUnder<T>(node: FolderNode<T>): T[] {
  return [...node.files.map((file) => file.item), ...[...node.folders.values()].flatMap(filesUnder)];
}

const byName = (left: { name: string }, right: { name: string }): number =>
  left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });

/** Whether a file sits somewhere under a folder row's path. */
export function isInFolder(filePath: string, folderPath: string): boolean {
  return filePath.startsWith(`${folderPath}/`);
}

/** The rows a file tree draws: folders first, then files, each by name, with
 * a folder's contents left out while it is collapsed. Built as a flat list so
 * the rows can still be virtualized — what the tree adds is where each row
 * sits, not a nested DOM.
 *
 * Folder chains are compacted: `src` holding only `features` holding only
 * `history` is one folder row, so a deep path does not spend three steps of
 * indentation before reaching anything that can be acted on.
 *
 * The project root's own files come last and loose, at depth 0, as an IDE
 * draws them: no folder stands over them, so the list draws them unchanged —
 * see `isGroupedFileRow`. */
export function flattenFileTree<T>(
  items: readonly T[],
  pathOf: (item: T) => string,
  collapsed: ReadonlySet<string>,
): FileTreeRow<T>[] {
  const root = folderNode<T>("", "");
  for (const item of items) {
    const parts = pathOf(item).split("/");
    const name = parts.pop() ?? "";
    let node = root;
    for (const part of parts) {
      let next = node.folders.get(part);
      if (!next) {
        next = folderNode<T>(part, node.path ? `${node.path}/${part}` : part);
        node.folders.set(part, next);
      }
      node = next;
    }
    node.files.push({ name, item });
  }

  const rows: FileTreeRow<T>[] = [];
  const walk = (node: FolderNode<T>, depth: number): void => {
    for (const start of [...node.folders.values()].sort(byName)) {
      let folder = start;
      const label = [folder.name];
      while (folder.files.length === 0 && folder.folders.size === 1) {
        folder = [...folder.folders.values()][0];
        label.push(folder.name);
      }
      const expanded = !collapsed.has(folder.path);
      rows.push({ kind: "folder", path: folder.path, label: label.join("/"), depth, expanded, files: filesUnder(folder) });
      if (expanded) walk(folder, depth + 1);
    }
    for (const file of [...node.files].sort(byName)) {
      rows.push({ kind: "file", path: pathOf(file.item), depth, item: file.item });
    }
  };
  walk(root, 0);
  return rows;
}

/** Whether a file row stands under a folder in the folder view. Only such a
 * row takes the view's one-line shape: its folder line is the row above it.
 * A root file has no folder over it, so it keeps the list's row — switching
 * views never reshapes a row that is not being grouped. */
export function isGroupedFileRow(inFolders: boolean, row: { depth: number }): boolean {
  return inFolders && row.depth > 0;
}

/** A flat list's rows in the tree's vocabulary, so one renderer draws both. */
export function flatFileRows<T>(items: readonly T[], pathOf: (item: T) => string): FileTreeRow<T>[] {
  return items.map((item) => ({ kind: "file", path: pathOf(item), depth: 0, item }));
}

/** Which folders a file list has folded, and the two ways that changes:
 * pressing a folder, and stepping to a file inside a folded one — which opens
 * it, since the selected file has to be a row the reader can see. Per list and
 * per session, like a scroll position. */
export function useCollapsedFolders(): {
  collapsed: ReadonlySet<string>;
  toggle: (path: string, expanded: boolean) => void;
  reveal: (filePath: string) => void;
} {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((path: string, expanded: boolean) => setCollapsed((current) => {
    const next = new Set(current);
    if (expanded) next.delete(path); else next.add(path);
    return next;
  }), []);
  const reveal = useCallback((filePath: string) => setCollapsed((current) => {
    const open = [...current].filter((folder) => !isInFolder(filePath, folder));
    return open.length === current.size ? current : new Set(open);
  }), []);
  return { collapsed, toggle, reveal };
}

/* The preference lives in this module rather than in either screen: both stay
   mounted for the session, and a choice made in one has to redraw the other
   without a round trip through the app shell. Storage is per install, like
   the other small layout choices, and is read on every render — one string,
   so no copy of it can drift; failing storage just means the default. */
const listeners = new Set<() => void>();

function readFileListView(): FileListView {
  try {
    return localStorage.getItem(FILE_LIST_VIEW_STORAGE_KEY) === "tree" ? "tree" : "list";
  } catch {
    return "list";
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The file-list layout and a way to change it, shared by every file list. */
export function useFileListView(): [FileListView, (view: FileListView) => void] {
  const view = useSyncExternalStore(subscribe, readFileListView, readFileListView);
  const setView = useCallback((next: FileListView) => {
    try {
      localStorage.setItem(FILE_LIST_VIEW_STORAGE_KEY, next);
    } catch {
      // Without storage the choice cannot be kept; the default stands.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [view, setView];
}

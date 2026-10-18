import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CircleArrowUp,
  CloudDownload,
  FileDiff,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  FolderX,
  GitBranch,
  GitBranchPlus,
  History,
  House,
  Info,
  LifeBuoy,
  Monitor,
  Moon,
  RotateCw,
  Settings,
  Sparkles,
  Sun,
  Terminal,
} from "lucide-react";
import { useLanguage, type Translations } from "../i18n";
import { autoHideScrollbarProps } from "../shared/ui/autoHideScrollbar";

export type AppCommand = {
  id: string;
  label: string;
  /** The section the command is listed under: a long list groups by what the
   * commands are for, the way the palette's own sections do. */
  group: string;
  /** The glyph the menus already use for the same action, so an entry reads
   * the same wherever it appears. */
  icon: React.ReactNode;
  /** A shortcut spelled at the row's end, when it has one. */
  hint?: string;
  action: () => void;
};

/** What a caller knows about a command: what it does and what it is called.
 * Its section and glyph are the palette's own presentation (`paletteMeta`). */
export type AppCommandDraft = Omit<AppCommand, "group" | "icon">;

const DESTINATION_ICONS: Record<string, React.ReactNode> = {
  home: <House aria-hidden="true" />,
  workbench: <FileDiff aria-hidden="true" />,
  changes: <FileDiff aria-hidden="true" />,
  history: <History aria-hidden="true" />,
  "version-lines": <GitBranch aria-hidden="true" />,
  console: <Terminal aria-hidden="true" />,
  recovery: <LifeBuoy aria-hidden="true" />,
};

/** A command's section and glyph, by its id: the palette's own presentation,
 * kept out of the callers that only know what a command does. */
export function paletteMeta(id: string, t: Translations): Pick<AppCommand, "group" | "icon"> {
  if (id.startsWith("go-")) {
    const destination = id.slice(3);
    return { group: t.paletteGroupGo, icon: DESTINATION_ICONS[destination] ?? <GitBranch aria-hidden="true" /> };
  }
  if (id.startsWith("open-settings")) return { group: t.paletteGroupGo, icon: <Settings aria-hidden="true" /> };
  if (id.startsWith("switch-")) return { group: t.paletteGroupProject, icon: <FolderGit2 aria-hidden="true" /> };
  if (id.startsWith("theme-")) {
    return {
      group: t.paletteGroupTheme,
      icon: id === "theme-system" ? <Monitor aria-hidden="true" /> : id === "theme-light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />,
    };
  }
  if (id.startsWith("check-") || id.startsWith("refresh-")) {
    return {
      group: t.paletteGroupRefresh,
      icon: id === "check-remote-changes" ? <CloudDownload aria-hidden="true" /> : id === "check-app-updates" ? <CircleArrowUp aria-hidden="true" /> : <RotateCw aria-hidden="true" />,
    };
  }
  switch (id) {
    case "open-project":
      return { group: t.paletteGroupProject, icon: <FolderOpen aria-hidden="true" /> };
    case "clone-project":
      return { group: t.paletteGroupProject, icon: <CloudDownload aria-hidden="true" /> };
    case "create-project":
      return { group: t.paletteGroupProject, icon: <FolderPlus aria-hidden="true" /> };
    case "close-project":
      return { group: t.paletteGroupProject, icon: <FolderX aria-hidden="true" /> };
    case "new-version-line":
      return { group: t.paletteGroupProject, icon: <GitBranchPlus aria-hidden="true" /> };
    case "project-settings":
      return { group: t.paletteGroupProject, icon: <Settings aria-hidden="true" /> };
    case "changelog":
      return { group: t.paletteGroupApp, icon: <Sparkles aria-hidden="true" /> };
    default:
      return { group: t.paletteGroupApp, icon: <Info aria-hidden="true" /> };
  }
}

export function filterAppCommands(commands: readonly AppCommand[], query: string): AppCommand[] {
  const needle = query.trim().toLowerCase();
  return commands.filter((command) => needle === "" || command.label.toLowerCase().includes(needle));
}

export type CommandGroup = { name: string; commands: AppCommand[] };

/** Sections in the order they first appear, so a group's own order is the
 * caller's and nothing is listed twice under two headings. */
export function groupAppCommands(commands: readonly AppCommand[]): CommandGroup[] {
  const order: string[] = [];
  const grouped = new Map<string, AppCommand[]>();
  for (const command of commands) {
    if (!grouped.has(command.group)) {
      grouped.set(command.group, []);
      order.push(command.group);
    }
    grouped.get(command.group)?.push(command);
  }
  return order.map((name) => ({ name, commands: grouped.get(name) ?? [] }));
}

/** A little past the 90ms `palette-rise-out`, so a busy frame never cuts the
 * last one. The panel keeps the last results on screen for this long. */
const EXIT_MS = 120;

/** How far the panel's centre may sit from the window's edges. */
const PANEL_EDGE = 12;

/** The panel's measure, mirrored from `app-shell.css`'
 * `min(480px, calc(100vw - 48px))`: the deployment needs it before the panel
 * paints, and a test's DOM reports a stubbed box for every element. */
const PANEL_WIDTH = 480;
const PANEL_VIEWPORT_MARGIN = 48;

/** Where the panel's centre can sit: on the field's centre when the window has
 * room, pulled inside its edges when the field sits near one — Console's field
 * is at the left of its status line, and a narrow window can put the strip's
 * field near an edge too. A panel as wide as the window simply stays centred. */
export function clampPaletteLeft(center: number, panelWidth: number, viewportWidth: number): number {
  if (panelWidth <= 0) return center;
  const half = panelWidth / 2;
  const min = Math.min(half + PANEL_EDGE, viewportWidth / 2);
  const max = Math.max(viewportWidth - half - PANEL_EDGE, viewportWidth / 2);
  return Math.min(Math.max(center, min), max);
}

/**
 * The results of the app's search, deployed from the field that asked for
 * them: the strip's own control holds the query and the keyboard, and this
 * surface only shows what matches — grouped, with the glyph each action
 * already wears, and the keys it answers to at its foot.
 */
export function CommandPalette({
  isOpen,
  matches,
  selectedIndex,
  anchorRef,
  reducedMotion = false,
  variant = "app",
  onSelect,
  onHover,
}: {
  isOpen: boolean;
  /** Already filtered and in the field's order, so the input's
   * `aria-activedescendant` and this list cannot disagree. */
  matches: readonly AppCommand[];
  selectedIndex: number;
  /** The field. The results sit centred on it, eight pixels above it. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** The app preference. With motion off the panel closes at once instead of
   * holding a frame it is not animating; the system preference is read here. */
  reducedMotion?: boolean;
  /** Which material the results wear: the app's raised card, or the console's
   * own pane when the field belongs to the Console. */
  variant?: "app" | "console";
  onSelect: (command: AppCommand) => void;
  onHover: (index: number) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  // Closing keeps the panel mounted for the leaving animation, holding the
  // last results and the surface it opened with, so a destination that changes
  // screens cannot flash the other material while the panel fades.
  const [phase, setPhase] = useState<"closed" | "open" | "closing">(isOpen ? "open" : "closed");
  const [held, setHeld] = useState<{ matches: readonly AppCommand[]; selectedIndex: number; variant: "app" | "console" }>({
    matches,
    selectedIndex,
    variant,
  });
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    if (isOpen) {
      setPhase("open");
      return;
    }
    const withoutMotion =
      reducedMotion ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setPhase((current) => (current === "open" ? (withoutMotion ? "closed" : "closing") : current));
  }, [isOpen, reducedMotion]);

  useEffect(() => {
    if (isOpen) setHeld({ matches, selectedIndex, variant });
  }, [isOpen, matches, selectedIndex, variant]);

  useEffect(() => {
    if (phase !== "closing") return;
    const timer = window.setTimeout(() => setPhase("closed"), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // The list follows the chosen row: the arrows can walk past the panel's
  // 300px of results, and the row the field points at must stay in view.
  // `scrollIntoView` is missing in a test's DOM; the call is optional for it.
  useLayoutEffect(() => {
    if (phase !== "open") return;
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selected?.scrollIntoView?.({ block: "nearest" });
  }, [phase, held.matches, held.selectedIndex]);

  // Measured before the first paint, so the panel never draws at the window's
  // centre and then jumps to the field — that jump is what read as a flicker.
  // Re-measured on resize; a frame the browser has not laid out (a test) simply
  // renders the panel unpositioned, where a role query still finds it.
  useLayoutEffect(() => {
    if (phase === "closed") {
      setAnchor(null);
      return;
    }
    const measure = (): void => {
      const element = anchorRef.current;
      if (!element) {
        // No field to hang from — the screen's field has not mounted yet, as
        // while its chunk loads. The results still open, at the foot of the
        // window, so the shortcut never goes dead; Esc closes it from the
        // document handler while nothing here owns the keyboard.
        setAnchor({ left: window.innerWidth / 2, bottom: 96 });
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setAnchor(null);
        return;
      }
      const center = rect.left + rect.width / 2;
      const panelWidth = Math.min(PANEL_WIDTH, Math.max(window.innerWidth - PANEL_VIEWPORT_MARGIN, 0));
      setAnchor({
        left: clampPaletteLeft(center, panelWidth, window.innerWidth),
        bottom: window.innerHeight - rect.top + 8,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [phase, anchorRef]);

  if (phase === "closed") return null;

  // While open it wears the surface of the screen that asked; on the way out it
  // keeps the one it opened with, so a destination's screen change cannot flip
  // the material under the fade.
  const surface = phase === "open" ? variant : held.variant;
  const groups = groupAppCommands(held.matches);
  let index = -1;

  return (
    <div
      className={`palette-panel${surface === "console" ? " palette-panel--console" : ""}${phase === "closing" ? " palette-panel--closing" : ""}`}
      data-palette-panel=""
      style={anchor ? { left: `${anchor.left}px`, bottom: `${anchor.bottom}px` } : undefined}
    >
      <ul
        {...autoHideScrollbarProps<HTMLUListElement>()}
        ref={listRef}
        className="palette-list auto-hide-scrollbar"
        id="palette-list"
        role="listbox"
        aria-label={t.paletteAriaLabel}
      >
        {held.matches.length === 0 && <li className="palette-empty">{t.paletteNoMatches}</li>}
        {groups.map((group) => (
          <React.Fragment key={group.name}>
            <li className="palette-group" role="presentation">
              {group.name}
            </li>
            {group.commands.map((command) => {
              index += 1;
              const position = index;
              return (
                <li
                  key={command.id}
                  id={`palette-option-${command.id}`}
                  role="option"
                  aria-selected={position === held.selectedIndex}
                  className="palette-item"
                  onMouseEnter={() => onHover(position)}
                  onMouseDown={(event) => {
                    // Keeps the field's focus: a press on a result chooses it.
                    event.preventDefault();
                    onSelect(command);
                  }}
                >
                  {command.icon}
                  <span className="palette-item__label">{command.label}</span>
                  {command.hint && <kbd className="palette-item__hint">{command.hint}</kbd>}
                </li>
              );
            })}
          </React.Fragment>
        ))}
      </ul>
      <div className="palette-footer" aria-hidden="true">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t.paletteMove}
        </span>
        <span>
          <kbd>↵</kbd> {t.paletteOpen}
        </span>
        <span>
          <kbd>esc</kbd> {t.paletteClose}
        </span>
      </div>
    </div>
  );
}

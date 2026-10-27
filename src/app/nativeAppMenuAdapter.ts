import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { AppMenuCommand, AppMenuEntry, NativeAppMenuPort } from "./nativeAppMenu";

type CommandEntry = Extract<AppMenuEntry, { kind: "command" }>;

/** Builds the macOS menu bar with Tauri's menu API. Custom entries carry no
 * accelerator: the app's keyboard handler owns ⌘, ⌘B and ⌘K, and a menu key
 * equivalent beside it could fire the same action twice (task 204). */
export const nativeAppMenuPort: NativeAppMenuPort = {
  install: async (sections, onCommand) => {
    const items = new Map<AppMenuCommand, { item: MenuItem; text: string; enabled: boolean }>();
    const submenus = await Promise.all(
      sections.map(async (section) => {
        const entries = await Promise.all(
          section.entries.map(async (entry) => {
            if (entry.kind === "separator") return PredefinedMenuItem.new({ item: "Separator" });
            if (entry.kind === "native") return PredefinedMenuItem.new({ item: entry.item, text: entry.text });
            // No `id`: Tauri unregisters an item's click handler by id when the
            // item is dropped, so a fixed id shared with the menu this one
            // replaces would let the old menu's teardown silence the new one.
            const item = await MenuItem.new({
              text: entry.text,
              enabled: entry.enabled,
              action: () => onCommand(entry.command),
            });
            items.set(entry.command, { item, text: entry.text, enabled: entry.enabled });
            return item;
          }),
        );
        return Submenu.new({ text: section.text, items: entries });
      }),
    );
    const menu = await Menu.new({ items: submenus });
    const previous = await menu.setAsAppMenu();
    await previous?.close().catch(() => undefined);

    return {
      update: async (next) => {
        const commands = next.flatMap((section) =>
          section.entries.filter((entry): entry is CommandEntry => entry.kind === "command"),
        );
        await Promise.all(
          commands.map(async (entry) => {
            const current = items.get(entry.command);
            if (!current) return;
            if (current.text !== entry.text) {
              await current.item.setText(entry.text);
              current.text = entry.text;
            }
            if (current.enabled !== entry.enabled) {
              await current.item.setEnabled(entry.enabled);
              current.enabled = entry.enabled;
            }
          }),
        );
      },
    };
  },
};

import { beforeEach, describe, expect, it, vi } from "vitest";

type ItemOptions = { id?: string; text: string; enabled?: boolean; action?: () => void };

const created: Array<{ options: ItemOptions; setText: ReturnType<typeof vi.fn>; setEnabled: ReturnType<typeof vi.fn> }> = [];
const setAsAppMenu = vi.fn(async () => null);

vi.mock("@tauri-apps/api/menu", () => ({
  MenuItem: {
    new: vi.fn(async (options: ItemOptions) => {
      const item = { options, setText: vi.fn(async () => undefined), setEnabled: vi.fn(async () => undefined) };
      created.push(item);
      return item;
    }),
  },
  PredefinedMenuItem: { new: vi.fn(async (options: unknown) => ({ predefined: options })) },
  Submenu: { new: vi.fn(async (options: unknown) => ({ submenu: options })) },
  Menu: { new: vi.fn(async () => ({ setAsAppMenu })) },
}));

import { nativeAppMenuPort } from "./nativeAppMenuAdapter";
import type { AppMenuSection } from "./nativeAppMenu";

function plan(goBackEnabled: boolean, settingsText = "Settings…"): AppMenuSection[] {
  return [
    {
      id: "app",
      text: "GitOdile",
      entries: [
        { kind: "command", command: "settings", text: settingsText, enabled: true },
        { kind: "separator" },
        { kind: "native", item: "Quit", text: "Quit GitOdile" },
      ],
    },
    { id: "view", text: "View", entries: [{ kind: "command", command: "go-back", text: "Go back", enabled: goBackEnabled }] },
  ];
}

beforeEach(() => {
  created.length = 0;
  setAsAppMenu.mockClear();
});

describe("nativeAppMenuPort", () => {
  it("installs the menu as the app menu and routes clicks to their command", async () => {
    const onCommand = vi.fn();
    await nativeAppMenuPort.install(plan(true), onCommand);
    expect(setAsAppMenu).toHaveBeenCalledOnce();
    created.find((item) => item.options.text === "Go back")?.options.action?.();
    expect(onCommand).toHaveBeenCalledWith("go-back");
  });

  it("leaves item ids to Tauri so a replaced menu cannot unregister the new one's handlers", async () => {
    await nativeAppMenuPort.install(plan(true), vi.fn());
    expect(created.every((item) => item.options.id === undefined)).toBe(true);
  });

  it("updates only what changed", async () => {
    const handle = await nativeAppMenuPort.install(plan(true), vi.fn());
    await handle.update(plan(false, "Ajustes…"));
    const settings = created.find((item) => item.options.text === "Settings…");
    const goBack = created.find((item) => item.options.text === "Go back");
    expect(settings?.setText).toHaveBeenCalledWith("Ajustes…");
    expect(settings?.setEnabled).not.toHaveBeenCalled();
    expect(goBack?.setEnabled).toHaveBeenCalledWith(false);
    expect(goBack?.setText).not.toHaveBeenCalled();

    await handle.update(plan(false, "Ajustes…"));
    expect(goBack?.setEnabled).toHaveBeenCalledOnce();
  });
});

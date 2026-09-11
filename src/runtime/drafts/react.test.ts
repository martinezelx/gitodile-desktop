import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePersistedInstallDraft } from "./react";

type Message = { title: string; details: string };

const empty = (): Message => ({ title: "", details: "" });
const isEmpty = (value: Message): boolean => !value.title && !value.details;
const isMessage = (value: unknown): value is Message =>
  typeof value === "object" && value !== null &&
  typeof (value as Partial<Message>).title === "string" &&
  typeof (value as Partial<Message>).details === "string";

afterEach(() => localStorage.clear());

describe("usePersistedInstallDraft", () => {
  it("restores a project draft after its component unmounts", () => {
    const first = renderHook(() => usePersistedInstallDraft(
      "save-version:/one", "version message", empty(), isEmpty, isMessage,
    ));
    act(() => first.result.current[1]({ title: "Keep this", details: "Context" }));
    first.unmount();

    const restored = renderHook(() => usePersistedInstallDraft(
      "save-version:/one", "version message", empty(), isEmpty, isMessage,
    ));
    expect(restored.result.current[0]).toEqual({ title: "Keep this", details: "Context" });
    restored.unmount();
  });

  it("keeps each project's draft isolated across a project switch", () => {
    const hook = renderHook(
      ({ project }) => usePersistedInstallDraft(
        `save-version:${project}`, "version message", empty(), isEmpty, isMessage,
      ),
      { initialProps: { project: "/one" } },
    );
    act(() => hook.result.current[1]({ title: "One", details: "" }));
    hook.rerender({ project: "/two" });
    expect(hook.result.current[0]).toEqual(empty());
    act(() => hook.result.current[1]({ title: "Two", details: "" }));
    hook.rerender({ project: "/one" });
    expect(hook.result.current[0]).toEqual({ title: "One", details: "" });
    hook.unmount();
  });
});

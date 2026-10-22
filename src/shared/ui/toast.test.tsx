import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast, type ToastRequest } from "./toast";

function Show({ request }: { request: ToastRequest }) {
  const show = useToast();
  return (
    <button type="button" onClick={() => show(request)}>
      show
    </button>
  );
}

function ShowMany({ requests }: { requests: ToastRequest[] }) {
  const show = useToast();
  return (
    <button type="button" onClick={() => requests.forEach((request) => show(request))}>
      show all
    </button>
  );
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("toast", () => {
  it("dismisses a plain result on its own", () => {
    vi.useFakeTimers();
    const { container } = render(
      <ToastProvider>
        <Show request={{ message: "2 versions published." }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "show" }));
    expect(screen.getByText("2 versions published.")).toBeInTheDocument();
    expect(container.querySelector(".app-toast__progress")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("2 versions published.")).toBeNull();
  });

  it("waits for the reader when the toast offers an action", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const { container } = render(
      <ToastProvider>
        <Show request={{ message: "Updated to 1.4.0", action: { label: "See what's new", onAction } }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "show" }));
    expect(container.querySelector(".app-toast__progress")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Updated to 1.4.0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See what's new" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByText("Updated to 1.4.0")).toBeNull();
  });

  it("closes from its dismiss control", () => {
    render(
      <ToastProvider dismissLabel="Cerrar">
        <Show request={{ message: "Project connected." }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "show" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByText("Project connected.")).toBeNull();
  });

  it("keeps only the newest three results", () => {
    render(
      <ToastProvider>
        <ShowMany
          requests={[
            { message: "one" },
            { message: "two" },
            { message: "three" },
            { message: "four" },
          ]}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "show all" }));
    expect(screen.queryByText("one")).toBeNull();
    expect(screen.getByText("two")).toBeInTheDocument();
    expect(screen.getByText("three")).toBeInTheDocument();
    expect(screen.getByText("four")).toBeInTheDocument();
  });

  it("leaves an empty live region until a result is shown", () => {
    render(
      <ToastProvider>
        <Show request={{ message: "later" }} />
      </ToastProvider>,
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

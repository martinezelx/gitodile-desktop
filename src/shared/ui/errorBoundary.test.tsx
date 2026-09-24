import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary, ViewErrorNotice } from "./errorBoundary";

afterEach(cleanup);

const labels = { title: "This view ran into a problem", message: "Nothing changed.", action: "Try again", details: "Technical details" };

let shouldThrow = true;
function Fragile(): React.JSX.Element {
  if (shouldThrow) throw new Error("Rendered more hooks than during the previous render.");
  return <p>the view</p>;
}

function Sibling(): React.JSX.Element {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(count + 1)}>pressed {count}</button>;
}

describe("ErrorBoundary", () => {
  it("keeps a render error in its view, with the message behind a disclosure, and renders it again on retry", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    shouldThrow = true;
    render(
      <>
        <ErrorBoundary fallback={(error, retry) => <ViewErrorNotice error={error} labels={labels} onAction={retry} />}>
          <Fragile />
        </ErrorBoundary>
        <Sibling />
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("This view ran into a problem");
    expect(screen.getByText("Technical details").closest("details")).not.toHaveAttribute("open");
    // The rest of the window still answers.
    fireEvent.click(screen.getByRole("button", { name: "pressed 0" }));
    expect(screen.getByRole("button", { name: "pressed 1" })).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("the view")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    logged.mockRestore();
  });
});

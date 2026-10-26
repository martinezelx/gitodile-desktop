import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { AzureAddPanel } from "./AzureConnections";
import type { AzureConnectionsPort } from "./port";

afterEach(() => { cleanup(); localStorage.clear(); });
function setup(add = vi.fn(async () => "azo-test:token.user")) {
  const token = { add, remove: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) };
  const port: AzureConnectionsPort = { tokenPort: vi.fn(() => token) };
  const onAdded = vi.fn(); const onCancel = vi.fn(); const onSettled = vi.fn();
  const view = render(<LanguageProvider><AzureAddPanel port={port} onAdded={onAdded} onCancel={onCancel} onSettled={onSettled} /></LanguageProvider>);
  return { ...view, token, port, onAdded, onCancel, onSettled };
}
it("collects the organization before a masked token, clears it before sending and shows the scope guidance", async () => {
  const { port, token, onAdded, onSettled } = setup();
  const organization = screen.getByRole("textbox", { name: "Azure organization" });
  expect(organization).toHaveFocus();
  await userEvent.type(organization, "https://dev.azure.com/Contoso/");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(port.tokenPort).toHaveBeenLastCalledWith("contoso");
  expect(screen.getByText("dev.azure.com/contoso")).toBeInTheDocument();
  const input = screen.getByLabelText("Personal access token (PAT)");
  expect(input).toHaveAttribute("type", "password"); expect(input).toHaveFocus();
  expect(screen.getByText(/Code: Read & write/)).toBeInTheDocument();
  await userEvent.type(input, "fixture-pat-123456789");
  await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
  expect(token.add).toHaveBeenCalledWith("fixture-pat-123456789", expect.stringMatching(/^token_/));
  expect(input).toHaveValue("");
  await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
  expect(onSettled).toHaveBeenCalledOnce();
});
it("rejects arbitrary servers before collecting or sending a token", async () => {
  const { token } = setup();
  await userEvent.type(screen.getByRole("textbox", { name: "Azure organization" }), "https://evil.invalid/contoso");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert")).toHaveTextContent("organization name");
  expect(screen.queryByLabelText("Personal access token (PAT)")).not.toBeInTheDocument();
  expect(token.add).not.toHaveBeenCalled();
});
it("reports a rejected token and clears the input without claiming a saved connection", async () => {
  const { onAdded, onSettled } = setup(vi.fn(async () => { throw { code: "authentication_failed", message: "", remediation: null }; }));
  await userEvent.type(screen.getByRole("textbox", { name: "Azure organization" }), "contoso");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  const token = screen.getByLabelText("Personal access token (PAT)");
  await userEvent.type(token, "fixture-expired-token");
  await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(token).toHaveValue(""); expect(onAdded).not.toHaveBeenCalled(); expect(onSettled).toHaveBeenCalledOnce();
});
it("cancels an in-flight check on unmount and never delivers its late receipt", async () => {
  let complete!: (value: string) => void;
  const { token, unmount, onAdded } = setup(vi.fn(() => new Promise<string>(resolve => { complete = resolve; })));
  await userEvent.type(screen.getByRole("textbox", { name: "Azure organization" }), "contoso");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.type(screen.getByLabelText("Personal access token (PAT)"), "fixture-token-1234567");
  await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
  unmount();
  expect(token.cancel).toHaveBeenCalledWith(expect.stringMatching(/^token_/));
  complete("azo-test:token.user");
  await Promise.resolve();
  expect(onAdded).not.toHaveBeenCalled();
});
it("provides the organization and token flow in Spanish", async () => {
  localStorage.setItem("gitodile-language", "es");
  setup();
  expect(screen.getByRole("group", { name: "Conectar Azure Repos" })).toBeInTheDocument();
  await userEvent.type(screen.getByRole("textbox", { name: "Organización de Azure" }), "contoso");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByLabelText("Token de acceso personal (PAT)")).toHaveAttribute("type", "password");
});

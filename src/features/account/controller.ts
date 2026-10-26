import type { AccountScenario, AccountState } from "./domain";
import { createMockAccountPort } from "./mockAdapter";
import type { AccountPort } from "./port";

type AccountSnapshot = {
  account: AccountState;
  anchor: HTMLElement | null;
  popoverOpen: boolean;
  scenario: AccountScenario;
};

export function createAccountController(port: AccountPort, selectScenario: (scenario: AccountScenario) => void) {
  let snapshot: AccountSnapshot = { account: port.getSnapshot(), anchor: null, popoverOpen: false, scenario: "success" };
  let disconnect: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<AccountSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };
    [...listeners].forEach((listener) => listener());
  };
  const restoreFocus = (): void => { snapshot.anchor?.focus(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!disconnect) {
        disconnect = port.subscribe(() => emit({ account: port.getSnapshot() }));
        // State may have changed between construction/render and subscription.
        const account = port.getSnapshot();
        if (account !== snapshot.account) emit({ account });
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          disconnect?.(); disconnect = undefined;
          port.dispose();
          snapshot = { ...snapshot, account: port.getSnapshot(), popoverOpen: false };
        }
      };
    },
    open(anchor: HTMLElement) { emit({ anchor, popoverOpen: true }); },
    closePopover(restore: boolean) {
      if (!snapshot.popoverOpen) return;
      emit({ popoverOpen: false });
      if (restore) restoreFocus();
    },
    setScenario(scenario: AccountScenario) { selectScenario(scenario); emit({ scenario }); },
    start() { emit({ popoverOpen: false }); port.start(); },
    startFrom(anchor: HTMLElement) { emit({ anchor, popoverOpen: false }); port.start(); },
    reset() {
      port.cancel();
      selectScenario("success");
      emit({ scenario: "success", popoverOpen: false });
    },
    reopen: () => port.reopen(),
    cancel() { port.cancel(); restoreFocus(); },
    signOut() { port.signOut(); emit({ popoverOpen: false }); restoreFocus(); },
    restoreFocus,
  };
}

export type AccountController = ReturnType<typeof createAccountController>;

export function createMockAccountController(): AccountController {
  const port = createMockAccountPort();
  return createAccountController(port, port.setScenario);
}

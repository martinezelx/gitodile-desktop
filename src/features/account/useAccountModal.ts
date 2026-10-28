import { useCallback, useSyncExternalStore } from "react";
import type { AccountController } from "./controller";

const noSubscription = (): (() => void) => () => undefined;

/** The shell needs only modality; session and overlay behavior stay feature-owned. */
export function useAccountModal(controller: AccountController | null): boolean {
  const read = useCallback(() => {
    const kind = controller?.getSnapshot().account.kind;
    return kind === "waiting" || kind === "failed";
  }, [controller]);
  return useSyncExternalStore(controller?.subscribe ?? noSubscription, read, read);
}

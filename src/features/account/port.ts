import type { AccountRequest, AccountState } from "./domain";

/** Presentation state only. A future native adapter must keep credentials private. */
export interface AccountPort {
  getSnapshot(): AccountState;
  subscribe(listener: () => void): () => void;
  start(): AccountRequest;
  reopen(): void;
  cancel(): void;
  signOut(): void;
  dispose(): void;
}

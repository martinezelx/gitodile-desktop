import type { ExecuteSaveVersionRequest, SaveVersionPort, SaveVersionQuery } from "./port";

export type SaveVersionController = ReturnType<typeof createSaveVersionController>;

/** Owns the save-version request boundary. Plans and execution always carry
 * the same project incarnation and Rust-issued immutable state token. */
export function createSaveVersionController(port: SaveVersionPort) {
  return {
    plan(request: SaveVersionQuery) {
      return port.plan(request);
    },
    save(request: ExecuteSaveVersionRequest) {
      return port.save(request);
    },
  };
}

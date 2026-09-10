import type {
  NativeDraftPreparation,
  StartupUpdateConfirmation,
  UpdateAction,
  UpdateState,
} from "./domain";

export interface AppUpdatesPort {
  readState(): Promise<UpdateState>;
  readStartupConfirmation(): Promise<StartupUpdateConfirmation>;
  check(source: "manual" | "background"): Promise<UpdateAction>;
  download(candidateId: string): Promise<UpdateAction>;
  cancel(operationId: string): Promise<UpdateState>;
  install(candidateId: string, drafts: NativeDraftPreparation): Promise<UpdateState>;
}

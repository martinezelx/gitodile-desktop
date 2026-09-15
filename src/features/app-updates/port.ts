import type {
  NativeDraftPreparation,
  StartupUpdateConfirmation,
  UpdateAction,
  UpdateChannel,
  UpdateChannelSetting,
  UpdateState,
} from "./domain";

export interface AppUpdatesPort {
  readState(): Promise<UpdateState>;
  readStartupConfirmation(): Promise<StartupUpdateConfirmation>;
  check(source: "manual" | "background"): Promise<UpdateAction>;
  download(candidateId: string): Promise<UpdateAction>;
  cancel(operationId: string): Promise<UpdateState>;
  install(candidateId: string, drafts: NativeDraftPreparation): Promise<UpdateState>;
  openManualDownload(): Promise<void>;
  readChannel(): Promise<UpdateChannelSetting>;
  /** Rejects while a check, download or install is running. */
  setChannel(channel: UpdateChannel): Promise<UpdateChannelSetting>;
}

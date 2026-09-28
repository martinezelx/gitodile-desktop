import type { ConsoleOperationId } from "./domain";

export type ConsoleQueryResult = {
  operationId: ConsoleOperationId;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  success: boolean;
  truncated: boolean;
};

export interface ConsolePort {
  run(request: { projectId: string; sessionEpoch: string; operationId: ConsoleOperationId }): Promise<ConsoleQueryResult>;
}

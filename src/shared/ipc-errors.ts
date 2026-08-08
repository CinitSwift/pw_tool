import type { SegmentValidationError } from './domain/types';

export const IPC_ERROR_PREFIX = 'PW_TOOL_IPC_ERROR:';

export type IpcErrorCode =
  | 'session-active-exists'
  | 'session-not-found'
  | 'history-not-found'
  | 'session-invalid-state'
  | 'validation-error'
  | 'export-cancelled'
  | 'internal-error';

export interface SerializedIpcError {
  code: IpcErrorCode;
  message: string;
  fieldErrors?: SegmentValidationError[];
}

export class IpcDomainError extends Error {
  readonly code: Exclude<IpcErrorCode, 'internal-error'>;
  readonly fieldErrors?: SegmentValidationError[];

  constructor(code: Exclude<IpcErrorCode, 'internal-error'>, message: string, fieldErrors?: SegmentValidationError[]) {
    super(message);
    this.name = 'IpcDomainError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

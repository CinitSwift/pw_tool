import type { Session } from '../../shared/domain/session-machine';
import type {
  AppSettings,
  BillingSettings,
  EditSegmentsInput,
  HistoryQuery,
  RecoveryChoice,
  RecoveryResult,
  SegmentValidationError,
  SessionSnapshot,
  TimeSegment,
} from '../../shared/domain/types';
import {
  IPC_ERROR_PREFIX,
  IpcDomainError,
  type SerializedIpcError,
} from '../../shared/ipc-errors';
import { IPC } from './channels';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface IpcMainLike {
  handle(channel: string, handler: Handler): void;
  removeHandler(channel: string): void;
}

interface SnapshotTarget {
  send(channel: string, snapshot: SessionSnapshot): void;
}

interface SessionActions {
  getSnapshot(): SessionSnapshot | Promise<SessionSnapshot>;
  start(): SessionSnapshot | Promise<SessionSnapshot>;
  pause(): SessionSnapshot | Promise<SessionSnapshot>;
  resume(): SessionSnapshot | Promise<SessionSnapshot>;
  complete(): SessionSnapshot | Promise<SessionSnapshot>;
  updateSettings(settings: BillingSettings): SessionSnapshot | Promise<SessionSnapshot>;
  updateNote(note: string): SessionSnapshot | Promise<SessionSnapshot>;
  editSegments(input: EditSegmentsInput): SessionSnapshot | Promise<SessionSnapshot>;
  handleRecovery(choice: RecoveryChoice): RecoveryResult | Promise<RecoveryResult>;
}

interface HistoryActions {
  list(input: HistoryQuery): Session[] | Promise<Session[]>;
  delete(id: string): void | Promise<void>;
  editSegments(input: { sessionId: string; segments: TimeSegment[] }): Session | Promise<Session>;
  exportCsv(input: HistoryQuery): { filePath: string; rowCount: number } | Promise<{ filePath: string; rowCount: number }>;
}

interface SettingsActions {
  get(): AppSettings | Promise<AppSettings>;
  save(settings: AppSettings): AppSettings | Promise<AppSettings>;
}

interface WindowActions {
  showMain(): void | Promise<void>;
  showMini(): void | Promise<void>;
  setAlwaysOnTop(value: boolean): boolean | Promise<boolean>;
}

const sessionWriteChannels = new Set<string>([
  IPC.sessionStart,
  IPC.sessionPause,
  IPC.sessionResume,
  IPC.sessionComplete,
  IPC.sessionUpdateSettings,
  IPC.sessionUpdateNote,
  IPC.sessionEditSegments,
  IPC.sessionRecovery,
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function serializeFieldErrors(value: unknown): SegmentValidationError[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((fieldError) => {
    if (!isRecord(fieldError)) {
      return [];
    }

    const serialized: Record<string, string | number> = {};
    for (const key of ['code', 'segmentIndex', 'field', 'message']) {
      const field = fieldError[key];
      if (typeof field === 'string' || typeof field === 'number') {
        serialized[key] = field;
      }
    }
    if (typeof serialized.code !== 'string' || typeof serialized.segmentIndex !== 'number' || typeof serialized.message !== 'string') {
      return [];
    }

    return [{
      code: serialized.code as SegmentValidationError['code'],
      segmentIndex: serialized.segmentIndex,
      ...(typeof serialized.field === 'string' ? { field: serialized.field as SegmentValidationError['field'] } : {}),
      message: serialized.message,
    }];
  });
}

function serializeError(error: unknown): SerializedIpcError {
  if (error instanceof IpcDomainError) {
    const fieldErrors = serializeFieldErrors(error.fieldErrors);
    return fieldErrors ? { code: error.code, message: error.message, fieldErrors } : { code: error.code, message: error.message };
  }

  const message = error instanceof Error ? error.message : '';
  if (message === 'active session already exists') {
    return { code: 'session-active-exists', message };
  }
  if (message === 'active session does not exist') {
    return { code: 'session-not-found', message };
  }
  if (message === 'session does not exist') {
    return { code: 'history-not-found', message };
  }
  if (message === 'CSV export cancelled') {
    return { code: 'export-cancelled', message };
  }
  if (message === 'Invalid sessions cannot be edited' || message.startsWith('Operation is not allowed for session state ')) {
    return { code: 'session-invalid-state', message };
  }
  return { code: 'internal-error', message: 'An internal error occurred.' };
}

export interface IpcDependencies {
  ipcMain: IpcMainLike;
  session: SessionActions;
  history: HistoryActions;
  settings: SettingsActions;
  window: WindowActions;
  snapshotTargets?: () => SnapshotTarget[];
}

export interface IpcRegistration {
  (): void;
  unregister(): void;
  broadcastSnapshot(snapshot: SessionSnapshot): void;
}

export function registerIpc(dependencies: IpcDependencies): IpcRegistration {
  const { ipcMain, session, history, settings, window } = dependencies;
  const handlers: Record<(typeof IPC)[keyof typeof IPC], Handler> = {
    [IPC.sessionSnapshot]: () => session.getSnapshot(),
    [IPC.sessionStart]: () => session.start(),
    [IPC.sessionPause]: () => session.pause(),
    [IPC.sessionResume]: () => session.resume(),
    [IPC.sessionComplete]: () => session.complete(),
    [IPC.sessionUpdateSettings]: (_event, value) => session.updateSettings(value as BillingSettings),
    [IPC.sessionUpdateNote]: (_event, value) => session.updateNote(value as string),
    [IPC.sessionEditSegments]: (_event, value) => session.editSegments(value as EditSegmentsInput),
    [IPC.sessionRecovery]: (_event, value) => session.handleRecovery(value as RecoveryChoice),
    [IPC.historyList]: (_event, value) => history.list(value as HistoryQuery),
    [IPC.historyDelete]: (_event, value) => history.delete(value as string),
    [IPC.historyEditSegments]: (_event, value) => history.editSegments(value as { sessionId: string; segments: TimeSegment[] }),
    [IPC.historyExportCsv]: (_event, value) => history.exportCsv(value as HistoryQuery),
    [IPC.settingsGet]: () => settings.get(),
    [IPC.settingsSave]: (_event, value) => settings.save(value as AppSettings),
    [IPC.windowShowMain]: () => window.showMain(),
    [IPC.windowShowMini]: () => window.showMini(),
    [IPC.windowSetAlwaysOnTop]: (_event, value) => window.setAlwaysOnTop(value as boolean),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        const result = await handler(event, ...args);
        if (sessionWriteChannels.has(channel)) {
          const snapshot = channel === IPC.sessionRecovery
            ? (result as RecoveryResult).snapshot
            : result as SessionSnapshot;
          registration.broadcastSnapshot(snapshot);
        }
        return result;
      } catch (error) {
        throw new Error(`${IPC_ERROR_PREFIX}${JSON.stringify(serializeError(error))}`);
      }
    });
  }

  const unregister = (): void => {
    for (const channel of Object.values(IPC)) {
      ipcMain.removeHandler(channel);
    }
  };
  const registration = unregister as IpcRegistration;
  registration.unregister = unregister;
  registration.broadcastSnapshot = (snapshot): void => {
    let targets: SnapshotTarget[];
    try {
      targets = dependencies.snapshotTargets?.() ?? [];
    } catch {
      return;
    }
    for (const target of targets) {
      try {
        target.send(IPC.sessionSnapshot, snapshot);
      } catch {
        // A destroyed renderer must not affect other subscribers or the write result.
      }
    }
  };
  return registration;
}

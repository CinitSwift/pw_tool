import type { IpcRendererEvent } from 'electron';
import type {
  AppSettings,
  BillingSettings,
  EditSegmentsInput,
  HistoryQuery,
  RecoveryChoice,
  RecoveryResult,
  Session,
  SessionSnapshot,
  TimeSegment,
} from '../shared/domain/types';
import { IPC_ERROR_PREFIX } from '../shared/ipc-errors';
import { IPC } from '../main/ipc/channels';

type PreloadIpcError = {
  code: string;
  message: string;
  fieldErrors?: unknown[];
};

const internalError: PreloadIpcError = {
  code: 'internal-error',
  message: 'An internal error occurred.',
};

function isPreloadIpcError(value: unknown): value is PreloadIpcError {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { code?: unknown }).code === 'string'
    && typeof (value as { message?: unknown }).message === 'string'
    && ((value as { fieldErrors?: unknown }).fieldErrors === undefined
      || Array.isArray((value as { fieldErrors?: unknown }).fieldErrors));
}

function parseIpcError(error: unknown): PreloadIpcError {
  if (!(error instanceof Error)) {
    return internalError;
  }

  const prefixIndex = error.message.indexOf(IPC_ERROR_PREFIX);
  if (prefixIndex < 0) {
    return internalError;
  }

  try {
    const payload = JSON.parse(error.message.slice(prefixIndex + IPC_ERROR_PREFIX.length)) as unknown;
    return isPreloadIpcError(payload) ? payload : internalError;
  } catch {
    return internalError;
  }
}

async function invoke<T>(ipcRenderer: NarrowIpcRenderer, channel: string, ...args: unknown[]): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, ...args) as T;
  } catch (error) {
    throw parseIpcError(error);
  }
}

export interface PwToolApi {
  session: {
    getSnapshot(): Promise<SessionSnapshot>;
    start(): Promise<SessionSnapshot>;
    pause(): Promise<SessionSnapshot>;
    resume(): Promise<SessionSnapshot>;
    complete(): Promise<SessionSnapshot>;
    updateSettings(settings: BillingSettings): Promise<SessionSnapshot>;
    updateNote(note: string): Promise<SessionSnapshot>;
    editSegments(input: EditSegmentsInput): Promise<SessionSnapshot>;
    recover(choice: RecoveryChoice): Promise<RecoveryResult>;
    subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
  };
  history: {
    list(input: HistoryQuery): Promise<Session[]>;
    delete(id: string): Promise<void>;
    editSegments(input: { sessionId: string; segments: TimeSegment[] }): Promise<Session>;
    exportCsv(input: HistoryQuery): Promise<{ filePath: string; rowCount: number }>;
  };
  settings: {
    get(): Promise<AppSettings>;
    save(settings: AppSettings): Promise<AppSettings>;
  };
  window: {
    showMain(): Promise<void>;
    showMini(): Promise<void>;
    setAlwaysOnTop(value: boolean): Promise<boolean>;
  };
}

export interface NarrowIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: IpcRendererEvent, snapshot: SessionSnapshot) => void): void;
  removeListener(channel: string, listener: (event: IpcRendererEvent, snapshot: SessionSnapshot) => void): void;
}

export function createPwToolApi(ipcRenderer: NarrowIpcRenderer): PwToolApi {
  return {
    session: {
      getSnapshot: () => invoke<SessionSnapshot>(ipcRenderer, IPC.sessionSnapshot),
      start: () => invoke<SessionSnapshot>(ipcRenderer, IPC.sessionStart),
      pause: () => invoke<SessionSnapshot>(ipcRenderer, IPC.sessionPause),
      resume: () => invoke<SessionSnapshot>(ipcRenderer, IPC.sessionResume),
      complete: () => invoke<SessionSnapshot>(ipcRenderer, IPC.sessionComplete),
      updateSettings: (settings) => invoke<SessionSnapshot>(ipcRenderer, IPC.sessionUpdateSettings, settings),
      updateNote: (note) => invoke<SessionSnapshot>(ipcRenderer, IPC.sessionUpdateNote, note),
      editSegments: (input) => invoke<SessionSnapshot>(ipcRenderer, IPC.sessionEditSegments, input),
      recover: (choice) => invoke<RecoveryResult>(ipcRenderer, IPC.sessionRecovery, choice),
      subscribe(listener) {
        const wrapped = (_event: IpcRendererEvent, snapshot: SessionSnapshot): void => listener(snapshot);
        ipcRenderer.on(IPC.sessionSnapshot, wrapped);
        return () => ipcRenderer.removeListener(IPC.sessionSnapshot, wrapped);
      },
    },
    history: {
      list: (input) => invoke<Session[]>(ipcRenderer, IPC.historyList, input),
      delete: (id) => invoke<void>(ipcRenderer, IPC.historyDelete, id),
      editSegments: (input) => invoke<Session>(ipcRenderer, IPC.historyEditSegments, input),
      exportCsv: (input) => invoke<{ filePath: string; rowCount: number }>(ipcRenderer, IPC.historyExportCsv, input),
    },
    settings: {
      get: () => invoke<AppSettings>(ipcRenderer, IPC.settingsGet),
      save: (settings) => invoke<AppSettings>(ipcRenderer, IPC.settingsSave, settings),
    },
    window: {
      showMain: () => invoke<void>(ipcRenderer, IPC.windowShowMain),
      showMini: () => invoke<void>(ipcRenderer, IPC.windowShowMini),
      setAlwaysOnTop: (value) => invoke<boolean>(ipcRenderer, IPC.windowSetAlwaysOnTop, value),
    },
  };
}

import type { IpcRendererEvent } from 'electron';
import type {
  AppSettings,
  BillingSettings,
  HistoryQuery,
  RecoveryChoice,
  RecoveryResult,
  Session,
  SessionSnapshot,
  TimeSegment,
} from '../shared/domain/types';
import { IPC } from '../main/ipc/channels';

export interface PwToolApi {
  session: {
    getSnapshot(): Promise<SessionSnapshot>;
    start(): Promise<SessionSnapshot>;
    pause(): Promise<SessionSnapshot>;
    resume(): Promise<SessionSnapshot>;
    complete(): Promise<SessionSnapshot>;
    updateSettings(settings: BillingSettings): Promise<SessionSnapshot>;
    updateNote(note: string): Promise<SessionSnapshot>;
    editSegments(segments: TimeSegment[]): Promise<SessionSnapshot>;
    recover(choice: RecoveryChoice): Promise<RecoveryResult>;
    subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
  };
  history: {
    list(input: HistoryQuery): Promise<Session[]>;
    delete(id: string): Promise<void>;
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
      getSnapshot: () => ipcRenderer.invoke(IPC.sessionSnapshot) as Promise<SessionSnapshot>,
      start: () => ipcRenderer.invoke(IPC.sessionStart) as Promise<SessionSnapshot>,
      pause: () => ipcRenderer.invoke(IPC.sessionPause) as Promise<SessionSnapshot>,
      resume: () => ipcRenderer.invoke(IPC.sessionResume) as Promise<SessionSnapshot>,
      complete: () => ipcRenderer.invoke(IPC.sessionComplete) as Promise<SessionSnapshot>,
      updateSettings: (settings) => ipcRenderer.invoke(IPC.sessionUpdateSettings, settings) as Promise<SessionSnapshot>,
      updateNote: (note) => ipcRenderer.invoke(IPC.sessionUpdateNote, note) as Promise<SessionSnapshot>,
      editSegments: (segments) => ipcRenderer.invoke(IPC.sessionEditSegments, segments) as Promise<SessionSnapshot>,
      recover: (choice) => ipcRenderer.invoke(IPC.sessionRecovery, choice) as Promise<RecoveryResult>,
      subscribe(listener) {
        const wrapped = (_event: IpcRendererEvent, snapshot: SessionSnapshot): void => listener(snapshot);
        ipcRenderer.on(IPC.sessionSnapshot, wrapped);
        return () => ipcRenderer.removeListener(IPC.sessionSnapshot, wrapped);
      },
    },
    history: {
      list: (input) => ipcRenderer.invoke(IPC.historyList, input) as Promise<Session[]>,
      delete: (id) => ipcRenderer.invoke(IPC.historyDelete, id) as Promise<void>,
      exportCsv: (input) => ipcRenderer.invoke(IPC.historyExportCsv, input) as Promise<{ filePath: string; rowCount: number }>,
    },
    settings: {
      get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings>,
      save: (settings) => ipcRenderer.invoke(IPC.settingsSave, settings) as Promise<AppSettings>,
    },
    window: {
      showMain: () => ipcRenderer.invoke(IPC.windowShowMain) as Promise<void>,
      showMini: () => ipcRenderer.invoke(IPC.windowShowMini) as Promise<void>,
      setAlwaysOnTop: (value) => ipcRenderer.invoke(IPC.windowSetAlwaysOnTop, value) as Promise<boolean>,
    },
  };
}

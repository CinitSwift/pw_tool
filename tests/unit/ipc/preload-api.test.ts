import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '../../../src/main/ipc/channels';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();
const IPC_ERROR_PREFIX = 'PW_TOOL_IPC_ERROR:';

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener, send: vi.fn() },
}));

describe('preload API', () => {
  beforeEach(() => {
    vi.resetModules();
    exposeInMainWorld.mockClear();
    invoke.mockReset().mockResolvedValue(undefined);
    on.mockReset();
    removeListener.mockReset();
  });

  it('exposes only the narrow pwTool API', async () => {
    await import('../../../src/preload/index');

    expect(exposeInMainWorld).toHaveBeenCalledOnce();
    const [name, api] = exposeInMainWorld.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('pwTool');
    expect(Object.keys(api).sort()).toEqual(['history', 'session', 'settings', 'window']);
    expect(api).not.toHaveProperty('send');
    expect(api).not.toHaveProperty('invoke');
    expect(api).not.toHaveProperty('ipcRenderer');
  });

  it('uses invoke with only fixed channels and exact payloads', async () => {
    await import('../../../src/preload/index');
    const api = exposeInMainWorld.mock.calls[0][1];
    const settings = { billingMode: 'minute', hourlyRateYuan: 40, hourlyCommissionYuan: 3 };
    const segments = [{ startedAt: 1_000, endedAt: null }];
    const query = { status: 'completed' };

    await api.session.getSnapshot();
    await api.session.start();
    await api.session.pause();
    await api.session.resume();
    await api.session.complete();
    await api.session.updateSettings(settings);
    await api.session.updateNote('note');
    await api.session.editSegments({ sessionId: 'active-session', segments });
    await api.session.recover('restore');
    await api.history.list(query);
    await api.history.delete('session-1');
    await api.history.editSegments({ sessionId: 'history-session', segments });
    await api.history.exportCsv(query);
    await api.settings.get();
    await api.settings.save({ ...settings, miniAlwaysOnTop: false });
    await api.window.showMain();
    await api.window.showMini();
    await api.window.setAlwaysOnTop(true);

    expect(invoke.mock.calls).toEqual([
      [IPC.sessionSnapshot],
      [IPC.sessionStart],
      [IPC.sessionPause],
      [IPC.sessionResume],
      [IPC.sessionComplete],
      [IPC.sessionUpdateSettings, settings],
      [IPC.sessionUpdateNote, 'note'],
      [IPC.sessionEditSegments, { sessionId: 'active-session', segments }],
      [IPC.sessionRecovery, 'restore'],
      [IPC.historyList, query],
      [IPC.historyDelete, 'session-1'],
      [IPC.historyEditSegments, { sessionId: 'history-session', segments }],
      [IPC.historyExportCsv, query],
      [IPC.settingsGet],
      [IPC.settingsSave, { ...settings, miniAlwaysOnTop: false }],
      [IPC.windowShowMain],
      [IPC.windowShowMini],
      [IPC.windowSetAlwaysOnTop, true],
    ]);
    expect(invoke.mock.calls.every(([channel]) => Object.values(IPC).includes(channel))).toBe(true);
  });

  it('subscribes without exposing the event and returns an unsubscribe function', async () => {
    await import('../../../src/preload/index');
    const api = exposeInMainWorld.mock.calls[0][1];
    const listener = vi.fn();
    const snapshot = { session: null };

    const unsubscribe = api.session.subscribe(listener);
    expect(on).toHaveBeenCalledWith(IPC.sessionSnapshot, expect.any(Function));
    const wrappedListener = on.mock.calls[0][1];
    wrappedListener({ secretEvent: true }, snapshot);

    expect(listener).toHaveBeenCalledWith(snapshot);
    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ secretEvent: true }), snapshot);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(IPC.sessionSnapshot, wrappedListener);
  });

  it('decodes structured IPC errors from Electron-prefixed messages', async () => {
    const fieldErrors = [{ code: 'open-segment', segmentIndex: 0, field: 'endedAt', message: 'segment is open' }];
    invoke.mockRejectedValue(new Error(
      `Error invoking remote method 'session:update-note': Error: ${IPC_ERROR_PREFIX}${JSON.stringify({
        code: 'validation-error',
        message: 'Invalid note',
        fieldErrors,
      })}`,
    ));
    await import('../../../src/preload/index');
    const api = exposeInMainWorld.mock.calls[0][1];

    await expect(api.session.updateNote('note')).rejects.toEqual({
      code: 'validation-error',
      message: 'Invalid note',
      fieldErrors,
    });
  });

  it('normalizes unknown Electron errors for every invoke API without leaking details', async () => {
    invoke.mockRejectedValue(new Error('Error invoking remote method: database connection secret'));
    await import('../../../src/preload/index');
    const api = exposeInMainWorld.mock.calls[0][1];
    const calls = [
      () => api.session.getSnapshot(),
      () => api.session.start(),
      () => api.session.pause(),
      () => api.session.resume(),
      () => api.session.complete(),
      () => api.session.updateSettings({ billingMode: 'minute', hourlyRateYuan: 40, hourlyCommissionYuan: 3 }),
      () => api.session.updateNote('note'),
      () => api.session.editSegments({ sessionId: 'active-session', segments: [] }),
      () => api.session.recover('restore'),
      () => api.history.list({}),
      () => api.history.delete('session-1'),
      () => api.history.editSegments({ sessionId: 'history-session', segments: [] }),
      () => api.history.exportCsv({}),
      () => api.settings.get(),
      () => api.settings.save({ billingMode: 'minute', hourlyRateYuan: 40, hourlyCommissionYuan: 3, miniAlwaysOnTop: false }),
      () => api.window.showMain(),
      () => api.window.showMini(),
      () => api.window.setAlwaysOnTop(true),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toEqual({
        code: 'internal-error',
        message: 'An internal error occurred.',
      });
    }
    expect(invoke).toHaveBeenCalledTimes(18);
  });
});

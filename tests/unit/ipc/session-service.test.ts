import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../../../src/main/ipc/channels';
import { registerIpc } from '../../../src/main/ipc/register-ipc';
import { ExportService, serializeSessionsToCsv } from '../../../src/main/services/export-service';
import { SessionService } from '../../../src/main/services/session-service';
import { SettingsService } from '../../../src/main/services/settings-service';
import type { Session } from '../../../src/shared/domain/session-machine';
import type { AppSettings, SessionSnapshot } from '../../../src/shared/domain/types';
import { buildSession, defaultSettings } from '../../fixtures/domain';
import { InMemoryRepository } from '../../fixtures/in-memory-repository';

const SECOND = 1_000;

function runningSession(overrides: Partial<Session> = {}): Session {
  return buildSession({
    id: 'active-session',
    status: 'running',
    segments: [{ sequence: 0, startedAt: SECOND, endedAt: null }],
    ...overrides,
  });
}

function createService(input: {
  repository?: InMemoryRepository;
  now?: number;
  ids?: string[];
} = {}) {
  const repository = input.repository ?? new InMemoryRepository();
  let now = input.now ?? SECOND;
  const ids = [...(input.ids ?? ['generated-session'])];
  const service = new SessionService(repository, () => now, () => ids.shift() ?? 'fallback-id');
  return {
    repository,
    service,
    setNow(value: number) {
      now = value;
    },
  };
}

describe('SessionService', () => {
  it('returns an idle snapshot when there is no active session', () => {
    const { service } = createService();

    expect(service.getSnapshot()).toEqual({
      session: null,
      runtime: {
        status: 'idle',
        effectiveSeconds: 0,
        effectiveMinutes: 0,
        billedMinutes: 0,
        grossAmountCents: 0,
        commissionAmountCents: 0,
        currentSegmentIndex: null,
      },
      recoveryRequired: false,
    });
  });

  it.each(['running', 'paused'] as const)('marks a discovered %s session for recovery', (status) => {
    const session = runningSession(
      status === 'paused'
        ? { status, segments: [{ sequence: 0, startedAt: SECOND, endedAt: 61 * SECOND }] }
        : { status },
    );
    const { service } = createService({
      repository: new InMemoryRepository({ sessions: [session] }),
      now: 121 * SECOND,
    });

    expect(service.getSnapshot()).toMatchObject({
      session,
      runtime: { status },
      recoveryRequired: true,
    });
  });

  it('runs start, pause, resume, and complete through transactions', () => {
    const { service, repository, setNow } = createService({ ids: ['session-1'] });

    const started = service.start();
    expect(started).toMatchObject({
      session: { id: 'session-1', status: 'running', settings: defaultSettings },
      runtime: { status: 'running', effectiveSeconds: 0 },
      recoveryRequired: false,
    });

    setNow(61 * SECOND);
    expect(service.pause()).toMatchObject({
      session: { status: 'paused' },
      runtime: { status: 'paused', effectiveSeconds: 60 },
    });

    setNow(121 * SECOND);
    expect(service.resume()).toMatchObject({
      session: {
        status: 'running',
        segments: [
          { startedAt: SECOND, endedAt: 61 * SECOND },
          { startedAt: 121 * SECOND, endedAt: null },
        ],
      },
    });

    setNow(181 * SECOND);
    expect(service.complete()).toMatchObject({
      session: { status: 'completed' },
      runtime: { status: 'completed', effectiveSeconds: 120 },
      recoveryRequired: false,
    });
    expect(repository.findActive()).toBeNull();
    expect(repository.transactionCount).toBe(4);
    expect(repository.insertCount).toBe(1);
    expect(repository.updateCount).toBe(3);
  });

  it('rejects a second active session before writing', () => {
    const repository = new InMemoryRepository({ sessions: [runningSession()] });
    const { service } = createService({ repository });

    expect(() => service.start()).toThrow('active session already exists');
    expect(repository.transactionCount).toBe(0);
    expect(repository.insertCount).toBe(0);
  });

  it('updates settings, note, and segments and persists each whole session transactionally', () => {
    const repository = new InMemoryRepository({ sessions: [runningSession()] });
    const { service } = createService({ repository, now: 121 * SECOND });
    const settings = { ...defaultSettings, billingMode: 'minute' as const, hourlyRateYuan: 60 };

    expect(service.updateSettings(settings)).toMatchObject({
      session: { settings },
      runtime: { grossAmountCents: 200 },
    });
    expect(service.updateNote('  comma, quote " and newline\n  ')).toMatchObject({
      session: { note: 'comma, quote " and newline' },
    });
    expect(
      service.editSegments([
        { sequence: 0, startedAt: SECOND, endedAt: 61 * SECOND },
        { sequence: 1, startedAt: 91 * SECOND, endedAt: null },
      ]),
    ).toMatchObject({ runtime: { effectiveSeconds: 90 } });

    expect(repository.transactionCount).toBe(3);
    expect(repository.updateCount).toBe(3);
    expect(repository.findActive()).toMatchObject({
      settings,
      note: 'comma, quote " and newline',
      segments: [
        { startedAt: SECOND, endedAt: 61 * SECOND },
        { startedAt: 91 * SECOND, endedAt: null },
      ],
    });
  });

  it.each(['pause', 'resume', 'complete', 'updateSettings', 'updateNote', 'editSegments'] as const)(
    'fails %s clearly when no active session exists',
    (operation) => {
      const { service } = createService();
      const calls = {
        pause: () => service.pause(),
        resume: () => service.resume(),
        complete: () => service.complete(),
        updateSettings: () => service.updateSettings(defaultSettings),
        updateNote: () => service.updateNote('note'),
        editSegments: () => service.editSegments([{ startedAt: SECOND, endedAt: 2 * SECOND }]),
      };

      expect(calls[operation]).toThrow('active session does not exist');
    },
  );

  it('restores an active session without writing and clears the recovery prompt', () => {
    const session = runningSession();
    const repository = new InMemoryRepository({ sessions: [session] });
    const { service } = createService({ repository, now: 61 * SECOND });

    expect(service.handleRecovery('restore')).toMatchObject({
      snapshot: { session, runtime: { effectiveSeconds: 60 }, recoveryRequired: false },
    });
    expect(repository.transactionCount).toBe(0);
  });

  it('discards a running session by closing and invalidating it transactionally', () => {
    const repository = new InMemoryRepository({ sessions: [runningSession()] });
    const { service } = createService({ repository, now: 61 * SECOND });

    const result = service.handleRecovery('discard');

    expect(result).toMatchObject({
      invalidatedSession: {
        status: 'invalid',
        invalidReason: 'restart-discard',
        invalidatedAt: 61 * SECOND,
        segments: [{ endedAt: 61 * SECOND }],
      },
      snapshot: { session: null, runtime: { status: 'idle' }, recoveryRequired: false },
    });
    expect(result.newSession).toBeUndefined();
    expect(repository.transactionCount).toBe(1);
    expect(repository.updateCount).toBe(1);
  });

  it('discards a paused session without changing its closed segment', () => {
    const paused = runningSession({
      status: 'paused',
      segments: [{ sequence: 0, startedAt: SECOND, endedAt: 31 * SECOND }],
    });
    const repository = new InMemoryRepository({ sessions: [paused] });
    const { service } = createService({ repository, now: 61 * SECOND });

    expect(service.handleRecovery('discard').invalidatedSession?.segments).toEqual(paused.segments);
  });

  it('invalidates and restarts atomically with the previous settings and note', () => {
    const original = runningSession({
      settings: { ...defaultSettings, billingMode: 'minute', hourlyRateYuan: 88 },
      note: 'keep this note',
    });
    const repository = new InMemoryRepository({ sessions: [original] });
    const { service } = createService({ repository, now: 61 * SECOND, ids: ['replacement'] });

    const result = service.handleRecovery('restart-new-session');

    expect(result).toMatchObject({
      invalidatedSession: { id: original.id, status: 'invalid', invalidReason: 'restart-new-session' },
      newSession: {
        id: 'replacement',
        status: 'running',
        settings: original.settings,
        note: original.note,
      },
      snapshot: {
        session: { id: 'replacement' },
        runtime: { status: 'running', effectiveSeconds: 0 },
        recoveryRequired: false,
      },
    });
    expect(repository.transactionCount).toBe(1);
    expect(repository.updateCount).toBe(1);
    expect(repository.insertCount).toBe(1);
  });

  it('maps snapshot calculation failures to serializable snapshot errors', () => {
    const malformed = runningSession({ segments: [{ startedAt: SECOND, endedAt: 2 * SECOND }] });
    const { service } = createService({
      repository: new InMemoryRepository({ sessions: [malformed] }),
      now: 3 * SECOND,
    });

    const snapshot = service.getSnapshot();

    expect(snapshot.error).toEqual({
      code: 'session-snapshot-error',
      message: 'A running session must have an open final segment',
    });
    expect(snapshot.error).not.toBeInstanceOf(Error);
  });
});

describe('SettingsService', () => {
  it('gets settings and returns the saved settings', () => {
    const repository = new InMemoryRepository();
    const service = new SettingsService(repository);
    const settings: AppSettings = {
      ...defaultSettings,
      miniAlwaysOnTop: true,
      mainWindowBounds: { x: 1, y: 2, width: 800, height: 600 },
    };

    expect(service.get()).toEqual({ ...defaultSettings, miniAlwaysOnTop: false });
    expect(service.save(settings)).toEqual(settings);
    expect(repository.saveSettingsCount).toBe(1);
    expect(repository.transactionCount).toBe(1);
  });
});

describe('ExportService', () => {
  it('quotes commas, double quotes, and newlines using RFC4180 escaping', () => {
    const csv = serializeSessionsToCsv([
      buildSession({
        id: 'csv-1',
        note: 'comma, quote " and newline\nnext',
        segments: [{ startedAt: SECOND, endedAt: 61 * SECOND }],
      }),
    ]);

    expect(csv).toBe(
      'id,status,startedAt,endedAt,effectiveMinutes,billedMinutes,grossAmountCents,commissionAmountCents,note\r\n' +
        '"csv-1","completed","1000","61000","0","0","0","0","comma, quote "" and newline\nnext"',
    );
  });

  it('writes queried history and returns the selected path and row count', async () => {
    const repository = new InMemoryRepository({ sessions: [buildSession({ id: 'csv-1' })] });
    const writeFile = vi.fn<(path: string, contents: string) => Promise<void>>().mockResolvedValue();
    const service = new ExportService(repository, async () => '/tmp/history.csv', writeFile);

    await expect(service.exportCsv({ status: 'completed' })).resolves.toEqual({
      filePath: '/tmp/history.csv',
      rowCount: 1,
    });
    expect(writeFile).toHaveBeenCalledWith('/tmp/history.csv', expect.stringContaining('"csv-1"'));
  });
});

describe('registerIpc', () => {
  it('registers only the fixed handlers, delegates actions, and unregisters cleanly', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    };
    const snapshot = { marker: 'snapshot' } as unknown as SessionSnapshot;
    const session = {
      getSnapshot: vi.fn(() => snapshot),
      start: vi.fn(() => snapshot),
      pause: vi.fn(() => snapshot),
      resume: vi.fn(() => snapshot),
      complete: vi.fn(() => snapshot),
      updateSettings: vi.fn(() => snapshot),
      updateNote: vi.fn(() => snapshot),
      editSegments: vi.fn(() => snapshot),
      handleRecovery: vi.fn(() => ({ snapshot })),
    };
    const history = {
      list: vi.fn(() => []),
      delete: vi.fn(),
      exportCsv: vi.fn(() => ({ filePath: '/tmp/a.csv', rowCount: 0 })),
    };
    const settings = {
      get: vi.fn(() => ({ ...defaultSettings, miniAlwaysOnTop: false })),
      save: vi.fn((value: AppSettings) => value),
    };
    const window = {
      showMain: vi.fn(),
      showMini: vi.fn(),
      setAlwaysOnTop: vi.fn((value: boolean) => value),
    };

    const unregister = registerIpc({ ipcMain, session, history, settings, window });

    expect([...handlers.keys()].sort()).toEqual(Object.values(IPC).sort());
    await expect(handlers.get(IPC.sessionStart)?.({ hidden: true })).resolves.toBe(snapshot);
    await expect(handlers.get(IPC.sessionUpdateNote)?.({}, 'hello')).resolves.toBe(snapshot);
    await expect(handlers.get(IPC.historyList)?.({}, { status: 'completed' })).resolves.toEqual([]);
    await expect(handlers.get(IPC.settingsSave)?.({}, { value: 2 })).resolves.toEqual({ value: 2 });
    await expect(handlers.get(IPC.windowSetAlwaysOnTop)?.({}, true)).resolves.toBe(true);
    expect(session.updateNote).toHaveBeenCalledWith('hello');
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true);

    unregister();
    expect(handlers).toHaveLength(0);
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(Object.keys(IPC).length);
  });

  it('broadcasts snapshots without exposing the sender object', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    };
    const snapshot = { marker: 'snapshot' } as unknown as SessionSnapshot;
    const send = vi.fn();
    const dependencies = {
      ipcMain,
      session: {
        getSnapshot: () => snapshot,
        start: () => snapshot,
        pause: () => snapshot,
        resume: () => snapshot,
        complete: () => snapshot,
        updateSettings: () => snapshot,
        updateNote: () => snapshot,
        editSegments: () => snapshot,
        handleRecovery: () => ({ snapshot }),
      },
      history: { list: () => [], delete: () => undefined, exportCsv: () => ({ filePath: '', rowCount: 0 }) },
      settings: { get: () => ({ ...defaultSettings, miniAlwaysOnTop: false }), save: (value: AppSettings) => value },
      window: { showMain: () => undefined, showMini: () => undefined, setAlwaysOnTop: (value: boolean) => value },
      snapshotTargets: () => [{ send }],
    };

    const registration = registerIpc(dependencies);
    registration.broadcastSnapshot(snapshot);

    expect(send).toHaveBeenCalledWith(IPC.sessionSnapshot, snapshot);
    registration.unregister();
  });

  it('rejects handler errors as plain structured errors with stable domain codes', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    };
    const domainError = new Error('active session already exists');
    const dependencies = {
      ipcMain,
      session: {
        getSnapshot: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        start: () => {
          throw domainError;
        },
        pause: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        resume: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        complete: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        updateSettings: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        updateNote: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        editSegments: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        handleRecovery: () => ({ snapshot: ({ marker: 'snapshot' }) as unknown as SessionSnapshot }),
      },
      history: { list: () => [], delete: () => undefined, exportCsv: () => ({ filePath: '', rowCount: 0 }) },
      settings: { get: () => ({ ...defaultSettings, miniAlwaysOnTop: false }), save: (value: AppSettings) => value },
      window: { showMain: () => undefined, showMini: () => undefined, setAlwaysOnTop: (value: boolean) => value },
    };

    const registration = registerIpc(dependencies);

    const domainResult = await Promise.resolve(handlers.get(IPC.sessionStart)?.({})).catch((error: unknown) => error);
    expect(domainResult).toEqual({
      code: 'session-active-exists',
      message: 'active session already exists',
    });
    expect(domainResult).not.toBeInstanceOf(Error);

    dependencies.session.start = () => {
      throw new Error('database connection secret');
    };
    const internalResult = await Promise.resolve(handlers.get(IPC.sessionStart)?.({})).catch((error: unknown) => error);
    expect(internalResult).toEqual({
      code: 'internal-error',
      message: 'An internal error occurred.',
    });
    expect(internalResult).not.toBeInstanceOf(Error);

    dependencies.session.start = () => {
      throw {
        code: 'SQLITE_BUSY',
        message: 'database connection secret',
        stack: 'private stack',
        Database: { path: '/private/database.sqlite' },
        Event: { sender: 'private event' },
      };
    };
    await expect(handlers.get(IPC.sessionStart)?.({})).rejects.toEqual({
      code: 'internal-error',
      message: 'An internal error occurred.',
    });

    registration.unregister();
  });

  it('preserves serializable field errors while rejecting a domain validation error', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    };
    const fieldErrors = [{ code: 'open-segment', segmentIndex: 0, field: 'endedAt', message: 'segment is open' }];
    const dependencies = {
      ipcMain,
      session: {
        getSnapshot: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        start: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        pause: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        resume: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        complete: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        updateSettings: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        updateNote: () => {
          throw { code: 'validation-error', message: 'Invalid note', fieldErrors };
        },
        editSegments: () => ({ marker: 'snapshot' }) as unknown as SessionSnapshot,
        handleRecovery: () => ({ snapshot: ({ marker: 'snapshot' }) as unknown as SessionSnapshot }),
      },
      history: { list: () => [], delete: () => undefined, exportCsv: () => ({ filePath: '', rowCount: 0 }) },
      settings: { get: () => ({ ...defaultSettings, miniAlwaysOnTop: false }), save: (value: AppSettings) => value },
      window: { showMain: () => undefined, showMini: () => undefined, setAlwaysOnTop: (value: boolean) => value },
    };

    const registration = registerIpc(dependencies);

    await expect(handlers.get(IPC.sessionUpdateNote)?.({}, 'note')).rejects.toEqual({
      code: 'validation-error',
      message: 'Invalid note',
      fieldErrors,
    });
    registration.unregister();
  });

  it('automatically broadcasts snapshots after every session write', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    };
    const snapshot = { marker: 'snapshot' } as unknown as SessionSnapshot;
    const recovery = { snapshot };
    const send = vi.fn();
    const dependencies = {
      ipcMain,
      session: {
        getSnapshot: vi.fn(() => snapshot),
        start: vi.fn(() => snapshot),
        pause: vi.fn(() => snapshot),
        resume: vi.fn(() => snapshot),
        complete: vi.fn(() => snapshot),
        updateSettings: vi.fn(() => snapshot),
        updateNote: vi.fn(() => snapshot),
        editSegments: vi.fn(() => snapshot),
        handleRecovery: vi.fn(() => recovery),
      },
      history: { list: vi.fn(() => []), delete: vi.fn(), exportCsv: vi.fn(() => ({ filePath: '', rowCount: 0 })) },
      settings: { get: vi.fn(() => ({ ...defaultSettings, miniAlwaysOnTop: false })), save: vi.fn((value: AppSettings) => value) },
      window: { showMain: vi.fn(), showMini: vi.fn(), setAlwaysOnTop: vi.fn((value: boolean) => value) },
      snapshotTargets: () => [{ send }],
    };
    const registration = registerIpc(dependencies);

    const writes: Array<[string, unknown[]]> = [
      [IPC.sessionStart, []],
      [IPC.sessionPause, []],
      [IPC.sessionResume, []],
      [IPC.sessionComplete, []],
      [IPC.sessionUpdateSettings, [defaultSettings]],
      [IPC.sessionUpdateNote, ['note']],
      [IPC.sessionEditSegments, [[]]],
    ];
    for (const [channel, args] of writes) {
      send.mockClear();
      await handlers.get(channel)?.({}, ...args);
      expect(send).toHaveBeenCalledWith(IPC.sessionSnapshot, snapshot);
    }

    for (const choice of ['restore', 'discard', 'restart-new-session'] as const) {
      send.mockClear();
      await handlers.get(IPC.sessionRecovery)?.({}, choice);
      expect(send).toHaveBeenCalledWith(IPC.sessionSnapshot, snapshot);
    }

    send.mockClear();
    await handlers.get(IPC.sessionSnapshot)?.({});
    await handlers.get(IPC.historyList)?.({}, {});
    await handlers.get(IPC.historyDelete)?.({}, 'id');
    await handlers.get(IPC.historyExportCsv)?.({}, {});
    await handlers.get(IPC.settingsGet)?.({});
    await handlers.get(IPC.settingsSave)?.({}, {});
    await handlers.get(IPC.windowShowMain)?.({});
    await handlers.get(IPC.windowShowMini)?.({});
    await handlers.get(IPC.windowSetAlwaysOnTop)?.({}, true);
    expect(send).toHaveBeenCalledTimes(0);

    registration.unregister();
  });

  it('broadcasts a recovery result snapshot rather than invalidated session details', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    };
    const snapshot = { marker: 'new-session-snapshot' } as unknown as SessionSnapshot;
    const send = vi.fn();
    const registration = registerIpc({
      ipcMain,
      session: {
        getSnapshot: () => snapshot,
        start: () => snapshot,
        pause: () => snapshot,
        resume: () => snapshot,
        complete: () => snapshot,
        updateSettings: () => snapshot,
        updateNote: () => snapshot,
        editSegments: () => snapshot,
        handleRecovery: () => ({
          invalidatedSession: buildSession({ id: 'invalidated' }),
          newSession: buildSession({ id: 'new' }),
          snapshot,
        }),
      },
      history: { list: () => [], delete: () => undefined, exportCsv: () => ({ filePath: '', rowCount: 0 }) },
      settings: { get: () => ({ ...defaultSettings, miniAlwaysOnTop: false }), save: (value: AppSettings) => value },
      window: { showMain: () => undefined, showMini: () => undefined, setAlwaysOnTop: (value: boolean) => value },
      snapshotTargets: () => [{ send }],
    });

    await expect(handlers.get(IPC.sessionRecovery)?.({}, 'restart-new-session')).resolves.toMatchObject({ snapshot });
    expect(send).toHaveBeenCalledWith(IPC.sessionSnapshot, snapshot);
    registration.unregister();
  });
});

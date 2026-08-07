import { cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRendererStore } from '../../../src/renderer/app-state';
import type { PwToolApi } from '../../../src/preload/api';
import { buildSnapshot, idleSnapshot } from '../../fixtures/domain';

type SessionApiMock = {
  getSnapshot: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

const api: PwToolApi = {
  session: {
    getSnapshot: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    complete: vi.fn(),
    updateSettings: vi.fn(),
    updateNote: vi.fn(),
    editSegments: vi.fn(),
    recover: vi.fn(),
    subscribe: vi.fn(),
  },
  history: {
    list: vi.fn(),
    delete: vi.fn(),
    exportCsv: vi.fn(),
  },
  settings: {
    get: vi.fn(),
    save: vi.fn(),
  },
  window: {
    showMain: vi.fn(),
    showMini: vi.fn(),
    setAlwaysOnTop: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  const session = api.session as unknown as SessionApiMock;
  session.getSnapshot.mockResolvedValue(idleSnapshot);
  session.subscribe.mockReturnValue(vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('renderer store cleanup', () => {
  it('returns cleanup from start and clears subscription plus interval on unmount', async () => {
    const store = createRendererStore(api, () => 123_000);
    const cleanupFn = store.start();

    expect(typeof cleanupFn).toBe('function');
    expect(api.session.subscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    cleanupFn();

    expect(api.session.subscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns the cleanup function from a store consumer effect on unmount', () => {
    const cleanupFn = vi.fn();
    const store = {
      start: vi.fn(() => cleanupFn),
    };

    function Consumer() {
      useEffect(() => store.start(), [store]);
      return null;
    }

    const { unmount } = render(<Consumer />);

    expect(store.start).toHaveBeenCalledOnce();

    unmount();

    expect(cleanupFn).toHaveBeenCalledOnce();
  });

  it('normalizes updated snapshots without breaking ready state rendering', () => {
    const store = createRendererStore(api);

    store.acceptSnapshot(buildSnapshot({ session: null }));

    expect(store.getState().status).toBe('ready');
  });
});

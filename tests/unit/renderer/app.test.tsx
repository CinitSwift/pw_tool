import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PwToolApi } from '../../../src/preload/api';
import { buildSnapshot, idleSnapshot, runningSnapshot } from '../../fixtures/domain';

type AppComponent = typeof import('../../../src/renderer/App').default;

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
    editSegments: vi.fn(),
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

function setWindowMode(mode: 'main' | 'mini'): void {
  window.history.replaceState({}, '', mode === 'mini' ? '?window=mini' : '/');
}

async function loadApp(): Promise<AppComponent> {
  const module = await import('../../../src/renderer/App');
  return module.default;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(window, 'setInterval').mockImplementation(((..._args: Parameters<typeof setInterval>) => 0 as unknown as number) as typeof window.setInterval);
  vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
  Object.defineProperty(window, 'pwTool', { configurable: true, value: api });
  vi.mocked(api.session.subscribe).mockReturnValue(vi.fn());
  vi.mocked(api.session.getSnapshot).mockResolvedValue(idleSnapshot);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

describe('App', () => {
  it('renders a startup error page when the main window is opened with a database startup failure', async () => {
    window.history.replaceState({}, '', '?window=main&startupError=database');
    const App = await loadApp();

    render(<App />);

    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByText('无法启动应用')).toBeVisible();
    expect(screen.getByText('本地数据库初始化失败，请检查本地数据后重试。')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
  });

  it('renders the mini timer shell when opened in mini mode', async () => {
    setWindowMode('mini');
    const App = await loadApp();

    render(<App />);

    expect(screen.getByText('迷你计时窗')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
    expect(screen.getByText('正在等待主窗口快照')).toBeVisible();
  });

  it('renders the main timer shell and keeps the shared store subscription', async () => {
    setWindowMode('main');
    vi.mocked(api.session.getSnapshot).mockResolvedValue(buildSnapshot({ session: runningSnapshot.session, runtime: runningSnapshot.runtime }));
    const App = await loadApp();

    render(<App />);

    expect(screen.getByRole('navigation', { name: '主导航' })).toBeVisible();
    expect(screen.getByText('计时')).toBeVisible();
    expect(api.session.subscribe).toHaveBeenCalledOnce();
  });
});

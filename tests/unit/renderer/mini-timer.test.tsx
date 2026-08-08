import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PwToolApi } from '../../../src/preload/api';
import { buildSnapshot, runningSnapshot } from '../../fixtures/domain';

type MiniTimerProps = { snapshot: typeof runningSnapshot; api?: PwToolApi };
type MiniTimerComponent = ComponentType<MiniTimerProps>;

function miniTimerModulePath(): string {
  return ['..', '..', '..', 'src', 'renderer', 'features', 'mini', 'MiniTimer'].join('/');
}

function createApi(overrides: Partial<PwToolApi> = {}): PwToolApi {
  return {
    session: {
      getSnapshot: vi.fn().mockResolvedValue(runningSnapshot),
      start: vi.fn(),
      pause: vi.fn().mockResolvedValue(runningSnapshot),
      resume: vi.fn().mockResolvedValue(runningSnapshot),
      complete: vi.fn().mockResolvedValue(buildSnapshot({ session: runningSnapshot.session })),
      updateSettings: vi.fn(),
      updateNote: vi.fn(),
      editSegments: vi.fn(),
      recover: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    },
    history: {
      list: vi.fn(),
      delete: vi.fn(),
      editSegments: vi.fn(),
      exportCsv: vi.fn(),
    },
    settings: { get: vi.fn(), save: vi.fn() },
    window: {
      showMain: vi.fn(),
      showMini: vi.fn(),
      setAlwaysOnTop: vi.fn().mockResolvedValue(true),
    },
    ...overrides,
  } as PwToolApi;
}

async function loadMiniTimer(): Promise<MiniTimerComponent> {
  const module = await import(miniTimerModulePath());
  return module.MiniTimer as MiniTimerComponent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('MiniTimer', () => {
  it('renders the shared running snapshot with status, duration, gross amount and commission', async () => {
    const MiniTimer = await loadMiniTimer();

    render(<MiniTimer snapshot={runningSnapshot} />);

    expect(screen.getByText('计时中')).toBeVisible();
    expect(screen.getByText('有效时长')).toBeVisible();
    expect(screen.getByText('当前应得')).toBeVisible();
    expect(screen.getByText('当前抽成')).toBeVisible();
    expect(screen.getByText('¥0.00')).toBeVisible();
    expect(screen.getByText('0 计费分钟')).toBeVisible();
    expect(screen.getByText('本局参数')).toBeVisible();
  });

  it('calls the shared session and window API for pause, resume, complete, show-main and always-on-top', async () => {
    const user = userEvent.setup();
    const api = createApi();
    const MiniTimer = await loadMiniTimer();

    render(<MiniTimer snapshot={runningSnapshot} api={api} />);

    await user.click(screen.getByRole('button', { name: '暂停计时' }));
    await waitFor(() => expect(api.session.pause).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: '继续计时' }));
    await waitFor(() => expect(api.session.resume).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: '结束本局' }));
    await waitFor(() => expect(api.session.complete).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: '显示主窗口' }));
    await waitFor(() => expect(api.window.showMain).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('switch', { name: '置顶' }));
    await waitFor(() => expect(api.window.setAlwaysOnTop).toHaveBeenCalledWith(true));
  });

  it('keeps the mini timer synchronized with a changed snapshot', async () => {
    const MiniTimer = await loadMiniTimer();
    const nextSnapshot = buildSnapshot({
      session: runningSnapshot.session,
      runtime: {
        ...runningSnapshot.runtime,
        status: 'running',
        effectiveSeconds: 5_322,
        effectiveMinutes: 89,
        grossAmountCents: 6_000,
        commissionAmountCents: 450,
      },
    });

    const { rerender } = render(<MiniTimer snapshot={runningSnapshot} />);
    rerender(<MiniTimer snapshot={nextSnapshot} />);

    expect(screen.getByText('01:28:42')).toBeVisible();
    expect(screen.getByText('¥60.00')).toBeVisible();
    expect(screen.getByText('抽成 ¥4.50')).toBeVisible();
  });
});

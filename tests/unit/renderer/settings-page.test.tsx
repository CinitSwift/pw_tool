import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PwToolApi } from '../../../src/preload/api';
import { defaultSettings } from '../../fixtures/domain';

type SettingsPageProps = { api: PwToolApi };
type SettingsPageComponent = ComponentType<SettingsPageProps>;

function settingsPageModulePath(): string {
  return ['..', '..', '..', 'src', 'renderer', 'features', 'settings', 'SettingsPage'].join('/');
}

function createApi(overrides: Partial<PwToolApi> = {}): PwToolApi {
  const defaultAppSettings = { ...defaultSettings, miniAlwaysOnTop: false };
  return {
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
      get: vi.fn().mockResolvedValue(defaultAppSettings),
      save: vi.fn().mockResolvedValue(defaultAppSettings),
    },
    window: {
      showMain: vi.fn(),
      showMini: vi.fn(),
      setAlwaysOnTop: vi.fn(),
    },
    ...overrides,
  } as PwToolApi;
}

async function loadSettingsPage(): Promise<SettingsPageComponent> {
  const module = await import(settingsPageModulePath());
  return module.SettingsPage as SettingsPageComponent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('SettingsPage', () => {
  it('saves default billing parameters without touching any session API', async () => {
    const user = userEvent.setup();
    const api = createApi();
    const SettingsPage = await loadSettingsPage();

    render(<SettingsPage api={api} />);

    await user.clear(screen.getByLabelText('每小时单价'));
    await user.type(screen.getByLabelText('每小时单价'), '50');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({
      billingMode: '15-step',
      hourlyRateYuan: 50,
      hourlyCommissionYuan: 3,
      miniAlwaysOnTop: false,
    })));
    expect(api.session.start).not.toHaveBeenCalled();
    expect(api.session.pause).not.toHaveBeenCalled();
    expect(api.session.resume).not.toHaveBeenCalled();
    expect(api.session.complete).not.toHaveBeenCalled();
    expect(api.session.updateSettings).not.toHaveBeenCalled();
    expect(api.session.updateNote).not.toHaveBeenCalled();
    expect(api.session.editSegments).not.toHaveBeenCalled();
    expect(api.session.recover).not.toHaveBeenCalled();
  });

  it('toggles always-on-top through window API and persists the saved state', async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.window.setAlwaysOnTop).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(api.settings.save).mockResolvedValue({ ...defaultSettings, miniAlwaysOnTop: true });
    const SettingsPage = await loadSettingsPage();

    render(<SettingsPage api={api} />);

    await user.click(screen.getByRole('switch', { name: '迷你窗置顶' }));

    await waitFor(() => expect(api.window.setAlwaysOnTop).toHaveBeenCalledWith(true));
    await waitFor(() => expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({ miniAlwaysOnTop: true })));

    await user.click(screen.getByRole('switch', { name: '迷你窗置顶' }));

    await waitFor(() => expect(api.window.setAlwaysOnTop).toHaveBeenLastCalledWith(false));
    await waitFor(() => expect(api.settings.save).toHaveBeenLastCalledWith(expect.objectContaining({ miniAlwaysOnTop: false })));
  });

  it('shows offline-only copy and local data directory guidance', async () => {
    const api = createApi();
    const SettingsPage = await loadSettingsPage();

    render(<SettingsPage api={api} />);

    expect(screen.getByText('完全离线')).toBeVisible();
    expect(screen.getByText('不登录')).toBeVisible();
    expect(screen.getByText('不云同步')).toBeVisible();
    expect(screen.getByText('本地数据目录')).toBeVisible();
    expect(screen.queryByText('今日收入')).not.toBeInTheDocument();
    expect(screen.queryByText('统计')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看统计' })).not.toBeInTheDocument();
  });
});

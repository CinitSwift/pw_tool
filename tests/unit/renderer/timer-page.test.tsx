import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleState } from '../../../src/renderer/features/timer/IdleState';
import { PausedState } from '../../../src/renderer/features/timer/PausedState';
import { RunningState } from '../../../src/renderer/features/timer/RunningState';
import { CompletedState } from '../../../src/renderer/features/timer/CompletedState';
import { TimerPage } from '../../../src/renderer/features/timer/TimerPage';
import { BillingSettingsPopover } from '../../../src/renderer/features/timer/BillingSettingsPopover';
import { idleSnapshot, pausedSnapshot, runningSnapshot, buildSnapshot, buildSession } from '../../fixtures/domain';

const api = {
  session: {
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    complete: vi.fn(),
    updateSettings: vi.fn(),
    updateNote: vi.fn(),
    editSegments: vi.fn(),
  },
  history: {
    editSegments: vi.fn(),
  },
  settings: { save: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.session.start.mockResolvedValue(idleSnapshot);
  api.session.pause.mockResolvedValue(pausedSnapshot);
  api.session.resume.mockResolvedValue(runningSnapshot);
  api.session.complete.mockResolvedValue(buildSnapshot({ session: buildSession() }));
  api.session.updateSettings.mockResolvedValue(runningSnapshot);
  api.session.updateNote.mockResolvedValue(runningSnapshot);
  api.session.editSegments.mockResolvedValue(runningSnapshot);
  api.history.editSegments.mockResolvedValue(buildSession());
  Object.assign(api.settings, { get: vi.fn().mockResolvedValue({ billingMode: '15-step', hourlyRateYuan: 40, hourlyCommissionYuan: 3, miniAlwaysOnTop: false }) });
  api.settings.save.mockResolvedValue({ ...runningSnapshot.session?.settings, miniAlwaysOnTop: false });
});

afterEach(() => cleanup());

describe('TimerPage states', () => {
  it('shows start as the only primary action when idle and no statistics cards', () => {
    render(<IdleState snapshot={idleSnapshot} api={api as never} />);

    expect(screen.getByRole('button', { name: '开始计时' })).toBeVisible();
    expect(screen.queryByText('今日收入')).not.toBeInTheDocument();
    expect(screen.queryByText('今日局数')).not.toBeInTheDocument();
  });

  it('shows continue as the primary action when paused', () => {
    render(<PausedState snapshot={pausedSnapshot} api={api as never} />);

    expect(screen.getByRole('button', { name: '继续计时' })).toHaveClass('primary');
    expect(screen.getByText('计时已暂停')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '继续计时' }));
    expect(api.session.resume).toHaveBeenCalledOnce();
  });

  it('renders running actions and sends pause and complete commands', () => {
    render(<RunningState snapshot={runningSnapshot} api={api as never} />);

    fireEvent.click(screen.getByRole('button', { name: '暂停计时' }));

    expect(api.session.pause).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '结束本局' })).toBeVisible();
    expect(screen.getByRole('button', { name: '调整时间' })).toBeVisible();
    expect(screen.getByText(/本段已计/)).toBeVisible();
  });

  it('edits current-session segments through session.editSegments', async () => {
    render(<PausedState snapshot={pausedSnapshot} api={api as never} />);

    fireEvent.click(screen.getByRole('button', { name: '调整时间' }));
    const dialog = screen.getByRole('dialog', { name: '调整时间' });
    expect(dialog).toBeVisible();
    fireEvent.change(screen.getByLabelText('第 1 段开始时间'), { target: { value: '1970-01-01T08:00:05' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(api.session.editSegments).toHaveBeenCalledWith({
      sessionId: pausedSnapshot.session?.id,
      segments: [{ sequence: 0, startedAt: 5_000, endedAt: 60_000 }],
    }));
    expect(api.history.editSegments).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '调整时间' })).not.toBeInTheDocument());
  });

  it('keeps completed-session editor open and shows save error when segment save fails', async () => {
    const completed = buildSnapshot({
      session: buildSession({
        id: 'completed-session',
        status: 'completed',
        segments: [{ sequence: 0, startedAt: 0, endedAt: 60_000 }],
      }),
      runtime: { ...idleSnapshot.runtime, status: 'completed', effectiveSeconds: 60, effectiveMinutes: 1 },
    });
    api.session.editSegments.mockRejectedValueOnce({ code: 'internal-error', message: 'An internal error occurred.' });

    render(<CompletedState snapshot={completed} api={api as never} />);

    fireEvent.click(screen.getByRole('button', { name: '调整时间' }));
    fireEvent.change(screen.getByLabelText('第 1 段结束时间'), { target: { value: '1970-01-01T08:01:30' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(screen.getByText('保存失败，请重试。')).toBeVisible());
    expect(api.session.editSegments).toHaveBeenCalledWith({
      sessionId: 'completed-session',
      segments: [{ sequence: 0, startedAt: 0, endedAt: 90_000 }],
    });
    expect(api.history.editSegments).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '调整时间' })).toBeVisible();
  });

  it('disables running actions while the clock is invalid', () => {
    const invalidRunning = buildSnapshot({
      ...runningSnapshot,
      runtime: { ...runningSnapshot.runtime, status: 'running', error: { code: 'clock-skew', message: 'clock moved backwards' } },
    });
    render(<RunningState snapshot={invalidRunning} api={api as never} />);

    expect(screen.getByRole('button', { name: '暂停计时' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '结束本局' })).toBeDisabled();
  });

  it('keeps the future history entry explicitly disabled after completion', () => {
    const completed = buildSnapshot({ session: buildSession({ status: 'completed' }), runtime: { ...idleSnapshot.runtime, status: 'completed' } });
    render(<CompletedState snapshot={completed} api={api as never} />);

    expect(screen.getByRole('button', { name: '查看历史' })).toBeDisabled();
  });

  it('renders completed summary and invalid zero fee', () => {
    const completed = buildSnapshot({ session: buildSession({ status: 'completed' }), runtime: { ...idleSnapshot.runtime, status: 'completed', effectiveSeconds: 60, effectiveMinutes: 1 } });
    const invalid = buildSnapshot({ session: buildSession({ status: 'invalid' }), runtime: { ...idleSnapshot.runtime, status: 'invalid' } });

    render(<TimerPage snapshot={completed} api={api as never} />);
    expect(screen.getByText('本局已完成')).toBeVisible();
    expect(screen.getByRole('button', { name: '开始新一局' })).toBeVisible();

    render(<TimerPage snapshot={invalid} api={api as never} />);
    expect(screen.getByText('记录无效')).toBeVisible();
    expect(screen.getAllByText('¥0.00').length).toBeGreaterThanOrEqual(1);
  });

  it('trims note before saving and prevents overlong note submit', async () => {
    render(<RunningState snapshot={runningSnapshot} api={api as never} />);
    fireEvent.click(screen.getAllByRole('button', { name: '添加备注' })[0]);
    const input = screen.getByRole('textbox', { name: '备注' });
    fireEvent.change(input, { target: { value: '  本局排位  ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存备注' }));
    expect(api.session.updateNote).toHaveBeenCalledWith('本局排位');

    cleanup();
    render(<RunningState snapshot={runningSnapshot} api={api as never} />);
    fireEvent.click(screen.getAllByRole('button', { name: '添加备注' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: '备注' }), { target: { value: '字'.repeat(501) } });
    expect(screen.getByText('备注不能超过 500 个字符')).toBeVisible();
    expect(screen.getByRole('button', { name: '保存备注' })).toBeDisabled();
  });

  it('keeps the note draft open when saving fails', async () => {
    api.session.updateNote.mockRejectedValueOnce({ code: 'internal-error', message: 'An internal error occurred.' });
    render(<RunningState snapshot={runningSnapshot} api={api as never} />);

    fireEvent.click(screen.getAllByRole('button', { name: '添加备注' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: '备注' }), { target: { value: '失败后保留备注' } });
    fireEvent.click(screen.getByRole('button', { name: '保存备注' }));

    await waitFor(() => expect(screen.getByText('备注保存失败，请重试。')).toBeVisible());
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('失败后保留备注');
    expect(screen.getByRole('dialog', { name: '本局备注' })).toBeVisible();
  });

  it('passes an idle billing settings save to settings API', async () => {
    render(<IdleState snapshot={idleSnapshot} api={api as never} />);
    fireEvent.click(screen.getAllByRole('button', { name: '计费设置' })[0]);
    fireEvent.change(screen.getByRole('spinbutton', { name: '每小时单价' }), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: '保存参数' }));

    await waitFor(() => expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({ hourlyRateYuan: 50 })));
    expect(api.session.updateSettings).not.toHaveBeenCalled();
  });

  it('keeps billing settings draft open when saving current-session parameters fails', async () => {
    api.session.updateSettings.mockRejectedValueOnce({ code: 'internal-error', message: 'An internal error occurred.' });
    render(<RunningState snapshot={runningSnapshot} api={api as never} />);

    fireEvent.click(screen.getAllByRole('button').find((button) => button.textContent?.includes('本局参数'))!);
    fireEvent.change(screen.getByRole('spinbutton', { name: '每小时单价' }), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: '保存参数' }));

    await waitFor(() => expect(screen.getByText('参数保存失败，当前有效结果保持不变。')).toBeVisible());
    expect(screen.getByRole('spinbutton', { name: '每小时单价' })).toHaveValue(50);
    expect(screen.getByRole('dialog', { name: '计费设置' })).toBeVisible();
  });

  it('confirms before closing dirty billing settings', () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    render(<BillingSettingsPopover api={api as never} settings={runningSnapshot.session?.settings} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: '每小时单价' }), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(window.confirm).toHaveBeenCalledOnce();
  });
});

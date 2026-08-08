import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PwToolApi } from '../../../src/preload/api';
import { HistoryPage } from '../../../src/renderer/features/history/HistoryPage';
import { buildSession } from '../../fixtures/domain';

function buildApi(records = [
  buildSession({ id: 'default-completed', status: 'completed' }),
  buildSession({ id: 'default-invalid', status: 'invalid', invalidReason: 'restart-discard' }),
]): PwToolApi {
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
      list: vi.fn().mockResolvedValue(records),
      delete: vi.fn().mockResolvedValue(undefined),
      editSegments: vi.fn().mockImplementation(async ({ sessionId, segments }) => records.find((record) => record.id === sessionId)
        ? { ...records.find((record) => record.id === sessionId)!, segments }
        : records[0]),
      exportCsv: vi.fn().mockResolvedValue({ filePath: '/tmp/history.csv', rowCount: records.length }),
    },
    settings: { get: vi.fn(), save: vi.fn() },
    window: { showMain: vi.fn(), showMini: vi.fn(), setAlwaysOnTop: vi.fn() },
  } as unknown as PwToolApi;
}

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('lists records by local date and marks invalid records', async () => {
    const records = [
      buildSession({
        id: 'completed-1',
        note: '老板A',
        status: 'completed',
        segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 0, 0), endedAt: Date.UTC(2026, 7, 6, 1, 30, 0) }],
        fee: { effectiveMinutes: 30, billedMinutes: 30, grossAmountCents: 2000, commissionAmountCents: 150 },
      }),
      buildSession({
        id: 'invalid-1',
        note: '作废备注',
        status: 'invalid',
        invalidReason: 'restart-discard',
        invalidatedAt: Date.UTC(2026, 7, 5, 3, 0, 0),
        segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 5, 2, 0, 0), endedAt: Date.UTC(2026, 7, 5, 2, 10, 0) }],
        fee: { effectiveMinutes: 0, billedMinutes: 0, grossAmountCents: 0, commissionAmountCents: 0 },
      }),
    ];
    const api = buildApi(records);

    render(<HistoryPage api={api} />);

    expect(screen.getByText('历史记录')).toBeVisible();
    await waitFor(() => expect(api.history.list).toHaveBeenCalled());
    expect(screen.getByText('2026-08-06')).toBeVisible();
    expect(screen.getByText('2026-08-05')).toBeVisible();
    expect(screen.getByText('restart-discard')).toBeVisible();
    expect(screen.getAllByText('¥0.00').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '调整时间' })).toBeInTheDocument();
  });

  it('debounces note search and applies status/date filters when querying history', async () => {
    const api = buildApi();
    render(<HistoryPage api={api} />);

    await waitFor(() => expect(api.history.list).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索备注' }), { target: { value: '小北' } });
    await waitFor(() => expect(api.history.list).toHaveBeenCalledTimes(2));
    expect(api.history.list).toHaveBeenLastCalledWith(expect.objectContaining({ query: '小北' }));

    fireEvent.change(screen.getByLabelText('状态筛选'), { target: { value: 'invalid' } });
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-08-05' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-08-06' } });

    await waitFor(() => expect(api.history.list).toHaveBeenLastCalledWith(expect.objectContaining({
      query: '小北',
      status: 'invalid',
      from: expect.any(Number),
      to: expect.any(Number),
    })));
  });

  it('confirms deletion with record time and note summary, then refreshes history', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    const record = buildSession({
      id: 'delete-me',
      note: '老板北北今天双排很久',
      status: 'completed',
      segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 0, 0), endedAt: Date.UTC(2026, 7, 6, 1, 30, 0) }],
    });
    const api = buildApi([record]);
    render(<HistoryPage api={api} />);

    await waitFor(() => expect(screen.getByText('delete-me')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: '删除记录' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2026-08-06'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('老板北北今天双排很久'));
    await waitFor(() => expect(api.history.delete).toHaveBeenCalledWith('delete-me'));
    await waitFor(() => expect(api.history.list).toHaveBeenCalledTimes(2));
  });

  it('exports csv with the current query and shows the saved path', async () => {
    const api = buildApi();
    render(<HistoryPage api={api} />);

    await waitFor(() => expect(api.history.list).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索备注' }), { target: { value: '导出备注' } });
    await waitFor(() => expect(api.history.list).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: '导出 CSV' }));

    await waitFor(() => expect(api.history.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ query: '导出备注' })));
    expect(screen.getByText((_, element) => element?.textContent === '已导出：/tmp/history.csv')).toBeVisible();
  });

  it('opens editor for valid record and saves through history.editSegments without touching session.editSegments', async () => {
    const record = buildSession({
      id: 'edit-me',
      status: 'completed',
      note: '可编辑',
      segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 0, 0), endedAt: Date.UTC(2026, 7, 6, 1, 30, 0) }],
    });
    const api = buildApi([record]);
    render(<HistoryPage api={api} />);

    await waitFor(() => expect(screen.getByText('edit-me')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: '调整时间' }));
    const dialog = screen.getByRole('dialog', { name: '调整时间' });
    fireEvent.change(within(dialog).getByLabelText('第 1 段开始时间'), { target: { value: '2026-08-06T09:05:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(api.history.editSegments).toHaveBeenCalledWith({
      sessionId: 'edit-me',
      segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 5, 0), endedAt: Date.UTC(2026, 7, 6, 1, 30, 0) }],
    }));
    expect(api.session.editSegments).not.toHaveBeenCalled();
    expect(api.history.delete).not.toHaveBeenCalled();
  });
});

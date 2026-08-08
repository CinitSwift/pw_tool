import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeSegmentEditor } from '../../../src/renderer/features/history/TimeSegmentEditor';
import { buildSession } from '../../fixtures/domain';

describe('TimeSegmentEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows field-level validation and disables save', () => {
    const session = buildSession({
      id: 'session-invalid',
      status: 'completed',
      segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 0, 0), endedAt: Date.UTC(2026, 7, 6, 1, 1, 0) }],
    });

    render(
      <TimeSegmentEditor
        session={session}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        nowMs={Date.UTC(2026, 7, 6, 11, 0, 0)}
      />,
    );

    fireEvent.change(screen.getByLabelText('第 1 段结束时间'), { target: { value: '2026-08-06T09:00:00' } });

    expect(screen.getByText('结束时间必须晚于本段开始时间。')).toBeVisible();
    expect(screen.getByText('共有 1 处错误')).toBeVisible();
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled();
  });

  it('submits second-level local datetime values and closes on success', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const session = buildSession({
      id: 'session-save',
      status: 'completed',
      segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 0, 0), endedAt: Date.UTC(2026, 7, 6, 1, 30, 0) }],
    });

    render(
      <TimeSegmentEditor
        session={session}
        onClose={onClose}
        onSave={onSave}
        nowMs={Date.UTC(2026, 7, 6, 3, 0, 0)}
      />,
    );

    fireEvent.change(screen.getByLabelText('第 1 段开始时间'), { target: { value: '2026-08-06T09:05:06' } });
    fireEvent.change(screen.getByLabelText('第 1 段结束时间'), { target: { value: '2026-08-06T09:35:06' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith([
      { sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 5, 6), endedAt: Date.UTC(2026, 7, 6, 1, 35, 6) },
    ]));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('keeps draft and maps main-process field errors when save is rejected', async () => {
    const onSave = vi.fn().mockRejectedValue({
      code: 'validation-error',
      message: 'The time segments are invalid.',
      fieldErrors: [
        {
          code: 'future-time',
          segmentIndex: 0,
          field: 'endedAt',
          message: 'Time cannot be later than the current time.',
        },
      ],
    });
    const session = buildSession({
      id: 'session-reject',
      status: 'completed',
      segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 0, 0), endedAt: Date.UTC(2026, 7, 6, 1, 30, 0) }],
    });

    render(
      <TimeSegmentEditor
        session={session}
        onClose={vi.fn()}
        onSave={onSave}
        nowMs={Date.UTC(2026, 7, 6, 2, 0, 0)}
      />,
    );

    fireEvent.change(screen.getByLabelText('第 1 段结束时间'), { target: { value: '2026-08-06T09:30:00' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(screen.getByText('保存失败，请修正后重试。')).toBeVisible());
    expect(screen.getByLabelText('第 1 段结束时间')).toHaveValue('2026-08-06T09:30');
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled();
  });
});

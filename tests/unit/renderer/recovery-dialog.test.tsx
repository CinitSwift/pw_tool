import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryDialog } from '../../../src/renderer/features/timer/RecoveryDialog';
import { runningSnapshot } from '../../fixtures/domain';

afterEach(() => cleanup());

describe('RecoveryDialog', () => {
  it('requires an explicit recovery choice and blocks background controls', () => {
    const onChoose = vi.fn();
    render(
      <div>
        <button>后台操作</button>
        <RecoveryDialog session={runningSnapshot} onChoose={onChoose} />
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '恢复计时' })).toBeVisible();
    expect(screen.getAllByText(/旧记录标记无效/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: '后台操作' })).toBeDisabled();
  });

  it.each([
    ['恢复计时', 'restore'],
    ['重新计时', 'restart-new-session'],
    ['不恢复', 'discard'],
  ] as const)('sends exact choice for %s', async (label, choice) => {
    const onChoose = vi.fn().mockResolvedValue(undefined);
    render(<RecoveryDialog session={runningSnapshot} onChoose={onChoose} />);

    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(choice));
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
  });

  it('supports Escape without silently choosing a recovery path', () => {
    const onChoose = vi.fn();
    render(<RecoveryDialog session={runningSnapshot} onChoose={onChoose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});

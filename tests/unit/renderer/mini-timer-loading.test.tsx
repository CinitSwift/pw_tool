import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MiniTimer } from '../../../src/renderer/features/mini/MiniTimer';

afterEach(() => cleanup());

describe('MiniTimer loading', () => {
  it('shows a waiting state before the first snapshot arrives', () => {
    render(<MiniTimer snapshot={null} />);

    expect(screen.getByText('待同步')).toBeVisible();
    expect(screen.getByText('正在等待主窗口快照')).toBeVisible();
    expect(screen.getByText('--:--:--')).toBeVisible();
  });
});

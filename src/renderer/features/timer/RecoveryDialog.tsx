import { useEffect, useRef, useState } from 'react';
import type { RecoveryChoice, SessionSnapshot } from '../../../shared/domain/types';
import { formatDuration } from './TimerPage';

interface Props {
  session: SessionSnapshot;
  onChoose(choice: RecoveryChoice): Promise<void> | void;
}

export function RecoveryDialog({ session, onChoose }: Props) {
  const [pending, setPending] = useState<RecoveryChoice | null>(null);
  const [error, setError] = useState('');
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
    const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).filter((button) => !button.closest('[role="dialog"]'));
    const prior = buttons.map((button) => button.disabled);
    buttons.forEach((button) => { button.disabled = true; });
    return () => buttons.forEach((button, index) => { button.disabled = prior[index] ?? false; });
  }, []);

  const choose = async (choice: RecoveryChoice): Promise<void> => {
    if (pending) return;
    setPending(choice); setError('');
    try { await onChoose(choice); } catch { setError('恢复操作失败，请重试。'); setPending(null); }
  };

  return (
    <div className="recovery-backdrop">
      <div className="recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); setError('请选择一种恢复方式后继续。'); }
      }}>
        <span className="status-chip status-paused">发现未完成记录</span>
        <h1 id="recovery-title">上次计时尚未结束</h1>
        <p>已记录有效时长 <strong className="mono">{formatDuration(session.runtime.effectiveSeconds)}</strong>。请选择如何处理旧记录。</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="recovery-options">
          <button aria-label="恢复计时" ref={primaryRef} className="primary recovery-option" onClick={() => void choose('restore')} disabled={pending !== null}><strong>恢复计时</strong><span>保留原时间、参数和备注，回到上次状态。</span></button>
          <button aria-label="重新计时" className="secondary recovery-option" onClick={() => void choose('restart-new-session')} disabled={pending !== null}><strong>重新计时</strong><span>旧记录标记无效，并立即开始一局新计时。</span></button>
          <button aria-label="不恢复" className="secondary recovery-option" onClick={() => void choose('discard')} disabled={pending !== null}><strong>不恢复</strong><span>旧记录标记无效，不创建新会话。</span></button>
        </div>
        {pending && <p className="pending-text" aria-live="polite">正在处理，请稍候…</p>}
      </div>
    </div>
  );
}

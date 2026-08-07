import { useState } from 'react';
import type { TimerStateProps } from './TimerPage';
import { BillingSettingsPopover } from './BillingSettingsPopover';

export function IdleState({ api }: TimerStateProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const start = async (): Promise<void> => {
    if (pending) return;
    setPending(true); setError('');
    try { await api.session.start(); } catch { setError('开始计时失败，请重试。'); } finally { setPending(false); }
  };

  return (
    <section className="timer-state idle-state" aria-labelledby="idle-title">
      <header className="state-header"><div><span className="status-chip">空闲</span><h1 id="idle-title">准备开始下一局</h1></div><button className="text-button" onClick={() => setSettingsOpen(true)}>计费设置</button></header>
      <div className="idle-clock" aria-hidden="true">00:00:00</div>
      <p className="state-message">开始后将按当前默认参数实时计算有效时长和金额。</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="primary hero-action" onClick={() => void start()} disabled={pending}>{pending ? '正在开始…' : '开始计时'}</button>
      {settingsOpen && <div className="dialog-backdrop"><BillingSettingsPopover api={api} idle onClose={() => setSettingsOpen(false)} /></div>}
    </section>
  );
}

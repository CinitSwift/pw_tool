import { useState } from 'react';
import type { TimerStateProps } from './TimerPage';
import { billingModeLabels, formatDuration, formatMoney } from './TimerPage';
import { BillingSettingsPopover } from './BillingSettingsPopover';
import { NoteDialog } from './NoteDialog';
import { TimeEditDialog } from './TimeEditDialog';

export function PausedState({ snapshot, api }: TimerStateProps) {
  const session = snapshot.session;
  const [noteOpen, setNoteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timeEditOpen, setTimeEditOpen] = useState(false);
  const [pending, setPending] = useState<'resume' | 'complete' | null>(null);
  const [error, setError] = useState('');
  if (!session) return null;
  const run = async (action: 'resume' | 'complete'): Promise<void> => {
    if (pending) return;
    setPending(action); setError('');
    try { await api.session[action](); } catch { setError('操作失败，请重试。'); } finally { setPending(null); }
  };
  return (
    <section className="timer-state paused-state" aria-labelledby="paused-title">
      <header className="state-header"><div><span className="status-chip status-paused">已暂停</span><h1 id="paused-title">计时已暂停</h1></div><div className="header-actions"><button className="text-button" onClick={() => setNoteOpen(true)}>{session.note ? '编辑备注' : '添加备注'}</button><button className="text-button" onClick={() => setTimeEditOpen(true)}>调整时间</button></div></header>
      <div className="timer-display"><span>有效时长</span><strong>{formatDuration(snapshot.runtime.effectiveSeconds)}</strong><p>暂停期间不会继续累计时长或金额</p></div>
      <div className="money-grid"><div className="money-panel"><span>当前应得</span><strong>{formatMoney(snapshot.runtime.grossAmountCents)}</strong><small>{snapshot.runtime.billedMinutes} 计费分钟</small></div><div className="money-panel commission"><span>当前抽成</span><strong>{formatMoney(snapshot.runtime.commissionAmountCents)}</strong><small>金额保持不变</small></div></div>
      <div className="detail-strip"><button className="detail-item" onClick={() => setNoteOpen(true)}><span>备注</span><strong>{session.note || '点击添加备注'}</strong></button><button className="detail-item" onClick={() => setSettingsOpen(true)}><span>本局参数</span><strong>{billingModeLabels[session.settings.billingMode]} · ¥{session.settings.hourlyRateYuan}/小时</strong></button></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="state-actions"><button className="primary" onClick={() => void run('resume')} disabled={pending !== null}>{pending === 'resume' ? '正在继续…' : '继续计时'}</button><button className="secondary danger" onClick={() => void run('complete')} disabled={pending !== null}>{pending === 'complete' ? '正在结束…' : '结束本局'}</button></div>
      {noteOpen && <NoteDialog initialNote={session.note} onClose={() => setNoteOpen(false)} onSave={(note) => api.session.updateNote(note).then(() => undefined)} />}
      {timeEditOpen && <TimeEditDialog onClose={() => setTimeEditOpen(false)} />}
      {settingsOpen && <div className="dialog-backdrop"><BillingSettingsPopover api={api} settings={session.settings} onClose={() => setSettingsOpen(false)} /></div>}
    </section>
  );
}

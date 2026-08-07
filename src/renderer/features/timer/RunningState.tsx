import { useState } from 'react';
import type { TimerStateProps } from './TimerPage';
import { billingModeLabels, formatDuration, formatLocalTime, formatMoney } from './TimerPage';
import { BillingSettingsPopover } from './BillingSettingsPopover';
import { NoteDialog } from './NoteDialog';
import { TimeEditDialog } from './TimeEditDialog';

export function RunningState({ snapshot, api }: TimerStateProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timeEditOpen, setTimeEditOpen] = useState(false);
  const [pending, setPending] = useState<'pause' | 'complete' | null>(null);
  const [error, setError] = useState('');
  const session = snapshot.session;
  if (!session) return null;

  const run = async (action: 'pause' | 'complete'): Promise<void> => {
    if (pending) return;
    setPending(action); setError('');
    try { await api.session[action](); } catch { setError(action === 'pause' ? '暂停失败，请重试。' : '结束本局失败，请重试。'); } finally { setPending(null); }
  };
  const firstStart = session.segments[0]?.startedAt;
  const closedSeconds = session.segments.reduce((sum, segment) => sum + (segment.endedAt === null ? 0 : Math.floor((segment.endedAt - segment.startedAt) / 1_000)), 0);

  const clockInvalid = Boolean(snapshot.runtime.error);
  return (
    <section className="timer-state" aria-labelledby="running-title">
      <header className="state-header"><div><span className="status-chip status-running">计时中</span><h1 id="running-title">当前一局</h1></div><div className="header-actions"><button className="text-button" onClick={() => setNoteOpen(true)}>{session.note ? '编辑备注' : '添加备注'}</button><button className="text-button" aria-label="调整时间" onClick={() => setTimeEditOpen(true)}>调整时间</button></div></header>
      {snapshot.runtime.error && <p className="inline-error" role="alert">系统时间异常，实时结算已冻结。请先调整时间。</p>}
      <div className="timer-display"><span>有效时长</span><strong>{formatDuration(snapshot.runtime.effectiveSeconds)}</strong><div className="time-facts"><span>开始 {formatLocalTime(firstStart)}</span><span>累计暂停 {formatDuration(Math.max(0, snapshot.runtime.effectiveSeconds - closedSeconds))}</span><span>当前片段 第 {snapshot.runtime.currentSegmentIndex === null ? 0 : snapshot.runtime.currentSegmentIndex + 1} 段</span></div></div>
      <div className="money-grid"><div className="money-panel"><span>当前应得</span><strong>{formatMoney(snapshot.runtime.grossAmountCents)}</strong><small>{snapshot.runtime.billedMinutes} 计费分钟</small></div><div className="money-panel commission"><span>当前抽成</span><strong>{formatMoney(snapshot.runtime.commissionAmountCents)}</strong><small>按本局参数实时计算</small></div></div>
      <div className="detail-strip"><button className="detail-item" onClick={() => setNoteOpen(true)}><span>备注</span><strong>{session.note || '点击添加备注'}</strong></button><button className="detail-item" onClick={() => setSettingsOpen(true)}><span>本局参数</span><strong>{billingModeLabels[session.settings.billingMode]} · ¥{session.settings.hourlyRateYuan}/小时</strong></button></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="state-actions"><button className="primary" onClick={() => void run('pause')} disabled={pending !== null || clockInvalid}>{pending === 'pause' ? '正在暂停…' : '暂停计时'}</button><button className="secondary danger" onClick={() => void run('complete')} disabled={pending !== null || clockInvalid}>{pending === 'complete' ? '正在结束…' : '结束本局'}</button></div>
      {noteOpen && <NoteDialog initialNote={session.note} onClose={() => setNoteOpen(false)} onSave={(note) => api.session.updateNote(note).then(() => undefined)} />}
      {timeEditOpen && <TimeEditDialog segments={session.segments} onClose={() => setTimeEditOpen(false)} onSave={(segments) => api.session.editSegments(segments).then(() => undefined)} />}
      {settingsOpen && <div className="dialog-backdrop"><BillingSettingsPopover api={api} settings={session.settings} onClose={() => setSettingsOpen(false)} /></div>}
    </section>
  );
}

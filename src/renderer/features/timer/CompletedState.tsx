import { useState } from 'react';
import type { TimeSegment } from '../../../shared/domain/types';
import type { TimerStateProps } from './TimerPage';
import { billingModeLabels, formatDuration, formatMoney } from './TimerPage';
import { NoteDialog } from './NoteDialog';
import { TimeEditDialog } from './TimeEditDialog';

export function CompletedState({ snapshot, api }: TimerStateProps) {
  const session = snapshot.session;
  const [noteOpen, setNoteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [timeEditOpen, setTimeEditOpen] = useState(false);
  if (!session) return null;
  const start = async (): Promise<void> => {
    setPending(true); setError('');
    try { await api.session.start(); } catch { setError('开始新一局失败，请重试。'); } finally { setPending(false); }
  };
  const saveSegments = async (segments: TimeSegment[]): Promise<void> => {
    await api.session.editSegments({ sessionId: session.id, segments });
  };
  return (
    <section className="timer-state completed-state" aria-labelledby="completed-title">
      <header className="state-header"><div><span className="status-chip status-completed">已完成</span><h1 id="completed-title">本局已完成</h1></div><button className="text-button" onClick={() => setNoteOpen(true)}>编辑备注</button></header>
      <div className="completion-summary"><div><span>有效时长</span><strong>{formatDuration(snapshot.runtime.effectiveSeconds)}</strong></div><div><span>计费分钟</span><strong>{snapshot.runtime.billedMinutes}</strong></div><div><span>计费方式</span><strong>{billingModeLabels[session.settings.billingMode]}</strong></div></div>
      <div className="money-grid"><div className="money-panel"><span>本局应得</span><strong>{formatMoney(snapshot.runtime.grossAmountCents)}</strong></div><div className="money-panel commission"><span>本局抽成</span><strong>{formatMoney(snapshot.runtime.commissionAmountCents)}</strong></div></div>
      <button className="detail-item completed-note" onClick={() => setNoteOpen(true)}><span>备注</span><strong>{session.note || '暂无备注'}</strong></button>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="state-actions completed-actions"><button className="secondary" onClick={() => setTimeEditOpen(true)}>调整时间</button><button className="secondary" disabled title="历史页将在后续任务接入">查看历史</button><button className="primary" onClick={() => void start()} disabled={pending}>{pending ? '正在开始…' : '开始新一局'}</button></div>
      {noteOpen && <NoteDialog initialNote={session.note} onClose={() => setNoteOpen(false)} onSave={(note) => api.session.updateNote(note).then(() => undefined)} />}
      {timeEditOpen && <TimeEditDialog session={session} onClose={() => setTimeEditOpen(false)} onSave={saveSegments} />}
    </section>
  );
}

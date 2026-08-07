import type { PwToolApi } from '../../../preload/api';
import type { BillingMode, SessionSnapshot } from '../../../shared/domain/types';
import { CompletedState } from './CompletedState';
import { IdleState } from './IdleState';
import { PausedState } from './PausedState';
import { RunningState } from './RunningState';
import './timer.css';

export interface TimerStateProps {
  snapshot: SessionSnapshot;
  api: PwToolApi;
}

export const billingModeLabels: Record<BillingMode, string> = {
  '15-step': '15 分钟阶梯档',
  '15-floor': '15 分钟起算档',
  minute: '1 分钟档',
};

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function formatMoney(cents: number): string {
  return `¥${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export function formatLocalTime(timestamp: number | undefined): string {
  if (timestamp === undefined) return '尚未开始';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(timestamp));
}

function InvalidState({ snapshot }: TimerStateProps) {
  return (
    <section className="timer-state invalid-state" aria-labelledby="invalid-title">
      <header className="state-header">
        <div><span className="status-chip status-invalid">无效</span><h1 id="invalid-title">记录无效</h1></div>
      </header>
      <p className="state-message">该记录已永久标记为无效，不能继续计费或编辑。</p>
      <div className="money-panel"><span>应得金额</span><strong>{formatMoney(0)}</strong><small>计费分钟固定为 0</small></div>
      {snapshot.session?.invalidReason && <p className="muted">失效原因：{snapshot.session.invalidReason === 'restart-new-session' ? '重新计时' : '未恢复旧记录'}</p>}
    </section>
  );
}

export function TimerPage(props: TimerStateProps) {
  switch (props.snapshot.runtime.status) {
    case 'idle': return <IdleState {...props} />;
    case 'running': return <RunningState {...props} />;
    case 'paused': return <PausedState {...props} />;
    case 'completed': return <CompletedState {...props} />;
    case 'invalid': return <InvalidState {...props} />;
  }
}

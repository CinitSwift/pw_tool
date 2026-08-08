import { useState } from 'react';
import type { PwToolApi } from '../../../preload/api';
import type { SessionSnapshot } from '../../../shared/domain/types';
import { billingModeLabels, formatDuration, formatMoney } from '../timer/TimerPage';
import './mini.css';

interface Props {
  snapshot: SessionSnapshot | null;
  api?: PwToolApi;
}

const STATUS_LABELS: Record<SessionSnapshot['runtime']['status'], string> = {
  idle: '待开始',
  running: '计时中',
  paused: '计时已暂停',
  completed: '本局已完成',
  invalid: '记录无效',
};

function buildSessionSummary(snapshot: SessionSnapshot): string {
  const session = snapshot.session;
  if (!session) return '暂无会话';
  return `${billingModeLabels[session.settings.billingMode]} · ¥${session.settings.hourlyRateYuan}/小时`;
}

export function MiniTimer({ snapshot, api }: Props) {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  if (!snapshot) {
    return (
      <section className="mini-timer" aria-labelledby="mini-title">
        <header className="mini-header">
          <div>
            <span className="status-chip">待同步</span>
            <h1 id="mini-title">迷你计时窗</h1>
          </div>
        </header>
        <div className="mini-grid">
          <div className="mini-panel mini-time">
            <span>有效时长</span>
            <strong>--:--:--</strong>
            <small>正在等待主窗口快照</small>
          </div>
        </div>
      </section>
    );
  }

  const pause = async (): Promise<void> => {
    await api?.session.pause();
  };

  const resume = async (): Promise<void> => {
    await api?.session.resume();
  };

  const complete = async (): Promise<void> => {
    await api?.session.complete();
  };

  const showMain = async (): Promise<void> => {
    await api?.window.showMain();
  };

  const toggleAlwaysOnTop = async (): Promise<void> => {
    const nextValue = !alwaysOnTop;
    setAlwaysOnTop(nextValue);
    const result = await api?.window.setAlwaysOnTop(nextValue);
    if (typeof result === 'boolean') {
      setAlwaysOnTop(result);
    }
  };

  return (
    <section className="mini-timer" aria-labelledby="mini-title">
      <header className="mini-header">
        <div>
          <span className="status-chip status-running">运行中</span>
          <h1 id="mini-title">迷你计时窗</h1>
        </div>
        <button className="text-button" onClick={() => void showMain()}>显示主窗口</button>
      </header>

      <div className="mini-grid">
        <div className="mini-panel mini-time">
          <span>有效时长</span>
          <strong>{formatDuration(snapshot.runtime.effectiveSeconds)}</strong>
          <small>实时同步主窗口快照</small>
        </div>

        <div className="mini-money-grid">
          <div className="mini-panel">
            <span>当前应得</span>
            <strong>{formatMoney(snapshot.runtime.grossAmountCents)}</strong>
            <small>{snapshot.runtime.billedMinutes} 计费分钟</small>
          </div>
          <div className="mini-panel commission">
            <span>当前抽成</span>
            <strong>抽成 {formatMoney(snapshot.runtime.commissionAmountCents)}</strong>
            <small>按主进程快照计算</small>
          </div>
        </div>

        <div className="mini-detail">
          <div>
            <span>本局参数</span>
            <strong>{buildSessionSummary(snapshot)}</strong>
          </div>
          <div>
            <span>状态</span>
            <strong>{STATUS_LABELS[snapshot.runtime.status]}</strong>
          </div>
        </div>
      </div>

      <div className="mini-actions">
        <button className="primary" onClick={() => void pause()}>暂停计时</button>
        <button className="secondary" onClick={() => void resume()}>继续计时</button>
        <button className="secondary danger" onClick={() => void complete()}>结束本局</button>
      </div>

      <label className="mini-toggle">
        <span>
          <strong>置顶</strong>
          <small>{alwaysOnTop ? '已置顶' : '未置顶'}</small>
        </span>
        <input aria-label="置顶" role="switch" type="checkbox" checked={alwaysOnTop} onChange={() => void toggleAlwaysOnTop()} />
      </label>
    </section>
  );
}

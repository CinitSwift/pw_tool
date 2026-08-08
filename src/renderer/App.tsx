import { useEffect, useState } from 'react';
import { createRendererStore, useRendererState } from './app-state';
import { HistoryPage } from './features/history/HistoryPage';
import { MiniTimer } from './features/mini/MiniTimer';
import { RecoveryDialog } from './features/timer/RecoveryDialog';
import { TimerPage } from './features/timer/TimerPage';

function currentWindowMode(): 'main' | 'mini' {
  const search = new URLSearchParams(window.location.search);
  return search.get('window') === 'mini' ? 'mini' : 'main';
}

function currentStartupError(): 'database' | null {
  const search = new URLSearchParams(window.location.search);
  return search.get('startupError') === 'database' ? 'database' : null;
}

export default function App() {
  const startupError = currentStartupError();
  if (startupError === 'database') {
    return (
      <main data-testid="app-root" className="app-shell app-shell--root">
        <section className="system-state error-state" role="alert" aria-labelledby="startup-error-title">
          <h1 id="startup-error-title">无法启动应用</h1>
          <p>本地数据库初始化失败，请检查本地数据后重试。</p>
        </section>
      </main>
    );
  }

  const [store] = useState(() => createRendererStore(window.pwTool));
  const [route, setRoute] = useState<'timer' | 'history'>('timer');
  const [windowMode] = useState<'main' | 'mini'>(() => currentWindowMode());
  const state = useRendererState(store);

  useEffect(() => {
    return store.start();
  }, [store]);

  if (windowMode === 'mini') {
    return (
      <main data-testid="app-root" className="app-shell app-shell-mini app-shell--root">
        {state.status === 'error' && <section className="system-state error-state" role="alert"><h1>无法加载计时状态</h1><p>{state.message}</p></section>}
        {state.status === 'loading' && <MiniTimer snapshot={null} api={window.pwTool} />}
        {state.status === 'ready' && <MiniTimer snapshot={state.snapshot} api={window.pwTool} />}
      </main>
    );
  }

  return (
    <main data-testid="app-root" className="app-shell app-shell--root">
      <nav className="app-nav" aria-label="主导航">
        <strong>陪玩小工具</strong>
        <div>
          <button className={`nav-item ${route === 'timer' ? 'active' : ''}`} aria-current={route === 'timer' ? 'page' : undefined} onClick={() => setRoute('timer')}>计时</button>
          <button className={`nav-item ${route === 'history' ? 'active' : ''}`} aria-current={route === 'history' ? 'page' : undefined} onClick={() => setRoute('history')}>历史</button>
          <button className="nav-item" disabled>设置</button>
        </div>
      </nav>
      <div className="app-shell-main">
        {state.status === 'loading' && <section className="system-state" aria-live="polite"><div className="loading-line" /><div className="loading-line short" /><p>{state.message}</p></section>}
        {state.status === 'error' && <section className="system-state error-state" role="alert"><h1>无法加载计时状态</h1><p>{state.message}</p></section>}
        {state.status === 'ready' && route === 'timer' && <TimerPage snapshot={state.snapshot} api={window.pwTool} />}
        {state.status === 'ready' && route === 'history' && <HistoryPage api={window.pwTool} />}
      </div>
      {state.status === 'ready' && state.snapshot.recoveryRequired && (
        <RecoveryDialog session={state.snapshot} onChoose={async (choice) => {
          const result = await window.pwTool.session.recover(choice);
          store.acceptSnapshot(result.snapshot);
        }} />
      )}
    </main>
  );
}

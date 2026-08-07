import { useEffect, useState } from 'react';
import { createRendererStore, useRendererState } from './app-state';
import { RecoveryDialog } from './features/timer/RecoveryDialog';
import { TimerPage } from './features/timer/TimerPage';

export default function App() {
  const [store] = useState(() => createRendererStore(window.pwTool));
  const state = useRendererState(store);

  useEffect(() => {
    return store.start();
  }, [store]);

  return (
    <main data-testid="app-root" className="app-shell">
      <nav className="app-nav" aria-label="主导航">
        <strong>陪玩小工具</strong>
        <div><button className="nav-item active" aria-current="page">计时</button><button className="nav-item" disabled>历史</button><button className="nav-item" disabled>设置</button></div>
      </nav>
      {state.status === 'loading' && <section className="system-state" aria-live="polite"><div className="loading-line" /><div className="loading-line short" /><p>{state.message}</p></section>}
      {state.status === 'error' && <section className="system-state error-state" role="alert"><h1>无法加载计时状态</h1><p>{state.message}</p></section>}
      {state.status === 'ready' && <TimerPage snapshot={state.snapshot} api={window.pwTool} />}
      {state.status === 'ready' && state.snapshot.recoveryRequired && (
        <RecoveryDialog session={state.snapshot} onChoose={async (choice) => {
          const result = await window.pwTool.session.recover(choice);
          store.acceptSnapshot(result.snapshot);
        }} />
      )}
    </main>
  );
}

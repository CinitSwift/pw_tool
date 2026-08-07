import { useEffect, useRef } from 'react';

interface Props {
  onClose(): void;
}

export function TimeEditDialog({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="time-edit-title" onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}>
        <div className="dialog-heading"><div><h2 id="time-edit-title">调整时间</h2><p>完整的历史和时间编辑器将在后续任务接入。</p></div><button className="icon-button" onClick={onClose} aria-label="关闭时间调整">×</button></div>
        <p className="state-message">当前版本先保留调整时间入口，防止误触修改时间片段。请在即将上线的历史/时间编辑器中统一调整。</p>
        <div className="dialog-actions"><button ref={closeRef} className="primary" onClick={onClose}>知道了</button></div>
      </div>
    </div>
  );
}

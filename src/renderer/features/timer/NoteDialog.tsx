import { useEffect, useRef, useState } from 'react';

interface Props {
  initialNote: string;
  onSave(note: string): Promise<void>;
  onClose(): void;
}

export function NoteDialog({ initialNote, onSave, onClose }: Props) {
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = note.trim();
  const count = Array.from(trimmed).length;
  const dirty = note !== initialNote;

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const close = (): void => {
    if (pending) return;
    if (dirty && !window.confirm('备注尚未保存，确定关闭吗？')) return;
    onClose();
  };
  const save = async (): Promise<void> => {
    if (pending || count > 500) return;
    setPending(true);
    setError('');
    try {
      await onSave(trimmed);
      onClose();
    } catch {
      setError('备注保存失败，请重试。');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="note-title" onKeyDown={(event) => {
        if (event.key === 'Escape') close();
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save(); }
      }}>
        <div className="dialog-heading"><div><h2 id="note-title">本局备注</h2><p>可记录老板昵称、游戏或订单信息</p></div><button className="icon-button" onClick={close} aria-label="关闭备注">×</button></div>
        <label htmlFor="session-note">备注</label>
        <textarea ref={textareaRef} id="session-note" aria-label="备注" rows={7} value={note} onChange={(event) => setNote(event.target.value)} placeholder="选填，最多 500 个字符" />
        <div className="input-meta"><span>{count}/500</span>{count > 500 && <span className="field-error">备注不能超过 500 个字符</span>}</div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="secondary" onClick={close} disabled={pending}>取消</button><button className="primary" onClick={() => void save()} disabled={pending || count > 500}>{pending ? '保存中…' : '保存备注'}</button></div>
      </div>
    </div>
  );
}

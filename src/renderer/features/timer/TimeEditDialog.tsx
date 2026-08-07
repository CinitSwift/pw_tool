import { useEffect, useRef, useState } from 'react';
import type { TimeSegment } from '../../../shared/domain/types';

interface Props {
  segments: TimeSegment[];
  onSave(segments: TimeSegment[]): Promise<void>;
  onClose(): void;
}

function toInputValue(timestamp: number | null): string {
  if (timestamp === null) return '';
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toTimestamp(value: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1_000) * 1_000 : null;
}

export function TimeEditDialog({ segments, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(() => segments.map((segment) => ({
    startedAt: toInputValue(segment.startedAt),
    endedAt: toInputValue(segment.endedAt),
  })));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstInputRef.current?.focus(); }, []);

  const parsed = draft.map((segment, index) => ({
    ...segments[index],
    startedAt: toTimestamp(segment.startedAt),
    endedAt: toTimestamp(segment.endedAt),
  }));
  const validationError = parsed.some((segment) => segment.startedAt === null
    || (segments[parsed.indexOf(segment)]?.endedAt !== null && segment.endedAt === null)
    || (segment.endedAt !== null && segment.endedAt <= segment.startedAt))
    ? '时间必须有效，且结束时间晚于开始时间。'
    : '';

  const save = async (): Promise<void> => {
    if (pending || validationError) return;
    setPending(true); setError('');
    try {
      await onSave(parsed.map((segment) => ({
        ...segment,
        startedAt: segment.startedAt as number,
      })));
      onClose();
    } catch {
      setError('时间保存失败，请检查输入后重试。');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="time-edit-title" onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) onClose();
        if (event.key === 'Enter') { event.preventDefault(); void save(); }
      }}>
        <div className="dialog-heading"><div><h2 id="time-edit-title">调整时间</h2><p>修改已存在的时间节点，保存后立即重算。</p></div><button className="icon-button" onClick={onClose} aria-label="关闭时间调整">×</button></div>
        {draft.map((segment, index) => (
          <fieldset className="time-edit-segment" key={segments[index]?.id ?? index}>
            <legend>第 {index + 1} 段</legend>
            <label>开始时间<input ref={index === 0 ? firstInputRef : undefined} type="datetime-local" step="1" value={segment.startedAt} onChange={(event) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, startedAt: event.target.value } : item))} /></label>
            <label>结束时间<input type="datetime-local" step="1" value={segment.endedAt} disabled={segments[index]?.endedAt === null} onChange={(event) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, endedAt: event.target.value } : item))} /></label>
          </fieldset>
        ))}
        {validationError && <p className="field-error" role="alert">{validationError}</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="secondary" onClick={onClose} disabled={pending}>取消</button><button className="primary" onClick={() => void save()} disabled={pending || Boolean(validationError)}>{pending ? '保存中…' : '保存时间'}</button></div>
      </div>
    </div>
  );
}

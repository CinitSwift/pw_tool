import { useEffect, useMemo, useState } from 'react';
import type { SegmentValidationError, TimeSegment } from '../../../shared/domain/types';
import { validateSegments } from '../../../shared/domain/time-segments';

interface Props {
  session: {
    id: string;
    status: 'running' | 'paused' | 'completed' | 'invalid';
    segments: TimeSegment[];
  };
  nowMs: number;
  onClose(): void;
  onSave(segments: TimeSegment[]): Promise<void>;
}

type DraftField = 'startedAt' | 'endedAt';

type DraftErrorMap = Record<string, string>;

function toInputValue(timestamp: number | null): string {
  if (timestamp === null) return '';
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseInputValue(value: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function localErrorLabel(error: SegmentValidationError): string {
  if (error.code === 'zero-duration') return '结束时间必须晚于本段开始时间。';
  if (error.code === 'subsecond') return '时间必须精确到秒。';
  if (error.code === 'future-time') return '时间不能晚于当前时间。';
  if (error.code === 'invalid-date') return '当前时间无效。';
  if (error.code === 'open-segment') return '运行中最后一段必须保持打开。';
  if (error.code === 'overlap') return '后一段开始不能早于前一段结束。';
  return error.message;
}

export function TimeSegmentEditor({ session, nowMs, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(() => session.segments.map((segment) => ({ ...segment })));
  const [errors, setErrors] = useState<DraftErrorMap>({});
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const validation = useMemo(() => validateSegments({ status: session.status, segments: draft }, nowMs), [draft, nowMs, session.status]);
  const errorCount = validation.errors.length;
  const canSave = !pending && errorCount === 0 && Object.keys(errors).length === 0;

  useEffect(() => {
    const nextErrors: DraftErrorMap = {};
    for (const error of validation.errors) {
      if (error.segmentIndex >= 0 && error.field) {
        nextErrors[`${error.segmentIndex}:${error.field}`] = localErrorLabel(error);
      }
    }
    setErrors(nextErrors);
  }, [validation.errors]);

  const updateField = (segmentIndex: number, field: DraftField, value: string): void => {
    setDraft((current) => current.map((segment, index) => {
      if (index !== segmentIndex) return segment;
      return { ...segment, [field]: parseInputValue(value) } as TimeSegment;
    }));
  };

  const save = async (): Promise<void> => {
    if (!canSave) return;
    setPending(true);
    setSubmitError('');
    try {
      await onSave(draft);
      onClose();
    } catch (error) {
      const fieldErrors = typeof error === 'object' && error !== null && 'fieldErrors' in error ? (error as { fieldErrors?: Array<SegmentValidationError> }).fieldErrors ?? [] : [];
      const nextErrors: DraftErrorMap = {};
      for (const fieldError of fieldErrors) {
        if (fieldError.field) {
          nextErrors[`${fieldError.segmentIndex}:${fieldError.field}`] = localErrorLabel(fieldError);
        }
      }
      setErrors(nextErrors);
      setSubmitError(fieldErrors.length ? '保存失败，请修正后重试。' : '保存失败，请重试。');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="modal history-editor" role="dialog" aria-modal="true" aria-labelledby="time-edit-title">
        <div className="dialog-heading">
          <div>
            <h2 id="time-edit-title">调整时间</h2>
            <p>纵向时间线编辑已存在的每个时间节点</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭时间调整">×</button>
        </div>
        <p className="history-editor-summary">共有 {errorCount} 处错误</p>
        <div className="timeline">
          {draft.map((segment, index) => {
            const startedKey = `${index}:startedAt`;
            const endedKey = `${index}:endedAt`;
            return (
              <div className="timeline-row" key={`${session.id}-${segment.sequence ?? index}`}>
                <div className="timeline-node" />
                <div className="timeline-card">
                  <strong>第 {index + 1} 段</strong>
                  <label>
                    开始时间
                    <input
                      aria-label={`第 ${index + 1} 段开始时间`}
                      type="datetime-local"
                      step="1"
                      value={toInputValue(segment.startedAt)}
                      onChange={(event) => updateField(index, 'startedAt', event.target.value)}
                    />
                  </label>
                  {errors[startedKey] && <p className="field-error">{errors[startedKey]}</p>}
                  <label>
                    结束时间
                    <input
                      aria-label={`第 ${index + 1} 段结束时间`}
                      type="datetime-local"
                      step="1"
                      value={toInputValue(segment.endedAt)}
                      onChange={(event) => updateField(index, 'endedAt', event.target.value)}
                    />
                  </label>
                  {errors[endedKey] && <p className="field-error">{errors[endedKey]}</p>}
                </div>
              </div>
            );
          })}
        </div>
        {submitError && <p className="inline-error" role="alert">{submitError}</p>}
        <div className="dialog-actions">
          <button className="secondary" onClick={onClose} disabled={pending}>取消</button>
          <button className="primary" onClick={() => void save()} disabled={!canSave}>{pending ? '保存中…' : '保存修改'}</button>
        </div>
      </div>
    </div>
  );
}

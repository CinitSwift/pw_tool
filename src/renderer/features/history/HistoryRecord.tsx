import { formatDuration, formatMoney, formatLocalTime } from '../timer/TimerPage';

export interface HistoryRecordData {
  id: string;
  status: 'completed' | 'invalid';
  note: string;
  startedAt: number;
  endedAt?: number;
  effectiveMinutes: number;
  billedMinutes: number;
  grossAmountCents: number;
  commissionAmountCents: number;
  segmentsSummary: string;
  invalidReason?: string;
}

interface Props {
  record: HistoryRecordData;
  canEdit: boolean;
  onEdit(): void;
  onDelete(): void;
}

export function HistoryRecord({ record, canEdit, onEdit, onDelete }: Props) {
  return (
    <article className={`history-record ${record.status === 'invalid' ? 'is-invalid' : ''}`} data-record-id={record.id}>
      <header className="history-record-head">
        <div className="history-record-head-copy">
          <div className="history-record-meta">
            <span className={`status-chip ${record.status === 'invalid' ? 'status-invalid' : 'status-completed'}`}>{record.status === 'invalid' ? '无效' : '有效'}</span>
            <strong>{record.id}</strong>
          </div>
          <p>{formatLocalTime(record.startedAt)} → {record.endedAt ? formatLocalTime(record.endedAt) : '进行中'}</p>
        </div>
        <div className="history-record-actions">
          {canEdit && <button className="text-button" onClick={onEdit}>调整时间</button>}
          <button className="text-button danger" aria-label="删除记录" onClick={onDelete}>删除</button>
        </div>
      </header>
      <div className="history-record-body">
        <p className="history-note">{record.note || '暂无备注'}</p>
        <div className="history-record-grid">
          <div><span>有效时长</span><strong>{formatDuration(record.effectiveMinutes * 60)}</strong></div>
          <div><span>计费分钟</span><strong>{record.billedMinutes}</strong></div>
          <div><span>应得金额</span><strong>{formatMoney(record.status === 'invalid' ? 0 : record.grossAmountCents)}</strong></div>
          <div><span>抽成金额</span><strong>{formatMoney(record.status === 'invalid' ? 0 : record.commissionAmountCents)}</strong></div>
        </div>
        <p className="history-segments mono">{record.segmentsSummary}</p>
        {record.status === 'invalid' && <p className="history-invalid-note">{record.invalidReason ?? '无效记录'}</p>}
      </div>
    </article>
  );
}

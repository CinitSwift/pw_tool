import { useEffect, useMemo, useState } from 'react';
import type { PwToolApi } from '../../../preload/api';
import type { Session } from '../../../shared/domain/session-machine';
import type { HistoryQuery, TimeSegment } from '../../../shared/domain/types';
import { HistoryFilters } from './HistoryFilters';
import { HistoryRecord, type HistoryRecordData } from './HistoryRecord';
import { TimeSegmentEditor } from './TimeSegmentEditor';
import './history.css';

interface Props {
  api: PwToolApi;
}

const DEBOUNCE_MS = 200;

function formatLocalDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour12: false }).format(new Date(timestamp)).replaceAll('/', '-');
}

function formatLocalDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(timestamp)).replaceAll('/', '-');
}

function groupRecords(records: Session[]): Array<{ key: string; title: string; records: HistoryRecordData[] }> {
  const groups = new Map<string, HistoryRecordData[]>();
  for (const session of records) {
    const startedAt = session.segments[0]?.startedAt ?? 0;
    const key = formatLocalDate(startedAt);
    const record: HistoryRecordData = {
      id: session.id,
      status: session.status === 'invalid' ? 'invalid' : 'completed',
      note: session.note,
      startedAt,
      endedAt: session.segments.at(-1)?.endedAt ?? undefined,
      effectiveMinutes: session.fee.effectiveMinutes,
      billedMinutes: session.fee.billedMinutes,
      grossAmountCents: session.fee.grossAmountCents,
      commissionAmountCents: session.fee.commissionAmountCents,
      segmentsSummary: session.segments.map((segment, index) => `${index + 1}:${formatLocalDateTime(segment.startedAt)} -> ${segment.endedAt === null ? 'open' : formatLocalDateTime(segment.endedAt)}`).join(' | '),
      ...(session.invalidReason ? { invalidReason: session.invalidReason } : {}),
    };
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, records]) => ({ key, title: key, records }));
}

function queryToHistoryQuery(query: string, status: 'all' | 'completed' | 'invalid', from: string, to: string): HistoryQuery {
  return {
    ...(query ? { query } : {}),
    status,
    ...(from ? { from: new Date(`${from}T00:00:00`).getTime() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59`).getTime() } : {}),
  };
}

export function HistoryPage({ api }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'completed' | 'invalid'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [records, setRecords] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportPath, setExportPath] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [editor, setEditor] = useState<Session | null>(null);
  const currentQuery = useMemo(() => queryToHistoryQuery(debouncedQuery, status, from, to), [debouncedQuery, status, from, to]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage('');
    void api.history.list(currentQuery).then((next) => {
      if (active) setRecords(next);
    }).catch((error: unknown) => {
      if (!active) return;
      setErrorMessage(
        typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
          ? error.message
          : '历史记录加载失败，请稍后重试。',
      );
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api.history, currentQuery]);

  const refresh = async (): Promise<void> => {
    setErrorMessage('');
    setRecords(await api.history.list(currentQuery));
  };

  const onDelete = async (record: Session): Promise<void> => {
    const startedAt = formatLocalDateTime(record.segments[0]?.startedAt ?? 0);
    const summary = record.note ? record.note.slice(0, 24) : '无备注';
    if (!window.confirm(`确定删除 ${startedAt} 的记录吗？\n备注：${summary}`)) return;
    await api.history.delete(record.id);
    await refresh();
  };

  const onExport = async (): Promise<void> => {
    setErrorMessage('');
    try {
      const result = await api.history.exportCsv(currentQuery);
      setExportPath(result.filePath);
    } catch (error: unknown) {
      setErrorMessage(
        typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'CSV 导出失败，请稍后重试。',
      );
    }
  };

  const onSaveSegments = async (segments: TimeSegment[]): Promise<void> => {
    if (!editor) return;
    const updatedSession = await api.history.editSegments({ sessionId: editor.id, segments });
    setRecords((current) => current.map((record) => (record.id === updatedSession.id ? updatedSession : record)));
    setEditor(null);
  };

  const groups = useMemo(() => groupRecords(records), [records]);

  return (
    <section className="history-page" aria-labelledby="history-title">
      <header className="history-header">
        <div className="history-header-copy">
          <span className="status-chip">历史</span>
          <h1 id="history-title">历史记录</h1>
          <p>按开始时间倒序显示，并按本地日期分组</p>
        </div>
        <div className="history-header-actions">
          <button className="primary" onClick={() => void onExport()}>导出 CSV</button>
        </div>
      </header>

      <div className="history-toolbar">
        <HistoryFilters
          query={query}
          status={status}
          from={from}
          to={to}
          onQueryChange={setQuery}
          onStatusChange={setStatus}
          onFromChange={setFrom}
          onToChange={setTo}
        />
      </div>

      {loading && <p className="history-loading">正在加载历史记录…</p>}
      {errorMessage && <p className="inline-error" role="alert">{errorMessage}</p>}
      {exportPath && <p className="history-export-path">已导出：{exportPath}</p>}
      {!loading && groups.length === 0 && <p className="history-loading">暂无符合条件的历史记录。</p>}

      <div className="history-list">
        {groups.map((group) => (
          <section key={group.key} className="history-group" aria-label={group.title}>
            <h2>{group.title}</h2>
            <div className="history-group-list">
              {group.records.map((record) => (
                <HistoryRecord
                  key={record.id}
                  record={record}
                  canEdit={record.status !== 'invalid'}
                  onEdit={() => {
                    const session = records.find((item) => item.id === record.id);
                    if (session) setEditor(session);
                  }}
                  onDelete={() => void onDelete(records.find((item) => item.id === record.id) ?? records[0])}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {editor && (
        <TimeSegmentEditor
          session={editor}
          nowMs={Date.now()}
          onClose={() => setEditor(null)}
          onSave={onSaveSegments}
        />
      )}
    </section>
  );
}

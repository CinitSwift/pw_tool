import type { Session } from '../../shared/domain/session-machine';
import type { HistoryQuery } from '../../shared/domain/types';

export interface HistoryRepository {
  list(input: HistoryQuery): Session[];
}

export type ExportPathProvider = (input: HistoryQuery) => string | null | Promise<string | null>;
export type ExportFileWriter = (filePath: string, contents: string) => void | Promise<void>;

const CSV_COLUMNS = [
  'id',
  'status',
  'startedAt',
  'endedAt',
  'effectiveMinutes',
  'billedMinutes',
  'grossAmountCents',
  'commissionAmountCents',
  'note',
] as const;

function quoteCsv(value: string | number | null): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function serializeSessionsToCsv(sessions: Session[]): string {
  const rows = sessions.map((session) => {
    const firstSegment = session.segments[0];
    const lastSegment = session.segments.at(-1);
    return [
      session.id,
      session.status,
      firstSegment?.startedAt ?? '',
      lastSegment?.endedAt ?? '',
      session.fee.effectiveMinutes,
      session.fee.billedMinutes,
      session.fee.grossAmountCents,
      session.fee.commissionAmountCents,
      session.note,
    ].map(quoteCsv).join(',');
  });

  return [CSV_COLUMNS.join(','), ...rows].join('\r\n');
}

export class ExportService {
  constructor(
    private readonly repository: HistoryRepository,
    private readonly selectPath: ExportPathProvider,
    private readonly writeFile: ExportFileWriter,
  ) {}

  async exportCsv(input: HistoryQuery): Promise<{ filePath: string; rowCount: number }> {
    const sessions = this.repository.list(input);
    const filePath = await this.selectPath(input);
    if (!filePath) {
      throw new Error('CSV export cancelled');
    }
    await this.writeFile(filePath, serializeSessionsToCsv(sessions));
    return { filePath, rowCount: sessions.length };
  }
}

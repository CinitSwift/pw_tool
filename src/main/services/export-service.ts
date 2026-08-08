import type { Session } from '../../shared/domain/session-machine';
import type { HistoryQuery } from '../../shared/domain/types';
import { serializeSessions } from '../../shared/domain/csv';

export interface HistoryRepository {
  list(input: HistoryQuery): Session[];
}

export type ExportPathProvider = (input: HistoryQuery) => string | null | Promise<string | null>;
export type ExportFileWriter = (filePath: string, contents: string) => void | Promise<void>;

export function serializeSessionsToCsv(sessions: Session[]): string {
  return serializeSessions(sessions, Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export class ExportService {
  constructor(
    private readonly repository: HistoryRepository,
    private readonly selectPath: ExportPathProvider,
    private readonly writeFile: ExportFileWriter,
    private readonly timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  ) {}

  async exportCsv(input: HistoryQuery): Promise<{ filePath: string; rowCount: number }> {
    const sessions = this.repository.list(input);
    const filePath = await this.selectPath(input);
    if (!filePath) {
      throw new Error('CSV export cancelled');
    }
    await this.writeFile(filePath, serializeSessions(sessions, this.timezone));
    return { filePath, rowCount: sessions.length };
  }
}

import type Database from 'better-sqlite3';
import type { AppSettings, BillingMode, SessionStatus, TimeSegment } from '../../shared/domain/types';
import type { Session } from '../../shared/domain/session-machine';

type SessionRow = {
  id: string;
  status: SessionStatus;
  billingMode: BillingMode;
  hourlyRateYuan: number;
  hourlyCommissionYuan: number;
  note: string;
  invalidReason: Session['invalidReason'] | null;
  invalidatedAt: number | null;
  effectiveMinutes: number;
  billedMinutes: number;
  grossAmountCents: number;
  commissionAmountCents: number;
};

type SegmentRow = {
  id: string | null;
  sequence: number;
  startedAt: number;
  endedAt: number | null;
};

const SETTING_KEYS = ['billingMode', 'hourlyRateYuan', 'hourlyCommissionYuan', 'miniAlwaysOnTop', 'mainWindowBounds'] as const;

export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  insertSession(session: Session): void {
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO sessions (
            id, status, billingMode, hourlyRateYuan, hourlyCommissionYuan, note,
            invalidReason, invalidatedAt, effectiveMinutes, billedMinutes,
            grossAmountCents, commissionAmountCents
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          session.id,
          session.status,
          session.settings.billingMode,
          session.settings.hourlyRateYuan,
          session.settings.hourlyCommissionYuan,
          session.note,
          session.invalidReason ?? null,
          session.invalidatedAt ?? null,
          session.fee.effectiveMinutes,
          session.fee.billedMinutes,
          session.fee.grossAmountCents,
          session.fee.commissionAmountCents,
        );
      this.replaceSegments(session);
    });
  }

  updateSession(session: Session): void {
    this.transaction(() => {
      this.db
        .prepare(
          `UPDATE sessions SET
            status = ?, billingMode = ?, hourlyRateYuan = ?, hourlyCommissionYuan = ?, note = ?,
            invalidReason = ?, invalidatedAt = ?, effectiveMinutes = ?, billedMinutes = ?,
            grossAmountCents = ?, commissionAmountCents = ?
          WHERE id = ?`,
        )
        .run(
          session.status,
          session.settings.billingMode,
          session.settings.hourlyRateYuan,
          session.settings.hourlyCommissionYuan,
          session.note,
          session.invalidReason ?? null,
          session.invalidatedAt ?? null,
          session.fee.effectiveMinutes,
          session.fee.billedMinutes,
          session.fee.grossAmountCents,
          session.fee.commissionAmountCents,
          session.id,
        );
      this.db.prepare('DELETE FROM time_segments WHERE session_id = ?').run(session.id);
      this.replaceSegments(session);
    });
  }

  findById(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row ? this.mapSession(row) : null;
  }

  findActive(): Session | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE status IN ('running', 'paused') ORDER BY id LIMIT 1")
      .get() as SessionRow | undefined;
    return row ? this.mapSession(row) : null;
  }

  list(input: {
    query?: string;
    status?: SessionStatus | 'all';
    from?: number;
    to?: number;
  }): Session[] {
    const conditions = ['1 = 1'];
    const params: (string | number)[] = [];

    if (input.query) {
      conditions.push('(LOWER(s.id) LIKE LOWER(?) OR LOWER(s.note) LIKE LOWER(?))');
      const query = `%${input.query}%`;
      params.push(query, query);
    }
    if (input.status && input.status !== 'all') {
      conditions.push('s.status = ?');
      params.push(input.status);
    }
    if (input.from !== undefined) {
      conditions.push('first_segment.startedAt >= ?');
      params.push(input.from);
    }
    if (input.to !== undefined) {
      conditions.push('first_segment.startedAt <= ?');
      params.push(input.to);
    }

    const rows = this.db
      .prepare(
        `SELECT s.*
         FROM sessions s
         JOIN (
           SELECT session_id, MIN(startedAt) AS startedAt
           FROM time_segments
           GROUP BY session_id
         ) first_segment ON first_segment.session_id = s.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY first_segment.startedAt DESC`,
      )
      .all(...params) as SessionRow[];

    return rows.map((row) => this.mapSession(row));
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  getSettings(): AppSettings {
    const rows = this.db
      .prepare(`SELECT key, value FROM app_settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(', ')})`)
      .all(...SETTING_KEYS) as { key: string; value: string }[];
    const values = new Map(rows.map((row) => [row.key, row.value]));

    return {
      billingMode: values.get('billingMode') as BillingMode,
      hourlyRateYuan: Number(values.get('hourlyRateYuan')),
      hourlyCommissionYuan: Number(values.get('hourlyCommissionYuan')),
      miniAlwaysOnTop: values.get('miniAlwaysOnTop') === 'true',
      ...(values.has('mainWindowBounds') ? { mainWindowBounds: JSON.parse(values.get('mainWindowBounds')!) } : {}),
    };
  }

  saveSettings(settings: AppSettings): void {
    this.transaction(() => {
      const upsert = this.db.prepare(
        'INSERT INTO app_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      );
      upsert.run('billingMode', settings.billingMode);
      upsert.run('hourlyRateYuan', String(settings.hourlyRateYuan));
      upsert.run('hourlyCommissionYuan', String(settings.hourlyCommissionYuan));
      upsert.run('miniAlwaysOnTop', String(settings.miniAlwaysOnTop));
      if (settings.mainWindowBounds !== undefined) {
        upsert.run('mainWindowBounds', JSON.stringify(settings.mainWindowBounds));
      }
    });
  }

  transaction<T>(work: () => T): T {
    if (this.db.inTransaction) {
      return work();
    }
    return this.db.transaction(work)();
  }

  private replaceSegments(session: Session): void {
    const insert = this.db.prepare(
      'INSERT INTO time_segments(id, session_id, sequence, startedAt, endedAt) VALUES (?, ?, ?, ?, ?)',
    );
    session.segments.forEach((segment, index) => {
      insert.run(segment.id ?? null, session.id, segment.sequence ?? index, segment.startedAt, segment.endedAt);
    });
  }

  private mapSession(row: SessionRow): Session {
    const segmentRows = this.db
      .prepare('SELECT id, sequence, startedAt, endedAt FROM time_segments WHERE session_id = ? ORDER BY sequence')
      .all(row.id) as SegmentRow[];

    return {
      id: row.id,
      status: row.status,
      settings: {
        billingMode: row.billingMode,
        hourlyRateYuan: row.hourlyRateYuan,
        hourlyCommissionYuan: row.hourlyCommissionYuan,
      },
      note: row.note,
      ...(row.invalidReason === null ? {} : { invalidReason: row.invalidReason }),
      ...(row.invalidatedAt === null ? {} : { invalidatedAt: row.invalidatedAt }),
      fee: {
        effectiveMinutes: row.effectiveMinutes,
        billedMinutes: row.billedMinutes,
        grossAmountCents: row.grossAmountCents,
        commissionAmountCents: row.commissionAmountCents,
      },
      segments: segmentRows.map((segment) => ({
        ...(segment.id === null ? {} : { id: segment.id }),
        sequence: segment.sequence,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
      })),
    };
  }
}

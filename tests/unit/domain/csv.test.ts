import { describe, expect, it } from 'vitest';
import { serializeSessions, csvEscape } from '../../../src/shared/domain/csv';
import { buildSession } from '../../fixtures/domain';

describe('csv domain serialization', () => {
  it('escapes commas, quotes, newlines and adds UTF-8 BOM', () => {
    const csv = serializeSessions([
      buildSession({
        id: 'csv-1',
        note: '老板, 小北\n"排位"',
        segments: [{ sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 2, 3), endedAt: Date.UTC(2026, 7, 6, 2, 3, 4) }],
      }),
    ], 'Asia/Shanghai');

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"老板, 小北\n""排位"""');
  });

  it('writes fixed headers, one row per session, local timezone timestamps and merged segments', () => {
    const csv = serializeSessions([
      buildSession({
        id: 'session-a',
        status: 'completed',
        note: '首局',
        fee: {
          effectiveMinutes: 31,
          billedMinutes: 30,
          grossAmountCents: 2000,
          commissionAmountCents: 150,
        },
        segments: [
          { sequence: 0, startedAt: Date.UTC(2026, 7, 6, 1, 2, 3), endedAt: Date.UTC(2026, 7, 6, 1, 32, 3) },
          { sequence: 1, startedAt: Date.UTC(2026, 7, 6, 1, 40, 0), endedAt: Date.UTC(2026, 7, 6, 1, 41, 0) },
        ],
      }),
      buildSession({
        id: 'session-b',
        status: 'invalid',
        note: '',
        fee: {
          effectiveMinutes: 0,
          billedMinutes: 0,
          grossAmountCents: 0,
          commissionAmountCents: 0,
        },
      }),
    ], 'Asia/Shanghai');

    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toBe([
      'id',
      'status',
      'startedAtLocal',
      'endedAtLocal',
      'effectiveMinutes',
      'billedMinutes',
      'grossAmountYuan',
      'commissionAmountYuan',
      'note',
      'segments',
    ].join(','));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"2026-08-06 09:02:03 GMT+08:00"');
    expect(lines[1]).toContain('"2026-08-06 09:41:00 GMT+08:00"');
    expect(lines[1]).toContain('"20.00"');
    expect(lines[1]).toContain('"1.50"');
    expect(lines[1]).toContain('"1:2026-08-06 09:02:03 GMT+08:00 -> 2026-08-06 09:32:03 GMT+08:00 | 2:2026-08-06 09:40:00 GMT+08:00 -> 2026-08-06 09:41:00 GMT+08:00"');
  });

  it('escapes arbitrary scalar values according to RFC4180', () => {
    expect(csvEscape('plain')).toBe('"plain"');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
  });
});

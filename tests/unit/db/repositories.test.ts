import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/main/db/database';
import { SessionRepository } from '../../../src/main/db/repositories';
import type { AppSettings } from '../../../src/shared/domain/types';
import { buildSession, buildSession as fixtureSession, defaultSettings } from '../../fixtures/domain';

function openRepository(): { db: ReturnType<typeof createDatabase>; repo: SessionRepository } {
  const db = createDatabase(':memory:');
  return { db, repo: new SessionRepository(db) };
}

describe('SessionRepository', () => {
  it('round trips a running session with an open segment', () => {
    const { db, repo } = openRepository();
    const session = buildSession({
      id: 'running-1',
      status: 'running',
      segments: [{ id: 'segment-1', sequence: 4, startedAt: 1_000, endedAt: null }],
    });

    repo.insertSession(session);

    expect(repo.findById(session.id)).toEqual(session);
    expect(repo.findActive()).toEqual(session);
    db.close();
  });

  it('round trips a completed session with multiple segments and fee fields', () => {
    const { db, repo } = openRepository();
    const session = buildSession({
      id: 'completed-1',
      status: 'completed',
      segments: [
        { sequence: 2, startedAt: 3_000, endedAt: 63_000 },
        { sequence: 1, startedAt: 1_000, endedAt: 2_000 },
      ],
      fee: {
        effectiveMinutes: 2,
        billedMinutes: 15,
        grossAmountCents: 1_000,
        commissionAmountCents: 75,
      },
    });

    repo.insertSession(session);

    expect(repo.findById(session.id)).toEqual({
      ...session,
      segments: [session.segments[1], session.segments[0]],
    });
    db.close();
  });

  it('updates a session and replaces its old segments', () => {
    const { db, repo } = openRepository();
    repo.insertSession(
      buildSession({
        id: 'replace-1',
        segments: [
          { sequence: 0, startedAt: 1_000, endedAt: 2_000 },
          { sequence: 1, startedAt: 3_000, endedAt: 4_000 },
        ],
      }),
    );
    const updated = buildSession({
      id: 'replace-1',
      note: 'updated',
      segments: [{ sequence: 7, startedAt: 5_000, endedAt: 9_000 }],
    });

    repo.updateSession(updated);

    expect(repo.findById(updated.id)).toEqual(updated);
    expect(db.prepare('select count(*) as count from time_segments where session_id = ?').get(updated.id)).toEqual({
      count: 1,
    });
    db.close();
  });

  it('deletes a session and cascades its segments', () => {
    const { db, repo } = openRepository();
    repo.insertSession(buildSession({ id: 'delete-1' }));

    repo.delete('delete-1');

    expect(repo.findById('delete-1')).toBeNull();
    expect(db.prepare('select count(*) as count from time_segments where session_id = ?').get('delete-1')).toEqual({
      count: 0,
    });
    db.close();
  });

  it('allows only one active session', () => {
    const { db, repo } = openRepository();
    repo.insertSession(buildSession({ id: 'active-1', status: 'paused' }));

    expect(() => repo.insertSession(buildSession({ id: 'active-2', status: 'running' }))).toThrow();
    db.close();
  });

  it('rolls back a failed transaction', () => {
    const { db, repo } = openRepository();

    expect(() =>
      repo.transaction(() => {
        repo.insertSession(buildSession({ id: 'rollback-1' }));
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(repo.findById('rollback-1')).toBeNull();
    db.close();
  });

  it('lists sessions by query, status, date range, and recent time', () => {
    const { db, repo } = openRepository();
    repo.insertSession(
      buildSession({
        id: 'older-match',
        note: 'Alpha note',
        status: 'completed',
        segments: [{ sequence: 0, startedAt: 1_000, endedAt: 2_000 }],
      }),
    );
    repo.insertSession(
      buildSession({
        id: 'newer-match',
        note: 'different',
        status: 'completed',
        segments: [{ sequence: 0, startedAt: 3_000, endedAt: 4_000 }],
      }),
    );
    repo.insertSession(
      buildSession({
        id: 'invalid-match',
        note: 'Alpha invalid',
        status: 'invalid',
        invalidReason: 'restart-discard',
        invalidatedAt: 5_000,
        segments: [{ sequence: 0, startedAt: 5_000, endedAt: 6_000 }],
      }),
    );

    expect(repo.list({ query: 'ALPHA', status: 'all' }).map(({ id }) => id)).toEqual([
      'invalid-match',
      'older-match',
    ]);
    expect(repo.list({ status: 'completed' }).map(({ id }) => id)).toEqual(['newer-match', 'older-match']);
    expect(repo.list({ status: 'invalid', from: 4_000, to: 5_000 }).map(({ id }) => id)).toEqual([
      'invalid-match',
    ]);
    expect(repo.list({ from: 1_000, to: 3_000 }).map(({ id }) => id)).toEqual(['newer-match', 'older-match']);
    db.close();
  });

  it('round trips typed settings and preserves main window bounds', () => {
    const { db, repo } = openRepository();
    const settings: AppSettings = {
      ...defaultSettings,
      billingMode: 'minute',
      hourlyRateYuan: 55,
      hourlyCommissionYuan: 4,
      miniAlwaysOnTop: true,
      mainWindowBounds: { x: 10, y: 20, width: 900, height: 700 },
    };

    repo.saveSettings(settings);

    expect(repo.getSettings()).toEqual(settings);
    expect(db.prepare('select value from app_settings where key = ?').get('mainWindowBounds')).toEqual({
      value: JSON.stringify(settings.mainWindowBounds),
    });
    db.close();
  });

  it('rolls back settings changes with the surrounding transaction', () => {
    const { db, repo } = openRepository();
    const original = repo.getSettings();

    expect(() =>
      repo.transaction(() => {
        repo.saveSettings({ ...original, hourlyRateYuan: 99 });
        throw new Error('settings write failed');
      }),
    ).toThrow('settings write failed');

    expect(repo.getSettings()).toEqual(original);
    db.close();
  });

  it('writes a session and all segments atomically', () => {
    const { db, repo } = openRepository();
    const session = fixtureSession({
      id: 'atomic-1',
      segments: [{ sequence: 0, startedAt: 1_000, endedAt: 2_000 }],
    });

    expect(() =>
      repo.transaction(() => {
        repo.insertSession(session);
        throw new Error('segment write failed');
      }),
    ).toThrow('segment write failed');
    expect(repo.findById(session.id)).toBeNull();
    db.close();
  });
});

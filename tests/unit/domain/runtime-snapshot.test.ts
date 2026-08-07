import { describe, expect, it } from 'vitest';

import { getRuntimeSnapshot } from '../../../src/shared/domain/runtime-snapshot';
import { completeSession, invalidateSession, pauseSession, startSession } from '../../../src/shared/domain/session-machine';
import type { BillingSettings } from '../../../src/shared/domain/types';

const settings: BillingSettings = { billingMode: 'minute', hourlyRateYuan: 40, hourlyCommissionYuan: 3 };

describe('runtime snapshots', () => {
  it('returns an idle zero snapshot for no session', () => {
    expect(getRuntimeSnapshot(null, 123)).toEqual({
      status: 'idle',
      effectiveSeconds: 0,
      effectiveMinutes: 0,
      billedMinutes: 0,
      grossAmountCents: 0,
      commissionAmountCents: 0,
      currentSegmentIndex: null,
    });
  });

  it('counts only complete seconds for a running segment without writing it back', () => {
    const session = startSession({ id: 's1', nowMs: 1_000, settings });
    const snapshot = getRuntimeSnapshot(session, 61_999);

    expect(snapshot).toMatchObject({
      status: 'running',
      effectiveSeconds: 60,
      effectiveMinutes: 1,
      billedMinutes: 1,
      grossAmountCents: 67,
      commissionAmountCents: 5,
      currentSegmentIndex: 0,
    });
    expect(session.segments[0].endedAt).toBeNull();
  });

  it('uses closed segments for paused and completed sessions', () => {
    const paused = pauseSession(startSession({ id: 's1', nowMs: 0, settings }), 60_000);
    const completed = completeSession(paused, 120_000);

    expect(getRuntimeSnapshot(paused, 999_999)).toEqual(expect.objectContaining({
      status: 'paused', effectiveSeconds: 60, currentSegmentIndex: null,
    }));
    expect(getRuntimeSnapshot(completed, 999_999)).toEqual(expect.objectContaining({
      status: 'completed', effectiveSeconds: 60, currentSegmentIndex: null,
    }));
  });

  it('returns zero fee and minutes for invalid sessions', () => {
    const invalid = invalidateSession(startSession({ id: 's1', nowMs: 0, settings }), {
      nowMs: 60_000,
      reason: 'restart-discard',
    });

    expect(getRuntimeSnapshot(invalid, 999_999)).toEqual({
      status: 'invalid',
      effectiveSeconds: 0,
      effectiveMinutes: 0,
      billedMinutes: 0,
      grossAmountCents: 0,
      commissionAmountCents: 0,
      currentSegmentIndex: null,
    });
  });

  it('reports clock skew without negative values when now precedes an open segment', () => {
    const session = startSession({ id: 's1', nowMs: 60_000, settings });

    expect(getRuntimeSnapshot(session, 59_999)).toEqual({
      status: 'running',
      effectiveSeconds: 0,
      effectiveMinutes: 0,
      billedMinutes: 0,
      grossAmountCents: 0,
      commissionAmountCents: 0,
      currentSegmentIndex: 0,
      error: { code: 'clock-skew', message: expect.any(String) },
    });
  });

  it('rejects a runtime now that is not a safe integer millisecond', () => {
    expect(() => getRuntimeSnapshot(null, 123.5)).toThrow(/safe integer|integer/);
    expect(() => getRuntimeSnapshot(null, Number.NaN)).toThrow();
  });
});

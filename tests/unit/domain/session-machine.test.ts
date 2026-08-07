import { describe, expect, it } from 'vitest';

import {
  completeSession,
  editSessionSegments,
  invalidateSession,
  pauseSession,
  resumeSession,
  startSession,
  updateSessionNote,
  updateSessionSettings,
} from '../../../src/shared/domain/session-machine';
import { calculateFeeResult } from '../../../src/shared/domain/billing';
import type { BillingSettings, Session } from '../../../src/shared/domain/types';

const settings: BillingSettings = {
  billingMode: '15-step',
  hourlyRateYuan: 40,
  hourlyCommissionYuan: 3,
};

const runningAt = (nowMs = 1_000): Session => startSession({ id: 's1', nowMs, settings });

describe('session state machine', () => {
  it('starts one running segment at the supplied timestamp', () => {
    const result = startSession({ id: 's1', nowMs: 1_000, settings });

    expect(result.status).toBe('running');
    expect(result.segments).toEqual([{ sequence: 0, startedAt: 1_000, endedAt: null }]);
    expect(result.fee).toEqual({
      effectiveMinutes: 0,
      billedMinutes: 0,
      grossAmountCents: 0,
      commissionAmountCents: 0,
    });
  });

  it('rejects a start timestamp that is not a safe whole-second node', () => {
    expect(() => startSession({ id: 's1', nowMs: 1_001, settings })).toThrow(/whole seconds|second/);
  });

  it('pauses, resumes and completes without timer accumulation', () => {
    const running = runningAt(0);
    const paused = pauseSession(running, 60_000);
    const resumed = resumeSession(paused, 60_000);
    const completed = completeSession(resumed, 120_000);

    expect(paused).toMatchObject({ status: 'paused', segments: [{ sequence: 0, startedAt: 0, endedAt: 60_000 }] });
    expect(resumed).toMatchObject({ status: 'running', segments: [
      { sequence: 0, startedAt: 0, endedAt: 60_000 },
      { sequence: 1, startedAt: 60_000, endedAt: null },
    ] });
    expect(completed.status).toBe('completed');
    expect(completed.segments).toHaveLength(2);
    expect(completed.fee).toEqual(calculateFeeResult({ effectiveSeconds: 120, settings }));
  });

  it('resumes with a unique sequence above non-contiguous existing values', () => {
    const paused = pauseSession(runningAt(0), 60_000);
    const edited = editSessionSegments(paused, [
      { sequence: 0, startedAt: 0, endedAt: 30_000 },
      { sequence: 2, startedAt: 30_000, endedAt: 60_000 },
    ], 60_000);

    const resumed = resumeSession(edited, 60_000);

    expect(resumed.segments).toEqual([
      { sequence: 0, startedAt: 0, endedAt: 30_000 },
      { sequence: 2, startedAt: 30_000, endedAt: 60_000 },
      { sequence: 3, startedAt: 60_000, endedAt: null },
    ]);
  });

  it('completes a paused session without adding a zero-length segment', () => {
    const completed = completeSession(pauseSession(runningAt(0), 60_000), 60_000);

    expect(completed.status).toBe('completed');
    expect(completed.segments).toEqual([{ sequence: 0, startedAt: 0, endedAt: 60_000 }]);
  });

  it('rejects pause at the open segment start because it would be zero duration', () => {
    expect(() => pauseSession(runningAt(60_000), 60_000)).toThrow(/later|duration|second/);
  });

  it('rejects illegal state transitions', () => {
    const running = runningAt(0);
    const paused = pauseSession(running, 60_000);
    const completed = completeSession(paused, 60_000);
    const invalid = invalidateSession(running, { nowMs: 60_000, reason: 'restart-discard' });

    expect(() => pauseSession(paused, 120_000)).toThrow(/running|state|status/);
    expect(() => resumeSession(running, 120_000)).toThrow(/paused|state|status/);
    expect(() => resumeSession(completed, 120_000)).toThrow(/paused|state|status/);
    expect(() => completeSession(completed, 120_000)).toThrow(/running|paused|state|status/);
    expect(() => invalidateSession(completed, { nowMs: 120_000, reason: 'restart-discard' })).toThrow();
    expect(() => invalidateSession(invalid, { nowMs: 120_000, reason: 'restart-discard' })).toThrow();
  });

  it('recalculates fee after every successful time write', () => {
    const paused = pauseSession(runningAt(0), 660_000);
    const resumed = resumeSession(paused, 900_000);
    const completed = completeSession(resumed, 1_500_000);

    expect(paused.fee).toEqual(calculateFeeResult({ effectiveSeconds: 660, settings }));
    expect(resumed.fee).toEqual(calculateFeeResult({ effectiveSeconds: 660, settings }));
    expect(completed.fee).toEqual(calculateFeeResult({ effectiveSeconds: 1_260, settings }));
  });

  it('updates settings only for active sessions and recalculates using current seconds', () => {
    const running = pauseSession(runningAt(0), 60_000);
    const nextSettings: BillingSettings = { billingMode: 'minute', hourlyRateYuan: 60, hourlyCommissionYuan: 5 };
    const updated = updateSessionSettings(running, nextSettings, 60_000);

    expect(updated.settings).toEqual(nextSettings);
    expect(updated.fee).toEqual(calculateFeeResult({ effectiveSeconds: 60, settings: nextSettings }));
    expect(() => updateSessionSettings(completeSession(running, 60_000), nextSettings, 60_000)).toThrow();
    expect(() => updateSessionSettings(invalidateSession(running, { nowMs: 60_000, reason: 'restart-discard' }), nextSettings, 60_000)).toThrow();
    expect(() => updateSessionSettings(running, { ...nextSettings, hourlyRateYuan: 0 }, 60_000)).toThrow();
  });

  it('includes the running segment elapsed at the write time when editing settings or segments', () => {
    const running = runningAt(0);
    const nextSettings: BillingSettings = { billingMode: 'minute', hourlyRateYuan: 60, hourlyCommissionYuan: 5 };

    expect(updateSessionSettings(running, nextSettings, 60_000).fee).toEqual(
      calculateFeeResult({ effectiveSeconds: 60, settings: nextSettings }),
    );
    expect(editSessionSegments(running, [{ sequence: 0, startedAt: 0, endedAt: null }], 60_000).fee).toEqual(
      calculateFeeResult({ effectiveSeconds: 60, settings }),
    );
  });

  it('trims notes and counts Unicode code points, without changing fee snapshots', () => {
    const session = runningAt(0);
    const running = updateSessionSettings(session, settings, 60_000);
    const paused = pauseSession(session, 60_000);
    const completed = completeSession(session, 60_000);
    const note = `  ${'😀'.repeat(500)}  `;
    const updated = updateSessionNote(running, note);

    expect(updated.note).toBe('😀'.repeat(500));
    expect(updated.fee).toEqual(running.fee);
    expect(updateSessionNote(paused, ' paused ').fee).toEqual(paused.fee);
    expect(updateSessionNote(completed, ' completed ').fee).toEqual(completed.fee);
    expect(() => updateSessionNote(session, '😀'.repeat(501))).toThrow(/500|length/);
    expect(() => updateSessionNote(invalidateSession(session, { nowMs: 60_000, reason: 'restart-discard' }), 'x')).toThrow();
    expect(updateSessionNote(completed, ' done ').note).toBe('done');
  });

  it('edits segments while preserving status and recalculates fee', () => {
    const session = pauseSession(runningAt(0), 60_000);
    const segments = [{ sequence: 0, startedAt: 10_000, endedAt: 70_000 }];
    const updated = editSessionSegments(session, segments, 70_000);

    expect(updated.status).toBe('paused');
    expect(updated.segments).toEqual(segments);
    expect(updated.fee).toEqual(calculateFeeResult({ effectiveSeconds: 60, settings }));
    expect(() => editSessionSegments(invalidateSession(session, { nowMs: 70_000, reason: 'restart-discard' }), segments, 70_000)).toThrow();
    expect(() => editSessionSegments(session, [{ sequence: 0, startedAt: 70_000, endedAt: 70_000 }], 70_000)).toThrow();
  });

  it('preserves input objects and arrays', () => {
    const session = runningAt(0);
    const original = structuredClone(session);
    const editedSegments = [{ sequence: 0, startedAt: 10_000, endedAt: null }];

    pauseSession(session, 60_000);
    editSessionSegments(session, editedSegments, 60_000);

    expect(session).toEqual(original);
    expect(editedSegments).toEqual([{ sequence: 0, startedAt: 10_000, endedAt: null }]);
  });

  it('rejects unsafe, subsecond, future, and backwards write timestamps', () => {
    expect(() => pauseSession(runningAt(0), 1_001)).toThrow();
    expect(() => pauseSession(runningAt(0), -1_000)).toThrow();
    expect(() => pauseSession(runningAt(60_000), 0)).toThrow();
    expect(() => completeSession(pauseSession(runningAt(0), 60_000), 59_000)).toThrow();
  });

  it('invalidates running and paused sessions with zero fee and preserved data', () => {
    const note = '  preserve me  ';
    const running = updateSessionNote(runningAt(0), note);
    const invalidRunning = invalidateSession(running, { nowMs: 120_000, reason: 'restart-discard' });
    const paused = pauseSession(runningAt(0), 60_000);
    const invalidPaused = invalidateSession(paused, { nowMs: 120_000, reason: 'restart-new-session' });

    expect(invalidRunning).toMatchObject({ status: 'invalid', note: 'preserve me', invalidReason: 'restart-discard', invalidatedAt: 120_000 });
    expect(invalidRunning.segments).toEqual([{ sequence: 0, startedAt: 0, endedAt: 120_000 }]);
    expect(invalidPaused).toMatchObject({ status: 'invalid', invalidReason: 'restart-new-session', invalidatedAt: 120_000 });
    expect(invalidPaused.segments).toEqual(paused.segments);
    expect(invalidRunning.fee).toEqual({ effectiveMinutes: 0, billedMinutes: 0, grossAmountCents: 0, commissionAmountCents: 0 });
  });
});

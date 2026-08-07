import { calculateFeeResult } from './billing';
import { calculateEffectiveSeconds } from './time-segments';
import type { Session } from './session-machine';
import type { FeeResult, SessionStatus, TimeSegment } from './types';

export interface RuntimeSnapshot {
  status: SessionStatus | 'idle';
  effectiveSeconds: number;
  effectiveMinutes: number;
  billedMinutes: number;
  grossAmountCents: number;
  commissionAmountCents: number;
  currentSegmentIndex: number | null;
  error?: { code: 'clock-skew'; message: string };
}

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function assertRuntimeTimestamp(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('nowMs must be a safe integer millisecond timestamp');
  }
}

function zeroSnapshot(status: SessionStatus | 'idle', currentSegmentIndex: number | null): RuntimeSnapshot {
  return {
    status,
    effectiveSeconds: 0,
    effectiveMinutes: 0,
    billedMinutes: 0,
    grossAmountCents: 0,
    commissionAmountCents: 0,
    currentSegmentIndex,
  };
}

function toSnapshot(
  status: SessionStatus,
  effectiveSeconds: number,
  fee: FeeResult,
  currentSegmentIndex: number | null,
): RuntimeSnapshot {
  return {
    status,
    effectiveSeconds,
    effectiveMinutes: fee.effectiveMinutes,
    billedMinutes: fee.billedMinutes,
    grossAmountCents: fee.grossAmountCents,
    commissionAmountCents: fee.commissionAmountCents,
    currentSegmentIndex,
  };
}

function calculateClosedSeconds(segments: TimeSegment[]): number {
  return calculateEffectiveSeconds(segments.filter((segment) => segment.endedAt !== null));
}

function calculateOpenSeconds(nowMs: number, startedAt: number): number {
  const elapsedMilliseconds = BigInt(nowMs) - BigInt(startedAt);
  if (elapsedMilliseconds < 0n) {
    throw new RangeError('Open segment duration cannot be negative');
  }

  const elapsedSeconds = elapsedMilliseconds / 1_000n;
  if (elapsedSeconds > MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError('effective seconds exceed the supported integer range');
  }

  return Number(elapsedSeconds);
}

function addSeconds(closedSeconds: number, openSeconds: number): number {
  const effectiveSeconds = BigInt(closedSeconds) + BigInt(openSeconds);
  if (effectiveSeconds < 0n || effectiveSeconds > MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError('effective seconds exceed the supported integer range');
  }

  return Number(effectiveSeconds);
}

export function getRuntimeSnapshot(session: Session | null, nowMs: number): RuntimeSnapshot {
  assertRuntimeTimestamp(nowMs);
  if (session === null) {
    return zeroSnapshot('idle', null);
  }

  if (session.status === 'invalid') {
    return zeroSnapshot('invalid', null);
  }

  if (session.status !== 'running') {
    const effectiveSeconds = calculateClosedSeconds(session.segments);
    return toSnapshot(
      session.status,
      effectiveSeconds,
      calculateFeeResult({ effectiveSeconds, settings: session.settings }),
      null,
    );
  }

  const currentSegmentIndex = session.segments.length - 1;
  const currentSegment = session.segments[currentSegmentIndex];
  if (!currentSegment || currentSegment.endedAt !== null) {
    throw new Error('A running session must have an open final segment');
  }

  const closedSeconds = calculateClosedSeconds(session.segments);
  if (nowMs < currentSegment.startedAt) {
    return {
      ...toSnapshot(
        'running',
        closedSeconds,
        calculateFeeResult({ effectiveSeconds: closedSeconds, settings: session.settings }),
        currentSegmentIndex,
      ),
      error: { code: 'clock-skew', message: 'Current time is earlier than the open segment start time.' },
    };
  }

  const openSeconds = calculateOpenSeconds(nowMs, currentSegment.startedAt);
  const effectiveSeconds = addSeconds(closedSeconds, openSeconds);
  return toSnapshot(
    'running',
    effectiveSeconds,
    calculateFeeResult({ effectiveSeconds, settings: session.settings }),
    currentSegmentIndex,
  );
}

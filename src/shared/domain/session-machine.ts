import { calculateFeeResult } from './billing';
import { calculateEffectiveSeconds, validateSegments } from './time-segments';
import type { BillingSettings, FeeResult, TimeSegment } from './types';
import type { SessionStatus } from './types';

export type InvalidReason = 'restart-discard' | 'restart-new-session';

export interface Session {
  id: string;
  status: SessionStatus;
  settings: BillingSettings;
  note: string;
  segments: TimeSegment[];
  invalidReason?: InvalidReason;
  invalidatedAt?: number;
  fee: FeeResult;
}

const MAX_DATE_MS = 8_640_000_000_000_000;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const ZERO_FEE: FeeResult = {
  effectiveMinutes: 0,
  billedMinutes: 0,
  grossAmountCents: 0,
  commissionAmountCents: 0,
};

function assertWriteTimestamp(value: number, name: string): void {
  if (
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_DATE_MS ||
    value % 1_000 !== 0 ||
    Number.isNaN(new Date(value).getTime())
  ) {
    throw new RangeError(`${name} must be a representable safe integer timestamp at whole seconds`);
  }
}

function cloneSegments(segments: TimeSegment[]): TimeSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

function cloneSettings(settings: BillingSettings): BillingSettings {
  return { ...settings };
}

function cloneSession(session: Session): Session {
  return {
    ...session,
    settings: cloneSettings(session.settings),
    segments: cloneSegments(session.segments),
    fee: { ...session.fee },
  };
}

function assertValidSegments(status: SessionStatus, segments: TimeSegment[], nowMs: number): void {
  const validation = validateSegments({ status, segments }, nowMs);
  if (!validation.valid) {
    throw new RangeError(validation.errors.map((error) => error.message).join(' '));
  }
}

function calculatePersistedFee(segments: TimeSegment[], settings: BillingSettings): FeeResult {
  const closedSegments = segments.filter((segment) => segment.endedAt !== null);
  return calculateFeeResult({
    effectiveSeconds: calculateEffectiveSeconds(closedSegments),
    settings,
  });
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

function calculateFeeAtNow(
  status: SessionStatus,
  segments: TimeSegment[],
  settings: BillingSettings,
  nowMs: number,
): FeeResult {
  const closedSeconds = calculateEffectiveSeconds(segments.filter((segment) => segment.endedAt !== null));
  if (status !== 'running') {
    return calculateFeeResult({ effectiveSeconds: closedSeconds, settings });
  }

  const openSegment = segments.at(-1);
  if (!openSegment || openSegment.endedAt !== null) {
    throw new Error('A running session must have an open final segment');
  }

  const openSeconds = calculateOpenSeconds(nowMs, openSegment.startedAt);
  return calculateFeeResult({
    effectiveSeconds: addSeconds(closedSeconds, openSeconds),
    settings,
  });
}

function nextSequence(segments: TimeSegment[]): number {
  let maximum = -1;
  for (const [index, segment] of segments.entries()) {
    const sequence = segment.sequence ?? index;
    if (!Number.isSafeInteger(sequence)) {
      throw new RangeError('Segment sequence must be a safe integer');
    }
    maximum = Math.max(maximum, sequence);
  }

  if (maximum >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Segment sequence exceeds the supported integer range');
  }
  return maximum + 1;
}

function assertSessionStatus(session: Session, allowed: readonly SessionStatus[]): void {
  if (!allowed.includes(session.status)) {
    throw new Error(`Operation is not allowed for session state ${session.status}`);
  }
}

function withRecalculatedFee(session: Session, fee: FeeResult): Session {
  return { ...session, fee: { ...fee } };
}

export function startSession(input: {
  id: string;
  nowMs: number;
  settings: BillingSettings;
}): Session {
  assertWriteTimestamp(input.nowMs, 'nowMs');
  const segments: TimeSegment[] = [{ sequence: 0, startedAt: input.nowMs, endedAt: null }];
  assertValidSegments('running', segments, input.nowMs);

  return {
    id: input.id,
    status: 'running',
    settings: cloneSettings(input.settings),
    note: '',
    segments,
    fee: calculateFeeResult({ effectiveSeconds: 0, settings: input.settings }),
  };
}

export function pauseSession(session: Session, nowMs: number): Session {
  assertWriteTimestamp(nowMs, 'nowMs');
  assertSessionStatus(session, ['running']);
  const segments = cloneSegments(session.segments);
  const last = segments.at(-1);
  if (!last || last.endedAt !== null) {
    throw new Error('A running session must have an open final segment');
  }
  last.endedAt = nowMs;
  assertValidSegments('paused', segments, nowMs);

  return withRecalculatedFee({ ...cloneSession(session), status: 'paused', segments }, calculatePersistedFee(segments, session.settings));
}

export function resumeSession(session: Session, nowMs: number): Session {
  assertWriteTimestamp(nowMs, 'nowMs');
  assertSessionStatus(session, ['paused']);
  const segments = cloneSegments(session.segments);
  segments.push({ sequence: nextSequence(segments), startedAt: nowMs, endedAt: null });
  assertValidSegments('running', segments, nowMs);

  return withRecalculatedFee({ ...cloneSession(session), status: 'running', segments }, calculatePersistedFee(session.segments, session.settings));
}

export function completeSession(session: Session, nowMs: number): Session {
  assertWriteTimestamp(nowMs, 'nowMs');
  assertSessionStatus(session, ['running', 'paused']);
  const segments = cloneSegments(session.segments);

  if (session.status === 'running') {
    const last = segments.at(-1);
    if (!last || last.endedAt !== null) {
      throw new Error('A running session must have an open final segment');
    }
    last.endedAt = nowMs;
  }

  assertValidSegments('completed', segments, nowMs);
  return withRecalculatedFee({ ...cloneSession(session), status: 'completed', segments }, calculatePersistedFee(segments, session.settings));
}

export function invalidateSession(
  session: Session,
  input: { nowMs: number; reason: InvalidReason },
): Session {
  assertWriteTimestamp(input.nowMs, 'nowMs');
  assertSessionStatus(session, ['running', 'paused']);
  const segments = cloneSegments(session.segments);

  if (session.status === 'running') {
    const last = segments.at(-1);
    if (!last || last.endedAt !== null) {
      throw new Error('A running session must have an open final segment');
    }
    last.endedAt = input.nowMs;
  }

  assertValidSegments('invalid', segments, input.nowMs);
  return {
    ...cloneSession(session),
    status: 'invalid',
    segments,
    invalidReason: input.reason,
    invalidatedAt: input.nowMs,
    fee: { ...ZERO_FEE },
  };
}

export function updateSessionSettings(
  session: Session,
  settings: BillingSettings,
  nowMs: number,
): Session {
  assertWriteTimestamp(nowMs, 'nowMs');
  assertSessionStatus(session, ['running', 'paused']);
  assertValidSegments(session.status, session.segments, nowMs);
  const next = { ...cloneSession(session), settings: cloneSettings(settings) };
  return withRecalculatedFee(next, calculateFeeAtNow(session.status, session.segments, settings, nowMs));
}

export function updateSessionNote(session: Session, note: string): Session {
  if (session.status === 'invalid') {
    throw new Error('Invalid sessions cannot be edited');
  }
  const trimmed = note.trim();
  if ([...trimmed].length > 500) {
    throw new RangeError('Note cannot exceed 500 Unicode code points');
  }

  return { ...cloneSession(session), note: trimmed };
}

export function editSessionSegments(
  session: Session,
  segments: TimeSegment[],
  nowMs: number,
): Session {
  assertWriteTimestamp(nowMs, 'nowMs');
  if (session.status === 'invalid') {
    throw new Error('Invalid sessions cannot be edited');
  }
  const nextSegments = cloneSegments(segments);
  assertValidSegments(session.status, nextSegments, nowMs);

  return withRecalculatedFee(
    { ...cloneSession(session), segments: nextSegments },
    calculateFeeAtNow(session.status, nextSegments, session.settings, nowMs),
  );
}

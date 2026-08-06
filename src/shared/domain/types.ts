export type BillingMode = '15-step' | '15-floor' | 'minute';

export type SessionStatus = 'running' | 'paused' | 'completed' | 'invalid';

export interface BillingSettings {
  billingMode: BillingMode;
  hourlyRateYuan: number;
  hourlyCommissionYuan: number;
}

export interface FeeResult {
  effectiveMinutes: number;
  billedMinutes: number;
  grossAmountCents: number;
  commissionAmountCents: number;
}

export interface TimeSegment {
  id?: string;
  sequence?: number;
  startedAt: number;
  endedAt: number | null;
}

export type SegmentValidationErrorCode =
  | 'invalid-date'
  | 'subsecond'
  | 'zero-duration'
  | 'overlap'
  | 'open-segment'
  | 'future-time'
  | 'too-many-segments'
  | 'empty-segments';

export interface SegmentValidationError {
  code: SegmentValidationErrorCode;
  segmentIndex: number;
  field?: 'startedAt' | 'endedAt';
  message: string;
}

import type { RuntimeSnapshot } from './runtime-snapshot';
import type { Session } from './session-machine';

export type { RuntimeSnapshot } from './runtime-snapshot';
export type { Session } from './session-machine';

export interface AppSettings extends BillingSettings {
  miniAlwaysOnTop: boolean;
  mainWindowBounds?: { x: number; y: number; width: number; height: number };
}

export interface SessionSnapshot {
  session: Session | null;
  runtime: RuntimeSnapshot;
  recoveryRequired: boolean;
  error?: { code: string; message: string; fieldErrors?: SegmentValidationError[] };
}

export type RecoveryChoice = 'restore' | 'restart-new-session' | 'discard';

export interface RecoveryResult {
  invalidatedSession?: Session;
  newSession?: Session;
  snapshot: SessionSnapshot;
}

export interface HistoryQuery {
  query?: string;
  status?: 'all' | 'completed' | 'invalid';
  from?: number;
  to?: number;
}

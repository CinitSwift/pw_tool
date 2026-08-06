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

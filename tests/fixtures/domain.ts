import type {
  BillingSettings,
  FeeResult,
  Session,
  SessionSnapshot,
  TimeSegment,
} from '../../src/shared/domain/types';

export const defaultSettings: BillingSettings = {
  billingMode: '15-step',
  hourlyRateYuan: 40,
  hourlyCommissionYuan: 3,
};

const zeroFee: FeeResult = {
  effectiveMinutes: 0,
  billedMinutes: 0,
  grossAmountCents: 0,
  commissionAmountCents: 0,
};

export function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'fixture-session',
    status: 'completed',
    settings: { ...defaultSettings },
    note: '',
    segments: [{ sequence: 0, startedAt: 0, endedAt: 60_000 }],
    fee: { ...zeroFee },
    ...overrides,
  };
}

export function buildSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session: null,
    runtime: {
      status: 'idle',
      effectiveSeconds: 0,
      effectiveMinutes: 0,
      billedMinutes: 0,
      grossAmountCents: 0,
      commissionAmountCents: 0,
      currentSegmentIndex: null,
    },
    recoveryRequired: false,
    ...overrides,
  };
}

export const idleSnapshot = buildSnapshot();
export const runningSnapshot = buildSnapshot({
  session: buildSession({
    status: 'running',
    segments: [{ sequence: 0, startedAt: 0, endedAt: null }],
    fee: { ...zeroFee },
  }),
  runtime: {
    status: 'running',
    effectiveSeconds: 0,
    effectiveMinutes: 0,
    billedMinutes: 0,
    grossAmountCents: 0,
    commissionAmountCents: 0,
    currentSegmentIndex: 0,
  },
  recoveryRequired: true,
});
export const pausedSnapshot = buildSnapshot({
  session: buildSession({
    status: 'paused',
    segments: [{ sequence: 0, startedAt: 0, endedAt: 60_000 }],
  }),
  runtime: {
    status: 'paused',
    effectiveSeconds: 60,
    effectiveMinutes: 1,
    billedMinutes: 0,
    grossAmountCents: 0,
    commissionAmountCents: 0,
    currentSegmentIndex: null,
  },
  recoveryRequired: true,
});
export const completedRecord = buildSession({
  status: 'completed',
  segments: [{ sequence: 0, startedAt: 0, endedAt: 60_000 }],
  fee: { effectiveMinutes: 1, billedMinutes: 0, grossAmountCents: 0, commissionAmountCents: 0 },
});
export const invalidRecord = buildSession({
  status: 'invalid',
  invalidReason: 'restart-discard',
  invalidatedAt: 120_000,
  fee: { ...zeroFee },
});

export const segment = (startedAt: number, endedAt: number | null, sequence?: number): TimeSegment => ({
  ...(sequence === undefined ? {} : { sequence }),
  startedAt,
  endedAt,
});

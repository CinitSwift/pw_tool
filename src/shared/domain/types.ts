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

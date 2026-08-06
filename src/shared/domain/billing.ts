import type { BillingMode, BillingSettings, FeeResult } from './types';

const BILLING_MODES: readonly BillingMode[] = ['15-step', '15-floor', 'minute'];
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function assertBillingMode(value: unknown): asserts value is BillingMode {
  if (!BILLING_MODES.includes(value as BillingMode)) {
    throw new RangeError(`billingMode must be one of: ${BILLING_MODES.join(', ')}`);
  }
}

function calculateAmountCents(billedMinutes: number, hourlyAmountYuan: number): number {
  const numerator = BigInt(billedMinutes) * BigInt(hourlyAmountYuan) * 100n;
  const amountCents = (numerator + 30n) / 60n;

  if (amountCents > MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError('calculated amount exceeds the supported integer range');
  }

  return Number(amountCents);
}

export function roundUpEffectiveMinutes(effectiveSeconds: number): number {
  assertNonNegativeInteger(effectiveSeconds, 'effectiveSeconds');
  return Math.ceil(effectiveSeconds / 60);
}

export function getBilledMinutes(effectiveMinutes: number, billingMode: BillingMode): number {
  assertNonNegativeInteger(effectiveMinutes, 'effectiveMinutes');
  assertBillingMode(billingMode);

  if (billingMode === 'minute') {
    return effectiveMinutes;
  }

  if (billingMode === '15-floor') {
    return Math.floor(effectiveMinutes / 15) * 15;
  }

  const remainder = effectiveMinutes % 60;
  const completeHourMinutes = effectiveMinutes - remainder;

  if (remainder <= 10) {
    return completeHourMinutes;
  }

  if (remainder <= 20) {
    return completeHourMinutes + 15;
  }

  if (remainder <= 40) {
    return completeHourMinutes + 30;
  }

  if (remainder <= 50) {
    return completeHourMinutes + 45;
  }

  return completeHourMinutes + 60;
}

export function calculateSessionFee(input: {
  effectiveMinutes: number;
  hourlyRateYuan: number;
  billingMode: BillingMode;
}): Pick<FeeResult, 'billedMinutes' | 'grossAmountCents'> {
  assertPositiveInteger(input.hourlyRateYuan, 'hourlyRateYuan');

  const billedMinutes = getBilledMinutes(input.effectiveMinutes, input.billingMode);

  return {
    billedMinutes,
    grossAmountCents: calculateAmountCents(billedMinutes, input.hourlyRateYuan),
  };
}

export function calculateCommission(input: {
  billedMinutes: number;
  hourlyCommissionYuan: number;
}): number {
  assertNonNegativeInteger(input.billedMinutes, 'billedMinutes');
  assertPositiveInteger(input.hourlyCommissionYuan, 'hourlyCommissionYuan');

  return calculateAmountCents(input.billedMinutes, input.hourlyCommissionYuan);
}

export function calculateFeeResult(input: {
  effectiveSeconds: number;
  settings: BillingSettings;
}): FeeResult {
  const effectiveMinutes = roundUpEffectiveMinutes(input.effectiveSeconds);
  const { billedMinutes, grossAmountCents } = calculateSessionFee({
    effectiveMinutes,
    hourlyRateYuan: input.settings.hourlyRateYuan,
    billingMode: input.settings.billingMode,
  });

  return {
    effectiveMinutes,
    billedMinutes,
    grossAmountCents,
    commissionAmountCents: calculateCommission({
      billedMinutes,
      hourlyCommissionYuan: input.settings.hourlyCommissionYuan,
    }),
  };
}

import { describe, expect, it } from 'vitest';

import {
  calculateCommission,
  calculateFeeResult,
  calculateSessionFee,
  getBilledMinutes,
  roundUpEffectiveMinutes,
} from '../../../src/shared/domain/billing';

describe('billing', () => {
  it.each([
    [0, 0],
    [1, 1],
    [59, 1],
    [60, 1],
    [61, 2],
  ])('rounds %i seconds to %i effective minutes', (seconds, expected) => {
    expect(roundUpEffectiveMinutes(seconds)).toBe(expected);
  });

  it.each([
    [10, 0],
    [11, 15],
    [20, 15],
    [21, 30],
    [40, 30],
    [41, 45],
    [50, 45],
    [51, 60],
    [59, 60],
    [60, 60],
    [70, 60],
    [71, 75],
    [75, 75],
    [111, 120],
  ])('bills %i effective minutes as %i minutes in 15-step mode', (minutes, expected) => {
    expect(getBilledMinutes(minutes, '15-step')).toBe(expected);
  });

  it.each([
    [14, 0],
    [15, 15],
    [29, 15],
    [30, 30],
  ])('bills %i effective minutes as %i minutes in 15-floor mode', (minutes, expected) => {
    expect(getBilledMinutes(minutes, '15-floor')).toBe(expected);
  });

  it.each([
    [0, 0],
    [1, 1],
    [16, 16],
    [121, 121],
  ])('bills %i effective minutes as %i minutes in minute mode', (minutes, expected) => {
    expect(getBilledMinutes(minutes, 'minute')).toBe(expected);
  });

  it('calculates gross amount in integer cents', () => {
    expect(
      calculateSessionFee({
        effectiveMinutes: 90,
        hourlyRateYuan: 40,
        billingMode: 'minute',
      }),
    ).toEqual({ billedMinutes: 90, grossAmountCents: 6_000 });

    expect(
      calculateSessionFee({
        effectiveMinutes: 1,
        hourlyRateYuan: 1,
        billingMode: 'minute',
      }).grossAmountCents,
    ).toBe(2);
  });

  it('calculates commission in integer cents', () => {
    expect(calculateCommission({ billedMinutes: 90, hourlyCommissionYuan: 3 })).toBe(450);
    expect(calculateCommission({ billedMinutes: 1, hourlyCommissionYuan: 1 })).toBe(2);
  });

  it('calculates a complete fee result from effective seconds and settings', () => {
    expect(
      calculateFeeResult({
        effectiveSeconds: 61,
        settings: {
          billingMode: 'minute',
          hourlyRateYuan: 40,
          hourlyCommissionYuan: 3,
        },
      }),
    ).toEqual({
      effectiveMinutes: 2,
      billedMinutes: 2,
      grossAmountCents: 133,
      commissionAmountCents: 10,
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid effective seconds %s',
    (seconds) => {
      expect(() => roundUpEffectiveMinutes(seconds)).toThrow();
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid effective minutes %s',
    (minutes) => {
      expect(() => getBilledMinutes(minutes, 'minute')).toThrow();
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid hourly rate %s',
    (hourlyRateYuan) => {
      expect(() =>
        calculateSessionFee({
          effectiveMinutes: 1,
          hourlyRateYuan,
          billingMode: 'minute',
        }),
      ).toThrow();
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid hourly commission %s',
    (hourlyCommissionYuan) => {
      expect(() => calculateCommission({ billedMinutes: 1, hourlyCommissionYuan })).toThrow();
    },
  );

  it('rejects unsupported billing modes', () => {
    expect(() => getBilledMinutes(1, 'unknown' as never)).toThrow();
    expect(() =>
      calculateSessionFee({
        effectiveMinutes: 1,
        hourlyRateYuan: 40,
        billingMode: 'unknown' as never,
      }),
    ).toThrow();
  });
});

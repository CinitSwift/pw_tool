import { describe, expect, it } from 'vitest';

import {
  calculateEffectiveSeconds,
  validateSegments,
} from '../../../src/shared/domain/time-segments';
import type { SessionStatus, TimeSegment } from '../../../src/shared/domain/types';

const segment = (
  startedAt: number,
  endedAt: number | null,
  sequence?: number,
): TimeSegment => ({ startedAt, endedAt, ...(sequence === undefined ? {} : { sequence }) });

const validate = (status: SessionStatus, segments: TimeSegment[], nowMs = 2_000_000) =>
  validateSegments({ status, segments }, nowMs);

describe('calculateEffectiveSeconds', () => {
  it('calculates one closed segment from millisecond timestamps', () => {
    expect(calculateEffectiveSeconds([segment(10_000, 70_000)])).toBe(60);
  });

  it('sums all closed segments before minute rounding', () => {
    expect(
      calculateEffectiveSeconds([
        segment(0, 630_000),
        segment(1_050_000, 1_360_000),
      ]),
    ).toBe(940);
  });

  it.each([
    ['an open segment', [segment(0, null)]],
    ['a zero-length segment', [segment(60_000, 60_000)]],
    ['a reversed segment', [segment(60_000, 59_000)]],
    ['a subsecond boundary', [segment(0, 1_500)]],
    ['an invalid timestamp', [segment(Number.NaN, 1_000)]],
  ])('rejects %s', (_name, segments) => {
    expect(() => calculateEffectiveSeconds(segments)).toThrow();
  });

  it('rejects a total outside the non-negative safe integer range', () => {
    const largeEnd = 8_000_000_000_000_000;
    const segments = Array.from({ length: 1_127 }, () => segment(0, largeEnd));

    expect(() => calculateEffectiveSeconds(segments)).toThrow(
      'effective seconds exceed the supported integer range',
    );
  });
});

describe('validateSegments', () => {
  it('accepts normal single and multiple closed segments', () => {
    expect(validate('completed', [segment(0, 60_000)], 60_000)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      validate(
        'completed',
        [segment(0, 630_000), segment(1_050_000, 1_360_000)],
        1_360_000,
      ),
    ).toEqual({ valid: true, errors: [] });
  });

  it('allows pause and resume at the same second', () => {
    expect(
      validate('paused', [segment(0, 60_000), segment(60_000, 120_000)], 120_000),
    ).toEqual({ valid: true, errors: [] });
  });

  it('reports zero-duration at the segment end field', () => {
    expect(validate('completed', [segment(60_000, 60_000)], 60_000)).toEqual({
      valid: false,
      errors: [
        expect.objectContaining({
          code: 'zero-duration',
          segmentIndex: 0,
          field: 'endedAt',
        }),
      ],
    });
  });

  it('reports overlap at the next segment start field', () => {
    const result = validate(
      'completed',
      [segment(0, 100_000), segment(90_000, 120_000)],
      120_000,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'overlap', segmentIndex: 1, field: 'startedAt' }),
    );
  });

  it('rejects an open non-final segment', () => {
    const result = validate(
      'running',
      [segment(0, null), segment(100_000, 200_000)],
      200_000,
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'open-segment', segmentIndex: 0, field: 'endedAt' }),
    );
  });

  it('requires running to have exactly one final open segment', () => {
    expect(validate('running', [segment(0, null)], 60_000)).toEqual({
      valid: true,
      errors: [],
    });

    const closed = validate('running', [segment(0, 60_000)], 60_000);
    expect(closed.errors).toContainEqual(
      expect.objectContaining({ code: 'open-segment', segmentIndex: 0, field: 'endedAt' }),
    );
  });

  it.each(['paused', 'completed', 'invalid'] as const)(
    'requires %s segments to be closed',
    (status) => {
      const result = validate(status, [segment(0, null)], 60_000);

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'open-segment', segmentIndex: 0, field: 'endedAt' }),
      );
    },
  );

  it.each(['running', 'paused', 'completed', 'invalid'] as const)(
    'rejects an empty %s session',
    (status) => {
      expect(validate(status, [], 0).errors).toContainEqual(
        expect.objectContaining({ code: 'empty-segments', segmentIndex: -1 }),
      );
    },
  );

  it('reports future timestamps with their segment and field', () => {
    const result = validate('completed', [segment(121_000, 122_000)], 120_000);

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'future-time', segmentIndex: 0, field: 'startedAt' }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'future-time', segmentIndex: 0, field: 'endedAt' }),
    );
  });

  it.each([
    ['unsafe timestamp', Number.MAX_SAFE_INTEGER + 1, 'invalid-date'],
    ['non-integer timestamp', 1.5, 'invalid-date'],
    ['out-of-range date', 8_640_000_000_001_000, 'invalid-date'],
    ['subsecond timestamp', 1_500, 'subsecond'],
  ] as const)('rejects %s', (_name, startedAt, code) => {
    const result = validate('completed', [segment(startedAt, 10_000)], 20_000);

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code, segmentIndex: 0, field: 'startedAt' }),
    );
  });

  it('accepts a current time with millisecond precision', () => {
    const result = validateSegments({ status: 'completed', segments: [segment(0, 1_000)] }, 1_501);

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 8_640_000_000_000_001])(
    'rejects invalid current time %s',
    (nowMs) => {
      const result = validateSegments(
        { status: 'completed', segments: [segment(0, 1_000)] },
        nowMs,
      );

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'invalid-date', segmentIndex: -1 }),
      );
    },
  );

  it('rejects a negative out-of-range current time', () => {
    const result = validateSegments(
      { status: 'completed', segments: [segment(0, 1_000)] },
      -8_640_000_000_000_001,
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'invalid-date', segmentIndex: -1 }),
    );
  });

  it('accepts 1000 segments and rejects 1001', () => {
    const thousand = Array.from({ length: 1_000 }, (_, index) =>
      segment(index * 1_000, (index + 1) * 1_000),
    );

    expect(validate('completed', thousand, 1_000_000)).toEqual({ valid: true, errors: [] });

    const result = validate(
      'completed',
      [...thousand, segment(1_000_000, 1_001_000)],
      1_001_000,
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'too-many-segments', segmentIndex: 1_000 }),
    );
  });

  it('allows non-zero, non-contiguous sequence values', () => {
    expect(
      validate(
        'completed',
        [segment(0, 1_000, 7), segment(1_000, 2_000, 42)],
        2_000,
      ),
    ).toEqual({ valid: true, errors: [] });
  });
});

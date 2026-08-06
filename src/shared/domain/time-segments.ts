import type {
  SegmentValidationError,
  SessionStatus,
  TimeSegment,
} from './types';

const MAX_SEGMENTS = 1_000;
const MAX_DATE_MS = 8_640_000_000_000_000;
const MILLISECONDS_PER_SECOND = 1_000;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function isRepresentableTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= MAX_DATE_MS;
}

function isSecondBoundary(value: number): boolean {
  return value % MILLISECONDS_PER_SECOND === 0;
}

function assertSecondTimestamp(value: number, name: string): void {
  if (!isRepresentableTimestamp(value)) {
    throw new RangeError(`${name} must be a representable millisecond timestamp`);
  }

  if (!isSecondBoundary(value)) {
    throw new RangeError(`${name} must be precise to whole seconds`);
  }
}

export function calculateEffectiveSeconds(segments: TimeSegment[]): number {
  let totalMilliseconds = 0n;

  for (const [index, segment] of segments.entries()) {
    assertSecondTimestamp(segment.startedAt, `segments[${index}].startedAt`);

    if (segment.endedAt === null) {
      throw new RangeError(`segments[${index}].endedAt must be closed`);
    }

    assertSecondTimestamp(segment.endedAt, `segments[${index}].endedAt`);

    if (segment.endedAt <= segment.startedAt) {
      throw new RangeError(`segments[${index}].endedAt must be later than startedAt`);
    }

    totalMilliseconds += BigInt(segment.endedAt) - BigInt(segment.startedAt);
  }

  const totalSeconds = totalMilliseconds / BigInt(MILLISECONDS_PER_SECOND);
  if (totalSeconds > MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError('effective seconds exceed the supported integer range');
  }

  return Number(totalSeconds);
}

export function validateSegments(
  input: { status: SessionStatus; segments: TimeSegment[] },
  nowMs: number,
): { valid: boolean; errors: SegmentValidationError[] } {
  if (!Number.isSafeInteger(nowMs)) {
    return {
      valid: false,
      errors: [
        {
          code: 'invalid-date',
          segmentIndex: -1,
          message: 'Current time must be a safe integer millisecond timestamp.',
        },
      ],
    };
  }

  const errors: SegmentValidationError[] = [];
  const { segments, status } = input;

  if (segments.length === 0) {
    errors.push({
      code: 'empty-segments',
      segmentIndex: -1,
      message: 'An active or persisted session must contain at least one time segment.',
    });
  }

  if (segments.length > MAX_SEGMENTS) {
    errors.push({
      code: 'too-many-segments',
      segmentIndex: MAX_SEGMENTS,
      message: `A session cannot contain more than ${MAX_SEGMENTS} time segments.`,
    });
  }

  for (const [index, segment] of segments.entries()) {
    const startedAtValid = validateTimestampField(
      errors,
      segment.startedAt,
      nowMs,
      index,
      'startedAt',
    );
    const endedAtValid =
      segment.endedAt === null
        ? false
        : validateTimestampField(errors, segment.endedAt, nowMs, index, 'endedAt');

    if (segment.endedAt === null) {
      if (status !== 'running' || index !== segments.length - 1) {
        errors.push({
          code: 'open-segment',
          segmentIndex: index,
          field: 'endedAt',
          message: 'Only the final segment of a running session may remain open.',
        });
      }
    } else if (startedAtValid && endedAtValid && segment.endedAt <= segment.startedAt) {
      errors.push({
        code: 'zero-duration',
        segmentIndex: index,
        field: 'endedAt',
        message: 'Segment end time must be later than its start time.',
      });
    }

    if (index > 0) {
      const previousEndedAt = segments[index - 1].endedAt;
      if (
        previousEndedAt !== null &&
        isRepresentableTimestamp(previousEndedAt) &&
        isSecondBoundary(previousEndedAt) &&
        startedAtValid &&
        segment.startedAt < previousEndedAt
      ) {
        errors.push({
          code: 'overlap',
          segmentIndex: index,
          field: 'startedAt',
          message: 'Segment start time cannot be earlier than the previous segment end time.',
        });
      }
    }
  }

  if (status === 'running' && segments.length > 0) {
    const lastIndex = segments.length - 1;
    if (segments[lastIndex].endedAt !== null) {
      errors.push({
        code: 'open-segment',
        segmentIndex: lastIndex,
        field: 'endedAt',
        message: 'A running session must have exactly one open final segment.',
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateTimestampField(
  errors: SegmentValidationError[],
  value: number,
  nowMs: number,
  segmentIndex: number,
  field: 'startedAt' | 'endedAt',
): boolean {
  if (!isRepresentableTimestamp(value)) {
    errors.push({
      code: 'invalid-date',
      segmentIndex,
      field,
      message: 'Time must be a representable integer millisecond timestamp.',
    });
    return false;
  }

  if (!isSecondBoundary(value)) {
    errors.push({
      code: 'subsecond',
      segmentIndex,
      field,
      message: 'Time must be precise to whole seconds.',
    });
    return false;
  }

  if (value > nowMs) {
    errors.push({
      code: 'future-time',
      segmentIndex,
      field,
      message: 'Time cannot be later than the current time.',
    });
  }

  return true;
}

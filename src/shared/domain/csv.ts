import type { Session } from './session-machine';

const CSV_HEADERS = [
  'id',
  'status',
  'startedAtLocal',
  'endedAtLocal',
  'effectiveMinutes',
  'billedMinutes',
  'grossAmountYuan',
  'commissionAmountYuan',
  'note',
  'segments',
] as const;

function formatLocalTimestamp(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((value) => value.type === type)?.value ?? '00';
  const utcFromParts = Date.UTC(
    Number(part('year')),
    Number(part('month')) - 1,
    Number(part('day')),
    Number(part('hour')),
    Number(part('minute')),
    Number(part('second')),
  );
  const offsetMinutes = Math.round((utcFromParts - timestamp) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offsetMins = String(absOffset % 60).padStart(2, '0');
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')} GMT${sign}${offsetHours}:${offsetMins}`;
}

function formatMoneyYuan(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function formatSegment(segment: Session['segments'][number], index: number, timezone: string): string {
  return `${index + 1}:${formatLocalTimestamp(segment.startedAt, timezone)} -> ${segment.endedAt === null ? 'open' : formatLocalTimestamp(segment.endedAt, timezone)}`;
}

export function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function serializeSessions(sessions: Session[], timezone: string): string {
  const rows = sessions.map((session) => {
    const firstSegment = session.segments[0];
    const lastSegment = session.segments.at(-1);
    const startedAtLocal = firstSegment ? formatLocalTimestamp(firstSegment.startedAt, timezone) : '';
    const endedAtLocal = lastSegment?.endedAt === null || lastSegment === undefined ? '' : formatLocalTimestamp(lastSegment.endedAt, timezone);
    const segments = session.segments.map((segment, index) => formatSegment(segment, index, timezone)).join(' | ');

    return [
      session.id,
      session.status,
      startedAtLocal,
      endedAtLocal,
      String(session.fee.effectiveMinutes),
      String(session.fee.billedMinutes),
      formatMoneyYuan(session.fee.grossAmountCents),
      formatMoneyYuan(session.fee.commissionAmountCents),
      session.note,
      segments,
    ].map(csvEscape).join(',');
  });

  return `\uFEFF${[CSV_HEADERS.join(','), ...rows].join('\r\n')}`;
}

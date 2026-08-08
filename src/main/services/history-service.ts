import { editSessionSegments } from '../../shared/domain/session-machine';
import type { Session } from '../../shared/domain/session-machine';
import { SegmentValidationFailure } from '../../shared/domain/time-segments';
import type { HistoryQuery, TimeSegment } from '../../shared/domain/types';
import { IpcDomainError } from '../../shared/ipc-errors';

export interface HistoryServiceRepository {
  findById(id: string): Session | null;
  list(input: HistoryQuery): Session[];
  delete(id: string): void;
  updateSession(session: Session): void;
  transaction<T>(work: () => T): T;
}

function toValidationError(error: unknown, message: string): never {
  if (error instanceof SegmentValidationFailure) {
    throw new IpcDomainError('validation-error', message, error.fieldErrors);
  }
  if (error instanceof RangeError) {
    throw new IpcDomainError('validation-error', message);
  }
  throw error;
}

export class HistoryService {
  constructor(
    private readonly repository: HistoryServiceRepository,
    private readonly clock: () => number = () => Math.floor(Date.now() / 1_000) * 1_000,
  ) {}

  list(input: HistoryQuery): Session[] {
    return this.repository.list(input);
  }

  delete(id: string): void {
    this.repository.delete(id);
  }

  editSegments(input: { sessionId: string; segments: TimeSegment[] }): Session {
    const session = this.repository.findById(input.sessionId);
    if (!session) {
      throw new Error('session does not exist');
    }

    let next: Session;
    try {
      next = editSessionSegments(session, input.segments, this.clock());
    } catch (error) {
      toValidationError(error, 'The time segments are invalid.');
    }

    this.repository.transaction(() => this.repository.updateSession(next));
    return next;
  }
}

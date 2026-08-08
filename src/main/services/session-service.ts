import { randomUUID } from 'node:crypto';
import {
  completeSession,
  editSessionSegments,
  invalidateSession,
  pauseSession,
  resumeSession,
  startSession,
  updateSessionNote,
  updateSessionSettings,
} from '../../shared/domain/session-machine';
import type { Session } from '../../shared/domain/session-machine';
import { getRuntimeSnapshot } from '../../shared/domain/runtime-snapshot';
import { SegmentValidationFailure } from '../../shared/domain/time-segments';
import type {
  AppSettings,
  BillingSettings,
  EditSegmentsInput,
  RecoveryChoice,
  RecoveryResult,
  SessionSnapshot,
  TimeSegment,
} from '../../shared/domain/types';
import { IpcDomainError } from '../../shared/ipc-errors';

export interface SessionServiceRepository {
  findById(id: string): Session | null;
  findActive(): Session | null;
  insertSession(session: Session): void;
  updateSession(session: Session): void;
  getSettings(): AppSettings;
  transaction<T>(work: () => T): T;
}

const INTERNAL_SNAPSHOT_ERROR = {
  code: 'internal-error',
  message: 'An internal error occurred.',
} as const;
const SECOND_MS = 1_000;

function toValidationError(error: unknown, message: string): never {
  if (error instanceof SegmentValidationFailure) {
    throw new IpcDomainError('validation-error', message, error.fieldErrors);
  }
  if (error instanceof RangeError) {
    throw new IpcDomainError('validation-error', message);
  }
  throw error;
}

export class SessionService {
  private recoveryPending: boolean | undefined;

  constructor(
    private readonly repository: SessionServiceRepository,
    private readonly clock: () => number = () => Math.floor(Date.now() / 1_000) * 1_000,
    private readonly createId: () => string = randomUUID,
  ) {}

  getSnapshot(): SessionSnapshot {
    try {
      const active = this.repository.findActive();
      if (!active) {
        this.recoveryPending = false;
        return this.snapshot(null, false);
      }

      this.recoveryPending ??= true;
      return this.snapshot(active, this.recoveryPending);
    } catch {
      this.recoveryPending = false;
      return this.internalErrorSnapshot(null, false);
    }
  }

  start(): SessionSnapshot {
    if (this.repository.findActive()) {
      throw new Error('active session already exists');
    }

    const session = startSession({
      id: this.createId(),
      nowMs: this.clock(),
      settings: this.repository.getSettings(),
    });
    this.repository.transaction(() => this.repository.insertSession(session));
    this.recoveryPending = false;
    return this.snapshot(session, false);
  }

  pause(): SessionSnapshot {
    return this.update((session, nowMs) => pauseSession(session, nowMs), undefined, true);
  }

  resume(): SessionSnapshot {
    return this.update((session, nowMs) => resumeSession(session, nowMs), undefined, true);
  }

  complete(): SessionSnapshot {
    return this.update((session, nowMs) => completeSession(session, nowMs), undefined, true);
  }

  updateSettings(settings: BillingSettings): SessionSnapshot {
    return this.update(
      (session, nowMs) => updateSessionSettings(session, settings, nowMs),
      'The billing settings are invalid.',
    );
  }

  updateNote(note: string): SessionSnapshot {
    return this.update((session) => updateSessionNote(session, note), 'The note is invalid.');
  }

  editSegments(input: EditSegmentsInput): SessionSnapshot {
    const { sessionId, segments } = Array.isArray(input)
      ? { sessionId: undefined, segments: input }
      : input;
    return this.update(
      (session, nowMs) => editSessionSegments(session, segments, nowMs),
      'The time segments are invalid.',
      false,
      sessionId,
    );
  }

  handleRecovery(choice: RecoveryChoice): RecoveryResult {
    const active = this.requireActive();
    if (choice === 'restore') {
      this.recoveryPending = false;
      return { snapshot: this.snapshot(active, false) };
    }

    const nowMs = this.commandTimestamp(active);
    const reason = choice === 'discard' ? 'restart-discard' : 'restart-new-session';
    const invalidatedSession = invalidateSession(active, { nowMs, reason });
    let newSession: Session | undefined;

    this.repository.transaction(() => {
      this.repository.updateSession(invalidatedSession);
      if (choice === 'restart-new-session') {
        newSession = {
          ...startSession({ id: this.createId(), nowMs, settings: active.settings }),
          note: active.note,
        };
        this.repository.insertSession(newSession);
      }
    });

    this.recoveryPending = false;
    return {
      invalidatedSession,
      ...(newSession ? { newSession } : {}),
      snapshot: this.snapshot(newSession ?? null, false),
    };
  }

  private requireActive(): Session {
    const active = this.repository.findActive();
    if (!active) {
      throw new Error('active session does not exist');
    }
    return active;
  }

  private update(
    transform: (session: Session, nowMs: number) => Session,
    validationMessage?: string,
    monotonicTimestamp = false,
    sessionId?: string,
  ): SessionSnapshot {
    const active = sessionId ? this.requireById(sessionId) : this.requireActive();
    const nowMs = monotonicTimestamp ? this.commandTimestamp(active) : this.clock();
    let next: Session;
    try {
      next = transform(active, nowMs);
    } catch (error) {
      if (validationMessage) {
        toValidationError(error, validationMessage);
      }
      throw error;
    }
    this.repository.transaction(() => this.repository.updateSession(next));
    this.recoveryPending = false;
    return this.snapshot(next, false);
  }

  private requireById(id: string): Session {
    const session = this.repository.findById(id);
    if (!session) {
      throw new Error('session does not exist');
    }
    return session;
  }

  private commandTimestamp(session: Session): number {
    const lastSegment = session.segments.at(-1);
    const lastRelevantTimestamp = lastSegment?.endedAt ?? lastSegment?.startedAt;
    if (lastRelevantTimestamp === undefined) return this.clock();
    return Math.max(this.clock(), lastRelevantTimestamp + SECOND_MS);
  }

  private snapshot(session: Session | null, recoveryRequired: boolean): SessionSnapshot {
    const nowMs = this.clock();
    try {
      return { session, runtime: getRuntimeSnapshot(session, nowMs), recoveryRequired };
    } catch {
      return this.internalErrorSnapshot(session, recoveryRequired);
    }
  }

  private internalErrorSnapshot(session: Session | null, recoveryRequired: boolean): SessionSnapshot {
    return {
      session,
      runtime: getRuntimeSnapshot(null, 0),
      recoveryRequired,
      error: INTERNAL_SNAPSHOT_ERROR,
    };
  }
}

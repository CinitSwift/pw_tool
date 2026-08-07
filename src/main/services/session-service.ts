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
import type {
  AppSettings,
  BillingSettings,
  RecoveryChoice,
  RecoveryResult,
  SessionSnapshot,
  TimeSegment,
} from '../../shared/domain/types';

export interface SessionServiceRepository {
  findActive(): Session | null;
  insertSession(session: Session): void;
  updateSession(session: Session): void;
  getSettings(): AppSettings;
  transaction<T>(work: () => T): T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SessionService {
  private recoveryPending: boolean | undefined;

  constructor(
    private readonly repository: SessionServiceRepository,
    private readonly clock: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  getSnapshot(): SessionSnapshot {
    const active = this.repository.findActive();
    if (!active) {
      this.recoveryPending = false;
      return this.snapshot(null, false);
    }

    this.recoveryPending ??= true;
    return this.snapshot(active, this.recoveryPending);
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
    return this.update((session, nowMs) => pauseSession(session, nowMs));
  }

  resume(): SessionSnapshot {
    return this.update((session, nowMs) => resumeSession(session, nowMs));
  }

  complete(): SessionSnapshot {
    return this.update((session, nowMs) => completeSession(session, nowMs));
  }

  updateSettings(settings: BillingSettings): SessionSnapshot {
    return this.update((session, nowMs) => updateSessionSettings(session, settings, nowMs));
  }

  updateNote(note: string): SessionSnapshot {
    return this.update((session) => updateSessionNote(session, note));
  }

  editSegments(segments: TimeSegment[]): SessionSnapshot {
    return this.update((session, nowMs) => editSessionSegments(session, segments, nowMs));
  }

  handleRecovery(choice: RecoveryChoice): RecoveryResult {
    const active = this.requireActive();
    if (choice === 'restore') {
      this.recoveryPending = false;
      return { snapshot: this.snapshot(active, false) };
    }

    const nowMs = this.clock();
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

  private update(transform: (session: Session, nowMs: number) => Session): SessionSnapshot {
    const next = transform(this.requireActive(), this.clock());
    this.repository.transaction(() => this.repository.updateSession(next));
    this.recoveryPending = false;
    return this.snapshot(next, false);
  }

  private snapshot(session: Session | null, recoveryRequired: boolean): SessionSnapshot {
    const nowMs = this.clock();
    try {
      return { session, runtime: getRuntimeSnapshot(session, nowMs), recoveryRequired };
    } catch (error) {
      return {
        session,
        runtime: getRuntimeSnapshot(null, nowMs),
        recoveryRequired,
        error: { code: 'session-snapshot-error', message: errorMessage(error) },
      };
    }
  }
}

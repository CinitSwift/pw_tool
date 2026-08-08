import type { Session } from '../../src/shared/domain/session-machine';
import type { AppSettings, HistoryQuery } from '../../src/shared/domain/types';
import { defaultSettings } from './domain';

export class InMemoryRepository {
  sessions: Session[];
  settings: AppSettings;
  transactionCount = 0;
  insertCount = 0;
  updateCount = 0;
  saveSettingsCount = 0;

  constructor(input: { sessions?: Session[]; settings?: AppSettings } = {}) {
    this.sessions = structuredClone(input.sessions ?? []);
    this.settings = structuredClone(
      input.settings ?? { ...defaultSettings, miniAlwaysOnTop: false },
    );
  }

  findActive(): Session | null {
    return structuredClone(
      this.sessions.find(({ status }) => status === 'running' || status === 'paused') ?? null,
    );
  }

  findById(id: string): Session | null {
    return structuredClone(this.sessions.find((session) => session.id === id) ?? null);
  }

  insertSession(session: Session): void {
    if (this.sessions.some(({ status }) => status === 'running' || status === 'paused')) {
      throw new Error('unique active session constraint failed');
    }
    this.insertCount += 1;
    this.sessions.push(structuredClone(session));
  }

  updateSession(session: Session): void {
    const index = this.sessions.findIndex(({ id }) => id === session.id);
    if (index < 0) {
      throw new Error(`session ${session.id} not found`);
    }
    this.updateCount += 1;
    this.sessions[index] = structuredClone(session);
  }

  list(_input: HistoryQuery): Session[] {
    return structuredClone(this.sessions);
  }

  delete(id: string): void {
    this.sessions = this.sessions.filter((session) => session.id !== id);
  }

  getSettings(): AppSettings {
    return structuredClone(this.settings);
  }

  saveSettings(settings: AppSettings): void {
    this.saveSettingsCount += 1;
    this.settings = structuredClone(settings);
  }

  transaction<T>(work: () => T): T {
    this.transactionCount += 1;
    const sessions = structuredClone(this.sessions);
    const settings = structuredClone(this.settings);
    try {
      return work();
    } catch (error) {
      this.sessions = sessions;
      this.settings = settings;
      throw error;
    }
  }
}

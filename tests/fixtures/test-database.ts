import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../../src/main/db/database';
import { SessionRepository } from '../../src/main/db/repositories';
import { buildSession } from './domain';

export interface TestDatabaseFixture {
  userDataDir: string;
  databasePath: string;
  repository: SessionRepository;
  seedRunningSession(): Promise<void>;
  seedCompletedSession(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabaseFixture> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'pw-tool-user-data-'));
  const databasePath = join(userDataDir, 'pw-tool.sqlite3');
  const db = createDatabase(databasePath);
  const repository = new SessionRepository(db);
  const now = Math.floor(Date.now() / 1_000) * 1_000;

  const close = async (): Promise<void> => {
    db.close();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => undefined);
  };

  return {
    userDataDir,
    databasePath,
    repository,
    seedRunningSession: async () => {
      repository.insertSession(buildSession({
        id: 'running-session',
        status: 'running',
        segments: [{ sequence: 0, startedAt: now - 30_000, endedAt: null }],
      }));
    },
    seedCompletedSession: async () => {
      repository.insertSession(buildSession({
        id: 'completed-session',
        status: 'completed',
        segments: [{ sequence: 0, startedAt: now - 120_000, endedAt: now - 60_000 }],
      }));
    },
    close,
  };
}

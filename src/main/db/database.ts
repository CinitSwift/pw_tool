import Database from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION, INITIAL_MIGRATION_SQL } from './schema';

export type AppDatabase = Database.Database;

export function createDatabase(filename: string): AppDatabase {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');

  try {
    const migrate = db.transaction(() => {
      const schemaVersionTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
        .get();

      if (!schemaVersionTable) {
        db.exec(INITIAL_MIGRATION_SQL);
        return;
      }

      const row = db.prepare('SELECT version FROM schema_version').get() as { version?: number } | undefined;
      if (!row || row.version !== CURRENT_SCHEMA_VERSION) {
        throw new Error(`Unsupported database schema version: ${row?.version ?? 'missing'}`);
      }
    });
    migrate();
  } catch (error) {
    db.close();
    throw error;
  }

  return db;
}

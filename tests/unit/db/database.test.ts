import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/main/db/database';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('createDatabase', () => {
  it('creates the schema and default settings', () => {
    const db = createDatabase(':memory:');

    expect(db.prepare('select version from schema_version').get()).toEqual({ version: 1 });
    expect(db.prepare('select value from app_settings where key = ?').get('billingMode')).toEqual({
      value: '15-step',
    });
    expect(db.prepare('select value from app_settings where key = ?').get('hourlyRateYuan')).toEqual({
      value: '40',
    });
    expect(db.prepare('select value from app_settings where key = ?').get('hourlyCommissionYuan')).toEqual({
      value: '3',
    });
    expect(db.prepare('select value from app_settings where key = ?').get('miniAlwaysOnTop')).toEqual({
      value: 'false',
    });

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('fails clearly for an unknown or future schema version without deleting the database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pw-tool-db-'));
    const filename = join(directory, 'future.sqlite');
    const db = new Database(filename);
    db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (99);');
    db.close();

    expect(() => createDatabase(filename)).toThrow(/Unsupported database schema version: 99/);
    const preserved = new Database(filename);
    expect(preserved.prepare('select version from schema_version').get()).toEqual({ version: 99 });
    preserved.close();
    rmSync(directory, { recursive: true, force: true });
  });
});

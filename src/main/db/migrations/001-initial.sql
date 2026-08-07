CREATE TABLE schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'invalid')),
  billingMode TEXT NOT NULL CHECK (billingMode IN ('15-step', '15-floor', 'minute')),
  hourlyRateYuan INTEGER NOT NULL,
  hourlyCommissionYuan INTEGER NOT NULL,
  note TEXT NOT NULL,
  invalidReason TEXT CHECK (invalidReason IS NULL OR invalidReason IN ('restart-discard', 'restart-new-session')),
  invalidatedAt INTEGER,
  effectiveMinutes INTEGER NOT NULL,
  billedMinutes INTEGER NOT NULL,
  grossAmountCents INTEGER NOT NULL,
  commissionAmountCents INTEGER NOT NULL
);

CREATE TABLE time_segments (
  id TEXT,
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  startedAt INTEGER NOT NULL,
  endedAt INTEGER,
  PRIMARY KEY (session_id, sequence),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE UNIQUE INDEX one_active_session
  ON sessions((1))
  WHERE status IN ('running', 'paused');

INSERT INTO schema_version(version) VALUES (1);

INSERT INTO app_settings(key, value) VALUES
  ('billingMode', '15-step'),
  ('hourlyRateYuan', '40'),
  ('hourlyCommissionYuan', '3'),
  ('miniAlwaysOnTop', 'false');

-- OneRoster sandbox schema.
--
-- Arrays and nested objects are stored as JSON text. SQLite has no array type
-- and D1 is SQLite. The alternative (join tables for grades, subjects, terms)
-- buys nothing here because nothing filters on the array contents, and it
-- would triple the row count of a dataset whose whole point is being served
-- quickly.
--
-- Every table carries `dataset_id` so one deployment can host several
-- independent districts, which is what a consumer needs in order to test
-- multi-tenancy against something real.

CREATE TABLE datasets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  school_year   TEXT NOT NULL,
  seed          INTEGER NOT NULL,
  generated_at  TEXT NOT NULL,
  summary_json  TEXT NOT NULL
);

CREATE TABLE orgs (
  dataset_id         TEXT NOT NULL,
  sourced_id         TEXT NOT NULL,
  status             TEXT NOT NULL,
  date_last_modified TEXT NOT NULL,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL,
  identifier         TEXT,
  parent_sourced_id  TEXT,
  PRIMARY KEY (dataset_id, sourced_id)
);
CREATE INDEX idx_orgs_type ON orgs (dataset_id, type);
CREATE INDEX idx_orgs_dlm ON orgs (dataset_id, date_last_modified);

CREATE TABLE academic_sessions (
  dataset_id         TEXT NOT NULL,
  sourced_id         TEXT NOT NULL,
  status             TEXT NOT NULL,
  date_last_modified TEXT NOT NULL,
  title              TEXT NOT NULL,
  start_date         TEXT NOT NULL,
  end_date           TEXT NOT NULL,
  type               TEXT NOT NULL,
  parent_sourced_id  TEXT,
  school_year        TEXT NOT NULL,
  PRIMARY KEY (dataset_id, sourced_id)
);
CREATE INDEX idx_sessions_type ON academic_sessions (dataset_id, type);
CREATE INDEX idx_sessions_dlm ON academic_sessions (dataset_id, date_last_modified);

CREATE TABLE courses (
  dataset_id            TEXT NOT NULL,
  sourced_id            TEXT NOT NULL,
  status                TEXT NOT NULL,
  date_last_modified    TEXT NOT NULL,
  title                 TEXT NOT NULL,
  school_year_sourced_id TEXT,
  course_code           TEXT,
  grades_json           TEXT NOT NULL,
  subjects_json         TEXT NOT NULL,
  org_sourced_id        TEXT NOT NULL,
  subject_codes_json    TEXT NOT NULL,
  PRIMARY KEY (dataset_id, sourced_id)
);
CREATE INDEX idx_courses_org ON courses (dataset_id, org_sourced_id);
CREATE INDEX idx_courses_dlm ON courses (dataset_id, date_last_modified);

CREATE TABLE classes (
  dataset_id          TEXT NOT NULL,
  sourced_id          TEXT NOT NULL,
  status              TEXT NOT NULL,
  date_last_modified  TEXT NOT NULL,
  title               TEXT NOT NULL,
  class_code          TEXT,
  class_type          TEXT NOT NULL,
  location            TEXT,
  grades_json         TEXT NOT NULL,
  subjects_json       TEXT NOT NULL,
  course_sourced_id   TEXT NOT NULL,
  school_sourced_id   TEXT NOT NULL,
  term_sourced_ids_json TEXT NOT NULL,
  subject_codes_json  TEXT NOT NULL,
  periods_json        TEXT NOT NULL,
  PRIMARY KEY (dataset_id, sourced_id)
);
CREATE INDEX idx_classes_school ON classes (dataset_id, school_sourced_id);
CREATE INDEX idx_classes_course ON classes (dataset_id, course_sourced_id);
CREATE INDEX idx_classes_dlm ON classes (dataset_id, date_last_modified);

CREATE TABLE users (
  dataset_id          TEXT NOT NULL,
  sourced_id          TEXT NOT NULL,
  status              TEXT NOT NULL,
  date_last_modified  TEXT NOT NULL,
  username            TEXT NOT NULL,
  user_ids_json       TEXT NOT NULL,
  enabled_user        INTEGER NOT NULL,
  given_name          TEXT NOT NULL,
  family_name         TEXT NOT NULL,
  middle_name         TEXT,
  role                TEXT NOT NULL,
  identifier          TEXT,
  email               TEXT,
  sms                 TEXT,
  phone               TEXT,
  agent_sourced_ids_json TEXT NOT NULL,
  org_sourced_ids_json   TEXT NOT NULL,
  grades_json         TEXT NOT NULL,
  PRIMARY KEY (dataset_id, sourced_id)
);
CREATE INDEX idx_users_role ON users (dataset_id, role);
CREATE INDEX idx_users_dlm ON users (dataset_id, date_last_modified);

CREATE TABLE enrollments (
  dataset_id         TEXT NOT NULL,
  sourced_id         TEXT NOT NULL,
  status             TEXT NOT NULL,
  date_last_modified TEXT NOT NULL,
  class_sourced_id   TEXT NOT NULL,
  school_sourced_id  TEXT NOT NULL,
  user_sourced_id    TEXT NOT NULL,
  role               TEXT NOT NULL,
  is_primary         INTEGER,
  begin_date         TEXT,
  end_date           TEXT,
  PRIMARY KEY (dataset_id, sourced_id)
);
CREATE INDEX idx_enr_class ON enrollments (dataset_id, class_sourced_id);
CREATE INDEX idx_enr_user ON enrollments (dataset_id, user_sourced_id);
CREATE INDEX idx_enr_school ON enrollments (dataset_id, school_sourced_id);
CREATE INDEX idx_enr_dlm ON enrollments (dataset_id, date_last_modified);

CREATE TABLE demographics (
  dataset_id         TEXT NOT NULL,
  sourced_id         TEXT NOT NULL,
  status             TEXT NOT NULL,
  date_last_modified TEXT NOT NULL,
  payload_json       TEXT NOT NULL,
  PRIMARY KEY (dataset_id, sourced_id)
);

-- API clients. OAuth 2.0 client credentials, one per consumer, scoped to a
-- dataset. `shared_schools_json` is how a partial share is expressed: the
-- district administrator has ticked twelve of forty schools and the consumer
-- must be correct on that subset.
CREATE TABLE api_clients (
  client_id           TEXT PRIMARY KEY,
  client_secret_hash  TEXT NOT NULL,
  dataset_id          TEXT NOT NULL,
  label               TEXT NOT NULL,
  scopes_json         TEXT NOT NULL,
  shared_schools_json TEXT,
  created_at          TEXT NOT NULL
);

-- Fault injection, per client. This is the feature that makes the sandbox
-- useful rather than decorative: a consumer's validation gates can only be
-- demonstrated if something can make the feed misbehave on demand.
CREATE TABLE faults (
  client_id  TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE access_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  TEXT,
  method     TEXT NOT NULL,
  path       TEXT NOT NULL,
  status     INTEGER NOT NULL,
  faults_applied_json TEXT,
  at         TEXT NOT NULL
);
CREATE INDEX idx_log_at ON access_log (at DESC);

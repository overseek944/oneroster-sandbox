/**
 * Generates a district and emits the SQL to load it.
 *
 * Rows are batched into multi-row INSERTs because D1 charges per statement and
 * a district is tens of thousands of rows; one statement per row turns a
 * fifteen second seed into a fifteen minute one.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_CONFIG, generateDistrict, summarise } from "../src/generator/district.js";
import type { DistrictData } from "../src/domain/types.js";

/**
 * Rows per INSERT. Demographics carries a JSON payload per row, so a batch of
 * 200 exceeds D1's statement size limit; it gets a smaller one.
 */
const BATCH = 200;
const BATCH_BY_TABLE: Record<string, number> = { demographics: 25 };
const DATASET_ID = process.env["DATASET_ID"] ?? "riverbend";

function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertMany(table: string, columns: string[], rows: unknown[][]): string[] {
  const statements: string[] = [];
  const size = BATCH_BY_TABLE[table] ?? BATCH;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const values = chunk.map((row) => `(${row.map(quote).join(",")})`).join(",\n");
    statements.push(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES\n${values};`,
    );
  }
  return statements;
}

function build(data: DistrictData, datasetId: string): string[] {
  const out: string[] = [];
  const j = JSON.stringify;

  out.push(...insertMany(
    "orgs",
    ["dataset_id", "sourced_id", "status", "date_last_modified", "name", "type", "identifier", "parent_sourced_id"],
    data.orgs.map((o) => [datasetId, o.sourcedId, o.status, o.dateLastModified, o.name, o.type, o.identifier, o.parentSourcedId]),
  ));

  out.push(...insertMany(
    "academic_sessions",
    ["dataset_id", "sourced_id", "status", "date_last_modified", "title", "start_date", "end_date", "type", "parent_sourced_id", "school_year"],
    data.academicSessions.map((s) => [datasetId, s.sourcedId, s.status, s.dateLastModified, s.title, s.startDate, s.endDate, s.type, s.parentSourcedId, s.schoolYear]),
  ));

  out.push(...insertMany(
    "courses",
    ["dataset_id", "sourced_id", "status", "date_last_modified", "title", "school_year_sourced_id", "course_code", "grades_json", "subjects_json", "org_sourced_id", "subject_codes_json"],
    data.courses.map((c) => [datasetId, c.sourcedId, c.status, c.dateLastModified, c.title, c.schoolYearSourcedId, c.courseCode, j(c.grades), j(c.subjects), c.orgSourcedId, j(c.subjectCodes)]),
  ));

  out.push(...insertMany(
    "classes",
    ["dataset_id", "sourced_id", "status", "date_last_modified", "title", "class_code", "class_type", "location", "grades_json", "subjects_json", "course_sourced_id", "school_sourced_id", "term_sourced_ids_json", "subject_codes_json", "periods_json"],
    data.classes.map((c) => [datasetId, c.sourcedId, c.status, c.dateLastModified, c.title, c.classCode, c.classType, c.location, j(c.grades), j(c.subjects), c.courseSourcedId, c.schoolSourcedId, j(c.termSourcedIds), j(c.subjectCodes), j(c.periods)]),
  ));

  out.push(...insertMany(
    "users",
    ["dataset_id", "sourced_id", "status", "date_last_modified", "username", "user_ids_json", "enabled_user", "given_name", "family_name", "middle_name", "role", "identifier", "email", "sms", "phone", "agent_sourced_ids_json", "org_sourced_ids_json", "grades_json"],
    data.users.map((u) => [datasetId, u.sourcedId, u.status, u.dateLastModified, u.username, j(u.userIds), u.enabledUser, u.givenName, u.familyName, u.middleName, u.role, u.identifier, u.email, u.sms, u.phone, j(u.agentSourcedIds), j(u.orgSourcedIds), j(u.grades)]),
  ));

  out.push(...insertMany(
    "enrollments",
    ["dataset_id", "sourced_id", "status", "date_last_modified", "class_sourced_id", "school_sourced_id", "user_sourced_id", "role", "is_primary", "begin_date", "end_date"],
    data.enrollments.map((e) => [datasetId, e.sourcedId, e.status, e.dateLastModified, e.classSourcedId, e.schoolSourcedId, e.userSourcedId, e.role, e.primary === null ? null : e.primary, e.beginDate, e.endDate]),
  ));

  out.push(...insertMany(
    "demographics",
    ["dataset_id", "sourced_id", "status", "date_last_modified", "payload_json"],
    data.demographics.map((d) => [datasetId, d.sourcedId, d.status, d.dateLastModified, j(d)]),
  ));

  return out;
}

const data = generateDistrict(DEFAULT_CONFIG);
const summary = summarise(data);

const header = [
  `DELETE FROM orgs WHERE dataset_id = ${quote(DATASET_ID)};`,
  `DELETE FROM academic_sessions WHERE dataset_id = ${quote(DATASET_ID)};`,
  `DELETE FROM courses WHERE dataset_id = ${quote(DATASET_ID)};`,
  `DELETE FROM classes WHERE dataset_id = ${quote(DATASET_ID)};`,
  `DELETE FROM users WHERE dataset_id = ${quote(DATASET_ID)};`,
  `DELETE FROM enrollments WHERE dataset_id = ${quote(DATASET_ID)};`,
  `DELETE FROM demographics WHERE dataset_id = ${quote(DATASET_ID)};`,
  `DELETE FROM datasets WHERE id = ${quote(DATASET_ID)};`,
  `INSERT INTO datasets (id, name, school_year, seed, generated_at, summary_json) VALUES (${quote(DATASET_ID)}, ${quote(DEFAULT_CONFIG.districtName)}, ${quote(DEFAULT_CONFIG.schoolYear)}, ${DEFAULT_CONFIG.seed}, ${quote(new Date().toISOString())}, ${quote(JSON.stringify(summary))});`,
];

const statements = [...header, ...build(data, DATASET_ID)];

mkdirSync("seed", { recursive: true });

// D1 rejects very large single files, so the seed is chunked into parts that
// are applied in order.
const PER_FILE = 40;
let part = 0;
for (let i = 0; i < statements.length; i += PER_FILE) {
  part++;
  writeFileSync(
    `seed/${String(part).padStart(3, "0")}.sql`,
    statements.slice(i, i + PER_FILE).join("\n") + "\n",
  );
}

writeFileSync("seed/statements.json", JSON.stringify(statements));
console.log(JSON.stringify({ summary, statements: statements.length, files: part }, null, 2));

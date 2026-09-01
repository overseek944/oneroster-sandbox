import { parseFilter, toSql, FilterError } from "./filter.js";
import type {
  AcademicSession,
  Class,
  Course,
  Demographics,
  Enrollment,
  Org,
  User,
} from "../domain/types.js";

export interface Query {
  limit: number;
  offset: number;
  filter?: string | undefined;
  sort?: string | undefined;
  orderBy?: "asc" | "desc" | undefined;
  fields?: string[] | undefined;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

/**
 * A collection descriptor ties a OneRoster collection name to its table, the
 * fields a client may filter and sort on, and the mapper back to the domain
 * shape. Every endpoint goes through the same path, so pagination, filtering
 * and error handling are implemented once.
 */
interface Collection<T> {
  table: string;
  /** OneRoster field name -> physical column. Doubles as the filter allow-list. */
  columns: Record<string, string>;
  map: (row: Record<string, unknown>) => T;
  /** Applied to every query for this collection, e.g. users restricted to students. */
  baseWhere?: { sql: string; params: unknown[] };
}

const json = (value: unknown): unknown[] => {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const str = (value: unknown): string => (value == null ? "" : String(value));
const nullable = (value: unknown): string | null =>
  value == null ? null : String(value);

const BASE_COLUMNS = {
  sourcedId: "sourced_id",
  status: "status",
  dateLastModified: "date_last_modified",
};

export const COLLECTIONS = {
  orgs: {
    table: "orgs",
    columns: {
      ...BASE_COLUMNS,
      name: "name",
      type: "type",
      identifier: "identifier",
      parentSourcedId: "parent_sourced_id",
    },
    map: (r): Org => ({
      sourcedId: str(r["sourced_id"]),
      status: str(r["status"]) as Org["status"],
      dateLastModified: str(r["date_last_modified"]),
      name: str(r["name"]),
      type: str(r["type"]) as Org["type"],
      identifier: nullable(r["identifier"]),
      parentSourcedId: nullable(r["parent_sourced_id"]),
    }),
  } satisfies Collection<Org>,

  academicSessions: {
    table: "academic_sessions",
    columns: {
      ...BASE_COLUMNS,
      title: "title",
      startDate: "start_date",
      endDate: "end_date",
      type: "type",
      parentSourcedId: "parent_sourced_id",
      schoolYear: "school_year",
    },
    map: (r): AcademicSession => ({
      sourcedId: str(r["sourced_id"]),
      status: str(r["status"]) as AcademicSession["status"],
      dateLastModified: str(r["date_last_modified"]),
      title: str(r["title"]),
      startDate: str(r["start_date"]),
      endDate: str(r["end_date"]),
      type: str(r["type"]) as AcademicSession["type"],
      parentSourcedId: nullable(r["parent_sourced_id"]),
      schoolYear: str(r["school_year"]),
    }),
  } satisfies Collection<AcademicSession>,

  courses: {
    table: "courses",
    columns: {
      ...BASE_COLUMNS,
      title: "title",
      courseCode: "course_code",
      orgSourcedId: "org_sourced_id",
      schoolYearSourcedId: "school_year_sourced_id",
    },
    map: (r): Course => ({
      sourcedId: str(r["sourced_id"]),
      status: str(r["status"]) as Course["status"],
      dateLastModified: str(r["date_last_modified"]),
      title: str(r["title"]),
      schoolYearSourcedId: nullable(r["school_year_sourced_id"]),
      courseCode: nullable(r["course_code"]),
      grades: json(r["grades_json"]) as Course["grades"],
      subjects: json(r["subjects_json"]) as string[],
      orgSourcedId: str(r["org_sourced_id"]),
      subjectCodes: json(r["subject_codes_json"]) as string[],
    }),
  } satisfies Collection<Course>,

  classes: {
    table: "classes",
    columns: {
      ...BASE_COLUMNS,
      title: "title",
      classCode: "class_code",
      classType: "class_type",
      location: "location",
      courseSourcedId: "course_sourced_id",
      schoolSourcedId: "school_sourced_id",
    },
    map: (r): Class => ({
      sourcedId: str(r["sourced_id"]),
      status: str(r["status"]) as Class["status"],
      dateLastModified: str(r["date_last_modified"]),
      title: str(r["title"]),
      classCode: nullable(r["class_code"]),
      classType: str(r["class_type"]) as Class["classType"],
      location: nullable(r["location"]),
      grades: json(r["grades_json"]) as Class["grades"],
      subjects: json(r["subjects_json"]) as string[],
      courseSourcedId: str(r["course_sourced_id"]),
      schoolSourcedId: str(r["school_sourced_id"]),
      termSourcedIds: json(r["term_sourced_ids_json"]) as string[],
      subjectCodes: json(r["subject_codes_json"]) as string[],
      periods: json(r["periods_json"]) as string[],
    }),
  } satisfies Collection<Class>,

  users: {
    table: "users",
    columns: {
      ...BASE_COLUMNS,
      username: "username",
      enabledUser: "enabled_user",
      givenName: "given_name",
      familyName: "family_name",
      middleName: "middle_name",
      role: "role",
      identifier: "identifier",
      email: "email",
    },
    map: (r): User => ({
      sourcedId: str(r["sourced_id"]),
      status: str(r["status"]) as User["status"],
      dateLastModified: str(r["date_last_modified"]),
      username: str(r["username"]),
      userIds: json(r["user_ids_json"]) as User["userIds"],
      enabledUser: Number(r["enabled_user"]) === 1,
      givenName: str(r["given_name"]),
      familyName: str(r["family_name"]),
      middleName: nullable(r["middle_name"]),
      role: str(r["role"]) as User["role"],
      identifier: nullable(r["identifier"]),
      email: nullable(r["email"]),
      sms: nullable(r["sms"]),
      phone: nullable(r["phone"]),
      agentSourcedIds: json(r["agent_sourced_ids_json"]) as string[],
      orgSourcedIds: json(r["org_sourced_ids_json"]) as string[],
      grades: json(r["grades_json"]) as User["grades"],
    }),
  } satisfies Collection<User>,

  enrollments: {
    table: "enrollments",
    columns: {
      ...BASE_COLUMNS,
      classSourcedId: "class_sourced_id",
      schoolSourcedId: "school_sourced_id",
      userSourcedId: "user_sourced_id",
      role: "role",
      primary: "is_primary",
      beginDate: "begin_date",
      endDate: "end_date",
    },
    map: (r): Enrollment => ({
      sourcedId: str(r["sourced_id"]),
      status: str(r["status"]) as Enrollment["status"],
      dateLastModified: str(r["date_last_modified"]),
      classSourcedId: str(r["class_sourced_id"]),
      schoolSourcedId: str(r["school_sourced_id"]),
      userSourcedId: str(r["user_sourced_id"]),
      role: str(r["role"]) as Enrollment["role"],
      primary: r["is_primary"] == null ? null : Number(r["is_primary"]) === 1,
      beginDate: nullable(r["begin_date"]),
      endDate: nullable(r["end_date"]),
    }),
  } satisfies Collection<Enrollment>,

  demographics: {
    table: "demographics",
    columns: { ...BASE_COLUMNS },
    map: (r): Demographics => ({
      ...(JSON.parse(str(r["payload_json"]) || "{}") as Demographics),
      sourcedId: str(r["sourced_id"]),
      status: str(r["status"]) as Demographics["status"],
      dateLastModified: str(r["date_last_modified"]),
    }),
  } satisfies Collection<Demographics>,
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export class QueryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QueryError";
  }
}

export interface FetchOptions {
  /** Partial share: when set, only these school sourcedIds are visible. */
  sharedSchools?: string[] | null;
  /** Extra scoping, e.g. a nested route like /schools/{id}/classes. */
  scope?: { sql: string; params: unknown[] } | undefined;
}

/**
 * The single read path for every collection.
 *
 * Filtering, sorting and pagination are all pushed into SQL rather than done
 * in memory, because the largest collection in a real district is enrolments
 * and there are millions of them.
 */
export async function fetchCollection<N extends CollectionName>(
  db: D1Database,
  datasetId: string,
  name: N,
  query: Query,
  options: FetchOptions = {},
): Promise<Page<ReturnType<(typeof COLLECTIONS)[N]["map"]>>> {
  const collection = COLLECTIONS[name] as Collection<unknown>;

  const where: string[] = ["dataset_id = ?"];
  const params: unknown[] = [datasetId];

  if (options.scope) {
    where.push(`(${options.scope.sql})`);
    params.push(...options.scope.params);
  }

  // A partial share is enforced here rather than at the route, so no endpoint
  // can accidentally leak a school the district did not tick.
  const shared = options.sharedSchools;
  if (shared && shared.length > 0) {
    const schoolColumn =
      name === "orgs" ? "sourced_id"
      : name === "classes" || name === "enrollments" ? "school_sourced_id"
      : name === "courses" ? "org_sourced_id"
      : null;
    if (schoolColumn) {
      const placeholders = shared.map(() => "?").join(", ");
      // The district org itself always remains visible.
      const clause =
        name === "orgs"
          ? `(${schoolColumn} IN (${placeholders}) OR type = 'district')`
          : `${schoolColumn} IN (${placeholders})`;
      where.push(clause);
      params.push(...shared);
    }
  }

  if (query.filter) {
    try {
      const parsed = parseFilter(query.filter);
      const rendered = toSql(parsed, collection.columns);
      where.push(`(${rendered.sql})`);
      params.push(...rendered.params);
    } catch (error) {
      if (error instanceof FilterError) throw new QueryError(error.message, 400);
      throw error;
    }
  }

  const whereSql = where.join(" AND ");

  let orderSql = "ORDER BY sourced_id ASC";
  if (query.sort) {
    const column = collection.columns[query.sort];
    if (!column) throw new QueryError(`unknown sort field: ${query.sort}`, 400);
    orderSql = `ORDER BY ${column} ${query.orderBy === "desc" ? "DESC" : "ASC"}, sourced_id ASC`;
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${collection.table} WHERE ${whereSql}`)
    .bind(...params)
    .first<{ n: number }>();

  const result = await db
    .prepare(
      `SELECT * FROM ${collection.table} WHERE ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    )
    .bind(...params, query.limit, query.offset)
    .all<Record<string, unknown>>();

  return {
    rows: (result.results ?? []).map(collection.map) as ReturnType<
      (typeof COLLECTIONS)[N]["map"]
    >[],
    total: countRow?.n ?? 0,
  };
}

export async function fetchOne<N extends CollectionName>(
  db: D1Database,
  datasetId: string,
  name: N,
  sourcedId: string,
  options: FetchOptions = {},
): Promise<ReturnType<(typeof COLLECTIONS)[N]["map"]> | null> {
  const page = await fetchCollection(db, datasetId, name, {
    limit: 1,
    offset: 0,
    filter: undefined,
    scope: undefined,
  } as Query, {
    ...options,
    scope: { sql: "sourced_id = ?", params: [sourcedId] },
  });
  return page.rows[0] ?? null;
}

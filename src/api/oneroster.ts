import { Hono, type Context } from "hono";
import {
  QueryError,
  fetchCollection,
  type CollectionName,
  type Query,
} from "../db/repository.js";
import { activeFaultKeys, type FaultConfig } from "./faults.js";
import { statusInfo } from "./errors.js";
import type { AppEnv } from "../types.js";

/**
 * Route table.
 *
 * OneRoster exposes several views over the same underlying collection: /schools
 * is orgs filtered to schools, /students and /teachers are users filtered by
 * role, /terms and /gradingPeriods are academic sessions filtered by type. The
 * response key follows the collection, not the route, which is a detail that
 * catches people: GET /schools returns {"orgs": [...]}.
 */
interface RouteSpec {
  collection: CollectionName;
  /** Response key for a collection response. */
  plural: string;
  /** Response key for a single-object response. */
  singular: string;
  /** Applied on top of any client filter. */
  restrict?: { sql: string; params: unknown[] };
}

const ROUTES: Record<string, RouteSpec> = {
  orgs: { collection: "orgs", plural: "orgs", singular: "org" },
  schools: {
    collection: "orgs",
    plural: "orgs",
    singular: "org",
    restrict: { sql: "type = ?", params: ["school"] },
  },
  academicSessions: {
    collection: "academicSessions",
    plural: "academicSessions",
    singular: "academicSession",
  },
  terms: {
    collection: "academicSessions",
    plural: "academicSessions",
    singular: "academicSession",
    restrict: { sql: "type IN (?, ?)", params: ["term", "semester"] },
  },
  gradingPeriods: {
    collection: "academicSessions",
    plural: "academicSessions",
    singular: "academicSession",
    restrict: { sql: "type = ?", params: ["gradingPeriod"] },
  },
  courses: { collection: "courses", plural: "courses", singular: "course" },
  classes: { collection: "classes", plural: "classes", singular: "class" },
  users: { collection: "users", plural: "users", singular: "user" },
  students: {
    collection: "users",
    plural: "users",
    singular: "user",
    restrict: { sql: "role = ?", params: ["student"] },
  },
  teachers: {
    collection: "users",
    plural: "users",
    singular: "user",
    restrict: { sql: "role = ?", params: ["teacher"] },
  },
  enrollments: { collection: "enrollments", plural: "enrollments", singular: "enrollment" },
  demographics: { collection: "demographics", plural: "demographics", singular: "demographic" },
};

function parseQuery(url: URL): Query {
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const offsetRaw = Number(url.searchParams.get("offset") ?? "0");
  const orderBy = url.searchParams.get("orderBy");
  return {
    // The specification caps nothing, but an unbounded limit against a
    // multi-million row enrolment table is a denial of service on yourself.
    limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 5000) : 100,
    offset: Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0,
    filter: url.searchParams.get("filter") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    orderBy: orderBy === "desc" ? "desc" : orderBy === "asc" ? "asc" : undefined,
    fields: url.searchParams.get("fields")?.split(",").map((f) => f.trim()) ?? undefined,
  };
}

/** Sparse fieldsets. A client asking for two fields should not get thirty. */
function applyFields<T extends object>(rows: T[], fields: string[] | undefined): unknown[] {
  if (!fields || fields.length === 0) return rows;
  const keep = new Set([...fields, "sourcedId"]);
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (keep.has(key)) out[key] = value;
    }
    return out;
  });
}

function combine(
  a: { sql: string; params: unknown[] } | undefined,
  b: { sql: string; params: unknown[] } | undefined,
): { sql: string; params: unknown[] } | undefined {
  if (!a) return b;
  if (!b) return a;
  return { sql: `(${a.sql}) AND (${b.sql})`, params: [...a.params, ...b.params] };
}

/**
 * Applies the configured faults to a result page.
 *
 * Everything here corresponds to something a real provider does under load,
 * during a failed export, or after an administrator changes a sharing setting.
 */
function applyFaults<T extends { dateLastModified: string }>(
  rows: T[],
  faults: FaultConfig,
): T[] {
  let out = rows;

  if (faults.emptyPayload) return [];

  if (faults.truncatePercent !== null) {
    const keep = Math.floor((out.length * faults.truncatePercent) / 100);
    out = out.slice(0, Math.max(0, keep));
  }

  if (faults.duplicatePercent !== null && out.length > 0) {
    const extra = Math.max(1, Math.floor((out.length * faults.duplicatePercent) / 100));
    for (let i = 0; i < extra; i++) {
      const source = out[i % out.length];
      if (source) out = [...out, { ...source }];
    }
  }

  if (faults.stampAllModified) {
    const now = new Date().toISOString();
    out = out.map((row) => ({ ...row, dateLastModified: now }));
  }

  return out;
}

export function oneRosterRoutes(version: "v1p1" | "v1p2") {
  const app = new Hono<AppEnv>();

  async function handleCollection(
    c: Context<AppEnv>,
    routeKey: string,
    scope?: { sql: string; params: unknown[] },
  ) {
    const spec = ROUTES[routeKey];
    if (!spec) return c.notFound();

    const auth = c.get("auth");
    const faults = c.get("faults");

    if (faults.failCollections.includes(routeKey)) {
      return c.json(
        { imsx_StatusInfo: statusInfo(`injected failure for ${routeKey}`, "server_busy") },
        503,
      );
    }
    if (faults.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(faults.latencyMs, 10_000)));
    }

    const url = new URL(c.req.url);
    const query = parseQuery(url);

    // Unstable pagination: nudge the window so pages overlap and skip, the way
    // a provider does when the SIS is written to mid-pagination.
    const effective = faults.unstablePagination
      ? { ...query, offset: Math.max(0, query.offset - 2) }
      : query;

    // A dropped school is removed here rather than in the generator, so the
    // same dataset can serve a full share and a partial one simultaneously.
    let dropScope: { sql: string; params: unknown[] } | undefined;
    if (faults.dropSchools.length > 0) {
      const placeholders = faults.dropSchools.map(() => "?").join(", ");
      const column =
        spec.collection === "orgs" ? "sourced_id"
        : spec.collection === "classes" || spec.collection === "enrollments" ? "school_sourced_id"
        : spec.collection === "courses" ? "org_sourced_id"
        : null;
      if (column) {
        dropScope = { sql: `${column} NOT IN (${placeholders})`, params: faults.dropSchools };
      }
    }

    try {
      const page = await fetchCollection(
        c.env.DB,
        auth.datasetId,
        spec.collection,
        effective,
        {
          sharedSchools: auth.sharedSchools,
          scope: combine(combine(spec.restrict, scope), dropScope),
        },
      );

      const rows = applyFaults(page.rows as { dateLastModified: string }[], faults);
      const body = { [spec.plural]: applyFields(rows as object[], query.fields) };

      c.header("X-Total-Count", String(page.total));
      c.header("X-Injected-Faults", activeFaultKeys(faults).join(",") || "none");
      const links = buildLinks(url, query, page.total);
      if (links) c.header("Link", links);
      return c.json(body);
    } catch (error) {
      if (error instanceof QueryError) {
        return c.json(
          { imsx_StatusInfo: statusInfo(error.message, "invalid_filter_field") },
          error.status as 400,
        );
      }
      throw error;
    }
  }

  // Top-level collections.
  for (const routeKey of Object.keys(ROUTES)) {
    app.get(`/${routeKey}`, (c) => handleCollection(c, routeKey));
    app.get(`/${routeKey}/:id`, async (c) => {
      const spec = ROUTES[routeKey];
      if (!spec) return c.notFound();
      const id = c.req.param("id");
      const auth = c.get("auth");
      const page = await fetchCollection(
        c.env.DB,
        auth.datasetId,
        spec.collection,
        { limit: 1, offset: 0 } as Query,
        {
          sharedSchools: auth.sharedSchools,
          scope: combine(spec.restrict, { sql: "sourced_id = ?", params: [id] }),
        },
      );
      const row = page.rows[0];
      if (!row) {
        return c.json(
          { imsx_StatusInfo: statusInfo(`no such ${spec.singular}: ${id}`, "unknownobject") },
          404,
        );
      }
      return c.json({ [spec.singular]: row });
    });
  }

  // Nested collections. These are what a consumer actually uses to walk a
  // district: give me the classes in this school, the students in this class.
  const NESTED: [string, string, string, (id: string) => { sql: string; params: unknown[] }][] = [
    ["schools", "classes", "classes", (id) => ({ sql: "school_sourced_id = ?", params: [id] })],
    ["schools", "courses", "courses", (id) => ({ sql: "org_sourced_id = ?", params: [id] })],
    ["schools", "enrollments", "enrollments", (id) => ({ sql: "school_sourced_id = ?", params: [id] })],
    ["schools", "students", "students", (id) => ({
      sql: "sourced_id IN (SELECT user_sourced_id FROM enrollments WHERE dataset_id = users.dataset_id AND school_sourced_id = ? AND role = 'student')",
      params: [id],
    })],
    ["schools", "teachers", "teachers", (id) => ({
      sql: "sourced_id IN (SELECT user_sourced_id FROM enrollments WHERE dataset_id = users.dataset_id AND school_sourced_id = ? AND role = 'teacher')",
      params: [id],
    })],
    ["classes", "students", "students", (id) => ({
      sql: "sourced_id IN (SELECT user_sourced_id FROM enrollments WHERE dataset_id = users.dataset_id AND class_sourced_id = ? AND role = 'student')",
      params: [id],
    })],
    ["classes", "teachers", "teachers", (id) => ({
      sql: "sourced_id IN (SELECT user_sourced_id FROM enrollments WHERE dataset_id = users.dataset_id AND class_sourced_id = ? AND role = 'teacher')",
      params: [id],
    })],
    ["classes", "enrollments", "enrollments", (id) => ({ sql: "class_sourced_id = ?", params: [id] })],
    ["courses", "classes", "classes", (id) => ({ sql: "course_sourced_id = ?", params: [id] })],
    ["terms", "classes", "classes", (id) => ({ sql: "term_sourced_ids_json LIKE ?", params: [`%"${id}"%`] })],
    ["users", "classes", "classes", (id) => ({
      sql: "sourced_id IN (SELECT class_sourced_id FROM enrollments WHERE dataset_id = classes.dataset_id AND user_sourced_id = ?)",
      params: [id],
    })],
    ["students", "classes", "classes", (id) => ({
      sql: "sourced_id IN (SELECT class_sourced_id FROM enrollments WHERE dataset_id = classes.dataset_id AND user_sourced_id = ? AND role = 'student')",
      params: [id],
    })],
    ["teachers", "classes", "classes", (id) => ({
      sql: "sourced_id IN (SELECT class_sourced_id FROM enrollments WHERE dataset_id = classes.dataset_id AND user_sourced_id = ? AND role = 'teacher')",
      params: [id],
    })],
  ];

  for (const [parent, child, routeKey, scoper] of NESTED) {
    app.get(`/${parent}/:id/${child}`, (c) => handleCollection(c, routeKey, scoper(c.req.param("id"))));
  }

  app.get("/", (c) =>
    c.json({
      service: "OneRoster sandbox",
      version,
      collections: Object.keys(ROUTES),
      nested: NESTED.map(([p, ch]) => `/${p}/{id}/${ch}`),
    }),
  );

  return app;
}

/** RFC 5988 pagination links, which the specification requires. */
function buildLinks(url: URL, query: Query, total: number): string | null {
  const make = (offset: number, rel: string) => {
    const next = new URL(url.toString());
    next.searchParams.set("limit", String(query.limit));
    next.searchParams.set("offset", String(offset));
    return `<${next.toString()}>; rel="${rel}"`;
  };
  const parts: string[] = [make(0, "first")];
  if (query.offset > 0) {
    parts.push(make(Math.max(0, query.offset - query.limit), "prev"));
  }
  if (query.offset + query.limit < total) {
    parts.push(make(query.offset + query.limit, "next"));
  }
  const lastOffset = Math.max(0, Math.floor((total - 1) / query.limit) * query.limit);
  parts.push(make(lastOffset, "last"));
  return parts.join(", ");
}

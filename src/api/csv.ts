import { Hono } from "hono";
import { fetchCollection, type Query } from "../db/repository.js";
import type { AppEnv } from "../types.js";

/**
 * CSV bulk binding.
 *
 * Less fashionable than REST and still extremely common, particularly with
 * smaller districts and with SIS vendors' own export tooling. The manifest is
 * the part that matters: it declares which files are present and whether the
 * payload is a full set or a delta, and a consumer that ignores it cannot tell
 * "this row was removed" from "this file only contains changes".
 */
export const csvRoutes = new Hono<AppEnv>();

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join(",") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }
  return lines.join("\n") + "\n";
}

const FILES = {
  orgs: {
    collection: "orgs" as const,
    headers: ["sourcedId", "status", "dateLastModified", "name", "type", "identifier", "parentSourcedId"],
  },
  academicSessions: {
    collection: "academicSessions" as const,
    headers: ["sourcedId", "status", "dateLastModified", "title", "type", "startDate", "endDate", "parentSourcedId", "schoolYear"],
  },
  courses: {
    collection: "courses" as const,
    headers: ["sourcedId", "status", "dateLastModified", "schoolYearSourcedId", "title", "courseCode", "grades", "orgSourcedId", "subjects", "subjectCodes"],
  },
  classes: {
    collection: "classes" as const,
    headers: ["sourcedId", "status", "dateLastModified", "title", "grades", "courseSourcedId", "classCode", "classType", "location", "schoolSourcedId", "termSourcedIds", "subjects", "subjectCodes", "periods"],
  },
  users: {
    collection: "users" as const,
    headers: ["sourcedId", "status", "dateLastModified", "enabledUser", "orgSourcedIds", "role", "username", "userIds", "givenName", "familyName", "middleName", "identifier", "email", "sms", "phone", "agentSourcedIds", "grades", "password"],
  },
  enrollments: {
    collection: "enrollments" as const,
    headers: ["sourcedId", "status", "dateLastModified", "classSourcedId", "schoolSourcedId", "userSourcedId", "role", "primary", "beginDate", "endDate"],
  },
  demographics: {
    collection: "demographics" as const,
    headers: ["sourcedId", "status", "dateLastModified", "birthDate", "sex", "americanIndianOrAlaskaNative", "asian", "blackOrAfricanAmerican", "nativeHawaiianOrOtherPacificIslander", "white", "demographicRaceTwoOrMoreRaces", "hispanicOrLatinoEthnicity", "countryOfBirthCode", "stateOfBirthAbbreviation", "cityOfBirth", "publicSchoolResidenceStatus"],
  },
} as const;

type FileName = keyof typeof FILES;

/**
 * `since` turns a bulk payload into a delta. The manifest records which mode
 * was served, because that is how a consumer knows whether a missing row means
 * "deleted" or merely "unchanged".
 */
csvRoutes.get("/manifest.csv", (c) => {
  const since = c.req.query("since");
  const mode = since ? "delta" : "bulk";
  const rows = [
    ["propertyName", "value"],
    ["manifest.version", "1.0"],
    ["oneroster.version", "1.1"],
    ["source.systemName", "OneRoster Sandbox"],
    ["source.systemCode", "oneroster-sandbox"],
    ...Object.keys(FILES).map((file) => [`file.${file}`, mode]),
    ["file.categories", "absent"],
    ["file.lineItems", "absent"],
    ["file.results", "absent"],
    ["file.resources", "absent"],
  ];
  return c.text(rows.map((r) => r.join(",")).join("\n") + "\n", 200, {
    "Content-Type": "text/csv; charset=utf-8",
  });
});

csvRoutes.get("/:file{.+\\.csv}", async (c) => {
  const requested = c.req.param("file").replace(/\.csv$/, "") as FileName;
  const spec = FILES[requested];
  if (!spec) return c.text("unknown file\n", 404);

  const auth = c.get("auth");
  const faults = c.get("faults");
  const since = c.req.query("since");

  if (faults.failCollections.includes(requested)) {
    return c.text("injected failure\n", 503);
  }
  if (faults.emptyPayload) {
    return c.text(toCsv([...spec.headers], []), 200, { "Content-Type": "text/csv; charset=utf-8" });
  }

  const collected: Record<string, unknown>[] = [];
  const pageSize = 5000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchCollection(
      c.env.DB,
      auth.datasetId,
      spec.collection,
      {
        limit: pageSize,
        offset,
        filter: since ? `dateLastModified>'${since}'` : undefined,
      } as Query,
      { sharedSchools: auth.sharedSchools },
    );
    collected.push(...(page.rows as unknown as Record<string, unknown>[]));
    if (collected.length >= page.total || page.rows.length === 0) break;
  }

  let rows = collected;
  if (faults.truncatePercent !== null) {
    rows = rows.slice(0, Math.floor((rows.length * faults.truncatePercent) / 100));
  }
  if (faults.stampAllModified) {
    const now = new Date().toISOString();
    rows = rows.map((row) => ({ ...row, dateLastModified: now }));
  }

  // Booleans serialise as the strings the specification uses, not as 0/1.
  const normalised = rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const [key, value] of Object.entries(out)) {
      if (typeof value === "boolean") out[key] = value ? "true" : "false";
      if (key === "userIds" && Array.isArray(value)) {
        out[key] = value.map((entry) => {
          const item = entry as { type: string; identifier: string };
          return `{${item.type}:${item.identifier}}`;
        }).join(",");
      }
    }
    return out;
  });

  return c.text(toCsv([...spec.headers], normalised), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "X-Total-Count": String(normalised.length),
    "X-Payload-Mode": since ? "delta" : "bulk",
  });
});

import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { oneRosterRoutes } from "./api/oneroster.js";
import { oauthRoutes } from "./api/oauth.js";
import { csvRoutes } from "./api/csv.js";
import { adminRoutes } from "./api/admin.js";
import { activeFaultKeys, parseFaults } from "./api/faults.js";
import { verifyToken } from "./lib/crypto.js";
import { statusInfo } from "./api/errors.js";
import { CONSOLE_HTML } from "./ui/console.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "content-type", "x-admin-key"] }));

app.get("/health", (c) => c.json({ status: "ok", service: "oneroster-sandbox" }));

/**
 * Service discovery. A consumer pointed at the root should be able to work out
 * where everything is without reading a README.
 */
app.get("/", (c) =>
  c.json({
    service: "OneRoster Sandbox",
    description:
      "A conformant OneRoster 1.1/1.2 provider serving realistic synthetic district data, with deliberate fault injection for testing consumer resilience.",
    endpoints: {
      token: "/oauth/token",
      rest_v1p1: "/ims/oneroster/v1p1",
      rest_v1p2: "/ims/oneroster/v1p2",
      csv: "/csv/{file}.csv  (manifest.csv, orgs.csv, users.csv, ...; add ?since=ISO for a delta)",
      admin: "/admin (requires x-admin-key)",
    },
    auth: "OAuth 2.0 client credentials at /oauth/token",
  }),
);

app.get("/console", (c) => c.html(CONSOLE_HTML));

app.route("/oauth", oauthRoutes);
app.route("/admin", adminRoutes);

/**
 * Bearer auth for everything under the data routes. Resolves the client's
 * dataset, its share, and any injected faults once, so handlers never have to
 * think about it.
 */
async function authenticate(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json(
      { imsx_StatusInfo: statusInfo("missing bearer token", "unauthorisedrequest") },
      401,
    );
  }
  const claims = await verifyToken(header.slice(7), c.env.TOKEN_SIGNING_KEY);
  if (!claims) {
    return c.json(
      { imsx_StatusInfo: statusInfo("invalid or expired token", "unauthorisedrequest") },
      401,
    );
  }

  const client = await c.env.DB.prepare(
    "SELECT shared_schools_json FROM api_clients WHERE client_id = ?",
  )
    .bind(claims.clientId)
    .first<{ shared_schools_json: string | null }>();

  const faultRow = await c.env.DB.prepare("SELECT config_json FROM faults WHERE client_id = ?")
    .bind(claims.clientId)
    .first<{ config_json: string }>();

  c.set("auth", {
    clientId: claims.clientId,
    datasetId: claims.datasetId,
    scopes: claims.scopes,
    sharedSchools: client?.shared_schools_json
      ? (JSON.parse(client.shared_schools_json) as string[])
      : null,
  });
  c.set("faults", parseFaults(faultRow?.config_json ?? null));

  await next();
}

app.use("/ims/*", authenticate);
app.use("/csv/*", authenticate);

app.route("/ims/oneroster/v1p1", oneRosterRoutes("v1p1"));
app.route("/ims/oneroster/v1p2", oneRosterRoutes("v1p2"));
app.route("/csv", csvRoutes);

/**
 * Access log. Records which faults were live for each request, because the
 * whole point of the sandbox is being able to say afterwards "your sync saw a
 * truncated payload at 02:14 and this is what it did".
 */
app.use("*", async (c, next) => {
  await next();
  const auth = c.get("auth");
  if (!auth) return;
  const faults = c.get("faults");
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      "INSERT INTO access_log (client_id, method, path, status, faults_applied_json, at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        auth.clientId,
        c.req.method,
        new URL(c.req.url).pathname,
        c.res.status,
        JSON.stringify(activeFaultKeys(faults)),
        new Date().toISOString(),
      )
      .run()
      .catch(() => undefined),
  );
});

app.onError((error, c) => {
  console.error("unhandled", error);
  return c.json(
    { imsx_StatusInfo: statusInfo("internal server error", "internal_server_error") },
    500,
  );
});

export default app;

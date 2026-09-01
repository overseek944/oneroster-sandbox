import { Hono } from "hono";
import { FAULT_CATALOGUE, NO_FAULTS, parseFaults, type FaultConfig } from "./faults.js";
import { hashSecret, randomId } from "../lib/crypto.js";
import type { AppEnv } from "../types.js";

/**
 * Console API: manage consumers, their share, and the faults injected into
 * their feed. Guarded by a single admin key, which is appropriate for a
 * sandbox and clearly labelled as such in the README.
 */
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", async (c, next) => {
  const presented = c.req.header("x-admin-key");
  if (!presented || presented !== c.env.ADMIN_KEY) {
    return c.json({ error: "unauthorised" }, 401);
  }
  await next();
});

adminRoutes.get("/datasets", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT id, name, school_year, seed, generated_at, summary_json FROM datasets ORDER BY generated_at DESC",
  ).all<{ id: string; name: string; school_year: string; seed: number; generated_at: string; summary_json: string }>();
  return c.json({
    datasets: (result.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      schoolYear: row.school_year,
      seed: row.seed,
      generatedAt: row.generated_at,
      summary: JSON.parse(row.summary_json),
    })),
  });
});

adminRoutes.get("/clients", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT c.client_id, c.dataset_id, c.label, c.scopes_json, c.shared_schools_json, c.created_at,
            f.config_json
       FROM api_clients c
       LEFT JOIN faults f ON f.client_id = c.client_id
      ORDER BY c.created_at DESC`,
  ).all<Record<string, unknown>>();

  return c.json({
    clients: (result.results ?? []).map((row) => ({
      clientId: String(row["client_id"]),
      datasetId: String(row["dataset_id"]),
      label: String(row["label"]),
      scopes: JSON.parse(String(row["scopes_json"])),
      sharedSchools: row["shared_schools_json"]
        ? JSON.parse(String(row["shared_schools_json"]))
        : null,
      createdAt: String(row["created_at"]),
      faults: parseFaults(row["config_json"] as string | null),
    })),
  });
});

adminRoutes.post("/clients", async (c) => {
  const body = (await c.req.json()) as {
    label?: string;
    datasetId?: string;
    scopes?: string[];
    sharedSchools?: string[] | null;
  };
  if (!body.datasetId) return c.json({ error: "datasetId is required" }, 400);

  const clientId = randomId("client");
  const clientSecret = randomId("secret");
  await c.env.DB.prepare(
    `INSERT INTO api_clients
       (client_id, client_secret_hash, dataset_id, label, scopes_json, shared_schools_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      clientId,
      await hashSecret(clientSecret),
      body.datasetId,
      body.label ?? "unnamed consumer",
      JSON.stringify(body.scopes ?? ["roster-core.readonly", "roster-demographics.readonly"]),
      body.sharedSchools ? JSON.stringify(body.sharedSchools) : null,
      new Date().toISOString(),
    )
    .run();

  // The secret is shown once. Storing it would defeat hashing it.
  return c.json({ clientId, clientSecret, note: "the secret is not recoverable; store it now" }, 201);
});

adminRoutes.patch("/clients/:clientId/share", async (c) => {
  const body = (await c.req.json()) as { sharedSchools: string[] | null };
  await c.env.DB.prepare("UPDATE api_clients SET shared_schools_json = ? WHERE client_id = ?")
    .bind(body.sharedSchools ? JSON.stringify(body.sharedSchools) : null, c.req.param("clientId"))
    .run();
  return c.json({ ok: true, sharedSchools: body.sharedSchools });
});

adminRoutes.get("/faults/catalogue", (c) => c.json({ faults: FAULT_CATALOGUE }));

adminRoutes.get("/clients/:clientId/faults", async (c) => {
  const row = await c.env.DB.prepare("SELECT config_json FROM faults WHERE client_id = ?")
    .bind(c.req.param("clientId"))
    .first<{ config_json: string }>();
  return c.json({ faults: parseFaults(row?.config_json ?? null) });
});

adminRoutes.put("/clients/:clientId/faults", async (c) => {
  const body = (await c.req.json()) as Partial<FaultConfig>;
  const config: FaultConfig = { ...NO_FAULTS, ...body };
  await c.env.DB.prepare(
    `INSERT INTO faults (client_id, config_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(client_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
  )
    .bind(c.req.param("clientId"), JSON.stringify(config), new Date().toISOString())
    .run();
  return c.json({ ok: true, faults: config });
});

adminRoutes.delete("/clients/:clientId/faults", async (c) => {
  await c.env.DB.prepare("DELETE FROM faults WHERE client_id = ?")
    .bind(c.req.param("clientId"))
    .run();
  return c.json({ ok: true, faults: NO_FAULTS });
});

adminRoutes.get("/log", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT client_id, method, path, status, faults_applied_json, at FROM access_log ORDER BY id DESC LIMIT 200",
  ).all<Record<string, unknown>>();
  return c.json({ entries: result.results ?? [] });
});

import { Hono } from "hono";
import { hashSecret, issueToken, timingSafeEqual } from "../lib/crypto.js";
import type { AppEnv } from "../types.js";

const TOKEN_TTL_SECONDS = 3600;

/**
 * OAuth 2.0 client credentials, as OneRoster specifies it.
 *
 * Credentials may arrive either as HTTP Basic (the RFC 6749 preferred form) or
 * in the form body. Real consumers do both, so both are accepted.
 */
export const oauthRoutes = new Hono<AppEnv>();

oauthRoutes.post("/token", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await c.req.json()) as Record<string, string>)
    : Object.fromEntries((await c.req.formData()) as unknown as Iterable<[string, string]>);

  let clientId = body["client_id"];
  let clientSecret = body["client_secret"];

  const authorization = c.req.header("authorization");
  if (authorization?.startsWith("Basic ")) {
    try {
      const decoded = atob(authorization.slice(6));
      const separator = decoded.indexOf(":");
      if (separator > 0) {
        clientId = decoded.slice(0, separator);
        clientSecret = decoded.slice(separator + 1);
      }
    } catch {
      // fall through to the body credentials
    }
  }

  const grantType = body["grant_type"];
  if (grantType !== "client_credentials") {
    return c.json(
      { error: "unsupported_grant_type", error_description: "only client_credentials is supported" },
      400,
    );
  }
  if (!clientId || !clientSecret) {
    return c.json({ error: "invalid_request", error_description: "missing client credentials" }, 400);
  }

  const client = await c.env.DB.prepare(
    "SELECT client_id, client_secret_hash, dataset_id, scopes_json FROM api_clients WHERE client_id = ?",
  )
    .bind(clientId)
    .first<{ client_id: string; client_secret_hash: string; dataset_id: string; scopes_json: string }>();

  const presented = await hashSecret(clientSecret);
  // The comparison runs even when the client is unknown, against a dummy hash,
  // so a wrong client id and a wrong secret take the same time to reject.
  const stored = client?.client_secret_hash ?? (await hashSecret("no-such-client"));
  const ok = client !== null && timingSafeEqual(presented, stored);

  if (!ok || !client) {
    return c.json({ error: "invalid_client", error_description: "authentication failed" }, 401);
  }

  const granted = JSON.parse(client.scopes_json) as string[];
  const requested = body["scope"]?.split(" ").filter(Boolean);
  const scopes = requested?.length
    ? requested.filter((scope) => granted.includes(scope))
    : granted;

  const token = await issueToken(
    {
      clientId: client.client_id,
      datasetId: client.dataset_id,
      scopes,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    },
    c.env.TOKEN_SIGNING_KEY,
  );

  return c.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    scope: scopes.join(" "),
  });
});

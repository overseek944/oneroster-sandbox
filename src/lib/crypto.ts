/**
 * Token and secret primitives, on WebCrypto only. Workers has no Node crypto,
 * and pulling a polyfill in for two HMAC calls would be silly.
 */

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Client secrets are stored hashed, never in plaintext. */
export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return base64url(digest);
}

/** Constant-time comparison, so token checks do not leak length or prefix. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export interface TokenClaims {
  clientId: string;
  datasetId: string;
  scopes: string[];
  exp: number;
}

/**
 * Opaque bearer tokens, signed rather than stored. A sandbox has no need for
 * revocation lists, and statelessness means the token endpoint costs one
 * database read instead of a write.
 */
export async function issueToken(claims: TokenClaims, signingKey: string): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify(claims)).buffer as ArrayBuffer);
  const key = await hmacKey(signingKey);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${base64url(signature)}`;
}

export async function verifyToken(
  token: string,
  signingKey: string,
): Promise<TokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];

  const key = await hmacKey(signingKey);
  const expected = base64url(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
  );
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(padded)) as TokenClaims;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

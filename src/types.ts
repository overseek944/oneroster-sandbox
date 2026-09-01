import type { FaultConfig } from "./api/faults.js";

export interface AuthContext {
  clientId: string;
  datasetId: string;
  scopes: string[];
  sharedSchools: string[] | null;
}

export interface Bindings {
  DB: D1Database;
  /** Signs bearer tokens. Set with `wrangler secret put`. */
  TOKEN_SIGNING_KEY: string;
  /** Guards the fault console and dataset management. */
  ADMIN_KEY: string;
}

export interface Variables {
  auth: AuthContext;
  faults: FaultConfig;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}

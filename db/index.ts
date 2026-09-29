import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * The client pool is created lazily so a local UI preview never needs a
 * database. A Pool (WebSocket transport) is used instead of the stateless
 * HTTP `neon()` function because several route handlers rely on
 * `db.transaction(...)` for atomic multi-table writes, which the HTTP driver
 * does not support.
 */
export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database operations.");
  }
  return drizzle(new Pool({ connectionString }), { schema });
}

export type Database = ReturnType<typeof getDb>;
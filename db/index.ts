import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * The client pool is created lazily so a local UI preview never needs a
 * database. The same Pool instance is reused for every call: creating a new
 * Pool per query meant a brand-new WebSocket handshake to Neon each time
 * (hundreds of ms per query, and with parallel page fetches the dashboard
 * mounted several pools concurrently). A Pool (WebSocket transport) is used
 * instead of the stateless HTTP `neon()` function because several route
 * handlers rely on `db.transaction(...)` for atomic multi-table writes.
 */
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for database operations.");
    }
    db = drizzle(new Pool({ connectionString }), { schema });
  }
  return db;
}
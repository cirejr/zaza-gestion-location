/** Promote a user to platform (SaaS owner) admin: `bun scripts/promote-admin.ts user@example.com`. */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authUsers } from "@/db/schema";

const email = process.argv[2]?.toLowerCase().trim();
if (!email || !email.includes("@")) {
  console.error("Usage: bun scripts/promote-admin.ts user@example.com [--revoke]");
  process.exit(1);
}
const revoke = process.argv.includes("--revoke");
const db = getDb();
const [row] = await db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
if (!row) {
  console.error(`No auth user found for ${email}. They must sign up or sign in once first.`);
  process.exit(1);
}
await db.update(authUsers).set({ role: revoke ? "user" : "admin", updatedAt: new Date() }).where(eq(authUsers.id, row.id));
console.log(`${revoke ? "Revoked" : "Granted"} platform admin for ${email}.`);
process.exit(0);

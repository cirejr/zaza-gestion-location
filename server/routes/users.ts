import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { parseBody, parseUuid } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();
const roleInput = z.object({ role: z.enum(["owner", "manager", "tenant"]) });

router.get("/users/me", async (c) => {
  const actor = await requireActor(c);
  return c.json({ data: actor });
});

router.get("/users", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const data = await getDb().select().from(users).orderBy(users.createdAt);
  return c.json({ data });
});

router.patch("/users/:id/role", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const id = parseUuid(c.req.param("id"), "user id");
  const { role } = await parseBody(c, roleInput);
  if (id === actor.id && role !== "owner") throw new HTTPException(400, { message: "You cannot remove your own owner role." });
  const db = getDb();
  const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
  if (!updated) throw new HTTPException(404, { message: "User not found." });
  return c.json({ data: updated });
});

export default router;

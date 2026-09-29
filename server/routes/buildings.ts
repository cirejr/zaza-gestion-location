import { and, count, eq, ilike, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings } from "@/db/schema";
import { getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { pagination, parseBody, parseUuid, countValue, type RequestContext } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const buildingInput = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(3),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(80).default("Sénégal"),
  photoUrls: z.array(z.string().url()).max(12).default([]),
  unitCount: z.number().int().min(0).max(10000).default(0),
  managerId: z.string().uuid().nullable().optional(),
});

const buildingPatch = buildingInput.partial();

router.get("/buildings", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const query = c.req.query("q")?.trim();
  const conditions = [actor.role === "owner" ? eq(buildings.ownerId, actor.id) : eq(buildings.managerId, actor.id)];
  if (query) {
    conditions.push(or(ilike(buildings.name, `%${query}%`), ilike(buildings.address, `%${query}%`))!);
  }
  const where = and(...conditions);
  const db = getDb();
  const [data, countRows] = await Promise.all([
    db.select().from(buildings).where(where).orderBy(buildings.createdAt).limit(limit).offset(offset),
    db.select({ total: count() }).from(buildings).where(where),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

router.post("/buildings", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const data = await parseBody(c, buildingInput);
  const db = getDb();
  const [building] = await db.insert(buildings).values({
    ...data,
    managerId: data.managerId ?? null,
    ownerId: actor.id,
  }).returning();
  return c.json({ data: building }, 201);
});

router.get("/buildings/overview", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const query = c.req.query("q")?.trim();
  const conditions = [actor.role === "owner" ? eq(buildings.ownerId, actor.id) : eq(buildings.managerId, actor.id)];
  if (query) conditions.push(or(ilike(buildings.name, `%${query}%`), ilike(buildings.address, `%${query}%`))!);
  const where = and(...conditions);
  const db = getDb();
  const [rows, countRows] = await Promise.all([
    db.select().from(buildings).where(where).orderBy(buildings.createdAt).limit(limit).offset(offset),
    db.select({ total: count() }).from(buildings).where(where),
  ]);
  // Load apartments for exactly the buildings shown on this page in one query,
  // so the page makes a single API call instead of one per building.
  const buildingIds = rows.map((building) => building.id);
  const apartmentRows = buildingIds.length
    ? await db.select().from(apartments).where(inArray(apartments.buildingId, buildingIds)).orderBy(apartments.unitNumber)
    : [];
  const byBuilding = new Map<string, typeof apartments.$inferSelect[]>();
  for (const apartment of apartmentRows) {
    const current = byBuilding.get(apartment.buildingId) ?? [];
    current.push(apartment);
    byBuilding.set(apartment.buildingId, current);
  }
  const data = rows.map((building) => ({ ...building, apartments: byBuilding.get(building.id) ?? [] }));
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

router.get("/buildings/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "building id");
  const building = await getBuildingForActor(id, actor);
  const db = getDb();
  const unitStats = await db.select({ status: apartments.status, total: count() })
    .from(apartments)
    .where(eq(apartments.buildingId, id))
    .groupBy(apartments.status);
  return c.json({ data: { ...building, unitStats } });
});

router.patch("/buildings/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "building id");
  await getBuildingForActor(id, actor);
  const data = await parseBody(c, buildingPatch);
  const db = getDb();
  const [building] = await db.update(buildings).set(data).where(eq(buildings.id, id)).returning();
  return c.json({ data: building });
});

router.delete("/buildings/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const id = parseUuid(c.req.param("id"), "building id");
  await getBuildingForActor(id, actor);
  const db = getDb();
  const countRows = await db.select({ total: count() }).from(apartments).where(eq(apartments.buildingId, id));
  if (countValue(countRows) > 0) throw new HTTPException(409, { message: "Supprimez d’abord les unités de cet immeuble." });
  await db.delete(buildings).where(eq(buildings.id, id));
  return c.body(null, 204);
});

export default router;

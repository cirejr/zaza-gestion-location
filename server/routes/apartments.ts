import { and, count, eq, ilike, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, leases } from "@/db/schema";
import { getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { pagination, parseBody, parseUuid, countValue } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const apartmentInput = z.object({
  unitNumber: z.string().trim().min(1).max(32),
  floor: z.number().int().min(-5).max(200).nullable().optional(),
  bedrooms: z.number().int().min(0).max(20).default(1),
  areaSqm: z.number().int().positive().max(10000).nullable().optional(),
  rentAmount: z.number().positive().max(100000000),
  status: z.enum(["occupied", "vacant", "maintenance"]).default("vacant"),
});

const apartmentPatch = apartmentInput.partial();

async function updateUnitCount(buildingId: string) {
  const db = getDb();
  const countRows = await db.select({ total: count() }).from(apartments).where(eq(apartments.buildingId, buildingId));
  await db.update(buildings).set({ unitCount: countValue(countRows) }).where(eq(buildings.id, buildingId));
}

router.get("/buildings/:buildingId/apartments", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const buildingId = parseUuid(c.req.param("buildingId"), "building id");
  await getBuildingForActor(buildingId, actor);
  const { page, limit, offset } = pagination(c);
  const status = c.req.query("status");
  const query = c.req.query("q")?.trim();
  const conditions = [eq(apartments.buildingId, buildingId)];
  if (status && ["occupied", "vacant", "maintenance"].includes(status)) conditions.push(eq(apartments.status, status as "occupied" | "vacant" | "maintenance"));
  if (query) conditions.push(or(ilike(apartments.unitNumber, `%${query}%`), ilike(apartments.status, `%${query}%`))!);
  const where = and(...conditions);
  const db = getDb();
  const [data, countRows] = await Promise.all([
    db.select().from(apartments).where(where).orderBy(apartments.unitNumber).limit(limit).offset(offset),
    db.select({ total: count() }).from(apartments).where(where),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

router.post("/buildings/:buildingId/apartments", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const buildingId = parseUuid(c.req.param("buildingId"), "building id");
  await getBuildingForActor(buildingId, actor);
  const data = await parseBody(c, apartmentInput);
  const db = getDb();
  const [apartment] = await db.transaction(async (tx) => {
    const { rentAmount, ...rest } = data;
    const inserted = await tx.insert(apartments).values({
      ...rest,
      buildingId,
      rentAmount: String(rentAmount),
    }).returning();
    const countRows = await tx.select({ total: count() }).from(apartments).where(eq(apartments.buildingId, buildingId));
    await tx.update(buildings).set({ unitCount: countValue(countRows) }).where(eq(buildings.id, buildingId));
    return inserted;
  });
  return c.json({ data: apartment }, 201);
});

router.get("/apartments/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "apartment id");
  const db = getDb();
  const [apartment] = await db.select().from(apartments).where(eq(apartments.id, id)).limit(1);
  if (!apartment) throw new HTTPException(404, { message: "Apartment not found." });
  await getBuildingForActor(apartment.buildingId, actor);
  return c.json({ data: apartment });
});

router.patch("/apartments/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "apartment id");
  const db = getDb();
  const [current] = await db.select().from(apartments).where(eq(apartments.id, id)).limit(1);
  if (!current) throw new HTTPException(404, { message: "Apartment not found." });
  await getBuildingForActor(current.buildingId, actor);
  const data = await parseBody(c, apartmentPatch);
  const { rentAmount, ...rest } = data;
  const [updated] = await db.update(apartments).set({ ...rest, ...(rentAmount == null ? {} : { rentAmount: String(rentAmount) }) }).where(eq(apartments.id, id)).returning();
  return c.json({ data: updated });
});

router.delete("/apartments/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "apartment id");
  const db = getDb();
  const [current] = await db.select().from(apartments).where(eq(apartments.id, id)).limit(1);
  if (!current) throw new HTTPException(404, { message: "Apartment not found." });
  await getBuildingForActor(current.buildingId, actor);
  const countRows = await db.select({ total: count() }).from(leases).where(and(eq(leases.apartmentId, id), or(eq(leases.status, "active"), eq(leases.status, "draft"))));
  if (countValue(countRows) > 0) throw new HTTPException(409, { message: "Terminate or delete the apartment leases first." });
  await db.delete(apartments).where(eq(apartments.id, id));
  await updateUnitCount(current.buildingId);
  return c.body(null, 204);
});

export default router;

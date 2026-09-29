import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, maintenanceTickets } from "@/db/schema";
import { getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { pagination, parseBody, parseUuid, countValue } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const ticketInput = z.object({
  buildingId: z.string().uuid(),
  apartmentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(10000),
  photoUrl: z.string().url().nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
  priority: z.enum(["low", "normal", "urgent"]).default("normal"),
  deductFromRent: z.boolean().default(false),
  assignedTo: z.string().uuid().nullable().optional(),
});

const ticketPatch = ticketInput.omit({ buildingId: true }).partial();

async function getTicket(id: string, actor: Awaited<ReturnType<typeof requireActor>>) {
  const db = getDb();
  const [ticket] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, id)).limit(1);
  if (!ticket) throw new HTTPException(404, { message: "Maintenance ticket not found." });
  await getBuildingForActor(ticket.buildingId, actor);
  return ticket;
}

router.get("/tickets", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const conditions = [actor.role === "owner" ? eq(buildings.ownerId, actor.id) : eq(buildings.managerId, actor.id)];
  const buildingId = c.req.query("buildingId");
  const status = c.req.query("status");
  const priority = c.req.query("priority");
  const q = c.req.query("q")?.trim();
  if (buildingId) conditions.push(eq(maintenanceTickets.buildingId, parseUuid(buildingId, "building id")));
  if (status && ["pending", "in_progress", "resolved"].includes(status)) conditions.push(eq(maintenanceTickets.status, status as "pending" | "in_progress" | "resolved"));
  if (priority && ["low", "normal", "urgent"].includes(priority)) conditions.push(eq(maintenanceTickets.priority, priority as "low" | "normal" | "urgent"));
  if (q) conditions.push(or(ilike(maintenanceTickets.title, `%${q}%`), ilike(maintenanceTickets.description, `%${q}%`), ilike(buildings.name, `%${q}%`))!);
  const where = and(...conditions);
  const db = getDb();
  const base = db.select({ ticket: maintenanceTickets, building: buildings, apartment: apartments })
    .from(maintenanceTickets)
    .innerJoin(buildings, eq(maintenanceTickets.buildingId, buildings.id))
    .leftJoin(apartments, eq(maintenanceTickets.apartmentId, apartments.id));
  const countBase = db.select({ total: count() }).from(maintenanceTickets).innerJoin(buildings, eq(maintenanceTickets.buildingId, buildings.id));
  const [data, countRows, statusRows] = await Promise.all([
    base.where(where).orderBy(desc(maintenanceTickets.createdAt)).limit(limit).offset(offset),
    countBase.where(where),
    db.select({ status: maintenanceTickets.status, total: count() })
      .from(maintenanceTickets)
      .innerJoin(buildings, eq(maintenanceTickets.buildingId, buildings.id))
      .where(and(conditions[0]))
      .groupBy(maintenanceTickets.status),
  ]);
  return c.json({
    data,
    pagination: { page, limit, total: countValue(countRows) },
    summary: {
      pending: statusRows.find((row) => row.status === "pending")?.total ?? 0,
      inProgress: statusRows.find((row) => row.status === "in_progress")?.total ?? 0,
      resolved: statusRows.find((row) => row.status === "resolved")?.total ?? 0,
    },
  });
});

router.post("/tickets", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, ticketInput);
  await getBuildingForActor(data.buildingId, actor);
  const db = getDb();
  if (data.apartmentId) {
    const [apartment] = await db.select().from(apartments).where(eq(apartments.id, data.apartmentId)).limit(1);
    if (!apartment || apartment.buildingId !== data.buildingId) throw new HTTPException(400, { message: "Apartment does not belong to this building." });
  }
  const [ticket] = await db.insert(maintenanceTickets).values({
    ...data,
    apartmentId: data.apartmentId ?? null,
    photoUrl: data.photoUrl ?? null,
    cost: data.cost == null ? null : String(data.cost),
    assignedTo: data.assignedTo ?? null,
    reportedBy: actor.id,
  }).returning();
  return c.json({ data: ticket }, 201);
});

router.get("/tickets/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "ticket id");
  const ticket = await getTicket(id, actor);
  const db = getDb();
  const [details] = await db.select({ ticket: maintenanceTickets, building: buildings, apartment: apartments })
    .from(maintenanceTickets)
    .innerJoin(buildings, eq(maintenanceTickets.buildingId, buildings.id))
    .leftJoin(apartments, eq(maintenanceTickets.apartmentId, apartments.id))
    .where(eq(maintenanceTickets.id, id)).limit(1);
  return c.json({ data: details ?? { ticket, building: undefined, apartment: undefined } });
});

router.patch("/tickets/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "ticket id");
  await getTicket(id, actor);
  const data = await parseBody(c, ticketPatch);
  const { cost, ...rest } = data;
  const [ticket] = await getDb().update(maintenanceTickets).set({
    ...rest,
    ...(cost == null ? {} : { cost: String(cost) }),
    ...(data.apartmentId === undefined ? {} : { apartmentId: data.apartmentId ?? null }),
    ...(data.photoUrl === undefined ? {} : { photoUrl: data.photoUrl ?? null }),
    ...(data.assignedTo === undefined ? {} : { assignedTo: data.assignedTo ?? null }),
  }).where(eq(maintenanceTickets.id, id)).returning();
  return c.json({ data: ticket });
});

router.post("/tickets/:id/resolve", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "ticket id");
  await getTicket(id, actor);
  const data = await parseBody(c, z.object({ cost: z.number().min(0).optional(), deductFromRent: z.boolean().optional() }));
  const [ticket] = await getDb().update(maintenanceTickets).set({
    status: "resolved",
    resolvedAt: new Date(),
    ...(data.cost == null ? {} : { cost: String(data.cost) }),
    ...(data.deductFromRent == null ? {} : { deductFromRent: data.deductFromRent }),
  }).where(eq(maintenanceTickets.id, id)).returning();
  return c.json({ data: ticket });
});

router.delete("/tickets/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const id = parseUuid(c.req.param("id"), "ticket id");
  await getTicket(id, actor);
  await getDb().delete(maintenanceTickets).where(eq(maintenanceTickets.id, id));
  return c.body(null, 204);
});

export default router;

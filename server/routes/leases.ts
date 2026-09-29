import { and, count, desc, eq, getTableColumns, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, leases, tenants } from "@/db/schema";
import { createLeaseContractPdf } from "@/lib/pdf";
import { buildingAccessCondition, getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { pagination, parseBody, parseUuid, countValue } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

const leaseInput = z.object({
  apartmentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  startDate: dateString,
  endDate: dateString.nullable().optional(),
  rentAmount: z.number().positive(),
  depositAmount: z.number().min(0).default(0),
  status: z.enum(["draft", "active", "expired", "terminated"]).default("active"),
  contractUrl: z.string().url().nullable().optional(),
});

const leasePatch = leaseInput.partial();

type LeaseContext = {
  lease: typeof leases.$inferSelect;
  apartment: typeof apartments.$inferSelect;
  building: typeof buildings.$inferSelect;
  tenant: typeof tenants.$inferSelect;
};

async function getLeaseContext(id: string, actor: Awaited<ReturnType<typeof requireActor>>) {
  const db = getDb();
  const [row] = await db
    .select({ lease: leases, apartment: apartments, building: buildings, tenant: tenants })
    .from(leases)
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .where(eq(leases.id, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Lease not found." });
  if (row.building.ownerId !== actor.id && row.building.managerId !== actor.id) {
    throw new HTTPException(403, { message: "You cannot access this lease." });
  }
  return row as LeaseContext;
}

router.get("/leases", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const status = c.req.query("status");
  const buildingId = c.req.query("buildingId");
  const conditions = [buildingAccessCondition(actor)];
  if (status && ["draft", "active", "expired", "terminated"].includes(status)) conditions.push(eq(leases.status, status as "draft" | "active" | "expired" | "terminated"));
  if (buildingId) conditions.push(eq(buildings.id, parseUuid(buildingId, "building id")));
  const where = and(...conditions);
  const db = getDb();
  const [data, countRows] = await Promise.all([
    db.select({ lease: leases, apartment: apartments, building: buildings, tenant: tenants })
      .from(leases)
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
      .innerJoin(tenants, eq(leases.tenantId, tenants.id))
      .where(where)
      .orderBy(desc(leases.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() })
      .from(leases)
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
      .where(where),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

router.get("/leases/options", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();
  const buildingRows = await db.select({ id: buildings.id }).from(buildings).where(buildingAccessCondition(actor));
  const buildingIds = buildingRows.map((building) => building.id);
  // One request replaces the previous fan-out (1 buildings call + N per-building
  // apartment calls) and is not capped, so large portfolios stay complete.
  const apartmentRows = buildingIds.length
    ? await db
        .select({ ...getTableColumns(apartments), buildingName: buildings.name })
        .from(apartments)
        .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
        .where(inArray(apartments.buildingId, buildingIds))
        .orderBy(apartments.unitNumber)
    : [];
  const tenantRows = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  return c.json({ data: { apartments: apartmentRows, tenants: tenantRows } });
});

router.post("/leases", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, leaseInput);
  const db = getDb();
  const [apartment] = await db.select().from(apartments).where(eq(apartments.id, data.apartmentId)).limit(1);
  if (!apartment) throw new HTTPException(404, { message: "Apartment not found." });
  await getBuildingForActor(apartment.buildingId, actor);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, data.tenantId)).limit(1);
  if (!tenant) throw new HTTPException(404, { message: "Tenant not found." });
  const [active] = await db.select({ id: leases.id }).from(leases).where(and(eq(leases.apartmentId, data.apartmentId), eq(leases.status, "active"))).limit(1);
  if (active) throw new HTTPException(409, { message: "This apartment already has an active lease." });

  const created = await db.transaction(async (tx) => {
    const { rentAmount, depositAmount, ...rest } = data;
    const [lease] = await tx.insert(leases).values({
      ...rest,
      rentAmount: String(rentAmount),
      depositAmount: String(depositAmount),
      endDate: data.endDate ?? null,
      contractUrl: data.contractUrl ?? null,
    }).returning();
    if (data.status === "active") await tx.update(apartments).set({ status: "occupied" }).where(eq(apartments.id, data.apartmentId));
    return lease;
  });
  return c.json({ data: created }, 201);
});

router.get("/leases/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "lease id");
  return c.json({ data: await getLeaseContext(id, actor) });
});

router.patch("/leases/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "lease id");
  const current = await getLeaseContext(id, actor);
  const data = await parseBody(c, leasePatch);
  if (data.apartmentId && data.apartmentId !== current.apartment.id) {
    const [nextApartment] = await getDb().select().from(apartments).where(eq(apartments.id, data.apartmentId)).limit(1);
    if (!nextApartment) throw new HTTPException(404, { message: "Apartment not found." });
    await getBuildingForActor(nextApartment.buildingId, actor);
  }
  const db = getDb();
  const [updated] = await db.transaction(async (tx) => {
    const { rentAmount, depositAmount, ...rest } = data;
    const [lease] = await tx.update(leases).set({
      ...rest,
      ...(rentAmount == null ? {} : { rentAmount: String(rentAmount) }),
      ...(depositAmount == null ? {} : { depositAmount: String(depositAmount) }),
      ...(data.endDate === undefined ? {} : { endDate: data.endDate ?? null }),
      contractUrl: data.contractUrl === undefined ? current.lease.contractUrl : data.contractUrl ?? null,
      updatedAt: new Date(),
    }).where(eq(leases.id, id)).returning();
    const shouldVacate = data.status === "terminated" || data.status === "expired";
    if (shouldVacate) {
      const countRows = await tx.select({ total: count() }).from(leases).where(and(eq(leases.apartmentId, lease?.apartmentId ?? current.apartment.id), eq(leases.status, "active"), or(eq(leases.id, id), eq(leases.id, "00000000-0000-0000-0000-000000000000"))));
      if (countValue(countRows) === 0) await tx.update(apartments).set({ status: "vacant" }).where(eq(apartments.id, lease?.apartmentId ?? current.apartment.id));
    }
    if (data.status === "active") await tx.update(apartments).set({ status: "occupied" }).where(eq(apartments.id, lease?.apartmentId ?? current.apartment.id));
    return [lease];
  });
  return c.json({ data: updated });
});

router.post("/leases/:id/terminate", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "lease id");
  const current = await getLeaseContext(id, actor);
  const db = getDb();
  const [lease] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(leases).set({ status: "terminated", updatedAt: new Date() }).where(eq(leases.id, id)).returning();
    await tx.update(apartments).set({ status: "vacant" }).where(eq(apartments.id, current.apartment.id));
    return [updated];
  });
  return c.json({ data: lease });
});

router.get("/leases/:id/contract.pdf", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "lease id");
  const context = await getLeaseContext(id, actor);
  const contractNumber = `NAYA-${id.slice(0, 8).toUpperCase()}`;
  const pdf = await createLeaseContractPdf({
    contractNumber,
    issuedAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date()),
    tenantName: context.tenant.fullName,
    tenantPhone: context.tenant.whatsappNumber ?? context.tenant.phone,
    buildingName: context.building.name,
    buildingAddress: context.building.address,
    buildingCity: context.building.city,
    unitNumber: context.apartment.unitNumber,
    floor: context.apartment.floor,
    bedrooms: context.apartment.bedrooms,
    areaSqm: context.apartment.areaSqm,
    rentAmount: `${Number(context.lease.rentAmount).toLocaleString("fr-FR")} FCFA`,
    depositAmount: `${Number(context.lease.depositAmount).toLocaleString("fr-FR")} FCFA`,
    startDate: new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(context.lease.startDate)),
    endDate: context.lease.endDate ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(context.lease.endDate)) : null,
  });
  if (!context.lease.contractUrl) {
    await getDb().update(leases).set({ contractUrl: `/api/leases/${id}/contract.pdf` }).where(eq(leases.id, id));
  }
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contrat-${contractNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

export default router;

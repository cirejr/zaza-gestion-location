import { and, count, desc, eq, getTableColumns, ilike, inArray, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, leases, tenants } from "@/db/schema";
import { createLeaseContractPdf } from "@/lib/pdf";
import { rangesConflict } from "@/server/lib/availability";
import { buildingAccessCondition, getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { loadAgencyBranding } from "@/server/lib/organization";
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
  if (row.building.organizationId !== actor.organizationId) {
    throw new HTTPException(403, { message: "You cannot access this lease." });
  }
  return row as LeaseContext;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reject a lease that would overlap another open tenancy on the same unit.
 *
 * Only `active` leases reserve a unit — drafts are provisional and closed leases
 * have ended — which matches the availability rules used by prospect matching and
 * conversion. Comparing date ranges (not merely "is there any active lease?")
 * is what lets a future tenancy be scheduled the day after the current one ends,
 * while still preventing two overlapping confirmed allocations.
 */
async function assertNoLeaseConflict(
  apartmentId: string,
  startDate: string,
  endDate: string | null,
  status: "draft" | "active" | "expired" | "terminated",
  excludeLeaseId?: string,
) {
  if (status !== "active") return;
  const conditions = [eq(leases.apartmentId, apartmentId), eq(leases.status, "active")];
  if (excludeLeaseId) conditions.push(ne(leases.id, excludeLeaseId));
  const rows = await getDb()
    .select({ startDate: leases.startDate, endDate: leases.endDate })
    .from(leases)
    .where(and(...conditions));
  const conflict = rows.some((row) =>
    rangesConflict({ startDate, endDate }, { startDate: row.startDate, endDate: row.endDate }),
  );
  if (conflict) {
    throw new HTTPException(409, { message: "Cet appartement est déjà loué sur une période qui chevauche ces dates." });
  }
}

router.get("/leases", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const status = c.req.query("status");
  const buildingId = c.req.query("buildingId");
  const q = c.req.query("q")?.trim();
  const conditions = [buildingAccessCondition(actor)];
  if (status && ["draft", "active", "expired", "terminated"].includes(status)) conditions.push(eq(leases.status, status as "draft" | "active" | "expired" | "terminated"));
  if (buildingId) conditions.push(eq(buildings.id, parseUuid(buildingId, "building id")));
  if (q) conditions.push(or(ilike(tenants.fullName, `%${q}%`), ilike(apartments.unitNumber, `%${q}%`), ilike(buildings.name, `%${q}%`))!);
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
      .innerJoin(tenants, eq(leases.tenantId, tenants.id))
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
  await assertNoLeaseConflict(data.apartmentId, data.startDate, data.endDate ?? null, data.status ?? "active");

  const created = await db.transaction(async (tx) => {
    const { rentAmount, depositAmount, ...rest } = data;
    const [lease] = await tx.insert(leases).values({
      ...rest,
      rentAmount: String(rentAmount),
      depositAmount: String(depositAmount),
      endDate: data.endDate ?? null,
      contractUrl: data.contractUrl ?? null,
    }).returning();
    // A future allocation must not mark the unit occupied before its start date.
    if (data.status === "active" && data.startDate <= todayIso()) {
      await tx.update(apartments).set({ status: "occupied" }).where(eq(apartments.id, data.apartmentId));
    }
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
  // Validate the effective (post-update) range so moving a lease to another unit,
  // extending it, or re-activating it cannot create an overlapping tenancy.
  const targetApartmentId = data.apartmentId ?? current.lease.apartmentId;
  const targetStart = data.startDate ?? current.lease.startDate;
  const targetEnd = data.endDate === undefined ? current.lease.endDate : data.endDate;
  const targetStatus = data.status ?? current.lease.status;
  await assertNoLeaseConflict(targetApartmentId, targetStart, targetEnd, targetStatus, id);
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
    // Only mark the unit occupied once the (re)activated tenancy has actually
    // started; a future allocation leaves the current occupancy untouched.
    if (targetStatus === "active" && targetStart <= todayIso()) {
      await tx.update(apartments).set({ status: "occupied" }).where(eq(apartments.id, lease?.apartmentId ?? current.apartment.id));
    }
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
    branding: await loadAgencyBranding(actor.organizationId),
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

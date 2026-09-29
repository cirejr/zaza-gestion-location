import { and, count, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, leases, tenants } from "@/db/schema";
import { buildingAccessCondition, requireActor, requireRole } from "@/server/lib/auth-context";
import { pagination, parseBody, parseUuid, countValue } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const tenantInput = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(6).max(32),
  whatsappNumber: z.string().trim().min(6).max(32).nullable().optional(),
  identityDocUrl: z.string().url().nullable().optional(),
});

const tenantPatch = tenantInput.partial();

router.get("/tenants", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const query = c.req.query("q")?.trim();
  const conditions = query ? [or(ilike(tenants.fullName, `%${query}%`), ilike(tenants.phone, `%${query}%`))!] : [];
  const where = conditions.length ? and(...conditions) : undefined;
  const db = getDb();
  const [data, countRows] = await Promise.all([
    db.select().from(tenants).where(where).orderBy(desc(tenants.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(tenants).where(where),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

/**
 * Paginated tenant directory with the tenant's most recent lease resolved
 * server-side, plus portfolio-wide counters. A single call replaces the page's
 * previous `tenants` + full `leases?limit=100` fetch (which truncated at 100
 * leases and, when mapped, let older leases overwrite newer ones).
 */
router.get("/tenants/overview", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const query = c.req.query("q")?.trim();
  const conditions = query ? [or(ilike(tenants.fullName, `%${query}%`), ilike(tenants.phone, `%${query}%`))!] : [];
  const where = conditions.length ? and(...conditions) : undefined;
  const db = getDb();
  const [tenantRows, countRows, leaseRows, whatsappRows] = await Promise.all([
    db.select().from(tenants).where(where).orderBy(desc(tenants.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(tenants).where(where),
    db.select({ lease: leases, apartment: apartments, building: buildings, tenant: tenants })
      .from(leases)
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
      .innerJoin(tenants, eq(leases.tenantId, tenants.id))
      .where(buildingAccessCondition(actor))
      .orderBy(desc(leases.createdAt)),
    db.select({ total: count() }).from(tenants).where(isNotNull(tenants.whatsappNumber)),
  ]);
  // Rows are newest first, so the first entry per tenant is its latest lease.
  const leaseByTenant = new Map<string, (typeof leaseRows)[number]>();
  for (const row of leaseRows) {
    if (!leaseByTenant.has(row.tenant.id)) leaseByTenant.set(row.tenant.id, row);
  }
  const activeLeases = leaseRows.filter((row) => row.lease.status === "active").length;
  return c.json({
    data: tenantRows.map((tenant) => ({ ...tenant, lease: leaseByTenant.get(tenant.id) ?? null })),
    pagination: { page, limit, total: countValue(countRows) },
    summary: {
      activeLeases,
      otherLeases: leaseRows.length - activeLeases,
      whatsappTenants: countValue(whatsappRows),
    },
  });
});

router.post("/tenants", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, tenantInput);
  const db = getDb();
  const [tenant] = await db.insert(tenants).values({
    ...data,
    whatsappNumber: data.whatsappNumber ?? null,
    identityDocUrl: data.identityDocUrl ?? null,
  }).returning();
  return c.json({ data: tenant }, 201);
});

router.get("/tenants/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "tenant id");
  const db = getDb();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) throw new HTTPException(404, { message: "Tenant not found." });
  const leaseHistory = await db.select().from(leases).where(eq(leases.tenantId, id)).orderBy(desc(leases.createdAt));
  return c.json({ data: { ...tenant, leases: leaseHistory } });
});

router.patch("/tenants/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "tenant id");
  const data = await parseBody(c, tenantPatch);
  const db = getDb();
  const [tenant] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
  if (!tenant) throw new HTTPException(404, { message: "Tenant not found." });
  return c.json({ data: tenant });
});

router.delete("/tenants/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "tenant id");
  const db = getDb();
  const countRows = await db.select({ total: count() }).from(leases).where(eq(leases.tenantId, id));
  if (countValue(countRows) > 0) throw new HTTPException(409, { message: "This tenant has lease history and cannot be deleted." });
  const [deleted] = await db.delete(tenants).where(eq(tenants.id, id)).returning({ id: tenants.id });
  if (!deleted) throw new HTTPException(404, { message: "Tenant not found." });
  return c.body(null, 204);
});

export default router;

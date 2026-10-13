import { and, count, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, leases, tenants } from "@/db/schema";
import { buildingAccessCondition, requireActor, requireRole, requireTenantForActor, tenantScope } from "@/server/lib/auth-context";
import { requireActiveSubscription } from "@/server/lib/subscription-access";
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
  // The scope is mandatory, never `undefined`: an owner must not be able to
  // drop it by searching for a term that matches nothing.
  const where = and(tenantScope(actor), ...conditions);
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
  const where = and(tenantScope(actor), ...conditions);
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
    // Scoped like the rows it summarises: an unscoped count leaked the size of
    // the platform's WhatsApp-enabled tenant base.
    db.select({ total: count() }).from(tenants).where(and(isNotNull(tenants.whatsappNumber), tenantScope(actor))),
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
  await requireActiveSubscription(actor);
  const data = await parseBody(c, tenantInput);
  const db = getDb();
  const [tenant] = await db.insert(tenants).values({
    ...data,
    whatsappNumber: data.whatsappNumber ?? null,
    identityDocUrl: data.identityDocUrl ?? null,
    organizationId: actor.organizationId,
    // Without this the row had no recorded owner and became invisible to the
    // person who created it: the lease chain cannot reach a tenant with no
    // lease yet, which is exactly the state a new registration is in.
    createdBy: actor.id,
  }).returning();
  return c.json({ data: tenant }, 201);
});

router.get("/tenants/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "tenant id");
  const db = getDb();
  // Scoped lookup, not a bare `eq(tenants.id, id)`: any owner could previously
  // read another portfolio's tenant and their full lease history by guessing an
  // id.
  const tenant = await requireTenantForActor(actor, id);
  // Leases are filtered to the actor's buildings too, so a tenant shared across
  // two owners never exposes the other owner's lease terms here.
  const leaseHistory = await db
    .select({ lease: leases, apartment: apartments, building: buildings })
    .from(leases)
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .where(and(eq(leases.tenantId, id), buildingAccessCondition(actor)))
    .orderBy(desc(leases.createdAt));
  return c.json({
    data: { ...tenant, leases: leaseHistory.map((row) => ({ ...row.lease, apartment: row.apartment, building: row.building })) },
  });
});

router.patch("/tenants/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "tenant id");
  const data = await parseBody(c, tenantPatch);
  // The write is gated on the same scope as the read, otherwise this was a
  // cross-tenant update: any owner could rewrite another owner's tenant.
  await requireTenantForActor(actor, id);
  const db = getDb();
  const [tenant] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
  if (!tenant) throw new HTTPException(404, { message: "Tenant not found." });
  return c.json({ data: tenant });
});

router.delete("/tenants/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "tenant id");
  // Same gate as the update: a delete on an out-of-scope tenant is the worst
  // of the three, since it is neither visible nor recoverable.
  await requireTenantForActor(actor, id);
  const db = getDb();
  const countRows = await db.select({ total: count() }).from(leases).where(eq(leases.tenantId, id));
  if (countValue(countRows) > 0) throw new HTTPException(409, { message: "Ce locataire a un historique de baux : il ne peut pas être supprimé." });
  const [deleted] = await db.delete(tenants).where(eq(tenants.id, id)).returning({ id: tenants.id });
  if (!deleted) throw new HTTPException(404, { message: "Tenant not found." });
  return c.body(null, 204);
});

export default router;

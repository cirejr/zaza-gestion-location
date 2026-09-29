import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, commonUtilities, leases, tenants, utilitySplits } from "@/db/schema";
import { isPreviewResult, sendSmsMessage, sendTwilioUtilityNotice, sendUtilityNotice, utilityNoticeMessage, type NotificationChannel } from "@/lib/notifications";
import { splitCommonCharge } from "@/lib/utility-split";
import { getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { pagination, parseBody, parseUuid, countValue } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const utilityInput = z.object({
  type: z.enum(["water", "electricity", "security", "other"]),
  supplier: z.string().trim().max(160).nullable().optional(),
  totalAmount: z.number().int().positive(),
  period: z.string().trim().min(1).max(32),
  invoiceUrl: z.string().url().nullable().optional(),
});

const utilityPatch = utilityInput.partial();

async function getUtility(id: string, actor: Awaited<ReturnType<typeof requireActor>>) {
  const db = getDb();
  const [utility] = await db.select().from(commonUtilities).where(eq(commonUtilities.id, id)).limit(1);
  if (!utility) throw new HTTPException(404, { message: "Utility invoice not found." });
  await getBuildingForActor(utility.buildingId, actor);
  return utility;
}

router.get("/buildings/:buildingId/utilities", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const buildingId = parseUuid(c.req.param("buildingId"), "building id");
  await getBuildingForActor(buildingId, actor);
  const { page, limit, offset } = pagination(c);
  const where = eq(commonUtilities.buildingId, buildingId);
  const db = getDb();
  const [data, countRows] = await Promise.all([
    db.select().from(commonUtilities).where(where).orderBy(desc(commonUtilities.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(commonUtilities).where(where),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

router.post("/buildings/:buildingId/utilities", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const buildingId = parseUuid(c.req.param("buildingId"), "building id");
  await getBuildingForActor(buildingId, actor);
  const data = await parseBody(c, utilityInput);
  const db = getDb();
  const units = await db.select({ id: apartments.id }).from(apartments).where(eq(apartments.buildingId, buildingId));
  if (units.length === 0) throw new HTTPException(400, { message: "This building has no apartments to split the charge across." });
  const allocation = splitCommonCharge(data.totalAmount, units.map((unit) => unit.id));
  const created = await db.transaction(async (tx) => {
    const [utility] = await tx.insert(commonUtilities).values({
      ...data,
      buildingId,
      totalAmount: String(data.totalAmount),
      supplier: data.supplier ?? null,
      invoiceUrl: data.invoiceUrl ?? null,
      splitStatus: "split",
      splitAt: new Date(),
    }).returning();
    if (!utility) throw new HTTPException(500, { message: "Utility invoice could not be created." });
    await tx.insert(utilitySplits).values(allocation.map((item) => ({ utilityId: utility.id, apartmentId: item.apartmentId, amount: String(item.amount) })));
    return utility;
  });
  return c.json({ data: created, splits: allocation }, 201);
});

router.get("/utilities/overview", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const query = c.req.query("q")?.trim();
  const scope = [actor.role === "owner" ? eq(buildings.ownerId, actor.id) : eq(buildings.managerId, actor.id)];
  if (query) {
    scope.push(or(
      ilike(buildings.name, `%${query}%`),
      ilike(commonUtilities.supplier, `%${query}%`),
      ilike(commonUtilities.period, `%${query}%`),
    )!);
  }
  const where = and(...scope);
  const db = getDb();
  const [buildingsRows, invoices, countRows] = await Promise.all([
    db.select().from(buildings).where(and(scope[0])).orderBy(buildings.name),
    db.select({ utility: commonUtilities, building: buildings })
      .from(commonUtilities)
      .innerJoin(buildings, eq(commonUtilities.buildingId, buildings.id))
      .where(where)
      .orderBy(desc(commonUtilities.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() })
      .from(commonUtilities)
      .innerJoin(buildings, eq(commonUtilities.buildingId, buildings.id))
      .where(where),
  ]);
  return c.json({
    data: { buildings: buildingsRows, invoices },
    pagination: { page, limit, total: countValue(countRows) },
  });
});

router.get("/utilities/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "utility id");
  const utility = await getUtility(id, actor);
  const splits = await getDb().select().from(utilitySplits).where(eq(utilitySplits.utilityId, id));
  return c.json({ data: { ...utility, splits } });
});

router.patch("/utilities/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "utility id");
  const utility = await getUtility(id, actor);
  const data = await parseBody(c, utilityPatch);
  const { totalAmount, ...rest } = data;
  const db = getDb();
  if (totalAmount != null) {
    const units = await db.select({ id: apartments.id }).from(apartments).where(eq(apartments.buildingId, utility.buildingId));
    const allocation = splitCommonCharge(totalAmount, units.map((unit) => unit.id));
    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx.update(commonUtilities).set({
        ...rest,
        totalAmount: String(totalAmount),
        ...(data.supplier === undefined ? {} : { supplier: data.supplier ?? null }),
        ...(data.invoiceUrl === undefined ? {} : { invoiceUrl: data.invoiceUrl ?? null }),
        splitStatus: "pending",
        splitAt: new Date(),
        notifiedAt: null,
      }).where(eq(commonUtilities.id, id)).returning();
      await tx.delete(utilitySplits).where(eq(utilitySplits.utilityId, id));
      await tx.insert(utilitySplits).values(allocation.map((item) => ({ utilityId: id, apartmentId: item.apartmentId, amount: String(item.amount) })));
      return [row];
    });
    return c.json({ data: updated, splits: allocation });
  }
  const [updated] = await db.update(commonUtilities).set({
    ...rest,
    ...(data.supplier === undefined ? {} : { supplier: data.supplier ?? null }),
    ...(data.invoiceUrl === undefined ? {} : { invoiceUrl: data.invoiceUrl ?? null }),
  }).where(eq(commonUtilities.id, id)).returning();
  return c.json({ data: updated });
});

router.delete("/utilities/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const id = parseUuid(c.req.param("id"), "utility id");
  await getUtility(id, actor);
  await getDb().delete(commonUtilities).where(eq(commonUtilities.id, id));
  return c.body(null, 204);
});

router.get("/utilities/:id/splits", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "utility id");
  await getUtility(id, actor);
  const rows = await getDb().select({ split: utilitySplits, apartment: apartments, building: buildings })
    .from(utilitySplits)
    .innerJoin(apartments, eq(utilitySplits.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .where(eq(utilitySplits.utilityId, id));
  return c.json({ data: rows });
});

router.post("/utilities/:id/notify", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "utility id");
  const utility = await getUtility(id, actor);
  const db = getDb();
  const rows = await db.select({ split: utilitySplits, apartment: apartments, lease: leases, tenant: tenants })
    .from(utilitySplits)
    .innerJoin(apartments, eq(utilitySplits.apartmentId, apartments.id))
    .innerJoin(leases, and(eq(leases.apartmentId, apartments.id), eq(leases.status, "active")))
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .where(eq(utilitySplits.utilityId, id));
  const results = [] as Array<{ apartmentId: string; delivered: boolean; channel: NotificationChannel; messageId: string }>;
  let deliveredCount = 0;
  for (const row of rows) {
    const phone = row.tenant.whatsappNumber ?? row.tenant.phone;
    const message = {
      tenantName: row.tenant.fullName,
      type: utility.type,
      period: utility.period,
      amount: Number(row.split.amount),
      unitNumber: row.apartment.unitNumber,
    };
    let result = await sendUtilityNotice({ to: phone, ...message });
    // Only an unconfigured provider justifies switching channels; a send that was
    // attempted and failed is reported rather than re-sent behind the manager's
    // back. Twilio's equivalent template sits between Meta and plain SMS.
    if (isPreviewResult(result)) {
      const twilio = await sendTwilioUtilityNotice({ to: phone, ...message });
      if (twilio.delivered) result = twilio;
      else if (isPreviewResult(twilio)) {
        const sms = await sendSmsMessage({ to: phone, message: utilityNoticeMessage(message) });
        if (sms.delivered) result = sms;
      }
    }
    // Only record what actually went out. Marking an undelivered note as sent
    // would push the invoice into `notified` and disable the retry button, so a
    // failed send would be permanently invisible.
    if (result.delivered) {
      await db.update(utilitySplits).set({ sentAt: new Date() }).where(eq(utilitySplits.id, row.split.id));
      deliveredCount += 1;
    }
    results.push({
      apartmentId: row.apartment.id,
      delivered: result.delivered,
      channel: result.channel,
      messageId: result.messageId,
    });
  }
  // `notified` only when every occupant was reached; otherwise the invoice stays
  // in `split` so the action can be retried.
  if (rows.length > 0 && deliveredCount === rows.length) {
    await db.update(commonUtilities).set({ splitStatus: "notified", notifiedAt: new Date() }).where(eq(commonUtilities.id, id));
  }
  return c.json({ data: { utilityId: id, delivered: deliveredCount, total: rows.length, notifications: results } });
});

export default router;

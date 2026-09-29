import { and, count, desc, eq, gte, ilike, lte, or, sum } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, leases, payments, tenants } from "@/db/schema";
import { createPaymentLink, PaymentProviderError, type PaymentProviderName } from "@/lib/payment-providers";
import { createReceiptPdf } from "@/lib/pdf";
import { buildingAccessCondition, getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { notifyBuildingTeam } from "@/server/lib/notify";
import { pagination, parseBody, parseUuid, countValue } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const paymentInput = z.object({
  leaseId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "wave", "orange_money", "mtn_momo", "bank_transfer"]),
  transactionRef: z.string().trim().max(180).nullable().optional(),
  status: z.enum(["pending", "paid", "failed", "refunded"]).default("paid"),
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const paymentPatch = paymentInput.partial();

type PaymentContext = {
  payment: typeof payments.$inferSelect;
  lease: typeof leases.$inferSelect;
  apartment: typeof apartments.$inferSelect;
  building: typeof buildings.$inferSelect;
  tenant: typeof tenants.$inferSelect;
};

async function getPaymentContext(id: string, actor: Awaited<ReturnType<typeof requireActor>>) {
  const db = getDb();
  const [row] = await db
    .select({ payment: payments, lease: leases, apartment: apartments, building: buildings, tenant: tenants })
    .from(payments)
    .innerJoin(leases, eq(payments.leaseId, leases.id))
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .where(eq(payments.id, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Payment not found." });
  if (row.building.ownerId !== actor.id && row.building.managerId !== actor.id) {
    throw new HTTPException(403, { message: "You cannot access this payment." });
  }
  return row as PaymentContext;
}

/**
 * Inbox notification for a settled online payment. IPNs have no acting user, so
 * the whole building team is notified. Best-effort: a notification failure must
 * not turn a successful payment update into a webhook error.
 */
async function notifyPaymentReceived(paymentId: string, status: string) {
  if (status !== "paid") return;
  try {
    const db = getDb();
    const [row] = await db
      .select({ payment: payments, apartment: apartments, building: buildings, tenant: tenants })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
      .innerJoin(tenants, eq(leases.tenantId, tenants.id))
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!row) return;
    await notifyBuildingTeam(row.building, {
      type: "payment.received",
      title: `Paiement reçu — ${row.building.name} · ${row.apartment.unitNumber}`,
      body: `${row.tenant.fullName} · ${Number(row.payment.amount).toLocaleString("fr-FR")} FCFA`,
      href: "/payments",
    });
  } catch (error) {
    console.error("payment notification failed", error);
  }
}

router.get("/payments", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const conditions = [buildingAccessCondition(actor)];
  const leaseId = c.req.query("leaseId");
  const buildingId = c.req.query("buildingId");
  const status = c.req.query("status");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const q = c.req.query("q")?.trim();
  if (leaseId) conditions.push(eq(payments.leaseId, parseUuid(leaseId, "lease id")));
  if (buildingId) conditions.push(eq(buildings.id, parseUuid(buildingId, "building id")));
  if (status && ["pending", "paid", "failed", "refunded"].includes(status)) conditions.push(eq(payments.status, status as "pending" | "paid" | "failed" | "refunded"));
  if (from) conditions.push(gte(payments.createdAt, new Date(from)));
  if (to) conditions.push(lte(payments.createdAt, new Date(to)));
  if (q) conditions.push(or(ilike(tenants.fullName, `%${q}%`), ilike(apartments.unitNumber, `%${q}%`))!);
  const where = and(...conditions);
  const db = getDb();
  const base = db
    .select({ payment: payments, lease: leases, apartment: apartments, building: buildings, tenant: tenants })
    .from(payments)
    .innerJoin(leases, eq(payments.leaseId, leases.id))
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .innerJoin(tenants, eq(leases.tenantId, tenants.id));
  const countBase = db
    .select({ total: count() })
    .from(payments)
    .innerJoin(leases, eq(payments.leaseId, leases.id))
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .innerJoin(tenants, eq(leases.tenantId, tenants.id));
  const [data, countRows] = await Promise.all([
    base.where(where).orderBy(desc(payments.createdAt)).limit(limit).offset(offset),
    countBase.where(where),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

/**
 * Portfolio-wide cash metrics, independent of the list's pagination/search/status
 * filters. `collect` sums only paid payments; `total`/`receiptCount` cover every
 * payment in the actor's buildings.
 */
router.get("/payments/summary", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();
  const scope = [buildingAccessCondition(actor)];
  const [paid, all] = await Promise.all([
    db
      .select({ total: count(), amount: sum(payments.amount) })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
      .where(and(...scope, eq(payments.status, "paid"))),
    db
      .select({ total: count(), receipts: count(payments.receiptUrl) })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
      .where(and(...scope)),
  ]);
  return c.json({
    data: {
      collected: Number(paid[0]?.amount ?? 0),
      paidCount: countValue(paid),
      total: countValue(all),
      receiptCount: Number(all[0]?.receipts ?? 0),
    },
  });
});

router.post("/payments", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, paymentInput);
  const db = getDb();
  const [lease] = await db.select().from(leases).where(eq(leases.id, data.leaseId)).limit(1);
  if (!lease) throw new HTTPException(404, { message: "Lease not found." });
  const [apartment] = await db.select().from(apartments).where(eq(apartments.id, lease.apartmentId)).limit(1);
  if (!apartment) throw new HTTPException(404, { message: "Apartment not found." });
  await getBuildingForActor(apartment.buildingId, actor);
  const [payment] = await db.insert(payments).values({
    ...data,
    amount: String(data.amount),
    paidAt: data.paidAt ?? (data.status === "paid" ? new Date() : null),
    transactionRef: data.transactionRef ?? null,
    notes: data.notes ?? null,
  }).returning();
  return c.json({ data: payment }, 201);
});

router.get("/payments/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "payment id");
  return c.json({ data: await getPaymentContext(id, actor) });
});

router.patch("/payments/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "payment id");
  await getPaymentContext(id, actor);
  const data = await parseBody(c, paymentPatch);
  const db = getDb();
  const { amount, ...rest } = data;
  const [payment] = await db.update(payments).set({
    ...rest,
    ...(amount == null ? {} : { amount: String(amount) }),
    ...(data.paidAt === undefined ? {} : { paidAt: data.paidAt }),
  }).where(eq(payments.id, id)).returning();
  return c.json({ data: payment });
});

router.delete("/payments/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "payment id");
  const context = await getPaymentContext(id, actor);
  if (context.payment.status !== "pending") throw new HTTPException(409, { message: "Only pending payments can be deleted." });
  await getDb().delete(payments).where(eq(payments.id, id));
  return c.body(null, 204);
});

router.get("/payments/:id/receipt.pdf", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "payment id");
  const context = await getPaymentContext(id, actor);
  const receiptNumber = `NAYA-${id.slice(0, 8).toUpperCase()}`;
  const pdf = await createReceiptPdf({
    receiptNumber,
    issuedAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date()),
    tenantName: context.tenant.fullName,
    buildingName: context.building.name,
    unitNumber: context.apartment.unitNumber,
    amount: `${Number(context.payment.amount).toLocaleString("fr-FR")} FCFA`,
    method: context.payment.paymentMethod,
    transactionRef: context.payment.transactionRef,
  });
  await getDb().update(payments).set({ receiptUrl: `/api/payments/${id}/receipt.pdf` }).where(eq(payments.id, id));
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recu-${receiptNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

router.post("/webhooks/payments/:provider", async (c) => {
  const provider = c.req.param("provider");

  // PayTech calls the IPN URL as a form POST (`type_event`, `ref_command`,
  // `custom_field`, …). Map its lifecycle events onto payment statuses.
  if (provider === "paytech") {
    const form = await c.req.parseBody();
    const ref = String(form.ref_command ?? "");
    if (!ref) throw new HTTPException(400, { message: "Missing ref_command." });
    const event = String(form.type_event ?? "");
    const status: "pending" | "paid" | "failed" | "refunded" = event === "sale_complete" ? "paid" : event === "sale_canceled" ? "failed" : event === "sale_refunded" ? "refunded" : "pending";
    const db = getDb();
    const [payment] = await db.update(payments).set({
      status,
      ...(status === "paid" ? { paidAt: new Date() } : {}),
    }).where(eq(payments.transactionRef, ref)).returning();
    if (!payment) throw new HTTPException(404, { message: "Payment transaction not found." });
    await notifyPaymentReceived(payment.id, status);
    return c.json({ received: true, paymentId: payment.id, status });
  }

  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (expectedSecret && c.req.header("x-webhook-secret") !== expectedSecret) {
    throw new HTTPException(401, { message: "Invalid webhook signature." });
  }
  const data = await parseBody(c, z.object({
    transactionRef: z.string().min(1).max(180),
    status: z.enum(["pending", "paid", "failed", "refunded"]),
    paidAt: z.coerce.date().optional(),
  }));
  const db = getDb();
  const [payment] = await db.update(payments).set({
    status: data.status,
    ...(data.status === "paid" ? { paidAt: data.paidAt ?? new Date() } : {}),
  }).where(eq(payments.transactionRef, data.transactionRef)).returning();
  if (!payment) throw new HTTPException(404, { message: "Payment transaction not found." });
  await notifyPaymentReceived(payment.id, payment.status);
  return c.json({ received: true, paymentId: payment.id, status: payment.status });
});

router.post("/payments/:id/create-link", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "payment id");
  const { provider } = await parseBody(c, z.object({ provider: z.enum(["paytech", "paydunya", "fedapay"]) }));
  const context = await getPaymentContext(id, actor);
  if (context.payment.status === "paid") throw new HTTPException(409, { message: "This payment is already settled." });
  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(c.req.url).origin;
  const reference = `NAYA-${id}`;
  let link: Awaited<ReturnType<typeof createPaymentLink>>;
  try {
    link = await createPaymentLink(provider as PaymentProviderName, {
      amount: Number(context.payment.amount),
      reference,
      customerName: context.tenant.fullName,
      customerPhone: context.tenant.whatsappNumber ?? context.tenant.phone,
      returnUrl: `${baseUrl}/payments/${id}/return`,
      notificationUrl: `${baseUrl}/api/webhooks/payments/${provider}`,
    });
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      throw new HTTPException(503, { message: error.message });
    }
    throw error;
  }
  // Store the deterministic reference so provider IPNs (which echo
  // `ref_command`) can be matched by the webhook.
  await getDb().update(payments).set({ transactionRef: reference, status: "pending" }).where(eq(payments.id, id));
  return c.json({ data: link });
});

export default router;

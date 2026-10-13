import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import {
  organizationProfiles,
  organizations,
  subscriptionEvents,
  subscriptionPaymentInstructions,
  subscriptionPaymentRequests,
  subscriptionPlans,
  subscriptions,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/server/lib/platform-admin";
import { addMonthsClamped, computeRenewalPeriod } from "@/server/lib/billing";
import { notifyAgency } from "@/server/lib/subscription-access";
import { parseBody, parseUuid } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const confirmInput = z.object({
  actualAmountXof: z.number().int().positive().max(100_000_000),
  actualPaidAt: z.string().datetime(),
  transactionRef: z.string().trim().max(180).nullish(),
  adminNote: z.string().trim().max(2000).nullish(),
  // Required when actual != expected: explicit acceptance of the discrepancy.
  override: z.boolean().default(false),
  overrideReason: z.string().trim().max(2000).nullish(),
});

const rejectInput = z.object({
  reason: z.string().trim().min(1).max(2000),
});

const suspendInput = z.object({ reason: z.string().trim().min(1).max(2000) });
const extendInput = z.object({
  months: z.number().int().min(1).max(24).default(1),
  reason: z.string().trim().min(1).max(2000),
});
const changePlanInput = z.object({
  plan: z.enum(["monthly", "annual"]),
  reason: z.string().trim().min(1).max(2000),
});

const planInput = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  monthlyPriceXof: z.number().int().positive().max(100_000_000),
  annualPriceXof: z.number().int().positive().max(100_000_000),
  features: z.array(z.string().max(120)).max(30).default([]),
  isActive: z.boolean().default(true),
});

const instructionInput = z.object({
  method: z.enum(["wave", "orange_money", "mtn_momo", "mobile_money", "cash"]),
  displayName: z.string().trim().max(160).nullish(),
  phoneNumber: z.string().trim().max(32).nullish(),
  instructions: z.string().trim().max(2000).nullish(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});

router.get("/admin/billing/overview", async (c) => {
  await requirePlatformAdmin(c);
  const db = getDb();
  const [[active], [pending], [expired], recent] = await Promise.all([
    db.select({ total: count() }).from(subscriptions).where(eq(subscriptions.status, "active")),
    db
      .select({ total: count() })
      .from(subscriptionPaymentRequests)
      .where(eq(subscriptionPaymentRequests.status, "notified")),
    db.select({ total: count() }).from(subscriptions).where(eq(subscriptions.status, "past_due")),
    db
      .select()
      .from(subscriptionPaymentRequests)
      .where(eq(subscriptionPaymentRequests.status, "confirmed"))
      .orderBy(desc(subscriptionPaymentRequests.decidedAt))
      .limit(10),
  ]);
  const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expiring = await db
    .select({ id: subscriptions.id, agencyId: subscriptions.agencyId, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), lte(subscriptions.currentPeriodEnd, inSevenDays)));
  return c.json({
    data: {
      active: Number(active?.total ?? 0),
      pending: Number(pending?.total ?? 0),
      expired: Number(expired?.total ?? 0),
      expiringCount: expiring.length,
      expiring,
      recent,
    },
  });
});

router.get("/admin/billing/requests", async (c) => {
  await requirePlatformAdmin(c);
  const db = getDb();
  const status = c.req.query("status");
  const method = c.req.query("method");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const conditions = [];
  if (status) conditions.push(eq(subscriptionPaymentRequests.status, status as never));
  if (method) conditions.push(eq(subscriptionPaymentRequests.method, method as never));
  if (from) conditions.push(gte(subscriptionPaymentRequests.createdAt, new Date(from)));
  if (to) conditions.push(lte(subscriptionPaymentRequests.createdAt, new Date(to)));
  const rows = await db
    .select({
      request: subscriptionPaymentRequests,
      agencyName: organizations.name,
    })
    .from(subscriptionPaymentRequests)
    .leftJoin(organizations, eq(organizations.id, subscriptionPaymentRequests.agencyId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(subscriptionPaymentRequests.createdAt))
    .limit(100);
  return c.json({ data: rows });
});

router.get("/admin/billing/requests/:id", async (c) => {
  await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "request id");
  const db = getDb();
  const [row] = await db.select().from(subscriptionPaymentRequests).where(eq(subscriptionPaymentRequests.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: "Demande introuvable." });
  const [agency] = await db
    .select({ id: organizations.id, name: organizations.name, profile: organizationProfiles })
    .from(organizations)
    .leftJoin(organizationProfiles, eq(organizationProfiles.organizationId, organizations.id))
    .where(eq(organizations.id, row.agencyId))
    .limit(1);
  const history = await db
    .select()
    .from(subscriptionEvents)
    .where(eq(subscriptionEvents.requestId, id))
    .orderBy(desc(subscriptionEvents.createdAt));
  const previous = await db
    .select()
    .from(subscriptionPaymentRequests)
    .where(and(eq(subscriptionPaymentRequests.agencyId, row.agencyId), eq(subscriptionPaymentRequests.status, "confirmed")))
    .orderBy(desc(subscriptionPaymentRequests.decidedAt))
    .limit(5);
  return c.json({ data: { request: row, agency, history, previous } });
});

/**
 * Confirm a payment: idempotent, transactional, explicit. A rejected or
 * already-confirmed request can never be confirmed again.
 */
router.post("/admin/billing/requests/:id/confirm", async (c) => {
  const admin = await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "request id");
  const body = await parseBody(c, confirmInput);
  const db = getDb();

  const actualPaidAt = new Date(body.actualPaidAt);
  if (Number.isNaN(actualPaidAt.getTime())) throw new HTTPException(400, { message: "Date de paiement invalide." });

  const result = await db.transaction(async (tx) => {
    // Atomic claim: only a pending/notified, never-applied request can be
    // taken. Concurrent confirms race on this single statement — exactly one
    // wins, the others see zero rows and get 404/409 below.
    const [claimed] = await tx
      .update(subscriptionPaymentRequests)
      .set({ status: "notified", updatedAt: new Date() })
      .where(
        and(
          eq(subscriptionPaymentRequests.id, id),
          inArray(subscriptionPaymentRequests.status, ["pending", "notified"]),
          isNull(subscriptionPaymentRequests.appliedAt),
        ),
      )
      .returning();
    if (!claimed) {
      const [existing] = await tx
        .select()
        .from(subscriptionPaymentRequests)
        .where(eq(subscriptionPaymentRequests.id, id))
        .limit(1);
      if (!existing) throw new HTTPException(404, { message: "Demande introuvable." });
      if (existing.status === "confirmed" || existing.appliedAt) {
        throw new HTTPException(409, { message: "Cette demande a déjà été confirmée." });
      }
      throw new HTTPException(409, { message: "Cette demande ne peut plus être confirmée." });
    }
    const request = claimed;

    const discrepancy = body.actualAmountXof !== request.expectedAmountXof;
    if (discrepancy && !body.override) {
      throw new HTTPException(422, {
        message: `Montant reçu (${body.actualAmountXof} XOF) différent du montant attendu (${request.expectedAmountXof} XOF). Confirmez explicitement avec override.`,
      });
    }
    if (discrepancy && !body.overrideReason?.trim()) {
      throw new HTTPException(422, { message: "Une raison est requise pour valider un montant différent." });
    }

    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, request.subscriptionId!))
      .limit(1);
    if (!sub) throw new HTTPException(404, { message: "Abonnement introuvable." });

    const now = new Date();
    const currentEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
    const { start, end } = computeRenewalPeriod(currentEnd, now, request.billingInterval);

    const [updatedSub] = await tx
      .update(subscriptions)
      .set({
        status: "active",
        plan: request.billingInterval,
        planId: request.planId,
        amount: String(request.expectedAmountXof),
        currentPeriodStart: start,
        currentPeriodEnd: end,
        graceUntil: null,
        suspendedAt: null,
        suspendReason: null,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id))
      .returning();

    const [updatedRequest] = await tx
      .update(subscriptionPaymentRequests)
      .set({
        status: "confirmed",
        actualAmountXof: body.actualAmountXof,
        actualPaidAt,
        transactionRef: body.transactionRef?.trim() || null,
        adminNote: body.adminNote?.trim() || body.overrideReason?.trim() || null,
        amountOverride: discrepancy,
        decidedBy: admin.id,
        decidedAt: now,
        appliedAt: now,
        updatedAt: now,
      })
      .where(eq(subscriptionPaymentRequests.id, id))
      .returning();

    await tx.insert(subscriptionEvents).values({
      agencyId: request.agencyId,
      subscriptionId: sub.id,
      requestId: id,
      kind: "confirmed",
      actorId: admin.id,
      payload: {
        expectedAmountXof: request.expectedAmountXof,
        actualAmountXof: body.actualAmountXof,
        discrepancy,
        transactionRef: updatedRequest!.transactionRef,
      },
    });
    await tx.insert(subscriptionEvents).values({
      agencyId: request.agencyId,
      subscriptionId: sub.id,
      requestId: id,
      kind: "activated",
      actorId: admin.id,
      payload: { periodStart: start, periodEnd: end, interval: request.billingInterval },
    });
    return { subscription: updatedSub!, request: updatedRequest! };
  });

  await notifyAgency(db, result.request.agencyId, {
    type: "billing_payment_confirmed",
    title: "Paiement confirmé",
    body: `Votre abonnement est actif jusqu'au ${result.subscription.currentPeriodEnd}. Réf: ${result.request.reference}.`,
    href: "/settings/abonnement",
  });
  return c.json({ data: result });
});

router.post("/admin/billing/requests/:id/reject", async (c) => {
  const admin = await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "request id");
  const body = await parseBody(c, rejectInput);
  const db = getDb();
  const [request] = await db.select().from(subscriptionPaymentRequests).where(eq(subscriptionPaymentRequests.id, id)).limit(1);
  if (!request) throw new HTTPException(404, { message: "Demande introuvable." });
  if (request.status === "confirmed" || request.appliedAt) {
    throw new HTTPException(409, { message: "Cette demande confirmée ne peut pas être rejetée." });
  }
  if (request.status === "rejected" || request.status === "cancelled") {
    throw new HTTPException(409, { message: "Cette demande a déjà été traitée." });
  }
  const now = new Date();
  const [updated] = await db
    .update(subscriptionPaymentRequests)
    .set({ status: "rejected", rejectReason: body.reason.trim(), decidedBy: admin.id, decidedAt: now, updatedAt: now })
    .where(eq(subscriptionPaymentRequests.id, id))
    .returning();
  await db.insert(subscriptionEvents).values({
    agencyId: request.agencyId,
    subscriptionId: request.subscriptionId,
    requestId: id,
    kind: "rejected",
    actorId: admin.id,
    payload: { reason: body.reason.trim() },
  });
  await notifyAgency(db, request.agencyId, {
    type: "billing_payment_rejected",
    title: "Paiement rejeté",
    body: `Demande ${request.reference} rejetée : ${body.reason.trim()}`,
    href: "/settings/abonnement",
  });
  return c.json({ data: updated });
});

router.get("/admin/billing/subscriptions", async (c) => {
  await requirePlatformAdmin(c);
  const db = getDb();
  const status = c.req.query("status");
  const rows = await db
    .select({ subscription: subscriptions, agencyName: organizations.name })
    .from(subscriptions)
    .leftJoin(organizations, eq(organizations.id, subscriptions.agencyId))
    .where(status ? eq(subscriptions.status, status as never) : undefined)
    .orderBy(desc(subscriptions.updatedAt))
    .limit(200);
  return c.json({ data: rows });
});

/** Subscription detail: current state, immutable history, payment records. */
router.get("/admin/billing/subscriptions/:id", async (c) => {
  await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "subscription id");
  const db = getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  if (!sub) throw new HTTPException(404, { message: "Abonnement introuvable." });
  const [agency] = await db
    .select({ id: organizations.id, name: organizations.name, profile: organizationProfiles })
    .from(organizations)
    .leftJoin(organizationProfiles, eq(organizationProfiles.organizationId, organizations.id))
    .where(eq(organizations.id, sub.agencyId))
    .limit(1);
  const [plan] = sub.planId
    ? await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1)
    : [];
  const history = await db
    .select()
    .from(subscriptionEvents)
    .where(eq(subscriptionEvents.subscriptionId, id))
    .orderBy(desc(subscriptionEvents.createdAt));
  const paymentRecords = await db
    .select()
    .from(subscriptionPaymentRequests)
    .where(eq(subscriptionPaymentRequests.subscriptionId, id))
    .orderBy(desc(subscriptionPaymentRequests.createdAt));
  return c.json({ data: { subscription: sub, agency, plan: plan ?? null, history, paymentRecords } });
});

router.post("/admin/billing/subscriptions/:id/suspend", async (c) => {  const admin = await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "subscription id");
  const body = await parseBody(c, suspendInput);
  const db = getDb();
  const [updated] = await db
    .update(subscriptions)
    .set({ status: "suspended", suspendedAt: new Date(), suspendReason: body.reason.trim(), updatedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Abonnement introuvable." });
  await db.insert(subscriptionEvents).values({
    agencyId: updated.agencyId,
    subscriptionId: id,
    kind: "suspended",
    actorId: admin.id,
    payload: { reason: body.reason.trim() },
  });
  await notifyAgency(db, updated.agencyId, {
    type: "billing_suspended",
    title: "Abonnement suspendu",
    body: body.reason.trim(),
    href: "/settings/abonnement",
  });
  return c.json({ data: updated });
});

router.post("/admin/billing/subscriptions/:id/reactivate", async (c) => {
  const admin = await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "subscription id");
  const db = getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  if (!sub) throw new HTTPException(404, { message: "Abonnement introuvable." });
  const now = new Date();
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const status = end && end.getTime() > now.getTime() ? "active" : "past_due";
  const [updated] = await db
    .update(subscriptions)
    .set({ status: status as never, suspendedAt: null, suspendReason: null, updatedAt: now })
    .where(eq(subscriptions.id, id))
    .returning();
  await db.insert(subscriptionEvents).values({
    agencyId: sub.agencyId,
    subscriptionId: id,
    kind: "reactivated",
    actorId: admin.id,
    payload: { status },
  });
  await notifyAgency(db, sub.agencyId, {
    type: "billing_reactivated",
    title: "Abonnement réactivé",
    href: "/settings/abonnement",
  });
  return c.json({ data: updated });
});

/** Manual extension without payment — always audited as an adjustment. */
router.post("/admin/billing/subscriptions/:id/extend", async (c) => {
  const admin = await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "subscription id");
  const body = await parseBody(c, extendInput);
  const db = getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  if (!sub) throw new HTTPException(404, { message: "Abonnement introuvable." });
  const now = new Date();
  const base = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > now.getTime()
    ? new Date(sub.currentPeriodEnd)
    : now;
  const end = addMonthsClamped(base, body.months ?? 1);
  const [updated] = await db
    .update(subscriptions)
    .set({ currentPeriodEnd: end, status: "active", updatedAt: now })
    .where(eq(subscriptions.id, id))
    .returning();
  await db.insert(subscriptionEvents).values({
    agencyId: sub.agencyId,
    subscriptionId: id,
    kind: "adjustment",
    actorId: admin.id,
    payload: { action: "extend", months: body.months, reason: body.reason.trim(), newPeriodEnd: end },
  });
  return c.json({ data: updated });
});

router.post("/admin/billing/subscriptions/:id/change-plan", async (c) => {
  const admin = await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "subscription id");
  const body = await parseBody(c, changePlanInput);
  const db = getDb();
  const [updated] = await db
    .update(subscriptions)
    .set({ plan: body.plan, updatedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Abonnement introuvable." });
  await db.insert(subscriptionEvents).values({
    agencyId: updated.agencyId,
    subscriptionId: id,
    kind: "plan_changed",
    actorId: admin.id,
    payload: { plan: body.plan, reason: body.reason.trim() },
  });
  return c.json({ data: updated });
});

router.get("/admin/billing/plans", async (c) => {
  await requirePlatformAdmin(c);
  const rows = await getDb().select().from(subscriptionPlans).orderBy(subscriptionPlans.code);
  return c.json({ data: rows });
});

router.post("/admin/billing/plans", async (c) => {
  await requirePlatformAdmin(c);
  const body = await parseBody(c, planInput);
  const [row] = await getDb().insert(subscriptionPlans).values({
    code: body.code,
    name: body.name,
    description: body.description || null,
    monthlyPriceXof: body.monthlyPriceXof,
    annualPriceXof: body.annualPriceXof,
    features: body.features,
    isActive: body.isActive,
  }).returning();
  return c.json({ data: row }, 201);
});

router.put("/admin/billing/plans/:id", async (c) => {
  await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "plan id");
  const body = await parseBody(c, planInput);
  const [row] = await getDb()
    .update(subscriptionPlans)
    .set({ ...body, description: body.description || null, updatedAt: new Date() })
    .where(eq(subscriptionPlans.id, id))
    .returning();
  if (!row) throw new HTTPException(404, { message: "Formule introuvable." });
  return c.json({ data: row });
});

router.get("/admin/billing/instructions", async (c) => {
  await requirePlatformAdmin(c);
  const rows = await getDb().select().from(subscriptionPaymentInstructions).orderBy(subscriptionPaymentInstructions.sortOrder);
  return c.json({ data: rows });
});

router.post("/admin/billing/instructions", async (c) => {
  await requirePlatformAdmin(c);
  const body = await parseBody(c, instructionInput);
  const [row] = await getDb().insert(subscriptionPaymentInstructions).values({
    method: body.method,
    displayName: body.displayName || null,
    phoneNumber: body.phoneNumber || null,
    instructions: body.instructions || null,
    sortOrder: body.sortOrder,
    isActive: body.isActive,
  }).returning();
  return c.json({ data: row }, 201);
});

router.put("/admin/billing/instructions/:id", async (c) => {
  await requirePlatformAdmin(c);
  const id = parseUuid(c.req.param("id"), "instruction id");
  const body = await parseBody(c, instructionInput);
  const [row] = await getDb()
    .update(subscriptionPaymentInstructions)
    .set({
      method: body.method,
      displayName: body.displayName || null,
      phoneNumber: body.phoneNumber || null,
      instructions: body.instructions || null,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionPaymentInstructions.id, id))
    .returning();
  if (!row) throw new HTTPException(404, { message: "Instruction introuvable." });
  return c.json({ data: row });
});

// Silence unused import in builds without expiry queries.
void sql;

/**
 * Expiry automation trigger. Prefers a shared CRON_SECRET bearer; falls back
 * to platform-admin session when no secret is configured (local runs).
 * Configure daily in Vercel Cron / systemd — never a frontend timer.
 */
router.post("/admin/billing/cron", async (c) => {
  const secret = process.env.CRON_SECRET;
  const provided = c.req.header("x-cron-secret") ?? c.req.header("authorization")?.replace(/^Bearer /, "");
  if (secret) {
    if (provided !== secret) throw new HTTPException(401, { message: "Invalid cron secret." });
  } else {
    await requirePlatformAdmin(c);
  }
  const { runBillingCron } = await import("@/server/lib/billing-cron");
  const summary = await runBillingCron();
  return c.json({ data: summary });
});

export default router;

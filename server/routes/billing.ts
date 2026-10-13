import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import {
  subscriptionEvents,
  subscriptionPaymentInstructions,
  subscriptionPaymentRequests,
  subscriptionPlans,
  subscriptions,
} from "@/db/schema";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { generatePaymentReference, priceForPlan, resolveAccess, trialEndsAt } from "@/server/lib/billing";
import { notifyAgency } from "@/server/lib/subscription-access";
import { parseBody, parseUuid } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const methodEnum = z.enum(["wave", "orange_money", "mtn_momo", "mobile_money", "cash"]);
const intervalEnum = z.enum(["monthly", "annual"]);

const createRequestInput = z.object({
  planId: z.string().uuid(),
  billingInterval: intervalEnum,
  method: methodEnum.default("wave"),
});

const notifyInput = z.object({
  method: methodEnum.optional(),
  claimedRef: z.string().trim().max(180).nullish(),
  claimedPaidAt: z.string().datetime().nullish(),
  note: z.string().trim().max(2000).nullish(),
  receiptUrl: z.string().trim().max(1000).nullish(),
});

function validateReceiptUrl(value: string | null | undefined) {
  if (value == null || value === "") return null;
  // Private proxy keys only; never a public URL or another agency's path.
  if (!value.startsWith("/api/uploads/")) {
    throw new HTTPException(400, { message: "URL de reçu invalide." });
  }
  if (value.includes("..")) throw new HTTPException(400, { message: "URL de reçu invalide." });
  return value;
}

/** Active plans, priced server-side in XOF. */
router.get("/billing/plans", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();
  const rows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  return c.json({ data: rows });
});

/** Payment instructions (active rows only, no secrets). */
router.get("/billing/instructions", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptionPaymentInstructions)
    .where(eq(subscriptionPaymentInstructions.isActive, true));
  return c.json({ data: rows });
});

/** Current agency subscription + resolved access (trial/grace aware). */
router.get("/billing/subscription", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();
  let [sub] = await db.select().from(subscriptions).where(eq(subscriptions.agencyId, actor.organizationId)).limit(1);
  // Lazy trial: a brand-new agency gets 14 days without any payment.
  if (!sub) {
    const now = new Date();
    const [created] = await db
      .insert(subscriptions)
      .values({
        agencyId: actor.organizationId,
        plan: "monthly",
        amount: "5000.00",
        status: "trialing",
        trialEndsAt: trialEndsAt(now),
      })
      .returning();
    sub = created!;
    if (sub) {
      await db.insert(subscriptionEvents).values({
        agencyId: actor.organizationId,
        subscriptionId: sub.id,
        kind: "created",
        payload: { source: "trial", trialEndsAt: sub.trialEndsAt },
      });
    }
  }
  if (!sub) throw new HTTPException(500, { message: "Impossible de charger l'abonnement." });
  const access = resolveAccess(
    {
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
      trialEndsAt: sub.trialEndsAt ? new Date(sub.trialEndsAt) : null,
      graceUntil: sub.graceUntil ? new Date(sub.graceUntil) : null,
    },
    new Date(),
  );
  return c.json({ data: { subscription: sub, access } });
});

/**
 * Create a payment request. The expected amount comes from the DB plan row —
 * never from the client. A pending renewal never revokes the current period.
 */
router.post("/billing/requests", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const body = await parseBody(c, createRequestInput);
  const db = getDb();

  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, body.planId)).limit(1);
  if (!plan || !plan.isActive) throw new HTTPException(400, { message: "Formule invalide." });
  const expected = priceForPlan(plan, body.billingInterval);
  if (!Number.isInteger(expected) || expected <= 0) {
    throw new HTTPException(500, { message: "Montant de formule invalide." });
  }

  let [sub] = await db.select().from(subscriptions).where(eq(subscriptions.agencyId, actor.organizationId)).limit(1);
  if (!sub) {
    const [created] = await db
      .insert(subscriptions)
      .values({
        agencyId: actor.organizationId,
        plan: body.billingInterval,
        amount: String(expected),
        status: "pending_payment",
      })
      .returning();
    sub = created!;
  }

  // One reference attempt loop (unique constraint is the final guard).
  let reference = generatePaymentReference();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [request] = await db
        .insert(subscriptionPaymentRequests)
        .values({
          agencyId: actor.organizationId,
          subscriptionId: sub!.id,
          planId: plan.id,
          billingInterval: body.billingInterval,
          expectedAmountXof: expected,
          reference,
          method: body.method,
          status: "pending",
          createdBy: actor.id,
        })
        .returning();
      await db.insert(subscriptionEvents).values({
        agencyId: actor.organizationId,
        subscriptionId: sub!.id,
        requestId: request!.id,
        kind: "created",
        payload: { reference, expectedAmountXof: expected, interval: body.billingInterval, method: body.method },
      });
      return c.json({ data: request }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("payment_requests_reference_uq") && attempt < 2) {
        reference = generatePaymentReference();
        continue;
      }
      throw error;
    }
  }
  throw new HTTPException(500, { message: "Impossible de créer la demande." });
});

router.get("/billing/requests", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptionPaymentRequests)
    .where(eq(subscriptionPaymentRequests.agencyId, actor.organizationId))
    .orderBy(desc(subscriptionPaymentRequests.createdAt));
  return c.json({ data: rows });
});

router.get("/billing/requests/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "request id");
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptionPaymentRequests)
    .where(and(eq(subscriptionPaymentRequests.id, id), eq(subscriptionPaymentRequests.agencyId, actor.organizationId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Demande introuvable." });
  return c.json({ data: row });
});

/**
 * Submit a payment notification (unverified claim). Never activates the
 * subscription — it only moves pending → notified for admin review.
 */
router.post("/billing/requests/:id/notify", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "request id");
  const body = await parseBody(c, notifyInput);
  const db = getDb();

  const [row] = await db
    .select()
    .from(subscriptionPaymentRequests)
    .where(and(eq(subscriptionPaymentRequests.id, id), eq(subscriptionPaymentRequests.agencyId, actor.organizationId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Demande introuvable." });
  if (row.status !== "pending") {
    throw new HTTPException(409, { message: "Cette demande a déjà été traitée." });
  }

  let claimedPaidAt: Date | null = null;
  if (body.claimedPaidAt) {
    claimedPaidAt = new Date(body.claimedPaidAt);
    if (Number.isNaN(claimedPaidAt.getTime())) throw new HTTPException(400, { message: "Date de paiement invalide." });
    if (claimedPaidAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new HTTPException(400, { message: "La date de paiement ne peut pas être dans le futur." });
    }
  }
  const receiptUrl = validateReceiptUrl(body.receiptUrl);

  const [updated] = await db
    .update(subscriptionPaymentRequests)
    .set({
      method: body.method ?? row.method,
      claimedRef: body.claimedRef?.trim() || null,
      claimedPaidAt,
      note: body.note?.trim() || null,
      receiptUrl,
      status: "notified",
      updatedAt: new Date(),
    })
    .where(eq(subscriptionPaymentRequests.id, id))
    .returning();

  await db.insert(subscriptionEvents).values({
    agencyId: actor.organizationId,
    subscriptionId: row.subscriptionId,
    requestId: id,
    kind: "notified",
    payload: { claimedRef: updated!.claimedRef, method: updated!.method },
  });
  await notifyAgency(db, actor.organizationId, {
    type: "billing_request_submitted",
    title: "Demande de paiement envoyée",
    body: `Référence ${row.reference} — en attente de vérification par l'administrateur.`,
    href: "/settings/abonnement",
  });
  return c.json({ data: updated });
});

router.post("/billing/requests/:id/cancel", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "request id");
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptionPaymentRequests)
    .where(and(eq(subscriptionPaymentRequests.id, id), eq(subscriptionPaymentRequests.agencyId, actor.organizationId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Demande introuvable." });
  if (row.status !== "pending" && row.status !== "notified") {
    throw new HTTPException(409, { message: "Cette demande ne peut plus être annulée." });
  }
  const [updated] = await db
    .update(subscriptionPaymentRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(subscriptionPaymentRequests.id, id))
    .returning();
  await db.insert(subscriptionEvents).values({
    agencyId: actor.organizationId,
    subscriptionId: row.subscriptionId,
    requestId: id,
    kind: "cancelled",
    payload: { reference: row.reference },
  });
  return c.json({ data: updated });
});

export default router;

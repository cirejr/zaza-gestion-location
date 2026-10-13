import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { subscriptionPlans as subscriptionPlansTable, subscriptions, users, payments, buildings, subscriptionPayments } from "@/db/schema";
import { createCheckoutSession, getCheckoutStatus, verifyPayment, verifySaspayWebhook, cancelCheckoutSession } from "@/lib/saspay";
import { subscriptionPlans as legacyPlanAmounts } from "@/lib/plans";
import { z as zz } from "zod";
import type { ApiEnv } from "@/server/session-middleware";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { parseBody, parseUuid } from "@/server/lib/http";

const router = new Hono<ApiEnv>;

/**
 * Gateway-flow pricing reads the DB `standard` plan (seeded 5000/50000 XOF)
 * instead of trusting hardcoded constants. Falls back to the legacy
 * constants only when the seed row is missing (e.g. pre-0016 database).
 */
async function gatewayPrices(plan: "monthly" | "annual"): Promise<{ amount: string; currency: string }> {
  const [row] = await getDb()
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.code, "standard"))
    .limit(1);
  if (row?.isActive) {
    const xof = plan === "annual" ? row.annualPriceXof : row.monthlyPriceXof;
    return { amount: `${xof}.00`, currency: "XOF" };
  }
  return legacyPlanAmounts[plan];
}

/** Input for creating a new subscription. */
const subscriptionInput = zz.object({
  plan: zz.enum(["monthly", "annual"]),
});

/**
 * GET /api/subscriptions
 * List all subscriptions for the authenticated agency.
 */
router.get("/", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);

  const db = getDb();

  const subscriptionsData = await db
    .select({
      id: subscriptions.id,
      plan: subscriptions.plan,
      amount: subscriptions.amount,
      status: subscriptions.status,
      checkoutUrl: subscriptions.checkoutUrl,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .where(eq(subscriptions.agencyId, actor.organizationId))
    .orderBy(subscriptions.createdAt);

  return c.json({ data: subscriptionsData });
});

/**
 * POST /api/subscriptions
 * Create a new subscription payment intent.
 * This generates a SasPay checkout session and stores a pending subscription record.
 * Montants fixes côté serveur : 5 000 XOF (mensuel) / 50 000 XOF (annuel).
 */
router.post("/", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const body = await parseBody(c, subscriptionInput);
  const db = getDb();

  // The subscription belongs to the agency (organization), not to the individual
  // user: any owner/manager on the team sees and manages the same subscription.
  const agencyId = actor.organizationId;

  // Check if agency already has an active subscription - use count
  const [countResult] = (await db
    .select({ total: count() })
    .from(subscriptions)
    .where(and(eq(subscriptions.agencyId, agencyId), eq(subscriptions.status, "active")))) as any;
  if (countResult.total > 0) throw new HTTPException(409, { message: "Cette agence possède déjà un abonnement actif." });

  // Détermine les montants selon le plan (source DB, cf. gatewayPrices)
  const { amount, currency } = await gatewayPrices(body.plan);

  // Création d'un abonnement status=pending avec les IDs SasPay
  const [subscription] = (await db
    .insert(subscriptions)
    .values({
      agencyId,
      plan: body.plan,
      amount,
      status: "pending",
      saspay_checkout_id: null,
      saspay_payment_id: null,
      net_amount: null,
    })
    .returning()) as unknown as [typeof subscriptions.$inferSelect];

  // Création nouvelle session checkout SasPay
  const customerEmail = actor.email ?? "unknown@agency.local";
  const customerName = actor.name ?? "Agency";

  const session = await createCheckoutSession(c, amount, currency, customerEmail, customerName, {
    description: `Abonnement ${body.plan} - Naya`,
    returnUrl: `${process.env.APP_URL}/subscription/return?subscription=${subscription.id}`,
    metadata: {
      subscriptionId: subscription.id,
      agencyId,
      plan: body.plan,
      expected_amount: amount
    }
  });

  // Mise à jour avec les IDs SasPay et l'URL de checkout
  await db
    .update(subscriptions)
    .set({ saspay_checkout_id: session.id, checkoutUrl: session.checkout_url })
    .where(eq(subscriptions.id, subscription.id));

  return c.json({
    data: {
      id: subscription.id,
      plan: subscription.plan,
      amount: subscription.amount,
      status: subscription.status,
      checkoutUrl: session.checkout_url
    },
  });
});

/**
 * GET /api/subscriptions/:id
 * Get subscription details and payment status.
 */
router.get("/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "subscription id");
  const db = getDb();

  // Verify the subscription belongs to this agency
  const [result] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.agencyId, actor.organizationId)));

  const subscription = result ? result : null;

  if (!subscription) {
    throw new HTTPException(404, { message: "Abonnement introuvable." });
  }

  return c.json({
    data: {
      ...subscription,
      activated: subscription.status === "active",
    },
  });
});

/**
 * GET /api/subscriptions/:id/status
 * Get subscription status from SasPay gateway (polling endpoint).
 * Revérifie toujours côté gateway, jamais confiance dans un statut mémorisé.
 */
router.get("/:id/status", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, c.req.param("id")), eq(subscriptions.agencyId, actor.organizationId)))
    .limit(1)
    .execute();

  if (!subscription) return c.notFound();

  // Si déjà actif, on renvoie le statut courant
  if (subscription.status === "active") {
    return c.json({
      id: subscription.id,
      status: "active",
      currentPeriodEnd: subscription.currentPeriodEnd,
      plan: subscription.plan
    });
  }

  // Sinon, on réclame le statut gateway via la session checkout
  if (subscription.saspay_checkout_id) {
    const status = await getCheckoutStatus(c, subscription.saspay_checkout_id);

    // Si PAID → vérifie le paiement complet (seule source de vérité)
    if (status.status === "PAID") {
      const payment = await verifyPayment(c, subscription.saspay_payment_id!);

      // Activation uniquement si SUCCESS + montants/concordes (prix DB)
      if (payment?.status === "SUCCESS") {
        const { amount: expectedAmount } = await gatewayPrices(subscription.plan);
        if (payment.requested_amount === expectedAmount && payment.currency === "XOF") {
          const now = new Date();
          const currentPeriodEnd = subscription.currentPeriodEnd
            ? new Date(Math.max(now.getTime(), new Date(subscription.currentPeriodEnd).getTime()))
            : now;
          const durationMap: Record<string, number> = { monthly: 30 * 24 * 60 * 60 * 1000, annual: 365 * 24 * 60 * 60 * 1000 };
          const newPeriodEnd = new Date(now.getTime() + (durationMap[subscription.plan as keyof typeof durationMap] || 30 * 24 * 60 * 60 * 1000));

          await db
            .update(subscriptions)
            .set({ status: "active", currentPeriodEnd: newPeriodEnd, net_amount: payment.net_amount })
            .where(eq(subscriptions.id, subscription.id));

          return c.json({
            id: subscription.id,
            status: "active",
            currentPeriodEnd: newPeriodEnd,
            plan: subscription.plan,
            net_amount: payment.net_amount
          });
        }
      }

      // Si vérification échoue → laisse pending (pas d'activation)
      return c.json({ id: subscription.id, status: "pending" });
    }

    // Si PENDING → laisse pending (pas d'activation)
    if (status.status === "PENDING") {
      return c.json({ id: subscription.id, status: "pending" });
    }

    // Si EXPIRED/CANCELLED → laisse le statut tel quel
    return c.json({ id: subscription.id, status: status.status });
  }

  return c.json({ id: subscription.id, status: subscription.status });
});

/**
 * POST /api/subscriptions/:id/renew
 * Crée une nouvelle session de checkout pour le même plan.
 * Au SUCCESS → étend currentPeriodEnd (jamais de prélèvement auto).
 */
router.post("/:id/renew", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, c.req.param("id")), eq(subscriptions.agencyId, actor.organizationId)))
    .limit(1)
    .execute();

  if (!subscription) return c.notFound();
  if (subscription.status === "active") {
    return c.json({ error: "Abonnement déjà actif" }, 400);
  }

  const plan = subscription.plan as "monthly" | "annual";
  const { amount, currency } = await gatewayPrices(plan);

  // Session existante : best-effort cancel avant recreation
  if (subscription.saspay_checkout_id) {
    try { await cancelCheckoutSession(c, subscription.saspay_checkout_id); } catch (_) {}
  }

  const customerEmail = actor.email ?? "unknown@agency.local";
  const customerName = actor.name ?? "Agency";

  const session = await createCheckoutSession(c, amount, currency, customerEmail, customerName, {
    description: `Renouvellement abonnement ${plan} - Naya`,
    returnUrl: `${process.env.APP_URL}/subscription/return?subscription=${c.req.param("id")}`,
    metadata: {
      subscriptionId: c.req.param("id"),
      agencyId: actor.organizationId,
      plan,
      expected_amount: amount,
      renew: "true"
    }
  });

  await db
    .update(subscriptions)
    .set({ saspay_checkout_id: session.id, checkoutUrl: session.checkout_url })
    .where(eq(subscriptions.id, subscription.id));

  return c.json({
    subscriptionId: subscription.id,
    status: "pending",
    checkoutUrl: session.checkout_url
  });
});

/**
 * POST /api/subscriptions/:id/confirm
 * Handle PayDunya webhook confirmation.
 * Verifies the payment and activates the subscription.
 */
router.post("/:id/confirm", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "subscription id");
  const db = getDb();

  // Verify ownership
  const [result] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.agencyId, actor.organizationId)));

  const subscription = result ? result : null;

  if (!subscription) {
    throw new HTTPException(404, { message: "Abonnement introuvable." });
  }

  // If already active, nothing to do
  if (subscription.status === "active") {
    return c.json({ data: subscription, activated: true });
  }

  // Read the webhook payload from PayDunya
  const form = await c.req.parseBody();
  const typeEvent = String(form.type_event ?? "");
  const refCommand = String(form.ref_command ?? "");
  const customField = String(form.custom_field ?? "");

  // Verify the payment reference matches our subscription
  // PayDunya's ref_command maps to the reference we sent: SUB-{agencyId}-{subscriptionId}
  if (!refCommand || !refCommand.startsWith("SUB-")) {
    throw new HTTPException(400, { message: "Référence de paiement invalide." });
  }

  // Extract subscription ID from reference: SUB-{agencyId}-{subscriptionId}
  const parts = refCommand.split("-");
  const extractedSubscriptionId = parts.slice(2).join("-"); // in case subscriptionId has hyphens

  if (extractedSubscriptionId !== id) {
    throw new HTTPException(400, { message: "Cette référence ne correspond pas à cet abonnement." });
  }

  // Determine status from event type
  let status: "pending" | "paid" | "failed" | "refunded" | "cancelled" = "paid";
  if (typeEvent === "sale_canceled") status = "cancelled";
  if (typeEvent === "sale_refunded") status = "refunded";
  if (typeEvent === "sale_failed" || typeEvent === "error") status = "failed";

  // Update subscription status based on payment result
  const newStatus: "active" | "expired" | "cancelled" = status === "paid" ? "active" : status === "cancelled" ? "cancelled" : "expired";

  await db
    .update(subscriptions)
    .set({
      status: newStatus,
      currentPeriodStart: newStatus === "active" ? new Date() : null,
      currentPeriodEnd: newStatus === "active"
        ? new Date(Date.now() + (subscription.plan === "monthly" ? 30 : 365) * 24 * 60 * 60 * 1000)
        : null,
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, id));

  return c.json({ data: subscription, activated: newStatus === "active" });
});

export default router;
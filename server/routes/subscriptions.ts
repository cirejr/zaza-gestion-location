import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { subscriptions, users, payments, buildings } from "@/db/schema";
import { createPaymentLink, PaymentProviderError, type PaymentProviderName } from "@/lib/payment-providers";
import { buildingAccessCondition, getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { parseBody, parseUuid } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>;

/**
 * Input for creating a new subscription.
 * The agency administrator selects a plan (monthly/annual) and the system
 * generates a PayDunya checkout link.
 */
const subscriptionInput = z.object({
  plan: z.enum(["monthly", "annual"]),
  amount: z.number().positive(),
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.string().email().max(255).optional(),
  customerPhone: z.string().trim().min(6).max(32),
  reference: z.string().trim().min(1).max(180),
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
 * This generates a PayDunya checkout link and stores a pending subscription record.
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

  // Create a subscription record (pending)
  const [subscription] = (await db
    .insert(subscriptions)
    .values({
      agencyId,
      plan: body.plan,
      amount: body.amount.toString(),
      status: "pending",
      paydunyaReference: `${body.plan}-${agencyId}-${Date.now()}`,
      checkoutUrl: null,
    })
    .returning()) as unknown as [typeof subscriptions.$inferSelect];

  // Generate PayDunya checkout link
  const reference = `SUB-${agencyId}-${subscription.id}`;
  const link = await createPaymentLink("paydunya", {
    amount: body.amount,
    currency: "XOF",
    reference,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    customerPhone: body.customerPhone,
    returnUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/subscriptions/${subscription.id}/confirm`,
    notificationUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/payments/paydunya`,
    subscription: {
      plan: body.plan,
      subscriptionId: subscription.id,
    },
  });

  // Update subscription with checkout URL
  await db
    .update(subscriptions)
    .set({ checkoutUrl: link.paymentUrl })
    .where(eq(subscriptions.id, subscription.id));

  return c.json({
    data: {
      id: subscription.id,
      plan: subscription.plan,
      amount: subscription.amount,
      status: subscription.status,
      checkoutUrl: subscription.checkoutUrl,
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
import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb } from "@/db";
import { notifications, subscriptionEvents, subscriptions, users } from "@/db/schema";
import { resolveAccess, trialEndsAt } from "@/server/lib/billing";
import type { AgencyActor } from "@/server/lib/auth-context";

/** Notify every owner/manager of an agency in-app (existing inbox table). */
export async function notifyAgency(
  tx: { insert: (...args: never[]) => unknown } | ReturnType<typeof getDb>,
  agencyId: string,
  input: { type: string; title: string; body?: string; href?: string },
) {
  const db = tx as ReturnType<typeof getDb>;
  const members = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, agencyId), inArray(users.role, ["owner", "manager"])));
  for (const member of members) {
    await db.insert(notifications).values({
      userId: member.id,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
    });
  }
}

export async function getAgencySubscription(agencyId: string) {
  const db = getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.agencyId, agencyId)).limit(1);
  return row ?? null;
}

/**
 * Reusable subscription gate for premium writes. Reads are left open so an
 * expired agency always keeps login, billing and account access.
 *
 * Agencies created before billing (no row yet) get their 14-day trial
 * lazily here — the same rule as GET /billing/subscription — so enforcement
 * never locks out an agency that never had a chance to subscribe.
 */
export async function requireActiveSubscription(actor: AgencyActor, now = new Date()) {
  const db = getDb();
  let sub = await getAgencySubscription(actor.organizationId);
  if (!sub) {
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
    if (created) {
      await db.insert(subscriptionEvents).values({
        agencyId: actor.organizationId,
        subscriptionId: created.id,
        kind: "created",
        payload: { source: "trial", trialEndsAt: created.trialEndsAt },
      });
    }
    sub = created ?? null;
  }
  if (!sub) throw new HTTPException(402, { message: "Abonnement requis. Régularisez votre paiement." });
  const access = resolveAccess(
    {
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
      trialEndsAt: sub.trialEndsAt ? new Date(sub.trialEndsAt) : null,
      graceUntil: sub.graceUntil ? new Date(sub.graceUntil) : null,
    },
    now,
  );
  if (!access.allowed) {
    throw new HTTPException(402, { message: "Abonnement expiré. Régularisez votre paiement pour continuer." });
  }
  return { sub, access };
}

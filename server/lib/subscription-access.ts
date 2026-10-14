import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import { getDb } from "@/db";
import { authUsers, notifications, subscriptions, users } from "@/db/schema";
import { resolveAccess } from "@/server/lib/billing";
import { requireActor, type AgencyActor } from "@/server/lib/auth-context";
import type { ApiEnv } from "@/server/session-middleware";

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

/** Notify every platform (SaaS) admin in-app, matched by email. No-op when none. */
export async function notifyPlatformAdmins(
  tx: { insert: (...args: never[]) => unknown } | ReturnType<typeof getDb>,
  input: { type: string; title: string; body?: string; href?: string },
) {
  const db = tx as ReturnType<typeof getDb>;
  const admins = await db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.role, "admin"));
  const adminEmails = new Set(admins.map((a) => a.email.toLowerCase()));
  if (!adminEmails.size) return;
  const staff = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.role, ["owner", "manager"]));
  for (const member of staff) {
    if (member.email && adminEmails.has(member.email.toLowerCase())) {
      await db.insert(notifications).values({
        userId: member.id,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href,
      });
    }
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
 * No trial: an agency with no subscription row (or an expired one) is
 * rejected with 402 and routed to `/settings/abonnement` to pay. Manual
 * payment is currently the only way to subscribe.
 */
export async function requireActiveSubscription(actor: AgencyActor, now = new Date()) {
  const sub = await getAgencySubscription(actor.organizationId);
  if (!sub) throw new HTTPException(402, { message: "Abonnement requis. Souscrivez pour continuer." });
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

/**
 * Hono middleware version of the gate, mounted on locked API paths in
 * `server/app.ts` (dashboard data: buildings, leases, tenants, prospects,
 * financial records, reports…). Reads and writes behind those paths all
 * require an active or grace-period subscription; billing, account, admin,
 * notification, upload and portal paths stay open by design.
 */
export const subscriptionLockMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
  const actor = await requireActor(c);
  await requireActiveSubscription(actor);
  await next();
});

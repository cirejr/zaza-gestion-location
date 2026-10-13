import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptionEvents, subscriptions } from "@/db/schema";
import { EXPIRY_REMINDER_DAYS, graceUntil } from "@/server/lib/billing";
import { notifyAgency } from "@/server/lib/subscription-access";

/**
 * Server-side expiry automation. Called from the cron endpoint or a
 * scheduler — never from a frontend timer. Idempotent per day: reminder
 * events dedupe so a retry does not spam the inbox.
 */
export async function runBillingCron(now = new Date()) {
  const db = getDb();
  const summary = { expiredTrials: 0, markedPastDue: 0, expired: 0, reminders: 0 };

  // 1. Trials that ended → expired.
  const endedTrials = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "trialing"), lte(subscriptions.trialEndsAt, now)));
  for (const sub of endedTrials) {
    await db.update(subscriptions).set({ status: "expired", updatedAt: now }).where(eq(subscriptions.id, sub.id));
    await db.insert(subscriptionEvents).values({
      agencyId: sub.agencyId,
      subscriptionId: sub.id,
      kind: "expired",
      payload: { source: "trial_end" },
    });
    await notifyAgency(db, sub.agencyId, {
      type: "billing_trial_expired",
      title: "Période d'essai terminée",
      body: "Votre essai de 14 jours est terminé. Régularisez votre paiement pour continuer.",
      href: "/settings/abonnement",
    });
    summary.expiredTrials += 1;
  }

  // 2. Active subscriptions past their period → past_due + grace window.
  const endedActive = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), lte(subscriptions.currentPeriodEnd, now)));
  for (const sub of endedActive) {
    const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : now;
    await db
      .update(subscriptions)
      .set({ status: "past_due", graceUntil: graceUntil(end), updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    await db.insert(subscriptionEvents).values({
      agencyId: sub.agencyId,
      subscriptionId: sub.id,
      kind: "expired",
      payload: { source: "period_end", graceDays: 7 },
    });
    await notifyAgency(db, sub.agencyId, {
      type: "billing_expired",
      title: "Abonnement expiré",
      body: "Votre abonnement a expiré. Vous disposez de 7 jours de grâce.",
      href: "/settings/abonnement",
    });
    summary.markedPastDue += 1;
  }

  // 3. past_due past grace → expired (data kept, access blocked).
  const pastGrace = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "past_due"), lte(subscriptions.graceUntil, now)));
  for (const sub of pastGrace) {
    await db.update(subscriptions).set({ status: "expired", updatedAt: now }).where(eq(subscriptions.id, sub.id));
    await db.insert(subscriptionEvents).values({
      agencyId: sub.agencyId,
      subscriptionId: sub.id,
      kind: "expired",
      payload: { source: "grace_end" },
    });
    await notifyAgency(db, sub.agencyId, {
      type: "billing_grace_expired",
      title: "Grâce terminée",
      body: "La période de grâce est terminée. Régularisez votre paiement pour réactiver.",
      href: "/settings/abonnement",
    });
    summary.expired += 1;
  }

  // 4. Reminders at T-7 and T-1 for active subscriptions.
  for (const days of EXPIRY_REMINDER_DAYS) {
    const from = new Date(now.getTime() + (days - 0.5) * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + (days + 0.5) * 24 * 60 * 60 * 1000);
    const upcoming = await db.select().from(subscriptions).where(eq(subscriptions.status, "active"));
    for (const sub of upcoming) {
      if (!sub.currentPeriodEnd) continue;
      const end = new Date(sub.currentPeriodEnd);
      if (end < from || end > to) continue;
      // Dedupe: one reminder per subscription/kind per 20h.
      const since = new Date(now.getTime() - 20 * 60 * 60 * 1000);
      const recent = await db.select().from(subscriptionEvents).where(eq(subscriptionEvents.subscriptionId, sub.id));
      const already = recent.some(
        (e) =>
          e.createdAt &&
          new Date(e.createdAt) > since &&
          (e.payload as { reminderDays?: number } | null)?.reminderDays === days,
      );
      if (already) continue;
      await db.insert(subscriptionEvents).values({
        agencyId: sub.agencyId,
        subscriptionId: sub.id,
        kind: "expired",
        payload: { source: "reminder", reminderDays: days },
      });
      await notifyAgency(db, sub.agencyId, {
        type: "billing_expiring",
        title: `Abonnement expire dans ${days} jour${days > 1 ? "s" : ""}`,
        body: `Votre abonnement expire le ${end.toLocaleDateString("fr-FR")}. Renouvelez pour éviter toute interruption.`,
        href: "/settings/abonnement",
      });
      summary.reminders += 1;
    }
  }

  return summary;
}

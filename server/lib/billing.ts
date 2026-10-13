/**
 * Manual-billing domain rules: period math, references, access policy.
 *
 * Pure functions (no DB) so `bun test` can cover month-end, leap-year and
 * renewal edge cases without a database. Amounts are integers in XOF.
 */

export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;
export const EXPIRY_REMINDER_DAYS = [7, 1] as const;

export type BillingInterval = "monthly" | "annual";
export type SubscriptionAccessStatus =
  | "trialing"
  | "active"
  | "grace"
  | "past_due"
  | "pending_payment"
  | "suspended"
  | "cancelled"
  | "expired"
  | "pending";

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Add calendar months, clamping to month-end (Jan 31 + 1m → Feb 28/29). UTC-based. */
export function addMonthsClamped(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const clamped = Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  target.setUTCDate(clamped);
  target.setUTCHours(from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds());
  return target;
}

export function addPeriod(from: Date, interval: BillingInterval): Date {
  return interval === "annual" ? addMonthsClamped(from, 12) : addMonthsClamped(from, 1);
}

/**
 * Renewal rule: renewing before expiry extends the paid-through date;
 * renewing after expiry starts from the confirmation moment (`now`).
 */
export function computeRenewalPeriod(currentPeriodEnd: Date | null, now: Date, interval: BillingInterval) {
  const base = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now;
  return { start: base, end: addPeriod(base, interval) };
}

export function newSubscriptionPeriod(now: Date, interval: BillingInterval) {
  return { start: now, end: addPeriod(now, interval) };
}

export function trialEndsAt(from = new Date()) {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function graceUntil(from: Date) {
  return new Date(from.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
}

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generatePaymentReference(now = new Date(), random: () => number = Math.random) {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)];
  return `NAYA-${now.getUTCFullYear()}-${suffix}`;
}

export function priceForPlan(
  plan: { monthlyPriceXof: number; annualPriceXof: number },
  interval: BillingInterval,
) {
  return interval === "annual" ? plan.annualPriceXof : plan.monthlyPriceXof;
}

export type AccessInput = {
  status: string;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
};

/**
 * Standard SaaS enforcement: `active` within period and `trialing` within
 * trial allow full access; `past_due` within grace allows access (writes
 * should warn/402 on premium actions); everything else is blocked but the
 * agency keeps login + billing + read-only account access. Data is never
 * deleted on expiry.
 */
export function resolveAccess(input: AccessInput, now = new Date()): {
  allowed: boolean;
  access: SubscriptionAccessStatus;
  inGrace: boolean;
} {
  const end = input.currentPeriodEnd;
  if (input.status === "suspended") return { allowed: false, access: "suspended", inGrace: false };
  if (input.status === "cancelled") {
    // Cancelled at period end keeps access until the paid-through date.
    if (end && end.getTime() > now.getTime()) return { allowed: true, access: "cancelled", inGrace: false };
    return { allowed: false, access: "cancelled", inGrace: false };
  }
  if (input.status === "trialing") {
    if (input.trialEndsAt && input.trialEndsAt.getTime() > now.getTime()) {
      return { allowed: true, access: "trialing", inGrace: false };
    }
    return { allowed: false, access: "expired", inGrace: false };
  }
  if (input.status === "active") {
    if (end && end.getTime() > now.getTime()) return { allowed: true, access: "active", inGrace: false };
    if (input.graceUntil && input.graceUntil.getTime() > now.getTime()) {
      return { allowed: true, access: "grace", inGrace: true };
    }
    return { allowed: false, access: "past_due", inGrace: false };
  }
  if (input.status === "past_due" || input.status === "expired") {
    if (input.graceUntil && input.graceUntil.getTime() > now.getTime()) {
      return { allowed: true, access: "grace", inGrace: true };
    }
    return { allowed: false, access: "past_due", inGrace: false };
  }
  if (input.status === "pending_payment" || input.status === "pending") {
    // A pending renewal never revokes an already-paid period.
    if (end && end.getTime() > now.getTime()) return { allowed: true, access: "active", inGrace: false };
    return { allowed: false, access: "pending_payment", inGrace: false };
  }
  return { allowed: false, access: "expired", inGrace: false };
}

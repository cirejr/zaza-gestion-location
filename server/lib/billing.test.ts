import { describe, expect, test } from "bun:test";
import {
  addMonthsClamped,
  addPeriod,
  computeRenewalPeriod,
  generatePaymentReference,
  graceUntil,
  newSubscriptionPeriod,
  priceForPlan,
  resolveAccess,
  trialEndsAt,
  TRIAL_DAYS,
  GRACE_DAYS,
} from "@/server/lib/billing";

const utc = (s: string) => new Date(s);

describe("addMonthsClamped", () => {
  test("jan 31 + 1 month clamps to feb 28 (non-leap)", () => {
    expect(addMonthsClamped(utc("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });
  test("jan 31 + 1 month clamps to feb 29 (leap year)", () => {
    expect(addMonthsClamped(utc("2024-01-31T10:00:00Z"), 1).toISOString()).toBe("2024-02-29T10:00:00.000Z");
  });
  test("aug 31 + 6 months lands on feb 28", () => {
    expect(addMonthsClamped(utc("2025-08-31T00:00:00Z"), 6).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
  test("annual from feb 29 2024 lands feb 28 2025", () => {
    expect(addPeriod(utc("2024-02-29T12:00:00Z"), "annual").toISOString()).toBe("2025-02-28T12:00:00.000Z");
  });
});

describe("renewal periods", () => {
  test("new monthly subscription covers one calendar month", () => {
    const { start, end } = newSubscriptionPeriod(utc("2026-03-15T00:00:00Z"), "monthly");
    expect(start.toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-04-15T00:00:00.000Z");
  });
  test("renew before expiry extends the paid-through date", () => {
    const { start, end } = computeRenewalPeriod(utc("2026-04-15T00:00:00Z"), utc("2026-04-10T00:00:00Z"), "monthly");
    expect(start.toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });
  test("renew after expiry starts from confirmation time", () => {
    const { start, end } = computeRenewalPeriod(utc("2026-03-01T00:00:00Z"), utc("2026-04-10T00:00:00Z"), "monthly");
    expect(start.toISOString()).toBe("2026-04-10T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-10T00:00:00.000Z");
  });
});

describe("references", () => {
  test("unique-ish format NAYA-YYYY-XXXXXX", () => {
    const refs = new Set(Array.from({ length: 200 }, () => generatePaymentReference(utc("2026-05-01T00:00:00Z"))));
    expect(refs.size).toBeGreaterThan(190);
    for (const ref of refs) expect(ref).toMatch(/^NAYA-2026-[A-Z2-9]{6}$/);
  });
});

describe("resolveAccess", () => {  const now = utc("2026-10-13T00:00:00Z");
  test("active within period is allowed", () => {
    const r = resolveAccess({ status: "active", currentPeriodEnd: utc("2026-11-01T00:00:00Z"), trialEndsAt: null, graceUntil: null }, now);
    expect(r).toEqual({ allowed: true, access: "active", inGrace: false });
  });
  test("pending renewal keeps an already-paid period", () => {
    const r = resolveAccess({ status: "pending_payment", currentPeriodEnd: utc("2026-11-01T00:00:00Z"), trialEndsAt: null, graceUntil: null }, now);
    expect(r.allowed).toBe(true);
  });
  test("pending with no period grants nothing", () => {
    const r = resolveAccess({ status: "pending_payment", currentPeriodEnd: null, trialEndsAt: null, graceUntil: null }, now);
    expect(r.allowed).toBe(false);
  });
  test("past_due inside grace stays allowed with flag", () => {
    const r = resolveAccess({ status: "past_due", currentPeriodEnd: utc("2026-10-10T00:00:00Z"), trialEndsAt: null, graceUntil: utc("2026-10-17T00:00:00Z") }, now);
    expect(r).toEqual({ allowed: true, access: "grace", inGrace: true });
  });
  test("past_due after grace is blocked", () => {
    const r = resolveAccess({ status: "past_due", currentPeriodEnd: utc("2026-09-01T00:00:00Z"), trialEndsAt: null, graceUntil: utc("2026-09-08T00:00:00Z") }, now);
    expect(r.allowed).toBe(false);
  });
  test("suspended is always blocked", () => {
    const r = resolveAccess({ status: "suspended", currentPeriodEnd: utc("2026-12-01T00:00:00Z"), trialEndsAt: null, graceUntil: null }, now);
    expect(r.allowed).toBe(false);
  });
  test("trialing within trial is allowed", () => {
    const r = resolveAccess({ status: "trialing", currentPeriodEnd: null, trialEndsAt: utc("2026-10-20T00:00:00Z"), graceUntil: null }, now);
    expect(r.allowed).toBe(true);
  });
  test("a notified (unverified) renewal keeps an already-paid period", () => {
    const r = resolveAccess({ status: "pending_payment", currentPeriodEnd: utc("2026-11-01T00:00:00Z"), trialEndsAt: null, graceUntil: null }, now);
    expect(r.allowed).toBe(true);
  });
  test("cancelled keeps access until the paid-through date, then blocks", () => {
    const kept = resolveAccess({ status: "cancelled", currentPeriodEnd: utc("2026-11-01T00:00:00Z"), trialEndsAt: null, graceUntil: null }, now);
    expect(kept.allowed).toBe(true);
    const over = resolveAccess({ status: "cancelled", currentPeriodEnd: utc("2026-09-01T00:00:00Z"), trialEndsAt: null, graceUntil: null }, now);
    expect(over.allowed).toBe(false);
  });
});

describe("pricing and policy constants", () => {
  test("priceForPlan reads the DB row, never the client", () => {
    const plan = { monthlyPriceXof: 5000, annualPriceXof: 50000 };
    expect(priceForPlan(plan, "monthly")).toBe(5000);
    expect(priceForPlan(plan, "annual")).toBe(50000);
  });
  test("trial lasts 14 days, grace lasts 7 days", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(GRACE_DAYS).toBe(7);
    const from = utc("2026-10-13T00:00:00Z");
    expect(trialEndsAt(from).toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(graceUntil(from).toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});

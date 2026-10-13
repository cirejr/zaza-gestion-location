import { beforeEach, describe, expect, mock, test } from "bun:test";
import { harness, mockDb, resetHarness } from "@/server/test-utils/mock-harness";

/**
 * Guard tests for `requireActiveSubscription` (§7 of docs/manual-payment.md):
 * the reusable mechanism premium writes share. Reads stay open by design —
 * only this gate blocks, with 402, and it never deletes data.
 */

mock.module("@/db", mockDb);

const actor = { id: "user-1", organizationId: "org-1", role: "owner", email: "o@t.fr", name: "O" } as never;
const now = new Date("2026-10-13T00:00:00Z");
const future = new Date("2026-11-13T00:00:00Z");
const past = new Date("2026-09-01T00:00:00Z");

async function gate() {
  const { requireActiveSubscription } = await import("./subscription-access");
  return requireActiveSubscription(actor, now);
}

beforeEach(() => {
  resetHarness();
  // The lazy-trial insert echoes a trialing row with a future trial end,
  // mirroring the real `trialEndsAt(now)` value written by the guard.
  harness.insertReturning = [{
    id: "sub-new",
    agencyId: "org-1",
    status: "trialing",
    currentPeriodEnd: null,
    trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    graceUntil: null,
  }];
});

describe("requireActiveSubscription", () => {
  test("an agency with no row gets its trial lazily and is allowed", async () => {
    const { sub, access } = await gate();
    expect(access.allowed).toBe(true);
    expect(access.access).toBe("trialing");
    expect(sub.status).toBe("trialing");
    expect(harness.recordedInserts.some((v: any) => v.agencyId === "org-1" && v.status === "trialing")).toBe(true);
  });

  test("an active subscription within its period is allowed", async () => {
    harness.subs = [{ id: "s", agencyId: "org-1", status: "active", currentPeriodEnd: future, trialEndsAt: null, graceUntil: null }];
    const { access } = await gate();
    expect(access).toEqual({ allowed: true, access: "active", inGrace: false });
    expect(harness.recordedInserts).toHaveLength(0);
  });

  test("an expired subscription past its grace throws 402", async () => {
    harness.subs = [{
      id: "s", agencyId: "org-1", status: "past_due",
      currentPeriodEnd: past, trialEndsAt: null,
      graceUntil: new Date("2026-09-08T00:00:00Z"),
    }];
    let status = 0;
    try {
      await gate();
    } catch (error: any) {
      status = error.status ?? 0;
    }
    expect(status).toBe(402);
  });

  test("a suspended subscription throws 402 even with a future period", async () => {
    harness.subs = [{ id: "s", agencyId: "org-1", status: "suspended", currentPeriodEnd: future, trialEndsAt: null, graceUntil: null }];
    let status = 0;
    try {
      await gate();
    } catch (error: any) {
      status = error.status ?? 0;
    }
    expect(status).toBe(402);
  });

  test("a cancelled subscription keeps access until the paid-through date", async () => {
    harness.subs = [{ id: "s", agencyId: "org-1", status: "cancelled", currentPeriodEnd: future, trialEndsAt: null, graceUntil: null }];
    const { access } = await gate();
    expect(access.allowed).toBe(true);
  });

  test("a pending renewal keeps an already-paid period", async () => {
    harness.subs = [{ id: "s", agencyId: "org-1", status: "pending_payment", currentPeriodEnd: future, trialEndsAt: null, graceUntil: null }];
    const { access } = await gate();
    expect(access.allowed).toBe(true);
  });
});

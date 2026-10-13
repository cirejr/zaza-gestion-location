import { beforeEach, describe, expect, mock, test } from "bun:test";
import { harness, mockAuthContext, mockDb, resetHarness } from "@/server/test-utils/mock-harness";

/**
 * Enforcement wiring test (§7 of docs/manual-payment.md): creating a
 * property is a premium write gated by the *real* subscription guard. Reads
 * stay open; the guard's policy matrix is unit-tested in
 * `subscription-access.test.ts`.
 */

mock.module("@/server/lib/auth-context", mockAuthContext);
mock.module("@/db", mockDb);

const future = new Date("2026-11-13T00:00:00Z");

beforeEach(() => {
  resetHarness();
  harness.actor = { id: "user-1", organizationId: "org-1", role: "owner", email: "o@t.fr", name: "O" };
  harness.insertReturning = [{ id: "b-1", name: "Immeuble Test" }];
});

describe("POST /buildings subscription gate", () => {
  test("an expired agency gets 402 and nothing is created", async () => {
    harness.subs = [{
      id: "s", agencyId: "org-1", status: "past_due",
      currentPeriodEnd: new Date("2026-09-01T00:00:00Z"), trialEndsAt: null,
      graceUntil: new Date("2026-09-08T00:00:00Z"),
    }];
    const { default: router } = await import("./buildings");
    const response = await router.request("/buildings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Immeuble Test", address: "Dakar" }),
    });
    expect(response.status).toBe(402);
    // The guard threw before the insert: no building row was written.
    expect(harness.recordedInserts).toHaveLength(0);
  });

  test("an agency in good standing can create a building", async () => {
    harness.subs = [{ id: "s", agencyId: "org-1", status: "active", currentPeriodEnd: future, trialEndsAt: null, graceUntil: null }];
    const { default: router } = await import("./buildings");
    const response = await router.request("/buildings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Immeuble Test", address: "Dakar" }),
    });
    expect(response.status).toBe(201);
  });
});

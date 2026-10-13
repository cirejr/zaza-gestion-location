import { beforeEach, describe, expect, mock, test } from "bun:test";
import { harness, mockAuthContext, mockDb, mockPlatformAdmin, resetHarness } from "@/server/test-utils/mock-harness";

/**
 * Admin verification tests, sharing the process-global mocks from
 * `server/test-utils/mock-harness`.
 * Covered (§6, §9 of docs/manual-payment.md):
 * - non-admin callers get 403 before any billing logic runs,
 * - amount mismatch without explicit override is 422 (no silent activation),
 * - an already-confirmed request cannot be confirmed again (409),
 * - a rejected request cannot be confirmed (409),
 * - a clean confirm activates the subscription and records who decided.
 */

mock.module("@/server/lib/platform-admin", mockPlatformAdmin);
mock.module("@/server/lib/auth-context", mockAuthContext);
mock.module("@/db", mockDb);

const requestId = "33333333-3333-4333-8333-333333333333";
const baseRequest = {
  id: requestId,
  agencyId: "org-9",
  subscriptionId: "sub-9",
  planId: "plan-1",
  billingInterval: "monthly",
  expectedAmountXof: 5000,
  status: "notified",
  appliedAt: null,
};
const baseSub = { id: "sub-9", agencyId: "org-9", status: "pending_payment", currentPeriodEnd: null };

async function confirm(body: unknown) {
  const { default: router } = await import("./admin-billing");
  return router.request(`/admin/billing/requests/${requestId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetHarness();
  // Platform admins operate across agencies: no agency scoping on reads.
  harness.agencyFilter = false;
  harness.requests = [{ ...baseRequest }];
  harness.claimRows = [{ ...baseRequest }];
  harness.existingRows = [];
  harness.confirmSubRows = [{ ...baseSub }];
  harness.updatedSubRows = [{ ...baseSub, status: "active" }];
  harness.updatedReqRows = [{ ...baseRequest, status: "confirmed" }];
});

describe("admin-only verification (§6, §7)", () => {
  test("a non-platform-admin gets 403", async () => {
    harness.adminMode = "denied";
    const { default: router } = await import("./admin-billing");
    const response = await router.request("/admin/billing/overview");
    expect(response.status).toBe(403);
  });
});

describe("payment confirmation (§6, §9)", () => {
  const validBody = {
    actualAmountXof: 5000,
    actualPaidAt: new Date("2026-10-10T10:00:00Z").toISOString(),
    transactionRef: "WAVE-999",
    adminNote: "Vu sur relevé",
    override: false,
  };

  test("a clean confirm activates the subscription and audits the decision", async () => {
    const response = await confirm(validBody);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.subscription.status).toBe("active");
    expect(body.data.request.status).toBe("confirmed");
    // confirmed + activated events, attributed to the admin.
    expect(harness.recordedEvents.filter((e: any) => e.kind === "confirmed")).toHaveLength(1);
    expect(harness.recordedEvents.filter((e: any) => e.kind === "activated")).toHaveLength(1);
    expect(harness.recordedEvents.every((e: any) => e.actorId === harness.adminUser.id)).toBe(true);
  });

  test("a mismatched amount without override is 422 and applies nothing", async () => {
    const response = await confirm({ ...validBody, actualAmountXof: 4000 });
    expect(response.status).toBe(422);
    // The transaction throws before the subscription/request writes and
    // before any audit event: nothing was applied.
    expect(harness.subUpdateCalls).toBe(0);
    expect(harness.recordedEvents).toHaveLength(0);
  });

  test("a mismatched amount with override reason confirms", async () => {
    const response = await confirm({
      ...validBody,
      actualAmountXof: 4500,
      override: true,
      overrideReason: "Frais déduits par erreur, accepté",
    });
    expect(response.status).toBe(200);
    expect(harness.recordedEvents.filter((e: any) => e.kind === "confirmed")).toHaveLength(1);
  });

  test("confirming an already-confirmed request is 409", async () => {
    harness.claimRows = [];
    harness.existingRows = [{ ...baseRequest, status: "confirmed", appliedAt: new Date() }];
    const response = await confirm(validBody);
    expect(response.status).toBe(409);
    expect(harness.recordedEvents).toHaveLength(0);
  });

  test("confirming a rejected request is 409", async () => {
    harness.claimRows = [];
    harness.existingRows = [{ ...baseRequest, status: "rejected", appliedAt: null }];
    const response = await confirm(validBody);
    expect(response.status).toBe(409);
    expect(harness.recordedEvents).toHaveLength(0);
  });

  test("rejecting leaves the subscription untouched and notifies with the reason", async () => {
    harness.updateReturning = [{ ...baseRequest, status: "rejected", rejectReason: "Relevé introuvable" }];
    const { default: router } = await import("./admin-billing");
    const response = await router.request(`/admin/billing/requests/${requestId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Relevé introuvable" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("rejected");
    // A rejection never grants access: no subscriptions-table write happened.
    expect(harness.recordedUpdates.some((u: any) => u.table === "subscriptions")).toBe(false);
    // The decision is audited (rejected event carries the reason + admin).
    expect(harness.recordedInserts.some((v: any) => v?.kind === "rejected")).toBe(true);
  });

  test("rejecting without a reason is 400", async () => {
    const { default: router } = await import("./admin-billing");
    const response = await router.request(`/admin/billing/requests/${requestId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "   " }),
    });
    expect(response.status).toBe(400);
  });
});

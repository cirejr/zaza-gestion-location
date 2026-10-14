import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { harness, mockAuthContext, mockDb, resetHarness, scopedToAgency } from "@/server/test-utils/mock-harness";

/**
 * Agency billing flow tests (same harness style as `organization.test.ts`,
 * sharing the process-global mocks from `server/test-utils/mock-harness`).
 * Hono routing, zod validation and status codes are real.
 *
 * Covered here (§5, §7, §9 of docs/manual-payment.md):
 * - cross-agency isolation (404, not 403, to avoid leaking existence),
 * - notify moves pending → notified without touching the subscription,
 * - re-notify is rejected (409),
 * - server-side pricing: unknown/inactive plan is rejected (400).
 */

mock.module("@/db", mockDb);
mock.module("@/server/lib/auth-context", mockAuthContext);

const ownerActor = { id: "user-1", organizationId: "org-1", role: "owner", email: "o@t.fr", name: "O" };
const PLAN_ID = "11111111-1111-4111-8111-111111111111";

async function call(path: string, init?: RequestInit) {
  const { default: router } = await import("./billing");
  // Production mounts sessionMiddleware before this router; mirror that so
  // session-dependent guards (policy acceptance) exercise their real path.
  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session" as never, { user: { id: "auth-1", email: "o@t.fr", name: "O" } } as never);
    await next();
  });
  app.route("/", router);
  return app.request(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

beforeEach(() => {
  resetHarness();
  harness.actor = { ...ownerActor };
  harness.plans = [{ id: PLAN_ID, code: "standard", isActive: true, monthlyPriceXof: 5000, annualPriceXof: 50000 }];
  harness.subs = [{ id: "sub-1", agencyId: "org-1", status: "active", plan: "monthly", planId: "plan-1" }];
  harness.updateReturning = [];
  harness.insertReturning = [];
});

describe("agency billing isolation (§7)", () => {
  test("a request from another agency is 404, not 403", async () => {
    harness.requests = [{ id: "11111111-1111-4111-8111-111111111111", agencyId: "org-other", status: "pending" }];
    const response = await call("/billing/requests/11111111-1111-4111-8111-111111111111");
    expect(response.status).toBe(404);
    // And the query itself was scoped to the acting agency server-side —
    // the boundary is enforced in the API, not just the UI.
    expect(scopedToAgency("org-1")).toBe(true);
  });

  test("a tenant-role user cannot list billing requests", async () => {
    harness.actor = { ...ownerActor, role: "tenant" };
    const response = await call("/billing/requests");
    expect(response.status).toBe(403);
  });
});

describe("payment notification (§5, §9)", () => {
  const requestId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    harness.requests = [{
      id: requestId,
      agencyId: "org-1",
      subscriptionId: "sub-1",
      status: "pending",
      method: "wave",
      reference: "NAYA-2026-ABCDEF",
      expectedAmountXof: 5000,
    }];
    harness.updateReturning = [{ ...harness.requests[0], status: "notified" }];
  });

  test("notify moves pending → notified and never touches the subscription", async () => {
    const response = await call(`/billing/requests/${requestId}/notify`, {
      method: "POST",
      body: JSON.stringify({ method: "wave", claimedRef: "WAVE-123" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("notified");
    // Only the request row was updated — the subscription period is untouched
    // until an admin confirms (§9: notification is not proof of payment).
    expect(harness.recordedUpdates).toHaveLength(1);
    expect(harness.recordedUpdates[0]!.values).toMatchObject({ status: "notified" });
  });

  test("notifying twice is rejected", async () => {
    harness.requests = [{ ...harness.requests[0], status: "notified" }];
    const response = await call(`/billing/requests/${requestId}/notify`, {
      method: "POST",
      body: JSON.stringify({ method: "wave" }),
    });
    expect(response.status).toBe(409);
  });

  test("a future payment date is rejected", async () => {
    const response = await call(`/billing/requests/${requestId}/notify`, {
      method: "POST",
      body: JSON.stringify({ claimedPaidAt: new Date(Date.now() + 3600_000).toISOString() }),
    });
    expect(response.status).toBe(400);
  });
});

describe("server-side pricing (§9)", () => {
  test("an inactive plan cannot be used", async () => {
    harness.plans = [{ id: PLAN_ID, code: "standard", isActive: false, monthlyPriceXof: 5000, annualPriceXof: 50000 }];
    const response = await call("/billing/requests", {
      method: "POST",
      body: JSON.stringify({ planId: PLAN_ID, billingInterval: "monthly", method: "wave" }),
    });
    expect(response.status).toBe(400);
  });

  test("paying requires prior policy acceptance (403)", async () => {
    harness.policyRows = [];
    const response = await call("/billing/requests", {
      method: "POST",
      body: JSON.stringify({ planId: PLAN_ID, billingInterval: "monthly", method: "wave" }),
    });
    expect(response.status).toBe(403);
    expect(harness.recordedInserts).toHaveLength(0);
  });
});

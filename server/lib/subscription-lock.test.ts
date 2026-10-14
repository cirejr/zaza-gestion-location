import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { harness, mockAuthContext, mockDb, resetHarness } from "@/server/test-utils/mock-harness";

/**
 * Lock-middleware tests: the single server-side enforcement point mounted
 * in `server/app.ts` on the operational paths (buildings, leases, …).
 * Expired agencies get 402 on reads AND writes; billing/account/admin/
 * notification/upload/portal paths are mounted without it by construction.
 */

mock.module("@/db", mockDb);
mock.module("@/server/lib/auth-context", mockAuthContext);

const expiredSub = {
  id: "s", agencyId: "org-1", status: "past_due",
  currentPeriodEnd: new Date("2026-09-01T00:00:00Z"), trialEndsAt: null,
  graceUntil: new Date("2026-09-08T00:00:00Z"),
};
const activeSub = {
  id: "s", agencyId: "org-1", status: "active",
  currentPeriodEnd: new Date("2026-11-13T00:00:00Z"), trialEndsAt: null, graceUntil: null,
};

async function callLocked() {
  const { subscriptionLockMiddleware } = await import("./subscription-access");
  const app = new Hono();
  app.use(subscriptionLockMiddleware);
  app.get("/buildings", (c) => c.json({ data: [] }));
  app.post("/buildings", (c) => c.json({ data: {} }, 201));
  const getResponse = await app.request("/buildings");
  const postResponse = await app.request("/buildings", { method: "POST" });
  return { getResponse, postResponse };
}

beforeEach(() => {
  resetHarness();
  harness.actor = { id: "user-1", organizationId: "org-1", role: "owner", email: "o@t.fr", name: "O" };
});

describe("subscriptionLockMiddleware", () => {
  test("an expired agency is blocked on reads and writes (402)", async () => {
    harness.subs = [{ ...expiredSub }];
    const { getResponse, postResponse } = await callLocked();
    expect(getResponse.status).toBe(402);
    expect(postResponse.status).toBe(402);
  });

  test("an agency with no subscription at all is blocked (402)", async () => {
    harness.subs = [];
    const { getResponse } = await callLocked();
    expect(getResponse.status).toBe(402);
  });

  test("an active agency passes through", async () => {
    harness.subs = [{ ...activeSub }];
    const { getResponse, postResponse } = await callLocked();
    expect(getResponse.status).toBe(200);
    expect(postResponse.status).toBe(201);
  });

  test("an agency inside its grace period passes through", async () => {
    harness.subs = [{
      ...expiredSub,
      status: "past_due",
      currentPeriodEnd: new Date("2026-10-10T00:00:00Z"),
      graceUntil: new Date("2026-10-17T00:00:00Z"),
    }];
    const { getResponse } = await callLocked();
    expect(getResponse.status).toBe(200);
  });
});

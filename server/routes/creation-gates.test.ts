import { beforeEach, describe, expect, mock, test } from "bun:test";
import { harness, mockAuthContext, mockDb, resetHarness } from "@/server/test-utils/mock-harness";

/**
 * Creation-gate wiring tests: leases, prospects, tenants and apartments
 * creation are premium writes. With an unpaid agency every one of them
 * answers 402 *before* touching the database, so the client can greet the
 * user with the subscription page. (The allow-path is covered in
 * `buildings.test.ts`; the guard matrix in `subscription-access.test.ts`.)
 */

mock.module("@/server/lib/auth-context", mockAuthContext);
mock.module("@/db", mockDb);

const expiredSub = {
  id: "s", agencyId: "org-1", status: "past_due",
  currentPeriodEnd: new Date("2026-09-01T00:00:00Z"), trialEndsAt: null,
  graceUntil: new Date("2026-09-08T00:00:00Z"),
};

async function post(path: string, routerPath: string, body: unknown = {}) {
  const { default: router } = await import(routerPath);
  return router.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetHarness();
  harness.actor = { id: "user-1", organizationId: "org-1", role: "owner", email: "o@t.fr", name: "O" };
  harness.subs = [{ ...expiredSub }];
});

describe("creation gates for unpaid agencies", () => {
  test("POST /leases → 402, nothing created", async () => {
    const response = await post("/leases", "./leases");
    expect(response.status).toBe(402);
    expect(harness.recordedInserts).toHaveLength(0);
  });

  test("POST /prospects → 402, nothing created", async () => {
    const response = await post("/prospects", "./prospects");
    expect(response.status).toBe(402);
    expect(harness.recordedInserts).toHaveLength(0);
  });

  test("POST /tenants → 402, nothing created", async () => {
    const response = await post("/tenants", "./tenants");
    expect(response.status).toBe(402);
    expect(harness.recordedInserts).toHaveLength(0);
  });

  test("POST /buildings/:id/apartments → 402, nothing created", async () => {
    const response = await post(
      "/buildings/11111111-1111-4111-8111-111111111111/apartments",
      "./apartments",
    );
    expect(response.status).toBe(402);
    expect(harness.recordedInserts).toHaveLength(0);
  });
});

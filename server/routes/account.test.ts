import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { BILLING_POLICY_VERSION } from "@/lib/billing-policy";
import { harness, mockAuthContext, mockDb, resetHarness, scopedToAgency } from "@/server/test-utils/mock-harness";

/**
 * Account-surface tests (always open, even during a lock): policy
 * acceptance audit, agency-scoped export, closure requests.
 */

mock.module("@/db", mockDb);
mock.module("@/server/lib/auth-context", mockAuthContext);

const ownerActor = { id: "user-1", organizationId: "org-1", role: "owner", email: "o@t.fr", name: "O" };
const fakeSession = { user: { id: "auth-1", email: "o@t.fr", name: "O" }, session: { id: "sess-1" } };

async function callAccount(path: string, init?: RequestInit, withSession = false) {
  const { default: router } = await import("./account");
  if (!withSession) {
    return router.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  }
  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session" as never, fakeSession as never);
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
  harness.updateReturning = [];
  harness.insertReturning = [];
});

describe("POST /account/policy", () => {
  test("stamps version + timestamp for audit", async () => {
    harness.updateReturning = [{ version: BILLING_POLICY_VERSION, acceptedAt: new Date().toISOString() }];
    const response = await callAccount(
      "/account/policy",
      { method: "POST", body: JSON.stringify({ version: BILLING_POLICY_VERSION }) },
      true,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.version).toBe(BILLING_POLICY_VERSION);
    expect(harness.recordedUpdates.some((u: any) => u.table === "user")).toBe(true);
  });

  test("rejects an unknown policy version", async () => {
    const response = await callAccount(
      "/account/policy",
      { method: "POST", body: JSON.stringify({ version: "1999-01-01" }) },
      true,
    );
    expect(response.status).toBe(400);
  });

  test("requires a session", async () => {
    const response = await callAccount("/account/policy", {
      method: "POST",
      body: JSON.stringify({ version: BILLING_POLICY_VERSION }),
    });
    expect(response.status).toBe(401);
  });
});

describe("GET /account/export", () => {
  test("returns the agency dataset, scoped server-side, with no subscription needed", async () => {
    // No subscription row at all: export must still work during a lock.
    harness.subs = [];
    const response = await callAccount("/account/export");
    expect(response.status).toBe(200);
    const body = await response.json();
    for (const key of ["exportedAt", "organization", "buildings", "tenants", "leases", "prospects", "members"]) {
      expect(body.data).toHaveProperty(key);
    }
    expect(scopedToAgency("org-1")).toBe(true);
  });
});

describe("POST /account/closure", () => {
  test("an owner can file a closure request (audited, single open max)", async () => {
    harness.closures = [];
    harness.insertReturning = [{ id: "cl-1", status: "open" }];
    const response = await callAccount("/account/closure", {
      method: "POST",
      body: JSON.stringify({ reason: "Fermeture de l’agence" }),
    });
    expect(response.status).toBe(201);
  });

  test("a second open request is rejected", async () => {
    harness.closures = [{ id: "cl-1", agencyId: "org-1", status: "open" }];
    const response = await callAccount("/account/closure", {
      method: "POST",
      body: JSON.stringify({ reason: "Encore" }),
    });
    expect(response.status).toBe(409);
  });

  test("a manager cannot file one", async () => {
    harness.actor = { ...ownerActor, role: "manager" };
    const response = await callAccount("/account/closure", {
      method: "POST",
      body: JSON.stringify({ reason: "Test" }),
    });
    expect(response.status).toBe(403);
  });
});

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { HTTPException } from "hono/http-exception";

/**
 * Route tests for `PATCH /organization` with the database and auth layers
 * mocked. The repo has no DB/HTTP test harness, so the four modules the route
 * touches are stubbed here:
 *
 * - `@/db` (getDb): a fake query builder. `select()` resolves to the
 *   configurable `slugSelectResult` (the slug-clash pre-check); `update()`
 *   records the profile payload into `updates` / `lastProfileUpdate`.
 * - `@/server/lib/auth-context`: `requireActor` returns the configurable
 *   `currentActor`; `requireRole` enforces the real owner-only rule.
 * - `@/server/lib/organization`: no-op profile ensure; `getOrganizationDetail`
 *   echoes the last profile write so tests can observe persistence.
 * - `@/lib/auth`: records Better Auth `updateOrganization` calls.
 *
 * The router itself, zod validation (`parseBody`) and the HTTP layer (Hono)
 * are real, so status codes and body validation are exercised end to end.
 */

let currentActor: any = null;
let slugSelectResult: Array<{ id: string }> = [];
let updates: Array<Record<string, unknown>> = [];
let lastProfileUpdate: Record<string, any> = {};
let authCalls: Array<unknown> = [];

mock.module("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => slugSelectResult,
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push(values);
          lastProfileUpdate = { ...lastProfileUpdate, ...values };
          return [];
        },
      }),
    }),
  }),
}));

mock.module("@/server/lib/auth-context", () => ({
  requireActor: async () => currentActor,
  requireRole: (actor: { role: string }, roles: string[]) => {
    if (!roles.includes(actor.role)) {
      throw new HTTPException(403, { message: "Vous n’avez pas les droits nécessaires pour cette action." });
    }
  },
}));

mock.module("@/server/lib/organization", () => ({
  ensureOrganizationProfile: async () => {},
  getOrganizationDetail: async (organizationId: string) => ({
    id: organizationId,
    name: "Agence Test",
    slug: "agence-test",
    logo: null,
    onboardedAt:
      lastProfileUpdate.onboardedAt instanceof Date ? lastProfileUpdate.onboardedAt.toISOString() : null,
    contactEmail: null,
    contactPhone: null,
    address: null,
    city: null,
    country: "Sénégal",
    website: null,
    description: null,
    legalName: null,
    registrationNumber: null,
    taxId: null,
    defaultManagementFeeBasis: lastProfileUpdate.defaultManagementFeeBasis ?? null,
    defaultFeePercent: lastProfileUpdate.defaultFeePercent ?? null,
    defaultFeeAmount: lastProfileUpdate.defaultFeeAmount ?? null,
  }),
}));

mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      updateOrganization: async (args: unknown) => {
        authCalls.push(args);
        return {};
      },
    },
  },
}));

const ownerActor = {
  id: "owner-1",
  organizationId: "org-1",
  role: "owner",
  email: "owner@test.fr",
  name: "Owner",
};

const managerActor = { ...ownerActor, id: "manager-1", role: "manager", email: "manager@test.fr" };

async function patchOrganization(body: unknown) {
  const { default: router } = await import("./organization");
  return router.request("/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  currentActor = { ...ownerActor };
  slugSelectResult = [];
  updates = [];
  lastProfileUpdate = {};
  authCalls = [];
});

describe("PATCH /organization", () => {
  test("a manager gets 403 and nothing is written", async () => {
    currentActor = { ...managerActor };
    const response = await patchOrganization({ name: "Hack" });
    expect(response.status).toBe(403);
    expect(authCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  test("a slug taken by another agency gets 409 without touching auth or profile", async () => {
    slugSelectResult = [{ id: "other-org" }];
    const response = await patchOrganization({ slug: "taken-slug" });
    expect(response.status).toBe(409);
    expect(authCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  test("onboarded:true persists onboardedAt and returns it with the owner role", async () => {
    const response = await patchOrganization({ onboarded: true });
    expect(response.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.onboardedAt).toBeInstanceOf(Date);
    const body = await response.json();
    expect(body.data.role).toBe("owner");
    expect(typeof body.data.onboardedAt).toBe("string");
  });

  test("agency fee defaults are stored as strings and skip Better Auth", async () => {
    const response = await patchOrganization({
      defaultManagementFeeBasis: "percent_collected",
      defaultFeePercent: 25,
      defaultFeeAmount: 5000,
    });
    expect(response.status).toBe(200);
    // Identity fields were untouched, so the Better Auth plugin is not called.
    expect(authCalls).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.defaultManagementFeeBasis).toBe("percent_collected");
    expect(updates[0]!.defaultFeePercent).toBe("25");
    expect(updates[0]!.defaultFeeAmount).toBe("5000");
  });
});

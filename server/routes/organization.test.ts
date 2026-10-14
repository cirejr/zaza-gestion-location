import { beforeEach, describe, expect, mock, test } from "bun:test";
import { harness, mockAuthContext, mockDb, resetHarness } from "@/server/test-utils/mock-harness";

/**
 * Route tests for `PATCH /organization` with the database and auth layers
 * mocked. The `@/db` and auth-context mocks are shared process-globally from
 * `server/test-utils/mock-harness` (see its header for why); the
 * organization-plugin and `@/lib/auth` stubs stay local because no other
 * test file touches those modules.
 *
 * The router itself, zod validation (`parseBody`) and the HTTP layer (Hono)
 * are real, so status codes and body validation are exercised end to end.
 */

let authCalls: Array<unknown> = [];

mock.module("@/db", mockDb);
mock.module("@/server/lib/auth-context", mockAuthContext);

function lastProfileUpdate(): Record<string, any> {
  return Object.assign({}, ...harness.recordedUpdates.map((u) => u.values));
}

mock.module("@/server/lib/organization", () => ({
  ensureOrganizationProfile: async () => {},
  getOrganizationSummary: async () => null,
  needsOnboarding: () => false,
  // Union surface: mock.module is process-global, so leases/prospects
  // routes (tested in creation-gates.test.ts) need this export to exist.
  // Their tests 402 before reaching it.
  loadAgencyBranding: async () => ({}),
  getOrganizationDetail: async (organizationId: string) => {
    const written = lastProfileUpdate();
    return {
      id: organizationId,
      name: "Agence Test",
      slug: "agence-test",
      logo: null,
      onboardedAt:
        written.onboardedAt instanceof Date ? written.onboardedAt.toISOString() : null,
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
      defaultManagementFeeBasis: written.defaultManagementFeeBasis ?? null,
      defaultFeePercent: written.defaultFeePercent ?? null,
      defaultFeeAmount: written.defaultFeeAmount ?? null,
    };
  },
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
  // Union surface (process-global mock): tenant-auth and uploads import
  // these pure helpers; tested routes 401/402 before reaching them.
  PORTAL_EMAIL_DOMAIN: "portal.naya.app",
  isPortalEmail: (email: string | null | undefined) =>
    Boolean(email?.toLowerCase().endsWith("@portal.naya.app")),
  isPortalSession: (session: any) => !session?.user,
  isStaffSession: (session: any) => Boolean(session?.user?.email),
  createAuth: () => {
    throw new Error("auth not available in tests");
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
  resetHarness();
  harness.actor = { ...ownerActor };
  authCalls = [];
});

describe("PATCH /organization", () => {
  test("a manager gets 403 and nothing is written", async () => {
    harness.actor = { ...managerActor };
    const response = await patchOrganization({ name: "Hack" });
    expect(response.status).toBe(403);
    expect(authCalls).toHaveLength(0);
    expect(harness.recordedUpdates).toHaveLength(0);
  });

  test("a slug taken by another agency gets 409 without touching auth or profile", async () => {
    harness.selectQueue = [[{ id: "other-org" }]];
    const response = await patchOrganization({ slug: "taken-slug" });
    expect(response.status).toBe(409);
    expect(authCalls).toHaveLength(0);
    expect(harness.recordedUpdates).toHaveLength(0);
  });

  test("onboarded:true persists onboardedAt and returns it with the owner role", async () => {
    const response = await patchOrganization({ onboarded: true });
    expect(response.status).toBe(200);
    expect(harness.recordedUpdates).toHaveLength(1);
    expect((harness.recordedUpdates[0]!.values as any).onboardedAt).toBeInstanceOf(Date);
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
    expect(harness.recordedUpdates).toHaveLength(1);
    expect((harness.recordedUpdates[0]!.values as any).defaultManagementFeeBasis).toBe("percent_collected");
    expect((harness.recordedUpdates[0]!.values as any).defaultFeePercent).toBe("25");
    expect((harness.recordedUpdates[0]!.values as any).defaultFeeAmount).toBe("5000");
  });
});

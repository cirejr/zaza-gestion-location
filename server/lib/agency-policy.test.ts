import { describe, expect, test } from "bun:test";
import { assertAgencyActorAllowed } from "@/server/lib/agency-policy";

/**
 * Pure-admin agency bootstrap guard: platform admins without an agency
 * footprint must be rejected (403) instead of being onboarded into a
 * throwaway agency. Dual accounts (admin + agency member/owner) pass.
 * Pure predicate — no DB, no process-global mocks involved.
 */

function statusOf(input: { authRole?: string | null; hasDomainUser: boolean; hasMembership: boolean }) {
  try {
    assertAgencyActorAllowed({ authRole: input.authRole ?? null, hasDomainUser: input.hasDomainUser, hasMembership: input.hasMembership });
    return 200;
  } catch (error: any) {
    return error.status ?? 0;
  }
}

describe("assertAgencyActorAllowed", () => {
  test("a pure platform admin (no footprint) is rejected with 403", () => {
    expect(statusOf({ authRole: "admin", hasDomainUser: false, hasMembership: false })).toBe(403);
  });

  test("an admin who owns agency data (dual account) passes", () => {
    expect(statusOf({ authRole: "admin", hasDomainUser: true, hasMembership: false })).toBe(200);
  });

  test("an admin invited to an agency (membership only) passes", () => {
    expect(statusOf({ authRole: "admin", hasDomainUser: false, hasMembership: true })).toBe(200);
  });

  test("ordinary users always pass (agency flow unchanged)", () => {
    expect(statusOf({ authRole: "user", hasDomainUser: false, hasMembership: false })).toBe(200);
    expect(statusOf({ authRole: null, hasDomainUser: false, hasMembership: false })).toBe(200);
  });
});

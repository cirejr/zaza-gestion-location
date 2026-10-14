import { afterEach, describe, expect, test } from "bun:test";
import { platformAdminEmails, shouldAutoPromote } from "@/lib/auth";

/**
 * Default-admin allowlist: pure parsing/matching rules. The DB promotion
 * itself (`ensureWhitelistedAdmin`) runs inside Better Auth hooks and is
 * covered by design, not unit tests: parsing is what's worth pinning.
 */

const previous = process.env.PLATFORM_ADMIN_EMAILS;

afterEach(() => {
  if (previous === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  else process.env.PLATFORM_ADMIN_EMAILS = previous;
});

describe("platformAdminEmails", () => {
  test("empty when unconfigured", () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(platformAdminEmails().size).toBe(0);
  });

  test("parses comma-separated addresses, trimmed and lowercased", () => {
    process.env.PLATFORM_ADMIN_EMAILS = " Boss@Naya.app ,ops@example.com,,";
    expect(platformAdminEmails()).toEqual(new Set(["boss@naya.app", "ops@example.com"]));
  });
});

describe("shouldAutoPromote", () => {
  test("whitelisted address promotes, anything else does not", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "boss@naya.app";
    expect(shouldAutoPromote("boss@naya.app")).toBe(true);
    expect(shouldAutoPromote("BOSS@naya.app")).toBe(true);
    expect(shouldAutoPromote("someone@else.fr")).toBe(false);
    expect(shouldAutoPromote(null)).toBe(false);
  });

  test("portal identities never promote, even if listed", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "778889900@portal.naya.app";
    expect(shouldAutoPromote("778889900@portal.naya.app")).toBe(false);
  });

  test("nothing promotes when unconfigured", () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(shouldAutoPromote("boss@naya.app")).toBe(false);
  });
});

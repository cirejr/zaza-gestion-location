import { describe, expect, test } from "bun:test";
import { computeManagementFee, lastPeriods, pickEffectiveArrangement, resolveManagementFeeConfig } from "./accounting";

describe("computeManagementFee", () => {
  test("percent_collected applies the rate to collected rent", () => {
    expect(computeManagementFee("percent_collected", "10.00", null, { collected: 100_000, billed: 200_000 })).toBe(10_000);
  });

  test("percent_due applies the rate to billed rent", () => {
    expect(computeManagementFee("percent_due", "5", null, { collected: 0, billed: 200_000 })).toBe(10_000);
  });

  test("fixed ignores the totals", () => {
    expect(computeManagementFee("fixed", null, "25000", { collected: 1, billed: 2 })).toBe(25_000);
  });

  test("percent_collected_plus_fixed combines both", () => {
    expect(computeManagementFee("percent_collected_plus_fixed", "10", "5000", { collected: 100_000, billed: 0 })).toBe(15_000);
  });

  test("missing figures default to zero", () => {
    expect(computeManagementFee("percent_collected", null, null, { collected: 1000, billed: 0 })).toBe(0);
    expect(computeManagementFee("fixed", null, null, { collected: 0, billed: 0 })).toBe(0);
  });

  test("an unknown basis earns nothing rather than guessing", () => {
    expect(computeManagementFee("something_else", "10", "5000", { collected: 100_000, billed: 100_000 })).toBe(0);
  });
});

describe("lastPeriods", () => {
  test("returns months oldest first across a year boundary", () => {
    expect(lastPeriods("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  test("handles a December anchor", () => {
    expect(lastPeriods("2025-12", 3)).toEqual(["2025-10", "2025-11", "2025-12"]);
  });
});

describe("pickEffectiveArrangement", () => {
  const start = new Date("2026-03-01T00:00:00Z");
  const end = new Date("2026-03-31T23:59:59Z");

  test("picks the arrangement covering the period", () => {
    const rows = [{ startDate: "2026-01-01", endDate: "2026-06-30" }];
    expect(pickEffectiveArrangement(rows, start, end)).toBe(rows[0]);
  });

  test("ignores arrangements that end before the period", () => {
    expect(pickEffectiveArrangement([{ startDate: "2025-01-01", endDate: "2025-12-31" }], start, end)).toBeUndefined();
  });

  test("treats an open-ended arrangement as still in force", () => {
    const open = { startDate: "2026-01-01", endDate: null as string | null };
    expect(pickEffectiveArrangement([open], start, end)).toBe(open);
  });

  test("the most recently started overlapping arrangement wins", () => {
    const older = { startDate: "2026-01-01", endDate: "2026-12-31" };
    const newer = { startDate: "2026-02-01", endDate: "2026-12-31" };
    expect(pickEffectiveArrangement([older, newer], start, end)).toBe(newer);
  });
});

describe("resolveManagementFeeConfig", () => {
  test("prefers the building arrangement over the agency default", () => {
    const effective = { basis: "fixed", feeAmount: "10000" };
    expect(resolveManagementFeeConfig(effective, { basis: "percent_collected", feePercent: "8" })).toBe(effective);
  });

  test("falls back to the agency default when the building has none", () => {
    const fallback = { basis: "percent_collected", feePercent: "8" };
    expect(resolveManagementFeeConfig(undefined, fallback)).toBe(fallback);
  });

  test("returns null when neither is configured", () => {
    expect(resolveManagementFeeConfig(undefined, null)).toBeNull();
    expect(resolveManagementFeeConfig(undefined, { basis: "" })).toBeNull();
  });
});

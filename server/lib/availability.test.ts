import { describe, expect, test } from "bun:test";
import { leaseBlocks, rangesConflict, rangesOverlap } from "./availability";

describe("rangesOverlap", () => {
  test("ranges touching at one endpoint overlap", () => {
    expect(rangesOverlap("2026-01-01", "2026-01-31", "2026-01-31", "2026-02-28")).toBe(true);
  });

  test("a range contained in another overlaps", () => {
    expect(rangesOverlap("2026-03-10", "2026-03-12", "2026-03-01", "2026-03-31")).toBe(true);
  });

  test("disjoint ranges do not overlap", () => {
    expect(rangesOverlap("2026-01-01", "2026-01-31", "2026-03-01", "2026-03-31")).toBe(false);
  });
});

describe("rangesConflict", () => {
  const range = (startDate: string, endDate: string | null) => ({ startDate, endDate });

  test("an open-ended range conflicts with anything starting later", () => {
    expect(rangesConflict(range("2026-01-01", null), range("2030-01-01", "2030-12-31"))).toBe(true);
  });

  test("a closed range ending before another starts does not conflict", () => {
    expect(rangesConflict(range("2026-01-01", "2026-06-30"), range("2026-07-01", "2026-12-31"))).toBe(false);
  });

  test("overlapping closed ranges conflict", () => {
    expect(rangesConflict(range("2026-01-01", "2026-06-30"), range("2026-06-30", "2026-12-31"))).toBe(true);
  });

  test("a closed range ending before an open-ended one starts does not conflict", () => {
    expect(rangesConflict(range("2026-01-01", "2026-06-30"), range("2026-07-01", null))).toBe(false);
  });
});

describe("leaseBlocks", () => {
  const lease = (over: Partial<{ status: string; endDate: string | null; moveOutConfirmed: boolean | null }>) => ({
    status: "active",
    endDate: "2026-06-30",
    moveOutConfirmed: false,
    ...over,
  });

  test("expired and terminated leases never block", () => {
    expect(leaseBlocks(lease({ status: "expired" }), "2026-07-01")).toBe(false);
    expect(leaseBlocks(lease({ status: "terminated" }), "2026-07-01")).toBe(false);
  });

  test("an open-ended tenancy always blocks", () => {
    expect(leaseBlocks(lease({ endDate: null }), "2030-01-01")).toBe(true);
  });

  test("a start date before the lease end blocks", () => {
    expect(leaseBlocks(lease({ endDate: "2026-06-30", moveOutConfirmed: true }), "2026-05-01")).toBe(true);
  });

  test("a start date after a confirmed move-out does not block", () => {
    expect(leaseBlocks(lease({ endDate: "2026-06-30", moveOutConfirmed: true }), "2026-07-01")).toBe(false);
  });

  test("a passed lease without a confirmed move-out still blocks", () => {
    expect(leaseBlocks(lease({ endDate: "2026-06-30", moveOutConfirmed: false }), "2026-07-01")).toBe(true);
  });
});

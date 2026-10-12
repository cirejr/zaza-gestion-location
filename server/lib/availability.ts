/**
 * Pure availability rules shared by the matching and conversion flows. Kept
 * independent of the database so the date-range logic is unit-tested.
 */

/** Whether two inclusive `YYYY-MM-DD` ranges overlap. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

/** Sentinel upper bound so an open-ended range (`endDate: null`) reads as infinite. */
const OPEN_END = "9999-12-31";

/**
 * Conflict test for rental allocations (leases, confirmed reservations) that may
 * be open-ended. Unlike `rangesOverlap` it accepts a `null` end date, meaning
 * "no known end", which overlaps every later range — the same convention as
 * `leaseBlocks`, so a unit can never be double-booked through a missing date.
 */
export function rangesConflict(
  left: { startDate: string; endDate: string | null },
  right: { startDate: string; endDate: string | null },
): boolean {
  return rangesOverlap(left.startDate, left.endDate ?? OPEN_END, right.startDate, right.endDate ?? OPEN_END);
}

export type LeaseBlock = {
  status: string;
  endDate: string | null;
  moveOutConfirmed: boolean | null;
};

/**
 * A lease blocks a start date when the apartment is still expected to be
 * occupied: it is active (expired/terminated leases do not block), its end date
 * is missing (open-ended tenancy), it overlaps the start date, or it has passed
 * but the tenant's move-out was never confirmed.
 */
export function leaseBlocks(lease: LeaseBlock, startDate: string): boolean {
  if (lease.status === "expired" || lease.status === "terminated") return false;
  if (lease.endDate == null) return true;
  if (startDate < lease.endDate) return true;
  if (!lease.moveOutConfirmed) return true;
  return false;
}

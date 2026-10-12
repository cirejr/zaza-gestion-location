/**
 * Pure accounting helpers, kept free of database access so the calculation
 * rules can be unit-tested. These are the single source of truth for how the
 * agency fee and the overview trend window are computed.
 */

export type ManagementFeeBasis =
  | "percent_collected"
  | "percent_due"
  | "fixed"
  | "percent_collected_plus_fixed";

/**
 * The agency's management fee for a period, following the arrangement's basis.
 * Unknown bases earn nothing rather than guessing.
 */
export function computeManagementFee(
  basis: string,
  feePercent: string | number | null | undefined,
  feeAmount: string | number | null | undefined,
  totals: { collected: number; billed: number },
): number {
  const percent = Number(feePercent ?? 0) / 100;
  const fixed = Number(feeAmount ?? 0);
  switch (basis) {
    case "percent_collected":
      return totals.collected * percent;
    case "percent_due":
      return totals.billed * percent;
    case "fixed":
      return fixed;
    case "percent_collected_plus_fixed":
      return totals.collected * percent + fixed;
    default:
      return 0;
  }
}

export type ManagementFeeConfig = {
  basis: string;
  feePercent?: string | number | null;
  feeAmount?: string | number | null;
};

/**
 * The arrangement in force over `[start, end]`, or `undefined` when the
 * building has none. When several overlap the most recently started one wins,
 * which mirrors how a new agreement supersedes the previous one.
 */
export function pickEffectiveArrangement<T extends { startDate: string; endDate: string | null }>(
  rows: T[],
  start: Date,
  end: Date,
): T | undefined {
  return rows
    .filter((row) => new Date(row.startDate) <= end && (!row.endDate || new Date(row.endDate) >= start))
    .sort((left, right) => (left.startDate < right.startDate ? 1 : -1))[0];
}

/**
 * The fee figures actually billed for a period: the building's own arrangement
 * when one is in force, otherwise the agency-level default, otherwise nothing.
 */
export function resolveManagementFeeConfig<T extends ManagementFeeConfig>(
  effective: T | undefined,
  defaults: ManagementFeeConfig | null | undefined,
): ManagementFeeConfig | null {
  if (effective) return effective;
  if (defaults?.basis) return defaults;
  return null;
}

/** The `count` most recent `YYYY-MM` periods ending at `period` (oldest first). */
export function lastPeriods(period: string, count: number): string[] {
  const [yearText, monthText] = period.split("-");
  let year = Number(yearText);
  let month = Number(monthText);
  const result: string[] = [];
  for (let index = 0; index < count; index += 1) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return result.reverse();
}

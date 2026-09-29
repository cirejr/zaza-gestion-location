import { z } from "zod";

export const commonChargeInputSchema = z.object({
  totalAmount: z.number().int().positive(),
  period: z.string().min(1),
  buildingId: z.string().uuid(),
  apartmentIds: z.array(z.string().uuid()).min(1),
});

export type CommonChargeInput = z.infer<typeof commonChargeInputSchema>;
export type UtilityAllocation = {
  apartmentId: string;
  amount: number;
};

/**
 * Split a charge in the smallest currency unit (FCFA) and assign the rounding
 * remainder to the first units. This keeps 100% of the invoice allocated even
 * when the amount cannot be divided evenly.
 */
export function splitCommonCharge(totalAmount: number, apartmentIds: string[]): UtilityAllocation[] {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new Error("totalAmount must be a positive integer amount in FCFA.");
  }
  if (apartmentIds.length === 0) {
    throw new Error("At least one apartment is required.");
  }

  const base = Math.floor(totalAmount / apartmentIds.length);
  let remainder = totalAmount - base * apartmentIds.length;

  return apartmentIds.map((apartmentId) => {
    const amount = base + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
    return { apartmentId, amount };
  });
}

export function splitTotal(allocation: UtilityAllocation[]): number {
  return allocation.reduce((total, item) => total + item.amount, 0);
}

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apartments, financialTransactions, leases, type Payment } from "@/db/schema";

/** `YYYY-MM` for a date, in UTC — ledger periods are calendar months. */
export function monthOf(value: Date | string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.valueOf())) return new Date().toISOString().slice(0, 7);
  return date.toISOString().slice(0, 7);
}

/**
 * Mirror a confirmed rent payment into the single ledger, idempotently.
 *
 * The unique index on `paymentId` makes a provider callback delivered twice (or
 * a double confirmation) a no-op, so rent is never counted twice. The receiving
 * account is copied from the payment when known and left null otherwise — the
 * ledger never fabricates an account balance.
 */
export async function mirrorRentPayment(
  payment: Pick<Payment, "id" | "amount" | "period" | "leaseId" | "paidAt" | "transactionRef" | "accountId">,
  options: { accountId?: string | null } = {},
) {
  const db = getDb();
  const [existing] = await db
    .select({ id: financialTransactions.id })
    .from(financialTransactions)
    .where(eq(financialTransactions.paymentId, payment.id))
    .limit(1);
  if (existing) return existing;

  const [lease] = await db.select().from(leases).where(eq(leases.id, payment.leaseId)).limit(1);
  if (!lease) return null;
  const [apartment] = await db.select().from(apartments).where(eq(apartments.id, lease.apartmentId)).limit(1);

  const [row] = await db
    .insert(financialTransactions)
    .values({
      buildingId: apartment?.buildingId ?? null,
      apartmentId: lease.apartmentId,
      leaseId: lease.id,
      tenantId: lease.tenantId,
      accountId: options.accountId ?? payment.accountId ?? null,
      kind: "rent",
      flow: "in",
      amount: String(payment.amount),
      period: payment.period ?? monthOf(payment.paidAt),
      postedAt: payment.paidAt ?? new Date(),
      category: "rent",
      description: "Loyer encaissé",
      reference: payment.transactionRef ?? null,
      paymentId: payment.id,
      status: "posted",
    })
    .onConflictDoNothing({ target: financialTransactions.paymentId })
    .returning();
  return row ?? null;
}

/**
 * Best-effort wrapper for webhook/manual confirmation paths: the payment must
 * still be recorded even if the ledger mirror hiccups, and the tenant
 * notification flow must not turn a mirror error into a 500.
 */
export async function mirrorRentPaymentSafe(
  payment: Pick<Payment, "id" | "amount" | "period" | "leaseId" | "paidAt" | "transactionRef" | "accountId">,
) {
  try {
    await mirrorRentPayment(payment);
  } catch (error) {
    console.error("Ledger rent mirror failed", error);
  }
}

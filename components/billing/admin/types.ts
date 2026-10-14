export type RequestRow = {
  request: {
    id: string;
    agencyId: string;
    reference: string;
    billingInterval: string;
    expectedAmountXof: number;
    method: string;
    status: string;
    claimedRef: string | null;
    claimedPaidAt: string | null;
    note: string | null;
    receiptUrl: string | null;
    actualAmountXof: number | null;
    createdAt: string;
  };
  agencyName: string | null;
};

export type RequestDetail = {
  request: RequestRow["request"];
  agency: { id: string; name: string; profile: { contactEmail: string | null; contactPhone: string | null } | null } | null;
  history: Array<{ id: string; kind: string; payload: unknown; createdAt: string }>;
  previous: Array<{ id: string; reference: string; status: string; expectedAmountXof: number; decidedAt: string | null }>;
};

export type SubscriptionRow = {
  subscription: {
    id: string;
    agencyId: string;
    plan: string;
    amount: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    suspendReason: string | null;
    updatedAt: string;
  };
  agencyName: string | null;
};

export type SubscriptionDetail = {
  subscription: SubscriptionRow["subscription"];
  agency: { id: string; name: string; profile: { contactEmail: string | null; contactPhone: string | null } | null } | null;
  plan: { name: string } | null;
  history: Array<{ id: string; kind: string; payload: unknown; createdAt: string }>;
  paymentRecords: Array<{ id: string; reference: string; status: string; expectedAmountXof: number; actualAmountXof: number | null; createdAt: string }>;
};

export type PlanRow = { id: string; code: string; name: string; monthlyPriceXof: number; annualPriceXof: number; isActive: boolean };
export type InstructionRow = { id: string; method: string; displayName: string | null; phoneNumber: string | null; instructions: string | null; isActive: boolean };

export type ClosureRow = {
  closure: { id: string; agencyId: string; reason: string; status: string; createdAt: string };
  agencyName: string | null;
};

export const REQUEST_STATUSES = ["pending", "notified", "confirmed", "rejected", "cancelled"];
export const METHODS = ["wave", "orange_money", "mtn_momo", "mobile_money", "cash"];
export const SUBSCRIPTION_STATUSES = ["trialing", "pending_payment", "active", "past_due", "suspended", "cancelled", "expired"];

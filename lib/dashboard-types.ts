export type ApiList<T> = { data: T[]; pagination?: { page?: number; limit?: number; total: number } };
export type ApiUser = { id: string; name: string; email: string; role: "owner" | "manager" | "tenant"; phone?: string | null };
export type ApiBuilding = { id: string; name: string; address: string; city?: string | null; country?: string; unitCount: number; photoUrls?: string[]; createdAt?: string };
export type ApiApartment = { id: string; buildingId: string; unitNumber: string; floor?: number | null; bedrooms: number; areaSqm?: number | null; rentAmount: string; status: "occupied" | "vacant" | "maintenance" };
/** Building with its apartments embedded — returned by `/api/buildings/overview`. */
export type ApiBuildingOverview = ApiBuilding & { apartments: ApiApartment[] };
export type ApiTenant = { id: string; fullName: string; phone: string; whatsappNumber?: string | null; identityDocUrl?: string | null };
export type ApiLease = { id: string; apartmentId: string; tenantId: string; startDate: string; endDate?: string | null; rentAmount: string; depositAmount: string; status: string; contractUrl?: string | null };
export type ApiPayment = { id: string; leaseId: string; amount: string; paymentMethod: string; transactionRef?: string | null; status: string; paidAt?: string | null; receiptUrl?: string | null; createdAt: string };
export type ApiUtility = { id: string; buildingId: string; type: string; supplier?: string | null; totalAmount: string; period: string; splitStatus: string; invoiceUrl?: string | null; createdAt: string };
export type ApiTicket = { id: string; buildingId: string; apartmentId?: string | null; title: string; description: string; cost?: string | null; status: string; priority: string; createdAt: string };
export type ApiReport = { period: string; collected: number; charges: number; net: number; paymentCount: number; utilityCount: number; unitCount: number; occupied: number; occupancyRate: number };
export type PaymentSummary = { collected: number; paidCount: number; total: number; receiptCount: number };
export type TicketSummary = { pending: number; inProgress: number; resolved: number };
export type TenantOverviewRow = ApiTenant & { lease: LeaseRow | null };
export type TenantOverviewResponse = {
  data: TenantOverviewRow[];
  pagination?: { page?: number; limit?: number; total: number };
  summary: { activeLeases: number; otherLeases: number; whatsappTenants: number };
};
export type UtilitiesOverviewResponse = {
  data: { buildings: ApiBuilding[]; invoices: Array<{ utility: ApiUtility; building: ApiBuilding }> };
  pagination?: { page?: number; limit?: number; total: number };
};
export type PaymentRow = { payment: ApiPayment; apartment: { id: string; unitNumber: string }; building: { id: string; name: string }; tenant: { id: string; fullName: string; phone?: string | null; whatsappNumber?: string | null } };
export type LeaseRow = { lease: ApiLease; apartment: ApiApartment; building: ApiBuilding; tenant: ApiTenant };
export type TicketRow = { ticket: ApiTicket; building: ApiBuilding; apartment?: ApiApartment | null };
export type UtilityRow = ApiUtility & { building?: ApiBuilding | null };
export type PortalUtilityNote = { id: string; type: string; period: string; amount: string; unitNumber: string; sentAt?: string | null };
export type PortalMe = {
  data: {
    tenant: ApiTenant & { userId?: string | null };
    building: Pick<ApiBuilding, "id" | "name" | "city"> | null;
    apartment: ApiApartment | null;
    lease: ApiLease | null;
    pendingPayments: ApiPayment[];
    paymentHistory: ApiPayment[];
    utilityNotes: PortalUtilityNote[];
    stats: { totalDue: number; paidCount: number; paidTotal: number };
  };
};

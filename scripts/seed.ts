/**
 * Seed a coherent demo dataset for the Prospects & Lettings and Accounting &
 * Financial Management modules.
 *
 * Two isolated agencies are created so owner/manager scoping can be exercised:
 *
 *   1. `juniorcireba@gmail.com` (the pre-existing account) owns two buildings;
 *      `gestionnaire@naya.test` manages them. Rent, expenses, utilities,
 *      maintenance, prospects, statements and settlements all live here.
 *   2. `proprietaire@naya.test` owns a single "Villa Ngor" with its own tenant,
 *      lease, payment, account, expense and prospect. Nothing from agency 1 is
 *      visible to it, and vice versa.
 *
 * Idempotent by construction: every row is keyed by a deterministic UUID, so a
 * re-run deletes exactly the rows it created (never `juniorcireba@gmail.com`,
 * never unrelated data) and rebuilds them.
 *
 *   bun --env-file=.env.local scripts/seed.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auth } from "@/lib/auth";
import { splitCommonCharge } from "@/lib/utility-split";
import { mirrorRentPayment } from "@/server/lib/ledger";
import { computeStatement } from "@/server/routes/accounts";
import {
  apartments,
  authUsers,
  buildings,
  claims,
  commonUtilities,
  financialAccountReconciliations,
  financialAccounts,
  financialTransactions,
  leases,
  maintenanceTickets,
  managementArrangements,
  notifications,
  organizationMembers,
  organizationProfiles,
  organizations,
  ownerStatementLines,
  ownerSettlements,
  ownerStatements,
  payments,
  prospectActivities,
  prospectReservations,
  prospects,
  prospectVisits,
  subscriptions,
  tenants,
  users,
  utilitySplits,
} from "@/db/schema";

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Naya2026!";
const CONTACT_EMAIL = "juniorcireba@gmail.com";
const MANAGER_EMAIL = "gestionnaire@naya.test";
const AGENCY2_EMAIL = "proprietaire@naya.test";
const STAFF_EMAILS = [MANAGER_EMAIL, AGENCY2_EMAIL];

/** Deterministic UUID: the same key always yields the same id. */
function sid(key: string) {
  const hex = createHash("sha256").update(`naya-seed:v1:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// --- Time helpers (periods/dates are relative to "now") ---------------------

const now = new Date();
const TODAY = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

function isoPeriod(date: Date) {
  return date.toISOString().slice(0, 7);
}
function shiftMonth(period: string, delta: number) {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return isoPeriod(new Date(Date.UTC(year, month - 1 + delta, 1)));
}
function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}
function ds(days: number) {
  return ymd(new Date(TODAY.getTime() + days * 86_400_000));
}

const pNow = isoPeriod(TODAY);
const pPrev = shiftMonth(pNow, -1);
const pPrev2 = shiftMonth(pNow, -2);

// --- Stable ids -------------------------------------------------------------

const ID = {
  bAl: sid("building:almadies"),
  bSc: sid("building:sacrecoeur"),
  bNg: sid("building:villa-ngor"),

  aA101: sid("apt:almadies:A101"),
  aA102: sid("apt:almadies:A102"),
  aA201: sid("apt:almadies:A201"),
  aA202: sid("apt:almadies:A202"),
  aA301: sid("apt:almadies:A301"),
  aA302: sid("apt:almadies:A302"),
  aS1: sid("apt:sacrecoeur:S1"),
  aS2: sid("apt:sacrecoeur:S2"),
  aS3: sid("apt:sacrecoeur:S3"),
  aS4: sid("apt:sacrecoeur:S4"),
  aN1: sid("apt:ngor:N1"),
  aN2: sid("apt:ngor:N2"),

  t1: sid("tenant:fatou-ba"),
  t2: sid("tenant:ousmane-sow"),
  t3: sid("tenant:aida-diallo"),
  t4: sid("tenant:ibrahima-ndiaye"),
  t5: sid("tenant:mariama-sarr"),
  t6: sid("tenant:bineta-faye"),
  t7: sid("tenant:souleymane-diop"),
  t8: sid("tenant:ndeye-fall"),

  l1: sid("lease:a101-fatou"),
  l2: sid("lease:a102-ousmane"),
  l3: sid("lease:a201-aida"),
  l4: sid("lease:s1-ibrahima"),
  l5: sid("lease:s2-mariama"),
  l6: sid("lease:a202-bineta"),
  l7: sid("lease:s3-souleymane"),
  l8: sid("lease:n1-ndeye"),

  p1: sid("prospect:aminata-cisse"),
  p2: sid("prospect:cheikh-ba"),
  p3: sid("prospect:nafissatou-gueye"),
  p4: sid("prospect:modou-diagne"),
  p5: sid("prospect:khady-sy"),
  p6: sid("prospect:lamine-thiam"),
  p7: sid("prospect:bineta-faye"),
  p8: sid("prospect:alioune-badara"),

  acCash: sid("account:caisse-agence"),
  acWave: sid("account:wave-agence"),
  acBAl: sid("account:almadies"),
  acBSc: sid("account:sacrecoeur"),
  acNg: sid("account:ngor"),

  stB1p2: sid("statement:almadies:prev2"),
  stB1p1: sid("statement:almadies:prev"),
  stB2p1: sid("statement:sacrecoeur:prev"),
  seB1p2: sid("settlement:almadies:prev2"),
  seB2p1: sid("settlement:sacrecoeur:prev"),

  uW1: sid("utility:almadies:water"),
  uE1: sid("utility:almadies:elec"),
  uS2: sid("utility:sacrecoeur:security"),

  tk1: sid("ticket:almadies:m1"),
  tk2: sid("ticket:almadies:m2"),
  tk3: sid("ticket:almadies:m3"),
  tk4: sid("ticket:sacrecoeur:m1"),

  cl1: sid("claim:fatou"),
  cl2: sid("claim:ousmane"),

  arrB1: sid("arrangement:almadies"),
  arrB2: sid("arrangement:sacrecoeur"),
  arrB3: sid("arrangement:villa-ngor"),

  nt1: sid("notification:rent-received"),
  nt2: sid("notification:arrears"),
  nt3: sid("notification:urgent-ticket"),
  nt4: sid("notification:statement-ready"),

  sub1: sid("subscription:agency"),
  // Agency 2's organization shares its owner's user id, matching the
  // `0013` backfill convention (organization.id = owner user id).
  orgAgency2: sid("user:proprietaire@naya.test"),
  rc1: sid("reconciliation:caisse"),
  rc2: sid("reconciliation:almadies"),
};

const GROUPS = {
  buildings: [ID.bAl, ID.bSc, ID.bNg],
  apartments: [ID.aA101, ID.aA102, ID.aA201, ID.aA202, ID.aA301, ID.aA302, ID.aS1, ID.aS2, ID.aS3, ID.aS4, ID.aN1, ID.aN2],
  tenants: [ID.t1, ID.t2, ID.t3, ID.t4, ID.t5, ID.t6, ID.t7, ID.t8],
  leases: [ID.l1, ID.l2, ID.l3, ID.l4, ID.l5, ID.l6, ID.l7, ID.l8],
  prospects: [ID.p1, ID.p2, ID.p3, ID.p4, ID.p5, ID.p6, ID.p7, ID.p8],
  accounts: [ID.acCash, ID.acWave, ID.acBAl, ID.acBSc, ID.acNg],
  statements: [ID.stB1p2, ID.stB1p1, ID.stB2p1],
  settlements: [ID.seB1p2, ID.seB2p1],
  utilities: [ID.uW1, ID.uE1, ID.uS2],
  tickets: [ID.tk1, ID.tk2, ID.tk3, ID.tk4],
  claims: [ID.cl1, ID.cl2],
  arrangements: [ID.arrB1, ID.arrB2, ID.arrB3],
  notifications: [ID.nt1, ID.nt2, ID.nt3, ID.nt4],
  subscriptions: [ID.sub1],
  reconciliations: [ID.rc1, ID.rc2],
  organizations: [ID.orgAgency2],
};

// --- Reset ------------------------------------------------------------------

/**
 * Delete only the rows this seed owns, in FK-safe order. Never touches the
 * contact account or any unrelated row: every filter is either a deterministic
 * id, or a row reachable from one (rent mirrors, ledger movements, splits).
 */
async function resetSeed() {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(prospectReservations).where(inArray(prospectReservations.prospectId, GROUPS.prospects));
    await tx.delete(prospectVisits).where(inArray(prospectVisits.prospectId, GROUPS.prospects));
    await tx.delete(prospectActivities).where(inArray(prospectActivities.prospectId, GROUPS.prospects));
    await tx.delete(prospects).where(inArray(prospects.id, GROUPS.prospects));

    await tx.delete(notifications).where(inArray(notifications.id, GROUPS.notifications));
    await tx.delete(subscriptions).where(inArray(subscriptions.id, GROUPS.subscriptions));
    await tx.delete(claims).where(inArray(claims.id, GROUPS.claims));
    await tx.delete(maintenanceTickets).where(inArray(maintenanceTickets.id, GROUPS.tickets));

    await tx.delete(utilitySplits).where(inArray(utilitySplits.utilityId, GROUPS.utilities));
    await tx.delete(commonUtilities).where(inArray(commonUtilities.id, GROUPS.utilities));

    await tx.delete(ownerStatementLines).where(inArray(ownerStatementLines.statementId, GROUPS.statements));
    await tx.delete(ownerSettlements).where(inArray(ownerSettlements.id, GROUPS.settlements));
    await tx.delete(ownerStatements).where(inArray(ownerStatements.id, GROUPS.statements));

    await tx
      .delete(financialAccountReconciliations)
      .where(inArray(financialAccountReconciliations.accountId, GROUPS.accounts));

    await tx
      .delete(financialTransactions)
      .where(
        or(
          inArray(financialTransactions.buildingId, GROUPS.buildings),
          inArray(financialTransactions.accountId, GROUPS.accounts),
          inArray(financialTransactions.leaseId, GROUPS.leases),
          inArray(financialTransactions.settlementId, GROUPS.settlements),
        ),
      );

    await tx.delete(managementArrangements).where(inArray(managementArrangements.id, GROUPS.arrangements));
    await tx.delete(payments).where(inArray(payments.leaseId, GROUPS.leases));
    await tx.delete(leases).where(inArray(leases.id, GROUPS.leases));
    await tx.delete(apartments).where(inArray(apartments.id, GROUPS.apartments));
    await tx.delete(financialAccounts).where(inArray(financialAccounts.id, GROUPS.accounts));
    await tx.delete(buildings).where(inArray(buildings.id, GROUPS.buildings));
    await tx.delete(tenants).where(inArray(tenants.id, GROUPS.tenants));

      await tx.delete(users).where(inArray(users.email, STAFF_EMAILS));
    await tx.delete(authUsers).where(inArray(authUsers.email, STAFF_EMAILS));
    // Only the agencies this seed created (agency 2). The contact owner's agency
    // predates the seed and is never touched. The profile cascades with its
    // agency, but deleting it explicitly keeps the intent obvious.
    await tx.delete(organizationProfiles).where(inArray(organizationProfiles.organizationId, GROUPS.organizations));
    await tx.delete(organizations).where(inArray(organizations.id, GROUPS.organizations));
  });
}

// --- Identity ---------------------------------------------------------------

/** URL-safe, unique agency slug (short id suffix guarantees uniqueness). */
function seedSlug(name: string, id: string) {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "agence";
  return `${base}-${id.replace(/-/g, "").slice(0, 8)}`;
}

/** Idempotently create an agency (Better Auth organization) and its profile. */
async function ensureOrganization(id: string, name: string) {
  const db = getDb();
  await db
    .insert(organizations)
    .values({ id, name, slug: seedSlug(name, id) })
    .onConflictDoNothing({ target: organizations.id });
  // Seeded agencies are already configured, so the onboarding wizard never runs
  // for the demo dataset.
  await db
    .insert(organizationProfiles)
    .values({ organizationId: id, onboardedAt: new Date() })
    .onConflictDoNothing({ target: organizationProfiles.organizationId });
}

/** Idempotently add a Better Auth user to an agency with a role. */
async function ensureMembership(organizationId: string, authUserId: string, role: "owner" | "member") {
  const db = getDb();
  const [existing] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, authUserId)))
    .limit(1);
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(organizationMembers).values({ id, organizationId, userId: authUserId, role });
  return id;
}

async function authUserIdFor(email: string) {
  const [row] = await getDb().select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email)).limit(1);
  return row?.id ?? null;
}

async function ensureDomainUser(
  email: string,
  name: string,
  role: "owner" | "manager",
  phone: string | undefined,
  organizationId: string,
) {
  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db.update(users).set({ organizationId }).where(eq(users.id, existing.id));
    return existing.id;
  }
  const id = sid(`user:${email}`);
  await db.insert(users).values({ id, name, email, role, phone: phone ?? null, organizationId });
  return id;
}

/**
 * Create the Better Auth email/password identity first (it owns password
 * hashing), then the application `users` row scoping reads. Both share the
 * email, which is what `requireActor` joins on. The agency membership makes the
 * user visible to the organization-scoped queries.
 */
async function createStaff(
  email: string,
  name: string,
  role: "owner" | "manager",
  phone: string,
  organizationId: string,
) {
  await auth.api.signUpEmail({ body: { email, password: SEED_PASSWORD, name } });
  const authUserId = await authUserIdFor(email);
  if (!authUserId) throw new Error(`Identité Better Auth introuvable après inscription : ${email}`);
  const userId = await ensureDomainUser(email, name, role, phone, organizationId);
  await ensureMembership(organizationId, authUserId, role === "owner" ? "owner" : "member");
  return userId;
}

// --- Accounting helpers -----------------------------------------------------

async function createStatement(options: {
  id: string;
  buildingId: string;
  period: string;
  actorId: string;
  finalize?: boolean;
}) {
  const db = getDb();
  const computed = await computeStatement(options.buildingId, options.period);
  await db.insert(ownerStatements).values({
    id: options.id,
    buildingId: options.buildingId,
    period: options.period,
    rentBilled: String(computed.rentBilled),
    rentCollected: String(computed.rentCollected),
    otherIncome: String(computed.otherIncome),
    expensesOwner: String(computed.expensesOwner),
    expensesAgency: String(computed.expensesAgency),
    managementFee: String(computed.managementFee),
    netPayable: String(computed.netPayable),
    remitted: "0",
    remaining: String(computed.netPayable),
    basis: computed.basis,
    status: options.finalize ? "finalized" : "draft",
    finalizedAt: options.finalize ? new Date() : null,
    createdById: options.actorId,
  });
  await db.insert(ownerStatementLines).values(
    computed.lines.map((line) => ({
      statementId: options.id,
      lineType: line.lineType,
      label: line.label,
      amount: String(line.amount),
      sortOrder: line.sortOrder,
    })),
  );
  return computed;
}

async function createSettlement(options: {
  id: string;
  buildingId: string;
  period: string;
  statementId: string;
  netPayable: number;
  amount: number;
  recipientName: string;
  recipientPhone: string | null;
  paidAtIso: string;
  accountId: string;
  actorId: string;
}) {
  const db = getDb();
  const paidAt = new Date(`${options.paidAtIso}T10:00:00.000Z`);
  await db.insert(ownerSettlements).values({
    id: options.id,
    buildingId: options.buildingId,
    period: options.period,
    statementId: options.statementId,
    recipientName: options.recipientName,
    recipientPhone: options.recipientPhone,
    amount: String(options.amount),
    paidAt,
    accountId: options.accountId,
    reference: `VERS-${options.period}`,
    createdById: options.actorId,
  });
  await db.insert(financialTransactions).values({
    buildingId: options.buildingId,
    accountId: options.accountId,
    kind: "settlement",
    flow: "out",
    amount: String(options.amount),
    period: options.period,
    postedAt: paidAt,
    category: "owner_settlement",
    description: `Versement au propriétaire — ${options.period}`,
    settlementId: options.id,
    createdById: options.actorId,
  });
  await db
    .update(ownerStatements)
    .set({
      remitted: String(options.amount),
      remaining: String(options.netPayable - options.amount),
      updatedAt: new Date(),
    })
    .where(eq(ownerStatements.id, options.statementId));
}

// --- Agency 1 ---------------------------------------------------------------

async function seedAgencyOne(organizationId: string, ownerId: string, managerId: string) {
  const db = getDb();

  await db.insert(buildings).values([
    {
      id: ID.bAl,
      name: "Résidence Les Almadies",
      address: "Route des Almadies, Lot 12",
      city: "Dakar",
      country: "Sénégal",
      unitCount: 6,
      ownerId,
      managerId,
      organizationId,
      ownerKind: "self",
    },
    {
      id: ID.bSc,
      name: "Immeuble Sacré-Cœur 3",
      address: "Rue 12 x Avenue Cheikh Anta Diop",
      city: "Dakar",
      country: "Sénégal",
      unitCount: 4,
      ownerId,
      managerId,
      organizationId,
      ownerKind: "third_party",
      externalOwnerName: "Cheikh Ndiaye",
      externalOwnerPhone: "+221 78 111 22 33",
    },
  ]);

  await db.insert(financialAccounts).values([
    { id: ID.acCash, name: "Caisse agence", type: "cash", holder: "Naya Gestion", openingBalance: "250000", openingDate: ds(-420), createdById: ownerId, organizationId, notes: "Espèces conservées au bureau." },
    { id: ID.acWave, name: "Wave agence", type: "wave", provider: "Wave", holder: "Naya Gestion", maskedReference: "•••• 4521", openingBalance: "600000", openingDate: ds(-420), createdById: ownerId, organizationId },
    { id: ID.acBAl, name: "Compte — Les Almadies", type: "bank", provider: "CBAO", holder: "Naya Gestion", maskedReference: "•••• 7788", openingBalance: "1000000", openingDate: ds(-400), buildingId: ID.bAl, createdById: ownerId, organizationId },
    { id: ID.acBSc, name: "Compte — Sacré-Cœur 3", type: "wave", provider: "Wave", holder: "Naya Gestion", maskedReference: "•••• 1290", openingBalance: "350000", openingDate: ds(-300), buildingId: ID.bSc, createdById: managerId, organizationId },
  ]);

  await db.insert(apartments).values([
    { id: ID.aA101, buildingId: ID.bAl, unitNumber: "A101", floor: 1, bedrooms: 1, areaSqm: 35, rentAmount: "120000", type: "studio", furnished: true, amenities: ["climatisation"], status: "occupied" },
    { id: ID.aA102, buildingId: ID.bAl, unitNumber: "A102", floor: 1, bedrooms: 2, areaSqm: 55, rentAmount: "220000", type: "apartment", furnished: false, amenities: ["climatisation", "parking"], status: "occupied" },
    { id: ID.aA201, buildingId: ID.bAl, unitNumber: "A201", floor: 2, bedrooms: 3, areaSqm: 80, rentAmount: "320000", type: "apartment", furnished: false, amenities: ["climatisation", "parking", "balcon"], status: "occupied" },
    { id: ID.aA202, buildingId: ID.bAl, unitNumber: "A202", floor: 2, bedrooms: 1, areaSqm: 32, rentAmount: "130000", type: "studio", furnished: true, amenities: ["climatisation"], status: "vacant" },
    { id: ID.aA301, buildingId: ID.bAl, unitNumber: "A301", floor: 3, bedrooms: 2, areaSqm: 58, rentAmount: "240000", type: "apartment", furnished: false, amenities: ["parking"], status: "vacant" },
    { id: ID.aA302, buildingId: ID.bAl, unitNumber: "A302", floor: 3, bedrooms: 2, areaSqm: 60, rentAmount: "250000", type: "apartment", furnished: true, amenities: ["climatisation", "parking"], status: "maintenance" },
    { id: ID.aS1, buildingId: ID.bSc, unitNumber: "S1", floor: 0, bedrooms: 1, areaSqm: 30, rentAmount: "90000", type: "studio", furnished: false, amenities: [], status: "occupied" },
    { id: ID.aS2, buildingId: ID.bSc, unitNumber: "S2", floor: 1, bedrooms: 2, areaSqm: 50, rentAmount: "180000", type: "apartment", furnished: false, amenities: ["climatisation"], status: "occupied" },
    { id: ID.aS3, buildingId: ID.bSc, unitNumber: "S3", floor: 1, bedrooms: 1, areaSqm: 28, rentAmount: "85000", type: "studio", furnished: true, amenities: [], status: "vacant" },
    { id: ID.aS4, buildingId: ID.bSc, unitNumber: "S4", floor: 2, bedrooms: 2, areaSqm: 52, rentAmount: "190000", type: "apartment", furnished: false, amenities: ["parking"], status: "vacant" },
  ]);

  await db.insert(tenants).values([
    { id: ID.t1, fullName: "Fatou Ba", phone: "+221771234567", whatsappNumber: "+221771234567", createdBy: managerId, organizationId },
    { id: ID.t2, fullName: "Ousmane Sow", phone: "+221782345678", createdBy: managerId, organizationId },
    { id: ID.t3, fullName: "Aïda Diallo", phone: "+221763456789", createdBy: managerId, organizationId },
    { id: ID.t4, fullName: "Ibrahima Ndiaye", phone: "+221774567890", createdBy: ownerId, organizationId },
    { id: ID.t5, fullName: "Mariama Sarr", phone: "+221705678901", createdBy: ownerId, organizationId },
    { id: ID.t6, fullName: "Bineta Faye", phone: "+221786789012", createdBy: ownerId, organizationId },
    { id: ID.t7, fullName: "Souleymane Diop", phone: "+221767890123", createdBy: managerId, organizationId },
  ]);

  await db.insert(leases).values([
    { id: ID.l1, apartmentId: ID.aA101, tenantId: ID.t1, startDate: ds(-430), endDate: ds(120), rentAmount: "120000", depositAmount: "240000", status: "active" },
    { id: ID.l2, apartmentId: ID.aA102, tenantId: ID.t2, startDate: ds(-310), endDate: ds(50), rentAmount: "220000", depositAmount: "440000", status: "active" },
    { id: ID.l3, apartmentId: ID.aA201, tenantId: ID.t3, startDate: ds(-250), endDate: ds(20), moveOutConfirmed: true, rentAmount: "320000", depositAmount: "640000", status: "active" },
    { id: ID.l4, apartmentId: ID.aS1, tenantId: ID.t4, startDate: ds(-180), endDate: null, rentAmount: "90000", depositAmount: "180000", status: "active" },
    { id: ID.l5, apartmentId: ID.aS2, tenantId: ID.t5, startDate: ds(-120), endDate: ds(240), rentAmount: "180000", depositAmount: "360000", status: "active" },
    { id: ID.l6, apartmentId: ID.aA202, tenantId: ID.t6, startDate: ds(20), endDate: ds(380), rentAmount: "130000", depositAmount: "260000", status: "active" },
    { id: ID.l7, apartmentId: ID.aS3, tenantId: ID.t7, startDate: ds(45), endDate: ds(400), rentAmount: "85000", depositAmount: "170000", status: "draft" },
  ]);

  const paymentPlan: Array<{
    leaseId: string;
    amount: string;
    method: "cash" | "wave" | "orange_money" | "bank_transfer";
    status: "paid" | "pending" | "failed";
    period: string;
    accountId: string | null;
  }> = [
    { leaseId: ID.l1, amount: "120000", method: "cash", status: "paid", period: pPrev2, accountId: ID.acCash },
    { leaseId: ID.l1, amount: "120000", method: "wave", status: "paid", period: pPrev, accountId: ID.acWave },
    { leaseId: ID.l1, amount: "120000", method: "bank_transfer", status: "paid", period: pNow, accountId: ID.acBAl },
    { leaseId: ID.l2, amount: "220000", method: "bank_transfer", status: "paid", period: pPrev2, accountId: ID.acBAl },
    { leaseId: ID.l2, amount: "220000", method: "bank_transfer", status: "paid", period: pPrev, accountId: ID.acBAl },
    { leaseId: ID.l2, amount: "220000", method: "wave", status: "pending", period: pNow, accountId: null },
    { leaseId: ID.l3, amount: "320000", method: "cash", status: "paid", period: pPrev2, accountId: ID.acCash },
    { leaseId: ID.l3, amount: "320000", method: "bank_transfer", status: "paid", period: pPrev, accountId: ID.acBAl },
    { leaseId: ID.l3, amount: "320000", method: "orange_money", status: "failed", period: pNow, accountId: null },
    { leaseId: ID.l3, amount: "320000", method: "bank_transfer", status: "paid", period: pNow, accountId: ID.acBAl },
    { leaseId: ID.l4, amount: "90000", method: "cash", status: "paid", period: pPrev2, accountId: ID.acCash },
    { leaseId: ID.l4, amount: "90000", method: "wave", status: "paid", period: pPrev, accountId: ID.acWave },
    { leaseId: ID.l4, amount: "90000", method: "bank_transfer", status: "paid", period: pNow, accountId: ID.acBSc },
    { leaseId: ID.l5, amount: "180000", method: "bank_transfer", status: "paid", period: pPrev2, accountId: ID.acBSc },
    { leaseId: ID.l5, amount: "180000", method: "bank_transfer", status: "paid", period: pPrev, accountId: ID.acBSc },
    { leaseId: ID.l5, amount: "180000", method: "bank_transfer", status: "paid", period: pNow, accountId: ID.acBSc },
  ];

  let index = 0;
  for (const item of paymentPlan) {
    index += 1;
    const [payment] = await db
      .insert(payments)
      .values({
        leaseId: item.leaseId,
        amount: item.amount,
        paymentMethod: item.method,
        status: item.status,
        period: item.period,
        accountId: item.accountId,
        paidAt: item.status === "paid" ? new Date(`${item.period}-05T10:00:00.000Z`) : null,
        transactionRef: `SEED-${item.period}-${index}`,
      })
      .returning();
    if (payment && payment.status === "paid") await mirrorRentPayment(payment);
  }

  await db.insert(financialTransactions).values([
    { buildingId: ID.bAl, accountId: ID.acCash, kind: "deposit", flow: "in", amount: "240000", period: pPrev2, category: "rent_deposit", description: "Dépôt de garantie — A101", reference: "DEP-A101" },
    { buildingId: ID.bAl, accountId: ID.acCash, kind: "expense", flow: "out", amount: "45000", period: pPrev, category: "plumbing", description: "Réparation plomberie A102", supplier: "Plomberie Cheikh", chargeableTo: "owner", postedAt: new Date(`${pPrev}-12T10:00:00.000Z`) },
    { buildingId: ID.bAl, accountId: ID.acWave, kind: "expense", flow: "out", amount: "80000", period: pPrev, category: "works", description: "Peinture cage d'escalier", supplier: "DécorPlus", chargeableTo: "owner", postedAt: new Date(`${pPrev}-19T10:00:00.000Z`) },
    { buildingId: ID.bAl, accountId: ID.acBAl, kind: "expense", flow: "out", amount: "60000", period: pNow, category: "maintenance", description: "Contrat d'entretien de l'ascenseur", supplier: "OTIS", chargeableTo: "owner", postedAt: new Date(`${pNow}-03T10:00:00.000Z`) },
    { buildingId: ID.bAl, accountId: ID.acCash, kind: "income", flow: "in", amount: "15000", period: pPrev, category: "parking", description: "Location place de parking", chargeableTo: "owner", postedAt: new Date(`${pPrev}-08T10:00:00.000Z`) },
    { buildingId: null, accountId: ID.acCash, kind: "expense", flow: "out", amount: "90000", period: pNow, category: "payroll", description: "Prime des agents d'entretien", chargeableTo: "agency", postedAt: new Date(`${pNow}-04T10:00:00.000Z`) },
    { buildingId: ID.bSc, accountId: ID.acBSc, kind: "expense", flow: "out", amount: "120000", period: pPrev, category: "works", description: "Réparation groupe électrogène", supplier: "Sénélec Services", chargeableTo: "owner", postedAt: new Date(`${pPrev}-11T10:00:00.000Z`) },
    { buildingId: ID.bSc, accountId: ID.acBSc, kind: "income", flow: "in", amount: "25000", period: pPrev, category: "fees", description: "Frais d'état des lieux", chargeableTo: "owner", postedAt: new Date(`${pPrev}-06T10:00:00.000Z`) },
    { buildingId: ID.bSc, accountId: ID.acBSc, kind: "expense", flow: "out", amount: "35000", period: pNow, category: "cleaning", description: "Nettoyage des parties communes", supplier: "Propreté Dakar", chargeableTo: "owner", postedAt: new Date(`${pNow}-02T10:00:00.000Z`) },
  ]);

  await db.insert(managementArrangements).values([
    { id: ID.arrB1, buildingId: ID.bAl, startDate: ds(-400), basis: "percent_collected", feePercent: "8", createdById: ownerId },
    { id: ID.arrB2, buildingId: ID.bSc, startDate: ds(-300), basis: "percent_collected", feePercent: "6", createdById: managerId },
  ]);

  await createStatement({ id: ID.stB1p2, buildingId: ID.bAl, period: pPrev2, actorId: managerId, finalize: true });
  await createStatement({ id: ID.stB1p1, buildingId: ID.bAl, period: pPrev, actorId: managerId });
  await createStatement({ id: ID.stB2p1, buildingId: ID.bSc, period: pPrev, actorId: managerId, finalize: true });

  const b1Prev2 = await computeStatement(ID.bAl, pPrev2);
  await createSettlement({
    id: ID.seB1p2,
    buildingId: ID.bAl,
    period: pPrev2,
    statementId: ID.stB1p2,
    netPayable: b1Prev2.netPayable,
    amount: b1Prev2.netPayable,
    recipientName: "Ciré Junior",
    recipientPhone: null,
    paidAtIso: `${pPrev}-18`,
    accountId: ID.acBAl,
    actorId: managerId,
  });

  const b2Prev = await computeStatement(ID.bSc, pPrev);
  await createSettlement({
    id: ID.seB2p1,
    buildingId: ID.bSc,
    period: pPrev,
    statementId: ID.stB2p1,
    netPayable: b2Prev.netPayable,
    amount: Math.floor(b2Prev.netPayable / 2),
    recipientName: "Cheikh Ndiaye",
    recipientPhone: "+221 78 111 22 33",
    paidAtIso: `${pPrev}-22`,
    accountId: ID.acBSc,
    actorId: managerId,
  });

  await db.insert(commonUtilities).values([
    { id: ID.uW1, buildingId: ID.bAl, type: "water", supplier: "SEN'EAU", totalAmount: "120000", period: pPrev, splitStatus: "notified", splitAt: new Date(`${pPrev}-25T10:00:00.000Z`), notifiedAt: new Date(`${pPrev}-26T10:00:00.000Z`) },
    { id: ID.uE1, buildingId: ID.bAl, type: "electricity", supplier: "SENELEC", totalAmount: "90000", period: pNow, splitStatus: "pending" },
    { id: ID.uS2, buildingId: ID.bSc, type: "security", supplier: "AS Sécurité", totalAmount: "60000", period: pPrev, splitStatus: "split", splitAt: new Date(`${pPrev}-27T10:00:00.000Z`) },
  ]);

  await db.insert(utilitySplits).values(
    splitCommonCharge(120000, [ID.aA101, ID.aA102, ID.aA201, ID.aA202, ID.aA301, ID.aA302]).map((split) => ({
      utilityId: ID.uW1,
      apartmentId: split.apartmentId,
      amount: String(split.amount),
      sentAt: new Date(`${pPrev}-26T10:00:00.000Z`),
    })),
  );

  await db.insert(utilitySplits).values(
    splitCommonCharge(60000, [ID.aS1, ID.aS2, ID.aS3, ID.aS4]).map((split) => ({
      utilityId: ID.uS2,
      apartmentId: split.apartmentId,
      amount: String(split.amount),
    })),
  );

  await db.insert(maintenanceTickets).values([
    { id: ID.tk1, buildingId: ID.bAl, apartmentId: ID.aA302, title: "Fuite d'eau sous l'évier", description: "Le siphon fuit et l'eau stagne dans le placard.", category: "reparation", priority: "urgent", status: "in_progress", reportedBy: ownerId, assignedTo: managerId },
    { id: ID.tk2, buildingId: ID.bAl, apartmentId: ID.aA101, title: "Ampoule de la cage d'escalier grillée", description: "Éclairage HS au deuxième étage.", category: "reparation", priority: "low", status: "resolved", cost: "5000", reportedBy: ownerId, assignedTo: managerId, resolvedAt: new Date(`${pPrev}-14T09:00:00.000Z`) },
    { id: ID.tk3, buildingId: ID.bAl, apartmentId: ID.aA201, title: "Peinture qui s'écaille", description: "Le mur du salon s'écaille près de la fenêtre.", category: "degradation", priority: "normal", status: "pending", reportedBy: ownerId },
    { id: ID.tk4, buildingId: ID.bSc, apartmentId: ID.aS1, title: "Chauffe-eau en panne", description: "Plus d'eau chaude depuis deux jours.", category: "reparation", priority: "normal", status: "pending", reportedBy: ownerId },
  ]);

  await db.insert(claims).values([
    { id: ID.cl1, tenantId: ID.t1, apartmentId: ID.aA101, buildingId: ID.bAl, title: "Nuisances sonores", description: "Bruit répété après 23 h.", type: "nuisance", status: "pending" },
    { id: ID.cl2, tenantId: ID.t2, apartmentId: ID.aA102, buildingId: ID.bAl, title: "Facture d'eau élevée", description: "Montant contesté pour le dernier trimestre.", type: "facturation", status: "reviewing", amount: "15000" },
  ]);

  await db.insert(notifications).values([
    { id: ID.nt1, userId: ownerId, type: "payment", title: "Loyer encaissé — Sacré-Cœur 3", body: "Ousmane Sow a réglé une partie du loyer en retard.", href: "/paiements" },
    { id: ID.nt2, userId: ownerId, type: "payment", title: "Loyer en attente — A102", body: "Le loyer du mois en cours n'est pas encore réglé.", href: "/paiements" },
    { id: ID.nt3, userId: managerId, type: "ticket", title: "Ticket urgent — A302", body: "Fuite d'eau sous l'évier à traiter.", href: "/maintenance" },
    { id: ID.nt4, userId: ownerId, type: "statement", title: "Relevé disponible — Les Almadies", body: "Le relevé du mois dernier est prêt à être versé.", href: "/comptabilite" },
  ]);

  await db.insert(subscriptions).values({
    id: ID.sub1,
    agencyId: organizationId,
    plan: "monthly",
    amount: "15000",
    status: "active",
    currentPeriodStart: ds(-20) ? new Date(ds(-20)) : new Date(),
    currentPeriodEnd: new Date(ds(10)),
  });
}

// --- Agency 2 (isolation demo) ---------------------------------------------

async function seedAgencyTwo(organizationId: string, ownerId: string) {
  const db = getDb();

  await db.insert(buildings).values({
    id: ID.bNg,
    name: "Villa Ngor",
    address: "Villa 12, Cité Ngor",
    city: "Dakar",
    country: "Sénégal",
    unitCount: 2,
    ownerId,
    managerId: null,
    organizationId,
    ownerKind: "self",
  });

  await db.insert(financialAccounts).values({
    id: ID.acNg,
    name: "Caisse Villa Ngor",
    type: "cash",
    holder: "Awa Sow",
    openingBalance: "150000",
    openingDate: ds(-200),
    buildingId: ID.bNg,
    createdById: ownerId,
    organizationId,
  });

  await db.insert(apartments).values([
    { id: ID.aN1, buildingId: ID.bNg, unitNumber: "N1", floor: 0, bedrooms: 3, areaSqm: 120, rentAmount: "450000", type: "house", furnished: false, amenities: ["jardin", "parking"], status: "occupied" },
    { id: ID.aN2, buildingId: ID.bNg, unitNumber: "N2", floor: 1, bedrooms: 1, areaSqm: 40, rentAmount: "180000", type: "studio", furnished: true, amenities: [], status: "vacant" },
  ]);

  await db.insert(tenants).values({
    id: ID.t8,
    fullName: "Ndèye Fall",
    phone: "+221778901234",
    whatsappNumber: "+221778901234",
    createdBy: ownerId,
    organizationId,
  });

  await db.insert(leases).values({
    id: ID.l8,
    apartmentId: ID.aN1,
    tenantId: ID.t8,
    startDate: ds(-150),
    endDate: ds(200),
    rentAmount: "450000",
    depositAmount: "900000",
    status: "active",
  });

  const [payment] = await db
    .insert(payments)
    .values({
      leaseId: ID.l8,
      amount: "450000",
      paymentMethod: "cash",
      status: "paid",
      period: pNow,
      accountId: ID.acNg,
      paidAt: new Date(`${pNow}-04T10:00:00.000Z`),
      transactionRef: `SEED-${pNow}-NGOR`,
    })
    .returning();
  if (payment) await mirrorRentPayment(payment);

  await db.insert(managementArrangements).values({
    id: ID.arrB3,
    buildingId: ID.bNg,
    startDate: ds(-150),
    basis: "percent_collected",
    feePercent: "10",
    createdById: ownerId,
  });

  await db.insert(financialTransactions).values({
    buildingId: ID.bNg,
    accountId: ID.acNg,
    kind: "expense",
    flow: "out",
    amount: "75000",
    period: pPrev,
    category: "works",
    description: "Réfection du portail",
    supplier: "Bâti Sénégal",
    chargeableTo: "owner",
    postedAt: new Date(`${pPrev}-15T10:00:00.000Z`),
  });

  await db.insert(prospects).values({
    id: ID.p8,
    fullName: "Alioune Badara",
    phone: "+221779998877",
    preferredContact: "telephone",
    propertyType: "house",
    location: "Dakar — Ngor",
    budgetMin: "300000",
    budgetMax: "500000",
    bedrooms: 3,
    furnished: false,
    amenities: ["parking"],
    status: "new",
    createdBy: ownerId,
    organizationId,
  });
}

// --- Prospects & reservations ----------------------------------------------

async function seedProspects(organizationId: string, ownerId: string, managerId: string) {
  const db = getDb();

  await db.insert(prospects).values([
    { id: ID.p1, fullName: "Aminata Cissé", phone: "+221777001101", whatsappNumber: "+221777001101", preferredContact: "whatsapp", propertyType: "apartment", location: "Dakar — Almadies", budgetMin: "150000", budgetMax: "200000", bedrooms: 2, furnished: false, amenities: ["climatisation", "parking"], status: "new", createdBy: managerId, organizationId },
    { id: ID.p2, fullName: "Cheikh Bâ", phone: "+221777001102", preferredContact: "telephone", propertyType: "apartment", location: "Dakar", budgetMin: "200000", budgetMax: "300000", bedrooms: 3, furnished: false, amenities: ["parking"], status: "contacted", createdBy: managerId, organizationId },
    { id: ID.p3, fullName: "Nafissatou Guèye", phone: "+221777001103", whatsappNumber: "+221777001103", preferredContact: "whatsapp", propertyType: "studio", location: "Dakar — Almadies", budgetMin: "100000", budgetMax: "150000", bedrooms: 1, furnished: true, status: "visit_scheduled", createdBy: managerId, organizationId },
    { id: ID.p4, fullName: "Modou Diagne", phone: "+221777001104", preferredContact: "whatsapp", propertyType: "apartment", location: "Dakar", budgetMin: "200000", budgetMax: "280000", bedrooms: 2, furnished: false, amenities: ["climatisation"], status: "visited", createdBy: ownerId, organizationId },
    { id: ID.p5, fullName: "Khady Sy", phone: "+221777001105", whatsappNumber: "+221777001105", preferredContact: "whatsapp", propertyType: "apartment", location: "Dakar — Almadies", budgetMin: "200000", budgetMax: "260000", bedrooms: 2, furnished: false, status: "negotiation", createdBy: ownerId, organizationId },
    { id: ID.p6, fullName: "Lamine Thiam", phone: "+221777001106", preferredContact: "telephone", propertyType: "apartment", location: "Dakar", budgetMin: "100000", budgetMax: "150000", bedrooms: 2, furnished: false, status: "lost", createdBy: ownerId, organizationId },
    { id: ID.p7, fullName: "Bineta Faye", phone: "+221777001107", whatsappNumber: "+221777001107", preferredContact: "whatsapp", propertyType: "studio", location: "Dakar — Almadies", budgetMin: "100000", budgetMax: "140000", bedrooms: 1, furnished: true, status: "converted", createdBy: ownerId, convertedTenantId: ID.t6, convertedLeaseId: ID.l6, organizationId },
  ]);

  await db.insert(prospectActivities).values([
    { prospectId: ID.p1, kind: "created", actorId: managerId, toStatus: "new", note: "Demande reçue par WhatsApp." },
    { prospectId: ID.p2, kind: "created", actorId: managerId, toStatus: "new" },
    { prospectId: ID.p2, kind: "contact", actorId: managerId, note: "Appel : cherche un 3 chambres avec parking." },
    { prospectId: ID.p2, kind: "status_change", actorId: managerId, fromStatus: "new", toStatus: "contacted" },
    { prospectId: ID.p3, kind: "created", actorId: managerId, toStatus: "new" },
    { prospectId: ID.p3, kind: "contact", actorId: managerId, note: "Préfère être contactée le soir." },
    { prospectId: ID.p3, kind: "visit_scheduled", actorId: managerId, apartmentId: ID.aA202 },
    { prospectId: ID.p4, kind: "created", actorId: ownerId, toStatus: "new" },
    { prospectId: ID.p4, kind: "contact", actorId: ownerId, note: "Visite confirmée pour vendredi." },
    { prospectId: ID.p4, kind: "visit_completed", actorId: ownerId, apartmentId: ID.aA301, note: "Client très intéressé." },
    { prospectId: ID.p5, kind: "created", actorId: ownerId, toStatus: "new" },
    { prospectId: ID.p5, kind: "status_change", actorId: ownerId, fromStatus: "visited", toStatus: "negotiation", note: "Négocie le montant de la caution." },
    { prospectId: ID.p6, kind: "created", actorId: ownerId, toStatus: "new" },
    { prospectId: ID.p6, kind: "status_change", actorId: ownerId, fromStatus: "contacted", toStatus: "lost", note: "Budget insuffisant." },
    { prospectId: ID.p7, kind: "created", actorId: ownerId, toStatus: "new" },
    { prospectId: ID.p7, kind: "status_change", actorId: ownerId, fromStatus: "negotiation", toStatus: "converted", note: "Contrat signé — entrée dans 3 semaines." },
  ]);

  await db.insert(prospectVisits).values([
    { prospectId: ID.p3, apartmentId: ID.aA202, scheduledAt: new Date(`${ymd(new Date(TODAY.getTime() + 3 * 86_400_000))}T17:00:00.000Z`), status: "scheduled", notes: "Visite en soirée.", createdById: managerId },
    { prospectId: ID.p4, apartmentId: ID.aA301, scheduledAt: new Date(`${ymd(new Date(TODAY.getTime() - 5 * 86_400_000))}T11:00:00.000Z`), status: "completed", outcome: "Prospect intéressé", createdById: ownerId },
  ]);

  await db.insert(prospectReservations).values([
    { prospectId: ID.p5, apartmentId: ID.aA301, startDate: ymd(TODAY), endDate: ymd(new Date(TODAY.getTime() + 180 * 86_400_000)), status: "confirmed", notes: "Réservation confirmée, dossier en cours.", createdById: ownerId },
    { prospectId: ID.p2, apartmentId: ID.aS4, startDate: ymd(new Date(TODAY.getTime() + 10 * 86_400_000)), endDate: ymd(new Date(TODAY.getTime() + 100 * 86_400_000)), status: "tentative", createdById: managerId },
  ]);
}

// --- Reconciliations --------------------------------------------------------

async function ledgerMovement(accountId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      inflow: sql<string>`coalesce(sum(case when ${financialTransactions.flow} = 'in' then ${financialTransactions.amount} else 0 end), 0)`,
      outflow: sql<string>`coalesce(sum(case when ${financialTransactions.flow} = 'out' then ${financialTransactions.amount} else 0 end), 0)`,
    })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.status, "posted"), eq(financialTransactions.accountId, accountId)));
  return Number(row?.inflow ?? 0) - Number(row?.outflow ?? 0);
}

async function seedReconciliations(actorId: string) {
  const db = getDb();

  const cashRecorded = 250000 + (await ledgerMovement(ID.acCash));
  const alRecorded = 1000000 + (await ledgerMovement(ID.acBAl));
  const asOf = ymd(TODAY);

  await db.insert(financialAccountReconciliations).values([
    {
      id: ID.rc1,
      accountId: ID.acCash,
      statementBalance: String(cashRecorded - 5000),
      recordedBalance: String(cashRecorded),
      asOf,
      notes: "Écart de caisse à justifier (fonds de roulement).",
      createdById: actorId,
    },
    {
      id: ID.rc2,
      accountId: ID.acBAl,
      statementBalance: String(alRecorded),
      recordedBalance: String(alRecorded),
      asOf,
      notes: "Relevé bancaire CBAO concordant.",
      createdById: actorId,
    },
  ]);
}

// --- Entry point ------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refus : ne pas seeder une base de production (NODE_ENV=production).");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL manquant. Lancez : bun --env-file=.env.local scripts/seed.ts");
    process.exit(1);
  }

  const db = getDb();

  const [contact] = await db.select().from(users).where(eq(users.email, CONTACT_EMAIL)).limit(1);
  if (!contact) {
    throw new Error(`Compte introuvable : ${CONTACT_EMAIL}. Connectez-vous une fois pour le créer, puis relancez.`);
  }

  // The contact owner's agency is created by the organization migration
  // backfill (id = the owner's user id). Reuse it so the seed never spins up a
  // second agency for the same owner.
  const contactOrganizationId = contact.organizationId ?? contact.id;
  await ensureOrganization(contactOrganizationId, `${contact.name} — Agence`);

  console.log("Seed Naya — suppression des lignes précédentes…");
  await resetSeed();

  console.log("Création des identités…");
  // `reset` never removes the owner, but it may remove a stale staff membership;
  // re-assert the owner's row and membership so the seed is self-healing.
  await db.update(users).set({ organizationId: contactOrganizationId }).where(eq(users.id, contact.id));
  const contactAuthUserId = await authUserIdFor(CONTACT_EMAIL);
  if (contactAuthUserId) await ensureMembership(contactOrganizationId, contactAuthUserId, "owner");
  await ensureOrganization(ID.orgAgency2, "Agence Awa Sow");

  const managerId = await createStaff(MANAGER_EMAIL, "Moussa Fall", "manager", "+221775551122", contactOrganizationId);
  const agency2Id = await createStaff(AGENCY2_EMAIL, "Awa Sow", "owner", "+221786660011", ID.orgAgency2);
  const ownerId = contact.id;

  console.log("Agence 1 — immeubles, locataires, baux, paiements…");
  await seedAgencyOne(contactOrganizationId, ownerId, managerId);

  console.log("Agence 1 — prospects et réservations…");
  await seedProspects(contactOrganizationId, ownerId, managerId);

  console.log("Agence 2 — Villa Ngor (isolation)…");
  await seedAgencyTwo(ID.orgAgency2, agency2Id);

  console.log("Rapprochements…");
  await seedReconciliations(ownerId);

  console.log("\nSeed terminé.");
  console.log(`  Contact : ${ownerId} (${CONTACT_EMAIL})`);
  console.log(`  Gestion : ${managerId} (${MANAGER_EMAIL})`);
  console.log(`  Agence 2: ${agency2Id} (${AGENCY2_EMAIL})`);
  console.log(`  Mot de passe équipe : ${SEED_PASSWORD}`);
  console.log("  Locataire fatou : +221771234567 (portail par OTP)");
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed échoué :", error);
  process.exit(1);
});

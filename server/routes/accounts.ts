import { and, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql, sum } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { createReportPdf } from "@/lib/pdf";
import {
  apartments,
  buildings,
  financialAccountReconciliations,
  financialAccounts,
  financialTransactions,
  leases,
  managementArrangements,
  organizationProfiles,
  ownerStatementLines,
  ownerSettlements,
  ownerStatements,
  payments,
  tenants,
  users,
} from "@/db/schema";
import {
  computeManagementFee,
  lastPeriods,
  pickEffectiveArrangement,
  resolveManagementFeeConfig,
  type ManagementFeeConfig,
} from "@/server/lib/accounting";
import { buildingAccessCondition, financialTransactionScope, requireActor, requireRole, type AgencyActor, type DomainUser } from "@/server/lib/auth-context";
import { loadAgencyBranding } from "@/server/lib/organization";
import { countValue, pagination, parseBody, parseUuid } from "@/server/lib/http";
import { monthOf } from "@/server/lib/ledger";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

type SumRow = { total: string | number | null; count?: number | string | null };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Buildings of the actor's agency — the accounting scope. */
function myBuildings(actor: AgencyActor) {
  return getDb().select({ id: buildings.id }).from(buildings).where(buildingAccessCondition(actor));
}

/**
 * An account belongs to exactly one agency. Agency-level accounts have no
 * building but still carry the organization, so they are scoped like any other.
 */
function accountScope(actor: AgencyActor) {
  return eq(financialAccounts.organizationId, actor.organizationId);
}

/**
 * A ledger row is visible through the agency that owns its account (or the
 * counterpart account of a transfer), or the agency that owns its building.
 * Every row the app writes has at least one of the two, so a row can never
 * leak across the agency boundary.
 */
function transactionScope(actor: AgencyActor) {
  return financialTransactionScope(actor);
}

function periodBounds(period: string) {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

function resolvePeriod(value: string | undefined) {
  const period = value ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new HTTPException(400, { message: "La période doit être au format AAAA-MM." });
  return period;
}

async function requireAccountForActor(actor: AgencyActor, accountId: string) {
  const [account] = await getDb()
    .select()
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, accountId), accountScope(actor)))
    .limit(1);
  if (!account) throw new HTTPException(404, { message: "Compte introuvable." });
  return account;
}

async function requireTransactionForActor(actor: AgencyActor, transactionId: string) {
  const [row] = await getDb()
    .select({ transaction: financialTransactions })
    .from(financialTransactions)
    .leftJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
    .where(and(eq(financialTransactions.id, transactionId), transactionScope(actor)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Écriture introuvable." });
  return row.transaction;
}

async function requireScopedBuilding(actor: AgencyActor, buildingId: string) {
  const [building] = await getDb()
    .select()
    .from(buildings)
    .where(and(eq(buildings.id, buildingId), buildingAccessCondition(actor)))
    .limit(1);
  if (!building) throw new HTTPException(404, { message: "Immeuble introuvable." });
  return building;
}

/** Live balance of every account in scope: opening figure plus posted movements. */
export async function accountBalances(actor: AgencyActor, buildingId?: string) {
  const db = getDb();
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(
      buildingId
        ? and(accountScope(actor), eq(financialAccounts.buildingId, buildingId))
        : accountScope(actor),
    )
    .orderBy(desc(financialAccounts.createdAt));

  const movements = await db
    .select({
      accountId: financialTransactions.accountId,
      inflow: sql<string>`coalesce(sum(case when ${financialTransactions.flow} = 'in' then ${financialTransactions.amount} else 0 end), 0)`,
      outflow: sql<string>`coalesce(sum(case when ${financialTransactions.flow} = 'out' then ${financialTransactions.amount} else 0 end), 0)`,
      movementCount: count(),
    })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.status, "posted"), sql`${financialTransactions.accountId} is not null`))
    .groupBy(financialTransactions.accountId);

  const byAccount = new Map(movements.map((row) => [row.accountId, row]));
  return accounts.map((account) => {
    const movement = account.id ? byAccount.get(account.id) : undefined;
    const balance = Number(account.openingBalance) + Number(movement?.inflow ?? 0) - Number(movement?.outflow ?? 0);
    return {
      ...account,
      balance,
      inflow: Number(movement?.inflow ?? 0),
      outflow: Number(movement?.outflow ?? 0),
      movementCount: Number(movement?.movementCount ?? 0),
    };
  });
}

// --- Accounts ---

const accountInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["wave", "orange_money", "mobile_money", "bank", "cash", "other"]),
  provider: nullableText(120),
  holder: nullableText(120),
  maskedReference: nullableText(120),
  openingBalance: z.number().min(0).max(1_000_000_000).optional(),
  openingDate: isoDate.nullable().optional(),
  buildingId: z.string().uuid().nullable().optional(),
  notes: nullableText(2000),
});

const accountPatch = accountInput.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
});

router.get("/accounts", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const buildingId = c.req.query("buildingId");
  let parsedBuilding: string | undefined;
  if (buildingId) {
    parsedBuilding = parseUuid(buildingId, "building id");
    await requireScopedBuilding(actor, parsedBuilding);
  }
  const data = await accountBalances(actor, parsedBuilding);
  const total = data.reduce((accumulator, account) => accumulator + account.balance, 0);
  return c.json({ data, totals: { total } });
});

router.post("/accounts", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, accountInput);
  if (data.buildingId) await requireScopedBuilding(actor, data.buildingId);
  const [account] = await getDb()
    .insert(financialAccounts)
    .values({
      name: data.name,
      type: data.type,
      provider: data.provider ?? null,
      holder: data.holder ?? null,
      maskedReference: data.maskedReference ?? null,
      openingBalance: data.openingBalance == null ? "0" : String(data.openingBalance),
      openingDate: data.openingDate ?? null,
      buildingId: data.buildingId ?? null,
      organizationId: actor.organizationId,
      notes: data.notes ?? null,
      createdById: actor.id,
    })
    .returning();
  if (!account) throw new HTTPException(500, { message: "La création du compte a échoué." });
  return c.json({ data: account }, 201);
});

router.patch("/accounts/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "account id");
  const account = await requireAccountForActor(actor, id);
  const data = await parseBody(c, accountPatch);
  if (data.buildingId !== undefined && data.buildingId) await requireScopedBuilding(actor, data.buildingId);

  // The opening figure may only be corrected while the account has no posted
  // movement — rewriting it afterwards would silently move reported balances.
  if (data.openingBalance !== undefined) {
    const [movement] = await getDb()
      .select({ id: financialTransactions.id })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.accountId, id), eq(financialTransactions.status, "posted")))
      .limit(1);
    if (movement) throw new HTTPException(409, { message: "Le solde d’ouverture ne peut plus être modifié : le compte a des mouvements." });
  }

  const [updated] = await getDb()
    .update(financialAccounts)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.provider !== undefined ? { provider: data.provider ?? null } : {}),
      ...(data.holder !== undefined ? { holder: data.holder ?? null } : {}),
      ...(data.maskedReference !== undefined ? { maskedReference: data.maskedReference ?? null } : {}),
      ...(data.openingBalance !== undefined ? { openingBalance: String(data.openingBalance) } : {}),
      ...(data.openingDate !== undefined ? { openingDate: data.openingDate ?? null } : {}),
      ...(data.buildingId !== undefined ? { buildingId: data.buildingId ?? null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(financialAccounts.id, account.id))
    .returning();
  return c.json({ data: updated });
});

// --- Manual reconciliation against external statements ---

const reconciliationInput = z.object({
  statementBalance: z.number().min(-1_000_000_000).max(1_000_000_000),
  asOf: isoDate,
  notes: nullableText(500),
});

router.get("/accounts/:id/reconciliations", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "account id");
  const account = await requireAccountForActor(actor, id);
  const rows = await getDb()
    .select()
    .from(financialAccountReconciliations)
    .where(eq(financialAccountReconciliations.accountId, id))
    .orderBy(desc(financialAccountReconciliations.asOf));
  const accountBalance = (await accountBalances(actor)).find((entry) => entry.id === id)?.balance ?? 0;
  return c.json({ data: rows, account: { ...account, balance: accountBalance } });
});

router.post("/accounts/:id/reconciliations", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "account id");
  await requireAccountForActor(actor, id);
  const data = await parseBody(c, reconciliationInput);
  const account = (await accountBalances(actor)).find((row) => row.id === id);
  if (!account) throw new HTTPException(404, { message: "Compte introuvable." });
  const [row] = await getDb()
    .insert(financialAccountReconciliations)
    .values({
      accountId: id,
      statementBalance: String(data.statementBalance),
      recordedBalance: String(account.balance),
      asOf: data.asOf,
      notes: data.notes ?? null,
      createdById: actor.id,
    })
    .returning();
  return c.json({ data: row }, 201);
});

router.delete("/accounts/:id/reconciliations/:reconciliationId", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "account id");
  await requireAccountForActor(actor, id);
  const reconciliationId = parseUuid(c.req.param("reconciliationId"), "reconciliation id");
  const [deleted] = await getDb()
    .delete(financialAccountReconciliations)
    .where(and(eq(financialAccountReconciliations.id, reconciliationId), eq(financialAccountReconciliations.accountId, id)))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Rapprochement introuvable." });
  return c.json({ data: deleted });
});

// --- Transfers and manual entries ---

router.post("/accounts/transfer", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(
    c,
    z.object({
      fromAccountId: z.string().uuid(),
      toAccountId: z.string().uuid(),
      amount: z.number().positive().max(1_000_000_000),
      postingDate: isoDate,
      reference: nullableText(180),
      notes: nullableText(500),
    }),
  );
  if (data.fromAccountId === data.toAccountId) throw new HTTPException(400, { message: "Les deux comptes doivent être différents." });
  await requireAccountForActor(actor, data.fromAccountId);
  await requireAccountForActor(actor, data.toAccountId);

  const batchId = crypto.randomUUID();
  const amount = String(data.amount);
  const postedAt = new Date(`${data.postingDate}T00:00:00.000Z`);
  const period = monthOf(data.postingDate);
  const created = await getDb().transaction(async (transaction) => {
    const [out] = await transaction
      .insert(financialTransactions)
      .values({
        accountId: data.fromAccountId,
        counterpartAccountId: data.toAccountId,
        transferBatchId: batchId,
        kind: "transfer",
        flow: "out",
        amount,
        period,
        postedAt,
        description: "Virement interne (sortie)",
        reference: data.reference ?? null,
        createdById: actor.id,
      })
      .returning();
    const [into] = await transaction
      .insert(financialTransactions)
      .values({
        accountId: data.toAccountId,
        counterpartAccountId: data.fromAccountId,
        transferBatchId: batchId,
        kind: "transfer",
        flow: "in",
        amount,
        period,
        postedAt,
        description: "Virement interne (entrée)",
        reference: data.reference ?? null,
        createdById: actor.id,
      })
      .returning();
    return { out, into };
  });
  return c.json({ data: created }, 201);
});

const entryInput = z.object({
  kind: z.enum(["income", "expense", "deposit", "deposit_refund", "adjustment"]),
  flow: z.enum(["in", "out"]).optional(),
  accountId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  postingDate: isoDate,
  period: periodSchema.optional(),
  category: nullableText(64),
  description: nullableText(500),
  reference: nullableText(180),
  supplier: nullableText(180),
  attachmentUrl: nullableText(500),
  buildingId: z.string().uuid().nullable().optional(),
  apartmentId: z.string().uuid().nullable().optional(),
  leaseId: z.string().uuid().nullable().optional(),
  tenantId: z.string().uuid().nullable().optional(),
  chargeableTo: z.enum(["owner", "agency"]).nullable().optional(),
});

router.post("/accounts/entries", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, entryInput);
  await requireAccountForActor(actor, data.accountId);
  if (data.buildingId) await requireScopedBuilding(actor, data.buildingId);
  if (data.apartmentId) {
    const [apartment] = await getDb().select().from(apartments).where(eq(apartments.id, data.apartmentId)).limit(1);
    if (!apartment) throw new HTTPException(404, { message: "Appartement introuvable." });
    await requireScopedBuilding(actor, apartment.buildingId);
  }
  if (data.leaseId) {
    const [lease] = await getDb().select().from(leases).where(eq(leases.id, data.leaseId)).limit(1);
    if (!lease) throw new HTTPException(404, { message: "Bail introuvable." });
    const [apartment] = await getDb().select().from(apartments).where(eq(apartments.id, lease.apartmentId)).limit(1);
    if (apartment) await requireScopedBuilding(actor, apartment.buildingId);
  }
  if (data.tenantId) {
    const [tenant] = await getDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.id, data.tenantId)).limit(1);
    if (!tenant) throw new HTTPException(404, { message: "Locataire introuvable." });
  }

  const inferredFlow = data.flow ?? (data.kind === "expense" || data.kind === "deposit_refund" ? "out" : "in");
  const [entry] = await getDb()
    .insert(financialTransactions)
    .values({
      accountId: data.accountId,
      kind: data.kind,
      flow: inferredFlow,
      amount: String(data.amount),
      period: data.period ?? monthOf(data.postingDate),
      postedAt: new Date(`${data.postingDate}T00:00:00.000Z`),
      category: data.category ?? null,
      description: data.description ?? null,
      reference: data.reference ?? null,
      supplier: data.supplier ?? null,
      attachmentUrl: data.attachmentUrl ?? null,
      buildingId: data.buildingId ?? null,
      apartmentId: data.apartmentId ?? null,
      leaseId: data.leaseId ?? null,
      tenantId: data.tenantId ?? null,
      // Expenses are the agency's by default; the manager attributes them to the
      // owner explicitly so owner statements never silently absorb a cost.
      chargeableTo: data.kind === "expense" ? data.chargeableTo ?? "agency" : data.chargeableTo ?? null,
      createdById: actor.id,
    })
    .returning();
  return c.json({ data: entry }, 201);
});

router.patch("/accounts/transactions/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "transaction id");
  const transactionRow = await requireTransactionForActor(actor, id);
  if (transactionRow.status === "reversed") throw new HTTPException(409, { message: "Cette écriture a été extournée et ne peut plus être modifiée." });
  const data = await parseBody(
    c,
    z.object({
      accountId: z.string().uuid().optional(),
      category: nullableText(64),
      description: nullableText(500),
      reference: nullableText(180),
      supplier: nullableText(180),
      attachmentUrl: nullableText(500),
      chargeableTo: z.enum(["owner", "agency"]).nullable().optional(),
    }),
  );
  if (data.accountId) {
    if (transactionRow.accountId) throw new HTTPException(409, { message: "Ce compte a déjà été renseigné." });
    await requireAccountForActor(actor, data.accountId);
  }
  const [updated] = await getDb()
    .update(financialTransactions)
    .set({
      ...(data.accountId ? { accountId: data.accountId } : {}),
      ...(data.category !== undefined ? { category: data.category ?? null } : {}),
      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.reference !== undefined ? { reference: data.reference ?? null } : {}),
      ...(data.supplier !== undefined ? { supplier: data.supplier ?? null } : {}),
      ...(data.attachmentUrl !== undefined ? { attachmentUrl: data.attachmentUrl ?? null } : {}),
      ...(data.chargeableTo !== undefined ? { chargeableTo: data.chargeableTo ?? null } : {}),
    })
    .where(eq(financialTransactions.id, id))
    .returning();
  return c.json({ data: updated });
});

router.post("/accounts/transactions/:id/reverse", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "transaction id");
  const original = await requireTransactionForActor(actor, id);
  if (original.status === "reversed") throw new HTTPException(409, { message: "Cette écriture a déjà été extournée." });
  if (original.kind === "reversal") throw new HTTPException(400, { message: "Une extourne ne peut pas être extournée." });
  const data = await parseBody(c, z.object({ reason: nullableText(300) }));

  const result = await getDb().transaction(async (transaction) => {
    const [reversal] = await transaction
      .insert(financialTransactions)
      .values({
        buildingId: original.buildingId,
        apartmentId: original.apartmentId,
        leaseId: original.leaseId,
        tenantId: original.tenantId,
        accountId: original.accountId,
        counterpartAccountId: original.counterpartAccountId,
        kind: "reversal",
        flow: original.flow === "in" ? "out" : "in",
        amount: original.amount,
        period: original.period,
        postedAt: new Date(),
        category: original.category,
        description: data.reason ? `Extourne : ${data.reason}` : "Extourne",
        reference: original.reference,
        supplier: original.supplier,
        reversesTransactionId: original.id,
        createdById: actor.id,
      })
      .returning();
    const [updated] = await transaction
      .update(financialTransactions)
      .set({ status: "reversed" })
      .where(eq(financialTransactions.id, original.id))
      .returning();
    return { original: updated, reversal };
  });
  return c.json({ data: result }, 201);
});

// --- Ledger ---

router.get("/accounts/ledger", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const conditions = [transactionScope(actor)];
  const period = c.req.query("period");
  if (period) conditions.push(eq(financialTransactions.period, resolvePeriod(period)));
  const buildingId = c.req.query("buildingId");
  if (buildingId) conditions.push(eq(financialTransactions.buildingId, parseUuid(buildingId, "building id")));
  const accountId = c.req.query("accountId");
  if (accountId) conditions.push(eq(financialTransactions.accountId, parseUuid(accountId, "account id")));
  const kind = c.req.query("kind");
  if (kind && ["rent", "income", "expense", "transfer", "deposit", "deposit_refund", "settlement", "adjustment", "reversal"].includes(kind)) {
    conditions.push(eq(financialTransactions.kind, kind as "rent"));
  }
  const where = and(...conditions);
  const db = getDb();
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        transaction: financialTransactions,
        accountName: financialAccounts.name,
        buildingName: buildings.name,
        unitNumber: apartments.unitNumber,
        tenantName: tenants.fullName,
      })
      .from(financialTransactions)
      .leftJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
      .leftJoin(buildings, eq(financialTransactions.buildingId, buildings.id))
      .leftJoin(apartments, eq(financialTransactions.apartmentId, apartments.id))
      .leftJoin(tenants, eq(financialTransactions.tenantId, tenants.id))
      .where(where)
      .orderBy(desc(financialTransactions.postedAt), desc(financialTransactions.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(financialTransactions).leftJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id)).where(where),
  ]);
  return c.json({
    data: rows.map((row) => ({ ...row.transaction, accountName: row.accountName, buildingName: row.buildingName, unitNumber: row.unitNumber, tenantName: row.tenantName })),
    pagination: { page, limit, total: countValue(totalRows) },
  });
});

// --- Management arrangements ---

const arrangementBases = ["percent_collected", "percent_due", "fixed", "percent_collected_plus_fixed"] as const;

const arrangementInput = z.object({
  buildingId: z.string().uuid(),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  basis: z.enum(arrangementBases),
  feePercent: z.number().min(0).max(100).nullable().optional(),
  feeAmount: z.number().min(0).max(1_000_000_000).nullable().optional(),
});

/** Each fee basis needs its own inputs; reject an arrangement that cannot compute a fee. */
function assertFeeShape(basis: (typeof arrangementBases)[number], feePercent: number | null, feeAmount: number | null) {
  const needsPercent = basis === "percent_collected" || basis === "percent_due" || basis === "percent_collected_plus_fixed";
  const needsFixed = basis === "fixed" || basis === "percent_collected_plus_fixed";
  if (needsPercent && feePercent === null) throw new HTTPException(400, { message: "Le pourcentage de frais est requis pour cette base." });
  if (needsFixed && feeAmount === null) throw new HTTPException(400, { message: "Le montant fixe est requis pour cette base." });
}

/**
 * Two arrangements for the same building overlap when their `[start, end]`
 * intervals intersect, treating a missing `endDate` as open-ended. The comment
 * on the table promises overlaps are rejected, so every write calls this.
 */
function arrangementOverlapWhere(buildingId: string, startDate: string, endDate: string | null, excludeId?: string) {
  const conditions = [
    eq(managementArrangements.buildingId, buildingId),
    endDate === null ? sql`true` : lte(managementArrangements.startDate, endDate),
    or(isNull(managementArrangements.endDate), gte(managementArrangements.endDate, startDate))!,
  ];
  if (excludeId) conditions.push(ne(managementArrangements.id, excludeId));
  return and(...conditions);
}

async function requireArrangementForActor(actor: AgencyActor, arrangementId: string) {
  const [arrangement] = await getDb()
    .select()
    .from(managementArrangements)
    .where(and(eq(managementArrangements.id, arrangementId), inArray(managementArrangements.buildingId, myBuildings(actor))))
    .limit(1);
  if (!arrangement) throw new HTTPException(404, { message: "Mandat de gestion introuvable." });
  return arrangement;
}

router.get("/accounts/arrangements", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const conditions = [inArray(managementArrangements.buildingId, myBuildings(actor))];
  const buildingId = c.req.query("buildingId");
  if (buildingId) {
    const parsed = parseUuid(buildingId, "building id");
    await requireScopedBuilding(actor, parsed);
    conditions.push(eq(managementArrangements.buildingId, parsed));
  }
  const rows = await getDb()
    .select({ arrangement: managementArrangements, buildingName: buildings.name, ownerKind: buildings.ownerKind })
    .from(managementArrangements)
    .innerJoin(buildings, eq(managementArrangements.buildingId, buildings.id))
    .where(and(...conditions))
    .orderBy(desc(managementArrangements.startDate), desc(managementArrangements.createdAt));
  return c.json({ data: rows.map((row) => ({ ...row.arrangement, buildingName: row.buildingName, ownerKind: row.ownerKind })) });
});

router.post("/accounts/arrangements", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, arrangementInput);
  await requireScopedBuilding(actor, data.buildingId);
  const endDate = data.endDate ?? null;
  if (endDate && endDate < data.startDate) throw new HTTPException(400, { message: "La date de fin doit suivre la date de début." });
  const feePercent = data.feePercent ?? null;
  const feeAmount = data.feeAmount ?? null;
  assertFeeShape(data.basis, feePercent, feeAmount);

  const db = getDb();
  const arrangement = await db.transaction(async (transaction) => {
    const conflicts = await transaction
      .select({ id: managementArrangements.id })
      .from(managementArrangements)
      .where(arrangementOverlapWhere(data.buildingId, data.startDate, endDate))
      .limit(1);
    if (conflicts.length > 0) throw new HTTPException(409, { message: "Un mandat de gestion couvre déjà cette période." });
    const [created] = await transaction
      .insert(managementArrangements)
      .values({
        buildingId: data.buildingId,
        startDate: data.startDate,
        endDate,
        basis: data.basis,
        feePercent: feePercent === null ? null : String(feePercent),
        feeAmount: feeAmount === null ? null : String(feeAmount),
        createdById: actor.id,
      })
      .returning();
    return created;
  });
  return c.json({ data: arrangement }, 201);
});

router.patch("/accounts/arrangements/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "arrangement id");
  const existing = await requireArrangementForActor(actor, id);
  const data = await parseBody(c, arrangementInput.partial().omit({ buildingId: true }));
  const startDate = data.startDate ?? existing.startDate;
  const endDate = data.endDate !== undefined ? data.endDate : existing.endDate;
  if (endDate && endDate < startDate) throw new HTTPException(400, { message: "La date de fin doit suivre la date de début." });
  const basis = data.basis ?? existing.basis;
  const feePercent = data.feePercent !== undefined ? data.feePercent : existing.feePercent === null ? null : Number(existing.feePercent);
  const feeAmount = data.feeAmount !== undefined ? data.feeAmount : existing.feeAmount === null ? null : Number(existing.feeAmount);
  assertFeeShape(basis, feePercent, feeAmount);

  const db = getDb();
  const arrangement = await db.transaction(async (transaction) => {
    const conflicts = await transaction
      .select({ id: managementArrangements.id })
      .from(managementArrangements)
      .where(arrangementOverlapWhere(existing.buildingId, startDate, endDate ?? null, id))
      .limit(1);
    if (conflicts.length > 0) throw new HTTPException(409, { message: "Un mandat de gestion couvre déjà cette période." });
    const [updated] = await transaction
      .update(managementArrangements)
      .set({
        startDate,
        endDate: endDate ?? null,
        basis,
        feePercent: feePercent === null ? null : String(feePercent),
        feeAmount: feeAmount === null ? null : String(feeAmount),
        updatedAt: new Date(),
      })
      .where(eq(managementArrangements.id, id))
      .returning();
    return updated;
  });
  return c.json({ data: arrangement });
});

router.delete("/accounts/arrangements/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "arrangement id");
  await requireArrangementForActor(actor, id);
  await getDb().delete(managementArrangements).where(eq(managementArrangements.id, id));
  return c.json({ data: { id } });
});

// --- Financial overview ---

/**
 * The agency's fallback management-fee figures, or `null` when the owner has
 * not configured one. Applied to a building with no arrangement of its own.
 */
async function agencyFeeDefault(organizationId: string): Promise<ManagementFeeConfig | null> {
  const [profile] = await getDb()
    .select({
      basis: organizationProfiles.defaultManagementFeeBasis,
      feePercent: organizationProfiles.defaultFeePercent,
      feeAmount: organizationProfiles.defaultFeeAmount,
    })
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);
  return profile?.basis ? { basis: profile.basis, feePercent: profile.feePercent, feeAmount: profile.feeAmount } : null;
}

/** The fee actually billed for a period: the building's arrangement, else the agency default. */
function resolvedFee(effective: ManagementFeeConfig | undefined, fallback: ManagementFeeConfig | null, totals: { collected: number; billed: number }) {
  const config = resolveManagementFeeConfig(effective, fallback);
  return config ? computeManagementFee(config.basis, config.feePercent, config.feeAmount, totals) : 0;
}

/** Human-readable description of the management fee line on a statement. */
function managementFeeBasisLabel(config: ManagementFeeConfig | null, agencyDefault: boolean): string {
  if (!config) return "Aucun mandat de gestion en vigueur : frais de gestion à 0.";
  const percent = config.feePercent ? ` (${Number(config.feePercent)} %)` : "";
  const amount = config.feeAmount ? ` + ${Number(config.feeAmount).toLocaleString("fr-FR")} FCFA` : "";
  const suffix = agencyDefault ? " — barème par défaut de l’agence." : ".";
  return `Frais de gestion : ${config.basis}${percent}${amount}${suffix}`;
}

type OverviewApartment = {
  apartmentId: string | null;
  unitNumber: string;
  rentBilled: number;
  rentCollected: number;
  expenses: number;
};

type OverviewBuilding = {
  buildingId: string;
  buildingName: string;
  ownerKind: string;
  rentBilled: number;
  rentCollected: number;
  otherIncome: number;
  expensesOwner: number;
  expensesAgency: number;
  managementFee: number;
  ownerPayable: number;
  remitted: number;
  remaining: number;
  apartments: OverviewApartment[];
};

export async function computeOverview(
  actor: AgencyActor,
  period: string,
  buildingId?: string,
  filters: { ownerId?: string; category?: string } = {},
) {
  const db = getDb();
  const { start, end } = periodBounds(period);
  const buildingFilters = [buildingAccessCondition(actor)];
  if (buildingId) buildingFilters.push(eq(buildings.id, buildingId));
  if (filters.ownerId) buildingFilters.push(eq(buildings.ownerId, filters.ownerId));
  const buildingRows = await db.select().from(buildings).where(and(...buildingFilters));
  const buildingIds = buildingRows.map((building) => building.id);

  const empty = {
    period,
    buildingId: buildingId ?? null,
    rentBilled: 0,
    rentCollected: 0,
    outstanding: 0,
    otherIncome: 0,
    expenses: 0,
    expensesOwner: 0,
    expensesAgency: 0,
    netOperatingIncome: 0,
    managementFeeEarned: 0,
    ownerPayable: 0,
    remitted: 0,
    ownerRemaining: 0,
    byBuilding: [] as OverviewBuilding[],
  };
  if (buildingIds.length === 0) return { ...empty, accounts: [], series: [] };

  // A category filter narrows income and expense lines only; rent stays the
  // backbone of the period regardless of category.
  const categoryRows = filters.category ? [eq(financialTransactions.category, filters.category)] : [];

  const [billedRows, collectedRows, incomeRows, expenseRows, settlementRows, arrangementRows, seriesRows] = await Promise.all([
    db
      .select({ buildingId: apartments.buildingId, total: sum(payments.amount) })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .where(
        and(
          inArray(apartments.buildingId, buildingIds),
          inArray(payments.status, ["pending", "paid"]),
          sql`coalesce(${payments.period}, to_char(${payments.createdAt}, 'YYYY-MM')) = ${period}`,
        ),
      )
      .groupBy(apartments.buildingId),
    db
      .select({ buildingId: apartments.buildingId, total: sum(payments.amount) })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .where(
        and(
          inArray(apartments.buildingId, buildingIds),
          eq(payments.status, "paid"),
          sql`coalesce(${payments.period}, to_char(${payments.paidAt}, 'YYYY-MM')) = ${period}`,
        ),
      )
      .groupBy(apartments.buildingId),
    db
      .select({ buildingId: financialTransactions.buildingId, total: sum(financialTransactions.amount) })
      .from(financialTransactions)
      .where(
        and(
          inArray(financialTransactions.buildingId, buildingIds),
          eq(financialTransactions.status, "posted"),
          eq(financialTransactions.kind, "income"),
          eq(financialTransactions.period, period),
          ...categoryRows,
        ),
      )
      .groupBy(financialTransactions.buildingId),
    db
      .select({ buildingId: financialTransactions.buildingId, chargeableTo: financialTransactions.chargeableTo, total: sum(financialTransactions.amount) })
      .from(financialTransactions)
      .where(
        and(
          inArray(financialTransactions.buildingId, buildingIds),
          eq(financialTransactions.status, "posted"),
          eq(financialTransactions.kind, "expense"),
          eq(financialTransactions.period, period),
          ...categoryRows,
        ),
      )
      .groupBy(financialTransactions.buildingId, financialTransactions.chargeableTo),
    db
      .select({ buildingId: ownerSettlements.buildingId, total: sum(ownerSettlements.amount) })
      .from(ownerSettlements)
      .where(and(inArray(ownerSettlements.buildingId, buildingIds), eq(ownerSettlements.period, period)))
      .groupBy(ownerSettlements.buildingId),
    db.select().from(managementArrangements).where(inArray(managementArrangements.buildingId, buildingIds)),
    db
      .select({ period: financialTransactions.period, kind: financialTransactions.kind, total: sum(financialTransactions.amount) })
      .from(financialTransactions)
      .where(
        and(
          inArray(financialTransactions.buildingId, buildingIds),
          eq(financialTransactions.status, "posted"),
          inArray(financialTransactions.kind, ["rent", "income", "expense"]),
          inArray(financialTransactions.period, lastPeriods(period, 6)),
        ),
      )
      .groupBy(financialTransactions.period, financialTransactions.kind),
  ]);

  const mapTotal = (rows: Array<{ buildingId: string | null; total: string | number | null }>) =>
    new Map(rows.map((row) => [row.buildingId ?? "", Number(row.total ?? 0)]));

  const billedBy = mapTotal(billedRows);
  const collectedBy = mapTotal(collectedRows);
  const incomeBy = mapTotal(incomeRows);
  const settlementBy = mapTotal(settlementRows);
  const ownerExpenseBy = new Map<string, number>();
  const agencyExpenseBy = new Map<string, number>();
  for (const row of expenseRows) {
    const key = row.buildingId ?? "";
    const target = row.chargeableTo === "owner" ? ownerExpenseBy : agencyExpenseBy;
    target.set(key, (target.get(key) ?? 0) + Number(row.total ?? 0));
  }
  const arrangementsByBuilding = new Map<string, typeof managementArrangements.$inferSelect[]>();
  for (const arrangement of arrangementRows) {
    const list = arrangementsByBuilding.get(arrangement.buildingId) ?? [];
    list.push(arrangement);
    arrangementsByBuilding.set(arrangement.buildingId, list);
  }
  // Agency-wide fallback for any building without its own arrangement. All the
  // buildings in scope belong to the actor's agency, so it is loaded once.
  const agencyDefault = await agencyFeeDefault(actor.organizationId);

  const [apartmentList, billedApartments, collectedApartments, expenseApartments] = await Promise.all([
    db
      .select({ id: apartments.id, buildingId: apartments.buildingId, unitNumber: apartments.unitNumber })
      .from(apartments)
      .where(inArray(apartments.buildingId, buildingIds)),
    db
      .select({ buildingId: apartments.buildingId, apartmentId: apartments.id, total: sum(payments.amount) })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .where(
        and(
          inArray(apartments.buildingId, buildingIds),
          inArray(payments.status, ["pending", "paid"]),
          sql`coalesce(${payments.period}, to_char(${payments.createdAt}, 'YYYY-MM')) = ${period}`,
        ),
      )
      .groupBy(apartments.buildingId, apartments.id),
    db
      .select({ buildingId: apartments.buildingId, apartmentId: apartments.id, total: sum(payments.amount) })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .where(
        and(
          inArray(apartments.buildingId, buildingIds),
          eq(payments.status, "paid"),
          sql`coalesce(${payments.period}, to_char(${payments.paidAt}, 'YYYY-MM')) = ${period}`,
        ),
      )
      .groupBy(apartments.buildingId, apartments.id),
    db
      .select({ buildingId: financialTransactions.buildingId, apartmentId: financialTransactions.apartmentId, total: sum(financialTransactions.amount) })
      .from(financialTransactions)
      .where(
        and(
          inArray(financialTransactions.buildingId, buildingIds),
          eq(financialTransactions.status, "posted"),
          eq(financialTransactions.kind, "expense"),
          eq(financialTransactions.period, period),
          ...categoryRows,
        ),
      )
      .groupBy(financialTransactions.buildingId, financialTransactions.apartmentId),
  ]);

  const apartmentsByBuilding = new Map<string, { id: string; unitNumber: string }[]>();
  for (const apartment of apartmentList) {
    const list = apartmentsByBuilding.get(apartment.buildingId) ?? [];
    list.push({ id: apartment.id, unitNumber: apartment.unitNumber });
    apartmentsByBuilding.set(apartment.buildingId, list);
  }
  const billedApartmentBy = new Map(billedApartments.map((row) => [`${row.buildingId}:${row.apartmentId}`, Number(row.total ?? 0)]));
  const collectedApartmentBy = new Map(collectedApartments.map((row) => [`${row.buildingId}:${row.apartmentId}`, Number(row.total ?? 0)]));
  const expenseApartmentBy = new Map<string, number>();
  const unattributedExpenseBy = new Map<string, number>();
  for (const row of expenseApartments) {
    if (row.apartmentId) {
      const key = `${row.buildingId}:${row.apartmentId}`;
      expenseApartmentBy.set(key, (expenseApartmentBy.get(key) ?? 0) + Number(row.total ?? 0));
    } else if (row.buildingId) {
      unattributedExpenseBy.set(row.buildingId, (unattributedExpenseBy.get(row.buildingId) ?? 0) + Number(row.total ?? 0));
    }
  }

  const byBuilding: OverviewBuilding[] = [];
  let rentBilled = 0;
  let rentCollected = 0;
  let otherIncome = 0;
  let expensesOwner = 0;
  let expensesAgency = 0;
  let managementFeeEarned = 0;
  let ownerPayable = 0;
  let remitted = 0;

  for (const building of buildingRows) {
    const billed = billedBy.get(building.id) ?? 0;
    const collected = collectedBy.get(building.id) ?? 0;
    const income = incomeBy.get(building.id) ?? 0;
    const ownerExpense = ownerExpenseBy.get(building.id) ?? 0;
    const agencyExpense = agencyExpenseBy.get(building.id) ?? 0;
    const effective = pickEffectiveArrangement(arrangementsByBuilding.get(building.id) ?? [], start, end);
    const fee = resolvedFee(effective, agencyDefault, { collected, billed });
    const payable = collected + income - ownerExpense - fee;
    const settled = settlementBy.get(building.id) ?? 0;

    rentBilled += billed;
    rentCollected += collected;
    otherIncome += income;
    expensesOwner += ownerExpense;
    expensesAgency += agencyExpense;
    managementFeeEarned += fee;
    ownerPayable += payable;
    remitted += settled;

    const apartmentRows: OverviewApartment[] = (apartmentsByBuilding.get(building.id) ?? []).map((apartment) => {
      const key = `${building.id}:${apartment.id}`;
      return {
        apartmentId: apartment.id,
        unitNumber: apartment.unitNumber,
        rentBilled: billedApartmentBy.get(key) ?? 0,
        rentCollected: collectedApartmentBy.get(key) ?? 0,
        expenses: expenseApartmentBy.get(key) ?? 0,
      };
    });
    const unattributed = unattributedExpenseBy.get(building.id) ?? 0;
    if (unattributed !== 0) {
      apartmentRows.push({ apartmentId: null, unitNumber: "Non affecté", rentBilled: 0, rentCollected: 0, expenses: unattributed });
    }
    apartmentRows.sort((left, right) => left.unitNumber.localeCompare(right.unitNumber, "fr"));

    byBuilding.push({
      buildingId: building.id,
      buildingName: building.name,
      ownerKind: building.ownerKind,
      rentBilled: billed,
      rentCollected: collected,
      otherIncome: income,
      expensesOwner: ownerExpense,
      expensesAgency: agencyExpense,
      managementFee: fee,
      ownerPayable: payable,
      remitted: settled,
      remaining: payable - settled,
      apartments: apartmentRows,
    });
  }

  const accounts = await accountBalances(actor, buildingId);
  const seriesMap = new Map<string, { rent: number; income: number; expense: number }>();
  for (const row of seriesRows) {
    const key = row.period ?? "";
    if (!key) continue;
    const bucket = seriesMap.get(key) ?? { rent: 0, income: 0, expense: 0 };
    if (row.kind === "rent") bucket.rent += Number(row.total ?? 0);
    else if (row.kind === "income") bucket.income += Number(row.total ?? 0);
    else if (row.kind === "expense") bucket.expense += Number(row.total ?? 0);
    seriesMap.set(key, bucket);
  }
  const series = lastPeriods(period, 6).map((month) => ({
    period: month,
    rentCollected: seriesMap.get(month)?.rent ?? 0,
    otherIncome: seriesMap.get(month)?.income ?? 0,
    expenses: seriesMap.get(month)?.expense ?? 0,
    net: (seriesMap.get(month)?.rent ?? 0) + (seriesMap.get(month)?.income ?? 0) - (seriesMap.get(month)?.expense ?? 0),
  }));

  return {
    period,
    buildingId: buildingId ?? null,
    rentBilled,
    rentCollected,
    outstanding: rentBilled - rentCollected,
    otherIncome,
    expenses: expensesOwner + expensesAgency,
    expensesOwner,
    expensesAgency,
    netOperatingIncome: rentCollected + otherIncome - (expensesOwner + expensesAgency),
    managementFeeEarned,
    ownerPayable,
    remitted,
    ownerRemaining: ownerPayable - remitted,
    byBuilding,
    accounts: accounts.map((account) => ({ id: account.id, name: account.name, type: account.type, balance: account.balance, buildingId: account.buildingId })),
    series,
  };
}

router.get("/accounts/overview", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const period = resolvePeriod(c.req.query("period"));
  const buildingId = c.req.query("buildingId");
  let parsedBuilding: string | undefined;
  if (buildingId) {
    parsedBuilding = parseUuid(buildingId, "building id");
    await requireScopedBuilding(actor, parsedBuilding);
  }
  const ownerId = c.req.query("ownerId");
  let parsedOwner: string | undefined;
  if (ownerId) parsedOwner = parseUuid(ownerId, "owner id");
  const category = c.req.query("category");
  const filters = {
    ownerId: parsedOwner,
    category: category && category.trim() !== "" ? category.trim().slice(0, 64) : undefined,
  };
  return c.json({ data: await computeOverview(actor, period, parsedBuilding, filters) });
});

// --- Owner statements ---

export async function computeStatement(buildingId: string, period: string) {
  const db = getDb();
  const { start, end } = periodBounds(period);

  const [billedRow, collectedRow, incomeRow, ownerExpenseRow, agencyExpenseRow, remitRow] = await Promise.all([
    db
      .select({ total: sum(payments.amount) })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .where(
        and(
          eq(apartments.buildingId, buildingId),
          inArray(payments.status, ["pending", "paid"]),
          sql`coalesce(${payments.period}, to_char(${payments.createdAt}, 'YYYY-MM')) = ${period}`,
        ),
      ),
    db
      .select({ total: sum(payments.amount) })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
      .where(
        and(
          eq(apartments.buildingId, buildingId),
          eq(payments.status, "paid"),
          sql`coalesce(${payments.period}, to_char(${payments.paidAt}, 'YYYY-MM')) = ${period}`,
        ),
      ),
    db
      .select({ total: sum(financialTransactions.amount) })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.buildingId, buildingId),
          eq(financialTransactions.status, "posted"),
          eq(financialTransactions.kind, "income"),
          eq(financialTransactions.period, period),
        ),
      ),
    db
      .select({ total: sum(financialTransactions.amount) })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.buildingId, buildingId),
          eq(financialTransactions.status, "posted"),
          eq(financialTransactions.kind, "expense"),
          eq(financialTransactions.chargeableTo, "owner"),
          eq(financialTransactions.period, period),
        ),
      ),
    db
      .select({ total: sum(financialTransactions.amount) })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.buildingId, buildingId),
          eq(financialTransactions.status, "posted"),
          eq(financialTransactions.kind, "expense"),
          or(eq(financialTransactions.chargeableTo, "agency"), isNull(financialTransactions.chargeableTo))!,
          eq(financialTransactions.period, period),
        ),
      ),
    db
      .select({ total: sum(ownerSettlements.amount) })
      .from(ownerSettlements)
      .where(and(eq(ownerSettlements.buildingId, buildingId), eq(ownerSettlements.period, period))),
  ]);

  const arrangementRows = await db.select().from(managementArrangements).where(eq(managementArrangements.buildingId, buildingId));
  const effective = pickEffectiveArrangement(arrangementRows, start, end);
  // No arrangement of its own: fall back to the agency's default barème.
  const [buildingOwner] = await db
    .select({ organizationId: buildings.organizationId })
    .from(buildings)
    .where(eq(buildings.id, buildingId))
    .limit(1);
  const agencyDefault = buildingOwner?.organizationId ? await agencyFeeDefault(buildingOwner.organizationId) : null;

  const billed = Number(billedRow[0]?.total ?? 0);
  const collected = Number(collectedRow[0]?.total ?? 0);
  const otherIncome = Number(incomeRow[0]?.total ?? 0);
  const expensesOwner = Number(ownerExpenseRow[0]?.total ?? 0);
  const expensesAgency = Number(agencyExpenseRow[0]?.total ?? 0);
  const feeConfig = resolveManagementFeeConfig(effective, agencyDefault);
  const managementFee = resolvedFee(effective, agencyDefault, { collected, billed });
  const remitted = Number(remitRow[0]?.total ?? 0);
  const netPayable = collected + otherIncome - expensesOwner - managementFee;
  const basis = managementFeeBasisLabel(feeConfig, !effective && Boolean(agencyDefault));

  const lines: Array<{ lineType: "rent_billed" | "rent_collected" | "other_income" | "expense_owner" | "expense_agency" | "management_fee" | "adjustment" | "net"; label: string; amount: number; sortOrder: number }> = [
    { lineType: "rent_billed", label: "Loyers facturés", amount: billed, sortOrder: 10 },
    { lineType: "rent_collected", label: "Loyers encaissés", amount: collected, sortOrder: 20 },
    { lineType: "other_income", label: "Autres revenus", amount: otherIncome, sortOrder: 30 },
    { lineType: "expense_owner", label: "Dépenses à la charge du propriétaire", amount: -expensesOwner, sortOrder: 40 },
    { lineType: "expense_agency", label: "Dépenses à la charge de l’agence", amount: -expensesAgency, sortOrder: 50 },
    { lineType: "management_fee", label: "Frais de gestion", amount: -managementFee, sortOrder: 60 },
    { lineType: "net", label: "Net à verser au propriétaire", amount: netPayable, sortOrder: 70 },
  ];

  return {
    buildingId,
    period,
    rentBilled: billed,
    rentCollected: collected,
    otherIncome,
    expensesOwner,
    expensesAgency,
    managementFee,
    netPayable,
    remitted,
    remaining: netPayable - remitted,
    basis,
    lines,
  };
}

router.get("/accounts/statements", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const conditions = [inArray(ownerStatements.buildingId, myBuildings(actor))];
  const buildingId = c.req.query("buildingId");
  if (buildingId) conditions.push(eq(ownerStatements.buildingId, parseUuid(buildingId, "building id")));
  const period = c.req.query("period");
  if (period) conditions.push(eq(ownerStatements.period, resolvePeriod(period)));
  const status = c.req.query("status");
  if (status === "draft" || status === "finalized") conditions.push(eq(ownerStatements.status, status));
  const rows = await getDb()
    .select({ statement: ownerStatements, buildingName: buildings.name, ownerKind: buildings.ownerKind })
    .from(ownerStatements)
    .innerJoin(buildings, eq(ownerStatements.buildingId, buildings.id))
    .where(and(...conditions))
    .orderBy(desc(ownerStatements.period), buildings.name);
  return c.json({ data: rows.map((row) => ({ ...row.statement, buildingName: row.buildingName, ownerKind: row.ownerKind })) });
});

router.post("/accounts/statements", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, z.object({ buildingId: z.string().uuid(), period: periodSchema }));
  const building = await requireScopedBuilding(actor, data.buildingId);
  const computed = await computeStatement(building.id, data.period);
  const db = getDb();

  const result = await db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(ownerStatements)
      .where(and(eq(ownerStatements.buildingId, building.id), eq(ownerStatements.period, data.period)))
      .limit(1);
    if (existing && existing.status === "finalized") {
      throw new HTTPException(409, { message: "Ce relevé est finalisé : créez un ajustement plutôt que de le recalculer." });
    }
    const values = {
      buildingId: building.id,
      period: data.period,
      rentBilled: String(computed.rentBilled),
      rentCollected: String(computed.rentCollected),
      otherIncome: String(computed.otherIncome),
      expensesOwner: String(computed.expensesOwner),
      expensesAgency: String(computed.expensesAgency),
      managementFee: String(computed.managementFee),
      netPayable: String(computed.netPayable),
      remitted: String(computed.remitted),
      remaining: String(computed.remaining),
      basis: computed.basis,
      createdById: actor.id,
      updatedAt: new Date(),
    };
    const [statement] = existing
      ? await transaction.update(ownerStatements).set(values).where(eq(ownerStatements.id, existing.id)).returning()
      : await transaction.insert(ownerStatements).values(values).returning();
    if (!statement) throw new HTTPException(500, { message: "La génération du relevé a échoué." });
    await transaction.delete(ownerStatementLines).where(eq(ownerStatementLines.statementId, statement.id));
    await transaction.insert(ownerStatementLines).values(
      computed.lines.map((line) => ({
        statementId: statement.id,
        lineType: line.lineType,
        label: line.label,
        amount: String(line.amount),
        sortOrder: line.sortOrder,
      })),
    );
    const lines = await transaction.select().from(ownerStatementLines).where(eq(ownerStatementLines.statementId, statement.id)).orderBy(ownerStatementLines.sortOrder);
    return { ...statement, lines, buildingName: building.name, ownerKind: building.ownerKind };
  });

  return c.json({ data: result }, 201);
});

router.get("/accounts/statements/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "statement id");
  const db = getDb();
  const [row] = await db
    .select({ statement: ownerStatements, buildingName: buildings.name, ownerKind: buildings.ownerKind })
    .from(ownerStatements)
    .innerJoin(buildings, eq(ownerStatements.buildingId, buildings.id))
    .where(and(eq(ownerStatements.id, id), inArray(ownerStatements.buildingId, myBuildings(actor))))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Relevé introuvable." });
  const [lines, settlements] = await Promise.all([
    db.select().from(ownerStatementLines).where(eq(ownerStatementLines.statementId, id)).orderBy(ownerStatementLines.sortOrder),
    db.select().from(ownerSettlements).where(eq(ownerSettlements.statementId, id)).orderBy(desc(ownerSettlements.paidAt)),
  ]);
  return c.json({ data: { ...row.statement, buildingName: row.buildingName, ownerKind: row.ownerKind, lines, settlements } });
});

router.get("/accounts/statements/:id/pdf", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "statement id");
  const db = getDb();
  const [row] = await db
    .select({ statement: ownerStatements, buildingName: buildings.name })
    .from(ownerStatements)
    .innerJoin(buildings, eq(ownerStatements.buildingId, buildings.id))
    .where(and(eq(ownerStatements.id, id), inArray(ownerStatements.buildingId, myBuildings(actor))))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Relevé introuvable." });
  const lines = await db
    .select()
    .from(ownerStatementLines)
    .where(eq(ownerStatementLines.statementId, id))
    .orderBy(ownerStatementLines.sortOrder);
  const format = (value: string | number) => `${new Intl.NumberFormat("fr-FR").format(Number(value))} FCFA`;
  const pdfRows: Array<[string, string]> = [
    ...lines.map((line) => [line.label, format(line.amount)] as [string, string]),
    ["Net à verser", format(row.statement.netPayable)],
    ["Déjà versé", format(row.statement.remitted)],
    ["Reste à verser", format(row.statement.remaining)],
  ];
  const pdf = await createReportPdf({ title: `Relevé propriétaire — ${row.buildingName}`, period: row.statement.period, rows: pdfRows, branding: await loadAgencyBranding(actor.organizationId) });
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="releve-${row.statement.period}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

router.post("/accounts/statements/:id/finalize", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "statement id");
  const db = getDb();
  const [statement] = await db
    .select()
    .from(ownerStatements)
    .where(and(eq(ownerStatements.id, id), inArray(ownerStatements.buildingId, myBuildings(actor))))
    .limit(1);
  if (!statement) throw new HTTPException(404, { message: "Relevé introuvable." });
  if (statement.status === "finalized") throw new HTTPException(409, { message: "Ce relevé est déjà finalisé." });
  const [updated] = await db
    .update(ownerStatements)
    .set({ status: "finalized", finalizedAt: new Date(), updatedAt: new Date() })
    .where(eq(ownerStatements.id, id))
    .returning();
  return c.json({ data: updated });
});

router.delete("/accounts/statements/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "statement id");
  const db = getDb();
  const [statement] = await db
    .select()
    .from(ownerStatements)
    .where(and(eq(ownerStatements.id, id), inArray(ownerStatements.buildingId, myBuildings(actor))))
    .limit(1);
  if (!statement) throw new HTTPException(404, { message: "Relevé introuvable." });
  if (statement.status === "finalized") throw new HTTPException(409, { message: "Un relevé finalisé ne peut pas être supprimé." });
  await db.delete(ownerStatements).where(eq(ownerStatements.id, id));
  return c.body(null, 204);
});

// --- Owner settlements ---

router.get("/accounts/settlements", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const conditions = [inArray(ownerSettlements.buildingId, myBuildings(actor))];
  const buildingId = c.req.query("buildingId");
  if (buildingId) conditions.push(eq(ownerSettlements.buildingId, parseUuid(buildingId, "building id")));
  const period = c.req.query("period");
  if (period) conditions.push(eq(ownerSettlements.period, resolvePeriod(period)));
  const rows = await getDb()
    .select({ settlement: ownerSettlements, buildingName: buildings.name, accountName: financialAccounts.name })
    .from(ownerSettlements)
    .innerJoin(buildings, eq(ownerSettlements.buildingId, buildings.id))
    .leftJoin(financialAccounts, eq(ownerSettlements.accountId, financialAccounts.id))
    .where(and(...conditions))
    .orderBy(desc(ownerSettlements.paidAt));
  return c.json({ data: rows.map((row) => ({ ...row.settlement, buildingName: row.buildingName, accountName: row.accountName })) });
});

router.post("/accounts/settlements", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(
    c,
    z.object({
      buildingId: z.string().uuid(),
      period: periodSchema,
      amount: z.number().positive().max(1_000_000_000),
      paidAt: isoDate,
      accountId: z.string().uuid().nullable().optional(),
      reference: nullableText(180),
      notes: nullableText(500),
      recipientName: nullableText(160),
      recipientPhone: nullableText(32),
    }),
  );
  const building = await requireScopedBuilding(actor, data.buildingId);
  if (data.accountId) await requireAccountForActor(actor, data.accountId);
  const db = getDb();

  // Snapshot the recipient: an external owner by name/phone, or the user-owner.
  let recipientName = data.recipientName ?? null;
  let recipientPhone = data.recipientPhone ?? null;
  if (!recipientName) {
    if (building.ownerKind === "third_party") {
      recipientName = building.externalOwnerName ?? "Propriétaire externe";
      recipientPhone = recipientPhone ?? building.externalOwnerPhone ?? null;
    } else {
      const [owner] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, building.ownerId)).limit(1);
      recipientName = owner?.name ?? "Propriétaire";
      recipientPhone = recipientPhone ?? owner?.phone ?? null;
    }
  }

  const paidAt = new Date(`${data.paidAt}T00:00:00.000Z`);

  const result = await db.transaction(async (transaction) => {
    // A settlement must never be applied twice (spec 2.8): an identical payout
    // — same building, period, amount and date — is a double submission, not a
    // second legitimate transfer. Distinct amounts or dates remain allowed.
    const [duplicate] = await transaction
      .select({ id: ownerSettlements.id })
      .from(ownerSettlements)
      .where(
        and(
          eq(ownerSettlements.buildingId, building.id),
          eq(ownerSettlements.period, data.period),
          eq(ownerSettlements.amount, String(data.amount)),
          eq(ownerSettlements.paidAt, paidAt),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new HTTPException(409, { message: "Un versement identique (même immeuble, période, montant et date) a déjà été enregistré." });
    }

    const [statement] = await transaction
      .select()
      .from(ownerStatements)
      .where(and(eq(ownerStatements.buildingId, building.id), eq(ownerStatements.period, data.period)))
      .limit(1);

    const [settlement] = await transaction
      .insert(ownerSettlements)
      .values({
        buildingId: building.id,
        period: data.period,
        statementId: statement?.id ?? null,
        recipientName,
        recipientPhone,
        amount: String(data.amount),
        paidAt,
        accountId: data.accountId ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        createdById: actor.id,
      })
      .returning();
    if (!settlement) throw new HTTPException(500, { message: "L’enregistrement du versement a échoué." });

    // The cash leaving an account is a `settlement` movement: it reduces the
    // account balance but is never an operating expense.
    await transaction.insert(financialTransactions).values({
      buildingId: building.id,
      accountId: data.accountId ?? null,
      kind: "settlement",
      flow: "out",
      amount: String(data.amount),
      period: data.period,
      postedAt: paidAt,
      category: "owner_settlement",
      description: `Versement au propriétaire — ${data.period}`,
      reference: data.reference ?? null,
      settlementId: settlement.id,
      createdById: actor.id,
    });

    if (statement) {
      const [remitRow] = await transaction
        .select({ total: sum(ownerSettlements.amount) })
        .from(ownerSettlements)
        .where(and(eq(ownerSettlements.buildingId, building.id), eq(ownerSettlements.period, data.period)));
      const remitted = Number(remitRow?.total ?? 0);
      const netPayable = Number(statement.netPayable);
      await transaction
        .update(ownerStatements)
        .set({ remitted: String(remitted), remaining: String(netPayable - remitted), updatedAt: new Date() })
        .where(eq(ownerStatements.id, statement.id));
    }

    return settlement;
  });

  return c.json({ data: result }, 201);
});

router.delete("/accounts/settlements/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "settlement id");
  const db = getDb();
  const [settlement] = await db
    .select()
    .from(ownerSettlements)
    .where(and(eq(ownerSettlements.id, id), inArray(ownerSettlements.buildingId, myBuildings(actor))))
    .limit(1);
  if (!settlement) throw new HTTPException(404, { message: "Versement introuvable." });
  await db.transaction(async (transaction) => {
    await transaction.delete(ownerSettlements).where(eq(ownerSettlements.id, id));
    if (settlement.statementId) {
      const [statement] = await transaction.select().from(ownerStatements).where(eq(ownerStatements.id, settlement.statementId)).limit(1);
      if (statement) {
        const [remitRow] = await transaction
          .select({ total: sum(ownerSettlements.amount) })
          .from(ownerSettlements)
          .where(and(eq(ownerSettlements.buildingId, settlement.buildingId), eq(ownerSettlements.period, settlement.period)));
        const remitted = Number(remitRow?.total ?? 0);
        await transaction
          .update(ownerStatements)
          .set({ remitted: String(remitted), remaining: String(Number(statement.netPayable) - remitted), updatedAt: new Date() })
          .where(eq(ownerStatements.id, statement.id));
      }
    }
  });
  return c.body(null, 204);
});

// Registered last so the static `/accounts/...` paths above (overview, ledger,
// statements, settlements) are never captured as an `:id`.
router.get("/accounts/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "account id");
  await requireAccountForActor(actor, id);
  const balances = await accountBalances(actor);
  const found = balances.find((row) => row.id === id);
  if (!found) throw new HTTPException(404, { message: "Compte introuvable." });
  const recent = await getDb()
    .select()
    .from(financialTransactions)
    .where(eq(financialTransactions.accountId, id))
    .orderBy(desc(financialTransactions.postedAt))
    .limit(50);
  return c.json({ data: { ...found, transactions: recent } });
});

export default router;

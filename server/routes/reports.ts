import { and, count, desc, eq, gte, isNull, lt, or, sql, sum } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "@/db";
import {
  apartments,
  buildings,
  commonUtilities,
  financialAccounts,
  financialTransactions,
  leases,
  ownerSettlements,
  ownerStatements,
  payments,
  tenants,
} from "@/db/schema";
import { createReportPdf } from "@/lib/pdf";
import { buildingAccessCondition, financialTransactionScope, getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { loadAgencyBranding } from "@/server/lib/organization";
import { csvResponse, parseUuid, type RequestContext } from "@/server/lib/http";
import { accountBalances, computeOverview } from "@/server/routes/accounts";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

function getPeriod(value: string | undefined) {
  const period = value ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new HTTPException(400, { message: "Period must use YYYY-MM." });
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { period, start, end };
}

async function reportContext(actor: Awaited<ReturnType<typeof requireActor>>, buildingId: string | undefined) {
  if (buildingId) {
    const id = parseUuid(buildingId, "building id");
    await getBuildingForActor(id, actor);
    return { id, access: eq(buildings.id, id) };
  }
  return { id: undefined, access: buildingAccessCondition(actor) };
}

async function getReportData(actor: Awaited<ReturnType<typeof requireActor>>, c: RequestContext) {
  const periodInfo = getPeriod(c.req.query("period"));
  const context = await reportContext(actor, c.req.query("buildingId"));
  const db = getDb();
  const paymentWhere = and(context.access, gte(payments.createdAt, periodInfo.start), lt(payments.createdAt, periodInfo.end));
  const utilityWhere = and(context.access, gte(commonUtilities.createdAt, periodInfo.start), lt(commonUtilities.createdAt, periodInfo.end));
  const [paymentTotals] = await db.select({ total: sum(payments.amount), count: count() })
    .from(payments)
    .innerJoin(leases, eq(payments.leaseId, leases.id))
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .where(and(paymentWhere, eq(payments.status, "paid")));
  const [utilityTotals] = await db.select({ total: sum(commonUtilities.totalAmount), count: count() })
    .from(commonUtilities)
    .innerJoin(buildings, eq(commonUtilities.buildingId, buildings.id))
    .where(utilityWhere);
  const unitWhere = context.id ? eq(apartments.buildingId, context.id) : context.access;
  const [unitTotals] = await db.select({ total: count() }).from(apartments).innerJoin(buildings, eq(apartments.buildingId, buildings.id)).where(unitWhere);
  const [occupiedTotals] = await db.select({ total: count() }).from(apartments).innerJoin(buildings, eq(apartments.buildingId, buildings.id)).where(and(unitWhere, eq(apartments.status, "occupied")));
  const collected = Number(paymentTotals?.total ?? 0);
  const charges = Number(utilityTotals?.total ?? 0);
  const unitCount = Number(unitTotals?.total ?? 0);
  const occupied = Number(occupiedTotals?.total ?? 0);
  return {
    ...periodInfo,
    buildingId: context.id,
    collected,
    charges,
    net: collected - charges,
    paymentCount: Number(paymentTotals?.count ?? 0),
    utilityCount: Number(utilityTotals?.count ?? 0),
    unitCount,
    occupied,
    occupancyRate: unitCount ? Math.round((occupied / unitCount) * 10000) / 100 : 0,
  };
}

function reportRows(data: Awaited<ReturnType<typeof getReportData>>) {
  return [
    ["Periode", data.period],
    ["Immeuble", data.buildingId ?? "Tous les immeubles"],
    ["Loyers encaisses", `${data.collected.toLocaleString("fr-FR")} FCFA`],
    ["Factures communes", `${data.charges.toLocaleString("fr-FR")} FCFA`],
    ["Solde net", `${data.net.toLocaleString("fr-FR")} FCFA`],
    ["Paiements", String(data.paymentCount)],
    ["Unites", String(data.unitCount)],
    ["Occupation", `${data.occupancyRate}%`],
  ] as Array<[string, string]>;
}

router.get("/reports/summary", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  return c.json({ data: await getReportData(actor, c) });
});

router.get("/reports/export.csv", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await getReportData(actor, c);
  const rows = [["Indicateur", "Valeur"], ...reportRows(data)];
  return csvResponse(`rapport-naya-${data.period}.csv`, rows);
});

router.get("/reports/export.pdf", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await getReportData(actor, c);
  const pdf = await createReportPdf({ title: "Rapport de gestion", period: data.period, rows: reportRows(data), branding: await loadAgencyBranding(actor.organizationId) });
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rapport-naya-${data.period}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

// --- Accounting reports & exports (Module 2) ---

function wantsCsv(c: RequestContext) {
  return c.req.query("format") === "csv";
}

async function accountingOverview(actor: Awaited<ReturnType<typeof requireActor>>, period: string, buildingId: string | undefined) {
  const context = await reportContext(actor, buildingId);
  return computeOverview(actor, period, context.id);
}

/** Rent billed, collected and outstanding per building, from the ledger overview. */
router.get("/reports/accounting/rent", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { period } = getPeriod(c.req.query("period"));
  const overview = await accountingOverview(actor, period, c.req.query("buildingId"));
  const rows = overview.byBuilding.map((building) => {
    const billed = Number(building.rentBilled);
    const collected = Number(building.rentCollected);
    return { buildingName: String(building.buildingName), rentBilled: billed, rentCollected: collected, outstanding: billed - collected };
  });
  if (wantsCsv(c)) {
    return csvResponse(`comptabilite-loyers-${period}.csv`, [
      ["Immeuble", "Loyers factures", "Loyers encaisses", "Impayes"],
      ...rows.map((row) => [row.buildingName, String(row.rentBilled), String(row.rentCollected), String(row.outstanding)]),
    ]);
  }
  return c.json({ data: { period, rows } });
});

/** Per-building profitability: cash income, chargeable expenses, net and owner position. */
router.get("/reports/accounting/profitability", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { period } = getPeriod(c.req.query("period"));
  const overview = await accountingOverview(actor, period, c.req.query("buildingId"));
  const rows = overview.byBuilding.map((building) => {
    const collected = Number(building.rentCollected);
    const otherIncome = Number(building.otherIncome);
    const expensesOwner = Number(building.expensesOwner);
    const expensesAgency = Number(building.expensesAgency);
    return {
      buildingName: String(building.buildingName),
      rentCollected: collected,
      otherIncome,
      expensesOwner,
      expensesAgency,
      managementFee: Number(building.managementFee),
      netOperatingIncome: collected + otherIncome - expensesOwner - expensesAgency,
      ownerPayable: Number(building.ownerPayable),
      remitted: Number(building.remitted),
      remaining: Number(building.remaining),
    };
  });
  if (wantsCsv(c)) {
    return csvResponse(`comptabilite-rentabilite-${period}.csv`, [
      ["Immeuble", "Loyers encaisses", "Autres revenus", "Depenses proprietaire", "Depenses agence", "Frais de gestion", "Resultat operationnel", "Du au proprietaire", "Verse", "Reste"],
      ...rows.map((row) => [
        row.buildingName,
        String(row.rentCollected),
        String(row.otherIncome),
        String(row.expensesOwner),
        String(row.expensesAgency),
        String(row.managementFee),
        String(row.netOperatingIncome),
        String(row.ownerPayable),
        String(row.remitted),
        String(row.remaining),
      ]),
    ]);
  }
  return c.json({ data: { period, rows } });
});

/** Agency management fees earned per building for the period. */
router.get("/reports/accounting/fees", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { period } = getPeriod(c.req.query("period"));
  const overview = await accountingOverview(actor, period, c.req.query("buildingId"));
  const rows = overview.byBuilding.map((building) => {
    const rentCollected = Number(building.rentCollected);
    const managementFee = Number(building.managementFee);
    return {
      buildingName: String(building.buildingName),
      rentCollected,
      managementFee,
      feeRate: rentCollected > 0 ? Math.round((managementFee / rentCollected) * 10000) / 100 : 0,
    };
  });
  if (wantsCsv(c)) {
    return csvResponse(`comptabilite-honoraires-${period}.csv`, [
      ["Immeuble", "Loyers encaisses", "Honoraires de gestion", "Taux %"],
      ...rows.map((row) => [row.buildingName, String(row.rentCollected), String(row.managementFee), String(row.feeRate)]),
    ]);
  }
  return c.json({ data: { period, rows } });
});

/** Monthly income and expense report over the overview trend window. */
router.get("/reports/accounting/income-expense", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { period } = getPeriod(c.req.query("period"));
  const overview = await accountingOverview(actor, period, c.req.query("buildingId"));
  const rows = overview.series.map((point) => ({
    period: point.period,
    rentCollected: point.rentCollected,
    otherIncome: point.otherIncome,
    totalIncome: point.rentCollected + point.otherIncome,
    expenses: point.expenses,
    net: point.net,
  }));
  if (wantsCsv(c)) {
    return csvResponse(`comptabilite-revenus-depenses-${period}.csv`, [
      ["Mois", "Loyers encaisses", "Autres revenus", "Total revenus", "Depenses", "Resultat"],
      ...rows.map((row) => [row.period, String(row.rentCollected), String(row.otherIncome), String(row.totalIncome), String(row.expenses), String(row.net)]),
    ]);
  }
  return c.json({ data: { period, rows } });
});

/**
 * Account balance and transaction report (spec 2.9): the live balance of every
 * account in scope, with the cash that moved through it during the period.
 */
router.get("/reports/accounting/accounts", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { period } = getPeriod(c.req.query("period"));
  const context = await reportContext(actor, c.req.query("buildingId"));
  const db = getDb();
  const [accounts, periodMovements, buildingRows] = await Promise.all([
    accountBalances(actor, context.id),
    db
      .select({
        accountId: financialTransactions.accountId,
        inflow: sql<string>`coalesce(sum(case when ${financialTransactions.flow} = 'in' then ${financialTransactions.amount} else 0 end), 0)`,
        outflow: sql<string>`coalesce(sum(case when ${financialTransactions.flow} = 'out' then ${financialTransactions.amount} else 0 end), 0)`,
        movementCount: count(),
      })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.status, "posted"),
          eq(financialTransactions.period, period),
          sql`${financialTransactions.accountId} is not null`,
        ),
      )
      .groupBy(financialTransactions.accountId),
    db.select({ id: buildings.id, name: buildings.name }).from(buildings).where(buildingAccessCondition(actor)),
  ]);
  const movementByAccount = new Map(periodMovements.map((row) => [row.accountId, row]));
  const buildingName = new Map(buildingRows.map((row) => [row.id, row.name]));
  const rows = accounts.map((account) => {
    const movement = movementByAccount.get(account.id);
    return {
      name: account.name,
      type: account.type,
      status: account.status,
      buildingName: account.buildingId ? buildingName.get(account.buildingId) ?? null : null,
      openingBalance: Number(account.openingBalance),
      periodInflow: Number(movement?.inflow ?? 0),
      periodOutflow: Number(movement?.outflow ?? 0),
      periodMovements: Number(movement?.movementCount ?? 0),
      balance: account.balance,
    };
  });
  if (wantsCsv(c)) {
    return csvResponse(`comptabilite-comptes-${period}.csv`, [
      ["Compte", "Type", "Statut", "Immeuble", "Solde ouverture", "Entrees periode", "Sorties periode", "Mouvements", "Solde actuel"],
      ...rows.map((row) => [
        row.name,
        row.type,
        row.status,
        row.buildingName ?? "Agence",
        String(row.openingBalance),
        String(row.periodInflow),
        String(row.periodOutflow),
        String(row.periodMovements),
        String(row.balance),
      ]),
    ]);
  }
  return c.json({ data: { period, rows } });
});

/** Every posted ledger movement for the period. */
router.get("/reports/accounting/ledger", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { period } = getPeriod(c.req.query("period"));
  const conditions = [
    eq(financialTransactions.period, period),
    eq(financialTransactions.status, "posted"),
    financialTransactionScope(actor),
  ];
  const buildingId = c.req.query("buildingId");
  if (buildingId) {
    const id = parseUuid(buildingId, "building id");
    await getBuildingForActor(id, actor);
    conditions.push(eq(financialTransactions.buildingId, id));
  }
  const rows = await getDb()
    .select({
      postedAt: financialTransactions.postedAt,
      kind: financialTransactions.kind,
      flow: financialTransactions.flow,
      amount: financialTransactions.amount,
      category: financialTransactions.category,
      description: financialTransactions.description,
      reference: financialTransactions.reference,
      supplier: financialTransactions.supplier,
      accountName: financialAccounts.name,
      buildingName: buildings.name,
    })
    .from(financialTransactions)
    .leftJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
    .leftJoin(buildings, eq(financialTransactions.buildingId, buildings.id))
    .where(and(...conditions))
    .orderBy(desc(financialTransactions.postedAt));
  if (wantsCsv(c)) {
    return csvResponse(`comptabilite-grand-livre-${period}.csv`, [
      ["Date", "Type", "Sens", "Montant", "Categorie", "Description", "Reference", "Fournisseur", "Compte", "Immeuble"],
      ...rows.map((row) => [
        new Date(row.postedAt).toISOString().slice(0, 10),
        row.kind,
        row.flow,
        String(row.amount),
        row.category ?? "",
        row.description ?? "",
        row.reference ?? "",
        row.supplier ?? "",
        row.accountName ?? "",
        row.buildingName ?? "",
      ]),
    ]);
  }
  return c.json({ data: { period, rows } });
});

/** Owner statements register for the period. */
router.get("/reports/accounting/statements", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { period } = getPeriod(c.req.query("period"));
  const conditions = [buildingAccessCondition(actor), eq(ownerStatements.period, period)];
  const buildingId = c.req.query("buildingId");
  if (buildingId) {
    const id = parseUuid(buildingId, "building id");
    await getBuildingForActor(id, actor);
    conditions.push(eq(ownerStatements.buildingId, id));
  }
  const rows = await getDb()
    .select({
      buildingName: buildings.name,
      status: ownerStatements.status,
      rentBilled: ownerStatements.rentBilled,
      rentCollected: ownerStatements.rentCollected,
      expensesOwner: ownerStatements.expensesOwner,
      managementFee: ownerStatements.managementFee,
      netPayable: ownerStatements.netPayable,
      remitted: ownerStatements.remitted,
      remaining: ownerStatements.remaining,
    })
    .from(ownerStatements)
    .innerJoin(buildings, eq(ownerStatements.buildingId, buildings.id))
    .where(and(...conditions))
    .orderBy(desc(buildings.name));
  if (wantsCsv(c)) {
    return csvResponse(`comptabilite-releves-${period}.csv`, [
      ["Immeuble", "Statut", "Loyers factures", "Loyers encaisses", "Depenses proprietaire", "Frais de gestion", "Net a verser", "Verse", "Reste"],
      ...rows.map((row) => [
        row.buildingName,
        row.status,
        String(row.rentBilled),
        String(row.rentCollected),
        String(row.expensesOwner),
        String(row.managementFee),
        String(row.netPayable),
        String(row.remitted),
        String(row.remaining),
      ]),
    ]);
  }
  return c.json({ data: { period, rows } });
});

/** Owner settlement (payout) records for the period. */
router.get("/reports/accounting/settlements", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { period } = getPeriod(c.req.query("period"));
  const conditions = [buildingAccessCondition(actor), eq(ownerSettlements.period, period)];
  const buildingId = c.req.query("buildingId");
  if (buildingId) {
    const id = parseUuid(buildingId, "building id");
    await getBuildingForActor(id, actor);
    conditions.push(eq(ownerSettlements.buildingId, id));
  }
  const rows = await getDb()
    .select({
      buildingName: buildings.name,
      recipientName: ownerSettlements.recipientName,
      recipientPhone: ownerSettlements.recipientPhone,
      amount: ownerSettlements.amount,
      paidAt: ownerSettlements.paidAt,
      reference: ownerSettlements.reference,
      accountName: financialAccounts.name,
    })
    .from(ownerSettlements)
    .innerJoin(buildings, eq(ownerSettlements.buildingId, buildings.id))
    .leftJoin(financialAccounts, eq(ownerSettlements.accountId, financialAccounts.id))
    .where(and(...conditions))
    .orderBy(desc(ownerSettlements.paidAt));
  if (wantsCsv(c)) {
    return csvResponse(`comptabilite-versements-${period}.csv`, [
      ["Immeuble", "Beneficiaire", "Telephone", "Montant", "Date", "Reference", "Compte"],
      ...rows.map((row) => [
        row.buildingName,
        row.recipientName,
        row.recipientPhone ?? "",
        String(row.amount),
        new Date(row.paidAt).toISOString().slice(0, 10),
        row.reference ?? "",
        row.accountName ?? "",
      ]),
    ]);
  }
  return c.json({ data: { period, rows } });
});

export default router;

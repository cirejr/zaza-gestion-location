import { and, count, desc, eq, gte, lt, sum } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "@/db";
import { apartments, buildings, commonUtilities, leases, payments, tenants } from "@/db/schema";
import { createReportPdf } from "@/lib/pdf";
import { buildingAccessCondition, getBuildingForActor, requireActor, requireRole } from "@/server/lib/auth-context";
import { csvResponse, parseUuid, type RequestContext } from "@/server/lib/http";
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
  const pdf = await createReportPdf({ title: "Rapport de gestion", period: data.period, rows: reportRows(data) });
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rapport-naya-${data.period}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

export default router;

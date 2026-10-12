import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, claims, commonUtilities, leases, maintenanceTickets, payments, tenants, utilitySplits } from "@/db/schema";
import { createPaymentLink, PaymentProviderError, type PaymentProviderName } from "@/lib/payment-providers";
import { createReceiptPdf } from "@/lib/pdf";
import { loadAgencyBranding } from "@/server/lib/organization";
import { notifyBuildingTeam } from "@/server/lib/notify";
import { resolvePortalTenant } from "@/server/lib/tenant-auth";
import { parseBody, parseUuid } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

/**
 * Tenant portal API. Tenants only ever access their own records: every
 * endpoint resolves the tenant from the authenticated session (phone or the
 * stored `user_id` link) and filters ressource ownership against it.
 */
const router = new Hono<ApiEnv>();

async function portalLease(tenantId: string) {
  const db = getDb();
  const [row] = await db
    .select({ lease: leases, apartment: apartments, building: buildings })
    .from(leases)
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .where(eq(leases.tenantId, tenantId))
    .orderBy(desc(leases.startDate))
    .limit(1);
  return row ?? null;
}

router.get("/portal/me", async (c) => {
  const tenant = await resolvePortalTenant(c);
  const db = getDb();
  const context = await portalLease(tenant.id);

  let pendingPayments: Array<typeof payments.$inferSelect> = [];
  let paymentHistory: Array<typeof payments.$inferSelect> = [];
  let utilityNotes: Array<{ id: string; type: string; period: string; amount: string; unitNumber: string; sentAt: Date | null }> = [];
  let tickets: Array<typeof maintenanceTickets.$inferSelect> = [];
  let tenantClaims: Array<typeof claims.$inferSelect> = [];

  if (context) {
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.leaseId, context.lease.id))
      .orderBy(desc(payments.createdAt));
    pendingPayments = rows.filter((row) => row.status === "pending");
    paymentHistory = rows.filter((row) => row.status !== "pending");

    const splits = await db
      .select({ id: utilitySplits.id, type: commonUtilities.type, period: commonUtilities.period, amount: utilitySplits.amount, unitNumber: apartments.unitNumber, sentAt: utilitySplits.sentAt })
      .from(utilitySplits)
      .innerJoin(commonUtilities, eq(utilitySplits.utilityId, commonUtilities.id))
      .innerJoin(apartments, eq(utilitySplits.apartmentId, apartments.id))
      .where(eq(utilitySplits.apartmentId, context.apartment.id))
      .orderBy(desc(commonUtilities.createdAt));
    utilityNotes = splits.map((split) => ({ ...split, type: String(split.type), amount: String(split.amount) }));

    [tickets, tenantClaims] = await Promise.all([
      db.select().from(maintenanceTickets).where(eq(maintenanceTickets.apartmentId, context.apartment.id)).orderBy(desc(maintenanceTickets.createdAt)),
      db.select().from(claims).where(eq(claims.tenantId, tenant.id)).orderBy(desc(claims.createdAt)),
    ]);
  }

  const stats = {
    totalDue: pendingPayments.reduce((sum, row) => sum + Number(row.amount), 0),
    paidCount: paymentHistory.filter((row) => row.status === "paid").length,
    paidTotal: paymentHistory.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount), 0),
  };

  return c.json({
    data: {
      tenant,
      building: context ? { id: context.building.id, name: context.building.name, city: context.building.city } : null,
      apartment: context ? context.apartment : null,
      lease: context ? context.lease : null,
      pendingPayments,
      paymentHistory,
      utilityNotes,
      tickets,
      claims: tenantClaims,
      stats,
    },
  });
});

/** Shared resolver: the tenant's active lease, failing loudly when there is none. */
async function requirePortalLease(tenantId: string) {
  const context = await portalLease(tenantId);
  if (!context) throw new HTTPException(409, { message: "Aucun bail actif. Contactez votre gestionnaire." });
  return context;
}

const portalTicketInput = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(10000),
  category: z.enum(["reparation", "degradation", "autre"]).default("reparation"),
  priority: z.enum(["low", "normal", "urgent"]).default("normal"),
  photoUrl: z.string().url().nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
});

/** A tenant reports a repair to schedule or a degradation in their own unit. */
router.post("/portal/tickets", async (c) => {
  const tenant = await resolvePortalTenant(c);
  const data = await parseBody(c, portalTicketInput);
  const context = await requirePortalLease(tenant.id);
  const [ticket] = await getDb().insert(maintenanceTickets).values({
    buildingId: context.building.id,
    apartmentId: context.apartment.id,
    title: data.title,
    description: data.description,
    category: data.category,
    priority: data.priority,
    photoUrl: data.photoUrl ?? null,
    cost: data.cost == null ? null : String(data.cost),
    status: "pending",
  }).returning();
  await notifyBuildingTeam(context.building, {
    type: "ticket.created",
    title: `Nouvelle demande locataire : ${data.title}`,
    body: `${tenant.fullName} · ${context.apartment.unitNumber}`,
    href: "/tickets",
  });
  return c.json({ data: ticket }, 201);
});

router.get("/portal/tickets", async (c) => {
  const tenant = await resolvePortalTenant(c);
  const context = await portalLease(tenant.id);
  if (!context) return c.json({ data: [] });
  const rows = await getDb()
    .select()
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.apartmentId, context.apartment.id))
    .orderBy(desc(maintenanceTickets.createdAt));
  return c.json({ data: rows });
});

const portalClaimInput = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(10000),
  type: z.enum(["deposit", "reparation", "autre"]).default("autre"),
  amount: z.number().min(0).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
});

/** A tenant files a claim (deposit, repair reimbursement, other). */
router.post("/portal/claims", async (c) => {
  const tenant = await resolvePortalTenant(c);
  const data = await parseBody(c, portalClaimInput);
  const context = await requirePortalLease(tenant.id);
  const [claim] = await getDb().insert(claims).values({
    tenantId: tenant.id,
    apartmentId: context.apartment.id,
    buildingId: context.building.id,
    title: data.title,
    description: data.description,
    type: data.type,
    amount: data.amount == null ? null : String(data.amount),
    photoUrl: data.photoUrl ?? null,
    status: "pending",
  }).returning();
  await notifyBuildingTeam(context.building, {
    type: "claim.created",
    title: `Nouvelle réclamation : ${data.title}`,
    body: `${tenant.fullName} · ${context.apartment.unitNumber}`,
    href: "/claims",
  });
  return c.json({ data: claim }, 201);
});

router.get("/portal/claims", async (c) => {
  const tenant = await resolvePortalTenant(c);
  const rows = await getDb()
    .select()
    .from(claims)
    .where(eq(claims.tenantId, tenant.id))
    .orderBy(desc(claims.createdAt));
  return c.json({ data: rows });
});

/** A payment belongs to the portal tenant if its lease is one of theirs. */
async function getOwnedPayment(id: string, tenantId: string) {
  const db = getDb();
  const [row] = await db
    .select({ payment: payments, tenant: tenants, building: buildings, apartment: apartments })
    .from(payments)
    .innerJoin(leases, eq(payments.leaseId, leases.id))
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .where(and(eq(payments.id, id), eq(leases.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Paiement introuvable." });
  return row;
}

router.post("/portal/payments/:id/create-link", async (c) => {
  const tenant = await resolvePortalTenant(c);
  const id = parseUuid(c.req.param("id"), "payment id");
  const { provider } = await parseBody(c, z.object({ provider: z.enum(["paytech", "paydunya", "fedapay"]) }));
  const { payment, building, apartment } = await getOwnedPayment(id, tenant.id);
  if (payment.status === "paid") throw new HTTPException(409, { message: "Ce paiement est déjà réglé." });

  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(c.req.url).origin;
  const reference = `NAYA-${id}`;
  let link: Awaited<ReturnType<typeof createPaymentLink>>;
  try {
    link = await createPaymentLink(provider as PaymentProviderName, {
      amount: Number(payment.amount),
      reference,
      customerName: tenant.fullName,
      customerPhone: tenant.whatsappNumber ?? tenant.phone,
      returnUrl: `${baseUrl}/espace-locataire`,
      notificationUrl: `${baseUrl}/api/webhooks/payments/${provider}`,
    });
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      throw new HTTPException(503, { message: error.message });
    }
    throw error;
  }
  await getDb().update(payments).set({ transactionRef: reference, status: "pending" }).where(eq(payments.id, id));
  await notifyBuildingTeam(building, {
    type: "payment.link_requested",
    title: `Demande de paiement — ${building.name} · ${apartment.unitNumber}`,
    body: `${tenant.fullName} a généré un lien de paiement mobile money.`,
    href: "/payments",
  });
  return c.json({ data: link });
});

router.get("/portal/payments/:id/receipt.pdf", async (c) => {
  const tenant = await resolvePortalTenant(c);
  const id = parseUuid(c.req.param("id"), "payment id");
  const { payment, building, apartment } = await getOwnedPayment(id, tenant.id);
  if (payment.status !== "paid") throw new HTTPException(409, { message: "Le reçu n’est disponible que pour les paiements réglés." });

  const receiptNumber = `NAYA-${id.slice(0, 8).toUpperCase()}`;
  const pdf = await createReceiptPdf({
    receiptNumber,
    issuedAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date()),
    tenantName: tenant.fullName,
    buildingName: building.name,
    unitNumber: apartment.unitNumber,
    amount: `${Number(payment.amount).toLocaleString("fr-FR")} FCFA`,
    method: payment.paymentMethod,
    transactionRef: payment.transactionRef,
    branding: await loadAgencyBranding(building.organizationId),
  });
  await getDb().update(payments).set({ receiptUrl: `/api/portal/payments/${id}/receipt.pdf` }).where(eq(payments.id, id));
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recu-${receiptNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

export default router;

import { and, count, desc, eq, gte, ilike, inArray, lte, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, leases, prospectActivities, prospectReservations, prospects, prospectVisits, tenants, users } from "@/db/schema";
import { leaseBlocks, rangesConflict, rangesOverlap } from "@/server/lib/availability";
import { buildingAccessCondition, prospectScope, requireActor, requireRole } from "@/server/lib/auth-context";
import { requireActiveSubscription } from "@/server/lib/subscription-access";
import { countValue, pagination, parseBody, parseUuid } from "@/server/lib/http";
import { phoneKey, phoneMatches } from "@/server/lib/tenant-auth";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const propertyTypes = ["studio", "chambre", "apartment", "house", "commercial", "other"] as const;
const prospectStatuses = ["new", "contacted", "notified", "visit_scheduled", "visited", "negotiation", "lost"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nullableText =
  (max: number) => z.string().trim().max(max).nullable().optional();

const prospectInput = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(6).max(32),
  whatsappNumber: z.string().trim().min(6).max(32).nullable().optional(),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  preferredContact: z.string().trim().max(32).nullable().optional(),
  notes: nullableText(10000),
  propertyType: z.enum(propertyTypes).nullable().optional(),
  location: nullableText(160),
  budgetMin: z.number().min(0).nullable().optional(),
  budgetMax: z.number().min(0).nullable().optional(),
  bedrooms: z.number().int().min(0).max(50).nullable().optional(),
  furnished: z.boolean().nullable().optional(),
  moveInDate: isoDate.nullable().optional(),
  amenities: z.array(z.string().trim().max(40)).max(30).nullable().optional(),
  requirements: nullableText(20000),
  // Bypasses duplicate detection on purpose: the manager reviewed the existing
  // records and decided a separate prospect is warranted.
  force: z.boolean().optional(),
});

const prospectPatch = prospectInput.partial();

const statusChange = z.object({
  status: z.enum(prospectStatuses),
  note: nullableText(2000),
});

const activityInput = z.object({
  kind: z.enum(["contact", "note", "notified", "other"]),
  note: nullableText(5000),
  apartmentId: z.string().uuid().nullable().optional(),
});

/** Normalized phone key; `""` when the number is too short to compare. */
function keyOf(value: string | null | undefined) {
  const key = phoneKey(value);
  return key.length < 7 ? "" : key;
}

function matchesPhone(prospect: typeof prospects.$inferSelect, phone: string) {
  const probe = keyOf(phone);
  if (!probe) return false;
  return keyOf(prospect.phone) === probe || phoneMatches(phoneKey(prospect.phone), phoneKey(phone));
}

async function requireProspectForActor(actor: Awaited<ReturnType<typeof requireActor>>, id: string) {
  const db = getDb();
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.id, id), prospectScope(actor)))
    .limit(1);
  if (!prospect) throw new HTTPException(404, { message: "Prospect introuvable." });
  return prospect;
}

async function findDuplicates(scope: ReturnType<typeof prospectScope>, phone: string) {
  if (!keyOf(phone)) return [];
  const rows = await getDb().select().from(prospects).where(scope);
  return rows.filter((row) => matchesPhone(row, phone));
}

router.get("/prospects", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const conditions = [prospectScope(actor)];
  const q = c.req.query("q")?.trim();
  if (q) {
    conditions.push(
      or(
        ilike(prospects.fullName, `%${q}%`),
        ilike(prospects.phone, `%${q}%`),
        ilike(prospects.email, `%${q}%`),
        ilike(prospects.location, `%${q}%`),
      )!,
    );
  }
  const status = c.req.query("status");
  if (status && [...prospectStatuses, "converted"].includes(status)) {
    conditions.push(eq(prospects.status, status as (typeof prospectStatuses)[number] | "converted"));
  }
  const propertyType = c.req.query("propertyType");
  if (propertyType && (propertyTypes as readonly string[]).includes(propertyType)) {
    conditions.push(eq(prospects.propertyType, propertyType as (typeof propertyTypes)[number]));
  }
  const location = c.req.query("location")?.trim();
  if (location) conditions.push(ilike(prospects.location, `%${location}%`));
  const budgetMin = Number(c.req.query("budgetMin"));
  if (Number.isFinite(budgetMin)) conditions.push(gte(prospects.budgetMax, String(budgetMin)));
  const budgetMax = Number(c.req.query("budgetMax"));
  if (Number.isFinite(budgetMax)) conditions.push(lte(prospects.budgetMin, String(budgetMax)));
  const moveInDate = c.req.query("moveInDate");
  if (moveInDate && /^\d{4}-\d{2}-\d{2}$/.test(moveInDate)) conditions.push(eq(prospects.moveInDate, moveInDate));

  const where = and(...conditions);
  const db = getDb();
  const [data, countRows] = await Promise.all([
    db.select().from(prospects).where(where).orderBy(desc(prospects.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(prospects).where(where),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

/** Potential duplicates for a phone number, so the manager can review before creating another prospect. */
router.get("/prospects/duplicates", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const phone = c.req.query("phone")?.trim() ?? "";
  const data = await findDuplicates(prospectScope(actor), phone);
  return c.json({ data });
});

// --- Matching, availability and occupancy ---

/** `YYYY-MM-DD` for today (dates are stored as plain calendar dates). */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type LeaseBlock = Pick<typeof leases.$inferSelect, "id" | "endDate" | "status" | "moveOutConfirmed" | "tenantId">;
type ReservationBlock = Pick<typeof prospectReservations.$inferSelect, "id" | "startDate" | "endDate" | "status" | "prospectId">;

/** Confirmed reservations and still-occupied leases that make a date unusable. */
function apartmentBlockers(
  apartmentLeases: LeaseBlock[],
  apartmentReservations: ReservationBlock[],
  startDate: string,
  excludingProspectId?: string,
) {
  const blockers: Array<{ type: "lease" | "reservation"; label: string }> = [];
  for (const lease of apartmentLeases) {
    if (leaseBlocks(lease, startDate)) {
      blockers.push({
        type: "lease",
        label: lease.endDate
          ? `Bail en cours jusqu’au ${lease.endDate}${lease.moveOutConfirmed ? " (départ confirmé)" : " (départ non confirmé)"}`
          : "Bail en cours sans date de fin",
      });
    }
  }
  for (const reservation of apartmentReservations) {
    if (reservation.prospectId === excludingProspectId) continue;
    if (reservation.status !== "confirmed") continue;
    if (rangesOverlap(startDate, startDate, reservation.startDate, reservation.endDate)) {
      blockers.push({ type: "reservation", label: `Réservation confirmée du ${reservation.startDate} au ${reservation.endDate}` });
    }
  }
  return blockers;
}

const propertyTypeLabel = (value: string) =>
  ({ studio: "Studio", chambre: "Chambre", apartment: "Appartement", house: "Maison", commercial: "Local commercial", other: "Autre" }[value] ?? value);

/**
 * Weighted matching between one apartment and one prospect's requirements.
 * Preferences are scored, not hard filters: a mismatch lowers the score and is
 * reported as an `issue` so the manager decides whether to override it.
 */
function scoreApartment(
  apartment: Pick<typeof apartments.$inferSelect, "id" | "type" | "furnished" | "bedrooms" | "rentAmount" | "amenities">,
  building: Pick<typeof buildings.$inferSelect, "city" | "address">,
  prospect: Pick<typeof prospects.$inferSelect, "propertyType" | "furnished" | "bedrooms" | "budgetMin" | "budgetMax" | "amenities" | "location">,
) {
  const reasons: string[] = [];
  const issues: string[] = [];
  let score = 0;
  const rent = Number(apartment.rentAmount);

  if (prospect.propertyType && prospect.propertyType !== "other") {
    if (apartment.type === prospect.propertyType) {
      score += 30;
      reasons.push(`${propertyTypeLabel(apartment.type)} demandé`);
    } else {
      issues.push(`Type différent (${propertyTypeLabel(apartment.type)})`);
    }
  }

  if (prospect.furnished != null) {
    if (apartment.furnished === prospect.furnished) {
      score += 15;
      reasons.push(prospect.furnished ? "Meublé" : "Non meublé");
    } else {
      issues.push(prospect.furnished ? "Non meublé" : "Meublé");
    }
  }

  if (prospect.bedrooms != null) {
    if (apartment.bedrooms >= prospect.bedrooms) {
      score += 20;
      score += apartment.bedrooms === prospect.bedrooms ? 5 : 0;
      reasons.push(`${apartment.bedrooms} chambre(s)`);
    } else {
      issues.push(`Seulement ${apartment.bedrooms} chambre(s)`);
    }
  }

  if (prospect.budgetMax != null) {
    const max = Number(prospect.budgetMax);
    if (rent <= max) {
      score += 20;
      const min = prospect.budgetMin == null ? null : Number(prospect.budgetMin);
      if (min != null && rent >= min) {
        score += 5;
        reasons.push("Loyer dans la fourchette budgétaire");
      } else {
        reasons.push("Loyer sous le budget maximal");
      }
    } else {
      issues.push(`Loyer de ${rent.toLocaleString("fr-FR")} F au-dessus du budget (${max.toLocaleString("fr-FR")} F)`);
    }
  }

  const wanted = new Set((prospect.amenities ?? []).map((amenity) => amenity.toLowerCase()));
  if (wanted.size > 0) {
    let hits = 0;
    for (const amenity of apartment.amenities ?? []) {
      if (wanted.has(amenity.toLowerCase())) hits += 1;
    }
    if (hits > 0) {
      score += Math.min(hits * 5, 20);
      reasons.push(hits === 1 ? "1 commodité correspondante" : `${hits} commodités correspondantes`);
    } else {
      issues.push("Aucune commodité demandée présente");
    }
  }

  if (prospect.location) {
    const wantedLocation = prospect.location.toLowerCase();
    const city = (building.city ?? "").toLowerCase();
    const address = (building.address ?? "").toLowerCase();
    if ((city && (city.includes(wantedLocation) || wantedLocation.includes(city))) || address.includes(wantedLocation)) {
      score += 25;
      reasons.push("Localisation correspondante");
    } else {
      issues.push("Localisation différente");
    }
  }

  return { score, reasons, issues };
}

/**
 * Matching view, centred on either side:
 * `GET /prospects/matching?prospectId=…` ranks apartments for a prospect
 * (used right after a visit or from the apartment page to find candidates),
 * and `GET /prospects/matching?apartmentId=…` ranks prospects for an
 * apartment (used when an apartment becomes available). Availability is
 * computed from leases and confirmed reservations, not from the apartment's
 * status flag.
 */
router.get("/prospects/matching", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();
  const prospectIdParam = c.req.query("prospectId");
  const apartmentIdParam = c.req.query("apartmentId");

  if (prospectIdParam) {
    const prospect = await requireProspectForActor(actor, parseUuid(prospectIdParam, "prospect id"));
    const scope = buildingAccessCondition(actor);
    const [apartmentRows, leaseRows, reservationRows] = await Promise.all([
      db.select().from(apartments).innerJoin(buildings, eq(apartments.buildingId, buildings.id)).where(scope),
      db
        .select({ lease: leases, apartmentId: apartments.id })
        .from(leases)
        .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
        .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
        .where(scope),
      db
        .select({ reservation: prospectReservations, apartmentId: apartments.id })
        .from(prospectReservations)
        .innerJoin(apartments, eq(prospectReservations.apartmentId, apartments.id))
        .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
        .where(scope),
    ]);
    const leasesByApartment = new Map<string, LeaseBlock[]>();
    for (const row of leaseRows) {
      const list = leasesByApartment.get(row.apartmentId) ?? [];
      list.push(row.lease);
      leasesByApartment.set(row.apartmentId, list);
    }
    const reservationsByApartment = new Map<string, ReservationBlock[]>();
    for (const row of reservationRows) {
      const list = reservationsByApartment.get(row.apartmentId) ?? [];
      list.push(row.reservation);
      reservationsByApartment.set(row.apartmentId, list);
    }
    const moveIn = prospect.moveInDate ?? null;
    const data = apartmentRows
      .map(({ apartments: apartment, buildings: building }) => ({
        apartment,
        building,
        ...scoreApartment(apartment, building, prospect),
        availableNow: apartmentBlockers(leasesByApartment.get(apartment.id) ?? [], reservationsByApartment.get(apartment.id) ?? [], todayIso(), prospect.id).length === 0,
        availableAtMoveIn: apartmentBlockers(leasesByApartment.get(apartment.id) ?? [], reservationsByApartment.get(apartment.id) ?? [], moveIn ?? todayIso(), prospect.id).length === 0,
      }))
      .sort((a, b) => b.score - a.score);
    return c.json({ data });
  }

  const apartmentId = parseUuid(apartmentIdParam ?? "", "apartment id");
  const [aptRow] = await db
    .select()
    .from(apartments)
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .where(and(eq(apartments.id, apartmentId), buildingAccessCondition(actor)))
    .limit(1);
  if (!aptRow) throw new HTTPException(404, { message: "Appartement introuvable." });
  const { apartments: apartment, buildings: building } = aptRow;
  const [prospectRows, leaseRows, reservationRows] = await Promise.all([
    db.select().from(prospects).where(prospectScope(actor)),
    db.select().from(leases).where(eq(leases.apartmentId, apartment.id)),
    db.select().from(prospectReservations).where(eq(prospectReservations.apartmentId, apartment.id)),
  ]);
  const data = prospectRows
    .map((prospect) => ({
      prospect,
      ...scoreApartment(apartment, building, prospect),
      availableNow: apartmentBlockers(leaseRows, reservationRows, todayIso(), prospect.id).length === 0,
      availableAtMoveIn: apartmentBlockers(leaseRows, reservationRows, prospect.moveInDate ?? todayIso(), prospect.id).length === 0,
    }))
    .sort((a, b) => b.score - a.score);
  return c.json({ data });
});

router.get("/prospects/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "prospect id");
  const prospect = await requireProspectForActor(actor, id);
  const db = getDb();
  const [creator, activities, visits, reservations] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, prospect.createdBy)).limit(1),
    db.select().from(prospectActivities).where(eq(prospectActivities.prospectId, prospect.id)).orderBy(desc(prospectActivities.createdAt)),
    db.select().from(prospectVisits).where(eq(prospectVisits.prospectId, prospect.id)).orderBy(desc(prospectVisits.scheduledAt)),
    db.select().from(prospectReservations).where(eq(prospectReservations.prospectId, prospect.id)).orderBy(desc(prospectReservations.startDate)),
  ]);
  return c.json({ data: { ...prospect, creator: creator[0] ?? null, activities, visits, reservations } });
});

router.post("/prospects", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  await requireActiveSubscription(actor);
  const data = await parseBody(c, prospectInput);
  if (!data.force) {
    const duplicates = await findDuplicates(prospectScope(actor), data.phone);
    if (duplicates.length > 0) {
      return c.json({ error: "Un prospect avec ce numéro existe déjà.", data: { duplicates } }, 409);
    }
  }
  const db = getDb();
  const [prospect] = await db.insert(prospects).values({
    fullName: data.fullName,
    phone: data.phone,
    whatsappNumber: data.whatsappNumber ?? null,
    email: data.email ?? null,
    preferredContact: data.preferredContact ?? null,
    notes: data.notes ?? null,
    propertyType: data.propertyType ?? null,
    location: data.location ?? null,
    budgetMin: data.budgetMin == null ? null : String(data.budgetMin),
    budgetMax: data.budgetMax == null ? null : String(data.budgetMax),
    bedrooms: data.bedrooms ?? null,
    furnished: data.furnished ?? null,
    moveInDate: data.moveInDate ?? null,
    amenities: data.amenities ?? [],
    requirements: data.requirements ?? null,
    status: "new",
    createdBy: actor.id,
    organizationId: actor.organizationId,
  }).returning();
  if (!prospect) throw new HTTPException(500, { message: "L’enregistrement du prospect a échoué." });
  await db.insert(prospectActivities).values({
    prospectId: prospect.id,
    kind: "created",
    actorId: actor.id,
    toStatus: "new",
    note: "Prospect enregistré.",
  });
  return c.json({ data: prospect }, 201);
});

router.patch("/prospects/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "prospect id");
  const data = await parseBody(c, prospectPatch);
  const existing = await requireProspectForActor(actor, id);
  if (existing.convertedTenantId && data.fullName) {
    // Contact details stay editable; identity-level fields are locked once the
    // prospect is a tenant so the tenant record remains the source of truth.
  }
  const db = getDb();
  const [prospect] = await db
    .update(prospects)
    .set({
      ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.whatsappNumber !== undefined ? { whatsappNumber: data.whatsappNumber ?? null } : {}),
      ...(data.email !== undefined ? { email: data.email ?? null } : {}),
      ...(data.preferredContact !== undefined ? { preferredContact: data.preferredContact ?? null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      ...(data.propertyType !== undefined ? { propertyType: data.propertyType ?? null } : {}),
      ...(data.location !== undefined ? { location: data.location ?? null } : {}),
      ...(data.budgetMin !== undefined ? { budgetMin: data.budgetMin == null ? null : String(data.budgetMin) } : {}),
      ...(data.budgetMax !== undefined ? { budgetMax: data.budgetMax == null ? null : String(data.budgetMax) } : {}),
      ...(data.bedrooms !== undefined ? { bedrooms: data.bedrooms ?? null } : {}),
      ...(data.furnished !== undefined ? { furnished: data.furnished ?? null } : {}),
      ...(data.moveInDate !== undefined ? { moveInDate: data.moveInDate ?? null } : {}),
      ...(data.amenities !== undefined ? { amenities: data.amenities ?? [] } : {}),
      ...(data.requirements !== undefined ? { requirements: data.requirements ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, id))
    .returning();
  return c.json({ data: prospect });
});

router.post("/prospects/:id/status", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "prospect id");
  const data = await parseBody(c, statusChange);
  const existing = await requireProspectForActor(actor, id);
  if (existing.convertedTenantId && data.status !== "lost") {
    throw new HTTPException(409, { message: "Ce prospect est déjà converti en locataire." });
  }
  const db = getDb();
  const [prospect] = await db
    .update(prospects)
    .set({ status: data.status, updatedAt: new Date() })
    .where(eq(prospects.id, id))
    .returning();
  await db.insert(prospectActivities).values({
    prospectId: id,
    kind: data.status === "lost" ? "lost" : "status_change",
    actorId: actor.id,
    fromStatus: existing.status,
    toStatus: data.status,
    note: data.note ?? null,
  });
  return c.json({ data: prospect });
});

/** Record a contact attempt, an important note, or a notification about a suitable apartment. */
router.post("/prospects/:id/activities", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "prospect id");
  const data = await parseBody(c, activityInput);
  await requireProspectForActor(actor, id);
  if (data.apartmentId) {
    // The apartment reference is part of the audit record: an out-of-scope
    // apartment here would leak its existence, so it must resolve like a
    // belonging check rather than an existence probe.
    const [apartment] = await getDb()
      .select({ id: apartments.id })
      .from(apartments)
      .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
      .where(and(eq(apartments.id, data.apartmentId), buildingAccessCondition(actor)))
      .limit(1);
    if (!apartment) throw new HTTPException(404, { message: "Appartement introuvable." });
  }
  const db = getDb();
  const [activity] = await db.insert(prospectActivities).values({
    prospectId: id,
    kind: data.kind,
    actorId: actor.id,
    apartmentId: data.apartmentId ?? null,
    note: data.note ?? null,
  }).returning();
  return c.json({ data: activity }, 201);
});

router.delete("/prospects/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "prospect id");
  const prospect = await requireProspectForActor(actor, id);
  if (prospect.convertedTenantId) {
    throw new HTTPException(409, { message: "Ce prospect a été converti : supprimez son bail et son locataire pour le purger." });
  }
  const [deleted] = await getDb().delete(prospects).where(eq(prospects.id, id)).returning({ id: prospects.id });
  if (!deleted) throw new HTTPException(404, { message: "Prospect introuvable." });
  return c.body(null, 204);
});

// --- Visits ---

const datetimeLike = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);

/** The UI sends a naive local datetime; give it a Z suffix so Postgres stores a clear instant. */
function toIsoDatetime(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return /(Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
}

const visitInput = z.object({
  apartmentId: z.string().uuid().nullable().optional(),
  scheduledAt: datetimeLike,
  notes: nullableText(5000),
});

const visitPatch = z.object({
  apartmentId: z.string().uuid().nullable().optional(),
  scheduledAt: datetimeLike.optional(),
  status: z.enum(["scheduled", "completed", "cancelled", "missed"]).optional(),
  notes: nullableText(5000),
  outcome: nullableText(5000),
});

const visitProspectStatusRank = { new: 0, contacted: 1, notified: 2, visit_scheduled: 3, visited: 4, negotiation: 5, converted: 6, lost: 7 } as const;
const currentRank = (status: string) => visitProspectStatusRank[status as keyof typeof visitProspectStatusRank] ?? 0;

async function requireScopedApartment(actor: Awaited<ReturnType<typeof requireActor>>, apartmentId: string) {
  const [apartment] = await getDb()
    .select({ id: apartments.id })
    .from(apartments)
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .where(and(eq(apartments.id, apartmentId), buildingAccessCondition(actor)))
    .limit(1);
  if (!apartment) throw new HTTPException(404, { message: "Appartement introuvable." });
}

/** A visit update must resolve to a prospect the actor can see, else a 404 hides it. */
async function requireScopedVisit(actor: Awaited<ReturnType<typeof requireActor>>, visitId: string) {
  const [row] = await getDb()
    .select({ visit: prospectVisits, prospect: prospects })
    .from(prospectVisits)
    .innerJoin(prospects, eq(prospectVisits.prospectId, prospects.id))
    .where(and(eq(prospectVisits.id, visitId), prospectScope(actor)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Visite introuvable." });
  return row;
}

router.post("/prospects/:id/visits", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "prospect id");
  const data = await parseBody(c, visitInput);
  const prospect = await requireProspectForActor(actor, id);
  if (prospect.convertedTenantId) {
    throw new HTTPException(409, { message: "Ce prospect est déjà converti en locataire." });
  }
  if (data.apartmentId) await requireScopedApartment(actor, data.apartmentId);
  const db = getDb();
  const [visit] = await db.insert(prospectVisits).values({
    prospectId: id,
    apartmentId: data.apartmentId ?? null,
    scheduledAt: new Date(toIsoDatetime(data.scheduledAt)),
    notes: data.notes ?? null,
    createdById: actor.id,
  }).returning();
  if (!visit) throw new HTTPException(500, { message: "L’enregistrement de la visite a échoué." });
  if (currentRank(prospect.status) < currentRank("visit_scheduled")) {
    await db.update(prospects).set({ status: "visit_scheduled", updatedAt: new Date() }).where(eq(prospects.id, id));
  }
  await db.insert(prospectActivities).values({
    prospectId: id,
    kind: "visit_scheduled",
    actorId: actor.id,
    toStatus: currentRank(prospect.status) < currentRank("visit_scheduled") ? "visit_scheduled" : prospect.status,
    apartmentId: data.apartmentId ?? null,
    note: `Visite prévue le ${data.scheduledAt}.`,
  });
  return c.json({ data: visit }, 201);
});

router.patch("/prospects/visits/:visitId", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const visitId = parseUuid(c.req.param("visitId"), "visit id");
  const data = await parseBody(c, visitPatch);
  const { visit, prospect } = await requireScopedVisit(actor, visitId);
  if (data.apartmentId && data.apartmentId !== visit.apartmentId) await requireScopedApartment(actor, data.apartmentId);
  const db = getDb();
  const [updated] = await db.update(prospectVisits).set({
    ...(data.apartmentId !== undefined ? { apartmentId: data.apartmentId ?? null } : {}),
    ...(data.scheduledAt !== undefined ? { scheduledAt: new Date(toIsoDatetime(data.scheduledAt)) } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
    ...(data.outcome !== undefined ? { outcome: data.outcome ?? null } : {}),
    updatedAt: new Date(),
  }).where(eq(prospectVisits.id, visitId)).returning();
  const nextStatus = data.status ?? visit.status;
  if (nextStatus === "completed" && currentRank(prospect.status) < currentRank("visited")) {
    await db.update(prospects).set({ status: "visited", updatedAt: new Date() }).where(eq(prospects.id, prospect.id));
  } else if (nextStatus === "scheduled" && currentRank(prospect.status) < currentRank("visit_scheduled")) {
    await db.update(prospects).set({ status: "visit_scheduled", updatedAt: new Date() }).where(eq(prospects.id, prospect.id));
  }
  await db.insert(prospectActivities).values({
    prospectId: prospect.id,
    kind: nextStatus === "completed" ? "visit_completed" : nextStatus === "cancelled" ? "visit_cancelled" : nextStatus === "missed" ? "visit_missed" : "other",
    actorId: actor.id,
    apartmentId: visit.apartmentId,
    note: data.outcome ?? (nextStatus === "completed" ? "Visite effectuée." : nextStatus === "cancelled" ? "Visite annulée." : nextStatus === "missed" ? "Visite manquée." : "Visite reprogrammée."),
  });
  return c.json({ data: updated });
});

// --- Reservations ---

const reservationInputBase = z.object({
  apartmentId: z.string().uuid().nullable().optional(),
  startDate: isoDate,
  endDate: isoDate,
  status: z.enum(["tentative", "confirmed"]).optional(),
  notes: nullableText(5000),
});

const reservationInput = reservationInputBase.superRefine((value, ctx) => {
  if (value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "La date de fin doit être postérieure au début." });
  }
});

const reservationPatch = reservationInputBase.partial().superRefine((value, ctx) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "La date de fin doit être postérieure au début." });
  }
});

/**
 * A confirmed reservation must not overlap another confirmed reservation on the
 * same unit. Tentative holds intentionally may overlap — they are provisional
 * holds, and confirming one over another is the manager's arbitration (spec 1.6).
 */
async function assertNoReservationConflict(
  apartmentId: string,
  startDate: string,
  endDate: string,
  excludeReservationId?: string,
) {
  const conditions = [eq(prospectReservations.apartmentId, apartmentId), eq(prospectReservations.status, "confirmed")];
  if (excludeReservationId) conditions.push(ne(prospectReservations.id, excludeReservationId));
  const rows = await getDb()
    .select({ startDate: prospectReservations.startDate, endDate: prospectReservations.endDate })
    .from(prospectReservations)
    .where(and(...conditions));
  const conflict = rows.some((row) =>
    rangesConflict({ startDate, endDate }, { startDate: row.startDate, endDate: row.endDate }),
  );
  if (conflict) {
    throw new HTTPException(409, { message: "Une réservation confirmée chevauche déjà cette période pour cet appartement." });
  }
}

router.post("/prospects/:id/reservations", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "prospect id");
  const data = await parseBody(c, reservationInput);
  const prospect = await requireProspectForActor(actor, id);
  if (prospect.convertedTenantId) {
    throw new HTTPException(409, { message: "Ce prospect est déjà converti en locataire." });
  }
  if (data.apartmentId) await requireScopedApartment(actor, data.apartmentId);
  if ((data.status ?? "tentative") === "confirmed" && data.apartmentId) {
    await assertNoReservationConflict(data.apartmentId, data.startDate, data.endDate);
  }
  const [reservation] = await getDb().insert(prospectReservations).values({
    prospectId: id,
    apartmentId: data.apartmentId ?? null,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status ?? "tentative",
    notes: data.notes ?? null,
    createdById: actor.id,
  }).returning();
  return c.json({ data: reservation }, 201);
});

router.patch("/prospects/reservations/:reservationId", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const reservationId = parseUuid(c.req.param("reservationId"), "reservation id");
  const data = await parseBody(c, reservationPatch);
  const [row] = await getDb()
    .select({ reservation: prospectReservations })
    .from(prospectReservations)
    .innerJoin(prospects, eq(prospectReservations.prospectId, prospects.id))
    .where(and(eq(prospectReservations.id, reservationId), prospectScope(actor)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Réservation introuvable." });
  if (data.apartmentId && data.apartmentId !== row.reservation.apartmentId) await requireScopedApartment(actor, data.apartmentId);
  const targetApartmentId = data.apartmentId ?? row.reservation.apartmentId;
  const targetStart = data.startDate ?? row.reservation.startDate;
  const targetEnd = data.endDate ?? row.reservation.endDate;
  if ((data.status ?? row.reservation.status) === "confirmed" && targetApartmentId) {
    await assertNoReservationConflict(targetApartmentId, targetStart, targetEnd, reservationId);
  }
  const [updated] = await getDb().update(prospectReservations).set({
    ...(data.apartmentId !== undefined ? { apartmentId: data.apartmentId ?? null } : {}),
    ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
    ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
    updatedAt: new Date(),
  }).where(eq(prospectReservations.id, reservationId)).returning();
  return c.json({ data: updated });
});

router.delete("/prospects/reservations/:reservationId", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const reservationId = parseUuid(c.req.param("reservationId"), "reservation id");
  const [row] = await getDb()
    .select({ reservation: prospectReservations })
    .from(prospectReservations)
    .innerJoin(prospects, eq(prospectReservations.prospectId, prospects.id))
    .where(and(eq(prospectReservations.id, reservationId), prospectScope(actor)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Réservation introuvable." });
  await getDb().delete(prospectReservations).where(eq(prospectReservations.id, reservationId));
  return c.body(null, 204);
});

// --- Conversion ---

const convertInput = z.object({
  apartmentId: z.string().uuid(),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  rentAmount: z.number().positive(),
  depositAmount: z.number().min(0).default(0),
  // The manager can complete missing tenant information before the tenant is created.
  fullName: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().min(6).max(32).optional(),
  whatsappNumber: z.string().trim().min(6).max(32).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "La date de fin doit être postérieure au début." });
  }
});

/**
 * Turn a prospect into a tenant in a single transaction.
 *
 * The apartment row is locked (`SELECT … FOR UPDATE`) so two managers cannot
 * both pass the availability check and each leave a tenant. Availability is
 * date-range based: an active lease blocks until a confirmed move-out allows a
 * rental after its end date; a confirmed reservation blocks an overlapping
 * start. A future start date creates a `draft` lease and does not touch the
 * apartment's status — the apartment is not marked occupied before the tenancy
 * actually begins.
 */
router.post("/prospects/:id/convert", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "prospect id");
  const data = await parseBody(c, convertInput);
  const existing = await requireProspectForActor(actor, id);
  if (existing.convertedTenantId) {
    throw new HTTPException(409, { message: "Ce prospect est déjà converti en locataire." });
  }
  const db = getDb();
  const dataOut = await db.transaction(async (tx) => {
    const [lockedProspect] = await tx.select().from(prospects).where(eq(prospects.id, id)).for("update").limit(1);
    if (!lockedProspect) throw new HTTPException(404, { message: "Prospect introuvable." });
    if (lockedProspect.convertedTenantId) {
      throw new HTTPException(409, { message: "Ce prospect est déjà converti en locataire." });
    }

    const [aptRow] = await tx
      .select({ apartment: apartments, building: buildings })
      .from(apartments)
      .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
      .where(and(eq(apartments.id, data.apartmentId), buildingAccessCondition(actor)))
      .for("update")
      .limit(1);
    if (!aptRow) throw new HTTPException(404, { message: "Appartement introuvable." });
    const { apartment, building } = aptRow;

    const [apartmentLeases, apartmentReservations] = await Promise.all([
      tx.select().from(leases).where(eq(leases.apartmentId, apartment.id)),
      tx.select().from(prospectReservations).where(eq(prospectReservations.apartmentId, apartment.id)),
    ]);
    const blockers = apartmentBlockers(apartmentLeases, apartmentReservations, data.startDate, lockedProspect.id);
    if (blockers.length > 0) {
      throw new HTTPException(409, {
        message: "L’appartement n’est pas disponible à cette date.",
        cause: { blockers, building: building.name, unitNumber: apartment.unitNumber },
      });
    }

    const [tenant] = await tx.insert(tenants).values({
      fullName: data.fullName ?? lockedProspect.fullName,
      phone: data.phone ?? lockedProspect.phone,
      whatsappNumber: data.whatsappNumber ?? lockedProspect.whatsappNumber,
      createdBy: actor.id,
      organizationId: actor.organizationId,
    }).returning();
    if (!tenant) throw new HTTPException(500, { message: "La création du locataire a échoué." });

    const startsTodayOrBefore = data.startDate <= todayIso();
    const [lease] = await tx.insert(leases).values({
      apartmentId: apartment.id,
      tenantId: tenant.id,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      moveOutConfirmed: false,
      rentAmount: String(data.rentAmount),
      depositAmount: String(data.depositAmount),
      status: startsTodayOrBefore ? "active" : "draft",
    }).returning();
    if (!lease) throw new HTTPException(500, { message: "La création du bail a échoué." });

    if (startsTodayOrBefore) {
      await tx.update(apartments).set({ status: "occupied" }).where(eq(apartments.id, apartment.id));
    }

    const [prospect] = await tx.update(prospects).set({
      status: "converted",
      convertedTenantId: tenant.id,
      convertedLeaseId: lease.id,
      updatedAt: new Date(),
    }).where(eq(prospects.id, lockedProspect.id)).returning();

    await tx.insert(prospectActivities).values({
      prospectId: lockedProspect.id,
      kind: "converted",
      actorId: actor.id,
      fromStatus: lockedProspect.status,
      toStatus: "converted",
      apartmentId: apartment.id,
      note: `Converti en locataire${startsTodayOrBefore ? "" : " (bail futur)"} à partir du ${data.startDate}${data.endDate ? ` jusqu’au ${data.endDate}` : ""}.`,
    });

    return { prospect, tenant, lease, apartment: startsTodayOrBefore ? { ...apartment, status: "occupied" } : apartment };
  }).catch((error) => {
    if (error instanceof HTTPException && error.status === 409) {
      const cause = error.cause as { blockers?: Array<{ type: "lease" | "reservation"; label: string }> } | undefined;
      // The default HTTPException body is plain text; a structured payload lets
      // the conversion dialog list exactly what blocks the allocation.
      return { __conflict: true, message: error.message, blockers: cause?.blockers ?? [] };
    }
    throw error;
  });
  if (dataOut && typeof dataOut === "object" && "__conflict" in dataOut && dataOut.__conflict) {
    return c.json({ error: dataOut.message, data: { blockers: dataOut.blockers } }, 409);
  }
  return c.json({ data: dataOut }, 201);
});

export default router;
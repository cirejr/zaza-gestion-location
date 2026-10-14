import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb } from "@/db";
import {
  apartments,
  authSessions,
  authUsers,
  buildings,
  financialAccounts,
  financialTransactions,
  leases,
  organizationMembers,
  organizations,
  prospects,
  tenants,
  users,
  type User,
} from "@/db/schema";
import { isPortalEmail } from "@/lib/auth";
import { assertAgencyActorAllowed } from "@/server/lib/agency-policy";
import { ensureOrganizationProfile } from "@/server/lib/organization";
import type { RequestContext } from "@/server/lib/http";

export type DomainUser = typeof users.$inferSelect;
export type AppRole = "owner" | "manager" | "tenant";

/**
 * A domain user whose agency has been resolved. The agency (`organizationId`)
 * is the isolation boundary every scoped query keys off; `requireActor` is the
 * only place it is resolved, so `null` never reaches a call site.
 */
export type AgencyActor = DomainUser & { organizationId: string };

/** URL-safe, unique organization slug (a short id suffix guarantees uniqueness). */
function slugify(name: string, id: string) {
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

/** Create an agency and return its id. */
async function createOrganization(name: string): Promise<string> {
  const id = randomUUID();
  await getDb().insert(organizations).values({ id, name, slug: slugify(name, id) });
  return id;
}

/** Keep the live session's active organization aligned with the domain row. */
async function markSessionOrganization(authUserId: string, organizationId: string) {
  await getDb()
    .update(authSessions)
    .set({ activeOrganizationId: organizationId, updatedAt: new Date() })
    .where(eq(authSessions.userId, authUserId));
}

/**
 * Which colleagues the actor may see and administer, as a `WHERE` fragment.
 *
 * Membership in a Better Auth organization is the single source of truth for
 * "same agency": `users.organization_id` is the projection maintained by
 * {@link requireActor}. This replaces the earlier heuristic that inferred a
 * shared team from building ownership, which could not isolate two agencies
 * that happened to manage buildings for the same owner.
 */
export function relatedUserScope(actor: AgencyActor) {
  return eq(users.organizationId, actor.organizationId);
}

/**
 * Resolve the signed-in identity to its agency.
 *
 * The domain `users` row (name, phone, role) is bootstrapped lazily, exactly as
 * before. What is new is the organization: the active organization from the
 * Better Auth session wins, then the persisted `users.organization_id`, then
 * any membership the auth user already holds, and only then is a fresh agency
 * created for a brand-new self-serve signup. Every branch leaves
 * `users.organization_id` and the session in agreement so scoping stays
 * consistent across tabs and re-logins.
 */
export async function requireActor(c: RequestContext): Promise<AgencyActor> {
  const session = c.get("session");
  if (!session) throw new HTTPException(401, { message: "Authentication required." });

  // Portal identities (phone + OTP) carry a synthetic `@portal.naya.app` email
  // because Better Auth's `user` table requires one. They are not managers: they
  // must be rejected here, before the bootstrap below would create an
  // application user with the `owner` role and an agency of their own.
  if (!session.user.email || isPortalEmail(session.user.email)) {
    throw new HTTPException(403, { message: "Ce compte n’a pas d’adresse email. Utilisez l’espace locataire." });
  }

  const email = session.user.email.toLowerCase();
  const db = getDb();

  // Platform admins (SaaS owner) are not agency owners: unless they already
  // belong to an agency (domain row or membership — dual accounts), they must
  // never be bootstrapped one. They work from /admin/facturation.
  const [authRow] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);
  if (authRow?.role === "admin") {
    const [domainRow] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    const [membershipRow] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, session.user.id))
      .limit(1);
    assertAgencyActorAllowed({
      authRole: authRow.role,
      hasDomainUser: Boolean(domainRow),
      hasMembership: Boolean(membershipRow),
    });
  }

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({ name: session.user.name, email, role: "owner" })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (created) {
      user = created;
    } else {
      [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) throw new HTTPException(500, { message: "Could not create the application user." });
    }
  }

  const sessionOrgId = session.session.activeOrganizationId ?? null;
  let organizationId = sessionOrgId ?? user.organizationId ?? null;

  // The active session organization is authoritative when set (e.g. the plugin
  // just accepted an invitation or switched orgs): mirror it onto the domain row.
  if (organizationId && organizationId !== user.organizationId) {
    const [updated] = await db.update(users).set({ organizationId }).where(eq(users.id, user.id)).returning();
    if (updated) user = updated;
  }

  // No active org in the session: fall back to any membership already held.
  if (!organizationId) {
    const [membership] = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, session.user.id))
      .limit(1);
    if (membership) {
      organizationId = membership.organizationId;
      const [updated] = await db.update(users).set({ organizationId }).where(eq(users.id, user.id)).returning();
      if (updated) user = updated;
    }
  }

  // Brand-new self-serve signup: create an agency and make the signup its owner.
  if (!organizationId) {
    organizationId = await createOrganization(user.name || user.email);
    await db.insert(organizationMembers).values({
      id: randomUUID(),
      organizationId,
      userId: session.user.id,
      role: "owner",
    });
    // Fresh agency with no profile yet: the owner runs the onboarding wizard.
    await ensureOrganizationProfile(organizationId);
    const [updated] = await db
      .update(users)
      .set({ organizationId, role: "owner" })
      .where(eq(users.id, user.id))
      .returning();
    if (updated) user = updated;
    await markSessionOrganization(session.user.id, organizationId);
  }

  return { ...user, organizationId };
}

export function requireRole(actor: DomainUser, roles: AppRole[]) {
  if (!roles.includes(actor.role as AppRole)) {
    throw new HTTPException(403, { message: "Vous n’avez pas les droits nécessaires pour cette action." });
  }
}

export async function getBuildingForActor(buildingId: string, actor: AgencyActor) {
  const db = getDb();
  const [building] = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1);
  if (!building) throw new HTTPException(404, { message: "Building not found." });
  if (building.organizationId !== actor.organizationId) {
    throw new HTTPException(403, { message: "You cannot access this building." });
  }
  return building;
}

/**
 * The building visibility rule: a staff member sees exactly the buildings of
 * their agency. Owner vs manager no longer changes *which* buildings are
 * visible — it only changes which actions they may take.
 */
export function buildingAccessCondition(actor: AgencyActor) {
  return eq(buildings.organizationId, actor.organizationId);
}

/** Accounts of the actor's agency, as a subquery for `inArray` scoping. */
export function agencyAccounts(actor: AgencyActor) {
  return getDb()
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(eq(financialAccounts.organizationId, actor.organizationId));
}

/** Buildings of the actor's agency, as a subquery for `inArray` scoping. */
export function agencyBuildings(actor: AgencyActor) {
  return getDb().select({ id: buildings.id }).from(buildings).where(eq(buildings.organizationId, actor.organizationId));
}

/**
 * A ledger row is visible through the agency that owns its account (or the
 * counterpart account of a transfer), or the agency that owns its building.
 * Every row the app writes has at least one of the two, so a row can never
 * leak across the agency boundary. Shared by the accounts and reports routes so
 * the accounting scope is defined once.
 */
export function financialTransactionScope(actor: AgencyActor) {
  return or(
    inArray(financialTransactions.accountId, agencyAccounts(actor)),
    inArray(financialTransactions.counterpartAccountId, agencyAccounts(actor)),
    inArray(financialTransactions.buildingId, agencyBuildings(actor)),
  )!;
}

/**
 * Which prospects the actor may see, as a reusable `WHERE` fragment: those
 * owned by their agency. This replaces the "who created it" inference, which
 * could not see a colleague's prospects until a shared building existed.
 */
export function prospectScope(actor: AgencyActor) {
  return eq(prospects.organizationId, actor.organizationId);
}

/**
 * Which tenants the actor may see, as a reusable `WHERE` fragment.
 *
 * A tenant is in scope on either of two grounds:
 *
 * 1. they belong to the actor's agency (`tenants.organization_id`), or
 * 2. they hold a lease on one of the agency's buildings.
 *
 * Both halves are required. The lease chain alone hides a tenant from the
 * person who just registered them (no lease yet); the organization column alone
 * would hide tenants registered before organizations existed, which is why the
 * lease fallback is kept.
 */
export function tenantScope(actor: AgencyActor) {
  const leasedByAgency = getDb()
    .select({ id: leases.tenantId })
    .from(leases)
    .innerJoin(apartments, eq(leases.apartmentId, apartments.id))
    .innerJoin(buildings, eq(apartments.buildingId, buildings.id))
    .where(buildingAccessCondition(actor));
  return or(eq(tenants.organizationId, actor.organizationId), inArray(tenants.id, leasedByAgency))!;
}

/**
 * Same rule as {@link tenantScope}, applied to one id. Throws `404` rather
 * than `403` for a tenant outside the actor's agency: a `403` would confirm the
 * id exists on someone else's portfolio, which is the information leak this
 * check exists to close.
 */
export async function requireTenantForActor(actor: AgencyActor, tenantId: string) {
  const db = getDb();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), tenantScope(actor)))
    .limit(1);
  if (!tenant) throw new HTTPException(404, { message: "Tenant not found." });
  return tenant;
}

export function assertSameBuilding(buildingId: string, candidate: { buildingId: string }) {
  if (buildingId !== candidate.buildingId) {
    throw new HTTPException(400, { message: "The resource does not belong to this building." });
  }
}

export type { User };

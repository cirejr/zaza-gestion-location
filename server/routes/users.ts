import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { authUsers, organizationMembers, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { invitationEmail, sendEmail } from "@/lib/email";
import { relatedUserScope, requireActor, requireRole } from "@/server/lib/auth-context";
import { ensureOrganizationProfile, getOrganizationSummary, needsOnboarding } from "@/server/lib/organization";
import { parseBody, parseUuid } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();
const roleInput = z.object({ role: z.enum(["owner", "manager"]) });
const profileInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(32).nullable().optional(),
});
const invitationInput = z.object({
  email: z.string().email().max(255).transform((value) => value.trim().toLowerCase()),
  role: z.enum(["owner", "manager"]).default("manager"),
});

/**
 * Domain role projection for a Better Auth organization role. Better Auth owns
 * three canonical roles (owner/admin/member); the domain only distinguishes the
 * agency owner from everyone else, so `owner` maps through and the rest are
 * managers.
 */
function toDomainRole(organizationRole: string | null | undefined): "owner" | "manager" {
  return organizationRole === "owner" ? "owner" : "manager";
}
function toOrganizationRole(domainRole: "owner" | "manager" | undefined) {
  return domainRole === "owner" ? "owner" : "member";
}

/** Wrap a Better Auth server call so plugin errors surface as 4xx, not 500s. */
async function callAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new HTTPException(400, { message: error instanceof Error ? error.message : "Opération impossible." });
  }
}

router.get("/users/me", async (c) => {
  const actor = await requireActor(c);
  await ensureOrganizationProfile(actor.organizationId);
  const organization = await getOrganizationSummary(actor.organizationId);
  const session = c.get("session");
  const [policy] = session?.user
    ? await getDb()
      .select({ version: authUsers.policyVersion, acceptedAt: authUsers.policyAcceptedAt })
      .from(authUsers)
      .where(eq(authUsers.id, session.user.id))
      .limit(1)
    : [];
  return c.json({
    data: {
      ...actor,
      organization,
      needsOnboarding: needsOnboarding(actor.role, organization),
      policyVersion: policy?.version ?? null,
      policyAcceptedAt: policy?.acceptedAt ?? null,
    },
  });
});

/**
 * Profile self-service. The dashboard reads the domain `users` row (name, phone)
 * while the session identity lives in Better Auth's `user` table, so both are
 * kept in sync here.
 */
router.patch("/users/me", async (c) => {
  const actor = await requireActor(c);
  const data = await parseBody(c, profileInput);
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({ name: data.name, phone: data.phone ?? null })
    .where(eq(users.id, actor.id))
    .returning();
  await db.update(authUsers).set({ name: data.name, updatedAt: new Date() }).where(eq(authUsers.email, actor.email));
  return c.json({ data: updated });
});

/**
 * The team the actor actually shares an agency with. Owner-only, and scoped to
 * the agency: the previous platform-wide `select().from(users)` handed each
 * owner every other owner's name, email and phone.
 */
router.get("/users", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const data = await getDb().select().from(users).where(relatedUserScope(actor)).orderBy(users.createdAt);
  return c.json({ data });
});

/**
 * Pending invitations for the actor's agency, owner-only. Backed by Better Auth's
 * organization invitation table; the shape is kept compatible with the old
 * app-level table so the team UI does not change.
 */
router.get("/users/invitations", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const invitations = await callAuth(() =>
    auth.api.listInvitations({
      query: { organizationId: actor.organizationId },
      headers: c.req.raw.headers,
    }),
  );
  const data = invitations
    .filter((invitation) => invitation.status === "pending")
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())
    .map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: toDomainRole(invitation.role),
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    }));
  return c.json({ data });
});

/**
 * Invite an owner/manager to the actor's agency. The invitation record is owned
 * by Better Auth; the email is sent here (not via the plugin's
 * `sendInvitationEmail`) so the caller gets a delivery result and a copyable
 * fallback link when Resend is not configured.
 */
router.post("/users/invitations", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const data = await parseBody(c, invitationInput);
  const db = getDb();

  const [existingUser] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (existingUser && existingUser.organizationId === actor.organizationId) {
    throw new HTTPException(409, { message: "Cet utilisateur fait déjà partie de l'équipe." });
  }

  const invitation = await callAuth(() =>
    auth.api.createInvitation({
      // `resend` refreshes an existing pending invitation instead of stacking
      // links, matching the previous per-agency "one pending invite per email".
      body: { email: data.email, role: toOrganizationRole(data.role), organizationId: actor.organizationId, resend: true },
      headers: c.req.raw.headers,
    }),
  );

  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(c.req.url).origin;
  const inviteUrl = `${baseUrl}/signup?invite=${invitation.id}`;
  const message = invitationEmail({
    url: inviteUrl,
    inviterName: actor.name,
    roleLabel: data.role === "owner" ? "propriétaire" : "gérant",
  });
  let delivery: Awaited<ReturnType<typeof sendEmail>>;
  try {
    delivery = await sendEmail({ to: data.email, ...message });
  } catch (error) {
    delivery = { delivered: false, providerMessage: error instanceof Error ? error.message : "Envoi impossible." };
  }

  return c.json(
    {
      data: {
        id: invitation.id,
        email: invitation.email,
        role: data.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
      delivery,
      inviteUrl,
    },
    201,
  );
});

/** Revoke a pending invitation. Permission and ownership are enforced by Better Auth. */
router.delete("/users/invitations/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  // Better Auth generates its own (non-UUID) opaques ids for invitations.
  const id = z.string().min(1).max(64).parse(c.req.param("id"));
  const invitation = await callAuth(() =>
    auth.api.cancelInvitation({ body: { invitationId: id }, headers: c.req.raw.headers }),
  );
  return c.json({ data: invitation });
});

/**
 * Change a colleague's role. The Better Auth membership is updated first (the
 * source of truth); the domain `users.role` projection follows so existing
 * `requireRole`/UI checks keep working.
 */
router.patch("/users/:id/role", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const id = parseUuid(c.req.param("id"));
  const data = await parseBody(c, roleInput);
  const db = getDb();

  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), relatedUserScope(actor)))
    .limit(1);
  if (!target) throw new HTTPException(404, { message: "Utilisateur introuvable." });

  if (target.role === "owner" && id !== actor.id) {
    throw new HTTPException(403, { message: "Vous ne pouvez pas modifier le rôle d’un autre propriétaire." });
  }

  const [authUser] = await db.select().from(authUsers).where(eq(authUsers.email, target.email)).limit(1);
  if (!authUser) throw new HTTPException(404, { message: "Utilisateur introuvable." });
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, actor.organizationId), eq(organizationMembers.userId, authUser.id)))
    .limit(1);
  if (!member) throw new HTTPException(404, { message: "Utilisateur introuvable." });

  if (member.role === "owner" && data.role !== "owner") {
    const owners = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, actor.organizationId), eq(organizationMembers.role, "owner")));
    if (owners.length <= 1) {
      throw new HTTPException(400, { message: "L’agence doit conserver au moins un propriétaire." });
    }
  }

  await callAuth(() =>
    auth.api.updateMemberRole({
      body: { memberId: member.id, role: toOrganizationRole(data.role), organizationId: actor.organizationId },
      headers: c.req.raw.headers,
    }),
  );
  const [updated] = await db.update(users).set({ role: data.role }).where(eq(users.id, id)).returning();
  return c.json({ data: updated });
});

router.get("/users/invitations/pending-count", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const data = await getDb()
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, actor.organizationId));
  return c.json({ data: { members: data.length } });
});

export default router;

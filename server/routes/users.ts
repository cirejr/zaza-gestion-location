import { and, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { authUsers, invitations, users } from "@/db/schema";
import { invitationEmail, sendEmail } from "@/lib/email";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { parseBody, parseUuid } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();
const roleInput = z.object({ role: z.enum(["owner", "manager", "tenant"]) });
const profileInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(32).nullable().optional(),
});
const invitationInput = z.object({
  email: z.string().email().max(255).transform((value) => value.trim().toLowerCase()),
  role: z.enum(["owner", "manager"]).default("manager"),
});
const acceptInput = z.object({ token: z.string().trim().min(16).max(64) });

router.get("/users/me", async (c) => {
  const actor = await requireActor(c);
  return c.json({ data: actor });
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

router.get("/users", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const data = await getDb().select().from(users).orderBy(users.createdAt);
  return c.json({ data });
});

/** Pending invitations, owner-only. Accepted/revoked rows are kept for audit. */
router.get("/users/invitations", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const data = await getDb().select().from(invitations)
    .where(eq(invitations.status, "pending"))
    .orderBy(desc(invitations.createdAt));
  return c.json({ data });
});

/**
 * Invite an owner/manager by email. The token is returned as `inviteUrl` too so
 * the owner can share the link manually when Resend is not configured.
 */
router.post("/users/invitations", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const data = await parseBody(c, invitationInput);
  const db = getDb();
  const [existingUser] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (existingUser) throw new HTTPException(409, { message: "Cet utilisateur fait déjà partie de l'équipe." });

  // A single pending invitation per email: refresh instead of stacking links.
  await db.update(invitations).set({ status: "revoked" })
    .where(and(eq(invitations.email, data.email), eq(invitations.status, "pending")));

  const token = crypto.randomUUID().replaceAll("-", "");
  const [invitation] = await db.insert(invitations).values({
    email: data.email,
    role: data.role,
    token,
    invitedBy: actor.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }).returning();

  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(c.req.url).origin;
  const inviteUrl = `${baseUrl}/signup?invite=${token}`;
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
  return c.json({ data: invitation, delivery, inviteUrl }, 201);
});

/** Grants the invited role to the signed-in account matching the invite email. */
router.post("/users/invitations/accept", async (c) => {
  const actor = await requireActor(c);
  const { token } = await parseBody(c, acceptInput);
  const db = getDb();
  const [invitation] = await db.select().from(invitations)
    .where(and(eq(invitations.token, token), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())))
    .limit(1);
  if (!invitation) throw new HTTPException(404, { message: "Invitation introuvable ou expirée." });
  if (invitation.email.toLowerCase() !== actor.email.toLowerCase()) {
    throw new HTTPException(403, { message: "Cette invitation ne correspond pas à votre adresse email." });
  }
  // Invite creation rejects emails that already have an account, so the invitee
  // is always a brand-new user. `requireActor` bootstraps them as owner by
  // default; applying the invited role here is what makes them a manager.
  const [updated] = await db.update(users).set({ role: invitation.role }).where(eq(users.id, actor.id)).returning();
  await db.update(invitations).set({ status: "accepted", acceptedAt: new Date() }).where(eq(invitations.id, invitation.id));
  return c.json({ data: updated });
});

router.delete("/users/invitations/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const id = parseUuid(c.req.param("id"), "invitation id");
  const [updated] = await getDb().update(invitations).set({ status: "revoked" }).where(eq(invitations.id, id)).returning();
  if (!updated) throw new HTTPException(404, { message: "Invitation not found." });
  return c.json({ data: updated });
});

router.patch("/users/:id/role", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const id = parseUuid(c.req.param("id"), "user id");
  const { role } = await parseBody(c, roleInput);
  if (id === actor.id && role !== "owner") throw new HTTPException(400, { message: "You cannot remove your own owner role." });
  const db = getDb();
  const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
  if (!updated) throw new HTTPException(404, { message: "User not found." });
  return c.json({ data: updated });
});

export default router;

import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { organizationProfiles, organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { ensureOrganizationProfile, getOrganizationDetail } from "@/server/lib/organization";
import { parseBody } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const feeBasis = z.enum(["percent_collected", "percent_due", "fixed", "percent_collected_plus_fixed"]);

/** Trimmed text; an empty string clears the field (`null`) rather than storing "". */
const optionalText = (max: number) => z
  .string()
  .max(max)
  .nullable()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  });

const organizationInput = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Le slug ne peut contenir que des minuscules, chiffres et tirets.").optional(),
  logo: optionalText(1000),
  contactEmail: optionalText(255),
  contactPhone: optionalText(32),
  address: optionalText(500),
  city: optionalText(100),
  country: z.string().trim().min(1).max(80).optional(),
  website: optionalText(300),
  description: optionalText(2000),
  legalName: optionalText(160),
  registrationNumber: optionalText(60),
  taxId: optionalText(60),
  defaultManagementFeeBasis: feeBasis.nullable().optional(),
  defaultFeePercent: z.number().min(0).max(100).nullable().optional(),
  defaultFeeAmount: z.number().min(0).nullable().optional(),
  /** Marks the first-run wizard complete for the owner. */
  onboarded: z.boolean().optional(),
});

/** The agency identity and business profile, readable by any member. */
router.get("/organization", async (c) => {
  const actor = await requireActor(c);
  await ensureOrganizationProfile(actor.organizationId);
  const detail = await getOrganizationDetail(actor.organizationId);
  if (!detail) throw new HTTPException(404, { message: "Agence introuvable." });
  return c.json({ data: { ...detail, role: actor.role } });
});

/**
 * Owner-only agency configuration. The identity fields Better Auth owns
 * (`name`/`slug`/`logo`) go through the organization plugin so the auth tables
 * stay the single source of truth; everything else is written to the domain
 * profile. Setting `onboarded` closes the first-run wizard.
 */
router.patch("/organization", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const input = await parseBody(c, organizationInput);
  const db = getDb();

  // `slug` is globally unique in Better Auth. Pre-check so the caller gets a
  // clean 409 instead of the plugin's generic failure.
  if (input.slug) {
    const [clash] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.slug, input.slug), ne(organizations.id, actor.organizationId)))
      .limit(1);
    if (clash) throw new HTTPException(409, { message: "Cette adresse (slug) est déjà utilisée par une autre agence." });
  }

  const authData: { name?: string; slug?: string; logo?: string } = {};
  if (input.name !== undefined) authData.name = input.name;
  if (input.slug !== undefined) authData.slug = input.slug;
  if (input.logo !== undefined) authData.logo = input.logo ?? "";
  if (Object.keys(authData).length > 0) {
    try {
      await auth.api.updateOrganization({
        body: { organizationId: actor.organizationId, data: authData },
        headers: c.req.raw.headers,
      });
    } catch (error) {
      throw new HTTPException(400, { message: error instanceof Error ? error.message : "Mise à jour de l’agence impossible." });
    }
  }

  await ensureOrganizationProfile(actor.organizationId);
  const profile: Partial<typeof organizationProfiles.$inferInsert> = {};
  if (input.contactEmail !== undefined) profile.contactEmail = input.contactEmail;
  if (input.contactPhone !== undefined) profile.contactPhone = input.contactPhone;
  if (input.address !== undefined) profile.address = input.address;
  if (input.city !== undefined) profile.city = input.city;
  if (input.country !== undefined) profile.country = input.country;
  if (input.website !== undefined) profile.website = input.website;
  if (input.description !== undefined) profile.description = input.description;
  if (input.legalName !== undefined) profile.legalName = input.legalName;
  if (input.registrationNumber !== undefined) profile.registrationNumber = input.registrationNumber;
  if (input.taxId !== undefined) profile.taxId = input.taxId;
  if (input.defaultManagementFeeBasis !== undefined) profile.defaultManagementFeeBasis = input.defaultManagementFeeBasis;
  if (input.defaultFeePercent !== undefined) profile.defaultFeePercent = input.defaultFeePercent === null ? null : String(input.defaultFeePercent);
  if (input.defaultFeeAmount !== undefined) profile.defaultFeeAmount = input.defaultFeeAmount === null ? null : String(input.defaultFeeAmount);
  if (input.onboarded !== undefined) profile.onboardedAt = input.onboarded ? new Date() : null;
  if (Object.keys(profile).length > 0) {
    await db
      .update(organizationProfiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(organizationProfiles.organizationId, actor.organizationId));
  }

  const detail = await getOrganizationDetail(actor.organizationId);
  return c.json({ data: { ...detail, role: actor.role } });
});

export default router;

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizationProfiles, organizations } from "@/db/schema";
import type { PdfBranding } from "@/lib/pdf";
import { getObjectBytes, uploadKeyFromUrl } from "@/server/lib/object-storage";

/** An agency as the dashboard reads it: identity plus onboarding state. */
export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  onboardedAt: string | null;
};

/** The full agency record with its business profile, for the settings page. */
export type OrganizationDetail = OrganizationSummary & {
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  city: string | null;
  country: string;
  website: string | null;
  description: string | null;
  legalName: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  defaultManagementFeeBasis: string | null;
  defaultFeePercent: string | null;
  defaultFeeAmount: string | null;
};

/**
 * Ensure the 1:1 business profile row exists. New agencies get it on creation
 * (with `onboardedAt` left null so the wizard runs); this is idempotent so it is
 * safe to call on every read.
 */
export async function ensureOrganizationProfile(organizationId: string) {
  await getDb()
    .insert(organizationProfiles)
    .values({ organizationId })
    .onConflictDoNothing({ target: organizationProfiles.organizationId });
}

export async function getOrganizationSummary(organizationId: string): Promise<OrganizationSummary | null> {
  const [row] = await getDb()
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logo: organizations.logo,
      onboardedAt: organizationProfiles.onboardedAt,
    })
    .from(organizations)
    .leftJoin(organizationProfiles, eq(organizationProfiles.organizationId, organizations.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!row) return null;
  return { ...row, onboardedAt: row.onboardedAt ? row.onboardedAt.toISOString() : null };
}

export async function getOrganizationDetail(organizationId: string): Promise<OrganizationDetail | null> {
  const [row] = await getDb()
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logo: organizations.logo,
      onboardedAt: organizationProfiles.onboardedAt,
      contactEmail: organizationProfiles.contactEmail,
      contactPhone: organizationProfiles.contactPhone,
      address: organizationProfiles.address,
      city: organizationProfiles.city,
      country: organizationProfiles.country,
      website: organizationProfiles.website,
      description: organizationProfiles.description,
      legalName: organizationProfiles.legalName,
      registrationNumber: organizationProfiles.registrationNumber,
      taxId: organizationProfiles.taxId,
      defaultManagementFeeBasis: organizationProfiles.defaultManagementFeeBasis,
      defaultFeePercent: organizationProfiles.defaultFeePercent,
      defaultFeeAmount: organizationProfiles.defaultFeeAmount,
    })
    .from(organizations)
    .leftJoin(organizationProfiles, eq(organizationProfiles.organizationId, organizations.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    country: row.country ?? "Sénégal",
    onboardedAt: row.onboardedAt ? row.onboardedAt.toISOString() : null,
  };
}

/**
 * Whether the first-run wizard still has to run. Only the agency owner is
 * gated: managers and invited users land on a configured agency.
 */
export function needsOnboarding(role: string, summary: OrganizationSummary | null): boolean {
  if (role !== "owner") return false;
  return !summary?.onboardedAt;
}

function detectImageType(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

/**
 * The agency identity printed on generated PDFs. The logo is fetched from
 * object storage and only used when it is a PDF-embeddable raster format; any
 * failure degrades to the wordmark rather than failing the document.
 */
export async function loadAgencyBranding(organizationId: string | null | undefined): Promise<PdfBranding> {
  if (!organizationId) return { name: null, logo: null };
  const [row] = await getDb()
    .select({ name: organizations.name, logo: organizations.logo })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const branding: PdfBranding = { name: row?.name ?? null, logo: null };
  const key = uploadKeyFromUrl(row?.logo);
  if (key) {
    const object = await getObjectBytes(key);
    const type = object ? detectImageType(object.bytes) : null;
    if (object && type) branding.logo = { bytes: object.bytes, type };
  }
  return branding;
}

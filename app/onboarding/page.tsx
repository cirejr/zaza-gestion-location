import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { isPortalEmail } from "@/lib/auth";
import { getServerSession } from "@/lib/session";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiOrganizationDetail, ApiUser } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

/**
 * The blocking first-run wizard, outside the dashboard shell. Only an agency
 * owner whose profile is not yet onboarded may stay; everyone else is bounced
 * back to where they belong.
 */
export default async function OnboardingPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?redirect=/onboarding");
  if (!session.user.email || isPortalEmail(session.user.email)) redirect("/espace-locataire");

  const me = await serverApiFetch<{ data: ApiUser }>("/api/users/me");
  const user = me.data;
  if (user.role === "tenant") redirect("/espace-locataire");
  if (!user.needsOnboarding) redirect("/");

  const organization = await serverApiFetch<{ data: ApiOrganizationDetail }>("/api/organization");
  return <OnboardingWizard organization={organization.data} ownerName={user.name} />;
}

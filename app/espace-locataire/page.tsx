import { PortalLogin } from "@/components/portal/portal-login";
import { PortalOverview } from "@/components/portal/portal-overview";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Tenant portal: phone + WhatsApp OTP sign-in, then a read-only view of the
 * tenant’s own lease, dues, payment history (receipts) and utility notes.
 */
export default async function EspaceLocatairePage() {
  const session = await getServerSession();
  if (!session) return <PortalLogin />;
  return <PortalOverview />;
}
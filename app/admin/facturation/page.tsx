import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy admin URL: the section now lives across /admin routes. */
export default function LegacyAdminBillingRedirect() {
  redirect("/admin");
}

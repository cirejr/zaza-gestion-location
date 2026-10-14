import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy billing URL: the hub now lives at /billing/subscription. */
export default function LegacyBillingRedirect() {
  redirect("/billing/subscription");
}

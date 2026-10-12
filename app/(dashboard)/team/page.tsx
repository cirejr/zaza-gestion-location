import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The team screen now lives inside Settings; keep the old URL working. */
export default function TeamRedirect() {
  redirect("/settings/equipe");
}

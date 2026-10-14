import { HTTPException } from "hono/http-exception";

/**
 * Agency-actor eligibility, kept pure (no DB) so it is unit-testable without
 * touching the process-global `@/db` mocks. `requireActor` looks up the
 * three inputs and delegates here.
 *
 * Platform admins (SaaS owner) are not agency owners: without an existing
 * agency footprint (domain user row or organization membership — i.e. dual
 * accounts that legitimately manage an agency) they must never be
 * bootstrapped an agency. They work from `/admin/facturation`.
 */
export function assertAgencyActorAllowed(input: {
  authRole: string | null | undefined;
  hasDomainUser: boolean;
  hasMembership: boolean;
}): void {
  if (input.authRole === "admin" && !input.hasDomainUser && !input.hasMembership) {
    throw new HTTPException(403, { message: "Compte administrateur plateforme : utilisez /admin/facturation." });
  }
}

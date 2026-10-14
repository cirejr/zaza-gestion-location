import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization, phoneNumber } from "better-auth/plugins";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  organizationInvitations,
  organizationMembers,
  organizations,
} from "@/db/schema";
import { resetPasswordEmail, sendEmail } from "@/lib/email";
import { deliverWithFallback, sendSmsMessage, sendTwilioVerifyNative, sendTwilioVerifyOtp, toE164, verifyOwnsCode, type NotificationResult } from "@/lib/notifications";

/**
 * Auth is intentionally kept behind a factory: the UI can be previewed without
 * credentials, while production uses the same Better Auth instance with a
 * Drizzle/Neon adapter once the auth tables are migrated.
 */
/**
 * Phone + OTP identities get a synthetic email from Better Auth's
 * `signUpOnVerification` because the `user` table requires one. That address is
 * reserved for the tenant portal: it is never a real inbox, and these accounts
 * must never be mistaken for managers — they have no application user, no
 * portfolio and no access to the management dashboard.
 */
export const PORTAL_EMAIL_DOMAIN = "portal.naya.app";

/** True for the synthetic emails generated for portal (phone OTP) accounts. */
export function isPortalEmail(email: string | null | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${PORTAL_EMAIL_DOMAIN}`));
}

/**
 * Platform-owner (SaaS admin) allowlist, from `PLATFORM_ADMIN_EMAILS`
 * (comma-separated). These addresses — and only server configuration, never
 * user input — can hold the `admin` role:
 *
 * - signing up (email, Google, or admin-created) with a listed address
 *   promotes the account automatically;
 * - an already-listed account is promoted on its next sign-in.
 *
 * There is deliberately no UI or signup field for this: `signUp.email`
 * strips unknown fields (verified: a crafted `role: "admin"` signup lands
 * as `user`), and the admin plugin defaults every other account to `user`.
 */
export function platformAdminEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when the address is designated platform admin by configuration. */
export function shouldAutoPromote(email: string | null | undefined) {
  if (!email || isPortalEmail(email)) return false;
  return platformAdminEmails().has(email.toLowerCase());
}

/**
 * Idempotent promotion for a whitelisted address. Direct drizzle update
 * (bypasses auth hooks, so no recursion). Never throws: auth must keep
 * working when the database is unreachable (UI preview) or misconfigured.
 */
async function ensureWhitelistedAdmin(userId: string, email: string | null | undefined) {
  if (!shouldAutoPromote(email) || !process.env.DATABASE_URL) return;
  try {
    await getDb()
      .update(authUsers)
      .set({ role: "admin", updatedAt: new Date() })
      .where(and(eq(authUsers.id, userId), ne(authUsers.role, "admin")));
  } catch (error) {
    console.error("Auto-promotion of platform admin failed", error);
  }
}

type IdentityLike = { user: { email?: string | null | undefined } } | null | undefined;

/**
 * True when the session is a tenant-portal identity (phone + OTP).
 *
 * The dashboard and the portal share a single Better Auth session cookie, so
 * "is someone signed in?" is the wrong question at either entry point — it is
 * "signed in as *what*?". The portal used to accept any session, which let a
 * signed-in owner reach `/espace-locataire` and be matched to a tenant record
 * by phone, reading that tenant's lease, payments and receipts.
 *
 * A *present* session whose account has no email is treated as portal, mirroring
 * `requireDashboardUser`, which sends it here rather than to the dashboard.
 * Rejecting it in `resolvePortalTenant` would bounce a user between the two
 * surfaces forever. An *absent* session, however, is an anonymous visitor, not a
 * portal identity: `getServerSession()` returns `null` when nobody is signed in,
 * and treating that as portal made `/login` and `/signup` redirect a logged-out
 * manager straight to `/espace-locataire`, so the sign-in form was unreachable.
 */
export function isPortalSession(session: IdentityLike) {
  if (!session?.user) return false;
  const email = session.user.email;
  return email == null || isPortalEmail(email);
}

/** True when the session is a real email identity: an owner or a manager. */
export function isStaffSession(session: IdentityLike) {
  const email = session?.user?.email;
  return email != null && !isPortalEmail(email);
}

export function createAuth() {
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const database = process.env.DATABASE_URL
    ? drizzleAdapter(getDb(), {
        provider: "pg",
        schema: {
          user: authUsers,
          session: authSessions,
          account: authAccounts,
          verification: authVerifications,
          organization: organizations,
          member: organizationMembers,
          invitation: organizationInvitations,
        },
      })
    : undefined;

  return betterAuth({
    ...(database ? { database } : {}),
    secret: process.env.BETTER_AUTH_SECRET ?? "naya-development-secret-change-me",
    baseURL: appUrl,
    trustedOrigins: [appUrl],
    emailAndPassword: {
      enabled: true,
      // Reset links expire after an hour; delivery is best-effort so a missing
      // Resend key never blocks the request (the link is logged instead).
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        const message = resetPasswordEmail(url);
        await sendEmail({ to: user.email, ...message });
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "google-client-not-configured",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "google-secret-not-configured",
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Default-admin bootstrap: a whitelisted address is admin from
          // birth, whatever the signup path (email, Google, invitation).
          after: async (user) => {
            await ensureWhitelistedAdmin(user.id, user.email);
          },
        },
      },
      session: {
        create: {
          // Covers whitelisted accounts created before the allowlist existed:
          // promotion happens on next sign-in, no CLI needed.
          after: async (session) => {
            try {
              if (!process.env.DATABASE_URL) return;
              const [row] = await getDb()
                .select({ id: authUsers.id, email: authUsers.email })
                .from(authUsers)
                .where(eq(authUsers.id, session.userId))
                .limit(1);
              if (row) await ensureWhitelistedAdmin(row.id, row.email);
            } catch (error) {
              console.error("Auto-promotion of platform admin failed", error);
            }
          },
        },
      },
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        requireVerification: true,
        signUpOnVerification: {
          getTempEmail: (phoneNumber) => `${phoneNumber.replace(/[^0-9]/g, "")}@${PORTAL_EMAIL_DOMAIN}`,
          getTempName: (phoneNumber) => phoneNumber,
        },
        sendOTP: async ({ phoneNumber: phone, code }) => {
          // Dev escape hatch: print the code to the server log instead of sending
          // it, so the whole tenant journey — request, verify, session cookie, lease,
          // payment request — is testable with no provider configured and no cost.
          //
          // Two conditions, never one. A single flag is one stray deploy away from
          // writing live tenant OTPs into logs, so production has to be ruled out
          // explicitly rather than merely not setting the variable.
          if (process.env.OTP_DEV_ECHO === "true" && process.env.NODE_ENV !== "production") {
            console.log(`[dev:otp] ${phone} → ${code}   (code NON envoyé — OTP_DEV_ECHO actif)`);
            return;
          }

          // SMS only, and on purpose. Both WhatsApp senders exist in
          // lib/notifications.ts and are registered templates, but WhatsApp is not
          // ready: Meta is still in review and Twilio's authentication template has
          // not been approved. Leaving them ahead of the SMS rung bought nothing —
          // unconfigured providers short-circuit without a network call — while
          // making the failure message a four-provider diagnosis that a tenant
          // reads on the public login screen. WhatsApp goes back once the
          // credentials and approvals exist.
          //
          // Verify sits above raw SMS because both are SMS transports, but Verify
          // hands the sender and the per-country wording to Twilio, which is what
          // Senegal's alphanumeric-sender rule would otherwise impose on us. It
          // needs only a service to have been created.
          //
          // Failures surface as a clean 503 (not a bare 500): Better Auth's
          // endpoint wraps the hook's throw into the body.
          const failures: NotificationResult[] = [];
          try {
            const { result, attempts } = await deliverWithFallback(
              // With Verify owning the code, Better Auth's is discarded — nobody is
              // ever sent it, and `server/lib/verify-bridge.ts` reconciles the two on
              // the verify step. Otherwise Verify stays a pure pipe and carries our
              // code as `CustomCode`.
              verifyOwnsCode() ? () => sendTwilioVerifyNative({ to: phone }) : () => sendTwilioVerifyOtp({ to: phone, code }),
              [() => sendSmsMessage({ to: phone, message: `Votre code Naya est : ${code}. Il expire dans 5 minutes.` })],
            );
            failures.push(...attempts);
            if (result.delivered) {
              // Log the verification sid, never the code. `messageId` is the
              // `VE…` handle Twilio assigned, and it is the only way to tell a
              // freshly issued verification from one Twilio reused for a second
              // request on the same number — the difference between "the tenant
              // never received this one" and "they received an older one" was
              // impossible to establish from the logs before.
              console.warn(
                `[otp-send] number=${toE164(phone) ?? `invalide(${phone})`} provider=${result.channel} sid=${result.messageId} status=${result.providerMessage} verifyOwnsCode=${verifyOwnsCode()}`,
              );
              return;
            }
          } catch (error) {
            console.error("OTP delivery error", error);
            throw new APIError("SERVICE_UNAVAILABLE", {
              message: `Envoi du code impossible${error instanceof Error ? ` : ${error.message}` : "."}`,
            });
          }
          const reasons = failures.map((failure) => failure.providerMessage).filter(Boolean).join(" · ");
          throw new APIError("SERVICE_UNAVAILABLE", {
            message: `Envoi du code indisponible${reasons ? ` : ${reasons}` : "."}`,
          });
        },
      }),
      // Agencies are Better Auth organizations. Invitations are sent from the
      // API route (`/users/invitations`) rather than the plugin's
      // `sendInvitationEmail` so the route can report delivery status back to
      // the UI and fall back to a copyable link when email is not configured.
      organization(),
      // Platform owner (SaaS) administration: role/banned fields on `user`,
      // impersonation support on `session`. Distinct from agency owner/manager
      // roles, which stay in the domain `users` table + org membership.
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        bannedUserMessage: "Ce compte a été suspendu. Contactez le support.",
      }),
    ],
  });
}

export const auth = createAuth();

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import { getDb } from "@/db";
import { authAccounts, authSessions, authUsers, authVerifications } from "@/db/schema";
import { resetPasswordEmail, sendEmail } from "@/lib/email";
import { deliverWithFallback, sendOtpCode, sendSmsMessage, sendTwilioOtp, type NotificationResult } from "@/lib/notifications";

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
    plugins: [
      phoneNumber({
        otpLength: 6,
        requireVerification: true,
        signUpOnVerification: {
          getTempEmail: (phoneNumber) => `${phoneNumber.replace(/[^0-9]/g, "")}@${PORTAL_EMAIL_DOMAIN}`,
          getTempName: (phoneNumber) => phoneNumber,
        },
        sendOTP: async ({ phoneNumber: phone, code }) => {
          // WhatsApp first on both providers, because the authentication
          // template offers a copy-code button and one-tap autofill that reading
          // a code off an SMS cannot. SMS stays the final net because it needs no
          // template approval at all. Failures surface as a clean 503 (not a bare
          // 500): Better Auth's endpoint wraps the hook's throw into the body.
          const failures: NotificationResult[] = [];
          try {
            const { result, attempts } = await deliverWithFallback(
              () => sendOtpCode({ to: phone, code }),
              [
                () => sendTwilioOtp({ to: phone, code }),
                () => sendSmsMessage({ to: phone, message: `Votre code Naya est : ${code}. Il expire dans 5 minutes.` }),
              ],
            );
            failures.push(...attempts);
            if (result.delivered) return;
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
    ],
  });
}

export const auth = createAuth();

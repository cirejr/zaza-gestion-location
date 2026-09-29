import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import { getDb } from "@/db";
import { authAccounts, authSessions, authUsers, authVerifications } from "@/db/schema";
import { sendOtpCode, sendSmsMessage, type NotificationResult } from "@/lib/notifications";

/**
 * Auth is intentionally kept behind a factory: the UI can be previewed without
 * credentials, while production uses the same Better Auth instance with a
 * Drizzle/Neon adapter once the auth tables are migrated.
 */
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
          getTempEmail: (phoneNumber) => `${phoneNumber.replace(/[^0-9]/g, "")}@portal.naya.app`,
          getTempName: (phoneNumber) => phoneNumber,
        },
        sendOTP: async ({ phoneNumber: phone, code }) => {
          // OTP delivery prefers the WhatsApp authentication template
          // (`naya_otp`). SMS is only a fallback when Meta is not configured.
          // Failures surface as a clean 503 (not a bare 500): Better Auth's
          // endpoint wraps the hook's throw into the response body.
          const failures: NotificationResult[] = [];
          try {
            const whatsapp = await sendOtpCode({ to: phone, code });
            failures.push(whatsapp);
            if (whatsapp.delivered) return;
            const sms = await sendSmsMessage({ to: phone, message: `Votre code Naya est : ${code}. Il expire dans 5 minutes.` });
            failures.push(sms);
            if (sms.delivered) return;
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

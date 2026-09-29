import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import { getDb } from "@/db";
import { authAccounts, authSessions, authUsers, authVerifications } from "@/db/schema";
import { sendSmsMessage } from "@/lib/notifications";

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
        sendOTP: async ({ phoneNumber: phone, code }) => {
          // The delivery adapter is shared with the rent reminder flow. In
          // production Twilio/Green API credentials are supplied by env vars.
          await sendSmsMessage({ to: phone, message: `Votre code Naya est : ${code}. Il expire dans 5 minutes.` });
        },
      }),
    ],
  });
}

export const auth = createAuth();

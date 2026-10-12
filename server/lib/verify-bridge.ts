import { desc, sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { getDb } from "@/db";
import { authVerifications } from "@/db/schema";
import { checkTwilioVerifyCode, toE164, verifyOwnsCode } from "@/lib/notifications";
import { phoneKey } from "@/server/lib/tenant-auth";

/**
 * Copies the code Twilio Verify issued into the row Better Auth is about to compare.
 *
 * Only needed while `TWILIO_VERIFY_OWNS_CODE=true` — that is, while a trial
 * account forbids the custom code that would otherwise let Better Auth keep sole
 * ownership of the OTP. Better Auth stores `"<code>:<attempts>"` keyed by the
 * phone number exactly as the tenant typed it, generates its own code, and never
 * sends it: Verify does. So on the verify step the two rows disagree by
 * construction, and the tenant types the one we cannot see.
 *
 * The bridge asks Verify whether that code is the one it issued, and if so writes
 * it into the row *before* Better Auth reads it. Better Auth still owns the
 * session, the user and the response — only the comparison is delegated.
 *
 * Inert unless `verifyOwnsCode()`, so turning the flag off restores stock
 * behaviour with nothing else to undo.
 *
 * Everything this bridge decides is logged, minus the code. Its failure mode is
 * invisible otherwise: when the write misses, Better Auth rejects with its own
 * "Invalid OTP", which blames the tenant for what is our bug. That silence is
 * what made an earlier attempt at this impossible to diagnose.
 */
export const verifyCodeBridge: MiddlewareHandler = async (c, next) => {
  if (!verifyOwnsCode()) return next();
  if (c.req.method !== "POST" || !c.req.path.endsWith("/phone-number/verify")) return next();

  // Read from a clone: `auth.handler` receives the original request below, and a
  // consumed body would reach Better Auth as empty.
  const body = (await c.req.raw.clone().json().catch(() => null)) as { phoneNumber?: unknown; code?: unknown } | null;
  const phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!phoneNumber || !code) return next();

  const e164 = toE164(phoneNumber);
  const verdict = await checkTwilioVerifyCode({ to: phoneNumber, code });

  // `null` means Verify could not answer (no service, no credentials, or no
  // verification pending for this number — Twilio answers 404 `20404` then,
  // which carries no verdict). Better Auth then decides, and since it holds a
  // code nobody was ever sent, that comparison fails closed. `false` is a real
  // answer and is likewise left to Better Auth, which rejects with its own
  // wording.
  if (verdict !== true) {
    console.warn(
      `[otp-bridge] Verify n'a pas validé le code — number=${e164 ?? `invalide(${phoneNumber})`} verdict=${verdict}. Better Auth tranche sur son propre code.`,
    );
    return next();
  }

  // Better Auth keys the row on the phone number *as the tenant typed it* at send
  // time, while the provider call above normalizes to E.164. An exact match was
  // therefore too strict: retyping the number with different spacing between the
  // two steps made the UPDATE match zero rows, the bridge became a silent no-op,
  // and the tenant saw "Invalid OTP" for a code Verify had just confirmed.
  //
  // The comparison runs on the last nine digits, not on the whole number. Those
  // nine are the subscriber identity in Senegal, and they are what makes a local
  // `77 555 44 22` and an international `+221 77 555 44 22` compare equal — which
  // a twelve-digit key does not, since `phoneKey` yields `221775554422` for one
  // and `775554422` for the other, while `toE164` above resolves both to
  // `+221775554422`. Twelve digits would fix reformatting and still miss a tenant
  // who switches between the two conventions.
  const key = phoneKey(e164 ?? phoneNumber).slice(-9);
  const updated = await getDb()
    .update(authVerifications)
    .set({ value: `${code}:0`, updatedAt: new Date() })
    .where(sql`right(ltrim(regexp_replace(${authVerifications.identifier}, '\\D', '', 'g'), '0'), 9) = ${key}`)
    .returning({ id: authVerifications.id });

  if (updated.length === 0) {
    // Verify says the code is right but there is no row to write it into: the
    // verification was deleted (consumed, or past Better Auth's 300 s window)
    // while the code was still in flight. Nothing can be done from here — the
    // request is handed on so Better Auth answers with its own wording.
    const [recent] = await getDb()
      .select({ identifier: authVerifications.identifier, expiresAt: authVerifications.expiresAt })
      .from(authVerifications)
      .orderBy(desc(authVerifications.updatedAt))
      .limit(1);
    console.warn(
      `[otp-bridge] code validé par Verify mais AUCUNE ligne à réécrire — number=${e164 ?? "invalide"}. ` +
        `Ligne la plus récente : ${recent ? `identifier=${JSON.stringify(recent.identifier)} expire=${recent.expiresAt.toISOString()}` : "aucune"}. ` +
        `Cause probable : vérification déjà consommée ou expirée côté Better Auth.`,
    );
    return next();
  }

  console.warn(`[otp-bridge] code validé et copié dans ${updated.length} ligne(s) — number=${e164 ?? phoneNumber}`);
  return next();
};

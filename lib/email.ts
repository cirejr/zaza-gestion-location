/**
 * Provider boundary for transactional email (password reset, invitations).
 *
 * Resend is the default provider: a single API key, and the shared
 * `onboarding@resend.dev` sender works while testing without a verified
 * domain. When `RESEND_API_KEY` is missing the message is *previewed* — logged
 * server-side with its body (including the action link) and reported as
 * `delivered: false` — mirroring `lib/notifications.ts` so the flows stay
 * testable without credentials.
 */

export type EmailResult = { delivered: boolean; providerMessage?: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { apiKey, from: process.env.EMAIL_FROM ?? "Naya <onboarding@resend.dev>" };
}

export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<EmailResult> {
  const config = emailConfig();
  if (!config) {
    console.info(`[email:preview] to=${input.to} subject=${input.subject}\n${input.text}`);
    return { delivered: false, providerMessage: "Resend non configuré (RESEND_API_KEY manquant)" };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = ((await response.json()) as { message?: string }).message ?? "";
    } catch {
      /* keep the generic message */
    }
    throw new Error(`Resend returned ${response.status}${detail ? ` : ${detail}` : "."}`);
  }
  return { delivered: true };
}

/** Shared, inline-styled shell so the templates render consistently in email clients. */
function layout(heading: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const body = paragraphs.map((text) => `<p style="margin:0 0 14px;font-size:14px;line-height:22px;color:#42544d;">${text}</p>`).join("");
  const button = cta
    ? `<a href="${cta.url}" style="display:inline-block;margin-top:6px;border-radius:10px;background:#163d35;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${cta.label}</a>`
    : "";
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f8f4;padding:32px 16px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="margin:0 auto;max-width:520px;border-radius:20px;border:1px solid #e0e9e0;background:#ffffff;padding:32px;">
    <span style="display:inline-flex;height:38px;width:38px;align-items:center;justify-content:center;border-radius:12px;background:#c9f06b;font-size:19px;font-weight:900;color:#123e35;">n</span>
    <h1 style="margin:20px 0 16px;font-size:22px;line-height:1.2;color:#173d35;">${heading}</h1>
    ${body}
    ${button}
    <p style="margin:24px 0 0;font-size:11px;line-height:18px;color:#8a9993;">Naya · Gestion locative</p>
  </div>
</body></html>`;
}

export function resetPasswordEmail(url: string) {
  return {
    subject: "Réinitialisez votre mot de passe Naya",
    html: layout(
      "Réinitialiser votre mot de passe",
      [
        "Vous avez demandé à réinitialiser le mot de passe de votre compte Naya.",
        "Ce lien expire dans une heure. Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email.",
      ],
      { label: "Choisir un nouveau mot de passe", url },
    ),
    text: `Réinitialisez votre mot de passe Naya : ${url}\n\nCe lien expire dans une heure. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.`,
  };
}

export function invitationEmail(input: { url: string; inviterName: string; roleLabel: string }) {
  return {
    subject: `${input.inviterName} vous invite à rejoindre Naya`,
    html: layout(
      "Rejoignez l’équipe sur Naya",
      [
        `${input.inviterName} vous invite à rejoindre son espace de gestion locative en tant que <strong>${input.roleLabel}</strong>.`,
        "Créez votre compte pour accéder aux immeubles, baux et paiements. Cette invitation expire dans 7 jours.",
      ],
      { label: "Accepter l’invitation", url: input.url },
    ),
    text: `${input.inviterName} vous invite à rejoindre Naya en tant que ${input.roleLabel}.\n\nCréez votre compte : ${input.url}\n\nCette invitation expire dans 7 jours.`,
  };
}

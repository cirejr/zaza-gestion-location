/**
 * Provider boundary for WhatsApp and SMS.
 *
 * WhatsApp uses the official Meta Cloud API (graph.facebook.com, graph version
 * v23.0 as of writing) with registered template messages (`relance_loyer`,
 * `note_charges`, `naya_otp`).
 *
 * SMS (Twilio) is the OTP channel of record, because it needs no template
 * approval and no Meta review — WhatsApp is a better channel when it is
 * available, and every sender degrades to the other.
 *
 * When a provider is not configured, senders return a *preview* result
 * (`delivered: false`, `messageId` starting with `preview-`) so the rest of the
 * app keeps working; callers that need guaranteed delivery (e.g. the OTP flow)
 * must escalate. A preview means "not configured", which is distinct from a real
 * send that failed, and is what lets callers fall back to another channel.
 */

export type NotificationChannel = "whatsapp" | "sms";

export type NotificationResult = {
  channel: NotificationChannel;
  messageId: string;
  delivered: boolean;
  providerMessage?: string;
};

const WHATSAPP_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";

function preview(channel: NotificationChannel, providerMessage: string): NotificationResult {
  return { channel, messageId: `preview-${Date.now()}`, delivered: false, providerMessage };
}

/** True for a "provider not configured" result, as opposed to a send that failed. */
export function isPreviewResult(result: NotificationResult) {
  return result.messageId.startsWith("preview-");
}

/**
 * Convert free text into strict E.164 for Twilio.
 *
 * Numbers reach this module from three places — the portal login form, a manager
 * typing a reminder, and the `tenants` table — and all of them hold whatever a
 * human typed (`+221 78 968 03 18`). Twilio rejects anything that is not `+`
 * followed by digits, so the conversion belongs here once rather than at each of
 * the five call sites.
 *
 * Nine digits starting with 7 or 8 is a Senegalese mobile number written in the
 * local format, so it gets the `+221` prefix. Anything else ambiguous returns
 * null rather than being guessed: sending an OTP to the wrong number is worse
 * than not sending it.
 */
export function toE164(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.trim().replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith("221")) return `+${digits}`;
  if (value.trim().startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 9 && /^[78]/.test(digits)) return `+221${digits}`;
  return null;
}

/** Meta's Cloud API wants the recipient as bare digits, with no `+`. */
function metaRecipient(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function metasConfig(): { accessToken: string; phoneNumberId: string } | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}

function whatsappApiUrl(phoneNumberId: string) {
  return `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`;
}

async function throwMetaError(response: Response): Promise<never> {
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: string; type?: string } };
    detail = body.error?.message ?? "";
  } catch {
    /* keep the generic message */
  }
  throw new Error(`WhatsApp Cloud API returned ${response.status}${detail ? ` : ${detail}` : "."}`);
}

/** Low-level sender for registered template messages (required by Meta for business-initiated conversations). */
export async function sendWhatsAppTemplate(input: {
  to: string;
  templateName: string;
  language?: string;
  bodyParameters?: string[];
}): Promise<NotificationResult> {
  const config = metasConfig();
  if (!config) return preview("whatsapp", "WhatsApp Meta non configuré");

  const response = await fetch(whatsappApiUrl(config.phoneNumberId), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaRecipient(input.to),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language ?? "fr" },
        components: input.bodyParameters?.length
          ? [{ type: "body", parameters: input.bodyParameters.map((text) => ({ type: "text", text })) }]
          : [],
      },
    }),
  });
  if (!response.ok) await throwMetaError(response);

  const result = (await response.json()) as { messages?: Array<{ id?: string }> };
  return { channel: "whatsapp", messageId: result.messages?.[0]?.id ?? `meta-${Date.now()}`, delivered: true };
}

/** Free-text WhatsApp message — only valid inside the 24h customer-service window. */
export async function sendWhatsAppTextMessage(input: { to: string; message: string }): Promise<NotificationResult> {
  const config = metasConfig();
  if (!config) return preview("whatsapp", "WhatsApp Meta non configuré");

  const response = await fetch(whatsappApiUrl(config.phoneNumberId), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaRecipient(input.to),
      type: "text",
      text: { body: input.message },
    }),
  });
  if (!response.ok) await throwMetaError(response);

  const result = (await response.json()) as { messages?: Array<{ id?: string }> };
  return { channel: "whatsapp", messageId: result.messages?.[0]?.id ?? `meta-${Date.now()}`, delivered: true };
}

/** Business helper — rent reminder via the `relance_loyer` template. */
export function sendRentReminder(input: {
  to: string;
  tenantName: string;
  buildingName: string;
  unitNumber: string;
  amount: number;
  dueDate: string;
}): Promise<NotificationResult> {
  return sendWhatsAppTemplate({
    to: input.to,
    templateName: "relance_loyer",
    bodyParameters: [input.tenantName, input.unitNumber, input.buildingName, input.dueDate, input.amount.toLocaleString("fr-FR")],
  });
}

export function utilityTypeLabel(type: string) {
  const labels: Record<string, string> = { water: "eau", electricity: "électricité", security: "sécurité", other: "autres charges" };
  return labels[type] ?? type;
}

/** Business helper — utility note via the `note_charges` template. */
export function sendUtilityNotice(input: {
  to: string;
  tenantName: string;
  type: string;
  period: string;
  amount: number;
  unitNumber: string;
}): Promise<NotificationResult> {
  return sendWhatsAppTemplate({
    to: input.to,
    templateName: "note_charges",
    bodyParameters: [
      input.tenantName,
      utilityTypeLabel(input.type),
      input.period,
      input.amount.toLocaleString("fr-FR"),
      input.unitNumber,
    ],
  });
}

/** Business helper — OTP delivery via the `naya_otp` authentication template. */
export function sendOtpCode(input: { to: string; code: string }): Promise<NotificationResult> {
  return sendWhatsAppTemplate({ to: input.to, templateName: "naya_otp", bodyParameters: [input.code] });
}

/** Free-text fallback used when the WhatsApp channel is unavailable. */
export function rentReminderMessage(input: {
  tenantName: string;
  buildingName: string;
  unitNumber: string;
  amount: number;
  dueDate: string;
  paymentUrl?: string;
}) {
  const base = `Bonjour ${input.tenantName}, nous vous rappelons que le loyer de ${input.unitNumber} (${input.buildingName}) est attendu pour le ${input.dueDate}. Montant : ${input.amount.toLocaleString("fr-FR")} FCFA.`;
  return input.paymentUrl ? `${base} Payez ici : ${input.paymentUrl}` : base;
}

/** Free-text fallback for a charge note, used when WhatsApp templates are unavailable. */
export function utilityNoticeMessage(input: {
  tenantName: string;
  type: string;
  period: string;
  amount: number;
  unitNumber: string;
}) {
  return `Bonjour ${input.tenantName}, les ${utilityTypeLabel(input.type)} de ${input.period} pour l'unité ${input.unitNumber} s'élèvent à ${input.amount.toLocaleString("fr-FR")} FCFA. Merci de régler auprès de votre gestionnaire.`;
}

/**
 * SMS delivery through Twilio. This is the OTP channel of record: WhatsApp needs
 * Meta credentials *and* approved templates, while SMS only needs Twilio.
 *
 * `TWILIO_SENDER_ID` (alphanumeric, e.g. "Naya") takes precedence over
 * `TWILIO_FROM_NUMBER` because since 2026-09-08 Orange and Expresso in Senegal
 * reject international long codes with error 21612 — which every Twilio number
 * is. An alphanumeric sender goes in the same `From` field, so nothing else
 * changes; the numeric fallback still serves networks that still accept it.
 */
export async function sendSmsMessage(input: { to: string; message: string }): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SENDER_ID || process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    return preview("sms", "Twilio non configuré");
  }

  const to = toE164(input.to);
  if (!to) {
    return {
      channel: "sms",
      messageId: `invalid-${Date.now()}`,
      delivered: false,
      providerMessage: `Numéro invalide : ${input.to}`,
    };
  }

  const body = new URLSearchParams({ To: to, From: from, Body: input.message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  // Returns rather than throws: the OTP hook turns an undelivered result into a
  // clean 503 that names the reason. A bare "Twilio returned 400." would hide
  // the codes that actually explain it — 21612 for a rejected sender, 21211
  // for a malformed number, 20003 for bad auth.
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { code?: number; message?: string } | null;
    return {
      channel: "sms",
      messageId: `twilio-error-${Date.now()}`,
      delivered: false,
      providerMessage: `Twilio ${error?.code ?? response.status}${error?.message ? ` : ${error.message}` : ""}`,
    };
  }

  const result = (await response.json()) as { sid?: string; status?: string };
  return { channel: "sms", messageId: result.sid ?? `twilio-${Date.now()}`, delivered: true, providerMessage: result.status };
}
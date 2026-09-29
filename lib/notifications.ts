/**
 * Provider boundary for WhatsApp and SMS.
 *
 * WhatsApp uses the official Meta Cloud API (graph.facebook.com, graph version
 * v23.0 as of writing) with registered template messages (`relance_loyer`,
 * `note_charges`, `naya_otp`). SMS stays as an optional fallback only.
 *
 * When Meta credentials are missing, senders return a *preview* result
 * (`delivered: false`) so the rest of the app keeps working; callers that need
 * guaranteed delivery (e.g. the OTP flow) must escalate.
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
      to: input.to,
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
      to: input.to,
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

/** Optional SMS fallback (Twilio). Same OK/throw contract as the WhatsApp senders. */
export async function sendSmsMessage(input: { to: string; message: string }): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    return preview("sms", "Twilio non configuré");
  }

  const body = new URLSearchParams({ To: input.to, From: from, Body: input.message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new Error(`Twilio returned ${response.status}.`);
  const result = (await response.json()) as { sid?: string; status?: string };
  return { channel: "sms", messageId: result.sid ?? `twilio-${Date.now()}`, delivered: true, providerMessage: result.status };
}
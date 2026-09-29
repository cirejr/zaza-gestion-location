/** WhatsApp/SMS provider boundary. Add credentials in the deployment environment. */
export type NotificationChannel = "whatsapp" | "sms";

export type NotificationResult = {
  channel: NotificationChannel;
  messageId: string;
  delivered: boolean;
  providerMessage?: string;
};

export async function sendWhatsAppMessage(input: { to: string; message: string; template?: string }): Promise<NotificationResult> {
  const baseUrl = process.env.GREEN_API_URL;
  const token = process.env.GREEN_API_TOKEN;
  if (!baseUrl || !token) {
    return { channel: "whatsapp", messageId: `preview-${Date.now()}`, delivered: false, providerMessage: "Green API non configuré" };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/waInstance${process.env.GREEN_API_INSTANCE_ID}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ chatId: input.to, text: input.message }),
  });
  if (!response.ok) throw new Error(`Green API returned ${response.status}.`);
  const result = (await response.json()) as { idMessage?: string; statusMessage?: string };
  return { channel: "whatsapp", messageId: result.idMessage ?? `green-${Date.now()}`, delivered: true, providerMessage: result.statusMessage };
}

export async function sendSmsMessage(input: { to: string; message: string }): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    return { channel: "sms", messageId: `preview-${Date.now()}`, delivered: false, providerMessage: "Twilio non configuré" };
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

export function rentReminderMessage(input: { tenantName: string; buildingName: string; unitNumber: string; amount: number; dueDate: string; paymentUrl?: string }) {
  const base = `Bonjour ${input.tenantName}, nous vous rappelons que le loyer de ${input.unitNumber} (${input.buildingName}) est attendu pour le ${input.dueDate}. Montant : ${input.amount.toLocaleString("fr-FR")} FCFA.`;
  return input.paymentUrl ? `${base} Payez ici : ${input.paymentUrl}` : base;
}

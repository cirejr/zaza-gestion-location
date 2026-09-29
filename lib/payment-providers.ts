/**
 * Thin provider boundary for the mobile-money providers used in the MVP.
 * Credentials and provider-specific payloads stay outside the UI and can be
 * swapped without changing the payment workflow.
 */
export type PaymentProviderName = "paytech" | "paydunya" | "fedapay";

export type PaymentLinkInput = {
  amount: number;
  currency?: "XOF";
  reference: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  returnUrl: string;
  notificationUrl?: string;
};

export type PaymentLink = {
  provider: PaymentProviderName;
  token: string;
  paymentUrl: string;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function readJson(response: Response) {
  if (!response.ok) {
    throw new Error(`Payment provider returned ${response.status}.`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function createPayTechLink(input: PaymentLinkInput): Promise<PaymentLink> {
  const body = new URLSearchParams({
    amount: String(input.amount),
    currency: input.currency ?? "XOF",
    reference: input.reference,
    name: input.customerName,
    email: input.customerEmail ?? "",
    phone_number: input.customerPhone,
    return_url: input.returnUrl,
    notification_url: input.notificationUrl ?? input.returnUrl,
  });
  const response = await fetch(`${env("PAYTECH_API_URL")}/transaction/request`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const result = await readJson(response);
  const token = String(result.token ?? "");
  if (!token) throw new Error("PayTech did not return a transaction token.");
  return { provider: "paytech", token, paymentUrl: `${input.returnUrl}?token=${encodeURIComponent(token)}` };
}

export async function createPayDunyaLink(input: PaymentLinkInput): Promise<PaymentLink> {
  const response = await fetch(`${env("PAYDUNYA_API_URL")}/checkout/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "PAYDUNYA-KEY": env("PAYDUNYA_KEY"),
      "PAYDUNYA-SECRET": env("PAYDUNYA_SECRET"),
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency ?? "XOF",
      reference: input.reference,
      name: input.customerName,
      email: input.customerEmail,
      phone_number: input.customerPhone,
      return_url: input.returnUrl,
      callback_url: input.notificationUrl,
    }),
  });
  const result = await readJson(response);
  const token = String(result.token ?? "");
  if (!token) throw new Error("PayDunya did not return a checkout token.");
  return { provider: "paydunya", token, paymentUrl: String(result.payment_url ?? `${input.returnUrl}?token=${encodeURIComponent(token)}`) };
}

export async function createFedaPayLink(input: PaymentLinkInput): Promise<PaymentLink> {
  const response = await fetch(`${env("FEDAPAY_API_URL")}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${env("FEDAPAY_TOKEN")}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency ?? "XOF",
      reference: input.reference,
      customer: { name: input.customerName, email: input.customerEmail, phone: input.customerPhone },
      callback_url: input.returnUrl,
    }),
  });
  const result = await readJson(response);
  const token = String(result.token ?? result.id ?? "");
  if (!token) throw new Error("FedaPay did not return a transaction token.");
  return { provider: "fedapay", token, paymentUrl: String(result.payment_url ?? `${input.returnUrl}?token=${encodeURIComponent(token)}`) };
}

export async function createPaymentLink(provider: PaymentProviderName, input: PaymentLinkInput) {
  switch (provider) {
    case "paytech": return createPayTechLink(input);
    case "paydunya": return createPayDunyaLink(input);
    case "fedapay": return createFedaPayLink(input);
  }
}

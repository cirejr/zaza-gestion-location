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

/** Raised when a provider cannot be reached (missing credentials/environment). */
export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/** As a PaymentProviderError so routes can answer with a clear 503. */
function env(name: string) {
  const value = process.env[name];
  if (!value) throw new PaymentProviderError(`${name} n’est pas configuré.`);
  return value;
}

async function readJson(response: Response) {
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? "";
    } catch {
      /* keep the generic message */
    }
    throw new PaymentProviderError(`Le prestataire a répondu ${response.status}${detail ? ` : ${detail}` : "."}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * PayTech — https://doc.paytech.sn/doc_paytech.php
 * Base URL `https://paytech.sn/api`, endpoint `POST /payment/request-payment`,
 * authenticated with the `API_KEY` / `API_SECRET` headers from the dashboard.
 * Sandbox mode (`env=test`) is used by default; `PAYTECH_API_URL` can point to
 * another host in test environments.
 */
export async function createPayTechLink(input: PaymentLinkInput): Promise<PaymentLink> {
  const apiUrl = env("PAYTECH_API_URL").replace(/\/$/, "");
  const response = await fetch(`${apiUrl}/payment/request-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      API_KEY: env("PAYTECH_API_KEY"),
      API_SECRET: env("PAYTECH_API_SECRET"),
    },
    body: JSON.stringify({
      item_name: `Loyer Naya — ${input.customerName}`,
      item_price: input.amount,
      currency: input.currency ?? "XOF",
      ref_command: input.reference,
      command_name: `Paiement du loyer ${input.reference}`,
      env: process.env.PAYTECH_ENV ?? "test",
      ipn_url: input.notificationUrl,
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
      custom_field: JSON.stringify({ reference: input.reference }),
    }),
  });
  const result = await readJson(response);
  if (Number(result.success) !== 1) {
    throw new PaymentProviderError(`PayTech a refusé la demande de paiement : ${String(result.message ?? "erreur inconnue")}`);
  }
  const token = String(result.token ?? "");
  if (!token) throw new PaymentProviderError("PayTech n’a pas retourné de jeton de transaction.");
  const paymentUrl = String(result.redirect_url ?? result.redirectUrl ?? "");
  return { provider: "paytech", token, paymentUrl: paymentUrl || `${input.returnUrl}?token=${encodeURIComponent(token)}` };
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
  if (!token) throw new PaymentProviderError("PayDunya n’a pas retourné de jeton de paiement.");
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
  if (!token) throw new PaymentProviderError("FedaPay n’a pas retourné de jeton de transaction.");
  return { provider: "fedapay", token, paymentUrl: String(result.payment_url ?? `${input.returnUrl}?token=${encodeURIComponent(token)}`) };
}

export async function createPaymentLink(provider: PaymentProviderName, input: PaymentLinkInput) {
  switch (provider) {
    case "paytech": return createPayTechLink(input);
    case "paydunya": return createPayDunyaLink(input);
    case "fedapay": return createFedaPayLink(input);
  }
}

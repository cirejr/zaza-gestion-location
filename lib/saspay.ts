// -----------------------------------------------------
// Client SasPay — toutes les requêtes authentifiées en bearer.
// Aucun endpoint n'accepte de header Idempotency-Key sur /checkout-sessions/
// (spécification formelle). L'idempotence est assurée côté app (un abonnement
// pending par agence, annulation best-effort avant recreation).
// -----------------------------------------------------

import { Hono } from "hono";
import type { Context } from "hono";

// --- Configuration -------------------------------------------------

const BASE_URL = "https://api.saspay.me/api/v1";

// Le nom de la variable d'environnement dépend de l'environnement de déploiement.
// Le .env.example fourni par l'utilisateur contient : SASPAY_API_KEY=
// On attend qu'elle soit présente ; si elle manque, on lance une erreur claire
// (503) sans exposer le secret.
function getApiKey(): string {
  const key = process.env.SASPAY_API_KEY;
  if (!key) throw new Error("SASPAY_API_KEY manquante — définir dans .env.local.");
  return key;
}

// -----------------------------------------------------
// Appel HTTP helper — gère le body JSON + error parsing
// -----------------------------------------------------

async function sasPayRequest<T>(
  c: Context,
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const url = new URL(endpoint, BASE_URL).href;
  const fetchOptions: RequestInit = {
    headers: {
      "Authorization": `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  };

  const response = await fetch(url, fetchOptions);

  // Le format de réponse SasPay est { success: true, data: {...} } ou
  // { success: false, error: { message, code } }.
  // On essaie de parser le JSON ; si ce n'est pas du JSON valide, on lance
  // une erreur avec le statut.
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Réponse non-JSON de SasPay (${response.status})`);
  }

  if (!data?.success) {
    // SasPay renvoie des codes métier dans `data.error.code` :
    // insufficient_balance, currency_country_mismatch, prepayment_otp_missing, etc.
    const code = data?.error?.code ?? `api_${response.status}`;
    throw new Error(`SasPay error [${code}]: ${data?.error?.message ?? "unknown error"}`);
  }

  return data?.data ?? data as unknown as T;
}

// -----------------------------------------------------
// 1. Créer une session de checkout hébergée
//    POST /checkout-sessions/
//    NE PAS envoyer de header Idempotency-Key — la spec l'interdit formellement.
//    Un double appel crée deux sessions distinctes (sans conséquence financière
//    : une session impayée ne débite rien). L'idempotence est assurée
//    côté app (un abonnement pending par agence, annulation best-effort avant
//    recreation).
//    Le corps requis : amount (string decimal), currency (3 lettres), customer_email,
//    customer_name. Optionnels : description, country (code ISO2), customer_phone,
//    return_url, metadata, fee_charge_mode, expires_at.
//    Retourne : { id, slug, checkout_url, status: "PENDING", ... }
// -----------------------------------------------------

export async function createCheckoutSession(
  c: Context,
  amount: string,      // ex: "5000.00"  (montant en chaîne décimale)
  currency: string,    // ex: "XOF"
  customerEmail: string,
  customerName: string,
  params?: {
    description?: string;
    country?: string;       // code ISO2, optionnel — présélectionne pays
    customerPhone?: string;
    returnUrl?: string;     // URL de redirection après paiement réussi
    metadata?: Record<string, unknown>; // libre : on y glisse subscription_id, agency_id, plan, expected_amount
    feeChargeMode?: "ADD_ON" | "DEDUCTED";
    expiresAt?: string;     // ISO date-time, optionnel
  }
) {
  const body: Record<string, unknown> = {
    amount,
    currency,
    customer_email: customerEmail,
    customer_name: customerName,
  };

  if (params?.description) body.description = params.description;
  if (params?.country) body.country = params.country;
  if (params?.customerPhone) body.customer_phone = params.customerPhone;
  if (params?.returnUrl) body.return_url = params.returnUrl;
  if (params?.metadata) body.metadata = params.metadata;
  if (params?.feeChargeMode) body.fee_charge_mode = params.feeChargeMode;
  if (params?.expiresAt) body.expires_at = params.expiresAt;

  return sasPayRequest<{ id: string; checkout_url: string; status: string }>(
    c,
    "/checkout-sessions/",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

// -----------------------------------------------------
// 2. Récupérer le statut d'une session (polling / filet anti webhook perdu)
//    GET /checkout-sessions/{id}/status/
//    NE renvoie que l'essentiel + revérifie toujours l'état réel côté gateway.
//    Retourne { id, slug, status: "PENDING"|"PAID"|"EXPIRED"|"CANCELLED", transaction_id, transaction_status }
// -----------------------------------------------------

export async function getCheckoutStatus(
  c: Context,
  sessionId: string
) {
  return sasPayRequest<{
    id: string;
    slug: string;
    status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
    transaction_id: string;        // UUID de la transaction SasPay
    transaction_status: "SUCCESS" | "PENDING" | "FAILED";
  }>(c, `/checkout-sessions/${sessionId}/status/`);
}

// -----------------------------------------------------
// 3. Vérifier un paiement par son ID (seule source de vérité)
//    GET /payments/{payment_id}/verify/
//    NE JAMAIS se fier à la seule redirection ou à un statut mémorisé.
//    Retourne { status: "SUCCESS"|"PENDING"|"FAILED", requested_amount, debited_amount, net_amount, currency }
//    Activation n'autorisée que si status === "SUCCESS" ET montants/devise conformes.
//
export async function verifyPayment(
  c: Context,
  paymentId: string
) {
  return sasPayRequest<{
    id: string;
    reference: string;
    merchant: string;
    customer: string;
    country: string;
    network: string;
    transaction_type: string;
    description: string;
    requested_amount: string;        // montant tel que demandé au client
    fee_charge_mode: string;         // "ADD_ON" | "DEDUCTED"
    client_fee: string;              // frais facturés au payeur
    gateway_fee: string;             // frais prélevés par le gateway
    platform_fee: string;            // frais plateforme
    debited_amount: string;          // montant total débité du compte client
    net_amount: string;              // ce qui revient réellement au marchand
    currency: string;
    status: "SUCCESS" | "PENDING" | "FAILED";
    current_gateway: string;
    external_reference: string;
    ip_address: string;
    created_at: string;
    updated_at: string;
  }>(c, `/payments/${paymentId}/verify/`);
}

// -----------------------------------------------------
// 4. Annuler une session en attente (best-effort)
//    POST /checkout-sessions/{id}/cancel/
//    Ne fonctionne que si la session est encore "PENDING".
//    Corps vide. Retourne 409 si la session est déjà PAID/EXPIRED/CANCELLED.
// -----------------------------------------------------

export async function cancelCheckoutSession(
  c: Context,
  sessionId: string
) {
  return sasPayRequest<{ cancelled: boolean }>(
    c,
    `/checkout-sessions/${sessionId}/cancel/`,
    { method: "POST" }  // corps vide, pas de JSON
  );
}

// -----------------------------------------------------
// 5. Webhook signature verification (corps brut, 300 s)
//    Vérification ordonnée ainsi :
//    1. Rejeter si |timestamp - now| > 300 secondes.
//    2. Recalculer HMAC SHA-256 sur le corps brut reçu : f"{timestamp}.{body}"
//       avec signing_secret comme clé.
//    3. Comparaison en temps constant via hmac.compare_digest.
//    Le body brut est tel quel — jamais de JSON re-sérialisé.
//
//    Exemple d'utilisation dans le routeur webhook :
//    const body = await c.req.raw.text();        // corps brut
//    const timestamp = c.req.header("X-Webhook-Timestamp");
//    const signature = c.req.header("X-Webhook-Signature");
//    if (!verifySaspayWebhook(body, timestamp, signature, secret)) {
//      throw new Error("Signature invalide");
//    }
//
export function verifySaspayWebhook(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string
): boolean {
  // 1. Timestamp dans les 300 s
  if (!timestamp || !signature) return false;
  const diff = Math.abs(Number(timestamp) - Date.now() / 1000);
  if (diff > 300) return false;

  // 2. HMAC SHA-256 sur "{timestamp}.{body}"
  const signed = `${timestamp}.${rawBody}`;
  const cryptoGlobal = crypto as any;
  const expected = cryptoGlobal.createHmac("sha256", secret).update(signed).digest("hex");

  // 3. Comparaison constante
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// -----------------------------------------------------
// 6. Liste des pays supportés (endpoint public, aucune auth requise)
//    GET /countries/
// -----------------------------------------------------

export async function listCountries() {
  // Endpoint public — pas de bearer token nécessaire selon la spec.
  // On utilise fetch directement (pas besoin de contexte c).
  const url = new URL(`${BASE_URL}/countries/`);
  const response = await fetch(url, {
    headers: { "Accept": "application/json" },
  });
  if (!response.ok) throw new Error(`Erreur pays SasPay (${response.status})`);
  return response.json();
}

// -----------------------------------------------------
// 7. Réseaux mobile money supportés (authentifié)
//    GET /networks/
// -----------------------------------------------------

export async function listNetworks(c: Context) {
  return sasPayRequest<{
    count: number;
    results: {
      id: string;
      country: string;
      code: string;     // ex: "mtn_bj"
      name: string;
      is_active: boolean;
    }[];
  }>(c, "/networks/");
}
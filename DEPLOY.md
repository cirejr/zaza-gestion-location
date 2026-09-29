# Déploiement — Naya

Naya est une application Next.js 15 autonome : **Hono API, Better Auth et pages Next vivent dans le même process Next** via l’adaptateur `app/api/[[...route]]/route.ts`. Le serveur Bun séparé (`server/index.ts`) est une alternative optionnelle, pas le chemin de déploiement principal.

Stack : Next.js 15 / React 19 / Tailwind 4 · Drizzle ORM + Neon Postgres (driver WebSocket `Pool`) · uploads S3 privés avec URL présignées + proxy authentifié.

---

## 1. Prérequis

- Node.js 20+ (ou Bun) et `bun` installé
- Un projet Neon (branch de dev `br-sweet-wind-b5ucg81p` dans `.env.local` actuel)
- Un bucket S3-compatible privé nommé `uploads` (AWS S3, Cloudflare R2, MinIO…) accessible depuis le serveur

## 2. Variables d’environnement

Copier `.env.example` → `.env.local` puis remplir :

| Variable | Rôle | État actuel dans le repo |
|---|---|---|
| `DATABASE_URL` | Pooler Neon (WebSocket, requis pour les transactions) | ✅ Live |
| `DATABASE_URL_UNPOOLED` | Connexion directe (migrations) | ✅ Live |
| `NEON_BRANCH` | Branch Neon utilisée | ✅ Live |
| `BETTER_AUTH_SECRET` | Secret sessions Better Auth | ✅ Live |
| `BETTER_AUTH_URL` | Base URL publique de l’app | ✅ Live |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | URL publique (appels API + liens) | ✅ Live |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `AWS_ENDPOINT_URL_S3` | Uploads S3 | ✅ Live |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Connexion Google OAuth | ✅ Live (`.env.local`) |
| `PAYMENT_WEBHOOK_SECRET` | Signature webhooks paiement | ⚠️ Placeholder |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API (WhatsApp + OTP) | ⚠️ À remplir |
| `WHATSAPP_GRAPH_VERSION` | Version de l’API Graph (défaut `v23.0`) | ✅ Défaut |
| `META_BUSINESS_ACCOUNT_ID` | Identifiant WABA (informatif) | ⚠️ Optionnel |
| `PAYTECH_API_URL` / `PAYTECH_API_KEY` / `PAYTECH_API_SECRET` / `PAYTECH_ENV` | Liens de paiement mobile money (PayTech) | ⚠️ À remplir |
| `PAYDUNYA_*` / `FEDAPAY_*` | Passerelles alternatives | ⚠️ Optionnel |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS de repli (optionnel) | ⚠️ Optionnel |
| `API_PORT` | Port du serveur Bun optionnel (`server/index.ts`) | 8787 |

> Les relances (WhatsApp) et liens de paiement appellent leur fournisseur uniquement quand les identifiants sont renseignés. Sans eux, les endpoints renvoient une réponse de type *preview* (`delivered: false`) ou une erreur JSON claire — pas de plantage. Le code OTP téléphone échoue proprement (« aucun canal de livraison configuré ») tant que `WHATSAPP_ACCESS_TOKEN` ou `TWILIO_*` manquent.

## 3. Commandes

```bash
bun install

# Développement (Next hôte l'API Hono)
bun run dev                 # http://localhost:3000

# Typecheck + build de production
bun run typecheck
bun run build               # sortie Next standard (next start)

# Base de données (migrations Drizzle)
bun run db:generate         # après modification des schémas db/schema.ts
bun run db:migrate          # applique les migrations sur DATABASE_URL_UNPOOLED
```

## 4. Exécution en production

```bash
# Build déjà effectué : lancer le serveur
bun run start               # next start, port 3000
```

Déploiement conseillé : un process Node (ou conteneur) exécutant `next start`. Exemple Docker multi-stage minimal :

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./
COPY --from=build /app/.env.local ./.env.local
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
```

### Notes d’infrastructure

- **Base de données** : le pooler WebSocket (`DATABASE_URL`) est obligatoire — le driver HTTP Neon ne supporte pas `db.transaction`, utilisé par plusieurs handlers.
- **Uploads** : le bucket doit être **privé** ; les fichiers passent par une URL présignée (PUT côté navigateur) puis sont servis via `GET /api/uploads/*` protégé par session (owner/manager). Les formulaires stockent l’URL absolue du proxy (`/api/uploads/{key}`).
- **CORS** : intact — le front et le back partagent le même domaine (Next hôte Hono), aucune configuration CORS requise.
- **Sessions** : Better Auth stocke les cookies de session dans la base (`session`), ce qui autorise un déploiement multi-instance sans store externe.

## 5. Configuration fournisseurs

### 5.1 Google OAuth

Console Google Cloud → Identifiants OAuth → `GOOGLE_CLIENT_ID/SECRET`. Ajouter `https://<domaine>/api/auth/callback/google` aux URI de redirection autorisées.

### 5.2 WhatsApp — Meta Cloud API (templates + OTP)

Suivre le guide officiel *WhatsApp Cloud API Get Started* (développeurs.facebook.com), puis rassembler :

1. `WHATSAPP_PHONE_NUMBER_ID` — l’ID numérique du numéro « From » (panneau **API Setup**).
2. `WHATSAPP_ACCESS_TOKEN` — jeton permanent d’un **utilisateur système** (Business Settings → System users) avec les permissions `business_management`, `whatsapp_business_messaging`, `whatsapp_business_management`.
3. `META_BUSINESS_ACCOUNT_ID` — l’ID du compte WhatsApp Business (informatif).
4. **Créez 3 templates** (API Setup → Message templates → WhatsApp template) avec exactement les noms et variables ci-dessous — les textes sont envoyés tels quels via l’API Graph `v23.0`.

| Nom | Catégorie | Corps (français) |
|---|---|---|
| `naya_otp` | **Authentication** | `Votre code Naya est : {{1}}. Il expire dans 5 minutes.` |
| `relance_loyer` | **Utility** | `Bonjour {{1}}, nous vous rappelons que le loyer de {{2}} ({{3}}) est attendu pour le {{4}}. Montant : {{5}} FCFA. Merci.` |
| `note_charges` | **Utility** | `Bonjour {{1}}, note {{2}} {{3}} : {{4}} FCFA pour {{5}}. Merci.` |

Ordre des variables envoyées par l’application :

- `naya_otp` → `{{1}}` = code OTP (6 chiffres)
- `relance_loyer` → `{{1}}`=nom du locataire, `{{2}}`=unité, `{{3}}`=immeuble, `{{4}}`=échéance, `{{5}}`=montant FCFA
- `note_charges` → `{{1}}`=nom du locataire, `{{2}}`=type de charge (eau/électricité/sécurité/autres charges), `{{3}}`=période, `{{4}}`=montant FCFA, `{{5}}`=unité

Une fois approuvés et les variables ci-dessus dans `.env.local`, les relances (« Relancer »), les notifications de charge et l’OTP téléphone fonctionnent réellement.

### 5.3 Mobile money — PayTech (défaut)

API officielle : `https://doc.paytech.sn/doc_paytech.php` — `/payment/request-payment`, authentifiée par les headers `API_KEY` et `API_SECRET`.

1. Créer un compte PayTech, récupérer les clés depuis **Paramètres → API**.
2. `PAYTECH_API_URL=https://paytech.sn/api`, `PAYTECH_ENV=test` pour le sandbox (un montant aléatoire 100-150 FCFA est débité, pas le vrai montant).
3. `PAYMENT_WEBHOOK_SECRET` pour sécuriser les webhooks JSON des autres passerelles ; l’IPN PayTech (form POST avec `type_event` = `sale_complete` / `sale_canceled` et `ref_command`) est géré par `POST /api/webhooks/payments/paytech` et met à jour le paiement par référence `NAYA-<paymentId>`.
4. Passer `PAYTECH_ENV=prod` uniquement après activation du compte par l’équipe PayTech (courriel avec NINEA, pièce d’identité, registre de commerce, etc.).

**Important** : le mode test ne doit jamais servir à des paiements réels, et `env=prod` est refusé tant que le compte n’est pas activé.

### 5.4 SMS de repli (optionnel)

`TWILIO_*` n’est utilisé qu’en secours : si Meta WhatsApp n’est pas configuré, l’OTP téléphone tente SMS puis échoue proprement. Pour le MVP, WhatsApp seul suffit.

### 5.5 `BETTER_AUTH_URL`

Doit pointer vers le domaine public en production (et, en local, rester `http://localhost:3000`).

## 6. Vérifications post-déploiement

```bash
# Page d'accueil protégée (redirige vers /login sans session)
curl -s -o /dev/null -w "%{http_code}\n" https://VOTRE-DOMAINE/buildings   # 307/302 sans cookie

# API sans session → 401
curl -s -o /dev/null -w "%{http_code}\n" https://VOTRE-DOMAINE/api/buildings # 401

# Premier compte créé = role "owner" (auto-provisioning)
# Les comptes suivants = "tenant" → redirigés vers l'espace locataire /espace-locataire
# jusqu'à promotion dans /team (owner uniquement).
```

## 7. États connus

- Les comptes de démonstration (`owner-test@naya.app`, `manager-test@naya.app`, `fatou-test@naya.app`) et leurs données de test sont conservés dans la base.
- Le premier compte signé s’auto-provisionne `owner` ; les suivants `tenant` (redirigés vers l’espace locataire tant qu’aucun bâtiment ne leur est rattaché).
- L’espace locataire (`/espace-locataire`) est accessible : connexion par téléphone + OTP WhatsApp, consultation du bail, montant dû, historique des paiements (reçu PDF), notes de charges, et lien de paiement mobile money pour les références en attente.
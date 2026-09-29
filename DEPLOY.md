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
| `PAYMENT_WEBHOOK_SECRET` | Signature webhooks paiement | ⚠️ Placeholder |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Connexion Google OAuth | ⚠️ Placeholder (vide) |
| `PAYTECH_API_URL` / `PAYDUNYA_API_URL` / `PAYDUNYA_KEY` / `PAYDUNYA_SECRET` / `FEDAPAY_API_URL` / `FEDAPAY_TOKEN` | Liens de paiement mobile money | ⚠️ Placeholder |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS / WhatsApp via Twilio | ⚠️ Placeholder (vide) |
| `GREEN_API_URL` / `GREEN_API_TOKEN` / `GREEN_API_INSTANCE_ID` | WhatsApp via Green API | ⚠️ Placeholder (vide) |
| `API_PORT` | Port du serveur Bun optionnel (`server/index.ts`) | 8787 |

> Les relances (WhatsApp) et liens de paiement appellent leur fournisseur uniquement quand les identifiants sont renseignés. Sans eux, les endpoints renvoient une réponse de type *preview* (`delivered: false`) ou une erreur JSON claire — pas de plantage.

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

- **Base de données** : le pooler WebSocket (`DATABASE_URL`) est obligatoire — le driver HTTP Neon ne supporte pas `db.transaction`, utilisé par 8 handlers (`leases`, `apartments`, `payments`, `utilities`, etc.).
- **Uploads** : le bucket doit être **privé** ; les fichiers passent par une URL présignée (PUT côté navigateur) puis sont servis via `GET /api/uploads/*` protégé par session (owner/manager). Les formulaires stockent l’URL absolue du proxy (`/api/uploads/{key}`).
- **CORS** : intact — le front et le back partagent le même domaine (Next hôte Hono), aucune configuration CORS requise.

## 5. Configuration fournisseurs (à brancher avant mise en ligne)

1. **Google OAuth** — console Google Cloud → identifiants OAuth → `GOOGLE_CLIENT_ID/SECRET`, autoriser les redirections `BETTER_AUTH_URL`.
2. **WhatsApp / SMS** — soit Green API (`GREEN_API_*`), soit Twilio (`TWILIO_*`). Le code de `lib/notifications.ts` bascule selon la variable renseignée.
3. **Mobile money** — remplir le provider choisi (`PAYTECH_API_URL`, ou `PAYDUNYA_*`, ou `FEDAPAY_*`) dans `lib/payment-providers.ts`. Définir `PAYMENT_WEBHOOK_SECRET` pour sécuriser `POST /api/payments/webhook`.
4. **`BETTER_AUTH_URL`** — doit pointer vers le domaine public en production.

## 6. Vérifications post-déploiement

```bash
# Page d'accueil protégée (redirige vers /login sans session)
curl -s -o /dev/null -w "%{http_code}\n" https://VOTRE-DOMAINE/buildings   # 307/302 sans cookie

# API sans session → 401
curl -s -o /dev/null -w "%{http_code}\n" https://VOTRE-DOMAINE/api/buildings # 401

# Premier compte créé = role "owner" (auto-provisioning)
# Les comptes suivants = "tenant" jusqu'à promotion dans /team (owner uniquement).
```

## 7. États connus

- Les comptes de démonstration (`owner-test@naya.app`, `manager-test@naya.app`, `fatou-test@naya.app`) et leurs données de test sont conservés dans la base.
- Le premier compte signé s’auto-provisionne `owner` ; les suivants `tenant` (écran « Accès en attente d’approbation » jusqu’à promotion).
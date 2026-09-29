# Naya — gestion locative

Naya est un tableau de bord B2B de gestion locative pour les propriétaires, gérants et bailleurs de la diaspora africaine. L’interface est en français, mobile-first, et replace les informations dispersées entre cahiers, WhatsApp et tableurs par une vue unique des loyers, charges, baux et incidents.

## Ce qui est inclus

- **Vue d’ensemble** : encaissements, taux de recouvrement, occupation, alertes de relances et activité récente.
- **Immeubles & unités** : portefeuille multi-immeubles, statuts occupé/libre/travaux, loyers unitaires.
- **Locataires & baux** : annuaire, téléphone/WhatsApp, période de bail, caution et **téléchargement de `contract.pdf`** (PDF généré côté serveur, URL persistée sur le bail).
- **Paiements** : Wave, Orange Money, MTN Mobile Money, espèces et virement ; filtres, recherche, lien de paiement, relance WhatsApp et reçus PDF.
- **Factures communes** : saisie d’une facture, répartition automatique, notification des locataires et aperçu des notes individuelles.
- **Incidents & travaux** : tickets photo/description/coût, priorité, suivi et résolution.
- **Équipe** : gestion des rôles (propriétaire / gérant), écran d’attente pour les comptes locataires.
- **API Hono** : CRUD protégés par Better Auth, hébergés **dans Next.js** (`app/api/[[...route]]/route.ts`) pour immeubles, unités, locataires, baux, paiements, factures communes, tickets, utilisateurs et rapports.
- **Uploads** : stockage privé S3-compatible (URL présignées + proxy authentifié) pour photos et factures.
- **Rapports** : synthèse financière, export CSV/PDF et portail de lecture seule pour le propriétaire expatrié.

## Stack

- Next.js 15 / React 19 / Tailwind CSS 4
- Lucide React
- Drizzle ORM + Neon PostgreSQL
- Hono API (hébergée dans Next.js)
- Better Auth (email, Google OAuth et OTP téléphone)
- Adaptateurs PayTech / PayDunya / FedaPay
- Adaptateurs Twilio / Green API pour SMS et WhatsApp
- S3-compatible object storage (upload privé, présigné et proxifié)

## Démarrage

```bash
bun install
cp .env.example .env.local
bun run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

> **Déploiement** : voir [`DEPLOY.md`](DEPLOY.md) — variables d’environnement complètes, build de production, Docker et branchement des fournisseurs (Google OAuth, WhatsApp/SMS, mobile money).

Hono est le routeur API unique. Il est monté dans `app/api/[[...route]]/route.ts` par un adaptateur Next.js très court : Better Auth, les webhooks et les endpoints publics passent donc par le même backend. Le serveur Hono séparé reste disponible pour un déploiement autonome :

```bash
bun run dev:api
```

Les variables `DATABASE_URL` et les clés providers ne sont nécessaires qu’aux opérations backend. L’aperçu de l’interface fonctionne sans elles.

## Neon

Le projet est lié à Neon dans `.neon` (production) et la politique de services est versionnée dans `neon.ts` avec un bucket d’uploads privé. Les variables de la branche sont dans `.env.local` (ignoré par Git).

```bash
neon status
neon config plan
neon deploy
```

Le serveur MCP Neon est installé pour OpenCode ; l’authentification se fait au premier accès MCP. Les skills Neon sont dans `.agents/skills/`.

## API Hono

Toutes les routes métier sont montées par Next.js sous `/api` et passent par Better Auth :

```text
GET/POST       /api/buildings
GET/PATCH/DELETE /api/buildings/:id
GET/POST       /api/buildings/:buildingId/apartments
GET/PATCH/DELETE /api/apartments/:id
GET/POST       /api/tenants
GET/PATCH/DELETE /api/tenants/:id
GET/POST       /api/leases
GET/PATCH/DELETE /api/leases/:id
POST           /api/leases/:id/terminate
GET/POST       /api/payments
GET/PATCH/DELETE /api/payments/:id
GET            /api/payments/:id/receipt.pdf
POST           /api/payments/:id/create-link
POST           /api/webhooks/payments/:provider
GET/POST       /api/buildings/:buildingId/utilities
GET/PATCH/DELETE /api/utilities/:id
GET            /api/utilities/:id/splits
POST           /api/utilities/:id/notify
GET/POST       /api/tickets
GET/PATCH/DELETE /api/tickets/:id
POST           /api/tickets/:id/resolve
GET            /api/reports/summary
GET            /api/reports/export.csv
GET            /api/reports/export.pdf
GET            /api/users/me
GET            /api/users
PATCH          /api/users/:id/role
```

Les routes métier nécessitent une session. Modèle SaaS : chaque nouveau compte email/Google amorce son propre portefeuille comme `owner`, puis invite ou promeut ses gérants depuis la page Équipe.

## Frontend shadcn/ui

Le projet utilise shadcn/ui avec le preset `base-nova`, Tailwind CSS v4 et les composants source dans `components/ui/`. Il n’y a pas de `tailwind.config.js` : la configuration Tailwind v4 est centralisée dans `app/globals.css`.

Le dashboard est découpé en pages Next.js sous `app/(dashboard)/` :
- `/` — vue d’ensemble
- `/buildings`
- `/tenants`
- `/leases`
- `/payments`
- `/utilities`
- `/tickets`
- `/reports`


Better Auth est intégré directement dans Hono (`/api/auth/*`). Le dashboard est protégé par `middleware.ts`, `lib/dashboard-guard.ts` (redirection tenant → portail) et une vérification serveur de session dans chaque page.

Deux surfaces de connexion distinctes :
- `/login` — **gestionnaires & propriétaires uniquement** : email + mot de passe, Google OAuth.
- `/espace-locataire` — **locataires uniquement** : téléphone + OTP WhatsApp (`naya_otp`), notes de charges, liens de paiement et reçus PDF.

Rôles : `owner`, `manager`, `tenant`
- Les propriétaires et gérants ont un accès scoped aux immeubles qui leur sont assignés.
- Les propriétaires de la diaspora utilisent le même espace et les mêmes routes que les gérants locaux.

Variables requises :

```text
BETTER_AUTH_SECRET
BETTER_AUTH_URL
DATABASE_URL
```


Le schéma Drizzle se trouve dans `db/schema.ts` et couvre les entités `Building`, `Apartment`, `Tenant`, `Lease`, `Payment`, `CommonUtility`, `UtilitySplit` et `MaintenanceTicket`, ainsi que les utilisateurs et relations. Pour appliquer les migrations sur la branche Neon liée :

```bash
bun run db:migrate
```

Pour générer une nouvelle migration après une modification du schéma :

```bash
bun run db:generate
```

## Structure

```text
app/                 pages, Server Actions et routes API Next.js
components/          dashboard Naya responsive
db/                  schéma Drizzle et connexion Neon
lib/                 auth, paiements, notifications et répartition des charges
server/              application Hono API
```

## Vérifications

```bash
bun run typecheck
bun run build
```

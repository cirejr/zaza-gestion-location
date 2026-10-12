CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "invitations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "invitations" CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_agency_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "agency_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" text;--> statement-breakpoint
-- --- Backfill: turn the pre-organization (single-agency) data into agencies ---
-- Each owner (and any building owner) becomes an agency keyed by its user id, so
-- existing records keep a stable organization identifier. Ephemeral data
-- (app invitations) was dropped above; nothing else is destroyed.
INSERT INTO "organization" ("id", "name", "slug", "created_at")
SELECT u.id::text,
       COALESCE(NULLIF(u.name, ''), 'Agence'),
       'agence-' || substring(replace(u.id::text, '-', ''), 1, 12),
       now()
FROM "users" u
WHERE u.role = 'owner'
   OR EXISTS (SELECT 1 FROM "buildings" b WHERE b."owner_id" = u.id);--> statement-breakpoint
UPDATE "users" SET "organization_id" = id::text WHERE role = 'owner';--> statement-breakpoint
UPDATE "users" u
SET "organization_id" = b."owner_id"::text
FROM "buildings" b
WHERE b."manager_id" = u.id AND u.role = 'manager' AND u."organization_id" IS NULL;--> statement-breakpoint
INSERT INTO "member" ("id", "organization_id", "user_id", "role", "created_at")
SELECT gen_random_uuid()::text,
       u."organization_id",
       a.id,
       CASE WHEN u.role = 'owner' THEN 'owner' ELSE 'member' END,
       now()
FROM "users" u
JOIN "user" a ON lower(a.email) = lower(u.email)
WHERE u."organization_id" IS NOT NULL;--> statement-breakpoint
UPDATE "buildings" SET "organization_id" = "owner_id"::text WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "financial_accounts" fa
SET "organization_id" = COALESCE(
  (SELECT b."organization_id" FROM "buildings" b WHERE b.id = fa."building_id"),
  (SELECT u."organization_id" FROM "users" u WHERE u.id = fa."created_by_id")
)
WHERE fa."organization_id" IS NULL;--> statement-breakpoint
UPDATE "tenants" t
SET "organization_id" = COALESCE(
  (SELECT b."organization_id"
     FROM "leases" l
     JOIN "apartments" ap ON ap.id = l."apartment_id"
     JOIN "buildings" b ON b.id = ap."building_id"
    WHERE l."tenant_id" = t.id
    LIMIT 1),
  (SELECT u."organization_id" FROM "users" u WHERE u.id = t."created_by")
)
WHERE t."organization_id" IS NULL;--> statement-breakpoint
UPDATE "prospects" p
SET "organization_id" =
  (SELECT u."organization_id" FROM "users" u WHERE u.id = p."created_by")
WHERE p."organization_id" IS NULL;--> statement-breakpoint
UPDATE "subscriptions" s
SET "agency_id" =
  (SELECT u."organization_id" FROM "users" u WHERE u.id::text = s."agency_id")
WHERE EXISTS (SELECT 1 FROM "users" u WHERE u.id::text = s."agency_id" AND u."organization_id" IS NOT NULL);--> statement-breakpoint
DELETE FROM "subscriptions" s
WHERE NOT EXISTS (SELECT 1 FROM "organization" o WHERE o.id = s."agency_id");--> statement-breakpoint
UPDATE "session" s
SET "active_organization_id" = u."organization_id"
FROM "user" a
JOIN "users" u ON lower(u.email) = lower(a.email)
WHERE a.id = s."user_id" AND u."organization_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_organization_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organization_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buildings_organization_idx" ON "buildings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_organization_idx" ON "financial_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "prospects_organization_idx" ON "prospects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenants_organization_idx" ON "tenants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_organization_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
DROP TYPE "public"."invitation_status";
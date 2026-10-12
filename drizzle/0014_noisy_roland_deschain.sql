CREATE TABLE "organization_profiles" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"contact_email" varchar(255),
	"contact_phone" varchar(32),
	"address" text,
	"city" varchar(100),
	"country" varchar(80) DEFAULT 'Sénégal' NOT NULL,
	"website" text,
	"description" text,
	"legal_name" varchar(160),
	"registration_number" varchar(60),
	"tax_id" varchar(60),
	"default_management_fee_basis" "management_fee_basis",
	"default_fee_percent" numeric(5, 2),
	"default_fee_amount" numeric(14, 2),
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Backfill: every agency that already exists has already been "configured" by
-- its owner, so mark it onboarded. This keeps the onboarding wizard limited to
-- agencies created after this migration and never interrupts live accounts.
INSERT INTO "organization_profiles" ("organization_id", "onboarded_at")
SELECT "id", now() FROM "organization"
ON CONFLICT ("organization_id") DO NOTHING;
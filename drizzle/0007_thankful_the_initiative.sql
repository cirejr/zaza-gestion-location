CREATE TYPE "public"."property_type" AS ENUM('studio', 'chambre', 'apartment', 'house', 'commercial', 'other');--> statement-breakpoint
CREATE TYPE "public"."prospect_activity_kind" AS ENUM('created', 'status_change', 'contact', 'note', 'notified', 'visit_scheduled', 'visit_completed', 'visit_cancelled', 'visit_missed', 'converted', 'lost', 'other');--> statement-breakpoint
CREATE TYPE "public"."prospect_reservation_status" AS ENUM('tentative', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('new', 'contacted', 'notified', 'visit_scheduled', 'visited', 'negotiation', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."prospect_visit_status" AS ENUM('scheduled', 'completed', 'cancelled', 'missed');--> statement-breakpoint
CREATE TABLE "prospect_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"kind" "prospect_activity_kind" NOT NULL,
	"actor_id" uuid,
	"from_status" "prospect_status",
	"to_status" "prospect_status",
	"apartment_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"apartment_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "prospect_reservation_status" DEFAULT 'tentative' NOT NULL,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"apartment_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "prospect_visit_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"outcome" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"whatsapp_number" varchar(32),
	"email" varchar(255),
	"preferred_contact" varchar(32),
	"notes" text,
	"property_type" "property_type",
	"location" varchar(160),
	"budget_min" numeric(14, 2),
	"budget_max" numeric(14, 2),
	"bedrooms" integer,
	"furnished" boolean,
	"move_in_date" date,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" text,
	"status" "prospect_status" DEFAULT 'new' NOT NULL,
	"created_by" uuid NOT NULL,
	"converted_tenant_id" uuid,
	"converted_lease_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apartments" ADD COLUMN "type" "property_type" DEFAULT 'apartment' NOT NULL;--> statement-breakpoint
ALTER TABLE "apartments" ADD COLUMN "furnished" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apartments" ADD COLUMN "amenities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "move_out_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_reservations" ADD CONSTRAINT "prospect_reservations_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_reservations" ADD CONSTRAINT "prospect_reservations_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_reservations" ADD CONSTRAINT "prospect_reservations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_visits" ADD CONSTRAINT "prospect_visits_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_visits" ADD CONSTRAINT "prospect_visits_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_visits" ADD CONSTRAINT "prospect_visits_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_converted_tenant_id_tenants_id_fk" FOREIGN KEY ("converted_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_converted_lease_id_leases_id_fk" FOREIGN KEY ("converted_lease_id") REFERENCES "public"."leases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_activities_prospect_idx" ON "prospect_activities" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "prospect_reservations_prospect_idx" ON "prospect_reservations" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "prospect_reservations_apartment_idx" ON "prospect_reservations" USING btree ("apartment_id");--> statement-breakpoint
CREATE INDEX "prospect_visits_prospect_idx" ON "prospect_visits" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "prospect_visits_apartment_idx" ON "prospect_visits" USING btree ("apartment_id");--> statement-breakpoint
CREATE INDEX "prospects_created_by_idx" ON "prospects" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "prospects_status_idx" ON "prospects" USING btree ("status");
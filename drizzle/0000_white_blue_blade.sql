CREATE TYPE "public"."apartment_status" AS ENUM('occupied', 'vacant', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."lease_status" AS ENUM('draft', 'active', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'wave', 'orange_money', 'mtn_momo', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."split_status" AS ENUM('pending', 'split', 'notified');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('pending', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'manager', 'tenant');--> statement-breakpoint
CREATE TYPE "public"."utility_type" AS ENUM('water', 'electricity', 'security', 'other');--> statement-breakpoint
CREATE TABLE "apartments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"unit_number" varchar(32) NOT NULL,
	"floor" integer,
	"bedrooms" integer DEFAULT 1 NOT NULL,
	"area_sqm" integer,
	"rent_amount" numeric(14, 2) NOT NULL,
	"status" "apartment_status" DEFAULT 'vacant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100),
	"country" varchar(80) DEFAULT 'Sénégal' NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unit_count" integer DEFAULT 0 NOT NULL,
	"owner_id" uuid NOT NULL,
	"manager_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "common_utilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"type" "utility_type" NOT NULL,
	"supplier" varchar(160),
	"total_amount" numeric(14, 2) NOT NULL,
	"period" varchar(32) NOT NULL,
	"split_status" "split_status" DEFAULT 'pending' NOT NULL,
	"invoice_url" text,
	"split_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"rent_amount" numeric(14, 2) NOT NULL,
	"deposit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "lease_status" DEFAULT 'draft' NOT NULL,
	"contract_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"apartment_id" uuid,
	"title" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"photo_url" text,
	"cost" numeric(14, 2),
	"status" "ticket_status" DEFAULT 'pending' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"deduct_from_rent" boolean DEFAULT false NOT NULL,
	"reported_by" uuid,
	"assigned_to" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"transaction_ref" varchar(180),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"receipt_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"whatsapp_number" varchar(32),
	"identity_doc_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(32),
	"image" text,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "utility_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" uuid NOT NULL,
	"apartment_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apartments" ADD CONSTRAINT "apartments_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "common_utilities" ADD CONSTRAINT "common_utilities_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_splits" ADD CONSTRAINT "utility_splits_utility_id_common_utilities_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."common_utilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_splits" ADD CONSTRAINT "utility_splits_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apartments_building_unit_unique" ON "apartments" USING btree ("building_id","unit_number");--> statement-breakpoint
CREATE INDEX "apartments_building_idx" ON "apartments" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "buildings_owner_idx" ON "buildings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "buildings_manager_idx" ON "buildings" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "common_utilities_building_idx" ON "common_utilities" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "common_utilities_period_idx" ON "common_utilities" USING btree ("period");--> statement-breakpoint
CREATE INDEX "leases_apartment_idx" ON "leases" USING btree ("apartment_id");--> statement-breakpoint
CREATE INDEX "leases_tenant_idx" ON "leases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "leases_status_idx" ON "leases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "maintenance_tickets_building_idx" ON "maintenance_tickets" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "maintenance_tickets_status_idx" ON "maintenance_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_lease_idx" ON "payments" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "utility_splits_utility_apartment_unique" ON "utility_splits" USING btree ("utility_id","apartment_id");
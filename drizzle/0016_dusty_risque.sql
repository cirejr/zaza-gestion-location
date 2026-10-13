CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."manual_pay_method" AS ENUM('wave', 'orange_money', 'mtn_momo', 'mobile_money', 'cash');--> statement-breakpoint
CREATE TYPE "public"."payment_request_status" AS ENUM('pending', 'notified', 'confirmed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subscription_event_kind" AS ENUM('created', 'notified', 'confirmed', 'rejected', 'activated', 'extended', 'suspended', 'reactivated', 'plan_changed', 'adjustment', 'expired', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."subscription_status" ADD VALUE 'trialing';--> statement-breakpoint
ALTER TYPE "public"."subscription_status" ADD VALUE 'pending_payment';--> statement-breakpoint
ALTER TYPE "public"."subscription_status" ADD VALUE 'past_due';--> statement-breakpoint
ALTER TYPE "public"."subscription_status" ADD VALUE 'suspended';--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" text NOT NULL,
	"subscription_id" uuid,
	"request_id" uuid,
	"kind" "subscription_event_kind" NOT NULL,
	"actor_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_payment_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method" "manual_pay_method" NOT NULL,
	"display_name" varchar(160),
	"phone_number" varchar(32),
	"instructions" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" text NOT NULL,
	"subscription_id" uuid,
	"plan_id" uuid,
	"billing_interval" "billing_interval" NOT NULL,
	"expected_amount_xof" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"reference" varchar(40) NOT NULL,
	"method" "manual_pay_method" DEFAULT 'wave' NOT NULL,
	"status" "payment_request_status" DEFAULT 'pending' NOT NULL,
	"claimed_ref" varchar(180),
	"claimed_paid_at" timestamp with time zone,
	"note" text,
	"receipt_url" text,
	"actual_amount_xof" integer,
	"actual_paid_at" timestamp with time zone,
	"transaction_ref" varchar(180),
	"admin_note" text,
	"reject_reason" text,
	"amount_override" boolean DEFAULT false NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_payment_requests_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"monthly_price_xof" integer NOT NULL,
	"annual_price_xof" integer NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "suspend_reason" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "grace_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_request_id_subscription_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."subscription_payment_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payment_requests" ADD CONSTRAINT "subscription_payment_requests_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payment_requests" ADD CONSTRAINT "subscription_payment_requests_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payment_requests" ADD CONSTRAINT "subscription_payment_requests_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payment_requests" ADD CONSTRAINT "subscription_payment_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payment_requests" ADD CONSTRAINT "subscription_payment_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_events_agency_idx" ON "subscription_events" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "subscription_events_subscription_idx" ON "subscription_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_events_request_idx" ON "subscription_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "payment_requests_agency_idx" ON "subscription_payment_requests" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "payment_requests_status_idx" ON "subscription_payment_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_reference_uq" ON "subscription_payment_requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payment_requests_subscription_idx" ON "subscription_payment_requests" USING btree ("subscription_id");--> statement-breakpoint
INSERT INTO "subscription_plans" ("code", "name", "description", "monthly_price_xof", "annual_price_xof", "features", "is_active")
VALUES ('standard', 'Standard', 'Abonnement agence — gestion locative complète.', 5000, 50000, '["Biens et baux illimités", "Comptabilité", "Notifications"]', true)
ON CONFLICT ("code") DO UPDATE SET "monthly_price_xof" = EXCLUDED."monthly_price_xof", "annual_price_xof" = EXCLUDED."annual_price_xof", "is_active" = true;--> statement-breakpoint
INSERT INTO "subscription_payment_instructions" ("method", "display_name", "phone_number", "instructions", "sort_order", "is_active")
VALUES
('wave', 'Naya — Wave', NULL, 'Payez le montant exact via Wave au numéro affiché par l''administrateur, puis saisissez la référence de transaction dans votre demande.', 1, true),
('orange_money', 'Naya — Orange Money', NULL, 'Payez le montant exact via Orange Money, puis saisissez la référence de transaction dans votre demande.', 2, true),
('cash', 'Naya — Espèces', NULL, 'Rendez-vous au point de collecte indiqué par l''administrateur avec votre référence de demande. Exigez un reçu.', 3, true)
ON CONFLICT DO NOTHING;
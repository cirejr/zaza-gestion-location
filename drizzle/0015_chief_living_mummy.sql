CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"saspay_payment_id" varchar(180) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"net_amount" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"raw_event" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_payments_subscription_id_unique" UNIQUE("subscription_id"),
	CONSTRAINT "subscription_payments_saspay_payment_id_unique" UNIQUE("saspay_payment_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "net_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "saspay_checkout_id" varchar(180);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "saspay_payment_id" varchar(180);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_saspay_payment_id_uq" ON "subscriptions" USING btree ("saspay_payment_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_saspay_payment_id_unique" UNIQUE("saspay_payment_id");
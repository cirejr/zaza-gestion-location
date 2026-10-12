CREATE TYPE "public"."building_owner_kind" AS ENUM('self', 'third_party');--> statement-breakpoint
CREATE TYPE "public"."chargeable_to" AS ENUM('owner', 'agency');--> statement-breakpoint
CREATE TYPE "public"."financial_account_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."financial_account_type" AS ENUM('wave', 'orange_money', 'mobile_money', 'bank', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."financial_transaction_flow" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."financial_transaction_kind" AS ENUM('rent', 'income', 'expense', 'transfer', 'deposit', 'deposit_refund', 'settlement', 'adjustment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."financial_transaction_status" AS ENUM('posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."management_fee_basis" AS ENUM('percent_collected', 'percent_due', 'fixed', 'percent_collected_plus_fixed');--> statement-breakpoint
CREATE TYPE "public"."owner_statement_line_type" AS ENUM('rent_billed', 'rent_collected', 'other_income', 'expense_owner', 'expense_agency', 'management_fee', 'adjustment', 'net');--> statement-breakpoint
CREATE TYPE "public"."owner_statement_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"type" "financial_account_type" NOT NULL,
	"provider" varchar(120),
	"holder" varchar(120),
	"masked_reference" varchar(120),
	"opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_date" date,
	"building_id" uuid,
	"status" "financial_account_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid,
	"apartment_id" uuid,
	"lease_id" uuid,
	"tenant_id" uuid,
	"account_id" uuid,
	"counterpart_account_id" uuid,
	"transfer_batch_id" uuid,
	"kind" "financial_transaction_kind" NOT NULL,
	"flow" "financial_transaction_flow" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"period" varchar(7),
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" varchar(64),
	"description" text,
	"reference" varchar(180),
	"chargeable_to" chargeable_to,
	"payment_id" uuid,
	"reverses_transaction_id" uuid,
	"status" "financial_transaction_status" DEFAULT 'posted' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_arrangements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"basis" "management_fee_basis" NOT NULL,
	"fee_percent" numeric(5, 2),
	"fee_amount" numeric(14, 2),
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"statement_id" uuid,
	"recipient_name" varchar(160) NOT NULL,
	"recipient_phone" varchar(32),
	"amount" numeric(14, 2) NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"account_id" uuid,
	"reference" varchar(180),
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"line_type" "owner_statement_line_type" NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"status" "owner_statement_status" DEFAULT 'draft' NOT NULL,
	"rent_billed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"rent_collected" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_income" numeric(14, 2) DEFAULT '0' NOT NULL,
	"expenses_owner" numeric(14, 2) DEFAULT '0' NOT NULL,
	"expenses_agency" numeric(14, 2) DEFAULT '0' NOT NULL,
	"management_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"adjustments" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_payable" numeric(14, 2) DEFAULT '0' NOT NULL,
	"remitted" numeric(14, 2) DEFAULT '0' NOT NULL,
	"remaining" numeric(14, 2) DEFAULT '0' NOT NULL,
	"basis" text,
	"finalized_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "owner_kind" "building_owner_kind" DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "external_owner_name" varchar(160);--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "external_owner_phone" varchar(32);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "period" varchar(7);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_counterpart_account_id_financial_accounts_id_fk" FOREIGN KEY ("counterpart_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_reverses_transaction_id_financial_transactions_id_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."financial_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_arrangements" ADD CONSTRAINT "management_arrangements_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_arrangements" ADD CONSTRAINT "management_arrangements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_statement_id_owner_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."owner_statements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement_lines" ADD CONSTRAINT "owner_statement_lines_statement_id_owner_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."owner_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_accounts_building_idx" ON "financial_accounts" USING btree ("building_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transactions_payment_unique" ON "financial_transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "financial_transactions_building_idx" ON "financial_transactions" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "financial_transactions_account_idx" ON "financial_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "financial_transactions_period_idx" ON "financial_transactions" USING btree ("period");--> statement-breakpoint
CREATE INDEX "financial_transactions_kind_idx" ON "financial_transactions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "management_arrangements_building_idx" ON "management_arrangements" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "owner_settlements_building_idx" ON "owner_settlements" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "owner_settlements_period_idx" ON "owner_settlements" USING btree ("period");--> statement-breakpoint
CREATE INDEX "owner_settlements_statement_idx" ON "owner_settlements" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "owner_statement_lines_statement_idx" ON "owner_statement_lines" USING btree ("statement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_statements_building_period_unique" ON "owner_statements" USING btree ("building_id","period");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_period_idx" ON "payments" USING btree ("period");--> statement-breakpoint
CREATE INDEX "payments_account_idx" ON "payments" USING btree ("account_id");
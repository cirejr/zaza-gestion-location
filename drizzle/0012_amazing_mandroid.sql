CREATE TABLE "financial_account_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"statement_balance" numeric(14, 2) NOT NULL,
	"recorded_balance" numeric(14, 2) NOT NULL,
	"as_of" date NOT NULL,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD COLUMN "supplier" varchar(180);--> statement-breakpoint
ALTER TABLE "financial_account_reconciliations" ADD CONSTRAINT "financial_account_reconciliations_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_account_reconciliations" ADD CONSTRAINT "financial_account_reconciliations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_account_reconciliations_account_idx" ON "financial_account_reconciliations" USING btree ("account_id","as_of");
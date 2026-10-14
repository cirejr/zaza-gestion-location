CREATE TABLE "closure_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" text NOT NULL,
	"requested_by" uuid,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "policy_version" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "policy_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "closure_requests" ADD CONSTRAINT "closure_requests_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure_requests" ADD CONSTRAINT "closure_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure_requests" ADD CONSTRAINT "closure_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "closure_requests_agency_idx" ON "closure_requests" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "closure_requests_status_idx" ON "closure_requests" USING btree ("status");
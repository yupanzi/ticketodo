CREATE TYPE "public"."ticketodo_api_key_level" AS ENUM('read', 'write', 'admin');--> statement-breakpoint
CREATE TABLE "ticketodo_api_key" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(64) NOT NULL,
	"level" "ticketodo_api_key_level" NOT NULL,
	"start" varchar(9) NOT NULL,
	"hash" text NOT NULL,
	"ttl_days" integer,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ticketodo_audit_log" ADD COLUMN "api_key_id" varchar(64);--> statement-breakpoint
ALTER TABLE "ticketodo_audit_log" ADD COLUMN "api_key_name" varchar(255);--> statement-breakpoint
ALTER TABLE "ticketodo_comment" ADD COLUMN "api_key_id" text;--> statement-breakpoint
ALTER TABLE "ticketodo_api_key" ADD CONSTRAINT "ticketodo_api_key_user_id_ticketodo_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ticketodo_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticketodo_api_key_hash_idx" ON "ticketodo_api_key" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "ticketodo_api_key_user_idx" ON "ticketodo_api_key" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "ticketodo_comment" ADD CONSTRAINT "ticketodo_comment_api_key_id_ticketodo_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."ticketodo_api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticketodo_audit_log_api_key_idx" ON "ticketodo_audit_log" USING btree ("api_key_id","at") WHERE "ticketodo_audit_log"."api_key_id" IS NOT NULL;
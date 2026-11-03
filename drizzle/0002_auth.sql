CREATE TYPE "public"."ticketodo_user_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TABLE "ticketodo_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketodo_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticketodo_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ticketodo_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "ticketodo_user_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticketodo_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ticketodo_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticketodo_account" ADD CONSTRAINT "ticketodo_account_user_id_ticketodo_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ticketodo_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketodo_session" ADD CONSTRAINT "ticketodo_session_user_id_ticketodo_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ticketodo_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticketodo_account_user_id_idx" ON "ticketodo_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticketodo_account_provider_subject_uidx" ON "ticketodo_account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "ticketodo_session_user_id_idx" ON "ticketodo_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ticketodo_verification_identifier_idx" ON "ticketodo_verification" USING btree ("identifier");
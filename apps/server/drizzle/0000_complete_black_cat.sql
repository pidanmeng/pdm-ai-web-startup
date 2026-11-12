CREATE TYPE "public"."demo_run_status" AS ENUM('streaming', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "demo_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal" text NOT NULL,
	"model" varchar(80) NOT NULL,
	"status" "demo_run_status" DEFAULT 'streaming' NOT NULL,
	"raw_output" text,
	"todo_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "demo_todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"priority" varchar(16) DEFAULT 'medium' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demo_todos" ADD CONSTRAINT "demo_todos_run_id_demo_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."demo_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_runs_created_at_idx" ON "demo_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "demo_todos_run_id_idx" ON "demo_todos" USING btree ("run_id");
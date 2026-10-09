CREATE TYPE "public"."attachment_status" AS ENUM('pending', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."board_role" AS ENUM('owner', 'member', 'guest');--> statement-breakpoint
CREATE TYPE "public"."board_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"comment_id" uuid,
	"board_id" uuid NOT NULL,
	"uploader_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"status" "attachment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "board_members" (
	"board_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "board_role" NOT NULL,
	CONSTRAINT "board_members_board_id_user_id_pk" PRIMARY KEY("board_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "board_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "pipelines_id_board_id_uq" UNIQUE("id","board_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	CONSTRAINT "stages_id_pipeline_id_uq" UNIQUE("id","pipeline_id")
);
--> statement-breakpoint
CREATE TABLE "storage_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" "priority" NOT NULL,
	"status" "task_status" DEFAULT 'active' NOT NULL,
	"due_date" date,
	"assignee_id" text,
	"completed_at" timestamp with time zone,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_board_fk" FOREIGN KEY ("pipeline_id","board_id") REFERENCES "public"."pipelines"("id","board_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pipeline_board_fk" FOREIGN KEY ("pipeline_id","board_id") REFERENCES "public"."pipelines"("id","board_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_pipeline_fk" FOREIGN KEY ("stage_id","pipeline_id") REFERENCES "public"."stages"("id","pipeline_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_comment_idx" ON "attachments" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "attachments_status_created_idx" ON "attachments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "board_members_user_id_idx" ON "board_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "board_members_board_role_idx" ON "board_members" USING btree ("board_id","role");--> statement-breakpoint
CREATE INDEX "boards_created_at_id_idx" ON "boards" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "comments_task_created_idx" ON "comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "pipelines_board_id_idx" ON "pipelines" USING btree ("board_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stages_pipeline_lower_name_uq" ON "stages" USING btree ("pipeline_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "stages_pipeline_done_uq" ON "stages" USING btree ("pipeline_id") WHERE "stages"."is_done";--> statement-breakpoint
CREATE INDEX "stages_pipeline_position_idx" ON "stages" USING btree ("pipeline_id","position","id");--> statement-breakpoint
CREATE INDEX "tasks_stage_position_idx" ON "tasks" USING btree ("stage_id","position","id");--> statement-breakpoint
CREATE INDEX "tasks_pipeline_idx" ON "tasks" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "tasks_board_assignee_idx" ON "tasks" USING btree ("board_id","assignee_id");
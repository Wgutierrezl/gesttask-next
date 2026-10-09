ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_board_id_uq" UNIQUE("id","board_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_id_board_id_uq" UNIQUE("id","board_id");--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_comment_id_comments_id_fk";
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_board_fk" FOREIGN KEY ("task_id","board_id") REFERENCES "public"."tasks"("id","board_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_board_fk" FOREIGN KEY ("comment_id","board_id") REFERENCES "public"."comments"("id","board_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_board_id_idx" ON "comments" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "attachments_board_id_idx" ON "attachments" USING btree ("board_id");

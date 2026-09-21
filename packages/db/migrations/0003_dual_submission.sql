DROP INDEX "result_submission_one_pending_uq";--> statement-breakpoint
ALTER TABLE "result_submission" ADD COLUMN "side_index" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "result_submission_one_pending_per_side_uq" ON "result_submission" USING btree ("match_id","side_index") WHERE "result_submission"."state" = 'pending' and "result_submission"."side_index" is not null;--> statement-breakpoint
ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_side_index_ck" CHECK (side_index is null or side_index in (0, 1));
-- Results now enter the ledger only when two people agree.
--
-- auto_confirm_at is gone: nothing is accepted because a clock ran out. A match
-- with one unanswered claim stays `reported` until the opponent responds or the
-- coach decides. The coach sees those in division_progress.
--
-- `arranged` also goes. It belonged to the scheduling that was removed in 0005,
-- and its slot is taken by `reported` — one side has claimed a score.

ALTER TABLE "match" DROP CONSTRAINT "match_status_ck";--> statement-breakpoint
DROP INDEX "result_submission_due_ix";--> statement-breakpoint
DROP INDEX "match_outstanding_ix";--> statement-breakpoint
CREATE INDEX "match_outstanding_ix" ON "match" USING btree ("competition_id") WHERE "match"."status" in ('scheduled', 'reported');--> statement-breakpoint
ALTER TABLE "result_submission" DROP COLUMN "auto_confirm_at";--> statement-breakpoint
UPDATE "match" SET status = 'scheduled' WHERE status = 'arranged';--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_status_ck" CHECK (status in ('scheduled', 'reported', 'played', 'disputed', 'void'));

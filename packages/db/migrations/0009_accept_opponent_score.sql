-- "Accept" as an alternative to retyping the score.
--
-- A side's position on a match is either a score of its own or agreement with
-- the other side's. An acceptance is still a claim — it gets its own row, its
-- own side_index and the same score — but accepts_submission_id records that it
-- was a click rather than an independent report. That distinction matters when
-- a result is later questioned.
--
-- The unique constraint comes first: the self-referencing foreign key needs it.

ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_id_club_uq" UNIQUE("id","club_id");
--> statement-breakpoint
ALTER TABLE "result_submission" ADD COLUMN "accepts_submission_id" uuid;
--> statement-breakpoint
ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_accepts_fk"
  FOREIGN KEY ("accepts_submission_id","club_id")
  REFERENCES "public"."result_submission"("id","club_id");

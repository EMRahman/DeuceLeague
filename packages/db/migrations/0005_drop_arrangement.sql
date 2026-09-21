-- Removes scheduling and arrangement tracking.
--
-- These tables recorded players proposing times to each other so that, at the
-- deadline, an unplayed match could be blamed on whoever failed to engage.
-- Both halves of that were wrong:
--
--   Players will not adopt a third calendar alongside work and family. Most
--   arranging happens by text or in the bar, so the tables would be mostly
--   empty — and a sparsely populated blame record is worse than none, because
--   it looks authoritative.
--
--   Worse, it would be misleading even when populated. Players avoid each
--   other for reasons the system cannot see: a feud, a mismatch, someone they
--   would rather not spend two hours with. "Who proposed times" reads as
--   effort and is often nothing of the sort, so penalising on it would be
--   confidently unfair.
--
-- An unplayed match is now simply unplayed, worth whatever rules.points
-- says. A coach who judges one side at fault records a walkover, which is a
-- human decision with a name against it.
--
-- A club that genuinely wants scheduling can add it as an adapter: subscribe
-- to the event stream, keep its own tables, write results back through the
-- API. It does not need to be in the core, and it does not need a fork.

DROP TABLE IF EXISTS "arrangement_response" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "arrangement_proposal" CASCADE;

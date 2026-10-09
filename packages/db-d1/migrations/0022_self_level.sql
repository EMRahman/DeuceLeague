-- Preserve the applicant's own estimate separately from the coach's editable level.
ALTER TABLE join_request ADD COLUMN self_level INTEGER CHECK (self_level BETWEEN 1 AND 10);
--> statement-breakpoint
ALTER TABLE member ADD COLUMN self_level INTEGER CHECK (self_level BETWEEN 1 AND 10);

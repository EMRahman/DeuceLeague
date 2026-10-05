-- What a member wants to play: asked on the join form, set by the coach or the player. Null: not said.
ALTER TABLE member ADD COLUMN plays TEXT CHECK (plays IN ('singles', 'doubles', 'both', 'not_now'));
--> statement-breakpoint
ALTER TABLE join_request ADD COLUMN plays TEXT CHECK (plays IN ('singles', 'doubles', 'both', 'not_now'));

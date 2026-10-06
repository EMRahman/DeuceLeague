-- Preserve existing choices while widening the allowed combinations.
ALTER TABLE member RENAME COLUMN plays TO plays_legacy;
--> statement-breakpoint
ALTER TABLE member ADD COLUMN plays TEXT CHECK (plays IN ('singles', 'doubles', 'mixed_doubles', 'both', 'singles_mixed', 'doubles_mixed', 'all', 'not_now'));
--> statement-breakpoint
UPDATE member SET plays = plays_legacy;
--> statement-breakpoint
ALTER TABLE member DROP COLUMN plays_legacy;
--> statement-breakpoint
ALTER TABLE join_request RENAME COLUMN plays TO plays_legacy;
--> statement-breakpoint
ALTER TABLE join_request ADD COLUMN plays TEXT CHECK (plays IN ('singles', 'doubles', 'mixed_doubles', 'both', 'singles_mixed', 'doubles_mixed', 'all', 'not_now'));
--> statement-breakpoint
UPDATE join_request SET plays = plays_legacy;
--> statement-breakpoint
ALTER TABLE join_request DROP COLUMN plays_legacy;

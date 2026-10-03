-- Latest coach invitation outcome; never an email address or login token.
ALTER TABLE member ADD COLUMN invitation_state TEXT CHECK (invitation_state IN ('accepted', 'failed'));
--> statement-breakpoint
ALTER TABLE member ADD COLUMN invitation_at INTEGER;

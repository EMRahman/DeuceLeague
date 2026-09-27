-- Adapter state, not league history. Only keyed hashes enter this table; no
-- email addresses or login tokens. Expired reservations are pruned on use.
CREATE TABLE website_login_cooldown (
  recipient_hash TEXT PRIMARY KEY NOT NULL CHECK (length(recipient_hash) = 64),
  expires_at INTEGER NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX website_login_cooldown_expiry_ix ON website_login_cooldown (expires_at);

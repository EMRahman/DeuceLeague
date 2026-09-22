-- Nothing is readable without a credential.
--
-- Competitions are shown only to someone who has authenticated — a key, or a
-- player who has logged in — so nothing needs to find a club from its slug
-- before a request has a credential. deuceleague_club_id_for_slug was the one
-- way past row-level security that took no secret at all; it goes, leaving the
-- two resolvers that each need a key or a token.
--
-- Hand-written and registered in meta/_journal.json by hand, like 0011:
-- drizzle-kit does not manage functions or comments.

DROP FUNCTION deuceleague_club_id_for_slug(text);
--> statement-breakpoint

COMMENT ON COLUMN "club"."slug" IS 'The club''s short, URL-safe name, unique on this instance. How people and tools refer to the club; never a way in: every request needs a credential.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."display_name" IS 'The only name that appears in player-scoped responses; full identity fields require the members:pii scope.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."visibility" IS 'Who may see this competition: public, members or private. Nothing is readable without a credential, so for now public and members are treated alike.';

-- Descriptions, in the database itself.
--
-- Hand-written and registered in meta/_journal.json by hand, like 0001, 0002,
-- 0004, 0008 and 0011. drizzle-kit does not manage COMMENT ON. Dropping a view
-- drops its comments, so any later migration that rebuilds a view must re-add
-- that view's comments; `npm run db:verify` fails until it does.
--
-- Taken from the JSDoc on schema.ts, docs/DATA-MODEL.md and the tests, and kept
-- consistent with them. These are what docs/SCHEMA.md is generated from, and
-- what psql's \d+ shows.

COMMENT ON TABLE "club" IS 'One club running the league. The root of every tenant boundary: every other table is scoped to a club, directly or through its parents.';
--> statement-breakpoint
COMMENT ON COLUMN "club"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "club"."slug" IS 'The club''s public, URL-safe identifier. Looked up by deuceleague_club_id_for_slug() to find the club before a request has authenticated, e.g. for an unauthenticated public page.';
--> statement-breakpoint
COMMENT ON COLUMN "club"."name" IS 'The club''s display name.';
--> statement-breakpoint
COMMENT ON COLUMN "club"."timezone" IS 'IANA time zone name (e.g. ''Europe/London''). Every deadline and days-remaining count is interpreted in this zone, never the server''s.';
--> statement-breakpoint
COMMENT ON COLUMN "club"."branding" IS 'Logo, colours and sponsor blocks, served to every client so it renders as the club''s own site rather than a generic one.';
--> statement-breakpoint
COMMENT ON COLUMN "club"."settings" IS 'Club-level settings, as JSON. Nothing in the core reads it yet.';
--> statement-breakpoint
COMMENT ON COLUMN "club"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON COLUMN "club"."updated_at" IS 'When this row was last changed.';
--> statement-breakpoint
COMMENT ON TABLE "member" IS 'A person at the club, most often a player. Soft-deleted, never hard-deleted, because historical results have to survive someone leaving and coming back.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "member"."display_name" IS 'The only name that appears in unauthenticated or player-scoped responses; full identity fields require the members:pii scope.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."full_name" IS 'PII (members:pii scope). This member''s full name.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."email" IS 'PII (members:pii scope). This member''s email address.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."phone" IS 'PII (members:pii scope). This member''s phone number.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."date_of_birth" IS 'PII (members:pii scope). This member''s date of birth.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."gender" IS 'PII (members:pii scope). Recorded only to warn on an ineligible mixed-doubles pairing; never enforced, and the coach''s confirmation always wins. Nullable by design.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."notes" IS 'PII (members:pii scope). Free-text notes about this member.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."rating" IS 'A playing rating for this member, in the system named by rating_system. Stored, never computed: rating computation is deliberately outside the core.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."rating_system" IS 'Which rating system rating is expressed in.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."status" IS 'Whether this member is currently active, paused, or has left the club.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."joined_on" IS 'The date this member joined the club.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."deleted_at" IS 'Soft-delete marker. Members leave and come back, and their historical results have to survive them, so rows are never hard-deleted.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON COLUMN "member"."updated_at" IS 'When this row was last changed.';
--> statement-breakpoint
COMMENT ON TABLE "api_key" IS 'A credential for a non-member client — a bot, an app — to call the API as this club. The key itself is shown once, at creation; only its hash is stored.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."name" IS 'What this key is for, e.g. ''Telegram bot'' or ''Sam''s iOS app'' — set by whoever creates it, so a coach can tell their keys apart.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."key_hash" IS 'SHA-256 hash of the key. The key itself is shown exactly once, at creation, and only this hash is stored.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."prefix" IS 'The key''s leading characters, kept unhashed so a coach can recognise a key in a list without being able to reconstruct it.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."scopes" IS 'Which scopes this key grants (see docs/DATA-MODEL.md § Scopes). A new key defaults to league:read and results:write.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."created_by_member_id" IS 'Which member created this key, if any.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."last_used_at" IS 'When this key was last used to authenticate a request.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."expires_at" IS 'When this key stops being valid. Null means it does not expire on its own.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."revoked_at" IS 'When this key was revoked. A revoked key is refused by deuceleague_resolve_api_key() even if it has not expired.';
--> statement-breakpoint
COMMENT ON COLUMN "api_key"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON TABLE "access_grant" IS 'A short-lived, single-member token backing magic links and player sessions.';
--> statement-breakpoint
COMMENT ON COLUMN "access_grant"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "access_grant"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "access_grant"."member_id" IS 'Which member this grant authenticates. Unlike an API key, a grant always speaks for exactly one member.';
--> statement-breakpoint
COMMENT ON COLUMN "access_grant"."token_hash" IS 'SHA-256 hash of the token. The token itself is shown once, in the magic link or session cookie, and only this hash is stored.';
--> statement-breakpoint
COMMENT ON COLUMN "access_grant"."scopes" IS 'Which scopes this grant carries.';
--> statement-breakpoint
COMMENT ON COLUMN "access_grant"."expires_at" IS 'When this grant stops being valid.';
--> statement-breakpoint
COMMENT ON COLUMN "access_grant"."used_at" IS 'When a one-time magic link was first used. A session token ignores this; the API refuses reuse only for the former.';
--> statement-breakpoint
COMMENT ON COLUMN "access_grant"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON TABLE "season" IS 'A competitive period the club defines. Most run four a year, on dates the coach picks; every competition and division inside a season shares its dates and results deadline.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "season"."name" IS 'The season''s name, e.g. ''Spring 2026''. Unique within the club.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."kind" IS 'Optional label for a club running a quarterly cadence (spring, summer, autumn, winter). Clubs that don''t run seasons this way leave it null.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."year" IS 'Optional label year, alongside kind.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."starts_on" IS 'When the season begins. Null while the season is still being planned; required before it can be activated.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."ends_on" IS 'When the season ends. Must not be before starts_on.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."results_deadline_at" IS 'The single deadline for every competition and division in this season to have results in.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."state" IS 'Where this season is in its lifecycle: planning, active, complete or archived.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON COLUMN "season"."updated_at" IS 'When this row was last changed.';
--> statement-breakpoint
COMMENT ON TABLE "competition" IS 'One league within a season, e.g. Men''s Singles or Mixed Doubles. Carries its own match format and rules, so different competitions can play different formats.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."season_id" IS 'Which season this competition runs within. Every competition and division in a season shares the season''s dates and deadline.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."name" IS 'The competition''s name, e.g. ''Men''s Singles''. Unique within its season.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."format_id" IS 'Which format plugin drives fixture generation, standings and placement suggestions for this competition, e.g. ''box_league''.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."discipline" IS 'Singles or doubles. Determines whether an entry has one member or two.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."category" IS 'Eligibility grouping (open, mens, womens, mixed), advisory only.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."match_format" IS 'Defines what a legal score looks like for this competition — sets to win, games per set, tiebreak rules — as a MatchFormat document from @deuceleague/schema. validateResult() checks every submitted score against it.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."rules" IS 'How this competition''s league works, as data: points per outcome, tiebreak ordering, promotion and relegation counts, what happens on a withdrawal. A RulesSpec document from @deuceleague/schema; see docs/DATA-MODEL.md § The two JSON documents.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."config" IS 'Settings specific to this competition''s format plugin (format_id), validated by that plugin''s own schema rather than by the core.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."sequence_in_season" IS 'Numbers box rounds when a club runs several inside one season. Most clubs leave this at 1 and chain rounds across seasons with previous_competition_id instead.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."previous_competition_id" IS 'The competition this one continues from, if any. Promotion and relegation suggestions are read from here.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."state" IS 'Where this competition is in its lifecycle: draft, active, complete or archived.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."visibility" IS 'Who may read this competition without authenticating as a member: public, members only, or private.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON COLUMN "competition"."updated_at" IS 'When this row was last changed.';
--> statement-breakpoint
COMMENT ON TABLE "division" IS 'A box within a competition. Size is simply however many entries it holds; there is no fixed structure.';
--> statement-breakpoint
COMMENT ON COLUMN "division"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "division"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "division"."competition_id" IS 'Which competition this division belongs to.';
--> statement-breakpoint
COMMENT ON COLUMN "division"."ordinal" IS 'The division''s rank within its competition. 1 is the top division.';
--> statement-breakpoint
COMMENT ON COLUMN "division"."name" IS 'The division''s name, e.g. ''Division 1''.';
--> statement-breakpoint
COMMENT ON COLUMN "division"."target_size" IS 'Advisory target number of entries. Only informs placement suggestions; never enforced, and a division''s actual size is however many entries it holds.';
--> statement-breakpoint
COMMENT ON COLUMN "division"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON COLUMN "division"."updated_at" IS 'When this row was last changed.';
--> statement-breakpoint
COMMENT ON TABLE "entry" IS 'One competing unit in one division: a single member for singles, a pair for doubles. Promotion and relegation move the whole entry, which is what keeps a doubles pair together.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."competition_id" IS 'Which competition this entry belongs to. Denormalised from division_id so that ''one division per competition per member'' (see entry_member) is a constraint the database can express.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."division_id" IS 'Which division this entry currently sits in.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."display_name" IS 'An optional override for how this entry is displayed. Otherwise it is derived from its members'' display names — see the entry_label view.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."seed" IS 'An optional seeding number for this entry. Nothing in the core reads it yet.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."state" IS 'Whether this entry is currently active or has withdrawn.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."placement_reason" IS 'Why this entry sits in this division: promoted, relegated, held, new, returning, or a manual override. Written when the coach confirms placements.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."previous_entry_id" IS 'The same competing unit''s entry in the previous competition, if any, so movement history (promoted from Division 2, etc.) can be read off.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."withdrawn_at" IS 'When this entry withdrew, if state is ''withdrawn''.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."updated_at" IS 'When this row was last changed.';
--> statement-breakpoint
COMMENT ON TABLE "entry_member" IS 'Which members make up an entry: one row for singles, two for doubles.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_member"."entry_id" IS 'Which entry this row belongs to.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_member"."member_id" IS 'Which member makes up part of the entry.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_member"."competition_id" IS 'Denormalised from the entry, so that UNIQUE (competition_id, member_id) can stop a member appearing in two divisions of the same competition.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_member"."club_id" IS 'Denormalised from the entry, so composite foreign keys can require the entry and the member to belong to the same club. Foreign-key checks ignore row-level security, so without this one club could put its member into another club''s entry.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_member"."role" IS 'player or partner, defaulting to player. Orders a doubles pair on a results sheet: entry_label lists the player first.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_member"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON TABLE "match" IS 'A pairing between two entries. A match with no score yet is a fixture — there is no separate fixture table.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "match"."competition_id" IS 'Which competition this match belongs to.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."division_id" IS 'Which division this match belongs to. Null for a friendly or any match generated outside a division.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."status" IS 'This match''s lifecycle: open (nobody has reported), reported (one side has claimed a score), played (both sides agree, or the coach decided), disputed (both sides claimed and differ), or void. Nothing moves to played on a timer — see docs/DATA-MODEL.md § Results.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."outcome" IS 'How the match ended: completed, retired, walkover, conceded, or unplayed. Set only once status is ''played''.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."played_on" IS 'The date the match was played, taken from the claim that settled it.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."score" IS 'The accepted score, as a Score document from @deuceleague/schema. Present only when the match has actually been played (outcome is ''completed'' or ''retired'').';
--> statement-breakpoint
COMMENT ON COLUMN "match"."winning_side" IS 'Which side won: 0 or 1, matching match_side.side_index. Set for every outcome except ''unplayed''.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."retired_side" IS 'Which side retired, conceded, or failed to appear. Set only for those outcomes.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."accepted_submission_id" IS 'The claim that put this result in the ledger — the second of two matching reports, an acceptance, or a coach entry. Required once status is ''played'', so every result traces back to someone saying it; the full trail of claims is in result_submission.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."pairing_key" IS 'A key identifying this pairing (sorted entry ids), used to make fixture generation idempotent: re-running it cannot create the same pairing twice within a division.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON COLUMN "match"."updated_at" IS 'When this row was last changed.';
--> statement-breakpoint
COMMENT ON TABLE "match_side" IS 'One side of a match: which entry was drawn to play it.';
--> statement-breakpoint
COMMENT ON COLUMN "match_side"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "match_side"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "match_side"."match_id" IS 'Which match this is a side of.';
--> statement-breakpoint
COMMENT ON COLUMN "match_side"."competition_id" IS 'Denormalised from the match, so this side''s entry can be required (by a composite foreign key) to come from the same competition as the match.';
--> statement-breakpoint
COMMENT ON COLUMN "match_side"."side_index" IS 'Which side this is: 0 or 1.';
--> statement-breakpoint
COMMENT ON COLUMN "match_side"."entry_id" IS 'The entry drawn to play this side. Who actually took the court is recorded separately in match_participant, so a stand-in does not corrupt the entry''s standing.';
--> statement-breakpoint
COMMENT ON COLUMN "match_side"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON TABLE "match_participant" IS 'Who actually took the court for a match side, which can differ from the entry''s registered members when someone stands in.';
--> statement-breakpoint
COMMENT ON COLUMN "match_participant"."match_side_id" IS 'Which side of which match this member played on.';
--> statement-breakpoint
COMMENT ON COLUMN "match_participant"."member_id" IS 'Which member actually took the court.';
--> statement-breakpoint
COMMENT ON COLUMN "match_participant"."club_id" IS 'Denormalised from the match side, so this row''s member can be tied to the same club by a composite foreign key.';
--> statement-breakpoint
COMMENT ON COLUMN "match_participant"."is_substitute" IS 'True when this member is not part of the entry''s registered line-up — a stand-in filling in for an injured or unavailable partner.';
--> statement-breakpoint
COMMENT ON COLUMN "match_participant"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON TABLE "result_submission" IS 'Every claim ever made about a match''s result — who said what, from where, and what it superseded. The match row holds only the currently accepted score; this table holds the full trail.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."id" IS 'Primary key. The application generates a UUIDv7 so ids sort chronologically and player-facing URLs can''t be enumerated; the column default (gen_random_uuid()) is only a fallback for rows inserted without one.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."match_id" IS 'Which match this claim is about.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."side_index" IS 'Which side is making this claim, matching match_side.side_index. Null only for a coach entry, which speaks for the match as a whole and settles it, so it is never left pending. A bot reporting for a player uses that player''s side.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."submitted_by_member_id" IS 'Which member submitted this claim. Null when it was entered by a coach through an API key rather than as a member.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."submitted_at" IS 'When this claim was submitted.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."score" IS 'The score this claim asserts, as a Score document. Present only when outcome is ''completed'' or ''retired''.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."outcome" IS 'How this claim says the match ended: completed, retired, walkover, conceded, or unplayed.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."retired_side" IS 'Which side this claim says retired, conceded, or failed to appear.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."played_on" IS 'The date this side says the match was played. Never compared between sides — remembering the day differently is not a dispute.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."state" IS 'Whether this claim is still live (pending), has entered the ledger (confirmed), or has been replaced (superseded). There is no ''rejected'': a side replaces its own claim, it does not reject the other''s.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."confirmed_at" IS 'When this claim entered the ledger. Who agreed is recorded on the other side''s claim, not here.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."accepts_submission_id" IS 'Set when this claim is the other side pressing ''accept'' rather than reporting a score of its own; must point at a claim with the same score, on the same match. Null means this claim is an independent report.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."source" IS 'Where this claim came from: web, telegram, api, coach_entry, or nl_parse.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."raw_input" IS 'What the player actually typed, kept to debug a bad natural-language parse and to build the eval set for improving the parser.';
--> statement-breakpoint
COMMENT ON COLUMN "result_submission"."created_at" IS 'When this row was created.';
--> statement-breakpoint
COMMENT ON TABLE "event" IS 'An append-only log of everything that happened: both the audit trail and the webhook outbox adapters read from.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."id" IS 'Primary key, an increasing sequence — but not in commit order, so never page on it alone. See tx_id and the event_feed view.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."tx_id" IS 'The id of the transaction that wrote this event. Event ids are handed out before commit, so a slow transaction can commit a lower id after a higher one is already visible; paging by (tx_id, id) through event_feed is how a reader avoids skipping it.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."club_id" IS 'Which club this row belongs to. Enforced by a row-level security policy comparing it to deuceleague_current_club().';
--> statement-breakpoint
COMMENT ON COLUMN "event"."occurred_at" IS 'When this event happened.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."type" IS 'A dotted event name, e.g. ''match.result.confirmed''.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."subject_type" IS 'What kind of thing this event is about, e.g. ''match''.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."subject_id" IS 'The id of the thing this event is about.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."actor_type" IS 'What kind of actor caused this event: member, api_key, or system.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."actor_id" IS 'The id of the actor that caused this event, if any.';
--> statement-breakpoint
COMMENT ON COLUMN "event"."payload" IS 'The event''s data, as JSON. Its shape depends on type.';
--> statement-breakpoint
COMMENT ON VIEW "entry_label" IS 'How a competing unit is written on a results sheet: the entry''s own display name if it has one, otherwise its members joined by '' / '', player before partner.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_label"."label" IS 'How this entry is written on a results sheet: its own display_name if set, otherwise its members'' display names joined by '' / '', player before partner.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_label"."member_ids" IS 'The ids of the members making up this entry, in the same order as label.';
--> statement-breakpoint
COMMENT ON VIEW "division_progress" IS 'How far through one division is: how many matches are played, outstanding, reported or disputed, and how many days are left to the season''s results deadline.';
--> statement-breakpoint
COMMENT ON COLUMN "division_progress"."days_remaining" IS 'Whole days remaining to the season''s results deadline, counted on the club''s own calendar (club.timezone), not the server''s.';
--> statement-breakpoint
COMMENT ON COLUMN "division_progress"."active_entries" IS 'How many entries in this division are currently active (not withdrawn).';
--> statement-breakpoint
COMMENT ON COLUMN "division_progress"."matches" IS 'How many matches this division has in total, excluding void ones.';
--> statement-breakpoint
COMMENT ON COLUMN "division_progress"."played" IS 'How many of this division''s matches have a result in the ledger.';
--> statement-breakpoint
COMMENT ON COLUMN "division_progress"."outstanding" IS 'How many of this division''s matches are not yet in the ledger — open, reported or disputed.';
--> statement-breakpoint
COMMENT ON COLUMN "division_progress"."reported" IS 'How many matches have one side''s claim in, waiting on the other.';
--> statement-breakpoint
COMMENT ON COLUMN "division_progress"."disputed" IS 'How many matches have two claims that disagree, waiting on a player to re-enter or the coach to settle it.';
--> statement-breakpoint
COMMENT ON COLUMN "division_progress"."percent_played" IS 'The percentage of this division''s matches that have been played, to one decimal place.';
--> statement-breakpoint
COMMENT ON VIEW "competition_progress" IS 'The same figures as division_progress, rolled up to a whole competition.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."days_remaining" IS 'Whole days remaining to the season''s results deadline. See the same column on division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."divisions" IS 'How many divisions this competition has.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."active_entries" IS 'Summed across the competition''s divisions. See the same column on division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."matches" IS 'Summed across the competition''s divisions. See the same column on division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."played" IS 'Summed across the competition''s divisions. See the same column on division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."outstanding" IS 'Summed across the competition''s divisions. See the same column on division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."reported" IS 'Summed across the competition''s divisions. See the same column on division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."disputed" IS 'Summed across the competition''s divisions. See the same column on division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "competition_progress"."percent_played" IS 'The percentage of the competition''s matches that have been played, to one decimal place.';
--> statement-breakpoint
COMMENT ON VIEW "entry_progress" IS 'Played and outstanding matches for one competing unit.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_progress"."matches" IS 'How many matches this entry has in total, excluding void ones.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_progress"."played" IS 'How many of this entry''s matches have a result in the ledger.';
--> statement-breakpoint
COMMENT ON COLUMN "entry_progress"."outstanding" IS 'How many of this entry''s matches are not yet in the ledger.';
--> statement-breakpoint
COMMENT ON VIEW "outstanding_match" IS 'Every match not yet in the ledger, with both sides named.';
--> statement-breakpoint
COMMENT ON COLUMN "outstanding_match"."days_remaining" IS 'Whole days remaining to the season''s results deadline, counted on the club''s own calendar. See division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "outstanding_match"."side0_claimed" IS 'Whether side 0 currently has a live (pending) claim standing on this match.';
--> statement-breakpoint
COMMENT ON COLUMN "outstanding_match"."side1_claimed" IS 'Whether side 1 currently has a live (pending) claim standing on this match.';
--> statement-breakpoint
COMMENT ON VIEW "member_chase_list" IS 'One row per member per division with matches outstanding, split by what is actually needed from them, for driving reminders. The core does not send anything — this view only answers the question.';
--> statement-breakpoint
COMMENT ON COLUMN "member_chase_list"."email" IS 'PII (members:pii scope). This member''s email address, exposed here because a reminder workflow needs it. The API must gate it behind the members:pii scope itself — row-level security does not enforce scopes.';
--> statement-breakpoint
COMMENT ON COLUMN "member_chase_list"."outstanding_matches" IS 'How many of this member''s matches in this division are not yet in the ledger. Always needs_playing + awaiting_you + awaiting_them.';
--> statement-breakpoint
COMMENT ON COLUMN "member_chase_list"."needs_playing" IS 'How many of those matches have no claim from either side yet: nobody has reported a result.';
--> statement-breakpoint
COMMENT ON COLUMN "member_chase_list"."awaiting_you" IS 'How many of those matches have a score in from the opponent that this member has not agreed to, either unanswered or disputed. Accepting it clears the match in one click; so does either side correcting its score to match.';
--> statement-breakpoint
COMMENT ON COLUMN "member_chase_list"."awaiting_them" IS 'How many of those matches this member has claimed, waiting on the opponent to respond.';
--> statement-breakpoint
COMMENT ON COLUMN "member_chase_list"."days_remaining" IS 'Whole days remaining to the season''s results deadline, counted on the club''s own calendar. See division_progress.';
--> statement-breakpoint
COMMENT ON COLUMN "member_chase_list"."waiting_on" IS 'The opponents this member has matches outstanding against, written as on a results sheet (see entry_label).';
--> statement-breakpoint
COMMENT ON VIEW "event_feed" IS 'The event log in the order a consumer should read it: an event is held back until its own transaction, and every earlier one, has committed, so paging on (tx_id, id) never skips one that committed late.';
--> statement-breakpoint
COMMENT ON COLUMN "event_feed"."tx_id" IS 'The id of the transaction that wrote this event; page on (tx_id, id) rather than id alone so a slow transaction''s event is never skipped once it lands.';
--> statement-breakpoint
COMMENT ON FUNCTION deuceleague_current_club() IS 'Returns the club id set on this connection with SET LOCAL app.club_id, or null if none is set. Every row-level security policy compares a row''s club_id against this, so no context set means no rows visible — default deny.';
--> statement-breakpoint
COMMENT ON FUNCTION deuceleague_event_is_append_only() IS 'Trigger function that refuses any UPDATE or DELETE on event, enforcing that the audit log is append-only; a correction must be appended, not edited in place.';
--> statement-breakpoint
COMMENT ON FUNCTION deuceleague_days_until(timestamptz, text) IS 'Whole days from now until deadline, both counted in the given IANA time zone rather than the server''s, so a deadline just after midnight in the club''s zone is not miscounted by a day.';
--> statement-breakpoint
COMMENT ON FUNCTION deuceleague_resolve_api_key(text) IS 'Looks up a live API key (not revoked, not expired) by the SHA-256 hash of its key, returning just enough to set the club context. SECURITY DEFINER: runs as the tables'' owner so it can do this lookup before row-level security would otherwise allow it.';
--> statement-breakpoint
COMMENT ON FUNCTION deuceleague_resolve_access_grant(text) IS 'Looks up an unexpired access grant, for a member who has not been removed, by the SHA-256 hash of its token. SECURITY DEFINER, for the same reason as deuceleague_resolve_api_key().';
--> statement-breakpoint
COMMENT ON FUNCTION deuceleague_club_id_for_slug(text) IS 'Looks up a club''s id from its public slug, for pages that have not authenticated yet. Returns null if the slug is unknown. SECURITY DEFINER, for the same reason as the other resolve functions.';
-- League structure needed to authorize and record results. Dates stay ISO dates;
-- all timestamps are UTC milliseconds. Composite FKs preserve club/competition
-- ownership even though each installation structurally permits only one club.
CREATE TABLE season (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  name TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('spring', 'summer', 'autumn', 'winter')),
  year INTEGER,
  starts_on TEXT,
  ends_on TEXT,
  results_deadline_at INTEGER,
  state TEXT NOT NULL DEFAULT 'planning' CHECK (state IN ('planning', 'active', 'complete', 'archived')),
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (id, club_id),
  CONSTRAINT season_club_name_uq UNIQUE (club_id, name),
  CONSTRAINT season_dates_ck CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
) STRICT;
--> statement-breakpoint
CREATE INDEX season_club_state_ix ON season (club_id, state);
--> statement-breakpoint
CREATE TABLE competition (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  season_id TEXT NOT NULL,
  name TEXT NOT NULL,
  format_id TEXT NOT NULL DEFAULT 'box_league',
  discipline TEXT NOT NULL CHECK (discipline IN ('singles', 'doubles')),
  category TEXT NOT NULL DEFAULT 'open' CHECK (category IN ('open', 'mens', 'womens', 'mixed')),
  match_format TEXT NOT NULL CHECK (json_valid(match_format) AND json_type(match_format) = 'object'),
  rules TEXT NOT NULL CHECK (json_valid(rules) AND json_type(rules) = 'object'),
  config TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config) AND json_type(config) = 'object'),
  sequence_in_season INTEGER NOT NULL DEFAULT 1,
  previous_competition_id TEXT,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'complete', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('members', 'private')),
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (id, club_id),
  CONSTRAINT competition_season_name_uq UNIQUE (season_id, name),
  CONSTRAINT competition_season_fk FOREIGN KEY (season_id, club_id) REFERENCES season(id, club_id) ON DELETE CASCADE,
  CONSTRAINT competition_previous_fk FOREIGN KEY (previous_competition_id, club_id) REFERENCES competition(id, club_id)
) STRICT;
--> statement-breakpoint
CREATE INDEX competition_club_state_ix ON competition (club_id, state);
--> statement-breakpoint
CREATE TABLE division (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  competition_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
  name TEXT NOT NULL,
  target_size INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (id, club_id),
  UNIQUE (id, competition_id),
  CONSTRAINT division_competition_ordinal_uq UNIQUE (competition_id, ordinal),
  CONSTRAINT division_competition_fk FOREIGN KEY (competition_id, club_id) REFERENCES competition(id, club_id) ON DELETE CASCADE
) STRICT;
--> statement-breakpoint
CREATE TABLE entry (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  competition_id TEXT NOT NULL,
  division_id TEXT NOT NULL,
  display_name TEXT,
  seed INTEGER,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'withdrawn')),
  placement_reason TEXT CHECK (placement_reason IN ('promoted', 'relegated', 'held', 'new', 'returning', 'manual')),
  previous_entry_id TEXT,
  withdrawn_at INTEGER,
  opted_out_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (id, club_id),
  UNIQUE (id, competition_id),
  CONSTRAINT entry_competition_fk FOREIGN KEY (competition_id, club_id) REFERENCES competition(id, club_id) ON DELETE CASCADE,
  CONSTRAINT entry_division_fk FOREIGN KEY (division_id, competition_id) REFERENCES division(id, competition_id) ON DELETE CASCADE,
  CONSTRAINT entry_previous_fk FOREIGN KEY (previous_entry_id, club_id) REFERENCES entry(id, club_id)
) STRICT;
--> statement-breakpoint
CREATE INDEX entry_division_ix ON entry (division_id);
--> statement-breakpoint
CREATE TABLE entry_member (
  entry_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  competition_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'partner')),
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (entry_id, member_id),
  CONSTRAINT entry_member_one_division_uq UNIQUE (competition_id, member_id),
  CONSTRAINT entry_member_entry_fk FOREIGN KEY (entry_id, competition_id) REFERENCES entry(id, competition_id) ON DELETE CASCADE,
  CONSTRAINT entry_member_entry_club_fk FOREIGN KEY (entry_id, club_id) REFERENCES entry(id, club_id) ON DELETE CASCADE,
  CONSTRAINT entry_member_member_fk FOREIGN KEY (member_id, club_id) REFERENCES member(id, club_id)
) STRICT;
--> statement-breakpoint
CREATE INDEX entry_member_member_ix ON entry_member (member_id);
--> statement-breakpoint
CREATE TABLE match (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  competition_id TEXT NOT NULL,
  division_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reported', 'played', 'disputed')),
  outcome TEXT CHECK (outcome IN ('completed', 'retired', 'walkover', 'conceded', 'unplayed')),
  played_on TEXT,
  score TEXT CHECK (score IS NULL OR (json_valid(score) AND json_type(score) = 'object')),
  winning_side INTEGER CHECK (winning_side IN (0, 1)),
  retired_side INTEGER CHECK (retired_side IN (0, 1)),
  accepted_submission_id TEXT,
  pairing_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (id, club_id),
  UNIQUE (id, competition_id),
  CONSTRAINT match_competition_fk FOREIGN KEY (competition_id, club_id) REFERENCES competition(id, club_id) ON DELETE CASCADE,
  CONSTRAINT match_division_fk FOREIGN KEY (division_id, competition_id) REFERENCES division(id, competition_id) ON DELETE CASCADE,
  CONSTRAINT match_accepted_submission_fk FOREIGN KEY (accepted_submission_id, id) REFERENCES result_submission(id, match_id),
  CONSTRAINT match_played_outcome_ck CHECK ((status = 'played') = (outcome IS NOT NULL)),
  CONSTRAINT match_played_claim_ck CHECK ((status = 'played') = (accepted_submission_id IS NOT NULL)),
  CONSTRAINT match_winner_ck CHECK ((winning_side IS NOT NULL) = (outcome IS NOT NULL AND outcome <> 'unplayed')),
  CONSTRAINT match_winner_not_retired_ck CHECK (winning_side <> retired_side),
  CONSTRAINT match_stopped_side_ck CHECK ((retired_side IS NOT NULL) = coalesce(outcome IN ('retired', 'walkover', 'conceded'), false)),
  CONSTRAINT match_score_ck CHECK ((score IS NOT NULL) = coalesce(outcome IN ('completed', 'retired'), false))
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX match_division_pairing_uq ON match (division_id, pairing_key) WHERE pairing_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX match_competition_status_ix ON match (competition_id, status);
--> statement-breakpoint
CREATE INDEX match_division_ix ON match (division_id);
--> statement-breakpoint
CREATE INDEX match_outstanding_ix ON match (competition_id) WHERE status IN ('open', 'reported', 'disputed');
--> statement-breakpoint
CREATE TABLE match_side (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  match_id TEXT NOT NULL,
  competition_id TEXT NOT NULL,
  side_index INTEGER NOT NULL CHECK (side_index IN (0, 1)),
  entry_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (id, club_id),
  UNIQUE (match_id, side_index),
  UNIQUE (match_id, entry_id),
  CONSTRAINT match_side_match_fk FOREIGN KEY (match_id, club_id) REFERENCES match(id, club_id) ON DELETE CASCADE,
  CONSTRAINT match_side_competition_fk FOREIGN KEY (match_id, competition_id) REFERENCES match(id, competition_id) ON DELETE CASCADE,
  CONSTRAINT match_side_entry_fk FOREIGN KEY (entry_id, competition_id) REFERENCES entry(id, competition_id)
) STRICT;
--> statement-breakpoint
CREATE INDEX match_side_entry_ix ON match_side (entry_id);
--> statement-breakpoint
CREATE TABLE result_submission (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  match_id TEXT NOT NULL,
  side_index INTEGER CHECK (side_index IN (0, 1)),
  submitted_by_member_id TEXT,
  submitted_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  score TEXT CHECK (score IS NULL OR (json_valid(score) AND json_type(score) = 'object')),
  outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'retired', 'walkover', 'conceded', 'unplayed')),
  retired_side INTEGER CHECK (retired_side IN (0, 1)),
  played_on TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'confirmed', 'superseded')),
  confirmed_at INTEGER,
  accepts_submission_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('web', 'telegram', 'api', 'coach_entry', 'nl_parse')),
  raw_input TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (id, club_id),
  UNIQUE (id, match_id),
  CONSTRAINT result_submission_match_fk FOREIGN KEY (match_id, club_id) REFERENCES match(id, club_id) ON DELETE CASCADE,
  CONSTRAINT result_submission_submitter_fk FOREIGN KEY (submitted_by_member_id, club_id) REFERENCES member(id, club_id),
  CONSTRAINT result_submission_accepts_fk FOREIGN KEY (accepts_submission_id, match_id) REFERENCES result_submission(id, match_id),
  CONSTRAINT result_submission_sideless_ck CHECK (side_index IS NOT NULL OR state <> 'pending'),
  CONSTRAINT result_submission_accepts_side_ck CHECK (accepts_submission_id IS NULL OR side_index IS NOT NULL),
  CONSTRAINT result_submission_stopped_side_ck CHECK ((retired_side IS NOT NULL) = (outcome IN ('retired', 'walkover', 'conceded'))),
  CONSTRAINT result_submission_score_ck CHECK ((score IS NOT NULL) = (outcome IN ('completed', 'retired')))
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX result_submission_one_pending_per_side_uq ON result_submission (match_id, side_index)
  WHERE state = 'pending' AND side_index IS NOT NULL;
--> statement-breakpoint
CREATE INDEX result_submission_match_ix ON result_submission (match_id, submitted_at, id);
--> statement-breakpoint
-- Keep player/partner ordering and a custom entry label without exposing PII.
CREATE VIEW entry_label AS
SELECT e.id AS entry_id, e.club_id, e.competition_id,
  coalesce(e.display_name, group_concat(m.display_name, ' / ' ORDER BY em.role DESC, m.display_name)) AS label
FROM entry e JOIN entry_member em ON em.entry_id = e.id AND em.club_id = e.club_id
JOIN member m ON m.id = em.member_id AND m.club_id = em.club_id
GROUP BY e.id, e.club_id, e.competition_id, e.display_name;
--> statement-breakpoint
CREATE TABLE result_deadline_guard (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  valid INTEGER NOT NULL CONSTRAINT result_deadline_current CHECK (valid = 1)
) STRICT;
--> statement-breakpoint
INSERT INTO result_deadline_guard (singleton, valid) VALUES (1, 1);

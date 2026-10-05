-- A private planning board per player; fixtures and results remain the league ledger.
CREATE TABLE match_plan (
  club_id TEXT NOT NULL REFERENCES club(id),
  member_id TEXT NOT NULL REFERENCES member(id),
  match_id TEXT NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('planned', 'arranged')),
  arranged_on TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (club_id, member_id, match_id),
  CHECK (state = 'arranged' OR arranged_on IS NULL)
);

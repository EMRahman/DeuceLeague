-- What a doubles player wants for next season, said during the competition
-- they are playing now. No row: the same partner. 'leaving': not playing
-- next season. 'new_partner': a new partner, the one named if any, or one the
-- coach finds. A named partner agrees by naming the asker back; then both
-- rows are confirmed, and the pair waits for the coach to place it. Either
-- way the pair playing now is not carried into next season's draft.
CREATE TABLE partner_choice (
  club_id TEXT NOT NULL REFERENCES club(id),
  competition_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK (choice IN ('leaving', 'new_partner')),
  partner_id TEXT,
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY (competition_id, member_id),
  CONSTRAINT partner_choice_partner_ck CHECK (choice = 'new_partner' OR (partner_id IS NULL AND confirmed_at IS NULL)),
  CONSTRAINT partner_choice_confirmed_ck CHECK (confirmed_at IS NULL OR partner_id IS NOT NULL),
  CONSTRAINT partner_choice_not_self_ck CHECK (partner_id IS NULL OR partner_id <> member_id),
  CONSTRAINT partner_choice_competition_fk FOREIGN KEY (competition_id, club_id) REFERENCES competition(id, club_id) ON DELETE CASCADE,
  CONSTRAINT partner_choice_member_fk FOREIGN KEY (member_id, club_id) REFERENCES member(id, club_id),
  CONSTRAINT partner_choice_partner_fk FOREIGN KEY (partner_id, club_id) REFERENCES member(id, club_id)
) STRICT;
--> statement-breakpoint
-- Who has asked a member, for erasing that member.
CREATE INDEX partner_choice_partner_ix ON partner_choice (partner_id);

-- Fixture deletion cascades by match_id, without a member or club prefix.
CREATE INDEX match_plan_match ON match_plan(match_id);

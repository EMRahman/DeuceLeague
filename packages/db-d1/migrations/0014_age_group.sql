-- The sign-up form asks for gender and an age band, so the coach can place a
-- newcomer at the start of next season without chasing them. Both are personal
-- data: kept behind members:pii, on the request until it is decided and then
-- on the member.
ALTER TABLE member ADD COLUMN age_group TEXT CHECK (age_group IN ('under_18', '18_34', '35_49', '50_64', '65_plus'));
--> statement-breakpoint
ALTER TABLE join_request ADD COLUMN gender TEXT CHECK (gender IN ('female', 'male', 'other', 'undisclosed'));
--> statement-breakpoint
ALTER TABLE join_request ADD COLUMN age_group TEXT CHECK (age_group IN ('under_18', '18_34', '35_49', '50_64', '65_plus'));

-- A member who has said they are not playing next season at all. It covers every entry they held when they
-- said it, in singles and doubles, as if each had opted out; an entry made after it is not covered, so a
-- player who changes their mind and is entered again is not caught by it. Clearing it takes it all back,
-- leaving the opt-outs they made entry by entry as they were.
ALTER TABLE member ADD COLUMN leaving_at INTEGER;

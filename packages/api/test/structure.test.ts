// The league's structure through the API: the club, keys, members, seasons,
// competitions, divisions, entries and fixtures. Run by `npm run db:verify`.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closeAll, enter, eventsOf, keyWith, league, member, newClub, owner, send } from "./helpers.ts";

after(closeAll);

async function matchCount(divisionId: string): Promise<number> {
  return Number((await owner`select count(*) from match where division_id = ${divisionId}`)[0]!.count);
}

// ─────────────────────────────────────────────────────────────── the club ──

test("only an admin key reads or changes the club's settings", async () => {
  const c = await newClub("club-settings");
  const reader = await keyWith(c, "league:read");

  assert.equal((await send("GET", "/v1/club", reader)).status, 403);
  assert.equal((await send("GET", "/v1/me", reader)).body.club.slug, c.slug, "any key still learns its club");
  const read = await send("GET", "/v1/club", c.key);
  assert.equal(read.status, 200);
  assert.equal(read.body.slug, c.slug);
  assert.deepEqual(read.body.branding, {});

  assert.equal((await send("PATCH", "/v1/club", reader, { name: "Nope" })).status, 403);
  assert.equal((await send("PATCH", "/v1/club", c.key, { timezone: "Mars/Olympus" })).status, 400);

  const changed = await send("PATCH", "/v1/club", c.key, {
    name: "Deuce LTC",
    timezone: "Europe/Paris",
    branding: { primary_colour: "#0b6e4f" },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.timezone, "Europe/Paris");
  assert.equal(changed.body.slug, c.slug, "the slug does not change");
  assert.deepEqual(changed.body.branding, { primary_colour: "#0b6e4f" });
  const [event] = await eventsOf(c.id, "club.updated");
  assert.deepEqual(event?.payload.changed, ["name", "timezone", "branding"]);
  assert.deepEqual([event?.actor_type, event?.actor_id], ["api_key", c.keyId]);
});

// ────────────────────────────────────────────────────────────────── keys ──

test("a new key is shown once, works at once, and defaults to reading and reporting", async () => {
  const c = await newClub("keys");
  const made = await send("POST", "/v1/api-keys", c.key, { name: "Telegram bot" });
  assert.equal(made.status, 201);
  assert.match(made.body.key, /^dl_/);
  assert.deepEqual(made.body.scopes, ["league:read", "results:write"]);

  const me = await send("GET", "/v1/me", made.body.key);
  assert.equal(me.body.credential.id, made.body.id);

  const list = await send("GET", "/v1/api-keys", c.key);
  const listed = list.body.data.find((k: { id: string }) => k.id === made.body.id);
  assert.ok(listed);
  assert.equal(listed.key, undefined, "never shown again");
  assert.equal(listed.key_hash, undefined);

  const past = await send("POST", "/v1/api-keys", c.key, { name: "x", expires_at: "2020-01-01T00:00:00Z" });
  assert.equal(past.status, 400);
  assert.equal(past.body.errors[0].path, "expires_at");
});

test("a key can grant only the scopes it holds, and granting members:pii is recorded", async () => {
  const c = await newClub("grants");
  const adminOnly = await keyWith(c, "admin");
  const refused = await send("POST", "/v1/api-keys", adminOnly, { name: "x", scopes: ["members:pii"] });
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.body.missing_scopes, ["members:pii"]);

  const pii = await send("POST", "/v1/api-keys", c.key, { name: "Chase emails", scopes: ["members:read", "members:pii"] });
  assert.equal(pii.status, 201);
  const events = await eventsOf(c.id, "api_key.created");
  const granted = events.find((e) => e.subject_id === pii.body.id);
  assert.deepEqual(granted?.payload.scopes, ["members:read", "members:pii"]);
  assert.equal(JSON.stringify(events).includes(pii.body.key), false, "the key itself is never logged");
});

test("revoking stops a key at once, but never the club's last admin key", async () => {
  const c = await newClub("revoke");
  const last = await send("POST", `/v1/api-keys/${c.keyId}/revoke`, c.key);
  assert.equal(last.status, 409);
  assert.equal(last.body.code, "last_admin_key");

  const second = await keyWith(c, "admin");
  const revoked = await send("POST", `/v1/api-keys/${c.keyId}/revoke`, second);
  assert.equal(revoked.status, 200);
  assert.ok(revoked.body.revoked_at);
  assert.equal((await send("GET", "/v1/me", c.key)).status, 401);
  const again = await send("POST", `/v1/api-keys/${c.keyId}/revoke`, second);
  assert.equal(again.body.revoked_at, revoked.body.revoked_at, "revoking twice keeps the first time");
  assert.equal((await eventsOf(c.id, "api_key.revoked")).length, 1);
});

// ─────────────────────────────────────────────────────────────── members ──

test("members:read sees display names; personal fields need members:pii, to read or to write", async () => {
  const c = await newClub("members");
  const id = await member(c, { display_name: "Sam K.", full_name: "Samantha King", email: "sam@example.org", gender: "female" });
  const reader = await keyWith(c, "members:read");
  const writer = await keyWith(c, "members:read", "members:write");

  const full = await send("GET", `/v1/members/${id}`, c.key);
  assert.equal(full.body.email, "sam@example.org");
  assert.equal(full.body.gender, "female");

  for (const key of [reader, writer]) {
    const one = await send("GET", `/v1/members/${id}`, key);
    assert.equal(one.body.display_name, "Sam K.");
    for (const field of ["full_name", "email", "phone", "date_of_birth", "gender", "notes"]) {
      assert.equal(field in one.body, false, `${field} is absent, not merely null`);
    }
    const list = await send("GET", "/v1/members", key);
    assert.equal(JSON.stringify(list.body).includes("sam@example.org"), false);
  }

  const setEmail = await send("POST", "/v1/members", writer, { display_name: "Alex", email: "alex@example.org" });
  assert.equal(setEmail.status, 403);
  assert.deepEqual(setEmail.body.missing_scopes, ["members:pii"]);
  assert.equal((await send("PATCH", `/v1/members/${id}`, writer, { notes: null })).status, 403, "not even to clear one");
  const renamed = await send("PATCH", `/v1/members/${id}`, writer, { display_name: "Sam King", rating: 7.25 });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.rating, 7.25);

  const clash = await send("POST", "/v1/members", c.key, { display_name: "Imposter", email: "SAM@example.org" });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.code, "email_taken");

  const logged = JSON.stringify(await owner`select payload from event where club_id = ${c.id}`);
  assert.equal(logged.includes("sam@example.org") || logged.includes("Samantha"), false, "no personal data in events");
  const [created] = await eventsOf(c.id, "member.created");
  assert.deepEqual(created?.payload.fields, ["display_name", "full_name", "email", "gender"]);
});

test("a member is found by email, whatever its case, only by a key holding members:pii", async () => {
  const c = await newClub("by-email");
  const id = await member(c, { display_name: "Sam K.", email: "Sam@Example.org" });
  await member(c, { display_name: "Alex", email: "alex@example.org" });

  const found = await send("GET", "/v1/members?email=sam%40EXAMPLE.org", c.key);
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.data.map((m: { id: string }) => m.id), [id]);
  assert.deepEqual((await send("GET", "/v1/members?email=nobody%40example.org", c.key)).body.data, []);

  // Whether an address belongs to a member is itself personal data.
  const refused = await send("GET", "/v1/members?email=sam%40example.org", await keyWith(c, "members:read"));
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.body.missing_scopes, ["members:pii"]);
  assert.equal((await send("GET", "/v1/members?email=not-an-address", c.key)).status, 400);
});

test("a removed member leaves the list but not the record; erasing clears who they were", async () => {
  const c = await newClub("erase");
  const { competitionId, divisionIds } = await league(c, { discipline: "doubles" });
  const gone = await member(c, { display_name: "Robin H.", email: "robin@example.org", phone: "07700 900123" });
  const partner = await member(c, { display_name: "Kim P." });
  const entry = await enter(c, competitionId, divisionIds[0]!, [gone, partner]);
  await send("PATCH", `/v1/entries/${entry}`, c.key, { display_name: "Robin & Kim" });

  assert.equal((await send("DELETE", `/v1/members/${partner}`, c.key)).status, 204);
  const listed = await send("GET", "/v1/members", c.key);
  assert.equal(listed.body.data.some((m: { id: string }) => m.id === partner), false);
  const all = await send("GET", "/v1/members?include_removed=true", c.key);
  assert.equal(all.body.data.some((m: { id: string }) => m.id === partner), true);
  assert.ok((await send("GET", `/v1/members/${partner}`, c.key)).body.deleted_at);
  assert.equal((await send("PATCH", `/v1/members/${partner}`, c.key, { display_name: "x" })).body.code, "member_removed");

  const notAdmin = await keyWith(c, "members:read", "members:write", "members:pii");
  assert.equal((await send("POST", `/v1/members/${gone}/erase`, notAdmin)).status, 403);
  const erased = await send("POST", `/v1/members/${gone}/erase`, c.key);
  assert.equal(erased.status, 200);
  assert.equal(erased.body.display_name, "Erased member");
  assert.equal(erased.body.email, null);
  assert.equal(erased.body.phone, null);
  assert.ok(erased.body.deleted_at);

  const [row] = await owner`select display_name, email, phone from member where id = ${gone}`;
  assert.deepEqual({ ...row }, { display_name: "Erased member", email: null, phone: null });
  const kept = await send("GET", `/v1/entries/${entry}`, c.key);
  assert.equal(kept.body.display_name, null, "an entry name that could name them is cleared");
  assert.equal(kept.body.label, "Erased member / Kim P.", "the entry, and its results, stay");
});

// ─────────────────────────────────────────────────── seasons and competitions ──

test("a season activates only with its dates, one step at a time", async () => {
  const c = await newClub("seasons");
  const made = await send("POST", "/v1/seasons", c.key, { name: "Summer 2026", kind: "summer", year: 2026 });
  assert.equal(made.status, 201);
  assert.equal(made.body.state, "planning");
  const id = made.body.id;
  assert.equal((await send("POST", "/v1/seasons", c.key, { name: "Summer 2026" })).body.code, "name_taken");

  assert.equal((await send("PATCH", `/v1/seasons/${id}`, c.key, { state: "active" })).body.code, "dates_needed");
  const backwards = await send("PATCH", `/v1/seasons/${id}`, c.key, { starts_on: "2026-06-01", ends_on: "2026-05-01" });
  assert.equal(backwards.status, 400);
  assert.equal(backwards.body.errors[0].path, "ends_on");

  const active = await send("PATCH", `/v1/seasons/${id}`, c.key, {
    starts_on: "2026-05-01",
    ends_on: "2026-08-31",
    state: "active",
  });
  assert.equal(active.status, 200, JSON.stringify(active.body));
  assert.equal(active.body.state, "active");
  assert.equal((await send("PATCH", `/v1/seasons/${id}`, c.key, { state: "archived" })).body.code, "invalid_transition");
  assert.equal((await send("PATCH", `/v1/seasons/${id}`, c.key, { ends_on: null })).body.code, "dates_needed");
  const [event] = (await eventsOf(c.id, "season.updated")).slice(-1);
  assert.deepEqual(event?.payload.state, { from: "planning", to: "active" });
});

test("a competition's format and rules are checked when saved, and presets are stored expanded", async () => {
  const c = await newClub("formats");
  const season = (await send("POST", "/v1/seasons", c.key, { name: "Autumn" })).body.id;
  const made = await send("POST", "/v1/competitions", c.key, {
    season_id: season,
    name: "Ladies' Doubles",
    discipline: "doubles",
    category: "womens",
    match_format: "short_set_4",
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.state, "draft");
  assert.equal(made.body.match_format.set.gamesToWin, 4);
  assert.equal(made.body.rules.points.win, 3, "the standard rules when none are given");

  const badRules = await send("POST", "/v1/competitions", c.key, {
    season_id: season,
    name: "Broken",
    discipline: "singles",
    match_format: "pro_set_8",
    rules: { ...made.body.rules, tiebreaks: [] },
  });
  assert.equal(badRules.status, 400);
  assert.match(badRules.body.errors[0].path, /^rules/);
  const badFormat = await send("POST", "/v1/competitions", c.key, {
    season_id: season,
    name: "Broken",
    discipline: "singles",
    match_format: "best_of_99",
  });
  assert.equal(badFormat.status, 400);
});

test("a competition is active only inside an active season, and is a record once complete", async () => {
  const c = await newClub("comp-states");
  const season = (await send("POST", "/v1/seasons", c.key, { name: "Spring", starts_on: "2026-03-01", ends_on: "2026-05-31" })).body.id;
  const comp = (
    await send("POST", "/v1/competitions", c.key, {
      season_id: season,
      name: "Open Singles",
      discipline: "singles",
      match_format: "best_of_3_sets",
    })
  ).body.id;

  assert.equal((await send("PATCH", `/v1/competitions/${comp}`, c.key, { state: "active" })).body.code, "season_not_active");
  await send("PATCH", `/v1/seasons/${season}`, c.key, { state: "active" });
  assert.equal((await send("PATCH", `/v1/competitions/${comp}`, c.key, { state: "active" })).status, 200);
  assert.equal((await send("PATCH", `/v1/seasons/${season}`, c.key, { state: "complete" })).body.code, "competition_active");

  assert.equal((await send("PATCH", `/v1/competitions/${comp}`, c.key, { state: "complete" })).status, 200);
  assert.equal((await send("PATCH", `/v1/competitions/${comp}`, c.key, { name: "Renamed" })).body.code, "competition_closed");
  assert.equal((await send("PATCH", `/v1/competitions/${comp}`, c.key, { visibility: "private" })).status, 200);
  assert.equal((await send("PATCH", `/v1/competitions/${comp}`, c.key, { visibility: "public" })).status, 400, "no such thing");
  assert.equal((await send("POST", `/v1/competitions/${comp}/divisions`, c.key, {})).body.code, "competition_closed");
  assert.equal((await send("PATCH", `/v1/seasons/${season}`, c.key, { state: "complete" })).status, 200);
});

test("a competition's discipline is fixed once it has entries", async () => {
  const c = await newClub("discipline");
  const { competitionId, divisionIds } = await league(c);
  assert.equal((await send("PATCH", `/v1/competitions/${competitionId}`, c.key, { discipline: "doubles" })).status, 200);
  assert.equal((await send("PATCH", `/v1/competitions/${competitionId}`, c.key, { discipline: "singles" })).status, 200);
  await enter(c, competitionId, divisionIds[0]!, [await member(c)]);
  const refused = await send("PATCH", `/v1/competitions/${competitionId}`, c.key, { discipline: "doubles" });
  assert.equal(refused.body.code, "entries_exist");
});

// ───────────────────────────────────────────────── divisions and entries ──

test("divisions number themselves, and only an empty one can be deleted", async () => {
  const c = await newClub("divisions");
  const { competitionId, divisionIds } = await league(c, { discipline: "singles" }, 3);
  const list = await send("GET", `/v1/competitions/${competitionId}/divisions`, c.key);
  assert.deepEqual(
    list.body.data.map((d: { ordinal: number; name: string }) => [d.ordinal, d.name]),
    [[1, "Division 1"], [2, "Division 2"], [3, "Division 3"]],
  );
  const clash = await send("PATCH", `/v1/divisions/${divisionIds[2]}`, c.key, { ordinal: 1 });
  assert.equal(clash.body.code, "ordinal_taken");

  await enter(c, competitionId, divisionIds[0]!, [await member(c)]);
  assert.equal((await send("DELETE", `/v1/divisions/${divisionIds[0]}`, c.key)).body.code, "division_in_use");
  assert.equal((await send("DELETE", `/v1/divisions/${divisionIds[2]}`, c.key)).status, 204);
});

test("an entry has one member for singles and two for doubles, each in one division only", async () => {
  const c = await newClub("entries");
  const singles = await league(c, { discipline: "singles" }, 2);
  const [a, b] = [await member(c, { display_name: "Ann" }), await member(c, { display_name: "Bea" })];

  const pair = await send("POST", `/v1/competitions/${singles.competitionId}/entries`, c.key, {
    division_id: singles.divisionIds[0],
    member_ids: [a, b],
  });
  assert.equal(pair.status, 400);
  assert.match(pair.body.detail, /a singles entry has one member/);

  const made = await send("POST", `/v1/competitions/${singles.competitionId}/entries`, c.key, {
    division_id: singles.divisionIds[0],
    member_ids: [a],
    placement_reason: "new",
  });
  assert.equal(made.status, 201);
  assert.equal(made.body.label, "Ann");
  assert.deepEqual(made.body.warnings, []);

  const twice = await send("POST", `/v1/competitions/${singles.competitionId}/entries`, c.key, {
    division_id: singles.divisionIds[1],
    member_ids: [a],
  });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.code, "already_entered");

  await send("DELETE", `/v1/members/${b}`, c.key);
  const removed = await send("POST", `/v1/competitions/${singles.competitionId}/entries`, c.key, {
    division_id: singles.divisionIds[1],
    member_ids: [b],
  });
  assert.equal(removed.status, 400);

  const doubles = await league(c, { discipline: "doubles" });
  const wrongDivision = await send("POST", `/v1/competitions/${doubles.competitionId}/entries`, c.key, {
    division_id: singles.divisionIds[0],
    member_ids: [a, await member(c)],
  });
  assert.equal(wrongDivision.status, 400);
  assert.equal(wrongDivision.body.errors[0].path, "division_id");
});

test("an odd mixed pair is entered with a warning, shown only to a key that may read gender", async () => {
  const c = await newClub("mixed");
  const { competitionId, divisionIds } = await league(c, { discipline: "doubles", category: "mixed" });
  const men = [
    await member(c, { gender: "male" }),
    await member(c, { gender: "male" }),
    await member(c, { gender: "male" }),
    await member(c, { gender: "male" }),
  ];
  const withPii = await send("POST", `/v1/competitions/${competitionId}/entries`, c.key, {
    division_id: divisionIds[0],
    member_ids: [men[0], men[1]],
  });
  assert.equal(withPii.status, 201, "a warning, never a refusal");
  assert.deepEqual(withPii.body.warnings.map((w: { code: string }) => w.code), ["mixed_pair"]);

  const writer = await keyWith(c, "league:write");
  const without = await send("POST", `/v1/competitions/${competitionId}/entries`, writer, {
    division_id: divisionIds[0],
    member_ids: [men[2], men[3]],
  });
  assert.equal(without.status, 201);
  assert.deepEqual(without.body.warnings, [], "the warning would reveal their recorded gender");
});

// ─────────────────────────────────────────────────────────────── fixtures ──

test("a round robin pairs every active entry once, and running it again adds only what is missing", async () => {
  const c = await newClub("fixtures");
  const { competitionId, divisionIds } = await league(c);
  const division = divisionIds[0]!;
  const entries: string[] = [];
  for (let i = 0; i < 4; i++) entries.push(await enter(c, competitionId, division, [await member(c)]));

  const first = await send("POST", `/v1/divisions/${division}/fixtures`, c.key);
  assert.equal(first.status, 200);
  assert.equal(first.body.created.length, 6);
  assert.equal(first.body.pairings, 6);
  const again = await send("POST", `/v1/divisions/${division}/fixtures`, c.key);
  assert.equal(again.body.created.length, 0, "idempotent");
  assert.equal((await eventsOf(c.id, "division.fixtures_generated")).length, 1, "nothing new, nothing logged");

  const late = await enter(c, competitionId, division, [await member(c)]);
  const topUp = await send("POST", `/v1/divisions/${division}/fixtures`, c.key);
  assert.equal(topUp.body.created.length, 4, "only the late entry's pairings");
  assert.ok(topUp.body.created.every((m: { side0_entry_id: string; side1_entry_id: string }) =>
    [m.side0_entry_id, m.side1_entry_id].includes(late)));
  assert.equal(await matchCount(division), 10);
  const [sides] = await owner`select count(*) from match_side ms join match m on m.id = ms.match_id
                              where m.division_id = ${division}`;
  assert.equal(Number(sides!.count), 20);
  const [progress] = await owner`select active_entries, outstanding from division_progress
                                 where division_id = ${division}`;
  assert.deepEqual([Number(progress?.active_entries), Number(progress?.outstanding)], [5, 10], "the progress views see them");

  const withdrawn = await send("PATCH", `/v1/entries/${entries[0]}`, c.key, { state: "withdrawn" });
  assert.ok(withdrawn.body.withdrawn_at);
  const afterWithdrawal = await send("POST", `/v1/divisions/${division}/fixtures`, c.key);
  assert.equal(afterWithdrawal.body.pairings, 6, "a withdrawn entry is left out");
  assert.equal(await matchCount(division), 10, "and its matches stay, for the rules to count");
  const reinstated = await send("PATCH", `/v1/entries/${entries[0]}`, c.key, { state: "active" });
  assert.equal(reinstated.body.withdrawn_at, null);
});

test("an entry with only untouched fixtures can be moved or deleted; one with a match under way cannot", async () => {
  const c = await newClub("moves");
  const { competitionId, divisionIds } = await league(c, { discipline: "singles" }, 2);
  const [top, second] = divisionIds as [string, string];
  const entries: string[] = [];
  for (let i = 0; i < 4; i++) entries.push(await enter(c, competitionId, top, [await member(c)]));
  await send("POST", `/v1/divisions/${top}/fixtures`, c.key);

  const moved = await send("PATCH", `/v1/entries/${entries[3]}`, c.key, { division_id: second });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.division_id, second);
  assert.equal(await matchCount(top), 3, "its three untouched fixtures went with the move");
  const [moveEvent] = await eventsOf(c.id, "entry.updated");
  assert.equal(moveEvent?.payload.removed_fixtures.length, 3);

  assert.equal((await send("DELETE", `/v1/entries/${entries[2]}`, c.key)).status, 204);
  assert.equal(await matchCount(top), 1);
  assert.equal((await send("GET", `/v1/entries/${entries[2]}`, c.key)).status, 404);

  // Once someone has reported a score, the match is a record, so its entries stay put.
  await owner`update match set status = 'reported' where division_id = ${top}`;
  assert.equal((await send("DELETE", `/v1/entries/${entries[0]}`, c.key)).body.code, "entry_has_matches");
  assert.equal(
    (await send("PATCH", `/v1/entries/${entries[0]}`, c.key, { division_id: second })).body.code,
    "entry_has_matches",
  );
  assert.equal(await matchCount(top), 1);
  assert.equal((await send("PATCH", `/v1/entries/${entries[0]}`, c.key, { seed: 1 })).status, 200);
});

// ─────────────────────────────────────────────────────────────── lists ──

test("a list pages by cursor, in creation order, without skipping or repeating", async () => {
  const c = await newClub("paging");
  const made: string[] = [];
  for (let i = 0; i < 5; i++) made.push((await send("POST", "/v1/seasons", c.key, { name: `S${i}` })).body.id);

  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const res = await send("GET", `/v1/seasons?limit=2${cursor ? `&after=${cursor}` : ""}`, c.key);
    assert.equal(res.status, 200);
    seen.push(...res.body.data.map((s: { id: string }) => s.id));
    cursor = res.body.next_cursor;
    pages++;
  } while (cursor);
  assert.deepEqual(seen, made);
  assert.equal(pages, 3);
  assert.equal((await send("GET", "/v1/seasons?limit=0", c.key)).status, 400);
});

// ───────────────────────────────────────────────────────────── tenancy ──

test("club A's key can neither read nor change any of club B's records", async () => {
  const a = await newClub("tenant-a");
  const b = await newClub("tenant-b");
  const theirs = await league(b, { discipline: "singles" }, 2);
  const theirMember = await member(b, { display_name: "B's player", email: "b@example.org" });
  const theirEntry = await enter(b, theirs.competitionId, theirs.divisionIds[0]!, [theirMember]);
  const theirKey = (await send("POST", "/v1/api-keys", b.key, { name: "B's bot" })).body.id as string;
  const ours = await league(a);
  const ourEntry = await enter(a, ours.competitionId, ours.divisionIds[0]!, [await member(a)]);
  const [div0, div1] = theirs.divisionIds;

  const attempts: [string, string, unknown?][] = [
    ["GET", `/v1/members/${theirMember}`],
    ["PATCH", `/v1/members/${theirMember}`, { display_name: "Hijacked" }],
    ["DELETE", `/v1/members/${theirMember}`],
    ["POST", `/v1/members/${theirMember}/erase`],
    ["POST", `/v1/api-keys/${theirKey}/revoke`],
    ["GET", `/v1/seasons/${theirs.seasonId}`],
    ["PATCH", `/v1/seasons/${theirs.seasonId}`, { name: "Hijacked" }],
    ["GET", `/v1/competitions/${theirs.competitionId}`],
    ["PATCH", `/v1/competitions/${theirs.competitionId}`, { name: "Hijacked" }],
    ["GET", `/v1/competitions/${theirs.competitionId}/divisions`],
    ["POST", `/v1/competitions/${theirs.competitionId}/divisions`, {}],
    ["GET", `/v1/competitions/${theirs.competitionId}/entries`],
    ["POST", `/v1/competitions/${theirs.competitionId}/entries`, { division_id: div0, member_ids: [theirMember] }],
    ["GET", `/v1/divisions/${div0}`],
    ["PATCH", `/v1/divisions/${div0}`, { name: "Hijacked" }],
    ["DELETE", `/v1/divisions/${div1}`],
    ["POST", `/v1/divisions/${div0}/fixtures`],
    ["GET", `/v1/entries/${theirEntry}`],
    ["PATCH", `/v1/entries/${theirEntry}`, { state: "withdrawn" }],
    ["DELETE", `/v1/entries/${theirEntry}`],
  ];
  for (const [method, path, body] of attempts) {
    const res = await send(method, path, a.key, body);
    assert.equal(res.status, 404, `${method} ${path} answered ${res.status}`);
  }

  // Naming B's records inside A's own requests gets nowhere either.
  const references: [string, string, unknown][] = [
    ["POST", "/v1/competitions", { season_id: theirs.seasonId, name: "x", discipline: "singles", match_format: "pro_set_8" }],
    ["PATCH", `/v1/competitions/${ours.competitionId}`, { previous_competition_id: theirs.competitionId }],
    ["POST", `/v1/competitions/${ours.competitionId}/entries`, { division_id: ours.divisionIds[0], member_ids: [theirMember] }],
    ["POST", `/v1/competitions/${ours.competitionId}/entries`, { division_id: div0, member_ids: [await member(a)] }],
    ["PATCH", `/v1/entries/${ourEntry}`, { previous_entry_id: theirEntry }],
    ["PATCH", `/v1/entries/${ourEntry}`, { division_id: div1 }],
  ];
  for (const [method, path, body] of references) {
    const res = await send(method, path, a.key, body);
    assert.equal(res.status, 400, `${method} ${path} ${JSON.stringify(body)} answered ${res.status}`);
  }

  // A's lists hold nothing of B's.
  for (const path of ["/v1/members?include_removed=true", "/v1/seasons", "/v1/competitions", "/v1/api-keys"]) {
    const text = JSON.stringify((await send("GET", path, a.key)).body);
    for (const id of [theirMember, theirs.seasonId, theirs.competitionId, theirKey, b.keyId]) {
      assert.equal(text.includes(id), false, `${path} shows B's ${id}`);
    }
  }

  // And B's records are as B left them.
  const [m] = await owner`select display_name, deleted_at from member where id = ${theirMember}`;
  assert.deepEqual({ ...m }, { display_name: "B's player", deleted_at: null });
  const [k] = await owner`select revoked_at from api_key where id = ${theirKey}`;
  assert.equal(k?.revoked_at, null);
  const [e] = await owner`select state from entry where id = ${theirEntry}`;
  assert.equal(e?.state, "active");
  assert.equal(await matchCount(div0!), 0);
  const [s] = await owner`select name from season where id = ${theirs.seasonId}`;
  assert.notEqual(s?.name, "Hijacked");
  const [divisions] = await owner`select count(*) from division where competition_id = ${theirs.competitionId}`;
  assert.equal(Number(divisions!.count), 2);
});

// ─────────────────────────────────────────────────────────────── the spec ──

test("the spec lists every route with the scopes it needs", async () => {
  const spec = (await send("GET", "/openapi.json")).body;
  const scopes = (path: string, method: string) => spec.paths[path]?.[method]?.security?.[0]?.apiKey;
  assert.deepEqual(scopes("/v1/club", "get"), ["admin"]);
  assert.deepEqual(scopes("/v1/club", "patch"), ["admin"]);
  assert.deepEqual(scopes("/v1/api-keys", "post"), ["admin"]);
  assert.deepEqual(scopes("/v1/members", "get"), ["members:read"]);
  assert.deepEqual(scopes("/v1/members/{id}/erase", "post"), ["admin"]);
  assert.deepEqual(scopes("/v1/seasons", "post"), ["league:write"]);
  assert.deepEqual(scopes("/v1/competitions/{id}/entries", "get"), ["league:read"]);
  assert.deepEqual(scopes("/v1/divisions/{id}/fixtures", "post"), ["league:write"]);
  for (const field of ["full_name", "email", "phone", "date_of_birth", "gender", "notes"]) {
    assert.match(spec.components.schemas.Member.properties[field].description, /^PII/, field);
  }
});

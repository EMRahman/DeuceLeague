import assert from "node:assert/strict";
import test from "node:test";
import { browser, playingWebsite, signIn, websiteFixture } from "./website-helpers.ts";
import { completed, playing, score } from "./result-helpers.ts";

const versionOf = (html: string) => {
  const version = /name="expected_version" value="([a-f0-9]{64})"/.exec(html)?.[1];
  assert.ok(version, "review page includes a version of its decision inputs");
  return version;
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");

test("settlement previews use real standings, make no submissions, and retain the coach's identity and reason", async t => {
  const f = await playing(t, 3);
  const m = f.matches[0]!;
  await f.report(m, 0);
  const body = { outcome: "walkover", retired_side: 1, reason: "no_response" };
  const eventsBefore = (await f.events()).length;
  const preview = await f.send(`/v1/matches/${m}/settlement-preview`, f.admin, "POST", body);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.requires_override, false);
  assert.deepEqual(preview.body.effects.map((e: any) => [e.played_before, e.played_after]), [[0, 1], [0, 0]]);
  assert.equal((await f.send(`/v1/matches/${m}`)).body.status, "reported");
  assert.equal((await f.events()).length, eventsBefore, "preview does not add audit events");
  const settled = await f.send(`/v1/matches/${m}/settle`, f.admin, "POST", { ...body, expected_version: preview.body.version });
  assert.equal(settled.status, 201, JSON.stringify(settled.body));
  const standings = (await f.send(`/v1/competitions/${f.ids.competition}/standings`)).body.divisions.flatMap((d: any) => d.rows);
  for (const effect of preview.body.effects) {
    const row = standings.find((r: any) => r.entry_id === effect.entry_id);
    assert.equal(row.points, effect.points_after);
    assert.equal(row.played, effect.played_after);
  }
  const history = (await f.send(`/v1/events?match_id=${m}`)).body.data;
  assert.ok(history.every((e: any) => e.subject_id === m));
  const event = history.findLast((e: any) => e.type === "match.result.confirmed");
  assert.equal(event.payload.reason, "no_response");
  assert.equal(event.actor_type, "api_key"); assert.ok(event.actor_id);
  const retries = await f.send(`/v1/matches/${m}/settle`, f.admin, "POST", { ...body, expected_version: preview.body.version });
  assert.equal(retries.status, 200, "an identical retry does not create another decision");
  assert.equal((await f.events("match.result.confirmed")).length, 1);
  const player = await f.sessionForSide(m, 0);
  assert.equal((await f.send(`/v1/matches/${m}/settlement-preview`, player, "POST", body)).status, 403);
  assert.equal((await f.send(`/v1/events?match_id=${m}`, player)).status, 403);
  assert.deepEqual((await f.send(`/v1/matches/${m}`, player)).body.claims.map((c: any) => c.side), [0]);
});

test("a stale preview cannot overwrite changed submissions, rules or another coach's result", async t => {
  const f = await playing(t, 3); const m = f.matches[0]!;
  const preview = async () => (await f.send(`/v1/matches/${m}/settlement-preview`, f.admin, "POST", completed)).body;
  const save = (version: string) => f.send(`/v1/matches/${m}/settle`, f.admin, "POST", { ...completed, expected_version: version, override: true });
  const before = await preview();
  await f.report(m, 0);
  assert.equal((await save(before.version)).body.code, "settlement_changed");
  const beforeRule = await preview();
  const comp = (await f.send(`/v1/competitions/${f.ids.competition}`)).body;
  assert.equal((await f.send(`/v1/competitions/${f.ids.competition}`, f.admin, "PATCH", { rules: { ...comp.rules,
    points: { ...comp.rules.points, allPlayed: 7 } } })).status, 200);
  assert.equal((await save(beforeRule.version)).body.code, "settlement_changed");
  const beforeCoach = await preview();
  assert.equal((await f.send(`/v1/matches/${m}/settle`, f.admin, "POST", { outcome: "unplayed", reason: "conflicting_entries" })).status, 201);
  assert.equal((await save(beforeCoach.version)).body.code, "settlement_changed");
  assert.equal((await f.send(`/v1/matches/${m}`)).body.result.outcome, "unplayed");
  assert.equal((await f.send(`/v1/matches/${m}/settle`, f.admin, "POST", completed)).body.code, "already_agreed",
    "an earlier coach decision also requires explicit override");
  assert.equal((await f.events("match.result.confirmed")).length, 1);
});

test("coach review handles injury, retirement, no-show, unplayed and completed results including corrections", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const path = `/coach/matches/${p.match}`;
  const get = async () => (await f.api(`/v1/matches/${p.match}`, f.admin)).body;
  const forms = [
    { outcome: "conceded", stopped: "me", reason: "no_response" },
    { outcome: "retired", stopped: "them", mine_1: "2", theirs_1: "1", reason: "incorrect_result" },
    { outcome: "walkover", stopped: "them", reason: "incorrect_result" },
    { outcome: "unplayed", reason: "incorrect_result" },
    { outcome: "completed", mine_1: "6", theirs_1: "4", mine_2: "3", theirs_2: "6", mine_3: "10", theirs_3: "7", reason: "incorrect_result" },
  ];
  for (const [i, form] of forms.entries()) {
    const values = form as Record<string, string>;
    const preview = await coach.post(`${path}/preview`, values);
    assert.equal(preview.status, 200, preview.html);
    assert.match(text(preview.html), /Review coach decision.*Sam v Alex.*Effect on the table/);
    assert.match(text(preview.html), /Points:.*Played credit:.*Minimum:/);
    if (form.outcome === "conceded") assert.match(text(preview.html), /Sam was injured and could not play.*Winner: Alex/);
    if (form.outcome === "walkover") assert.match(text(preview.html), /Alex did not turn up.*Still 1 match short/);
    assert.equal((await get()).claims.length, i, "review does not write");
    const final = { ...values, expected_version: versionOf(preview.html), confirm: "yes" };
    if (i > 0) {
      assert.match(preview.html, /name="override" value="yes" required/);
      const refused = await coach.post(`${path}/settle`, final);
      assert.equal(refused.status, 409, refused.html);
      assert.equal((await get()).claims.length, i);
    }
    const saved = await coach.post(`${path}/settle`, { ...final, ...(i ? { override: "yes" } : {}) });
    assert.equal(saved.status, 303, saved.html);
    assert.equal(saved.location, `${path}?done=saved`);
    const match = await get();
    assert.equal(match.result.outcome, form.outcome);
    assert.equal(match.claims.length, i + 1);
    assert.ok(match.claims.slice(0, -1).every((c: any) => c.state === "superseded"));
  }
  const history = await coach.get(path);
  assert.match(text(history.html), /Decision history.*Coach website.*confirmed result is incorrect/);
  assert.match(text(history.html), /One side has not responded/);
  assert.match(text(history.html), /2-1, Alex retired/);
  assert.doesNotMatch(history.html, /dl_|dls_/);
  const tables = await coach.get(`/coach/tables/${p.comp.id}`);
  assert.match(tables.html, new RegExp(`href="${path}"`));
  assert.match((await coach.get("/coach/activity")).html, new RegExp(`href="${path}"`));
});

test("coach forms preserve invalid input and require review, a reason, a named affected side and authorization", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const path = `/coach/matches/${p.match}`;
  assert.equal((await browser(f).get(path)).status, 303);
  const unauthenticated = await browser(f).post(`${path}/settle`, { outcome: "unplayed" });
  assert.equal(unauthenticated.status, 303);
  const player = await signIn(f, "sam@example.org");
  assert.equal((await player.post(`${path}/preview`, { outcome: "unplayed", reason: "unreported_result" })).status, 303);
  const bad = await coach.post(`${path}/preview`, { outcome: "completed", mine_1: "7", theirs_1: "4", mine_2: "6", theirs_2: "3", reason: "unreported_result" });
  assert.equal(bad.status, 400, bad.html); assert.match(bad.html, /name="mine_1" value="7"/);
  for (const form of [
    { outcome: "unplayed" },
    { outcome: "walkover", reason: "no_response" },
    { outcome: "retired", stopped: "other", reason: "conflicting_entries" },
    { outcome: "unplayed", reason: "unreported_result", played_on: "2026-02-30" },
  ]) assert.equal((await coach.post(`${path}/preview`, form as Record<string, string>)).status, 400);
  const valid = { outcome: "walkover", stopped: "them", reason: "no_response" };
  assert.equal((await coach.post(`${path}/settle`, valid)).status, 400);
  assert.equal((await coach.post(`${path}/preview`, valid, "https://other.example")).status, 403);
  const preview = await coach.post(`${path}/preview`, valid);
  assert.equal((await coach.post(`${path}/edit`, valid)).status, 200);
  assert.equal((await f.api(`/v1/matches/${p.match}/claims`, f.admin, "POST", { ...completed, side: 0 })).status, 201);
  const stale = await coach.post(`${path}/settle`, { ...valid, confirm: "yes", expected_version: versionOf(preview.html) });
  assert.equal(stale.status, 409, stale.html); assert.match(stale.html, /Review the current submissions/);
  assert.equal((await f.api(`/v1/matches/${p.match}`, f.admin)).body.status, "reported");
});

test("coach decisions work after the deadline but completed competitions are read-only", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  await f.api(`/v1/seasons/${p.season.id}`, f.admin, "PATCH", { results_deadline_at: new Date(Date.now() - 1000).toISOString() });
  const form = { outcome: "walkover", stopped: "them", reason: "no_response" };
  const path = `/coach/matches/${p.match}`;
  const preview = await coach.post(`${path}/preview`, form);
  assert.equal(preview.status, 200, preview.html);
  assert.equal((await coach.post(`${path}/settle`, { ...form, confirm: "yes", expected_version: versionOf(preview.html) })).status, 303);
  await f.api(`/v1/competitions/${p.comp.id}`, f.admin, "PATCH", { state: "complete" });
  const closed = await coach.get(path);
  assert.match(closed.html, /Reopen it before changing a result/);
  assert.doesNotMatch(closed.html, /action="[^"]*\/preview"/);
  assert.equal((await coach.post(`${path}/preview`, form)).status, 409);
});

test("match browsing pages through a backlog and keeps every match actionable", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  for (let n = 0; n < 10; n++) {
    const member = await f.create("/v1/members", { display_name: `Extra ${n}` });
    await f.create(`/v1/competitions/${p.comp.id}/entries`, { member_ids: [member.id], division_id: p.division.id });
  }
  assert.equal((await f.api(`/v1/divisions/${p.division.id}/fixtures`, f.admin, "POST")).status, 200);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const first = await coach.get("/coach/matches?status=open");
  const ids = (html: string) => [...html.matchAll(/href="\/coach\/matches\/([0-9a-f-]{36})"/g)].map(m => m[1]);
  assert.equal(ids(first.html).length, 50);
  const next = /href="(\/coach\/matches\?status=open&amp;after=[^"]+)"/.exec(first.html)?.[1]; assert.ok(next);
  const second = await coach.get(next.replaceAll("&amp;", "&"));
  assert.equal(ids(second.html).length, 16);
  assert.equal(new Set([...ids(first.html), ...ids(second.html)]).size, 66);
  for (const id of [ids(first.html)[0], ids(second.html).at(-1)]) {
    const detail = await coach.get(`/coach/matches/${id}`);
    assert.equal(detail.status, 200); assert.match(detail.html, /Review decision/); assert.match(detail.html, /No result entered yet/);
  }
});

test("filtered match history paginates both directions without including other matches", async t => {
  const f = await playing(t, 3); const m = f.matches[0]!;
  for (let i = 0; i < 4; i++) await f.report(m, 0, { score: score([6, i], [6, 2]) });
  await f.report(f.matches[1]!, 0);
  for (const order of ["oldest", "newest"]) {
    const seen: string[] = []; let after = "";
    for (let i = 0; i < 5; i++) {
      const page = (await f.send(`/v1/events?match_id=${m}&order=${order}&limit=2${after ? `&after=${after}` : ""}`)).body;
      assert.ok(page.data.every((e: any) => e.subject_id === m));
      seen.push(...page.data.map((e: any) => e.id)); after = page.next_cursor;
      if (page.data.length < 2) break;
    }
    assert.equal(seen.length, 4); assert.equal(new Set(seen).size, 4);
  }
});

test("concurrent decisions based on one preview cannot both overwrite the match", async t => {
  const f = await playing(t); const m = f.matches[0]!;
  const preview = (await f.send(`/v1/matches/${m}/settlement-preview`, f.admin, "POST", completed)).body;
  const decisions = await Promise.all([1, 2].map(games => f.send(`/v1/matches/${m}/settle`, f.admin, "POST", {
    ...completed, score: score([6, games], [6, 3]), override: true, expected_version: preview.version,
  })));
  assert.deepEqual(decisions.map(d => d.status).sort(), [201, 409]);
  assert.equal(decisions.find(d => d.status === 409)!.body.code, "settlement_changed");
  assert.equal((await f.events("match.result.confirmed")).length, 1);
});

test("preview accounts for all-played bonuses and void withdrawn matches in doubles", async t => {
  const f = await playing(t, 2, true); const m = f.matches[0]!;
  const path = `/v1/competitions/${f.ids.competition}`;
  const comp = (await f.send(path)).body;
  const rules = { ...comp.rules, points: { ...comp.rules.points, allPlayed: 7 } };
  assert.equal((await f.send(path, f.admin, "PATCH", { rules })).status, 200);
  const before = (await f.send(`/v1/matches/${m}/settlement-preview`, f.admin, "POST", completed)).body;
  assert.ok(before.effects.every((e: any) => e.played_after === 1 && e.minimum === 1));
  assert.ok(before.effects.every((e: any) => /Partner/.test(e.label)), "both doubles sides name the pair");
  assert.equal((await f.send(`/v1/matches/${m}/settle`, f.admin, "POST", completed)).status, 201);
  const rows = (await f.send(`${path}/standings`)).body.divisions[0].rows;
  for (const effect of before.effects) {
    const row = rows.find((r: any) => r.entry_id === effect.entry_id);
    assert.equal(effect.points_after, row.points);
    assert.equal(row.all_played_bonus, 7);
  }
  assert.equal((await f.send(`/v1/entries/${f.entries[1]}`, f.admin, "PATCH", { state: "withdrawn" })).status, 200);
  assert.equal((await f.send(path, f.admin, "PATCH", { rules: { ...rules, withdrawal: { playedMatches: "void", remainingMatches: "unplayed" } } })).status, 200);
  const after = (await f.send(`/v1/matches/${m}/settlement-preview`, f.admin, "POST", { outcome: "walkover", retired_side: 1 })).body;
  assert.deepEqual(after.effects.map((e: any) => [e.points_after, e.played_after]), [[0, 0], [0, 0]]);
  assert.equal(after.effects.filter((e: any) => e.withdrawn).length, 1);
  assert.equal(after.effects.find((e: any) => e.withdrawn).minimum, 0);
});

test("the website corrects a player-confirmed result while preserving both original submissions", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  for (const side of [0, 1]) assert.equal((await f.api(`/v1/matches/${p.match}/claims`, f.admin, "POST", { ...completed, side })).status, 201);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const path = `/coach/matches/${p.match}`;
  const form = { outcome: "completed", mine_1: "4", theirs_1: "6", mine_2: "3", theirs_2: "6", reason: "incorrect_result" };
  const review = await coach.post(`${path}/preview`, form);
  assert.equal(review.status, 200); assert.match(review.html, /I explicitly override/);
  assert.match(text(review.html), /Confirmed result.*6-4, 6-3.*Winner: Sam.*Your proposed result.*4-6, 3-6.*Winner: Alex/);
  assert.equal((await coach.post(`${path}/settle`, { ...form, confirm: "yes", override: "yes", expected_version: versionOf(review.html) })).status, 303);
  const match = (await f.api(`/v1/matches/${p.match}`, f.admin)).body;
  assert.equal(match.result.winning_side, 1);
  assert.deepEqual(match.claims.map((c: any) => c.state), ["superseded", "superseded", "confirmed"]);
  assert.match(text((await coach.get(path)).html), /Decision history.*Coach website.*Both sides confirmed the result/);
});

test("Results and the match page write every score side-0-first, offer each entry as a decision and spot a reversed score", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const names = (await f.api(`/v1/matches/${p.match}`, f.admin)).body.sides.map((s: any) => s.label) as [string, string];
  const claim = (side: 0 | 1, sets: [number, number][], extra: object = {}) => f.api(`/v1/matches/${p.match}/claims`, f.admin, "POST",
    { side, outcome: "completed", score: score(...sets), played_on: "2026-06-01", ...extra });
  // Side 1 enters a win, 4-6 6-7 for side 0: the waiting list writes it from side 0, not from the reporter.
  assert.equal((await claim(1, [[4, 6], [6, 7]])).status, 201);
  let results = text((await coach.get("/coach/results")).html)
  assert.match(results, new RegExp(`${names[1]} entered: 4-6, 6-7\\. ${names[0]} has not answered`));
  assert.match(results, new RegExp(`Written with ${names[0]}'s games first`));
  // Side 0 enters the same score with its own games first: a mirror image, not the same score.
  assert.equal((await claim(0, [[6, 4], [7, 6]])).status, 201);
  results = text((await coach.get("/coach/results")).html);
  assert.match(results, /same score reversed/);
  let page = await coach.get(`/coach/matches/${p.match}`);
  assert.match(text(page.html), /same score reversed/);
  const use = [...page.html.matchAll(/href="([^"]*\?use=[^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  assert.equal(use.length, 2, "each entry can start the decision");
  // Using side 1's entry fills the form with it; saving still needs review, a reason and the version.
  page = await coach.get(use[1]!);
  assert.match(text(page.html), new RegExp(`holds ${names[1]}'s entry`));
  for (const [field, value] of [["mine_1", "4"], ["theirs_1", "6"], ["mine_2", "6"], ["theirs_2", "7"], ["played_on", "2026-06-01"]]) {
    assert.match(page.html, new RegExp(`name="${field}"[^>]*value="${value}"`), field);
  }
  assert.match(page.html, /value="completed" checked/);
  assert.doesNotMatch(page.html, /<option value="[a-z_]+" selected/, "no reason is chosen for the coach");
  const unsaved = await coach.post(`/coach/matches/${p.match}/settle`, { outcome: "completed", mine_1: "4", theirs_1: "6",
    mine_2: "6", theirs_2: "7", reason: "conflicting_entries" });
  assert.equal(unsaved.status, 400, "saving without review is refused");
  assert.equal((await f.api(`/v1/matches/${p.match}`, f.admin)).body.status, "disputed");
  // A different score is a plain dispute, with no note.
  assert.equal((await claim(0, [[6, 2], [6, 2]])).status, 201);
  assert.doesNotMatch(text((await coach.get("/coach/results")).html), /same score reversed/);
  assert.doesNotMatch(text((await coach.get(`/coach/matches/${p.match}`)).html), /same score reversed/);
});

test("an unknown or malformed match ID is a missing page for the coach and the player", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const player = await signIn(f, "sam@example.org");
  const unknown = "01a1016b-aa86-7d22-8000-000000000000";
  for (const id of ["01a1016b-aa86-7d22-0000", "not-an-id", unknown]) {
    for (const [who, path, back] of [[coach, `/coach/matches/${id}`, "/coach/results"], [player, `/matches/${id}`, "/"]] as const) {
      const page = await who.get(path);
      assert.equal(page.status, 404, `${path} answers 404`);
      assert.equal(page.headers.get("cache-control"), "no-store");
      assert.match(page.html, /No such match/);
      assert.ok(page.html.includes(`href="${back}"`), `${path} links back`);
    }
  }
  const posted = await coach.post(`/coach/matches/not-an-id/preview`, { outcome: "unplayed", reason: "no_response" });
  assert.equal(posted.status, 404);
  assert.equal((await player.post(`/matches/${unknown}/report`, { outcome: "completed" })).status, 404);
  assert.equal((await coach.get(`/coach/matches/${p.match}`)).status, 200, "a real match still opens");
  assert.equal((await coach.get("/coach/no-such-page")).status, 404);
});

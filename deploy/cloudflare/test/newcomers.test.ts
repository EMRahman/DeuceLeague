import assert from "node:assert/strict";
import test from "node:test";
import { browser, playingWebsite, signIn, websiteFixture } from "./website-helpers.ts";

test("an approved newcomer sees waiting, announced dates, provisional doubles placement and open fixtures", async (t) => {
  const f = await websiteFixture(t);
  const request = await f.create("/v1/join-requests", { first_name: "Robin", surname: "Hale",
    email: "robin@example.org", phone: "07700 900123", privacy_notice: "uk-2026-10-01" });
  const approved = await f.api(`/v1/join-requests/${request.id}/approve`, f.admin, "POST", { display_name: "Robin H." });
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  const member = approved.body;
  const player = await signIn(f, "robin@example.org");
  let home = (await player.get("/")).html;
  assert.match(home, /Your membership is approved/);
  assert.match(home, /name and dates have not been announced/);
  assert.match(home, /approval does not add you to the running season/);
  assert.match(home, /You do not need to do anything now/);
  assert.doesNotMatch(home, /You have no matches outstanding/);

  const season = await f.create("/v1/seasons", { name: "Spring 2027" });
  home = (await player.get("/")).html;
  assert.match(home, /in Spring 2027/); assert.match(home, /start date has not been announced/);
  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin, "PATCH", {
    starts_on: "2027-03-01", ends_on: "2027-05-31",
  })).status, 200);
  home = (await player.get("/")).html;
  assert.match(home, /in Spring 2027/); assert.match(home, /Starts .*Mar/); assert.match(home, /Ends .*May/);
  assert.match(home, /place is not guaranteed/);
  const comp = await f.create("/v1/competitions", { season_id: season.id, name: "Doubles", discipline: "doubles", match_format: "best_of_3_champions_tiebreak" });
  const division = await f.create(`/v1/competitions/${comp.id}/divisions`, { name: "Division 4" });
  const partner = await f.create("/v1/members", { display_name: "Lee" });
  await f.create(`/v1/competitions/${comp.id}/entries`, { division_id: division.id, member_ids: [member.id, partner.id] });
  home = (await player.get("/")).html;
  assert.match(home, /Your provisional place.*Spring 2027/);
  assert.match(home, /Doubles · Division 4/); assert.match(home, /Partner: Lee/);
  assert.match(home, /draft placement and may change/); assert.doesNotMatch(home, /waiting for the coach to consider/);
  // The exception is only their own lineup: normal draft reads remain refused.
  assert.equal((await f.api(`/v1/competitions/${comp.id}`, player.session())).status, 404);
  assert.equal((await f.api(`/v1/competitions/${comp.id}/entries`, player.session())).status, 404);
  assert.equal((await f.api("/v1/me/placements", f.admin)).status, 403);
  assert.equal((await f.request("/v1/me/placements")).status, 401);
  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  assert.match((await player.get("/")).html, /Your provisional place/);
  assert.equal((await f.api(`/v1/competitions/${comp.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  home = (await player.get("/")).html;
  assert.match(home, /Your season is open/); assert.match(home, /fixtures are still being prepared/);
  assert.doesNotMatch(home, /Your provisional place|Your membership is approved/);
  const opponents = await Promise.all(["Alex", "Sam"].map((display_name) => f.create("/v1/members", { display_name })));
  await f.create(`/v1/competitions/${comp.id}/entries`, { division_id: division.id, member_ids: opponents.map((m) => m.id) });
  assert.equal((await f.api(`/v1/divisions/${division.id}/fixtures`, f.admin, "POST")).status, 200);
  home = (await player.get("/")).html;
  assert.match(home, /Your fixtures are ready to play/); assert.match(home, /To play \(1\)/);
  assert.equal((await player.get("/")).headers.get("cache-control"), "no-store");
});

test("placement projection discloses only your lineup and no private competition", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const player = await signIn(f, "sam@example.org");
  const comp = await f.create("/v1/competitions", { season_id: p.season.id, name: "Hidden draft", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak", visibility: "private" });
  const division = await f.create(`/v1/competitions/${comp.id}/divisions`, {});
  await f.create(`/v1/competitions/${comp.id}/entries`, { division_id: division.id, member_ids: [p.members[0].id] });
  const data = (await f.api("/v1/me/placements", player.session())).body;
  assert.equal(data.placements.length, 1); assert.equal(data.placements[0].competition_id, p.comp.id);
  assert.doesNotMatch(JSON.stringify(data), /Hidden draft|Alex|example.org|Private notes/);
});

test("coach newcomers exclude breaks, leavers and previous participants who opted out", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const excluded = await f.create("/v1/members", { display_name: "Opted out" });
  const old = await f.create(`/v1/competitions/${p.comp.id}/entries`, { division_id: p.division.id, member_ids: [excluded.id] });
  assert.equal((await f.api(`/v1/entries/${old.id}/opt-out`, f.admin, "POST")).status, 200);
  assert.equal((await f.api(`/v1/competitions/${p.comp.id}`, f.admin, "PATCH", { state: "complete" })).status, 200);
  await f.create("/v1/members", { display_name: "New arrival" });
  for (const [display_name, action] of [["On break", "pause"], ["Leaving", "leave"]]) {
    const m = await f.create("/v1/members", { display_name });
    assert.equal((await f.api(`/v1/members/${m.id}/${action}`, f.admin, "POST")).status, 200);
  }
  await f.create("/v1/members", { display_name: "Left club", status: "left" });
  for (let i = 0; i < 13; i++) await f.create("/v1/competitions", { season_id: p.season.id,
    name: `Other ${i}`, discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  const reader = await f.create("/v1/api-keys", { name: "Members only", scopes: ["members:read"] });
  assert.equal((await f.api("/v1/members?never_entered=true", reader.key)).status, 403);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const home = (await coach.get("/coach/members")).html;
  const waiting = home.split("Waiting to be placed")[1]!.split("On the club&#39;s list")[0]!;
  assert.match(waiting, /New arrival/); assert.doesNotMatch(waiting, /Opted out|On break|Leaving|Left club|Sam|Alex/);
});

test("a waiting newcomer is told when next season's places are decided, and where new players start", async (t) => {
  const f = await websiteFixture(t);
  const p = await playingWebsite(f);
  const request = await f.create("/v1/join-requests", { first_name: "Ingrid", surname: "Olsen",
    email: "ingrid@example.org", phone: "07700 900124", privacy_notice: "uk-2026-10-01" });
  assert.equal((await f.api(`/v1/join-requests/${request.id}/approve`, f.admin, "POST", { display_name: "Ingrid O." })).status, 201);
  const deadline = "2026-12-10T23:59:59Z";
  assert.equal((await f.api(`/v1/seasons/${p.season.id}`, f.admin, "PATCH", { results_deadline_at: deadline })).status, 200);
  const ingrid = await signIn(f, "ingrid@example.org");
  const home = (await ingrid.get("/")).html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
  assert.match(home, /Next season's places are decided after results close on 10 Dec\. New players usually start in the bottom division\./);
  // A player already in the season is not told this.
  assert.doesNotMatch((await (await signIn(f, "sam@example.org")).get("/")).html, /New players usually start/);
});

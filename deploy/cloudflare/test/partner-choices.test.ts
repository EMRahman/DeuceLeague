import assert from "node:assert/strict";
import test from "node:test";
import { browser, playingWebsite, websiteFixture, type WebsiteFixture } from "./website-helpers.ts";

type Choice = { member_name: string; choice: string; partner_name: string | null; agreed: boolean };
const lines = (data: Choice[]) => data.map((c) => [c.member_name, c.choice, c.partner_name, c.agreed]);

async function session(f: WebsiteFixture, memberId: string) {
  const link = (await f.api(`/v1/members/${memberId}/login-link`, f.admin, "POST")).body.token;
  return (await f.api("/v1/session", link, "POST")).body.token as string;
}

/** Three pairs in one doubles division, each player signed in. */
async function doubles(t: test.TestContext) {
  const f = await websiteFixture(t);
  const { comp, division, members: [sam, alex, partner, other] } = await playingWebsite(f, true);
  const kim = await f.create("/v1/members", { display_name: "Kim" });
  const lee = await f.create("/v1/members", { display_name: "Lee" });
  await f.create(`/v1/competitions/${comp.id}/entries`, { division_id: division.id, member_ids: [kim.id, lee.id] });
  const players = { sam, alex, partner, other, kim, lee } as Record<string, { id: string }>;
  const tokens: Record<string, string> = {};
  for (const [k, m] of Object.entries(players)) tokens[k] = await session(f, m.id);
  const path = (who: string) => `/v1/competitions/${comp.id}/partner-choices/${players[who]!.id}`;
  const say = async (who: string, body: object, as = who) => f.api(path(who), tokens[as]!, "PUT", body);
  const seen = async (as: string) => (await f.api(`/v1/competitions/${comp.id}/partner-choices`, tokens[as]!)).body.data as Choice[];
  return { f, comp, players, tokens, path, say, seen };
}

test("doubles players ask for a partner, agree by naming them back, say no, or leave", async (t) => {
  const { f, players, tokens, path, say, seen } = await doubles(t);
  // Pairs: Sam / Partner, Alex / Other, Kim / Lee.
  let r = await say("sam", { choice: "new_partner", partner_id: players.alex!.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(lines(r.body.data), [["Sam", "new_partner", "Alex", false]]);
  assert.equal((await say("alex", { choice: "leaving" }, "sam")).status, 403, "a session speaks only for its own player");
  const outsider = await f.create("/v1/members", { display_name: "Outsider" });
  assert.equal((await say("sam", { choice: "new_partner", partner_id: outsider.id })).status, 400, "only someone in the competition");
  assert.equal((await say("sam", { choice: "new_partner", partner_id: players.sam!.id })).status, 400);

  // Who sees what: the one asked, and the asker's partner; not the rest of the league.
  assert.deepEqual(lines(await seen("alex")), [["Sam", "new_partner", "Alex", false]]);
  assert.deepEqual(lines(await seen("partner")), [["Sam", "new_partner", "Alex", false]]);
  assert.deepEqual(await seen("kim"), []);

  // Alex agrees by naming Sam back: both are agreed.
  r = await say("alex", { choice: "new_partner", partner_id: players.sam!.id });
  assert.deepEqual(lines(r.body.data), [["Alex", "new_partner", "Sam", true], ["Sam", "new_partner", "Alex", true]]);
  // Sam changes their mind and keeps their partner: Alex has still left theirs, and is looking again.
  r = await say("sam", { choice: "keep" });
  assert.deepEqual(lines(r.body.data), [["Sam", "keep", null, false], ["Alex", "new_partner", null, false]]);
  // Naming the partner you have is keeping them.
  assert.deepEqual(lines((await say("lee", { choice: "new_partner", partner_id: players.kim!.id })).body.data), [["Lee", "keep", null, false]]);

  // Kim asks Alex, and only Alex can say no; then Kim is left for the coach to pair.
  await say("kim", { choice: "new_partner", partner_id: players.alex!.id });
  assert.equal((await f.api(`${path("kim")}/decline`, tokens.sam!, "POST")).status, 403);
  r = await f.api(`${path("kim")}/decline`, tokens.alex!, "POST");
  assert.equal(r.status, 200); assert.deepEqual(lines(r.body.data), [["Kim", "new_partner", null, false]]);
  assert.equal((await f.api(`${path("kim")}/decline`, tokens.alex!, "POST")).status, 404, "nothing left to say no to");

  // Not playing says no to anyone waiting for an answer.
  await say("kim", { choice: "new_partner", partner_id: players.partner!.id });
  r = await say("partner", { choice: "leaving" });
  assert.deepEqual(lines(r.body.data), [["Partner", "leaving", null, false], ["Kim", "new_partner", null, false]]);

  // The coach's key sees everyone, and every change is in the event feed by player.
  const all = (await f.api(`/v1/competitions/${(await f.api("/v1/competitions", f.admin)).body.data[0].id}/partner-choices`, f.admin)).body.data;
  assert.deepEqual(lines(all).sort(), [["Alex", "new_partner", null, false], ["Kim", "new_partner", null, false],
    ["Partner", "leaving", null, false]]);
  const events = (await f.api("/v1/events?order=newest&limit=100", f.admin)).body.data as { type: string; subject_name: string }[];
  assert.ok(events.some((e) => e.type === "partner_choice.declined" && e.subject_name === "Kim"));
  assert.ok(events.some((e) => e.type === "partner_choice.cleared" && e.subject_name === "Sam"));
});

test("next season's draft leaves out every pair breaking up, saying why, and choices close with the competition", async (t) => {
  const { f, comp, players, say } = await doubles(t);
  await say("partner", { choice: "leaving" });
  await say("kim", { choice: "new_partner", partner_id: players.alex!.id });
  await say("alex", { choice: "new_partner", partner_id: players.kim!.id });
  assert.equal((await f.api(`/v1/competitions/${comp.id}`, f.admin, "PATCH", { state: "complete" })).status, 200);
  const closed = await say("sam", { choice: "leaving" });
  assert.equal(closed.status, 409); assert.equal(closed.body.code, "choices_closed");

  const next = await f.create("/v1/seasons", { name: "Next" });
  const draft = await f.create("/v1/competitions", { season_id: next.id, name: "Next doubles", discipline: "doubles",
    match_format: "best_of_3_champions_tiebreak", previous_competition_id: comp.id });
  const filled = await f.api(`/v1/competitions/${draft.id}/placements`, f.admin, "POST");
  assert.equal(filled.status, 201, JSON.stringify(filled.body));
  const why = Object.fromEntries((filled.body.not_carried as { label: string; explanation: string }[]).map((n) => [n.label, n.explanation]));
  assert.match(why["Sam / Partner"]!, /but Partner is not playing next season, so the pair is not carried over/);
  assert.match(why["Alex / Other"]!, /but Alex is playing with Kim, so the pair is not carried over/);
  assert.match(why["Kim / Lee"]!, /but Kim is playing with Alex, so the pair is not carried over/);
});

test("singles has no partners, and erasing a player takes their choices and any request naming them", async (t) => {
  const { f, comp, players, say } = await doubles(t);
  const singles = await f.create("/v1/competitions", { season_id: comp.season_id, name: "Singles", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak" });
  assert.equal((await f.api(`/v1/competitions/${singles.id}/partner-choices/${players.sam!.id}`, f.admin, "PUT",
    { choice: "leaving" })).body.code, "not_doubles");
  await say("kim", { choice: "new_partner", partner_id: players.alex!.id });
  await say("alex", { choice: "leaving" }, "alex");
  await say("sam", { choice: "new_partner", partner_id: players.kim!.id });
  assert.equal((await f.api(`/v1/members/${players.kim!.id}/erase`, f.admin, "POST")).status, 200);
  const left = (await f.api(`/v1/competitions/${comp.id}/partner-choices`, f.admin)).body.data as Choice[];
  assert.deepEqual(lines(left).sort(), [["Alex", "leaving", null, false], ["Sam", "new_partner", null, false]]);
  const rows = await f.db.prepare("SELECT count(*) AS n FROM partner_choice WHERE member_id = ? OR partner_id = ?")
    .bind(players.kim!.id, players.kim!.id).first("n");
  assert.equal(rows, 0);
});

test("the coach sees next season's pairs on one page, matching what players said", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const doubles = (await f.api("/v1/competitions?state=active", f.admin)).body.data.find((x: any) => x.discipline === "doubles");
  const flat = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
  assert.match((await coach.get("/coach")).html, new RegExp(`href="/coach/pairs#competition-${doubles.id}"`));
  const page = flat((await coach.get("/coach/pairs")).html);
  assert.match(page, /Sample doubles New pairs agreed \(1\) Sample (Harper and Sample Parker|Parker and Sample Harper)/);
  assert.match(page, /Sample Indy · asked Sample Bailey, who has not agreed yet/);
  assert.match(page, /Sample Taylor · is not playing Sample doubles/);
  assert.match(page, /Sample Sage · has said nothing, but Sample Taylor is not playing Sample doubles/);
  assert.match(page, /Sample Jordan · has said nothing, but Sample Indy wants a new partner/);
  assert.match(page, /Sample Alex · has said nothing, but Sample Parker agreed to play with Sample Harper/);
  // Every player the API lists as changing something is on the page, in the same terms.
  const choices = (await f.api(`/v1/competitions/${doubles.id}/partner-choices`, f.admin)).body.data as any[];
  for (const c of choices) assert.ok(page.includes(c.member_name), `${c.member_name} is shown`);
  assert.match(page, /Keeping their partner \(\d+\)/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { browser, playingWebsite, signIn, websiteFixture, type WebsiteFixture } from "./website-helpers.ts";

async function session(f: WebsiteFixture, memberId: string) {
  const link = (await f.api(`/v1/members/${memberId}/login-link`, f.admin, "POST")).body.token;
  return (await f.api("/v1/session", link, "POST")).body.token as string;
}
const events = (f: WebsiteFixture, type: string) =>
  f.db.prepare("SELECT count(*) AS n FROM event WHERE type = ?").bind(type).first<number>("n");

test("a player leaving the league altogether is out of next season's draft, once, and can take it back", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const [sam, alex] = p.members as { id: string }[];
  const next = await f.create("/v1/competitions", { season_id: p.season.id, name: "Next", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak", previous_competition_id: p.comp.id });
  const plan = async () => (await f.api(`/v1/competitions/${next.id}/placements`, f.admin)).body;
  const goes = async (entryId: string) => (await plan()).suggestions.find((s: any) => s.previous_entry_id === entryId);
  assert.deepEqual([(await goes(p.entries[0].id)).to_division, (await goes(p.entries[1].id)).to_division], [1, 1]);

  // Said once, recorded once: saying it again keeps the first time and adds nothing.
  const said = await f.api(`/v1/members/${sam!.id}/leave`, f.admin, "POST");
  assert.equal(said.status, 200, JSON.stringify(said.body)); assert.ok(said.body.leaving_at);
  const again = await f.api(`/v1/members/${sam!.id}/leave`, f.admin, "POST");
  assert.equal(again.body.leaving_at, said.body.leaving_at); assert.equal(await events(f, "member.leaving.recorded"), 1);
  assert.equal((await f.api(`/v1/members/${sam!.id}`, f.admin)).body.leaving_at, said.body.leaving_at);

  // Their entry is left out of the draft, with the reason; the other player's is carried.
  const out = await goes(p.entries[0].id);
  assert.deepEqual([out.to_division, out.reason], [null, null]);
  assert.match(out.explanation, /a member is leaving the league, so not carried over/);
  assert.equal((await goes(p.entries[1].id)).to_division, 1);
  const filled = await f.api(`/v1/competitions/${next.id}/placements`, f.admin, "POST");
  assert.equal(filled.status, 201, JSON.stringify(filled.body));
  assert.deepEqual(filled.body.placed.map((x: any) => x.previous_entry_id), [p.entries[1].id]);
  assert.match(filled.body.not_carried[0].explanation, /leaving the league/);
  // This season stands: their entry and match are untouched.
  assert.equal((await f.api(`/v1/entries/${p.entries[0].id}`, f.admin)).body.state, "active");
  assert.equal((await f.api(`/v1/matches/${p.match}`, f.admin)).body.status, "open");

  // The dashboard's opt-outs list their entry; a later entry is not covered by what they said.
  const progress = async (id: string) => ((await f.api(`/v1/seasons/${p.season.id}/progress`, f.admin)).body.competitions as any[])
    .find((c) => c.competition_id === id).opted_out as { label: string }[];
  assert.deepEqual((await progress(p.comp.id)).map((x) => x.label), ["Sam"]);
  const cup = await f.create("/v1/competitions", { season_id: p.season.id, name: "Cup", discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  const division = await f.create(`/v1/competitions/${cup.id}/divisions`, {});
  await f.create(`/v1/competitions/${cup.id}/entries`, { division_id: division.id, member_ids: [sam!.id] });
  assert.deepEqual(await progress(cup.id), [], "entered again after saying so: not caught by it");
});

test("taking it back restores the entries, but not the opt-outs a player made one entry at a time", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const [sam, alex] = p.members as { id: string }[];
  const next = await f.create("/v1/competitions", { season_id: p.season.id, name: "Next", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak", previous_competition_id: p.comp.id });
  const carried = async () => ((await f.api(`/v1/competitions/${next.id}/placements`, f.admin)).body.suggestions as any[])
    .filter((s) => s.to_division !== null).map((s) => s.label).sort();
  assert.equal((await f.api(`/v1/entries/${p.entries[1].id}/opt-out`, f.admin, "POST")).status, 200);
  assert.equal((await f.api(`/v1/members/${alex!.id}/leave`, f.admin, "POST")).status, 200);
  assert.equal((await f.api(`/v1/members/${sam!.id}/leave`, f.admin, "POST")).status, 200);
  assert.deepEqual(await carried(), []);
  const undone = await f.api(`/v1/members/${alex!.id}/leave`, f.admin, "DELETE");
  assert.equal(undone.status, 200); assert.equal(undone.body.leaving_at, null);
  // Alex had opted out of this entry already, and still has; Sam is back.
  assert.equal((await f.api(`/v1/members/${sam!.id}/leave`, f.admin, "DELETE")).status, 200);
  assert.deepEqual(await carried(), ["Sam"]);
  assert.equal(await events(f, "member.leaving.cleared"), 2);
  // Harmless when never said, and nothing more is recorded.
  assert.equal((await f.api(`/v1/members/${sam!.id}/leave`, f.admin, "DELETE")).status, 200);
  assert.equal(await events(f, "member.leaving.cleared"), 2);
});

test("a player says it for themselves only, and a key needs league:write", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const [sam, alex] = p.members as { id: string }[];
  const mine = await session(f, sam!.id);
  assert.equal((await f.api(`/v1/members/${alex!.id}/leave`, mine, "POST")).status, 403);
  assert.equal((await f.api(`/v1/members/${alex!.id}/leave`, mine, "DELETE")).status, 403);
  const own = await f.api(`/v1/members/${sam!.id}/leave`, mine, "POST");
  assert.equal(own.status, 200, JSON.stringify(own.body)); assert.ok(own.body.leaving_at);
  assert.ok(!("email" in own.body), "a player's answer holds no one's personal details");
  assert.equal((await f.api(`/v1/members/${sam!.id}/leave`, mine, "DELETE")).body.leaving_at, null);
  const reader = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Reader", scopes: ["members:read"] })).body.key;
  assert.equal((await f.api(`/v1/members/${sam!.id}/leave`, reader, "POST")).status, 403);
  assert.equal((await f.api(`/v1/members/${randomId()}/leave`, f.admin, "POST")).status, 404);
  // A removed member cannot say it.
  await f.api(`/v1/members/${alex!.id}`, f.admin, "DELETE");
  assert.equal((await f.api(`/v1/members/${alex!.id}/leave`, f.admin, "POST")).body.code, "member_removed");
});
function randomId() { return crypto.randomUUID(); }

test("in doubles the pair is left out, a partner who stays is shown as needing a partner, and the dashboard lists every opt-out", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f, true);
  const [sam, alex, partner, other] = p.members as { id: string }[];
  const next = await f.create("/v1/competitions", { season_id: p.season.id, name: "Next", discipline: "doubles",
    match_format: "best_of_3_champions_tiebreak", previous_competition_id: p.comp.id });
  // Alex says he is not playing doubles next season (the partner choice that already existed); Sam leaves altogether.
  const alexSession = await session(f, alex!.id);
  assert.equal((await f.api(`/v1/competitions/${p.comp.id}/partner-choices/${alex!.id}`, alexSession, "PUT", { choice: "leaving" })).status, 200);
  assert.equal((await f.api(`/v1/members/${sam!.id}/leave`, f.admin, "POST")).status, 200);

  const plan = (await f.api(`/v1/competitions/${next.id}/placements`, f.admin)).body;
  assert.equal(plan.suggestions.length, 2);
  assert.ok(plan.suggestions.every((s: any) => s.to_division === null));
  const samPair = plan.suggestions.find((s: any) => s.label.includes("Sam"));
  assert.match(samPair.explanation, /a member is leaving the league, so not carried over/);
  const alexPair = plan.suggestions.find((s: any) => s.label.includes("Alex"));
  assert.match(alexPair.explanation, /Alex is not playing next season, so the pair is not carried over/);

  // The dashboard no longer says nobody opted out: both pairs are listed, however each said so.
  const out = ((await f.api(`/v1/seasons/${p.season.id}/progress`, f.admin)).body.competitions as any[])
    .find((c) => c.competition_id === p.comp.id).opted_out as { label: string }[];
  assert.deepEqual(out.map((x) => x.label).sort(), ["Alex / Other", "Sam / Partner"].sort());
  void partner; void other;
});

test("a player says it from their home page, sees what it does, and can take it back", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const sam = await signIn(f, "sam@example.org");
  const home = await sam.get("/");
  assert.match(home.html, /I am not playing next season at all/); assert.match(home.html, /draft for\s+Club league/);
  assert.doesNotMatch(home.html, /You are not playing next season/);
  assert.equal((await sam.post("/leave", {}, "https://evil.invalid")).status, 403);
  const said = await sam.post("/leave");
  assert.equal(said.status, 303); assert.equal(said.location, "/?done=leaving");
  assert.ok((await f.api(`/v1/members/${p.members[0].id}`, f.admin)).body.leaving_at);
  const after = await sam.get("/?done=leaving");
  assert.match(after.html, /You are not playing next season/); assert.match(after.html, /so you will not be in the draft for Club league/);
  assert.match(after.html, /Done\. The coach will see you are not playing next season/);
  assert.doesNotMatch(after.html, /I am not playing next season at all/);
  // Entered in something new after saying so: that is not covered, and the page says so rather than promising it.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const cup = await f.create("/v1/competitions", { season_id: p.season.id, name: "Cup", discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  const cupDivision = await f.create(`/v1/competitions/${cup.id}/divisions`, {});
  await f.create(`/v1/competitions/${cup.id}/entries`, { division_id: cupDivision.id, member_ids: [p.members[0].id] });
  await f.api(`/v1/competitions/${cup.id}`, f.admin, "PATCH", { state: "active" });
  const mixed = (await sam.get("/")).html;
  assert.match(mixed, /you will not be in the draft for Club league\./);
  assert.match(mixed, /You were entered in Cup after you said this, so that is not covered/);
  assert.doesNotMatch((await sam.get(`/competitions/${cup.id}`)).html, /so this is one of the competitions you are leaving/);

  // The competition page says the same, and does not offer the per-entry opt-out beside it.
  const page = (await sam.get(`/competitions/${p.comp.id}`)).html;
  assert.match(page, /you are not playing next season at all, so this is one of the competitions you are leaving/);
  assert.doesNotMatch(page, /I am not playing next season<\/button>/);
  // The other player is untouched.
  assert.doesNotMatch((await (await signIn(f, "alex@example.org")).get("/")).html, /You are not playing next season/);

  const back = await sam.post("/leave/undo");
  assert.equal(back.status, 303); assert.equal(back.location, "/?done=staying");
  assert.equal((await f.api(`/v1/members/${p.members[0].id}`, f.admin)).body.leaving_at, null);
  assert.match((await sam.get("/")).html, /I am not playing next season at all/);
});

test("the coach marks a member as not playing next season, and the draft names who is leaving and who needs a partner", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const competitions = (await f.api("/v1/competitions", f.admin)).body.data as { id: string; discipline: string }[];
  const entriesOf = async (id: string) => (await f.api(`/v1/competitions/${id}/entries`, f.admin)).body.data as
    { label: string; opted_out_at: string | null; members: { id: string; display_name: string }[] }[];
  const free = (list: Awaited<ReturnType<typeof entriesOf>>) => list.filter((e) => !e.opted_out_at);
  const singles = (await entriesOf(competitions.find((x) => x.discipline === "singles")!.id));
  const doubles = (await entriesOf(competitions.find((x) => x.discipline === "doubles")!.id));
  // A pair nobody has said anything about, so the draft has only the leaving to explain.
  const doublesId = competitions.find((x) => x.discipline === "doubles")!.id;
  const said = new Set(((await f.api(`/v1/competitions/${doublesId}/partner-choices`, f.admin)).body.data as { member_id: string; partner_id: string | null }[])
    .flatMap((c) => [c.member_id, c.partner_id ?? ""]));
  const pair = free(doubles).find((e) => e.members.every((m) => !said.has(m.id)))!; const [gone, stays] = [pair.members[0]!, pair.members[1]!];
  const leaver = free(singles).map((e) => e.members[0]!).find((m) => ![gone.id, stays.id].includes(m.id))!;
  void stays;

  const members = (await coach.get(`/coach/members/${leaver.id}`)).html;
  assert.match(members, new RegExp(`action="/coach/members/${leaver.id}/leaving"`));
  const saved = await coach.post(`/coach/members/${leaver.id}/leaving`);
  assert.equal(saved.status, 303); assert.equal(saved.location, `/coach/members/${leaver.id}?saved=1`);
  assert.equal((await coach.post(`/coach/members/${gone.id}/leaving`)).status, 303);
  const marked = (await coach.get(`/coach/members/${leaver.id}?saved=1`)).html;
  assert.match(marked, /Saved\./);
  assert.match(marked, new RegExp(`action="/coach/members/${leaver.id}/staying"`)); assert.match(marked, /Not playing next season at all/);
  assert.match((await coach.get("/coach/members")).html, /<span class="tag">Not playing next season<\/span>/);
  // The dashboard lists them under who is not playing next season, in each competition they were in.
  const dashboard = (await coach.get("/coach")).html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(dashboard, new RegExp(`opted out of next season:[^.]*${singles.find((e) => e.members[0]!.id === leaver.id)!.label}`));
  assert.match(dashboard, new RegExp(`opted out of next season:[^.]*${pair.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  // A pair names the one who said it, so it does not read as both.
  assert.match(dashboard, new RegExp(`${pair.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(${gone.display_name} said so\\)`));

  const text = (html: string) => html.replace(/<form[\s\S]*?<\/form>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const shown = /name="shown" value="([^"]*)"/.exec((await coach.get(`/coach/season/${season.id}/end`)).html)?.[1] ?? "";
  for (let hop = 0; hop < 20; hop++) { const r = await coach.post(`/coach/season/${season.id}/end`, { leave: "yes", shown }); if (r.status !== 307) break; }
  for (let hop = 0; hop < 20; hop++) {
    const r = await coach.post("/coach/season/next", { from: season.id, name: "Sample season 2", starts_on: "2026-10-01", ends_on: "2026-11-30" });
    if (r.status !== 307) break;
  }
  const drafts = (await f.api("/v1/competitions?state=draft", f.admin)).body.data as { id: string; discipline: string }[];
  const single = text((await coach.get(`/coach/season/drafts/${drafts.find((d) => d.discipline === "singles")!.id}`)).html);
  assert.match(single, new RegExp(`${leaver.display_name} is leaving the league`));
  const double = text((await coach.get(`/coach/season/drafts/${drafts.find((d) => d.discipline === "doubles")!.id}`)).html);
  assert.match(double, new RegExp(`${pair.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ${gone.display_name} is leaving the league`));
  // The partner who stays is among those needing a partner, and the reason is the leaver, unless they have already said something.
  const needing = double.split("Players without a pair")[1]!.split("Make a pair")[0]!;
  assert.match(needing, new RegExp(`${stays.display_name}( Level \\d+)? `));
  assert.match(needing, new RegExp(`Was in ${pair.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · ${gone.display_name} is leaving the league`));
  assert.match(double.split("Not playing next season").at(-1)!, new RegExp(gone.display_name), "listed among those not playing");

  // Taking it back from the members page.
  assert.equal((await coach.post(`/coach/members/${leaver.id}/staying`)).status, 303);
  assert.equal((await f.api(`/v1/members/${leaver.id}`, f.admin)).body.leaving_at, null);
});

test("a break leaves a member out of every draft until they are back, and does nothing to this season", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const [sam, alex] = p.members as { id: string }[];
  const next = await f.create("/v1/competitions", { season_id: p.season.id, name: "Next", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak", previous_competition_id: p.comp.id });
  const goes = async () => ((await f.api(`/v1/competitions/${next.id}/placements`, f.admin)).body.suggestions as any[]);
  const chased = async () => (await f.api("/v1/chase-list", f.admin)).body.data.length as number;
  assert.equal(await chased(), 2);

  const paused = await f.api(`/v1/members/${sam!.id}/pause`, f.admin, "POST");
  assert.equal(paused.status, 200, JSON.stringify(paused.body)); assert.equal(paused.body.status, "paused");
  assert.equal((await f.api(`/v1/members/${sam!.id}/pause`, f.admin, "POST")).body.status, "paused");
  assert.equal(await events(f, "member.paused"), 1, "saying it twice records nothing more");

  // Out of the draft, with the reason; the other player is carried. This season stands.
  const out = (await goes()).find((s) => s.previous_entry_id === p.entries[0].id);
  assert.deepEqual([out.to_division, out.reason], [null, null]);
  assert.match(out.explanation, /a member is taking a break, so not carried over/);
  assert.equal((await goes()).find((s) => s.previous_entry_id === p.entries[1].id).to_division, 1);
  assert.equal((await f.api(`/v1/entries/${p.entries[0].id}`, f.admin)).body.state, "active");
  assert.equal((await f.api(`/v1/matches/${p.match}`, f.admin)).body.status, "open");
  // Nobody is chased for a match against an entry that is away, and the dashboard lists the entry.
  assert.equal(await chased(), 0);
  const listed = ((await f.api(`/v1/seasons/${p.season.id}/progress`, f.admin)).body.competitions as any[])
    .find((c) => c.competition_id === p.comp.id).opted_out.map((x: { label: string }) => x.label);
  assert.deepEqual(listed, ["Sam"]);
  // They cannot be put in a competition while away.
  const cup = await f.create("/v1/competitions", { season_id: p.season.id, name: "Cup", discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  const division = await f.create(`/v1/competitions/${cup.id}/divisions`, {});
  const refused = await f.api(`/v1/competitions/${cup.id}/entries`, f.admin, "POST", { division_id: division.id, member_ids: [sam!.id] });
  assert.equal(refused.status, 400); assert.match(JSON.stringify(refused.body), /on a break/);

  // Back: in the reckoning again for every draft, and chased again; the break had no end date to expire.
  const back = await f.api(`/v1/members/${sam!.id}/pause`, f.admin, "DELETE");
  assert.equal(back.status, 200); assert.equal(back.body.status, "active");
  assert.equal(await events(f, "member.resumed"), 1);
  assert.equal((await goes()).find((s) => s.previous_entry_id === p.entries[0].id).to_division, 1);
  assert.equal(await chased(), 2);
  assert.equal((await f.api(`/v1/members/${sam!.id}/pause`, f.admin, "DELETE")).status, 200, "harmless when not on a break");
  assert.equal(await events(f, "member.resumed"), 1);
  void alex;
});

test("a break is a player's own to take, and not for someone who has left or been removed", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const [sam, alex] = p.members as { id: string }[];
  const mine = await session(f, sam!.id);
  assert.equal((await f.api(`/v1/members/${alex!.id}/pause`, mine, "POST")).status, 403);
  const own = await f.api(`/v1/members/${sam!.id}/pause`, mine, "POST");
  assert.equal(own.status, 200, JSON.stringify(own.body)); assert.equal(own.body.status, "paused");
  assert.equal((await f.api("/v1/me", mine)).body.credential.member.status, "paused");
  assert.equal((await f.api(`/v1/members/${sam!.id}/pause`, mine, "DELETE")).body.status, "active");
  const reader = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Reader", scopes: ["members:read"] })).body.key;
  assert.equal((await f.api(`/v1/members/${sam!.id}/pause`, reader, "POST")).status, 403);
  await f.api(`/v1/members/${alex!.id}`, f.admin, "PATCH", { status: "left" });
  assert.equal((await f.api(`/v1/members/${alex!.id}/pause`, f.admin, "POST")).body.code, "member_left");
  assert.equal((await f.api(`/v1/members/${alex!.id}/pause`, f.admin, "DELETE")).body.code, "member_left", "left is not a break to come back from");
  await f.api(`/v1/members/${sam!.id}`, f.admin, "DELETE");
  assert.equal((await f.api(`/v1/members/${sam!.id}/pause`, f.admin, "POST")).body.code, "member_removed");
});

test("a player takes a break from their home page, and comes back from it", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const sam = await signIn(f, "sam@example.org");
  const home = (await sam.get("/")).html;
  assert.match(home, /I am taking a break/); assert.match(home, /I am not playing next season at all/);
  assert.doesNotMatch(home, /You are on a break/);
  assert.equal((await sam.post("/pause", {}, "https://evil.invalid")).status, 403);
  const said = await sam.post("/pause");
  assert.equal(said.status, 303); assert.equal(said.location, "/?done=paused");
  assert.equal((await f.api(`/v1/members/${p.members[0].id}`, f.admin)).body.status, "paused");
  const away = (await sam.get("/?done=paused")).html;
  assert.match(away, /You are on a break/); assert.match(away, /I am back/); assert.match(away, /Done\. You are on a break/);
  assert.doesNotMatch(away, /I am taking a break/); assert.doesNotMatch(away, /I am not playing next season at all/);
  assert.match((await sam.get(`/competitions/${p.comp.id}`)).html, /You are on a break, so you are not in the draft for next season/);
  const back = await sam.post("/resume");
  assert.equal(back.status, 303); assert.equal(back.location, "/?done=resumed");
  assert.equal((await f.api(`/v1/members/${p.members[0].id}`, f.admin)).body.status, "active");
  assert.match((await sam.get("/?done=resumed")).html, /Welcome back/);
});

test("the coach puts a member on a break, and the draft says so and what it means for a doubles partner", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const doublesId = ((await f.api("/v1/competitions", f.admin)).body.data as { id: string; discipline: string }[]).find((x) => x.discipline === "doubles")!.id;
  const entries = (await f.api(`/v1/competitions/${doublesId}/entries`, f.admin)).body.data as
    { label: string; opted_out_at: string | null; members: { id: string; display_name: string }[] }[];
  const said = new Set(((await f.api(`/v1/competitions/${doublesId}/partner-choices`, f.admin)).body.data as { member_id: string; partner_id: string | null }[])
    .flatMap((c) => [c.member_id, c.partner_id ?? ""]));
  const pair = entries.find((e) => !e.opted_out_at && e.members.every((m) => !said.has(m.id)))!;
  const [away, stays] = [pair.members[0]!, pair.members[1]!];

  assert.match((await coach.get(`/coach/members/${away.id}`)).html, new RegExp(`action="/coach/members/${away.id}/pause"`));
  assert.equal((await coach.post(`/coach/members/${away.id}/pause`)).status, 303);
  assert.match((await coach.get("/coach/members")).html, /<span class="tag">On a break<\/span>/);
  assert.match((await coach.get(`/coach/members/${away.id}`)).html, new RegExp(`action="/coach/members/${away.id}/resume"`));

  const shown = /name="shown" value="([^"]*)"/.exec((await coach.get(`/coach/season/${season.id}/end`)).html)?.[1] ?? "";
  for (let hop = 0; hop < 20; hop++) { const r = await coach.post(`/coach/season/${season.id}/end`, { leave: "yes", shown }); if (r.status !== 307) break; }
  for (let hop = 0; hop < 20; hop++) {
    const r = await coach.post("/coach/season/next", { from: season.id, name: "Sample season 2", starts_on: "2026-10-01", ends_on: "2026-11-30" });
    if (r.status !== 307) break;
  }
  const draft = (await f.api("/v1/competitions?state=draft", f.admin)).body.data.find((d: { discipline: string }) => d.discipline === "doubles");
  const text = (html: string) => html.replace(/<form[\s\S]*?<\/form>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const escaped = pair.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const page = text((await coach.get(`/coach/season/drafts/${draft.id}`)).html);
  assert.match(page, new RegExp(`${escaped} ${away.display_name} is on a break`), "not 'no longer on the club's list'");
  assert.doesNotMatch(page, new RegExp(`${away.display_name} is no longer on the club`));
  const needing = page.split("Players without a pair")[1]!.split("Make a pair")[0]!;
  assert.match(needing, new RegExp(`${stays.display_name}( Level \\d+)? Was in ${escaped} · ${away.display_name} is on a break`));
  assert.match(page, /bring them back from the Members page first/);

  // Back from the break from the members page.
  assert.equal((await coach.post(`/coach/members/${away.id}/resume`)).status, 303);
  assert.equal((await f.api(`/v1/members/${away.id}`, f.admin)).body.status, "active");
});

test("a break takes the member out of a draft already filled; it is not put back when they return", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const [sam, alex] = p.members as { id: string }[];
  const next = await f.create("/v1/competitions", { season_id: p.season.id, name: "Next", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak", previous_competition_id: p.comp.id });
  assert.equal((await f.api(`/v1/competitions/${next.id}/placements`, f.admin, "POST")).status, 201);
  const draft = async () => ((await f.api(`/v1/competitions/${next.id}/entries`, f.admin)).body.data as { label: string }[]).map((e) => e.label).sort();
  assert.deepEqual(await draft(), ["Alex", "Sam"]);

  // Through the break routes, and through PATCH, which the API still supports: either way they come out, so the
  // season cannot start with matches drawn for someone who is away. Last season's entry is untouched.
  assert.equal((await f.api(`/v1/members/${sam!.id}/pause`, f.admin, "POST")).status, 200);
  assert.deepEqual(await draft(), ["Alex"]);
  assert.equal((await f.api(`/v1/members/${alex!.id}`, f.admin, "PATCH", { status: "paused" })).status, 200);
  assert.deepEqual(await draft(), []);
  assert.equal((await f.api(`/v1/competitions/${p.comp.id}/entries`, f.admin)).body.data.length, 2);
  // Back from the break: in the reckoning again, but not put back in a draft that is already filled.
  assert.equal((await f.api(`/v1/members/${sam!.id}/pause`, f.admin, "DELETE")).status, 200);
  assert.deepEqual(await draft(), []);
});

test("the break is offered to anyone active, with or without a place in a competition, and to no one who has left", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  await f.create("/v1/members", { display_name: "Newcomer", email: "newcomer@example.org" });
  const newcomer = await signIn(f, "newcomer@example.org");
  const home = (await newcomer.get("/")).html;
  assert.match(home, /I am taking a break/, "no entries yet, still offered");
  assert.doesNotMatch(home, /I am not playing next season at all/, "leaving covers entries, and they have none");
  assert.equal((await newcomer.post("/pause")).status, 303);
  assert.match((await newcomer.get("/")).html, /You are on a break/);

  // Someone who has left the club is offered neither, and a stale form does not break the page.
  const sam = await signIn(f, "sam@example.org");
  assert.equal((await f.api(`/v1/members/${p.members[0].id}`, f.admin, "PATCH", { status: "left" })).status, 200);
  const left = (await sam.get("/")).html;
  assert.doesNotMatch(left, /I am taking a break/); assert.doesNotMatch(left, /I am not playing next season at all/);
  const stale = await sam.post("/pause");
  assert.equal(stale.status, 303); assert.equal(stale.location, "/");
});

test("an opt-out is credited to whoever made the latest one, and to nobody when the coach did", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const sam = await signIn(f, "sam@example.org");
  const entry = p.entries[0].id;
  const saidBy = async () => ((await f.api(`/v1/seasons/${p.season.id}/progress`, f.admin)).body.competitions[0].opted_out as any[])
    .find((e) => e.entry_id === entry)?.said_by;
  assert.equal((await f.api(`/v1/entries/${entry}/opt-out`, sam.session(), "POST")).status, 200);
  assert.equal(await saidBy(), "Sam");
  assert.equal((await f.api(`/v1/entries/${entry}/opt-out`, sam.session(), "DELETE")).status, 200);
  assert.equal((await f.api(`/v1/entries/${entry}/opt-out`, f.admin, "POST")).status, 200);
  assert.equal(await saidBy(), null, "the coach's newer opt-out is not the player's");
});

test("a former member is erased from Members with the administrator key, and their matches stay under \"Erased member\"", async (t) => {
  const f = await websiteFixture(t);
  const p = await playingWebsite(f);
  const alex = p.members[1].id as string;
  const sam = await signIn(f, "sam@example.org");
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  // Only a former member can be erased from here.
  const active = await coach.get(`/coach/members/${alex}/erase`);
  assert.equal(active.status, 303); assert.equal(active.location, "/coach/members#former");
  assert.equal((await coach.post(`/coach/members/${alex}/erase`, { confirm: "yes", key: f.admin })).status, 303);
  assert.equal((await f.api(`/v1/members/${alex}`, f.admin)).body.display_name, "Alex");
  assert.equal((await coach.post(`/coach/members/${alex}/left`, { confirm: "yes" })).status, 303);
  assert.match((await coach.get("/coach/members")).html, new RegExp(`href="/coach/members/${alex}/erase"`));
  // Asked first, saying what it does; a post not confirmed changes nothing.
  const ask = await coach.get(`/coach/members/${alex}/erase`);
  assert.equal(ask.status, 200); assert.match(ask.html, /Erase Alex\?/); assert.match(ask.html, /cannot be undone/);
  assert.match(ask.html, /Their matches and scores stay/); assert.match(ask.html, /name="key" type="password"/);
  const unconfirmed = await coach.post(`/coach/members/${alex}/erase`, { key: f.admin });
  assert.equal(unconfirmed.status, 303); assert.equal(unconfirmed.location, `/coach/members/${alex}/erase`);
  // Only the administrator key erases: not this browser's own key, nor anything else.
  const notKey = await coach.post(`/coach/members/${alex}/erase`, { confirm: "yes", key: "password" });
  assert.equal(notKey.status, 400); assert.match(notKey.html, /not an API key/);
  const wrong = await coach.post(`/coach/members/${alex}/erase`, { confirm: "yes", key: "dl_not_a_real_key" });
  assert.equal(wrong.status, 401); assert.match(wrong.html, /not accepted/);
  const own = await coach.post(`/coach/members/${alex}/erase`, { confirm: "yes", key: coach.session() });
  assert.equal(own.status, 403); assert.match(own.html, /cannot erase members/);
  assert.equal((await f.api(`/v1/members/${alex}`, f.admin)).body.display_name, "Alex");
  // With it, their personal data goes and they leave Former members; their match stays, under "Erased member".
  const erased = await coach.post(`/coach/members/${alex}/erase`, { confirm: "yes", key: f.admin });
  assert.equal(erased.status, 303); assert.equal(erased.location, "/coach/members?erased=1#former");
  const after = (await coach.get(erased.location!)).html;
  assert.match(after, /Erased\. Their personal data is deleted/); assert.doesNotMatch(after, /id="former"/);
  assert.deepEqual(await f.db.prepare("SELECT display_name, email, full_name, notes FROM member WHERE id = ?").bind(alex).first(),
    { display_name: "Erased member", email: null, full_name: null, notes: null });
  assert.equal(await events(f, "member.erased"), 1);
  const match = await sam.get(`/matches/${p.match}`);
  assert.equal(match.status, 200); assert.match(match.html, /Erased member/); assert.doesNotMatch(match.html, /Alex/);
  // Erased once: the page is not offered again.
  assert.equal((await coach.get(`/coach/members/${alex}/erase`)).location, "/coach/members#former");
});

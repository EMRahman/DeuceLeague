import assert from "node:assert/strict";
import test from "node:test";
import { browser, playingWebsite, websiteFixture, type WebsiteFixture } from "./website-helpers.ts";

/** Each competition's table on the dashboard, by its heading, as text: [name, players, played, waiting, disputed, short, %]. */
function dashboardTables(html: string): Record<string, string[][]> {
  return Object.fromEntries([...html.matchAll(/<h2>([^<]+)<\/h2>[\s\S]*?<table class="progress">([\s\S]*?)<\/table>/g)].map(([, name, table]) =>
    [name!, [...table!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
      [...row!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, cell]) => cell!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()))]));
}

/** What the dashboard's rows should say, from the API's own progress. */
async function expectedRows(f: WebsiteFixture, competitionId: string): Promise<string[][]> {
  const p = (await f.api(`/v1/competitions/${competitionId}/progress`, f.admin)).body;
  const row = (name: string, c: { active_entries: number; played: number; matches: number; reported: number; disputed: number; below_minimum: number }) =>
    [name, String(c.played), String(c.matches), String(c.reported || "–"), String(c.disputed || "–"),
      String(c.active_entries), String(c.below_minimum || "–"), `${Math.round((100 * c.below_minimum) / c.active_entries)}%`];
  return [...p.divisions.map((d: { name: string } & Parameters<typeof row>[1]) => row(d.name, d)), row("All divisions", p)];
}

const BROWSER_SCOPES = ["league:read", "league:write", "members:read", "members:write", "members:pii"];

/** Sends a form, and sends it again each time the site answers 307, as a browser does. */
async function send(coach: ReturnType<typeof browser>, path: string, form: Record<string, string> = {}) {
  for (let hop = 0; hop < 20; hop++) {
    const r = await coach.post(path, form);
    if (r.status !== 307) return r;
    assert.equal(r.location, path);
  }
  throw new Error(`${path} kept asking to be sent again`);
}

test("an administrator key signs the coach in with a scoped 90-day key for this browser, never stored itself", async (t) => {
  const f = await websiteFixture(t); const coach = browser(f);
  const start = await coach.get("/coach");
  assert.equal(start.status, 200); assert.match(start.html, /Coach sign-in/);
  assert.equal(start.headers.get("cache-control"), "no-store");
  assert.match(start.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
  const signedIn = await coach.post("/coach/sign-in", { key: ` ${f.admin} ` });
  assert.equal(signedIn.status, 303); assert.equal(signedIn.location, "/coach");
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/coach", `Max-Age=${90 * 86400}`]) {
    assert.ok(coach.lastSetCookie().includes(flag), flag);
  }
  const stored = coach.session(); assert.match(stored, /^dl_/); assert.notEqual(stored, f.admin);
  const me = (await f.api("/v1/me", stored)).body;
  assert.deepEqual(me.credential.scopes, BROWSER_SCOPES);
  const made = (await f.api("/v1/api-keys", f.admin)).body.data.find((k: { id: string }) => k.id === me.credential.id);
  assert.match(made.name, /^Coach website, \d{4}-\d{2}-\d{2}$/);
  const days = (Date.parse(made.expires_at) - Date.now()) / 86_400_000;
  assert.ok(days > 89.9 && days <= 90, `expires in ${days} days`);
  const page = await coach.get("/coach");
  assert.equal(page.status, 200); assert.match(page.html, /No season is running/);
  assert.match(page.html, /<a href="\/coach" aria-current="page">Dashboard<\/a>/);
  assert.ok(!page.html.includes(f.admin) && !page.html.includes(stored));
});

test("the coach makes a player's sign-in link, which signs the player in once, with no email set up", async (t) => {
  const f = await websiteFixture(t);
  await f.configure({ MAIL_PROVIDER: "", MAIL_FROM: "", RESEND_API_KEY: "" });
  const sam = await f.create("/v1/members", { display_name: "Sam" });
  const aaron = await f.create("/v1/members", { display_name: "Aaron" });
  const aaronLink = (await f.api(`/v1/members/${aaron.id}/login-link`, f.admin, "POST")).body.token;
  assert.equal((await f.api("/v1/session", aaronLink, "POST")).status, 201);
  const gone = await f.create("/v1/members", { display_name: "Gone" });
  assert.equal((await f.api(`/v1/members/${gone.id}`, f.admin, "DELETE")).status, 204);
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const list = await coach.get("/coach/members");
  assert.match(list.html, /Sam/); assert.doesNotMatch(list.html, /Gone/);
  assert.match(list.html, /1 of 2 signed in/); assert.match(list.html, /Not signed in yet/);
  assert.ok(list.html.indexOf("Sam") < list.html.indexOf("Aaron"), "who still needs a link comes first");
  assert.match(list.html, new RegExp(`action="/coach/members/${sam.id}/sign-in-link"`));
  const made = await coach.post(`/coach/members/${sam.id}/sign-in-link`);
  assert.equal(made.status, 200); assert.match(made.html, /Sign-in link for Sam/); assert.match(made.html, /within 72 hours/);
  const token = /https:\/\/league\.test\/login\?token=([A-Za-z0-9_-]+)/.exec(made.html)?.[1]; assert.ok(token);
  const expires = Number(await f.db.prepare("SELECT expires_at FROM access_grant WHERE kind = 'login_link'").first("expires_at"));
  assert.ok(expires > Date.now() + 71.9 * 3_600_000 && expires <= Date.now() + 72 * 3_600_000, "a coach's link lasts 72 hours");
  const player = browser(f);
  assert.equal((await player.get(`/login?token=${token}`)).status, 200);
  assert.equal((await player.post("/login/confirm", { token })).status, 303);
  assert.match((await player.get("/")).html, /Hello, Sam/);
  assert.equal((await browser(f).post("/login/confirm", { token })).status, 401, "a link works once");
  const after = await coach.get("/coach/members");
  assert.match(after.html, /2 of 2 signed in/); assert.doesNotMatch(after.html, /Not signed in yet/);
  // When, on the club's clock.
  const timezone = (await f.api("/v1/me", f.admin)).body.club.timezone;
  const now = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: timezone });
  assert.match(after.html, new RegExp(`Signed in ${now}, \\d{2}:\\d{2}`));
  assert.equal((await coach.post(`/coach/members/${gone.id}/sign-in-link`)).status, 404);
  assert.equal(f.outbox.length, 0); assert.equal(f.outgoing.length, 0);
});

test("coach sign-in refuses other credentials and other sites; a revoked key or signing out forgets it", async (t) => {
  const f = await websiteFixture(t); const coach = browser(f);
  assert.equal((await coach.post("/coach/sign-in", { key: "not a key" })).status, 400);
  assert.equal((await coach.post("/coach/sign-in", { key: "dl_" + "x".repeat(43) })).status, 401);
  const readOnly = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Reader", scopes: ["league:read", "members:read"] })).body.key;
  const refused = await coach.post("/coach/sign-in", { key: readOnly });
  assert.equal(refused.status, 403); assert.match(refused.html, /cannot read and change the league, list members or make sign-in links/);
  const noWrite = (await f.api("/v1/api-keys", f.admin, "POST", { name: "No write", scopes: ["league:read", "members:read", "members:write"] })).body.key;
  assert.equal((await coach.post("/coach/sign-in", { key: noWrite })).status, 403, "the Season tab writes the league, so the key needs league:write");
  assert.equal(coach.session(), "", "no cookie for a refused key");
  const agent = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Agent", scopes: ["league:read", "league:write", "members:read", "members:write"] })).body.key;
  assert.equal((await coach.post("/coach/sign-in", { key: agent }, "https://evil.invalid")).status, 403);
  const keys = async () => (await f.api("/v1/api-keys", f.admin)).body.data.length as number;
  const before = await keys();
  assert.equal((await coach.post("/coach/sign-in", { key: agent })).status, 303);
  assert.equal(coach.session(), agent, "a coach key without admin is kept as it is");
  assert.equal(await keys(), before, "and no key is made for it");
  const id = (await f.api("/v1/me", agent)).body.credential.id;
  assert.equal((await f.api(`/v1/api-keys/${id}/revoke`, f.admin, "POST")).status, 200);
  const revoked = await coach.get("/coach");
  assert.match(revoked.html, /Coach sign-in/); assert.match(coach.lastSetCookie(), /Max-Age=0/);
  assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  assert.equal((await coach.post("/coach/sign-out")).status, 303);
  assert.match((await coach.get("/coach")).html, /Coach sign-in/);
});

test("the coach's pages show the sample league: progress, disputes, waiting results and who to chase", async (t) => {
  const f = await websiteFixture(t, { sample: true, sample_email: "alex@example.org" });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);

  const home = await coach.get("/coach");
  assert.equal(home.status, 200);
  assert.match(home.html, /<h1>Sample season<\/h1>/); assert.match(home.html, /Results close in \d+ days/);
  assert.match(home.html, /2 results disputed, 1 result waiting on the other side/);
  for (const name of ["Sample singles", "Sample doubles", "Division 1", "Division 3"]) assert.match(home.html, new RegExp(name));
  assert.match(home.html, /played \(\d+%\)/);
  // Not playing next season: opted out, or a doubles player who told the coach they are not playing.
  const optedOut = (await f.db.prepare(`SELECT e.competition_id, count(*) AS n FROM entry e WHERE e.opted_out_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM partner_choice pc JOIN entry_member em ON em.member_id = pc.member_id
      WHERE em.entry_id = e.id AND pc.competition_id = e.competition_id AND pc.choice = 'leaving')
    GROUP BY e.competition_id`).all<{ n: number }>()).results;
  assert.deepEqual([...home.html.matchAll(/<strong>(\d+)<\/strong> opted out of next season: /g)].map((m) => Number(m[1])).sort(),
    optedOut.map((x) => x.n).sort(), "how many opted out of each competition");
  assert.match(home.html, /Next season is not drafted yet/);

  const results = await coach.get("/coach/results");
  assert.equal(results.status, 200);
  assert.match(results.html, /Disputed \(2\)/); assert.match(results.html, /Waiting on the other side \(1\)/);
  assert.match(results.html, /Sample \w+ says/); assert.doesNotMatch(results.html, /side [01] says/);
  assert.match(results.html, /has not answered in/);
  assert.doesNotMatch(results.html, /Not played by the deadline/, "reporting is still open");

  const chase = await coach.get("/coach/chase");
  assert.equal(chase.status, 200);
  assert.match(chase.html, /Sample singles · Division 1/); assert.match(chase.html, /to play|to confirm/);
  assert.match(chase.html, /href="mailto:\?bcc=alex%40example\.org"/);
  const soon = await coach.get("/coach/chase?within_days=14");
  assert.match(soon.html, /Nobody has anything outstanding in a competition whose deadline is within 14 days/);
  assert.match(soon.html, /href="\/coach\/chase\?within_days=14" aria-current="page"/);

  const members = await coach.get("/coach/members");
  assert.match(members.html, /0 of 22 signed in/);

  // Once the deadline passes, the matches nobody played are the coach's to settle.
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin, "PATCH", { results_deadline_at: past })).status, 200);
  const closed = await coach.get("/coach/results");
  assert.match(closed.html, /Not played by the deadline \(2\)/);
  assert.match((await coach.get("/coach")).html, /Results are closed/);
});

test("the coach's pages send a signed-out browser to sign in", async (t) => {
  const f = await websiteFixture(t);
  for (const path of ["/coach/results", "/coach/tables", "/coach/activity", "/coach/activity/all", "/coach/chase", "/coach/members",
    "/coach/season", "/coach/weather"]) {
    const r = await browser(f).get(path);
    assert.equal(r.status, 303, path); assert.equal(r.location, "/coach");
  }
});

test("the results page reads at most twelve matches in full and lists the rest by name", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  // The sample's season is nearly over: a round robin of six more gives fifteen more matches to report.
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const extra = await f.create("/v1/competitions", { season_id: season.id, name: "Extra", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak" });
  const division = await f.create(`/v1/competitions/${extra.id}/divisions`, {});
  for (const m of (await f.api("/v1/members?limit=6", f.admin)).body.data) {
    await f.create(`/v1/competitions/${extra.id}/entries`, { division_id: division.id, member_ids: [m.id] });
  }
  assert.equal((await f.api(`/v1/divisions/${division.id}/fixtures`, f.admin, "POST")).status, 200);
  assert.equal((await f.api(`/v1/competitions/${extra.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  const open = (await f.api("/v1/matches?status=open&limit=200", f.admin)).body.data as { id: string }[];
  assert.equal(open.length, 17);
  for (const m of open) {
    const r = await f.api(`/v1/matches/${m.id}/claims`, f.admin, "POST",
      { side: 0, outcome: "completed", score: { sets: [{ games: [6, 4] }, { games: [6, 3] }] } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const page = await coach.get("/coach/results");
  assert.equal(page.status, 200);
  assert.match(page.html, /Disputed \(2\)/); assert.match(page.html, /Waiting on the other side \(18\)/);
  assert.equal(page.html.match(/has not answered in/g)?.length, 10);
  assert.match(page.html, /And 8 more/); assert.equal(page.html.match(/Waiting on the other side since/g)?.length, 8);
});

test("activity shows the latest ten results and ten events, with fifty more a page behind each", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const agent = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Claude agent", scopes: ["league:read", "league:write"] })).body.key;
  const open = (await f.api("/v1/matches?status=open&limit=1", f.admin)).body.data[0];
  assert.equal((await f.api(`/v1/matches/${open.id}/settle`, agent, "POST",
    { outcome: "completed", score: { sets: [{ games: [6, 1] }, { games: [6, 2] }] } })).status, 201);
  const [a, b] = open.sides.map((s: { label: string }) => s.label);
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);

  const page = await coach.get("/coach/activity");
  assert.equal(page.status, 200);
  const [results, events] = page.html.split("Everything that happened");
  assert.equal(results!.match(/<li class="answer">/g)?.length, 10);
  assert.ok(results!.indexOf(`${a} beat ${b} 6-1, 6-2`) > 0, "the result just settled is first");
  assert.match(results!, /href="\/coach\/activity\/results"/);
  assert.equal(events!.match(/<li class="answer">/g)?.length, 10);
  assert.match(events!, new RegExp(`Claude agent settled ${a} v ${b}`)); assert.match(events!, /Claude agent/);
  assert.match(events!, /href="\/coach\/activity\/all"/);

  const allResults = await coach.get("/coach/activity/results");
  assert.equal(allResults.html.match(/<li class="answer">/g)?.length, 46); assert.doesNotMatch(allResults.html, /Show the next 50/);
  const first = await coach.get("/coach/activity/all");
  assert.equal(first.html.match(/<li class="answer">/g)?.length, 50);
  const next = /href="(\/coach\/activity\/all\?after=[^"]+)"/.exec(first.html)?.[1]; assert.ok(next);
  const second = await coach.get(next);
  assert.equal(second.status, 200); assert.equal(second.html.match(/<li class="answer">/g)?.length, 50);
  assert.match(second.html, /Back to the newest/);
  for (const path of ["/coach/activity/all?after=nonsense", "/coach/activity/results?after=1.2"]) {
    assert.equal((await coach.get(path)).status, 200, `${path}: a mangled cursor starts from the newest`);
  }
});

test("a browser still holding a key without league:read, from before these pages, is sent to sign in again", async (t) => {
  const f = await websiteFixture(t);
  const old = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Old coach key", scopes: ["members:read", "members:write"] })).body.key;
  const r = await f.request("/coach", { headers: { cookie: `deuceleague_coach=${old}` } });
  assert.equal(r.status, 200); assert.match(await r.text(), /Coach sign-in/);
  assert.match(r.headers.get("set-cookie") ?? "", /Max-Age=0/, "the cookie is forgotten");
});

test("the coach sees the tables as players do, for the competitions open to them", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const draft = await f.create("/v1/competitions", { season_id: season.id, name: "Next singles", discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);

  const first = await coach.get("/coach/tables");
  assert.equal(first.status, 303); assert.match(first.location!, /^\/coach\/tables\/[0-9a-f-]{36}$/);
  const page = await coach.get(first.location!);
  assert.equal(page.status, 200);
  assert.match(page.html, /<a href="\/coach\/tables" aria-current="page">Tables<\/a>/);
  assert.match(page.html, /What players see/);
  for (const text of ["Division 1", "Division 2", "Sample season · Results close in", "row-toggle"]) {
    assert.ok(page.html.includes(text), text);
  }
  assert.doesNotMatch(page.html, /Weather at the courts/, "the forecast is on the Weather tab");
  const tabs = [...page.html.matchAll(/href="\/coach\/tables\/([0-9a-f-]{36})"/g)].map((m) => m[1]);
  assert.equal(new Set(tabs).size, 2, "both sample competitions, and not the draft");
  assert.ok(!tabs.includes(draft.id));
  assert.doesNotMatch(page.html, /href="\/matches\/|\(yours\)|action="\/entries/, "nothing that is a player's own");
  assert.equal((await coach.get(`/coach/tables/${draft.id}`)).status, 404, "players can't see a draft");
});

test("the coach adds, renames, moves and removes the forecast's courts, and sets its units", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const courts = async () => (await f.api("/v1/weather", f.admin)).body;

  const page = await coach.get("/coach/weather");
  assert.equal(page.status, 200);
  assert.match(page.html, /<a href="\/coach\/weather" aria-current="page">Weather<\/a>/);
  assert.match(page.html, /Courts \(2 of 8\)/); assert.match(page.html, /Wimbledon Park \(sample\)/);
  assert.match(page.html, /Weather at the courts/, "the forecast as players see it");
  assert.ok(page.html.indexOf("Weather at the courts") < page.html.indexOf("Courts (2 of 8)"), "above the courts it is for");
  const sample = (await courts()).court_locations as { id: string; name: string }[];
  for (const c of sample) {
    assert.match(page.html, new RegExp(`action="/coach/weather/courts/${c.id}"`));
    assert.match(page.html, new RegExp(`action="/coach/weather/courts/${c.id}/delete"`));
  }

  const added = await coach.post("/coach/weather/courts", { name: " Club courts ", coordinates: "51.5074, −0.1278" });
  assert.equal(added.status, 303); assert.match(added.location!, /^\/coach\/weather\?done=added#court-[0-9a-f-]{36}$/);
  const made = (await courts()).court_locations.find((c: { name: string }) => c.name === "Club courts");
  assert.deepEqual([made.latitude, made.longitude], [51.5074, -0.1278]);
  assert.match((await coach.get(added.location!)).html, /Court added/);

  const moved = await coach.post(`/coach/weather/courts/${made.id}`, { name: "Home courts", coordinates: "40.7128 -74.006" });
  assert.equal(moved.status, 303);
  const now = (await courts()).court_locations.find((c: { id: string }) => c.id === made.id);
  assert.deepEqual([now.name, now.latitude, now.longitude], ["Home courts", 40.7128, -74.006]);

  for (const [coordinates, why] of [["here", /as a map gives them/], ["151.5, -0.1278", /right way round/]] as const) {
    const refused = await coach.post(`/coach/weather/courts/${made.id}`, { name: "Kept", coordinates });
    assert.equal(refused.status, 400); assert.match(refused.html, why);
    assert.match(refused.html, new RegExp(`value="${coordinates}"`), "what the coach typed stays to correct");
  }
  assert.equal((await coach.post("/coach/weather/courts", { name: " ", coordinates: "1, 1" })).status, 400);
  // A court made through the API so close to the meridian that it shows as "1e-7" still saves as shown.
  const tiny = await f.create("/v1/court-locations", { name: "Meridian", latitude: 51.4779, longitude: 0.0000001 });
  const shown = /name="coordinates"[^>]*value="([^"]+)"/.exec((await coach.get("/coach/weather")).html.split(`court-${tiny.id}`)[1]!)?.[1];
  assert.equal(shown, "51.4779, 1e-7");
  assert.equal((await coach.post(`/coach/weather/courts/${tiny.id}`, { name: "Greenwich", coordinates: shown })).status, 303);
  assert.equal((await courts()).court_locations.find((c: { id: string }) => c.id === tiny.id).longitude, 0.0000001);
  assert.equal((await f.api(`/v1/court-locations/${tiny.id}`, f.admin, "DELETE")).status, 204);
  assert.equal((await courts()).court_locations.length, 3, "nothing refused was kept");

  for (let i = 4; i <= 8; i++) {
    assert.equal((await coach.post("/coach/weather/courts", { name: `Court ${i}`, coordinates: `${i}, ${i}` })).status, 303);
  }
  const full = await coach.get("/coach/weather");
  assert.match(full.html, /Courts \(8 of 8\)/); assert.doesNotMatch(full.html, /Add a court/);
  const ninth = await coach.post("/coach/weather/courts", { name: "Ninth", coordinates: "9, 9" });
  assert.equal(ninth.status, 400); assert.match(ninth.html, /already has eight courts/);

  const removed = await coach.post(`/coach/weather/courts/${made.id}/delete`);
  assert.equal(removed.status, 303); assert.equal(removed.location, "/coach/weather?done=removed");
  assert.equal((await coach.post(`/coach/weather/courts/${made.id}/delete`)).status, 303, "removing twice is no error");
  assert.equal((await coach.post(`/coach/weather/courts/${made.id}`, { name: "Gone", coordinates: "1, 1" })).location,
    "/coach/weather?done=gone");
  assert.equal((await courts()).court_locations.length, 7);

  assert.equal((await coach.post("/coach/weather/units", { units: "us" })).status, 303);
  assert.equal((await courts()).units, "us");
  assert.match((await coach.get("/coach/weather")).html, /<option value="us" selected="">/);
  assert.equal((await coach.post("/coach/weather/units", { units: "kelvin" })).status, 303);
  assert.equal((await courts()).units, "us", "an unknown unit changes nothing");

  const feed = await coach.get("/coach/activity/all");
  assert.match(feed.html, /Coach website, [\d-]+ added the court Court 4/);
  assert.match(feed.html, /changed the forecast settings/);
});

test("the chase list and dashboard say how many are short of the minimum, and who", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const chase = await coach.get("/coach/chase");
  assert.match(chase.html, /Short of the minimum/);
  assert.match(chase.html, /\d+ of 15 players \(\d+%\)<\/span> (is|are) short of the 4-match minimum/);
  assert.match(chase.html, /\d+ of 10 pairs \(\d+%\)<\/span> (is|are) short of the 4-match minimum/);
  assert.match(chase.html, /Played \d of 4: \d short/);
  assert.doesNotMatch((await coach.get("/coach/chase?within_days=7")).html, /Short of the minimum/, "not when no deadline is that close");
  const home = (await coach.get("/coach")).html;
  const singles = dashboardTables(home)["Sample singles"];
  assert.deepEqual(singles!.slice(0, 2), [["Division", "Matches", "Players"], ["Played", "Total", "Waiting", "Disputed", "Total", "Short", "% short"]]);
  assert.equal(dashboardTables(home)["Sample doubles"]![0]![2], "Pairs");
  assert.match(home, /<span class="tag minimum"[^>]*>Minimum 4 matches each<\/span>/, "the minimum beside the competition's name");
  const legend = home.match(/<h2>Sample singles<\/h2>[\s\S]*?<details class="legend[^"]*">([\s\S]*?)<\/details>/)![1]!;
  const terms = [...legend.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map(([, term, tip]) => [term, tip]);
  assert.deepEqual(terms.map(([term]) => term),
    ["Minimum", "Played", "Total matches", "Waiting", "Disputed", "Total players", "Short", "% short"], "a phone lists what the columns mean");
  for (const [, tip] of terms.slice(1)) assert.ok(home.includes(`data-tip="${tip}"`), `the same words as the tooltip: ${tip}`);
  const id = (await f.api("/v1/competitions", f.admin)).body.data.find((c: { name: string }) => c.name === "Sample singles").id;
  assert.deepEqual(singles!.slice(2), await expectedRows(f, id), "players, short and % short per division, and in all");
  assert.doesNotMatch(home, /short of the \d+-match minimum/, "the table replaces the sentence");
});

test("the dashboard's table follows a minimum the coach's agent sets", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const singles = (await f.api("/v1/competitions", f.admin)).body.data.find((c: { name: string }) => c.name === "Sample singles");
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  assert.deepEqual(dashboardTables((await coach.get("/coach")).html)["Sample singles"]!.slice(2), await expectedRows(f, singles.id));
  assert.doesNotMatch((await coach.get("/coach")).html, /name="minimum"/, "the minimum is the agent's to set");
  for (const minimum of [2, 0]) {
    const rules = (await f.api(`/v1/competitions/${singles.id}`, f.admin)).body.rules;
    assert.equal((await f.api(`/v1/competitions/${singles.id}`, f.admin, "PATCH", { rules: { ...rules, minMatchesToPlay: minimum } })).status, 200);
    const home = (await coach.get("/coach")).html;
    assert.deepEqual(dashboardTables(home)["Sample singles"]!.slice(2), await expectedRows(f, singles.id), `minimum ${minimum}`);
    assert.match(home, minimum ? /Minimum 2 matches each/ : /No minimum/);
  }
  assert.equal((await coach.post(`/coach/competitions/${singles.id}/minimum`, { minimum: "5" })).status, 404, "no setting on the coach's site");
});

test("a draft offers only newcomers who suit its category by recorded gender, and members who left are not offered", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const members = (await f.api("/v1/members?limit=200", f.admin)).body.data as { id: string; display_name: string }[];
  const id = (name: string) => members.find((m) => m.display_name === `Sample ${name}`)!.id;
  const setGender = async (name: string, gender: string | null) =>
    assert.equal((await f.api(`/v1/members/${id(name)}`, f.admin, "PATCH", { gender })).status, 200);
  await setGender("Umi", "female"); await setGender("Val", "male"); await setGender("Parker", null);

  // On the members page the newcomers are waiting to be placed: they are in no running competition.
  const waiting = (await coach.get("/coach/members")).html.split("Waiting to be placed")[1]!.split("On the club")[0]!;
  for (const name of ["Umi", "Val"]) assert.match(waiting, new RegExp(`Sample ${name}`));
  assert.doesNotMatch(waiting, /Sample Parker/, "Parker plays doubles");

  await send(coach, `/coach/season/${season.id}/end`, { leave: "yes" });
  await send(coach, "/coach/season/next", { from: season.id, name: "Sample season 2", starts_on: "2026-10-01", ends_on: "2026-11-30" });
  const drafts = (await f.api("/v1/competitions?state=draft", f.admin)).body.data as { id: string; discipline: string }[];
  const singles = drafts.find((x) => x.discipline === "singles")!; const doubles = drafts.find((x) => x.discipline === "doubles")!;
  const text = (html: string, heading: string) => html.split(heading)[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  assert.equal((await f.api(`/v1/competitions/${singles.id}`, f.admin, "PATCH", { category: "mens" })).status, 200);
  const mens = (await coach.get(`/coach/season/drafts/${singles.id}`)).html;
  const mensNewcomers = text(mens, "Not in Sample singles last season");
  assert.match(mensNewcomers, /Sample Val/); assert.doesNotMatch(mensNewcomers, /Sample Umi/);
  assert.match(mensNewcomers, /Sample Parker Gender not recorded/, "no gender recorded: still listed, and marked");
  assert.match(mens, /Players below are those who suit a men(&#39;|')s competition/);

  assert.equal((await f.api(`/v1/competitions/${doubles.id}`, f.admin, "PATCH", { category: "mixed" })).status, 200);
  const mixed = (await coach.get(`/coach/season/drafts/${doubles.id}`)).html;
  const select = (name: string) => new RegExp(`<select id="${name}"[^>]*>([\\s\\S]*?)</select>`).exec(mixed)![1]!;
  assert.match(select("member"), /Sample Umi/); assert.doesNotMatch(select("member"), /Sample Val/);
  assert.match(select("partner"), /Sample Val/); assert.doesNotMatch(select("partner"), /Sample Umi/);
  assert.match(mixed, /<label for="member">Woman<\/label>/); assert.match(mixed, /<label for="partner">Man<\/label>/);

  // Someone who has left is offered nowhere, and cannot be entered.
  assert.equal((await coach.post(`/coach/members/${id("Val")}/left`)).status, 303);
  assert.doesNotMatch(text((await coach.get(`/coach/season/drafts/${singles.id}`)).html, "Not in Sample singles last season"), /Sample Val/);
  const division = (await f.api(`/v1/competitions/${singles.id}/divisions`, f.admin)).body.data[0].id;
  assert.equal((await f.api(`/v1/competitions/${singles.id}/entries`, f.admin, "POST", { division_id: division, member_ids: [id("Val")] })).status, 400);
});

test("the coach sees this season's disputes with both claims, and who keeps ending up in them, across seasons", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  // A second competition with the same two players, so each has been in two disputes by the end.
  const second = await f.create("/v1/competitions", { season_id: p.season.id, name: "Cup", discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  const division = await f.create(`/v1/competitions/${second.id}/divisions`, {});
  for (const member of p.members) await f.create(`/v1/competitions/${second.id}/entries`, { division_id: division.id, member_ids: [member.id] });
  const fixtures = await f.api(`/v1/divisions/${division.id}/fixtures`, f.admin, "POST"); assert.equal(fixtures.status, 200);
  assert.equal((await f.api(`/v1/competitions/${second.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  const cup = fixtures.body.created[0].match_id as string;
  const win = { outcome: "completed", score: { sets: [{ games: [6, 1] }, { games: [6, 1] }] } };
  const lose = { outcome: "completed", score: { sets: [{ games: [1, 6] }, { games: [1, 6] }] } };
  for (const match of [p.match, cup]) {
    assert.equal((await f.api(`/v1/matches/${match}/claims`, f.admin, "POST", { side: 0, ...win })).status, 201);
    assert.equal((await f.api(`/v1/matches/${match}/claims`, f.admin, "POST", { side: 1, ...lose })).status, 201);
  }
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const open = await coach.get("/coach/results");
  assert.match(open.html, /Disputed \(2\)/);
  assert.match(text(open.html), /Sam says [^]*? Alex says/, "both claims side by side");
  assert.match(open.html, /<div class="muted">\d{1,2} \w{3}[^<]*\d{2}:\d{2}[^<]*<\/div>/, "and when each was made");
  assert.match(text(open.html), /Open a match to inspect its history and make a coach decision/);
  assert.match(open.html, new RegExp(`href="/coach/matches/${p.match}"`));
  assert.match(text(open.html), /Players in 2 or more disputes/);
  assert.match(text(open.html), /Sam · 2 disputes: 2 this season, 0 earlier/);
  assert.match(text(open.html), /Sam · 2 disputes: 2 this season, 0 earlier\s+2 still open/);

  // Alex corrects their independent submission to the agreed score.
  const claim = (await f.api(`/v1/matches/${p.match}`, f.admin)).body.claims.find((c: any) => c.side === 0 && c.state === "pending").id;
  assert.equal((await f.api(`/v1/matches/${p.match}/claims`, f.admin, "POST", { side: 1, outcome: "completed", score: (await f.api(`/v1/matches/${p.match}`, f.admin)).body.claims.find((c: any) => c.id === claim).score })).status, 201);
  const mixed = text((await coach.get("/coach/results")).html);
  assert.match(mixed, /Sam · 2 disputes: 2 this season, 0 earlier the other gave way in 1 · 1 still open/);
  assert.match(mixed, /Alex · 2 disputes: 2 this season, 0 earlier gave way in 1 · 1 still open/);
  assert.match(mixed, /Disputed \(1\)/);

  // The season ends: its loose ends are no longer listed, but the history keeps them, as earlier.
  for (const id of [p.comp.id, second.id]) assert.equal((await f.api(`/v1/competitions/${id}`, f.admin, "PATCH", { state: "complete" })).status, 200);
  assert.equal((await f.api(`/v1/seasons/${p.season.id}`, f.admin, "PATCH", { state: "complete" })).status, 200);
  const ended = await coach.get("/coach/results");
  assert.match(ended.html, /Disputed \(0\)/); assert.match(ended.html, /No disputes/);
  assert.match(text(ended.html), /Sam · 2 disputes: 0 this season, 2 earlier/);
});

test("a draft shows the promotion and relegation places left empty, with a one-click fill, and says how entries were moved", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  await send(coach, `/coach/season/${season.id}/end`, { leave: "yes" });
  await send(coach, "/coach/season/next", { from: season.id, name: "Sample season 2", starts_on: "2026-10-01", ends_on: "2026-11-30" });
  const singles = (await f.api("/v1/competitions?state=draft", f.admin)).body.data.find((x: { discipline: string }) => x.discipline === "singles");
  const divisions = (await f.api(`/v1/competitions/${singles.id}/divisions`, f.admin)).body.data as { id: string; ordinal: number }[];
  const entries = async () => (await f.api(`/v1/competitions/${singles.id}/entries`, f.admin)).body.data as
    { id: string; label: string; division_id: string; placement_reason: string }[];
  const text = (html: string) => html.replace(/<form[\s\S]*?<\/form>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const vacancy = "A relegation place down to Division 2 is unfilled: \\d\\w\\w in Division 1 \\(Sample Gray\\) is not carried over " +
    "\\(opted out of the next competition\\)\\. Suggested instead: \\d\\w\\w in Division 1, (Sample \\w+)\\.";

  // Gray, in a relegation place of Division 1, opted out: the place is left empty, not passed up to the one above, and the worst carried entry is suggested.
  const page = (await coach.get(`/coach/season/drafts/${singles.id}`)).html;
  assert.match(text(page), new RegExp(vacancy));
  assert.match(text(page), /Division 1 · \d players of 5/);
  assert.match(text(page), /Only \d players: a division needs at least 5 for everyone to be able to play the 4-match minimum/);
  const suggested = new RegExp(vacancy).exec(text(page))![1]!;
  const emery = (await entries()).find((e) => e.label === suggested)!;
  assert.equal(emery.placement_reason, "held");
  assert.match(page, new RegExp(`action="/coach/season/entries/${emery.id}/move"[^]*?name="reason" value="relegated"`));

  // One click takes the suggestion: the engine's own reason, and the place is no longer empty.
  assert.equal((await coach.post(`/coach/season/entries/${emery.id}/move`,
    { draft: singles.id, division_id: divisions[1]!.id, reason: "relegated" })).status, 303);
  const taken = (await entries()).find((e) => e.id === emery.id)!;
  assert.equal(taken.division_id, divisions[1]!.id); assert.equal(taken.placement_reason, "relegated");
  assert.doesNotMatch(text((await coach.get(`/coach/season/drafts/${singles.id}`)).html), /A relegation place down to Division 2 is unfilled/);

  // Take out one of the entries the engine relegated: its place opens, named for it, and the suggestion already
  // taken is not offered again.
  const relegated = (await entries()).find((e) => e.placement_reason === "relegated" && e.id !== emery.id && e.division_id === divisions[1]!.id)!;
  assert.equal((await coach.post(`/coach/season/entries/${relegated.id}/remove`, { draft: singles.id })).status, 303);
  const opened = text((await coach.get(`/coach/season/drafts/${singles.id}`)).html);
  assert.match(opened, new RegExp(`A relegation place down to Division 2 is unfilled: ${relegated.label}, who was relegated, is no longer there\\.`));
  assert.doesNotMatch(opened, /Gray\) is not carried over/, "the place Gray left was filled, by the suggestion");
  assert.equal((await entries()).find((e) => e.id === emery.id)!.division_id, divisions[1]!.id);

  // Anyone else the coach moves by hand is described as moved by the coach, and from where.
  const drew = (await entries()).find((e) => e.placement_reason === "held" && e.division_id === divisions[0]!.id)!;
  assert.equal((await coach.post(`/coach/season/entries/${drew.id}/move`, { draft: singles.id, division_id: divisions[2]!.id })).status, 303);
  assert.equal((await entries()).find((e) => e.id === drew.id)!.placement_reason, "manual");
  const moved = text((await coach.get(`/coach/season/drafts/${singles.id}`)).html);
  assert.match(moved, new RegExp(`${drew.label} Moved by coach · moved by coach from \\d\\w\\w in Division 1`));
});

test("a season with a competition not yet started cannot be ended from the Season tab", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const running = (await f.api("/v1/competitions?state=active", f.admin)).body.data[0];
  const draft = await f.api("/v1/competitions", f.admin, "POST", { season_id: season.id, name: "Late singles", discipline: "singles",
    match_format: running.match_format, previous_competition_id: running.id });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  for (const r of [await coach.get(`/coach/season/${season.id}/end`), await coach.post(`/coach/season/${season.id}/end`)]) {
    assert.equal(r.status, 400); assert.match(r.html, /Late singles not started/);
  }
  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin)).body.state, "active");
  assert.equal((await f.api(`/v1/competitions/${running.id}`, f.admin)).body.state, "active");
});

test("the coach ends the sample season early and starts the next from its final tables", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const competitions = async () => (await f.api("/v1/competitions", f.admin)).body.data as
    { id: string; name: string; season_id: string; state: string; discipline: string; previous_competition_id: string | null }[];

  const page = await coach.get("/coach/season");
  assert.equal(page.status, 200); assert.match(page.html, /<h2>Sample season<\/h2>/);
  assert.match(page.html, /5 matches still to be played or agreed/);
  assert.match(page.html, new RegExp(`href="/coach/season/${season.id}/end"`));
  assert.match(page.html, /<a href="\/coach\/season" aria-current="page">Season<\/a>/);

  const confirm = await coach.get(`/coach/season/${season.id}/end`);
  assert.match(confirm.html, /End Sample season now\?/); assert.match(confirm.html, /Reporting closes now, before the deadline/);
  // The results never agreed are listed, each linked to decide, apart from the matches nobody entered.
  const loose = [...(await f.api("/v1/matches?status=disputed", f.admin)).body.data,
    ...(await f.api("/v1/matches?status=reported", f.admin)).body.data] as { id: string }[];
  assert.ok(loose.length > 0 && loose.length < 5, "the sample has some of each");
  for (const m of loose) assert.match(confirm.html, new RegExp(`href="/coach/matches/${m.id}"`));
  assert.match(confirm.html, new RegExp(`${loose.length} results? never agreed`));
  assert.match(confirm.html, new RegExp(`<strong>${5 - loose.length} match(es)?</strong> nobody entered a result for will count as unplayed`));
  assert.match(confirm.html, /name="leave" value="yes" required/);
  assert.match(confirm.html, /Sample singles: Sample Gray, Sample Morgan opted out of next season/);
  // Ending without saying to leave them undecided changes nothing.
  const refused = await send(coach, `/coach/season/${season.id}/end`);
  assert.equal(refused.status, 400); assert.match(refused.html, /tick the box to leave them undecided/);
  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin)).body.state, "active");
  const ended = await send(coach, `/coach/season/${season.id}/end`, { leave: "yes" });
  assert.equal(ended.status, 303); assert.equal(ended.location, "/coach/season");
  const after = (await f.api(`/v1/seasons/${season.id}`, f.admin)).body;
  assert.equal(after.state, "complete"); assert.ok(Date.parse(after.results_deadline_at) <= Date.now());
  assert.deepEqual((await competitions()).map((x) => x.state), ["complete", "complete"]);
  assert.equal((await send(coach, `/coach/season/${season.id}/end`)).status, 303, "ending it again changes nothing");
  // Afterwards they stay findable from the Season page.
  const closed = await coach.get("/coach/season");
  assert.match(closed.html, /How Sample season closed/);
  for (const m of loose) assert.match(closed.html, new RegExp(`href="/coach/matches/${m.id}"`));

  const start = await coach.get("/coach/season");
  assert.match(start.html, /Sample season has ended/); assert.match(start.html, /value="Sample season 2"/);
  const form = { from: season.id, name: "Sample season 2", starts_on: "2026-10-01", ends_on: "2026-11-30" };
  assert.match((await coach.post("/coach/season/next", { ...form, ends_on: "2026-09-01" })).html, /the last on or after the first/);
  const next = await send(coach, "/coach/season/next", form);
  assert.equal(next.status, 303); assert.equal(next.location, "/coach/season");
  assert.equal((await send(coach, "/coach/season/next", form)).status, 303, "sent twice, it makes nothing twice");
  const planned = (await f.api("/v1/seasons?state=planning", f.admin)).body.data;
  assert.equal(planned.length, 1); assert.equal(planned[0].name, "Sample season 2");
  // Results close at the end of the last day, on the club's clock (London, on GMT then).
  assert.equal(planned[0].results_deadline_at, "2026-11-30T23:59:59.000Z");
  const drafts = (await competitions()).filter((x) => x.season_id === planned[0].id);
  assert.deepEqual(drafts.map((x) => [x.name, x.state]).sort(), [["Sample doubles", "draft"], ["Sample singles", "draft"]]);
  const singles = drafts.find((x) => x.discipline === "singles")!; const doubles = drafts.find((x) => x.discipline === "doubles")!;

  const preparing = await coach.get("/coach/season");
  assert.match(preparing.html, /Being prepared/); assert.doesNotMatch(preparing.html, /Start next season<\/h2>/);
  assert.match(preparing.html, new RegExp(`href="/coach/season/drafts/${singles.id}"`));

  // The singles draft: placed from the tables, with who was left out and who else could play.
  const draft = await coach.get(`/coach/season/drafts/${singles.id}`);
  assert.equal(draft.status, 200);
  assert.match(draft.html, /↑ Promoted/); assert.match(draft.html, /↓ Relegated/); assert.match(draft.html, /Held/);
  assert.match(draft.html, /Not carried over from last season/);
  assert.match(draft.html, /Sample Gray<br\/><span class="muted">Opted out of next season/);
  assert.match(draft.html, /Not in Sample singles last season/);
  const newcomers = draft.html.split("Not in Sample singles last season")[1]!;
  for (const name of ["Parker", "Umi", "Val"]) assert.match(newcomers, new RegExp(`Sample ${name}`));
  const entries = async (id: string) => (await f.api(`/v1/competitions/${id}/entries`, f.admin)).body.data as
    { id: string; label: string; division_id: string; placement_reason: string; members: { id: string }[] }[];
  const divisions = (await f.api(`/v1/competitions/${singles.id}/divisions`, f.admin)).body.data as { id: string; ordinal: number }[];
  const members = (await f.api("/v1/members?limit=200", f.admin)).body.data as { id: string; display_name: string }[];
  const id = (name: string) => members.find((m) => m.display_name === `Sample ${name}`)!.id;
  assert.equal((await coach.post(`/coach/season/drafts/${singles.id}/entries`, { member: id("Umi"), division_id: divisions[2]!.id })).status, 303);
  const umi = (await entries(singles.id)).find((e) => e.label === "Sample Umi")!;
  assert.equal(umi.placement_reason, "new"); assert.equal(umi.division_id, divisions[2]!.id);
  const again = await coach.post(`/coach/season/drafts/${singles.id}/entries`, { member: id("Umi"), division_id: divisions[0]!.id });
  assert.equal(again.status, 409); assert.match(again.html, /already in this competition/);
  // Moved up, then taken out: taken out, they are listed as left out, and can be added back.
  assert.equal((await coach.post(`/coach/season/entries/${umi.id}/move`, { draft: singles.id, division_id: divisions[1]!.id })).status, 303);
  assert.equal((await entries(singles.id)).find((e) => e.id === umi.id)!.division_id, divisions[1]!.id);
  const drew = (await entries(singles.id)).find((e) => e.label === "Sample Drew")!;
  assert.equal((await coach.post(`/coach/season/entries/${drew.id}/remove`, { draft: singles.id })).status, 303);
  const without = await coach.get(`/coach/season/drafts/${singles.id}`);
  assert.match(without.html, /Sample Drew<br\/><span class="muted">Taken out of the draft/);
  assert.match(without.html, /Sample Casey<br\/><span class="muted">Played 3 of the 4 matches needed to keep a place/);
  // Short only because a match was never played, which the draft says, and against whom.
  assert.match(without.html, /Sample Casey<br\/><span class="muted">Played 3 of the 4 matches needed to keep a place\. Short only because 1 match was never played \(against Sample \w+\)/);
  const gray = (await f.api(`/v1/competitions/${singles.previous_competition_id}/entries`, f.admin)).body.data
    .find((e: { label: string }) => e.label === "Sample Gray");
  assert.equal((await coach.post(`/coach/season/drafts/${singles.id}/entries`,
    { member: id("Gray"), previous_entry_id: gray.id, division_id: divisions[0]!.id })).status, 303);
  assert.equal((await entries(singles.id)).find((e) => e.label === "Sample Gray")!.placement_reason, "returning");

  // The doubles draft, with what players said about next season's partners: a pair breaking up is
  // left out saying why, an agreed pair waits to be placed, and anyone without a pair can be paired.
  const pairs = await coach.get(`/coach/season/drafts/${doubles.id}`);
  const said = pairs.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(said, /Sample Gray \/ Sample Harper Sample Harper is playing with Sample Parker/);
  assert.match(said, /Sample Sage \/ Sample Taylor Sample Taylor is not playing next season/);
  assert.match(said, /New pairs waiting .* Sample Harper \/ Sample Parker Add to/);
  assert.match(said, /Players without a pair .* Sample Indy Asked Sample Bailey, who has not agreed yet/);
  assert.match(said, /Sample Val Not in doubles last season/);
  assert.match(said, /Not playing next season Sample Taylor/);
  const doublesDivisions = (await f.api(`/v1/competitions/${doubles.id}/divisions`, f.admin)).body.data as { id: string }[];
  assert.equal((await coach.post(`/coach/season/drafts/${doubles.id}/entries`,
    { member: id("Harper"), partner: id("Parker"), division_id: doublesDivisions[0]!.id })).status, 303);
  assert.doesNotMatch((await coach.get(`/coach/season/drafts/${doubles.id}`)).html, /New pairs waiting/);
  assert.equal((await coach.post(`/coach/season/drafts/${doubles.id}/entries`,
    { member: id("Umi"), partner: id("Val"), division_id: doublesDivisions[1]!.id })).status, 303);
  assert.ok((await entries(doubles.id)).some((e) => e.label === "Sample Umi / Sample Val"));
  // A pair needs two players: the same one twice is refused with a message, not an error page.
  const itself = await coach.post(`/coach/season/drafts/${doubles.id}/entries`,
    { member: id("Gray"), partner: id("Gray"), division_id: doublesDivisions[0]!.id });
  assert.equal(itself.status, 400); assert.match(itself.html, /A pair needs two different players/);

  // Starting it draws the matches and opens the season and its competitions.
  const started = await send(coach, `/coach/season/${planned[0].id}/start`);
  assert.equal(started.status, 303); assert.equal(started.location, "/coach");
  assert.equal((await f.api(`/v1/seasons/${planned[0].id}`, f.admin)).body.state, "active");
  for (const x of drafts) {
    assert.equal((await f.api(`/v1/competitions/${x.id}`, f.admin)).body.state, "active");
    const open = (await f.api(`/v1/matches?competition_id=${x.id}&limit=200`, f.admin)).body.data;
    assert.ok(open.length > 0, `${x.name} has its matches`);
  }
  assert.equal((await coach.get(`/coach/season/drafts/${singles.id}`)).status, 404, "a started competition is no draft");
  // A form left open on the draft page cannot add anyone once the matches are drawn.
  const late = await coach.post(`/coach/season/drafts/${singles.id}/entries`, { member: id("Val"), division_id: divisions[0]!.id });
  assert.equal(late.status, 404); assert.match(late.html, /Not a draft/);
  assert.ok(!(await entries(singles.id)).some((e) => e.label === "Sample Val"));
  assert.match((await coach.get("/coach")).html, /<h1>Sample season 2<\/h1>/);
});

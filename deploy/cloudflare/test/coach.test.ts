import assert from "node:assert/strict";
import test from "node:test";
import { browser, websiteFixture } from "./website-helpers.ts";

const BROWSER_SCOPES = ["league:read", "league:write", "members:read", "members:write", "members:pii"];

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
  // When, on the club's clock (the fixture's club is on UTC).
  const now = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
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
  assert.equal(refused.status, 403); assert.match(refused.html, /cannot read the league, list members or make sign-in links/);
  assert.equal(coach.session(), "", "no cookie for a refused key");
  const agent = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Agent", scopes: ["league:read", "members:read", "members:write"] })).body.key;
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
  assert.match(home.html, /2 results disputed, 3 results waiting on the other side/);
  for (const name of ["Sample singles", "Sample doubles", "Division 1", "Division 3"]) assert.match(home.html, new RegExp(name));
  assert.match(home.html, /played \(\d+%\)/);
  assert.equal(home.html.match(/Opted out of next season: /g)?.length ?? 0, (await f.db.prepare(
    "SELECT count(DISTINCT competition_id) AS n FROM entry WHERE opted_out_at IS NOT NULL").first("n")) as number);
  assert.match(home.html, /Next season is not drafted yet/);

  const results = await coach.get("/coach/results");
  assert.equal(results.status, 200);
  assert.match(results.html, /Disputed \(2\)/); assert.match(results.html, /Waiting on the other side \(3\)/);
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
  assert.match(closed.html, /Not played by the deadline \(12\)/);
  assert.match((await coach.get("/coach")).html, /Results are closed/);
});

test("the coach's pages send a signed-out browser to sign in", async (t) => {
  const f = await websiteFixture(t);
  for (const path of ["/coach/results", "/coach/tables", "/coach/activity", "/coach/activity/all", "/coach/chase", "/coach/members"]) {
    const r = await browser(f).get(path);
    assert.equal(r.status, 303, path); assert.equal(r.location, "/coach");
  }
});

test("the results page reads at most twelve matches in full and lists the rest by name", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const open = (await f.api("/v1/matches?status=open&limit=200", f.admin)).body.data as { id: string }[];
  assert.equal(open.length, 12);
  for (const m of open) {
    const r = await f.api(`/v1/matches/${m.id}/claims`, f.admin, "POST",
      { side: 0, outcome: "completed", score: { sets: [{ games: [6, 4] }, { games: [6, 3] }] } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const page = await coach.get("/coach/results");
  assert.equal(page.status, 200);
  assert.match(page.html, /Disputed \(2\)/); assert.match(page.html, /Waiting on the other side \(15\)/);
  assert.equal(page.html.match(/has not answered in/g)?.length, 10);
  assert.match(page.html, /And 5 more/); assert.equal(page.html.match(/Waiting on the other side since/g)?.length, 5);
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
  assert.equal(allResults.html.match(/<li class="answer">/g)?.length, 34); assert.doesNotMatch(allResults.html, /Show the next 50/);
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

test("the coach sees the tables and the forecast as players do, for the competitions open to them", async (t) => {
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
  for (const text of ["Division 1", "Division 2", "Sample season · Results close in", "Weather at the courts", "row-toggle"]) {
    assert.ok(page.html.includes(text), text);
  }
  const tabs = [...page.html.matchAll(/href="\/coach\/tables\/([0-9a-f-]{36})"/g)].map((m) => m[1]);
  assert.equal(new Set(tabs).size, 2, "both sample competitions, and not the draft");
  assert.ok(!tabs.includes(draft.id));
  assert.doesNotMatch(page.html, /href="\/matches\/|\(yours\)|action="\/entries/, "nothing that is a player's own");
  assert.equal((await coach.get(`/coach/tables/${draft.id}`)).status, 404, "players can't see a draft");
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
  assert.match((await coach.get("/coach")).html, /of 15 players \(\d+%\)<\/span> (is|are) short of the 4-match minimum/);
});

test("the coach sets a competition's minimum on the dashboard, changing nothing else in its rules", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const singles = (await f.api("/v1/competitions", f.admin)).body.data.find((c: { name: string }) => c.name === "Sample singles");
  const before = (await f.api(`/v1/competitions/${singles.id}`, f.admin)).body.rules;
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const action = `/coach/competitions/${singles.id}/minimum`;
  const home = await coach.get("/coach");
  assert.match(home.html, new RegExp(`action="${action}"`));
  assert.match(home.html, /Division 1, 5 players: 4 · Division 2, 5 players: 4/);

  const saved = await coach.post(action, { minimum: "5" });
  assert.equal(saved.status, 303); assert.equal(saved.location, `/coach?saved=${singles.id}#competition-${singles.id}`);
  const after = (await f.api(`/v1/competitions/${singles.id}`, f.admin)).body.rules;
  assert.deepEqual(after, { ...before, minMatchesToPlay: 5 }, "only the minimum changed");
  const page = await coach.get(saved.location!);
  assert.match(page.html, /Saved: each player is expected to play 5 matches/);
  assert.match(page.html, /Division 1, 5 players: 4, all their matches/, "a division of five can't give five");
  assert.match(page.html, /are short of the 5-match minimum/);

  for (const typed of ["", "abc", "51", "-1", "4.5"]) {
    const refused = await coach.post(action, { minimum: typed });
    assert.equal(refused.status, 400, typed); assert.match(refused.html, /whole number from 0 to 50/);
  }
  assert.equal((await f.api(`/v1/competitions/${singles.id}`, f.admin)).body.rules.minMatchesToPlay, 5, "refusals change nothing");
  assert.equal((await coach.post(action, { minimum: "3" }, "https://evil.invalid")).status, 403, "another site's form");

  // A key that reads the league but can't change it.
  const reader = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Reader", scopes: ["league:read", "members:read", "members:write"] })).body.key;
  const limited = browser(f); assert.equal((await limited.post("/coach/sign-in", { key: reader })).status, 303);
  const denied = await limited.post(action, { minimum: "3" });
  assert.equal(denied.status, 403); assert.match(denied.html, /can(&#39;|')t change the league/);
  assert.equal((await f.api(`/v1/competitions/${singles.id}`, f.admin)).body.rules.minMatchesToPlay, 5);
});

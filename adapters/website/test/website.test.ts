// The reference website, driven the way a player's browser drives it, against
// the real API in-process on the database `npm run db:verify` starts. It
// reuses the API tests' helpers to build a league to play in.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { apiClient, createWebsite, type Weather } from "../dist/app.js";
import {
  app as api,
  closeAll,
  enter,
  keyWith,
  league,
  member,
  newClub,
  send,
  type TestClub,
} from "../../../packages/api/test/helpers.ts";

after(closeAll);

const SITE = "https://league.example";

type Mail = { to: string; subject: string; text: string };

/** The website for this club, with its email captured rather than sent, and any weather made up. */
function website(key: string | undefined, weather?: Weather) {
  const outbox: Mail[] = [];
  const app = createWebsite({
    api: apiClient("http://api.internal", (url, init) => Promise.resolve(api.request(url, init))),
    key,
    publicUrl: SITE,
    mail: async (m) => {
      outbox.push(m);
    },
    ...(weather ? { weather } : {}),
    log: () => {},
  });
  return { app, outbox };
}

type Site = ReturnType<typeof website>;

/** One phone's browser: it keeps the session cookie, and posts forms from the site itself. */
function browser(site: Site) {
  let cookie = "";
  let lastSetCookie = "";
  async function go(method: "GET" | "POST", path: string, form?: Record<string, string>, origin = SITE) {
    const res = await site.app.request(`${SITE}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(form ? { "content-type": "application/x-www-form-urlencoded", origin } : {}),
      },
      ...(form ? { body: new URLSearchParams(form).toString() } : {}),
    });
    const set = res.headers.get("set-cookie");
    if (set) {
      lastSetCookie = set;
      const value = /^deuceleague_session=([^;]*)/.exec(set)?.[1] ?? "";
      cookie = value && !/Max-Age=0/i.test(set) ? `deuceleague_session=${value}` : "";
    }
    return { status: res.status, location: res.headers.get("location"), headers: res.headers, html: await res.text() };
  }
  return {
    get: (path: string) => go("GET", path),
    post: (path: string, form: Record<string, string> = {}, origin?: string) => go("POST", path, form, origin),
    session: () => cookie.split("=")[1] ?? "",
    lastSetCookie: () => lastSetCookie,
  };
}

/** The key the setup guide tells a coach to make for the website. */
const websiteKey = (club: TestClub) => keyWith(club, "members:read", "members:write", "members:pii");

/** The login link in the last email to this address. */
function linkIn(site: Site, to: string): string {
  const mail = site.outbox.findLast((m) => m.to === to);
  assert.ok(mail, `an email to ${to}`);
  const url = /https:\/\/league\.example\/login\?token=\S+/.exec(mail.text)?.[0];
  assert.ok(url, "the email holds a link to the site");
  return url.slice(SITE.length);
}

/** Signs a browser in the whole way: the form, the email, the link, the button. */
async function signIn(site: Site, email: string) {
  const b = browser(site);
  await b.post("/login", { email });
  const confirm = await b.get(linkIn(site, email));
  const token = /name="token" value="([^"]+)"/.exec(confirm.html)?.[1];
  assert.ok(token);
  assert.equal((await b.post("/login/confirm", { token })).status, 303);
  return b;
}

test("a player signs in with an emailed link that works once, and stays signed in", async () => {
  const club = await newClub("website");
  await member(club, { display_name: "Sam K.", email: "Sam@Example.org" });
  const site = website(await websiteKey(club));
  const b = browser(site);

  const start = await b.get("/");
  assert.equal(start.status, 200);
  assert.match(start.html, /Sign in to the league/);
  assert.match(start.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(start.headers.get("referrer-policy"), "same-origin", "a link's token never leaves as a Referer");

  const sent = await b.post("/login", { email: "sam@example.org" });
  assert.match(sent.html, /Check your email/);
  assert.equal(site.outbox.length, 1);
  assert.equal(site.outbox[0]!.to, "sam@example.org");
  assert.match(site.outbox[0]!.text, /Hello Sam K\./);

  // Anyone may type any address: the answer is the same, and nothing is sent.
  const stranger = await b.post("/login", { email: "nobody@example.org" });
  assert.match(stranger.html, /Check your email/);
  await b.post("/login", { email: "SAM@example.org" });
  assert.equal(site.outbox.length, 1, "not a second email to the same address within the minute");

  // Opening the link only shows a button, so a mail scanner opening it uses nothing up.
  const link = linkIn(site, "sam@example.org");
  await b.get(link);
  const confirm = await b.get(link);
  const token = /name="token" value="([^"]+)"/.exec(confirm.html)?.[1]!;
  const signedIn = await b.post("/login/confirm", { token });
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.location, "/");
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${400 * 86_400}`]) {
    assert.ok(b.lastSetCookie().includes(flag), `the session cookie is ${flag}`);
  }

  const home = await b.get("/");
  assert.match(home.html, /Hello, Sam K\./);
  assert.match(home.html, /You have no matches outstanding/);
  assert.match(home.headers.get("set-cookie") ?? "", /Max-Age/, "set again on every visit, so it does not lapse");

  const again = await browser(site).post("/login/confirm", { token });
  assert.equal(again.status, 401);
  assert.match(again.html, /already been used/);

  const session = b.session();
  assert.equal((await b.post("/signout")).status, 303);
  assert.match((await b.get("/")).html, /Sign in to the league/);
  assert.equal((await send("GET", "/v1/me", session)).status, 401, "signing out ends the session itself");
});

test("a player reports a score from their side, the opponent accepts it, and it counts", async () => {
  const club = await newClub("website-play");
  const { competitionId, divisionIds } = await league(club);
  const sam = await member(club, { display_name: "Sam K.", email: "sam@example.org" });
  const alex = await member(club, { display_name: "Alex P.", email: "alex@example.org" });
  const samEntry = await enter(club, competitionId, divisionIds[0]!, [sam]);
  await enter(club, competitionId, divisionIds[0]!, [alex]);
  assert.equal((await send("POST", `/v1/divisions/${divisionIds[0]}/fixtures`, club.key)).status, 200);
  assert.equal((await send("PATCH", `/v1/competitions/${competitionId}`, club.key, { state: "active" })).status, 200);
  const [match] = (await send("GET", `/v1/matches?competition_id=${competitionId}`, club.key)).body.data;
  const samSide: 0 | 1 = match.sides.find((s: { entry_id: string }) => s.entry_id === samEntry).side;

  const site = website(await websiteKey(club));
  const samPhone = await signIn(site, "sam@example.org");
  const alexPhone = await signIn(site, "alex@example.org");

  const home = await samPhone.get("/");
  // Who is left to play: a line per competition, the opponents as links.
  assert.match(home.html, /To play \(1\)/);
  assert.ok(home.html.includes(`<dl class="toplay"><dt>Men&#39;s Singles</dt><dd><a href="/matches/${match.id}">Alex P.</a>`), home.html);
  const page = await samPhone.get(`/matches/${match.id}`);
  assert.match(page.html, /Report the score/);

  // The API's own check, in the player's words: 6-6 is not a set.
  const refused = await samPhone.post(`/matches/${match.id}/report`, {
    outcome: "completed",
    mine_1: "6",
    theirs_1: "6",
  });
  assert.equal(refused.status, 400);
  assert.match(refused.html, /6-6 is not a completed set/);

  const reported = await samPhone.post(`/matches/${match.id}/report`, {
    outcome: "completed",
    mine_1: "6",
    theirs_1: "4",
    mine_2: "6",
    theirs_2: "3",
    stopped: "",
    played_on: new Date().toISOString().slice(0, 10),
  });
  assert.equal(reported.status, 303, reported.html);
  assert.equal(reported.location, `/matches/${match.id}?done=sent`);
  assert.match((await samPhone.get(reported.location!)).html, /Sent\. Alex P\. is asked to agree it\./);
  const claimed = (await send("GET", `/v1/matches/${match.id}`, club.key)).body;
  assert.equal(claimed.status, "reported");
  // Typed as mine and theirs; stored with side 0 first.
  const expected = samSide === 0 ? [[6, 4], [6, 3]] : [[4, 6], [3, 6]];
  assert.deepEqual(claimed.claims[0].score.sets.map((s: { games: number[] }) => s.games), expected);
  assert.equal(claimed.claims[0].source, "web");

  const samHome = await samPhone.get("/");
  assert.match(samHome.html, /Waiting for your opponent/);
  // The season and how long is left; and where Sam stands, linking to Sam's own row.
  assert.match(samHome.html, /Season \w+ · Results close in (59|60|61) days/);
  assert.match(samHome.html, /Where you stand/);
  assert.ok(samHome.html.includes(`href="/competitions/${competitionId}#mine"`));
  assert.match(samHome.html, /<form method="post" action="\/signout">/, "signing out is still a form, not a link");

  // Alex agrees from the home page, without opening the match: the score from Alex's side, and one button.
  const alexPage = await alexPhone.get(`/matches/${match.id}`);
  assert.match(alexPage.html, /Sam K\. reported <strong>4-6, 3-6<\/strong>/, "read from Alex's side");
  const alexHome = await alexPhone.get("/");
  assert.match(alexHome.html, /Needs your answer/);
  assert.match(alexHome.html, /They say <strong>4-6, 3-6<\/strong>/);
  const claimId = /name="claim_id" value="([^"]+)"/.exec(alexHome.html)?.[1]!;
  const agreed = await alexPhone.post(`/matches/${match.id}/accept`, { claim_id: claimId, back: "home" });
  assert.equal(agreed.location, "/?done=accepted", "back to the home page");
  const after = await alexPhone.get(agreed.location!);
  assert.match(after.html, /Agreed\. The result counts now\./);
  assert.doesNotMatch(after.html, /Needs your answer/);
  assert.equal((await send("GET", `/v1/matches/${match.id}`, club.key)).body.status, "played");
  // The match page now says what the match earned.
  assert.match((await alexPhone.get(`/matches/${match.id}`)).html, /Earned you 1 pt: Played 1/);

  const table = await samPhone.get(`/competitions/${competitionId}`);
  assert.match(table.html, /Sam K\./);
  assert.match(table.html, /<tr class="me" id="mine">/);
  // Games won, lost and the difference: Sam won 12 games to 7. Won, lost and
  // games are for wider screens; the difference and points always show.
  assert.match(table.html, /<td class="wide">12<\/td><td class="wide">7<\/td><td>\+5<\/td>/);
  assert.match(table.html, /<td class="wide">7<\/td><td class="wide">12<\/td><td>−5<\/td>/);

  // Each row opens in place to show that player's matches and what each earned.
  // Seen by Alex: every row, Alex's own open.
  const seen = await alexPhone.get(`/competitions/${competitionId}`);
  const rowOf = (name: string) => {
    const at = seen.html.indexOf(`${name}</summary>`);
    assert.ok(at > 0, `${name}'s row opens`);
    return seen.html.slice(seen.html.lastIndexOf("<details", at), seen.html.indexOf("</details>", at));
  };
  const samRow = rowOf("Sam K.");
  // 6-4 6-3 is 12 games to 7: 4 for the win, 2 sets, not by 8. Every match in: 1 more.
  assert.match(samRow, /^<details class="row">/, "someone else's row starts closed");
  assert.match(samRow, /Beat Alex P\./);
  assert.match(samRow, /6-4, 6-3/, "the score from Sam's side, whoever is looking");
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  assert.ok(samRow.includes(today), `the day it was played, ${today}`);
  // What earned them sits in a tooltip on the points, not in the row.
  assert.match(samRow, /<span class="pts tip" tabindex="0">6 pts<span class="tiptext" role="tooltip">Win 4 · Sets won 2<\/span>/);
  assert.match(samRow, /Turned up to every match/);
  assert.doesNotMatch(samRow, /Total/, "the table's own Pts column is the total");
  const alexRow = rowOf("Alex P.");
  assert.match(alexRow, /^<details class="row" open/, "your own row starts open");
  assert.match(alexRow, /Lost to Sam K\./);
  assert.match(alexRow, /4-6, 3-6/);
  assert.match(alexRow, /Played 1/);

  // Once played, only the coach can change it; the form is gone.
  assert.doesNotMatch((await samPhone.get(`/matches/${match.id}`)).html, /Report the score/);

  const optOut = /action="\/entries\/([^/]+)\/opt-out"/.exec(table.html)?.[1];
  assert.equal(optOut, samEntry);
  assert.equal((await samPhone.post(`/entries/${samEntry}/opt-out`)).status, 303);
  assert.notEqual((await send("GET", `/v1/entries/${samEntry}`, club.key)).body.opted_out_at, null);
});

test("a player cannot act on another player's match through the site", async () => {
  const club = await newClub("website-others");
  const { competitionId, divisionIds } = await league(club);
  const players = [await member(club), await member(club)];
  for (const p of players) await enter(club, competitionId, divisionIds[0]!, [p]);
  const onlooker = await member(club, { display_name: "Onlooker", email: "onlooker@example.org" });
  await send("POST", `/v1/divisions/${divisionIds[0]}/fixtures`, club.key);
  await send("PATCH", `/v1/competitions/${competitionId}`, club.key, { state: "active" });
  const [match] = (await send("GET", `/v1/matches?competition_id=${competitionId}`, club.key)).body.data;
  assert.ok(onlooker);

  const site = website(await websiteKey(club));
  const b = await signIn(site, "onlooker@example.org");
  const page = await b.get(`/matches/${match.id}`);
  assert.equal(page.status, 200, "a member may look");
  assert.doesNotMatch(page.html, /Report the score/);
  const tried = await b.post(`/matches/${match.id}/report`, { outcome: "completed", mine_1: "6", theirs_1: "0", mine_2: "6", theirs_2: "0" });
  assert.equal(tried.status, 409);
  assert.equal((await send("GET", `/v1/matches/${match.id}`, club.key)).body.status, "open");
});

test("a form posted from another site is refused, and the site says when it has no key", async () => {
  const club = await newClub("website-guard");
  await member(club, { email: "sam@example.org" });
  const site = website(await websiteKey(club));
  const forged = await browser(site).post("/login", { email: "sam@example.org" }, "https://elsewhere.example");
  assert.equal(forged.status, 403);
  // What a sandboxed frame sends, and what the site's own forms would send under no-referrer.
  assert.equal((await browser(site).post("/login", { email: "sam@example.org" }, "null")).status, 403);
  assert.equal(site.outbox.length, 0);

  const unset = await browser(website(undefined)).get("/");
  assert.equal(unset.status, 503);
  assert.match(unset.html, /not set up yet/);
  assert.equal((await website(undefined).app.request(`${SITE}/healthz`)).status, 200);
});

test("every division shows on one page, with its promotion and relegation places marked", async () => {
  const club = await newClub("website-movement");
  const { seasonId, competitionId, divisionIds } = await league(club, { discipline: "singles" }, 2);
  const { rules } = (await send("GET", `/v1/competitions/${competitionId}`, club.key)).body;
  const oneUpOneDown = {
    ...rules,
    points: { ...rules.points, convincingWin: { byGames: 7, points: 2 } },
    movement: { promote: 1, relegate: 1, minMatchesForPromotion: 0 },
  };
  assert.equal((await send("PATCH", `/v1/competitions/${competitionId}`, club.key, { rules: oneUpOneDown })).status, 200);
  const me = await member(club, { display_name: "Aaron", email: "aaron@example.org" });
  await enter(club, competitionId, divisionIds[0]!, [me]);
  await enter(club, competitionId, divisionIds[0]!, [await member(club, { display_name: "Bella" })]);
  await enter(club, competitionId, divisionIds[1]!, [await member(club, { display_name: "Carl" })]);
  await enter(club, competitionId, divisionIds[1]!, [await member(club, { display_name: "Dina" })]);
  for (const d of divisionIds) await send("POST", `/v1/divisions/${d}/fixtures`, club.key);
  assert.equal((await send("PATCH", `/v1/competitions/${competitionId}`, club.key, { state: "active" })).status, 200);

  // Another competition in the season, one Aaron is not playing in.
  const other = await send("POST", "/v1/competitions", club.key, {
    season_id: seasonId,
    name: "Ladies' Singles",
    discipline: "singles",
    match_format: "pro_set_8",
  });
  await send("POST", `/v1/competitions/${other.body.id}/divisions`, club.key, {});
  assert.equal((await send("PATCH", `/v1/competitions/${other.body.id}`, club.key, { state: "active" })).status, 200);

  const site = website(await websiteKey(club));
  const aaron = await signIn(site, "aaron@example.org");
  const tables = await aaron.get("/tables");
  assert.equal(tables.location, `/competitions/${competitionId}`, "Tables opens the player's own competition");
  const page = (await aaron.get(`/competitions/${competitionId}`)).html;
  // Tabs for every competition, the ones Aaron plays in marked.
  assert.ok(page.includes(`href="/competitions/${competitionId}" class="mine" aria-current="page"`), page);
  assert.match(page, new RegExp(`href="/competitions/${other.body.id}"(?! class="mine")`));
  assert.match(page, /the competitions you are playing in/);
  // Jump links, with Aaron's division marked, and each division an anchor.
  assert.match(page, /href="#division-1" class="mine">Division 1 \(yours\)/);
  assert.match(page, /id="division-1"[\s\S]*id="division-2"/);
  // How points work, from this competition's own rules.
  assert.match(page, /How points work/);
  assert.match(page, /Plus 2 pts for winning by 7 games or more\./);
  assert.match(page, /the top 1 of each division go up and the bottom 1/);
  assert.match(page, /Division 1[\s\S]*Division 2/, "both divisions, top first, on the same page");
  // Nothing played: name order. Bella is bottom of Division 1, Carl top of Division 2.
  assert.match(page, /<tr class="me" id="mine">[\s\S]*?Aaron<\/summary>/, "the top division promotes nobody");
  assert.match(page, /<tr class="relegated">[\s\S]*?Bella<\/summary>/);
  assert.match(page, /<tr class="promoted">[\s\S]*?Carl<\/summary>/);
  assert.match(page, /aria-label="going up">▲/, "marked on the row itself; no separate key");
  assert.doesNotMatch(page, /class="key"/);
});

test("the site can go on a phone's home screen", async () => {
  const club = await newClub("website-manifest");
  const site = website(await websiteKey(club));
  const manifest = await site.app.request(`${SITE}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  const body = await manifest.json();
  assert.equal(body.name, "website-manifest", "named after the club");
  assert.equal(body.icons[0].src, "/icon.svg");
  const icon = await site.app.request(`${SITE}/icon.svg`);
  assert.equal(icon.headers.get("content-type"), "image/svg+xml");
  const page = await browser(site).get("/");
  assert.match(page.html, /<link rel="manifest" href="\/manifest.webmanifest"\/?>/);
  assert.match(page.headers.get("content-security-policy") ?? "", /manifest-src 'self'/);
});

test("the home page shows the outlook at the courts, when the site knows where they are", async () => {
  const club = await newClub("website-weather");
  const { competitionId, divisionIds } = await league(club);
  const zoe = await member(club, { display_name: "Zoe", email: "zoe@example.org" });
  await enter(club, competitionId, divisionIds[0]!, [zoe]);
  await enter(club, competitionId, divisionIds[0]!, [await member(club)]);
  await send("POST", `/v1/divisions/${divisionIds[0]}/fixtures`, club.key);
  await send("PATCH", `/v1/competitions/${competitionId}`, club.key, { state: "active" });

  const day = (date: string, code: number, rain: number, wind: number) => ({
    date, code, high: 19, low: 11, rain, wind, gusts: wind + 8,
  });
  const forecast = {
    temperature: "°C" as const,
    wind: "mph" as const,
    days: [
      day("2026-09-24", 1, 5, 8), // sunny and calm: good
      day("2026-09-25", 63, 90, 18), // rain
      day("2099-01-01", 0, 0, 3), // after the season's results deadline
    ],
  };
  const home = (await (await signIn(website(await websiteKey(club), async () => forecast), "zoe@example.org")).get("/")).html;
  assert.match(home, /Weather at the courts/);
  assert.match(home, /<li class="good" title="Looks good for tennis"><span class="when"><strong>Thu<\/strong> 24 Sept/);
  assert.match(home, /aria-label="Rain">🌧️/);
  assert.match(home, /💧 90%/);
  assert.match(home, /💨 18 mph/);
  assert.match(home, /<li class="good late" title="After the results deadline">/, "past the deadline, dimmed");

  // No forecast, or a failed one: the page is the same, without the box.
  const failing = website(await websiteKey(club), async () => {
    throw new Error("down");
  });
  const without = await (await signIn(failing, "zoe@example.org")).get("/");
  assert.equal(without.status, 200);
  assert.doesNotMatch(without.html, /Weather at the courts/);
});

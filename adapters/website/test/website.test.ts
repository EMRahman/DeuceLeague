// The reference website, driven the way a player's browser drives it, against
// the real API in-process on the database `npm run db:verify` starts. It
// reuses the API tests' helpers to build a league to play in.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { apiClient, createWebsite } from "../dist/app.js";
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

/** The website for this club, with its email captured rather than sent. */
function website(key: string | undefined) {
  const outbox: Mail[] = [];
  const app = createWebsite({
    api: apiClient("http://api.internal", (url, init) => Promise.resolve(api.request(url, init))),
    key,
    publicUrl: SITE,
    mail: async (m) => {
      outbox.push(m);
    },
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
  assert.match(home.html, /To play/);
  assert.match(home.html, /Alex P\./);
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
  const claimed = (await send("GET", `/v1/matches/${match.id}`, club.key)).body;
  assert.equal(claimed.status, "reported");
  // Typed as mine and theirs; stored with side 0 first.
  const expected = samSide === 0 ? [[6, 4], [6, 3]] : [[4, 6], [3, 6]];
  assert.deepEqual(claimed.claims[0].score.sets.map((s: { games: number[] }) => s.games), expected);
  assert.equal(claimed.claims[0].source, "web");

  assert.match((await samPhone.get("/")).html, /Waiting for your opponent/);
  const alexHome = await alexPhone.get("/");
  assert.match(alexHome.html, /Needs your answer/);
  const alexPage = await alexPhone.get(`/matches/${match.id}`);
  assert.match(alexPage.html, /Sam K\. reported <strong>4-6, 3-6<\/strong>/, "read from Alex's side");
  const claimId = /name="claim_id" value="([^"]+)"/.exec(alexPage.html)?.[1]!;
  assert.equal((await alexPhone.post(`/matches/${match.id}/accept`, { claim_id: claimId })).status, 303);
  assert.equal((await send("GET", `/v1/matches/${match.id}`, club.key)).body.status, "played");

  const table = await samPhone.get(`/competitions/${competitionId}`);
  assert.match(table.html, /Sam K\./);
  assert.match(table.html, /Results/);
  assert.match(table.html, /<tr class="me">/);

  // A name in the table opens that player's matches and what each earned.
  const samPage = `/competitions/${competitionId}/entries/${samEntry}`;
  assert.ok(table.html.includes(`href="${samPage}"`), "each name links to its breakdown");
  const breakdown = await alexPhone.get(samPage);
  assert.equal(breakdown.status, 200);
  // 6-4 6-3 is 12 games to 7: 4 for the win, 2 sets, not by 8. Every match in: 1 more.
  assert.match(breakdown.html, /Beat Alex P\./);
  assert.match(breakdown.html, /6-4, 6-3/, "the score from Sam's side, whoever is looking");
  assert.match(breakdown.html, /Win 4 · Sets won 2/);
  assert.match(breakdown.html, /Turned up to every match/);
  assert.match(breakdown.html, /Total<\/span><span class="pts">7 pts/);
  const alexRow = /href="(\/competitions\/[^"]+\/entries\/[^"]+)">Alex P\./.exec(table.html)?.[1]!;
  const alexBreakdown = await samPhone.get(alexRow);
  assert.match(alexBreakdown.html, /Lost to Sam K\./);
  assert.match(alexBreakdown.html, /4-6, 3-6/);
  assert.match(alexBreakdown.html, /Played 1/);

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

// Player logins through the API: login links, sessions, signing out, and what
// a signed-in player may see and do. Run by `npm run db:verify`.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { recordEvent } from "@deuceleague/db";
import { createApp } from "../dist/app.js";
import {
  closeAll,
  db,
  enter,
  eventsOf,
  keyWith,
  league,
  member,
  newClub,
  owner,
  send,
  type TestClub,
} from "./helpers.ts";

after(closeAll);

/** A login link's token for this member, made by the club's key. */
async function linkFor(club: TestClub, memberId: string): Promise<string> {
  const res = await send("POST", `/v1/members/${memberId}/login-link`, club.key);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.token;
}

/** A session for this member: a link, exchanged. */
async function signIn(club: TestClub, memberId: string): Promise<string> {
  const res = await send("POST", "/v1/session", await linkFor(club, memberId));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.token;
}

/** Another competition in the league's season, with one division, these members entered, and its fixtures. */
async function competition(
  club: TestClub,
  seasonId: string,
  fields: { name: string; visibility?: string; activate: boolean },
  memberIds: string[],
) {
  const comp = await send("POST", "/v1/competitions", club.key, {
    season_id: seasonId,
    name: fields.name,
    discipline: "singles",
    match_format: "best_of_3_champions_tiebreak",
    ...(fields.visibility ? { visibility: fields.visibility } : {}),
  });
  assert.equal(comp.status, 201, JSON.stringify(comp.body));
  const division = await send("POST", `/v1/competitions/${comp.body.id}/divisions`, club.key, {});
  assert.equal(division.status, 201);
  const entries: string[] = [];
  for (const m of memberIds) entries.push(await enter(club, comp.body.id, division.body.id, [m]));
  assert.equal((await send("POST", `/v1/divisions/${division.body.id}/fixtures`, club.key)).status, 200);
  if (fields.activate) {
    assert.equal((await send("PATCH", `/v1/competitions/${comp.body.id}`, club.key, { state: "active" })).status, 200);
  }
  const matches = await send("GET", `/v1/matches?competition_id=${comp.body.id}`, club.key);
  return {
    id: comp.body.id as string,
    divisionId: division.body.id as string,
    entries,
    matches: matches.body.data as { id: string; sides: { side: 0 | 1; entry_id: string }[] }[],
  };
}

/** A club with an active competition open to members, three players in it, and its round robin. */
async function playing() {
  const club = await newClub("logins");
  const { seasonId, competitionId, divisionIds } = await league(club);
  const players = [await member(club), await member(club), await member(club)];
  const entries: string[] = [];
  for (const p of players) entries.push(await enter(club, competitionId, divisionIds[0]!, [p]));
  assert.equal((await send("POST", `/v1/divisions/${divisionIds[0]}/fixtures`, club.key)).status, 200);
  assert.equal((await send("PATCH", `/v1/competitions/${competitionId}`, club.key, { state: "active" })).status, 200);
  const listed = await send("GET", `/v1/matches?competition_id=${competitionId}`, club.key);
  const matches = listed.body.data as { id: string; sides: { side: 0 | 1; entry_id: string }[] }[];
  /** The match between two players, and the side each is on. */
  const between = (a: number, b: number) => {
    const m = matches.find((x) => x.sides.every((s) => s.entry_id === entries[a] || s.entry_id === entries[b]))!;
    const sideOf = (i: number) => m.sides.find((s) => s.entry_id === entries[i])!.side;
    return { id: m.id, sides: [sideOf(a), sideOf(b)] as [0 | 1, 0 | 1] };
  };
  return { club, seasonId, competitionId, divisionId: divisionIds[0]!, players, entries, matches, between };
}

const straightSets = { outcome: "completed", score: { sets: [{ games: [6, 4] }, { games: [6, 3] }] } };

// ─────────────────────────────────────────────────── links and sessions ──

test("a login link works once, and starts a session that does not expire", async () => {
  const club = await newClub("link-once");
  const m = await member(club, { display_name: "Sam K." });

  const minted = await send("POST", `/v1/members/${m}/login-link`, club.key);
  assert.equal(minted.status, 201, JSON.stringify(minted.body));
  assert.match(minted.body.token, /^dll_[\w-]{43}$/);
  const minutes = (Date.parse(minted.body.expires_at) - Date.now()) / 60_000;
  assert.ok(minutes > 14 && minutes <= 15, `expires in ${minutes} minutes`);

  const started = await send("POST", "/v1/session", minted.body.token);
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.match(started.body.token, /^dls_[\w-]{43}$/);
  assert.deepEqual(started.body.member, { id: m, display_name: "Sam K." });

  const grants = await owner`select kind, expires_at, token_hash from access_grant where member_id = ${m}`;
  assert.deepEqual(
    grants.map((g) => [g.kind, g.expires_at]),
    [["session", null]],
    "the link is gone once used, and the session has no expiry",
  );
  assert.notEqual(grants[0]?.token_hash, started.body.token, "only the hash is stored");

  const again = await send("POST", "/v1/session", minted.body.token);
  assert.equal(again.status, 401);
  assert.equal(again.body.code, "invalid_credential", "a used link answers as if it never existed");

  const me = await send("GET", "/v1/me", started.body.token);
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.equal(me.body.club.id, club.id);
  assert.equal(me.body.credential.type, "session");
  assert.equal(me.body.credential.id, started.body.id);
  assert.deepEqual(me.body.credential.member, { id: m, display_name: "Sam K." });
  assert.deepEqual(me.body.credential.scopes, ["league:read", "results:write"]);

  const [created] = await eventsOf(club.id, "member.login_link.created");
  assert.equal(created?.actor_type, "api_key");
  assert.equal(created?.subject_id, m);
  const [signedIn] = await eventsOf(club.id, "member.signed_in");
  assert.deepEqual([signedIn?.actor_type, signedIn?.actor_id], ["member", m], "the player signed themselves in");
  assert.equal(signedIn?.payload.session_id, started.body.id);
  const log = JSON.stringify(await owner`select payload from event where club_id = ${club.id}`);
  assert.equal(log.includes(minted.body.token) || log.includes(started.body.token), false, "no token is logged");
});

test("a login link does nothing but start a session", async () => {
  const club = await newClub("link-only");
  const m = await member(club);
  const link = await linkFor(club, m);
  for (const [method, path] of [
    ["GET", "/v1/me"],
    ["GET", "/v1/competitions"],
    ["DELETE", "/v1/session"],
  ] as const) {
    const res = await send(method, path, link);
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(res.body.code, "credential_not_accepted");
  }
  assert.equal((await send("POST", "/v1/session", link)).status, 201, "and it still works for that");
});

test("an expired login link is refused", async () => {
  const club = await newClub("link-expired");
  const m = await member(club);
  const link = await linkFor(club, m);
  await owner`update access_grant set expires_at = now() - interval '1 second' where member_id = ${m}`;
  const res = await send("POST", "/v1/session", link);
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "invalid_credential");
});

test("two exchanges racing for one link start one session", async () => {
  const club = await newClub("link-race");
  const m = await member(club);
  const link = await linkFor(club, m);
  const results = await Promise.all([send("POST", "/v1/session", link), send("POST", "/v1/session", link)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 401]);
  const [row] = await owner`select count(*)::int as n from access_grant where member_id = ${m}`;
  assert.equal(row?.n, 1);
});

test("login links are made with members:write, for a member still in the club", async () => {
  const club = await newClub("link-who");
  const other = await newClub("link-other");
  const m = await member(club);
  const theirs = await member(other);

  const reader = await keyWith(club, "league:read", "members:read");
  const refused = await send("POST", `/v1/members/${m}/login-link`, reader);
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.body.missing_scopes, ["members:write"]);

  assert.equal((await send("POST", `/v1/members/${theirs}/login-link`, club.key)).status, 404, "another club's member");
  assert.equal((await send("DELETE", `/v1/members/${m}`, club.key)).status, 204);
  const removed = await send("POST", `/v1/members/${m}/login-link`, club.key);
  assert.equal(removed.status, 409);
  assert.equal(removed.body.code, "member_removed");
});

test("a session is refused wherever only a key will do, and a key where only a session will", async () => {
  const { club, players, competitionId, matches } = await playing();
  const session = await signIn(club, players[0]!);
  for (const [method, path] of [
    ["GET", "/v1/members"],
    ["GET", `/v1/members/${players[1]}`],
    ["GET", "/v1/events"],
    ["GET", "/v1/chase-list"],
    ["GET", "/v1/api-keys"],
    ["GET", "/v1/club"],
    ["POST", "/v1/seasons"],
    ["PATCH", `/v1/competitions/${competitionId}`],
    ["POST", `/v1/matches/${matches[0]!.id}/settle`],
    ["POST", `/v1/members/${players[0]}/login-link`],
    ["POST", `/v1/members/${players[0]}/sign-out`],
    ["POST", "/v1/session"],
  ] as const) {
    const res = await send(method, path, session, method === "GET" ? undefined : {});
    assert.equal(res.status, 403, `${method} ${path}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, "credential_not_accepted", `${method} ${path}`);
  }

  for (const [method, path] of [
    ["DELETE", "/v1/session"],
    ["POST", "/v1/session"],
  ] as const) {
    const res = await send(method, path, club.key);
    assert.equal(res.status, 403, `${method} ${path} with a key`);
    assert.equal(res.body.code, "credential_not_accepted");
  }
});

// ──────────────────────────────────────────────────── what a player sees ──

test("a player sees the competitions open to members, and nothing of a private one or a draft", async () => {
  const { club, seasonId, competitionId, players } = await playing();
  const hidden = await competition(club, seasonId, { name: "Coach's ladder", visibility: "private", activate: true }, [
    players[0]!,
    players[1]!,
  ]);
  const draft = await competition(club, seasonId, { name: "Next season", activate: false }, [players[0]!, players[1]!]);
  const session = await signIn(club, players[0]!);

  const listed = await send("GET", "/v1/competitions", session);
  assert.equal(listed.status, 200);
  assert.deepEqual(
    listed.body.data.map((c: { id: string }) => c.id),
    [competitionId],
    "only the active competition open to members",
  );
  const byKey = await send("GET", "/v1/competitions", club.key);
  assert.equal(byKey.body.data.length, 3, "the coach sees all three");

  for (const unseen of [hidden, draft]) {
    for (const path of [
      `/v1/competitions/${unseen.id}`,
      `/v1/competitions/${unseen.id}/divisions`,
      `/v1/divisions/${unseen.divisionId}`,
      `/v1/competitions/${unseen.id}/entries`,
      `/v1/entries/${unseen.entries[0]}`,
      `/v1/entries/${unseen.entries[0]}/progress`,
      `/v1/competitions/${unseen.id}/standings`,
      `/v1/competitions/${unseen.id}/progress`,
      `/v1/matches/${unseen.matches[0]!.id}`,
    ]) {
      const res = await send("GET", path, session);
      assert.equal(res.status, 404, `${path}: as if it did not exist`);
      assert.equal((await send("GET", path, club.key)).status, 200, `${path}: the coach's key sees it`);
    }
  }

  const matches = await send("GET", "/v1/matches?limit=200", session);
  assert.equal(matches.status, 200);
  assert.ok(matches.body.data.length > 0);
  assert.ok(
    matches.body.data.every((m: { competition_id: string }) => m.competition_id === competitionId),
    "matches of the private competition and the draft are left out",
  );
  const own = await send("GET", `/v1/matches?member_id=${players[0]}`, session);
  assert.equal(own.body.data.length, 2, "a player's own matches, in what they can see: two of three");

  const reported = await send("POST", `/v1/matches/${hidden.matches[0]!.id}/claims`, session, straightSets);
  assert.equal(reported.status, 404, "not even their own match in a private competition");
});

test("a player sees what the league shows, and none of it personal", async () => {
  const { club, competitionId, players, between } = await playing();
  await send("PATCH", `/v1/members/${players[1]}`, club.key, { email: "alex@example.com", full_name: "Alexander P" });
  const match = between(0, 1);
  const typed = await send("POST", `/v1/matches/${match.id}/claims`, club.key, {
    side: match.sides[1],
    ...straightSets,
    raw_input: "Alexander P won, 6-4 6-3",
  });
  assert.equal(typed.status, 201);

  const session = await signIn(club, players[0]!);
  const seen = JSON.stringify([
    (await send("GET", `/v1/matches/${match.id}`, session)).body,
    (await send("GET", `/v1/competitions/${competitionId}/entries`, session)).body,
    (await send("GET", `/v1/competitions/${competitionId}/standings`, session)).body,
    (await send("GET", "/v1/matches", session)).body,
  ]);
  for (const personal of ["alex@example.com", "Alexander P"]) {
    assert.equal(seen.includes(personal), false, `a player never sees ${personal}`);
  }
  const byKey = await send("GET", `/v1/matches/${match.id}`, club.key);
  assert.equal(byKey.body.claims[0].raw_input, "Alexander P won, 6-4 6-3", "the coach still sees what was typed");
});

// ──────────────────────────────────────────── what a player reports ──

test("a player reports for their own side, and the other player accepts it", async () => {
  const { club, players, between } = await playing();
  const match = between(0, 1);
  const [mine, theirs] = match.sides;
  const sam = await signIn(club, players[0]!);
  const alex = await signIn(club, players[1]!);

  const reported = await send("POST", `/v1/matches/${match.id}/claims`, sam, straightSets);
  assert.equal(reported.status, 201, JSON.stringify(reported.body));
  const claim = reported.body.claims[0];
  assert.equal(claim.side, mine, "the side is the player's own, without naming it");
  assert.equal(claim.source, "web");
  const [row] = await owner`select submitted_by_member_id from result_submission where id = ${claim.id}`;
  assert.equal(row?.submitted_by_member_id, players[0], "the claim says who made it");
  const [event] = await eventsOf(club.id, "match.claim.reported");
  assert.deepEqual([event?.actor_type, event?.actor_id], ["member", players[0]]);

  const accepted = await send("POST", `/v1/matches/${match.id}/claims/${claim.id}/accept`, alex);
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  assert.equal(accepted.body.status, "played");
  assert.equal(accepted.body.claims.at(-1).side, theirs);
});

test("a player cannot speak for the other side, or for a match they are not in", async () => {
  const { club, players, between } = await playing();
  const theirs = between(0, 1);
  const notMine = between(1, 2);
  const sam = await signIn(club, players[0]!);

  const otherSide = await send("POST", `/v1/matches/${theirs.id}/claims`, sam, { side: theirs.sides[1], ...straightSets });
  assert.equal(otherSide.status, 403);
  assert.equal(otherSide.body.code, "not_your_side");

  const named = await send("POST", `/v1/matches/${theirs.id}/claims`, sam, { side: theirs.sides[0], ...straightSets });
  assert.equal(named.status, 201, "naming their own side is fine");
  const own = await send("POST", `/v1/matches/${theirs.id}/claims/${named.body.claims[0].id}/accept`, sam);
  assert.equal(own.status, 403, "nobody accepts their own claim");
  assert.equal(own.body.code, "not_your_side");

  const elsewhere = await send("POST", `/v1/matches/${notMine.id}/claims`, sam, straightSets);
  assert.equal(elsewhere.status, 403);
  assert.equal(elsewhere.body.code, "not_your_match");
  const byKey = await send("POST", `/v1/matches/${notMine.id}/claims`, club.key, { side: 0, ...straightSets });
  const accept = await send("POST", `/v1/matches/${notMine.id}/claims/${byKey.body.claims[0].id}/accept`, sam);
  assert.equal(accept.status, 403);
  assert.equal(accept.body.code, "not_your_match");

  const [row] = await owner`select status from match where id = ${notMine.id}`;
  assert.equal(row?.status, "reported", "nothing the player tried changed it");
});

test("an API key still names the side it reports for", async () => {
  const { club, matches } = await playing();
  const res = await send("POST", `/v1/matches/${matches[0]!.id}/claims`, club.key, straightSets);
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].path, "side");
});

test("a player opts out of the next competition, and can take it back", async () => {
  const { club, players, entries, between } = await playing();
  const sam = await signIn(club, players[0]!);

  const out = await send("POST", `/v1/entries/${entries[0]}/opt-out`, sam);
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.ok(out.body.opted_out_at, "the entry says when they said it");
  const again = await send("POST", `/v1/entries/${entries[0]}/opt-out`, sam);
  assert.equal(again.body.opted_out_at, out.body.opted_out_at, "saying it twice keeps the first time");
  const [recorded] = await eventsOf(club.id, "entry.opt_out.recorded");
  assert.deepEqual([recorded?.actor_type, recorded?.actor_id], ["member", players[0]], "the player said it themselves");

  const theirs = await send("POST", `/v1/entries/${entries[1]}/opt-out`, sam);
  assert.equal(theirs.status, 403, "not for anybody else");
  assert.equal(theirs.body.code, "not_your_entry");

  // It says nothing about this competition: their matches stand, and they
  // can still report them.
  const match = between(0, 1);
  assert.equal((await send("POST", `/v1/matches/${match.id}/claims`, sam, straightSets)).status, 201);

  const back = await send("DELETE", `/v1/entries/${entries[0]}/opt-out`, sam);
  assert.equal(back.status, 200);
  assert.equal(back.body.opted_out_at, null, "and they can change their mind");
  assert.equal((await eventsOf(club.id, "entry.opt_out.cleared")).length, 1);

  // The coach records it for a player who said so in person; a key that only
  // reports results cannot.
  assert.equal((await send("POST", `/v1/entries/${entries[1]}/opt-out`, club.key)).status, 200);
  const weak = await keyWith(club, "league:read", "results:write");
  const refused = await send("POST", `/v1/entries/${entries[2]}/opt-out`, weak);
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.body.missing_scopes, ["league:write"]);
});

// ─────────────────────────────────────────────────────────── signing out ──

test("signing out ends that session; the coach can sign a member out everywhere", async () => {
  const club = await newClub("sign-out");
  const m = await member(club);
  const phone = await signIn(club, m);
  const tablet = await signIn(club, m);
  const laptop = await signIn(club, m);
  const unused = await linkFor(club, m);

  assert.equal((await send("DELETE", "/v1/session", phone)).status, 204);
  assert.equal((await send("GET", "/v1/me", phone)).status, 401, "signed out");
  assert.equal((await send("GET", "/v1/me", tablet)).status, 200, "the other sessions carry on");
  const [out] = await eventsOf(club.id, "member.signed_out");
  assert.deepEqual([out?.actor_type, out?.actor_id], ["member", m]);

  const everywhere = await send("POST", `/v1/members/${m}/sign-out`, club.key);
  assert.equal(everywhere.status, 200, JSON.stringify(everywhere.body));
  assert.deepEqual(everywhere.body, { member_id: m, sessions_ended: 2 });
  for (const token of [tablet, laptop]) assert.equal((await send("GET", "/v1/me", token)).status, 401);
  assert.equal((await send("POST", "/v1/session", unused)).status, 401, "an unused link goes too");
  const [all] = await eventsOf(club.id, "member.signed_out_everywhere");
  assert.equal(all?.actor_type, "api_key");
  assert.equal(all?.payload.sessions_ended, 2);

  assert.equal((await send("POST", `/v1/members/${m}/sign-out`, await keyWith(club, "members:read"))).status, 403);
});

test("removing a member ends their sessions; erasing one deletes them", async () => {
  const club = await newClub("leavers");
  const leaver = await member(club);
  const erased = await member(club);
  const leaverSession = await signIn(club, leaver);
  await signIn(club, erased);

  assert.equal((await send("DELETE", `/v1/members/${leaver}`, club.key)).status, 204);
  assert.equal((await send("GET", "/v1/me", leaverSession)).status, 401);

  assert.equal((await send("POST", `/v1/members/${erased}/erase`, club.key)).status, 200);
  const [row] = await owner`select count(*)::int as n from access_grant where member_id = ${erased}`;
  assert.equal(row?.n, 0);
});

// ────────────────────────────────────────────────────── the guarantees ──

// A route that exists only for this test, on an app of its own: one that
// never says which credentials it takes.
const probe = createApp({ db, log: () => {} });
probe.post("/v1/probe/undeclared", async (c) => {
  await recordEvent(c.get("tx"), c.get("auth").clubId, {
    type: "probe.undeclared",
    subjectType: "probe",
    subjectId: null,
    actor: { type: "system", id: null },
  });
  return c.json({ served: true }, 201);
});

test("a route that never says which credentials it takes serves no player", async () => {
  const club = await newClub("backstop");
  const session = await signIn(club, await member(club));
  const res = await probe.request("/v1/probe/undeclared", { method: "POST", headers: { authorization: `Bearer ${session}` } });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "credential_not_accepted");
  assert.equal((await eventsOf(club.id, "probe.undeclared")).length, 0, "and what it wrote was rolled back");

  const byKey = await probe.request("/v1/probe/undeclared", { method: "POST", headers: { authorization: `Bearer ${club.key}` } });
  assert.equal(byKey.status, 201, "a key is served as before");
});

test("the spec says exactly which routes a player's session reaches", async () => {
  const spec = (await send("GET", "/openapi.json")).body;
  const taking = (scheme: string) =>
    Object.entries(spec.paths as Record<string, Record<string, { security?: Record<string, string[]>[] }>>)
      .flatMap(([path, methods]) =>
        Object.entries(methods)
          .filter(([, op]) => op.security?.some((s) => scheme in s))
          .map(([method]) => `${method.toUpperCase()} ${path}`),
      )
      .sort();

  // Adding a route here is a decision: it must keep a player to the
  // competitions open to members, and to their own side of their own matches.
  assert.deepEqual(taking("session"), [
    "DELETE /v1/entries/{id}/opt-out",
    "DELETE /v1/session",
    "GET /v1/competitions",
    "GET /v1/competitions/{id}",
    "GET /v1/competitions/{id}/divisions",
    "GET /v1/competitions/{id}/entries",
    "GET /v1/competitions/{id}/progress",
    "GET /v1/competitions/{id}/standings",
    "GET /v1/divisions/{id}",
    "GET /v1/entries/{id}",
    "GET /v1/entries/{id}/progress",
    "GET /v1/matches",
    "GET /v1/matches/{id}",
    "GET /v1/me",
    "GET /v1/seasons",
    "GET /v1/seasons/{id}",
    "POST /v1/entries/{id}/opt-out",
    "POST /v1/matches/{id}/claims",
    "POST /v1/matches/{id}/claims/{claim_id}/accept",
  ]);
  assert.deepEqual(taking("loginLink"), ["POST /v1/session"]);
  for (const [path, methods] of Object.entries(spec.paths as Record<string, Record<string, { security?: unknown[] }>>)) {
    if (!path.startsWith("/v1/")) continue;
    for (const [method, op] of Object.entries(methods)) {
      assert.ok(op.security && op.security.length > 0, `${method} ${path} declares its credentials`);
    }
  }
  assert.equal(spec.components.securitySchemes.session.scheme, "bearer");
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { whatsapp } from "@deuceleague/website";
import { wantsThis } from "../../../adapters/coach/dist/season.js";
import { change, fixture } from "./helpers.ts";
import { browser, playingWebsite, signIn, websiteFixture } from "./website-helpers.ts";

test("planning survives reloads, remains private and refuses outsiders, CSRF and closed fixtures", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  await f.api(`/v1/members/${p.members[1].id}`, f.admin, "PATCH", { phone: "07700 900123" });
  await f.create("/v1/court-locations", { name: "Club courts", latitude: 51, longitude: 0 });
  const sam = await signIn(f, "sam@example.org"), alex = await signIn(f, "alex@example.org");
  const home = (await sam.get("/")).html;
  assert.match(home, /Your leagues/); assert.match(home, /Summer/); assert.match(home, /0 played · 1 to play/);
  assert.match(home, /To arrange <span[^>]*>\(1\)/); assert.match(home, /Plan next/);
  assert.match(home, /https:\/\/wa.me\/447700900123/);
  assert.ok(home.indexOf('Weather at the courts') < home.indexOf('Your leagues'));
  const url = `/v1/matches/${p.match}/plan`;
  const save = (state: string, arranged_on: string | null = null, token = sam.session()) => f.api(url, token, "PUT", {state, arranged_on});
  assert.equal((await save("planned", "2026-10-15")).status, 400);
  assert.equal((await save("arranged", "2026-02-30")).status, 400);
  assert.equal((await save("planned", null, f.admin)).status, 403);
  await f.create("/v1/members", { display_name: "Outsider", email: "outside@example.org" });
  const outsider = await signIn(f, "outside@example.org");
  assert.equal((await save("planned", null, outsider.session())).status, 404);
  assert.equal((await sam.post(`/matches/${p.match}/plan`, {state:"planned"}, "https://evil.invalid")).status, 403);
  assert.equal((await sam.post(`/matches/${p.match}/plan`, {state:"planned"})).location, "/?done=plan");
  assert.match((await sam.get("/")).html, /Planned <span[^>]*>\(1\)/);
  assert.deepEqual((await f.api('/v1/me/match-plans', alex.session())).body.data, []);
  await f.configure({});
  assert.deepEqual((await f.api('/v1/me/match-plans', sam.session())).body.data, [{match_id:p.match, state:'planned', arranged_on:null}]);
  assert.equal((await sam.post(`/matches/${p.match}/plan`, {state:"planned", arranged_on:"2026-10-15"})).status, 303);
  assert.match((await sam.get("/")).html, /Arranged <span[^>]*>\(1\)/);
  assert.deepEqual((await f.api('/v1/me/match-plans', sam.session())).body.data, [{match_id:p.match, state:'arranged', arranged_on:'2026-10-15'}]);
  assert.equal((await save('to_arrange')).status, 200);
  assert.deepEqual((await f.api('/v1/me/match-plans', sam.session())).body.data, []);
  await save('planned');
  await f.api(`/v1/entries/${p.entries[1].id}`, f.admin, "PATCH", {state:"withdrawn"});
  assert.equal((await save('arranged')).status, 409);
  assert.deepEqual((await f.api('/v1/me/match-plans', sam.session())).body.data, []);
  assert.doesNotMatch((await sam.get('/')).html, /class="match-board"/);
  await f.api(`/v1/entries/${p.entries[1].id}`, f.admin, "PATCH", {state:"active"});
  await change(f.db, [f.db.prepare('UPDATE season SET results_deadline_at = 0 WHERE id = ?').bind(p.season.id)]);
  assert.equal((await save('arranged')).status, 409);
  assert.deepEqual((await f.api('/v1/me/match-plans', sam.session())).body.data, []);
});

test("mixed doubles choices persist for members and join requests and select the right coach drafts", async t => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const sam = await signIn(f, 'sam@example.org');
  assert.match((await sam.get('/')).html, /<option value="mixed_doubles">Mixed doubles/);
  assert.match((await browser(f).get('/join')).html, /value="mixed_doubles"/);
  for (const choice of ['mixed_doubles','singles_mixed','doubles_mixed','all']) {
    assert.equal((await sam.post('/plays', {wants_to_play:choice})).status, 303);
    assert.equal((await f.api('/v1/me', sam.session())).body.credential.member.wants_to_play, choice);
    const request = await f.create('/v1/join-requests', {first_name:'New',surname:choice,email:`${choice}@example.org`,phone:'07700 900999',privacy_notice:'uk-2026-09-30',wants_to_play:choice});
    assert.equal(request.wants_to_play, choice);
  }
  assert.deepEqual(['singles','doubles','mixed_doubles','both','singles_mixed','doubles_mixed','all','not_now',null].map(wants_to_play =>
    ['singles','doubles','mixed'].map(kind => wantsThis({wants_to_play}, kind === 'singles' ? 'singles' : 'doubles', kind === 'mixed' ? 'mixed' : 'open'))),
  [[true,false,false],[false,true,false],[false,false,true],[true,true,false],[true,false,true],[false,true,true],[true,true,true],[false,false,false],[true,true,true]]);
});

test("WhatsApp numbers support UK mobile and international formats and reject ambiguous input", () => {
  for (const number of ['07700 900123', '+44 7700 900123', '0044 7700 900123']) assert.equal(whatsapp(number), 'https://wa.me/447700900123');
  assert.equal(whatsapp('+1 (202) 555-0123'), 'https://wa.me/12025550123');
  for (const number of ['123', '555-0123', '07700ABC900123', '+', '+0000']) assert.equal(whatsapp(number), null);
});

test("the preference migration preserves existing member and join-request choices", async t => {
  const f = await fixture(t, true, false, '0018_wants_to_play.sql');
  const member = randomUUID(), request = randomUUID();
  await change(f.db, [
    f.db.prepare("INSERT INTO member (id, club_id, display_name, plays) VALUES (?, ?, 'Legacy', 'both')").bind(member, f.clubId),
    f.db.prepare(`INSERT INTO join_request (id, club_id, first_name, surname, email, phone, privacy_notice, plays)
      VALUES (?, ?, 'Waiting', 'Player', 'waiting@example.org', '07700 900111', 'uk-2026-09-30', 'not_now')`).bind(request, f.clubId),
  ]);
  const sql = await readFile(new URL('../../../packages/db-d1/migrations/0019_mixed_doubles_preferences.sql', import.meta.url), 'utf8');
  await f.db.batch(sql.split('--> statement-breakpoint').map(part => f.db.prepare(part)));
  assert.equal(await f.db.prepare('SELECT plays FROM member WHERE id = ?').bind(member).first('plays'), 'both');
  assert.equal(await f.db.prepare('SELECT plays FROM join_request WHERE id = ?').bind(request).first('plays'), 'not_now');
  assert.equal((await f.call(`/v1/members/${member}`, f.admin, 'PATCH', {wants_to_play:'all'})).status, 200);
});

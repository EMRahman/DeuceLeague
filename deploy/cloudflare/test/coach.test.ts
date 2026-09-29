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
  assert.equal(page.status, 200); assert.match(page.html, /Members/);
  assert.ok(!page.html.includes(f.admin) && !page.html.includes(stored));
});

test("the coach makes a player's sign-in link, which signs the player in once, with no email set up", async (t) => {
  const f = await websiteFixture(t);
  await f.configure({ MAIL_PROVIDER: "", MAIL_FROM: "", RESEND_API_KEY: "" });
  const sam = await f.create("/v1/members", { display_name: "Sam" });
  const gone = await f.create("/v1/members", { display_name: "Gone" });
  assert.equal((await f.api(`/v1/members/${gone.id}`, f.admin, "DELETE")).status, 204);
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const list = await coach.get("/coach");
  assert.match(list.html, /Sam/); assert.doesNotMatch(list.html, /Gone/);
  assert.match(list.html, new RegExp(`action="/coach/members/${sam.id}/sign-in-link"`));
  const made = await coach.post(`/coach/members/${sam.id}/sign-in-link`);
  assert.equal(made.status, 200); assert.match(made.html, /Sign-in link for Sam/); assert.match(made.html, /within 15 minutes/);
  const token = /https:\/\/league\.test\/login\?token=([A-Za-z0-9_-]+)/.exec(made.html)?.[1]; assert.ok(token);
  const player = browser(f);
  assert.equal((await player.get(`/login?token=${token}`)).status, 200);
  assert.equal((await player.post("/login/confirm", { token })).status, 303);
  assert.match((await player.get("/")).html, /Hello, Sam/);
  assert.equal((await browser(f).post("/login/confirm", { token })).status, 401, "a link works once");
  assert.equal((await coach.post(`/coach/members/${gone.id}/sign-in-link`)).status, 404);
  assert.equal(f.outbox.length, 0); assert.equal(f.outgoing.length, 0);
});

test("coach sign-in refuses other credentials and other sites; a revoked key or signing out forgets it", async (t) => {
  const f = await websiteFixture(t); const coach = browser(f);
  assert.equal((await coach.post("/coach/sign-in", { key: "not a key" })).status, 400);
  assert.equal((await coach.post("/coach/sign-in", { key: "dl_" + "x".repeat(43) })).status, 401);
  const readOnly = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Reader", scopes: ["league:read", "members:read"] })).body.key;
  const refused = await coach.post("/coach/sign-in", { key: readOnly });
  assert.equal(refused.status, 403); assert.match(refused.html, /cannot list members or make sign-in links/);
  assert.equal(coach.session(), "", "no cookie for a refused key");
  const agent = (await f.api("/v1/api-keys", f.admin, "POST", { name: "Agent", scopes: ["members:read", "members:write"] })).body.key;
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

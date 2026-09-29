import { Hono } from "hono";
import { html } from "hono/html";
import { bodyLimit } from "hono/body-limit";
import { websiteConfig, type WebsiteBindings } from "./website-config.js";

type Api = { fetch(request: Request): Response | Promise<Response> };
const frame = (body: unknown) => html`<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up your league</title>
  <style>body{font:18px/1.5 system-ui;max-width:38rem;margin:3rem auto;padding:0 1rem;color:#17291c;background:#fafbf8}
  label{display:block;margin:1rem 0}input,button{font:inherit;padding:.6rem;box-sizing:border-box;max-width:100%}
  input:not([type=checkbox]){display:block;width:100%}button{cursor:pointer}code{overflow-wrap:anywhere}</style></head>
  <body><main><h1>Set up your league</h1>${body}</main></body></html>`;

function administratorKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "dl_" + btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** No installer session/cookie or secret in URLs. Every POST reauthenticates
 * through protected bootstrap routes. Plaintext keys are never persisted. */
export function createInstaller(api: Api, env: WebsiteBindings, origin: string) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "same-origin");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (c.req.method === "POST" && c.req.header("origin") !== origin) return c.text("Forbidden", 403);
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 8192, onError: (c) => c.text("Setup form is too large", 413) }));
  const call = (path: string, secret: string, body?: object) => api.fetch(new Request(`https://api.internal${path}`, {
    method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  const complete = () => frame(html`<h2>Setup is complete</h2><p>This installation already has a club.
    Use the administrator key you saved. Setup cannot replace its keys or create another club.</p><p><a href="/">Open the league</a></p>`);
  app.get("/install", (c) => c.html(frame(html`<p>Enter the installation secret saved when you configured this deployment.</p>
    <form method="post" action="/install/check"><label>Installation secret<input type="password" name="secret" required autocomplete="off"></label>
    <button>Check setup</button></form>`)));
  app.post("/install/check", async (c) => {
    const secret = String((await c.req.parseBody()).secret ?? "");
    const response = await call("/setup/status", secret);
    if (!response.ok) return c.html(frame(html`<p>The installation secret was not accepted, or setup is unavailable.</p><a href="/install">Try again</a>`), response.status === 401 ? 401 : 503);
    const state = await response.json() as { initialized: boolean; website: string; sample_created: boolean };
    let ready = true;
    try { websiteConfig(env); } catch { ready = false; }
    if (state.initialized) return c.html(frame(html`<h2>Setup is complete</h2><p>This installation already has a club.</p>
      <p>Website credential: ${state.website === "registered" ? "ready" : "needs attention"}.</p>
      <p>Email configuration: ${ready ? "present; delivery still needs testing" : "needs attention"}.</p>
      <p>Sample club: ${state.sample_created ? "created" : "not selected"}.</p>
      <p>Use your saved administrator key. Changing installation secrets does not reopen setup.</p><a href="/">Open the league</a>`));
    if (!ready || state.website !== "unregistered") return c.html(frame(html`<p>Website or email configuration needs attention before creating the club.
      Check the deployment settings, then return here.</p><a href="/install">Check again</a>`), 503);
    return c.html(frame(html`<p>Save this administrator key in your password manager before continuing.
      It gives full control of your club and cannot be retrieved later.</p>
      <form method="post" action="/install/create"><input type="hidden" name="secret" value="${secret}">
      <label>Administrator key<input name="admin_key" value="${administratorKey()}" readonly autocomplete="off"></label>
      <label><input type="checkbox" name="saved" value="yes" required> I have saved the administrator key</label>
      <label>Club name<input name="name" required maxlength="100"></label>
      <label>Club identifier<input name="slug" required minlength="3" maxlength="40" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="riverside-tennis"></label>
      <label>Time zone<input name="timezone" value="Europe/London" required></label>
      <label><input type="checkbox" name="sample" value="yes"> Add a sample league for testing</label>
      <p>The sample adds 22 fictional players: singles in three divisions of five, doubles in two divisions of five
      pairs, and 50 matches, most already played. Leave it unchecked for a real club. Samples can only be added during
      initial setup.</p>
      <label>Email for Sample Alex (optional)<input type="email" name="sample_email" maxlength="254" autocomplete="email"></label>
      <label>Email for Sample Bailey (optional)<input type="email" name="sample_bailey_email" maxlength="254" autocomplete="off"></label>
      <p>Alex and Bailey have an unplayed match against each other, so one can report a score and the other agree it.
      Use two addresses you can read. Setup sends no email; afterwards, request sign-in links from the league home page.</p>
      <button>Create club</button></form>`));
  });
  app.post("/install/create", async (c) => {
    const form = await c.req.parseBody(); const secret = String(form.secret ?? "");
    const status = await call("/setup/status", secret);
    if (!status.ok) return c.html(frame(html`<p>The installation secret was not accepted, or setup is unavailable.</p>`), status.status === 401 ? 401 : 503);
    if ((await status.json() as { initialized: boolean }).initialized) return c.html(complete(), 409);
    try { websiteConfig(env); } catch { return c.html(frame(html`<p>Check the deployment's website and email configuration first.</p>`), 503); }
    if (form.saved !== "yes" || !/^dl_[A-Za-z0-9_-]{43}$/.test(String(form.admin_key ?? ""))) {
      return c.html(frame(html`<p>Save a valid administrator key before creating your club.</p><a href="/install">Start again</a>`), 400);
    }
    const response = await call("/setup", secret, { slug: String(form.slug ?? ""), name: String(form.name ?? ""),
      timezone: String(form.timezone ?? ""), admin_key: String(form.admin_key), sample: form.sample === "yes",
      ...(String(form.sample_email ?? "").trim() ? { sample_email: String(form.sample_email).trim() } : {}),
      ...(String(form.sample_bailey_email ?? "").trim() ? { sample_bailey_email: String(form.sample_bailey_email).trim() } : {}) });
    if (response.status === 409) return c.html(complete(), 409);
    if (!response.ok) return c.html(frame(html`<p>Club setup did not complete. Check the club identifier, name, time zone and sample email choice, then try again.
      Keep your saved administrator key until you have checked setup status.</p><a href="/install">Check setup</a>`), response.status === 400 ? 400 : 503);
    return c.html(frame(html`<h2>Your club has been created</h2><p>Your saved administrator key is ready. Keep it private.</p>
      ${form.sample === "yes" ? html`<p>The sample league is ready: 22 fictional players and 50 matches.
      Request a sign-in link on the home page with each address you supplied to play as Sample Alex or Sample Bailey.</p>` : ""}
      <p>The website is connected. Email delivery still needs to be tested with your account.</p><a href="/">Open the league</a>`), 201);
  });
  app.notFound((c) => c.text("Not found", 404));
  app.onError((_error, c) => c.html(frame(html`<p>Setup is temporarily unavailable. Keep your saved administrator key and check setup again.</p>`), 503));
  return app;
}

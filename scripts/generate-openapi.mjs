import { readFile, writeFile } from "node:fs/promises";
import { createCloudflareApp } from "../packages/api/dist/cloudflare.js";

const check = process.argv.slice(2);
if (check.length > 1 || (check.length === 1 && check[0] !== "--check")) {
  throw new Error("Usage: node scripts/generate-openapi.mjs [--check]");
}

// Registering the routes builds the document but does not query D1. Keeping
// this stub hostile proves the static docs do not depend on a local database,
// Miniflare, secrets, or a deployed Worker.
const app = createCloudflareApp({
  db: { prepare() { throw new Error("OpenAPI generation must not access D1"); } },
  log: () => {},
});
const response = await app.request("/openapi.json");
if (!response.ok) throw new Error(`OpenAPI generation returned ${response.status}`);
const document = await response.json();
if (document?.openapi !== "3.1.0" || !document.paths || typeof document.paths !== "object") {
  throw new Error("The API did not produce an OpenAPI 3.1 document");
}

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
  Object.entries(methods)
    .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
    .map(([method, operation]) => ({
      method: method.toUpperCase(), path, summary: operation.summary ?? "", tag: operation.tags?.[0] ?? "Other",
    })),
);
const groups = new Map();
for (const operation of operations) {
  groups.set(operation.tag, [...(groups.get(operation.tag) ?? []), operation]);
}
const tagId = (tag) => tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const apiPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DeuceLeague API reference</title>
  <style>
    :root { color: #15221d; background: #f7faf8; font-family: system-ui, sans-serif; }
    body { margin: 0; line-height: 1.5; }
    a { color: #056b4d; }
    header { color: #fff; background: #104837; padding: 3.5rem max(1.5rem, calc((100% - 70rem) / 2)); }
    header p { max-width: 43rem; color: #d8ebe3; font-size: 1.1rem; }
    nav { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem; }
    nav a { color: #fff; font-weight: 650; }
    main { max-width: 70rem; margin: auto; padding: 2rem 1.5rem 4rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; margin: 1.5rem 0 2.5rem; }
    .stat { padding: 1rem; background: #e5f2ec; border-radius: .6rem; }
    .stat strong { display: block; font-size: 1.6rem; }
    .areas { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0 2rem; }
    .areas a { padding: .3rem .55rem; border: 1px solid #b8d8c9; border-radius: 999px; text-decoration: none; }
    section { margin-top: 2.5rem; scroll-margin-top: 1rem; }
    h1 { margin: 0; font-size: clamp(2rem, 5vw, 3.5rem); }
    h2 { margin-bottom: .5rem; }
    .operation { display: grid; grid-template-columns: 4.8rem minmax(12rem, 24rem) 1fr; gap: .75rem; align-items: baseline; padding: .8rem 0; border-top: 1px solid #d9e3dd; }
    .method { font: 700 .78rem ui-monospace, monospace; color: #005e43; }
    code { overflow-wrap: anywhere; font-size: .9rem; }
    .note { max-width: 52rem; padding: 1rem 1.2rem; border-left: 4px solid #178760; background: #edf7f2; }
    footer { color: #526159; font-size: .9rem; margin-top: 3rem; }
    @media (max-width: 42rem) { .operation { grid-template-columns: 4.8rem 1fr; } .operation span:last-child { grid-column: 2; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(document.info.title)}</h1>
    <p>Version ${escapeHtml(document.info.version)} · a concise map of every HTTP operation, generated from the route definitions.</p>
    <nav aria-label="Documentation">
      <a href="API.html">Guide</a>
      <a href="openapi.json">OpenAPI JSON</a>
    </nav>
  </header>
  <main>
    <div class="summary" aria-label="API summary">
      <div class="stat"><strong>${operations.length}</strong>operations</div>
      <div class="stat"><strong>${Object.keys(document.paths).length}</strong>paths</div>
      <div class="stat"><strong>${groups.size}</strong>feature areas</div>
    </div>
    <p class="note">All <code>/v1</code> operations require a bearer credential. <code>/healthz</code> and <code>/openapi.json</code> are public.</p>
    <h2>Feature areas</h2>
    <div class="areas">
${[...groups].map(([tag, entries]) => `      <a href="#${tagId(tag)}">${escapeHtml(tag)} (${entries.length})</a>`).join("\n")}
    </div>
${[...groups].map(([tag, entries]) => `    <section id="${tagId(tag)}">
      <h2>${escapeHtml(tag)}</h2>
${entries.map(({ method, path, summary }) => `      <div class="operation"><span class="method">${method}</span><code>${escapeHtml(path)}</code><span>${escapeHtml(summary)}</span></div>`).join("\n")}
    </section>`).join("\n")}
    <footer>Generated by <code>npm run docs:openapi</code>. Do not edit this file by hand.</footer>
  </main>
</body>
</html>
`;

const outputs = [
  { name: "docs/openapi.json", destination: new URL("../docs/openapi.json", import.meta.url), content: `${JSON.stringify(document, null, 2)}\n` },
  { name: "docs/api.html", destination: new URL("../docs/api.html", import.meta.url), content: apiPage },
];
if (check[0] === "--check") {
  const stale = [];
  for (const { name, destination, content } of outputs) {
    let current = "";
    try { current = await readFile(destination, "utf8"); } catch { /* reported below */ }
    if (current !== content) stale.push(name);
  }
  if (stale.length) {
    throw new Error(`${stale.join(", ")} ${stale.length === 1 ? "is" : "are"} stale; run npm run docs:openapi and commit the result`);
  }
} else {
  await Promise.all(outputs.map(({ destination, content }) => writeFile(destination, content)));
}

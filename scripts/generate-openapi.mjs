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

const output = `${JSON.stringify(document, null, 2)}\n`;
const destination = new URL("../docs/openapi.json", import.meta.url);
if (check[0] === "--check") {
  let current = "";
  try { current = await readFile(destination, "utf8"); } catch { /* reported below */ }
  if (current !== output) {
    throw new Error("docs/openapi.json is stale; run npm run docs:openapi and commit the result");
  }
} else {
  await writeFile(destination, output);
}

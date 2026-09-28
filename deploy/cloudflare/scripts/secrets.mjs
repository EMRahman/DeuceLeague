import { randomBytes } from "node:crypto";

// Intentionally prints new secrets for the owner to save and enter into their
// deployment's secret fields. It does not read config or contact any account.
console.log("Save these in your password manager and use them as Worker secrets.\n");
console.log(`SETUP_TOKEN=${randomBytes(32).toString("base64url")}`);
console.log(`WEBSITE_API_KEY=dl_${randomBytes(32).toString("base64url")}`);
console.log("\nThe browser installer will separately generate your administrator key.");

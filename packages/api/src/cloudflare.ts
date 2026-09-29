import { health } from "./contracts/health.js";
import { installationSample } from "./installation-sample.js";
import { registerCloudflareEvents } from "./cloudflare-events.js";
import { registerCloudflarePlacements } from "./cloudflare-placements.js";
import { registerCloudflareViews } from "./cloudflare-views.js";
import { registerCloudflareLeague } from "./cloudflare-league.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import { registerCloudflareMatches } from "./cloudflare-matches.js";
import { registerCloudflareAdministration } from "./cloudflare-administration.js";
import type { D1Database } from "@cloudflare/workers-types";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  checkHealth, commitIdentity, CredentialExpiredError, initializeClub, readIdentity, readInstallation,
  retryMutation, sampleStatements, StaleSnapshotError, uuidv7, type CredentialKind, type IdentityChange, type IdentitySnapshot,
} from "@deuceleague/db-d1";
import { PLAYER_SCOPES, Scope } from "@deuceleague/schema";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { checkAccess } from "./access.js";
import type { Auth } from "./context.js";
import { exchange, LOGIN_LINK_MINUTES, mint, signOut, signOutEverywhere } from "./contracts/logins.js";
import { me } from "./contracts/me.js";
import { generateApiKey, generateLoginLink, generateSession, hashKey, KEY_PREFIX, LINK_PREFIX, SESSION_PREFIX } from "./keys.js";
import { ApiError, problemResponse, problems } from "./problems.js";
import { TimeZone } from "./timezone.js";

type Env = CloudflareEnv;
type Options = { db: D1Database; setupToken?: string; websiteKey?: string; log?: (line: string) => void };

const SetupKey = z.string().regex(/^dl_[A-Za-z0-9_-]{43}$/);
const WEBSITE_SCOPES = ["members:read", "members:write", "members:pii"] as const;

const Setup = z.object({
  slug: z.string().min(3).max(40).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(100),
  timezone: TimeZone.default("Europe/London"),
  // The browser installer displays this before commit so losing the response
  // cannot lose the only administrator credential. Never persist plaintext.
  admin_key: SetupKey.optional(),
  sample: z.boolean().default(false),
  sample_email: z.string().trim().email().max(254).optional(),
  sample_bailey_email: z.string().trim().email().max(254).optional(),
}).refine((input) => input.sample || input.sample_email === undefined,
  { path: ["sample_email"], message: "Select the sample club to set a sample sign-in email" })
  .refine((input) => input.sample || input.sample_bailey_email === undefined,
    { path: ["sample_bailey_email"], message: "Select the sample club to set a sample sign-in email" })
  .refine((input) => input.sample_email === undefined || input.sample_email.toLowerCase() !== input.sample_bailey_email?.toLowerCase(),
    { path: ["sample_bailey_email"], message: "Use a different address for each sample player" });

function validation(error: z.ZodError): never {
  throw problems.validation(error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
}

/** D1 API entry point, composed with the website by the deployment Worker. */
export function createCloudflareApp(options: Options) {
  const { db } = options;
  const log = options.log ?? console.log;
  const app = new OpenAPIHono<Env>({ defaultHook: (result) => { if (!result.success) validation(result.error); } });
  app.use("*", async (c, next) => {
    const id = randomUUID();
    c.set("requestId", id);
    c.header("X-Request-Id", id);
    c.header("Cache-Control", "no-store");
    await next();
    log(`${id} ${c.req.method} ${c.req.path} ${c.res.status}`);
  });

  app.openapi(health, async (c) => {
    try { await checkHealth(db); }
    catch { throw new ApiError(503, "database_unavailable", "The database is not reachable"); }
    return c.json({ status: "ok" as const }, 200);
  });

  // A secret configured by the account owner is required BEFORE reading input
  // or looking at setup state. No "first visitor becomes admin" behaviour.
  const setupAccess = async (c: Context<Env>, next: () => Promise<void>) => {
    const secret = options.setupToken;
    if (!secret || secret.length < 32) throw problems.notFound();
    const supplied = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
    if (!supplied || !timingSafeEqual(Buffer.from(hashKey(supplied)), Buffer.from(hashKey(secret)))) {
      throw problems.invalidCredential();
    }
    await next();
  };
  app.use("/setup", setupAccess);
  app.use("/setup/*", setupAccess);
  app.get("/setup/status", async (c) => {
    const state = await readInstallation(db);
    let website: "missing" | "invalid" | "unregistered" | "registered" = "missing";
    if (options.websiteKey) {
      if (!SetupKey.safeParse(options.websiteKey).success) website = "invalid";
      else {
        const identity = await readIdentity(db, hashKey(options.websiteKey), "api_key");
        const scopes: string[] = identity.credential ? JSON.parse(identity.credential.scopes) : [];
        website = identity.credential && WEBSITE_SCOPES.every((s) => scopes.includes(s))
          && scopes.length === WEBSITE_SCOPES.length ? "registered" : "unregistered";
      }
    }
    return c.json({ initialized: state.initialized, website, sample_created: state.sampleCreated });
  });
  app.post("/setup", bodyLimit({ maxSize: 4096 }), async (c) => {
    const parsed = Setup.safeParse(await c.req.json());
    if (!parsed.success) validation(parsed.error);
    return retryMutation(async () => {
      const state = await readInstallation(db);
      if (state.initialized) throw problems.conflict("already_initialized", "This installation already has a club");
      if (options.websiteKey !== undefined && !SetupKey.safeParse(options.websiteKey).success) {
        throw new ApiError(503, "setup_configuration", "The website credential is not configured correctly");
      }
      const { admin_key, sample, sample_email, sample_bailey_email, ...fields } = parsed.data;
      if (admin_key && admin_key === options.websiteKey) throw problems.validation([{ path: "admin_key", message: "Use a separate administrator key" }]);
      const club = { id: uuidv7(), ...fields };
      const key = admin_key ? { key: admin_key, hash: hashKey(admin_key), prefix: admin_key.slice(0, 9) } : generateApiKey();
      await initializeClub(db, state.snapshot, club, { id: uuidv7(), ...key, scopes: Scope.options },
        options.websiteKey ? { id: uuidv7(), hash: hashKey(options.websiteKey), prefix: options.websiteKey.slice(0, 9), scopes: WEBSITE_SCOPES } : undefined,
        sample ? sampleStatements(db, club.id, installationSample(club.id, club.timezone, new Date(),
          { alex: sample_email ?? null, bailey: sample_bailey_email ?? null })) : []);
      return c.json({ club, api_key: key.key }, 201);
    });
  });

  app.use("/v1/*", async (c, next) => {
    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
    if (!token) throw problems.missingCredential();
    const kind: CredentialKind | null = token.startsWith(KEY_PREFIX) ? "api_key"
      : token.startsWith(LINK_PREFIX) ? "login_link" : token.startsWith(SESSION_PREFIX) ? "session" : null;
    if (!kind) throw problems.invalidCredential();
    const state = await readIdentity(db, hashKey(token), kind);
    c.set("identity", state);
    c.set("auth", authFor(state));
    await next();
    if (kind !== "api_key" && !c.get("accessChecked")) throw problems.credentialNotAccepted(["api_key"]);
  });

  // A retry recomputes authorization, inputs, decision AND response. Nothing
  // external is sent until the guarded batch succeeds. Unknown failures never
  // retry: their commit status may be ambiguous.
  async function run<T>(
    c: Context<Env>,
    decide: (state: IdentitySnapshot, auth: Auth) => { change: IdentityChange; output: T },
    memberId: string | null = null,
  ): Promise<T> {
    const initial = c.get("identity");
    return retryMutation(async () => {
      // Global middleware has no route params. After validation, read the
      // actual target alongside fresh authentication in a single snapshot.
      const state = await readIdentity(db, initial.hash, initial.kind, memberId);
      const auth = authFor(state);
      const access = c.get("requiredAccess");
      if (!access) throw problems.credentialNotAccepted(["api_key"]);
      checkAccess(auth, access);
      const { change, output } = decide(state, auth);
      await commitIdentity(db, state, change);
      return output;
    });
  }

  app.openapi(me, async (c) => c.json(await run(c, (state, auth) => ({
    change: { type: "read" },
    output: {
      club: state.club!,
      credential: auth.credential.type === "api_key" ? {
        type: "api_key" as const, id: auth.credential.id, name: state.credential!.name!,
        prefix: state.credential!.prefix!, scopes: [...auth.scopes],
      } : {
        type: "session" as const, id: auth.credential.id, scopes: [...auth.scopes],
        member: { id: state.credential!.member_id!, display_name: state.credential!.display_name! },
      },
    },
  })), 200));

  // `curl -X POST -H "Content-Type: application/json"` with no data sends an empty
  // body. The link's lifetime is optional, so that still asks for the default
  // link, as it did before the route took a body, rather than failing as bad JSON.
  app.use("/v1/members/:id/login-link", async (c, next) => {
    if (c.req.method === "POST" && c.req.header("content-type") && (await c.req.raw.clone().text()).trim() === "") {
      const headers = new Headers(c.req.raw.headers);
      headers.delete("content-type");
      c.req.raw = new Request(c.req.raw.url, { method: "POST", headers });
    }
    await next();
  });
  app.openapi(mint, async (c) => {
    const { id } = c.req.valid("param");
    const minutes = (c.req.valid("json") ?? {}).expires_in_minutes ?? LOGIN_LINK_MINUTES;
    return c.json(await run(c, (state) => {
      if (!state.member) throw problems.notFound("member");
      if (state.member.deleted_at !== null) throw problems.conflict("member_removed", "A removed member cannot log in");
      const link = generateLoginLink();
      const expiresAt = state.now + minutes * 60_000;
      return {
        change: { type: "mint", id: uuidv7(), memberId: id, hash: link.hash, scopes: PLAYER_SCOPES, expiresAt },
        output: { member_id: id, token: link.token, expires_at: new Date(expiresAt).toISOString() },
      };
    }, id), 201);
  });
  app.openapi(exchange, async (c) => c.json(await run(c, (state) => {
    const session = generateSession();
    const id = uuidv7();
    return {
      change: { type: "exchange", id, hash: session.hash, scopes: JSON.parse(state.credential!.scopes) as string[] },
      output: { id, token: session.token, member: { id: state.credential!.member_id!, display_name: state.credential!.display_name! } },
    };
  }), 201));
  app.openapi(signOut, async (c) => {
    await run(c, () => ({ change: { type: "sign_out" }, output: null }));
    return c.body(null, 204);
  });
  app.openapi(signOutEverywhere, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, (state) => {
      if (!state.member) throw problems.notFound("member");
      return { change: { type: "sign_out_everywhere", memberId: id }, output: { member_id: id, sessions_ended: state.sessions } };
    }, id), 200);
  });

  registerCloudflareMatches(app, db);
  registerCloudflareAdministration(app, db);
  registerCloudflareLeague(app, db);
  registerCloudflareViews(app, db);
  registerCloudflarePlacements(app, db);
  registerCloudflareEvents(app, db);

  for (const name of ["apiKey", "session", "loginLink"]) {
    app.openAPIRegistry.registerComponent("securitySchemes", name, { type: "http", scheme: "bearer" });
  }
  app.doc31("/openapi.json", {
    openapi: "3.1.0", info: { title: "DeuceLeague API (Cloudflare migration preview)", version: "0.1.0" },
  });
  app.notFound((c) => problemResponse(c, problems.notFound()));
  app.onError((error, c) => {
    if (error instanceof ApiError) return problemResponse(c, error);
    if (error instanceof CredentialExpiredError) return problemResponse(c, problems.invalidCredential());
    if (error instanceof StaleSnapshotError) {
      return problemResponse(c, new ApiError(503, "busy", "The club is busy; try again", { headers: { "Retry-After": "1" } }));
    }
    if (error instanceof HTTPException) return problemResponse(c, new ApiError(error.status, "http_error", error.message));
    if (error instanceof SyntaxError) return problemResponse(c, problems.validation([{ path: "", message: "Invalid JSON" }]));
    // Do not log error messages containing a SQL bind or request body.
    log(`${c.get("requestId")} internal error`);
    return problemResponse(c, problems.internal());
  });
  return app;
}

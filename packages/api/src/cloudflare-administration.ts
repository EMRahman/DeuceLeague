import type { D1Database } from "@cloudflare/workers-types";
import {
  commitIdentity, createCourtLocation, createKeyAdmin, deleteCourtLocation, DuplicateEmailError, finishKeysRead, LastAdminError, mutateMemberAdmin,
  readClubAdmin, readIdentity, readKeysAdmin, readMembersAdmin, readWeatherAdmin, retryMutation, revokeKeyAdmin,
  updateClubAdmin, updateCourtLocation, updateWeatherAdmin, uuidv7,
  type IdentitySnapshot,
} from "@deuceleague/db-d1";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { checkAccess } from "./access.js";
import { toClub } from "./administration/club.js";
import { toApiKey } from "./administration/keys.js";
import { checkPersonalWrite, holdsPii, toChanges, toMember } from "./administration/members.js";
import { toCourtLocation, toWeather } from "./administration/weather.js";
import { keyGrant, lastAdmin } from "./administration/permissions.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import type { Auth } from "./context.js";
import * as club from "./contracts/club.js";
import * as keys from "./contracts/keys.js";
import * as members from "./contracts/members.js";
import * as weather from "./contracts/weather.js";
import { definedOnly, sentFields } from "./contracts/shared.js";
import { generateApiKey } from "./keys.js";
import { problems } from "./problems.js";

export function registerCloudflareAdministration(app: OpenAPIHono<CloudflareEnv>, db: D1Database): void {
  async function run<S extends { identity: IdentitySnapshot }, T>(
    c: Context<CloudflareEnv>, read: (initial: IdentitySnapshot) => Promise<S>,
    operate: (state: S, auth: Auth) => Promise<T>,
  ): Promise<T> {
    return retryMutation(async () => {
      const state = await read(c.get("identity"));
      const auth = authFor(state.identity);
      const access = c.get("requiredAccess");
      if (!access) throw problems.credentialNotAccepted(["api_key"]);
      checkAccess(auth, access);
      try { return await operate(state, auth); }
      catch (error) {
        if (error instanceof LastAdminError) lastAdmin();
        if (error instanceof DuplicateEmailError) throw problems.conflict("email_taken", "Another member already has that email address");
        throw error;
      }
    });
  }
  const touch = (state: { identity: IdentitySnapshot }) => commitIdentity(db, state.identity, { type: "read" });
  const freshIdentity = async (i: IdentitySnapshot) => ({ identity: await readIdentity(db, i.hash, i.kind) });

  app.openapi(club.get, async (c) => c.json(await run(c,
    (i) => readClubAdmin(db, i.hash, i.kind), async (s) => { await touch(s); return toClub(s.club); }), 200));
  app.openapi(club.patch, async (c) => {
    const changes = definedOnly(c.req.valid("json"));
    return c.json(await run(c, (i) => readClubAdmin(db, i.hash, i.kind), async (s) => {
      if (!sentFields(changes).length) { await touch(s); return toClub(s.club); }
      return toClub(await updateClubAdmin(db, s.identity, changes));
    }), 200);
  });
  app.openapi(weather.get, async (c) => c.json(await run(c,
    (i) => readWeatherAdmin(db, i.hash, i.kind), async (s) => { await touch(s); return toWeather(s.weather); }), 200));
  app.openapi(weather.patch, async (c) => {
    const changes = definedOnly(c.req.valid("json"));
    return c.json(await run(c, (i) => readWeatherAdmin(db, i.hash, i.kind), async (s) => {
      if (changes.units === undefined) { await touch(s); return toWeather(s.weather); }
      return toWeather(await updateWeatherAdmin(db, s.identity, changes.units));
    }), 200);
  });
  app.openapi(weather.listCourts, async (c) => c.json(await run(c,
    (i) => readWeatherAdmin(db, i.hash, i.kind), async (s) => { await touch(s); return { data: s.weather.courtLocations.map(toCourtLocation) }; }), 200));
  app.openapi(weather.createCourt, async (c) => {
    const body = c.req.valid("json");
    return c.json(await run(c, (i) => readWeatherAdmin(db, i.hash, i.kind), async (s) => {
      if (s.weather.courtLocations.length >= 8) {
        throw problems.conflict("court_location_limit", "The club already has eight court locations");
      }
      return toCourtLocation(await createCourtLocation(db, s.identity, { id: uuidv7(), ...body }));
    }), 201);
  });
  app.openapi(weather.patchCourt, async (c) => {
    const { id } = c.req.valid("param"); const changes = definedOnly(c.req.valid("json"));
    return c.json(await run(c, (i) => readWeatherAdmin(db, i.hash, i.kind), async (s) => {
      const court = s.weather.courtLocations.find((location) => location.id === id);
      if (!court) throw problems.notFound("court location");
      if (!sentFields(changes).length) { await touch(s); return toCourtLocation(court); }
      return toCourtLocation(await updateCourtLocation(db, s.identity, id, changes));
    }), 200);
  });
  app.openapi(weather.deleteCourt, async (c) => {
    const { id } = c.req.valid("param");
    await run(c, (i) => readWeatherAdmin(db, i.hash, i.kind), async (s) => {
      if (!s.weather.courtLocations.some((location) => location.id === id)) throw problems.notFound("court location");
      await deleteCourtLocation(db, s.identity, id);
    });
    return c.body(null, 204);
  });
  app.openapi(keys.list, async (c) => {
    const q = c.req.valid("query");
    return c.json(await run(c, (i) => readKeysAdmin(db, i.hash, i.kind, q), async (s) => {
      const page = await finishKeysRead(db, s, q);
      return { data: page.rows.map(toApiKey), next_cursor: page.next };
    }), 200);
  });
  app.openapi(keys.create, async (c) => {
    const body = c.req.valid("json");
    return c.json(await run(c, freshIdentity, async (s, auth) => {
      const grant = keyGrant(body, auth, s.identity.now);
      const secret = generateApiKey();
      const key = await createKeyAdmin(db, s.identity, { id: uuidv7(), name: body.name, ...grant, hash: secret.hash, prefix: secret.prefix });
      return { ...toApiKey(key), key: secret.key };
    }), 201);
  });
  app.openapi(keys.revoke, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, (i) => readKeysAdmin(db, i.hash, i.kind, { id }), async (s) => {
      const key = s.rows[0];
      if (!key) throw problems.notFound("API key");
      if (key.revokedAt) { await touch(s); return toApiKey(key); }
      if (key.scopes.includes("admin") && !s.anotherAdmin) lastAdmin();
      return toApiKey(await revokeKeyAdmin(db, s.identity, key));
    }), 200);
  });
  app.openapi(members.list, async (c) => {
    const q = c.req.valid("query");
    // Refuse an email lookup before issuing even the filtered public query.
    if (q.email !== undefined && !holdsPii(c.get("auth"))) throw problems.insufficientScope(["members:pii"]);
    return c.json(await run(c, (i) => readMembersAdmin(db, i.hash, i.kind, {
      limit: q.limit, after: q.after, status: q.status, email: q.email, includeRemoved: q.include_removed ?? false,
    }), async (s, auth) => {
      if (q.email !== undefined && !holdsPii(auth)) throw problems.insufficientScope(["members:pii"]);
      await touch(s);
      return { data: s.rows.map((m) => toMember(m, holdsPii(auth))), next_cursor: s.next };
    }), 200);
  });
  app.openapi(members.get, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, (i) => readMembersAdmin(db, i.hash, i.kind, { id }), async (s, auth) => {
      if (!s.rows[0]) throw problems.notFound("member");
      await touch(s); return toMember(s.rows[0], holdsPii(auth));
    }), 200);
  });
  app.openapi(members.create, async (c) => {
    const body = c.req.valid("json");
    return c.json(await run(c, freshIdentity, async (s, auth) => {
      checkPersonalWrite(body, auth);
      const record = await mutateMemberAdmin(db, s.identity, uuidv7(), {
        type: "create", changes: { ...toChanges(body), displayName: body.display_name }, fields: sentFields(body),
      });
      return toMember(record, holdsPii(auth));
    }), 201);
  });
  app.openapi(members.patch, async (c) => {
    const { id } = c.req.valid("param"); const body = c.req.valid("json");
    return c.json(await run(c, (i) => readMembersAdmin(db, i.hash, i.kind, { id }), async (s, auth) => {
      const member = s.rows[0];
      if (!member) throw problems.notFound("member");
      if (member.deletedAt) throw problems.conflict("member_removed", "A removed member cannot be changed");
      checkPersonalWrite(body, auth);
      const fields = sentFields(body);
      if (!fields.length) { await touch(s); return toMember(member, holdsPii(auth)); }
      return toMember(await mutateMemberAdmin(db, s.identity, id, { type: "patch", changes: toChanges(body), fields }), holdsPii(auth));
    }), 200);
  });
  app.openapi(members.remove, async (c) => {
    const { id } = c.req.valid("param");
    await run(c, (i) => readMembersAdmin(db, i.hash, i.kind, { id }), async (s) => {
      const member = s.rows[0]; if (!member) throw problems.notFound("member");
      if (member.deletedAt) { await touch(s); return; }
      await mutateMemberAdmin(db, s.identity, id, { type: "remove" });
    });
    return c.body(null, 204);
  });
  app.openapi(members.erase, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, (i) => readMembersAdmin(db, i.hash, i.kind, { id }), async (s, auth) => {
      if (!s.rows[0]) throw problems.notFound("member");
      return toMember(await mutateMemberAdmin(db, s.identity, id, { type: "erase" }), holdsPii(auth));
    }), 200);
  });
}

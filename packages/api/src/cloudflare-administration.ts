import type { D1Database } from "@cloudflare/workers-types";
import {
  commitIdentity, createCourtLocation, createJoinRequest, createKeyAdmin, declineJoinRequest, deleteCourtLocation, DuplicateEmailError,
  finishKeysRead, JoinRequestExistsError, LastAdminError, mutateMemberAdmin, readClubAdmin, readIdentity, readJoinRequests, readKeysAdmin,
  readMembersAdmin, readWeatherAdmin, retryMutation, revokeKeyAdmin,
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
import { displayNameOf, toJoinRequest } from "./administration/join-requests.js";
import { keyGrant, lastAdmin } from "./administration/permissions.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import type { Auth } from "./context.js";
import * as club from "./contracts/club.js";
import * as joinRequests from "./contracts/join-requests.js";
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
        if (error instanceof JoinRequestExistsError) {
          throw problems.conflict("already_requested", "Someone with that email address is already waiting to join");
        }
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
  for (const [route, on] of [[members.leave, true], [members.stay, false]] as const) {
    app.openapi(route, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await run(c, (i) => readMembersAdmin(db, i.hash, i.kind, { id }), async (s, auth) => {
        // A player speaks for themselves; anyone else's id looks like nobody's to them.
        if (auth.credential.type === "session" && auth.credential.memberId !== id) throw problems.notYou();
        const member = s.rows[0]; if (!member) throw problems.notFound("member");
        if (member.deletedAt) throw problems.conflict("member_removed", "The member has been removed");
        // Saying it twice keeps the first time, and records nothing more.
        if ((member.leavingAt !== null) === on) { await touch(s); return toMember(member, holdsPii(auth)); }
        return toMember(await mutateMemberAdmin(db, s.identity, id, { type: "leaving", on }), holdsPii(auth));
      }), 200);
    });
  }
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

  app.openapi(joinRequests.list, async (c) => {
    const q = c.req.valid("query");
    return c.json(await run(c, (i) => readJoinRequests(db, i.hash, i.kind, { limit: q.limit, after: q.after }), async (s) => {
      await touch(s);
      return { data: s.rows.map(toJoinRequest), next_cursor: s.next };
    }), 200);
  });
  app.openapi(joinRequests.get, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, (i) => readJoinRequests(db, i.hash, i.kind, { id }), async (s) => {
      if (!s.rows[0]) throw problems.notFound("join request");
      await touch(s); return toJoinRequest(s.rows[0]);
    }), 200);
  });
  app.openapi(joinRequests.create, async (c) => {
    const body = c.req.valid("json");
    const email = body.email ?? null;
    // Someone already waiting with this email is found in the snapshot; one with only a phone cannot be told apart.
    const read = async (i: IdentitySnapshot): Promise<{ identity: IdentitySnapshot; rows: unknown[] }> =>
      email ? readJoinRequests(db, i.hash, i.kind, { email }) : { ...(await freshIdentity(i)), rows: [] };
    return c.json(await run(c, read, async (s) => {
      if (s.rows.length) throw new JoinRequestExistsError();
      return toJoinRequest(await createJoinRequest(db, s.identity, { id: uuidv7(), firstName: body.first_name,
        surname: body.surname, email, phone: body.phone ?? null, privacyNotice: body.privacy_notice,
        gender: body.gender ?? null, ageGroup: body.age_group ?? null }));
    }), 201);
  });
  app.openapi(joinRequests.approve, async (c) => {
    const { id } = c.req.valid("param"); const body = c.req.valid("json") ?? {};
    return c.json(await run(c, (i) => readJoinRequests(db, i.hash, i.kind, { id }), async (s, auth) => {
      const request = s.rows[0];
      if (!request) throw problems.notFound("join request");
      const changes = {
        displayName: body.display_name ?? displayNameOf(request), fullName: `${request.firstName} ${request.surname}`,
        email: request.email, phone: request.phone, level: body.level ?? null, joinedOn: today(s.identity.club!.timezone),
        gender: body.gender === undefined ? request.gender : body.gender,
        ageGroup: body.age_group === undefined ? request.ageGroup : body.age_group,
      };
      const record = await mutateMemberAdmin(db, s.identity, uuidv7(), {
        type: "create", changes, joinRequest: { id: request.id, privacyNotice: request.privacyNotice },
        fields: ["display_name", "full_name", "joined_on", ...(request.email ? ["email"] : []),
          ...(request.phone ? ["phone"] : []), ...(changes.level === null ? [] : ["level"]),
          ...(changes.gender ? ["gender"] : []), ...(changes.ageGroup ? ["age_group"] : [])],
      });
      return toMember(record, holdsPii(auth));
    }), 201);
  });
  app.openapi(joinRequests.decline, async (c) => {
    const { id } = c.req.valid("param");
    await run(c, (i) => readJoinRequests(db, i.hash, i.kind, { id }), async (s) => {
      if (!s.rows[0]) throw problems.notFound("join request");
      await declineJoinRequest(db, s.identity, id);
    });
    return c.body(null, 204);
  });
}

/** Today on the club's calendar, as YYYY-MM-DD. */
function today(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

// What every API test file needs: the app, against the real, freshly migrated
// Postgres that `npm run db:verify` starts. DATABASE_URL connects as
// deuceleague_app, the way the server does; MIGRATION_DATABASE_URL is the
// owner, used only to set up and inspect states a request cannot.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { connect, createClub } from "@deuceleague/db";
import { Scope } from "@deuceleague/schema";
import { createApp } from "../dist/app.js";
import { generateApiKey } from "../dist/keys.js";

export const APP_URL = process.env.DATABASE_URL!;
export const OWNER_URL = process.env.MIGRATION_DATABASE_URL!;
if (!APP_URL || !OWNER_URL) {
  throw new Error("run through `npm run db:verify`, which sets DATABASE_URL and MIGRATION_DATABASE_URL");
}

export const { db, close } = connect(APP_URL);
export const owner = postgres(OWNER_URL, { onnotice: () => {} });
/** Quiet, unless API_LOG is set: `API_LOG=1 npm run db:verify` prints each request and any server error. */
export const app = createApp({ db, log: process.env.API_LOG ? (line) => console.error(line) : () => {} });

/** Closes both connections. Call it from each file's `after`. */
export async function closeAll(): Promise<void> {
  await close();
  await owner.end();
}

export type TestClub = { id: string; slug: string; key: string; keyId: string };

/** A club of its own, with one key carrying `scopes` — every scope unless told otherwise. */
export async function newClub(label: string, scopes: string[] = [...Scope.options]): Promise<TestClub> {
  const slug = `${label}-${randomUUID().slice(0, 8)}`;
  const key = generateApiKey();
  const { clubId, apiKeyId } = await createClub(db, {
    slug,
    name: label,
    timezone: "Europe/London",
    adminKey: { name: "test key", hash: key.hash, prefix: key.prefix, scopes },
  });
  return { id: clubId, slug, key: key.key, keyId: apiKeyId };
}

export function call(target: typeof app, path: string, key?: string, init: RequestInit = {}) {
  return target.request(path, { ...init, headers: key ? { authorization: `Bearer ${key}` } : {} });
}

/** A JSON request, and its response with the body already parsed. */
export async function send(method: string, path: string, key?: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as any, res };
}

/** The events a club has recorded of one type, oldest first. */
export async function eventsOf(clubId: string, type: string) {
  return owner<{ subject_id: string | null; actor_type: string; actor_id: string | null; payload: any }[]>`
    select subject_id, actor_type, actor_id, payload from event
    where club_id = ${clubId} and type = ${type} order by id`;
}

// ────────────────────────────────────────── building a league to test against ──

/** A key of this club's, made through the API with just these scopes. */
export async function keyWith(club: TestClub, ...scopes: string[]): Promise<string> {
  const res = await send("POST", "/v1/api-keys", club.key, { name: `only ${scopes.join(" ")}`, scopes });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.key;
}

export async function member(club: TestClub, fields: Record<string, unknown> = {}): Promise<string> {
  const res = await send("POST", "/v1/members", club.key, { display_name: `Player ${randomUUID().slice(0, 6)}`, ...fields });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id;
}

/** An active season holding one competition with `divisions` divisions, ready for entries. */
export async function league(
  club: TestClub,
  competition: { discipline: "singles" | "doubles"; category?: string } = { discipline: "singles" },
  divisions = 1,
) {
  const season = await send("POST", "/v1/seasons", club.key, {
    name: `Season ${randomUUID().slice(0, 6)}`,
    starts_on: "2026-04-01",
    ends_on: "2026-06-30",
    results_deadline_at: "2026-06-30T23:59:00+01:00",
  });
  assert.equal(season.status, 201, JSON.stringify(season.body));
  assert.equal((await send("PATCH", `/v1/seasons/${season.body.id}`, club.key, { state: "active" })).status, 200);
  const comp = await send("POST", "/v1/competitions", club.key, {
    season_id: season.body.id,
    name: "Men's Singles",
    match_format: "best_of_3_champions_tiebreak",
    ...competition,
  });
  assert.equal(comp.status, 201, JSON.stringify(comp.body));
  const divisionIds: string[] = [];
  for (let i = 0; i < divisions; i++) {
    const d = await send("POST", `/v1/competitions/${comp.body.id}/divisions`, club.key, {});
    assert.equal(d.status, 201, JSON.stringify(d.body));
    divisionIds.push(d.body.id);
  }
  return { seasonId: season.body.id as string, competitionId: comp.body.id as string, divisionIds };
}

export async function enter(club: TestClub, competitionId: string, divisionId: string, memberIds: string[]) {
  const res = await send("POST", `/v1/competitions/${competitionId}/entries`, club.key, {
    division_id: divisionId,
    member_ids: memberIds,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as string;
}

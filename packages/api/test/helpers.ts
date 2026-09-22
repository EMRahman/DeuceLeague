// What every API test file needs: the app, against the real, freshly migrated
// Postgres that `npm run db:verify` starts. DATABASE_URL connects as
// deuceleague_app, the way the server does; MIGRATION_DATABASE_URL is the
// owner, used only to set up and inspect states a request cannot.

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
export const app = createApp({ db, log: () => {} });

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

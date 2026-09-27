import type { D1Database } from "@cloudflare/workers-types";
import { eventStatement } from "./identity.js";
import { leagueStatements } from "./league.js";
import type { LeagueEvent, LeagueWrite } from "./league-types.js";

export type InstallationSample = {
  members: { id: string; displayName: string; email: string | null }[];
  changes: LeagueWrite[];
  events: LeagueEvent[];
};

/** Prepared only during initial bootstrap, never committed separately. */
export function sampleStatements(db: D1Database, clubId: string, sample: InstallationSample) {
  return [
    db.prepare(`INSERT INTO member (id, club_id, display_name, email)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.displayName'),
        json_extract(value, '$.email') FROM json_each(?)`).bind(clubId, JSON.stringify(sample.members)),
    ...leagueStatements(db, clubId, sample.changes),
    ...sample.events.map((e) => eventStatement(db, clubId, e.type, e.subjectType, e.id,
      { type: "system", id: null }, e.payload)),
    eventStatement(db, clubId, "installation.sample.created", "club", clubId,
      { type: "system", id: null }, { preset: "starter-v1", members: 4, competitions: 2, matches: 7 }),
  ];
}

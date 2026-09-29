import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import { commitAuthorized, eventStatement, readIdentity, type CredentialKind, type IdentitySnapshot } from "./identity.js";
import type { CourtLocationRecord, WeatherRecord, WeatherUnits } from "./admin-types.js";

type Row = Record<string, unknown>;
const rows = (result: D1Result): Row[] => result.results as Row[];
const date = (value: unknown): Date => new Date(Number(value));

function courtRecord(row: Row): CourtLocationRecord {
  return {
    id: String(row.id), name: String(row.name), latitude: Number(row.latitude), longitude: Number(row.longitude),
    createdAt: date(row.created_at), updatedAt: date(row.updated_at),
  };
}

function weatherReads(db: D1Database): D1PreparedStatement[] {
  return [
    db.prepare("SELECT weather_units FROM club WHERE singleton = 1"),
    db.prepare(`SELECT id, name, latitude, longitude, created_at, updated_at FROM court_location
      WHERE club_id = (SELECT id FROM club WHERE singleton = 1) ORDER BY id`),
  ];
}

function weatherRecord(units: D1Result, courts: D1Result): WeatherRecord {
  const row = rows(units)[0]!;
  return { units: String(row.weather_units) as WeatherUnits, courtLocations: rows(courts).map(courtRecord) };
}

function courtRead(db: D1Database, id: string) {
  return db.prepare(`SELECT id, name, latitude, longitude, created_at, updated_at FROM court_location
    WHERE id = ? AND club_id = (SELECT id FROM club WHERE singleton = 1)`).bind(id);
}

function audit(db: D1Database, state: IdentitySnapshot, type: string, subjectId: string, payload: object = {}) {
  const credential = state.credential!;
  return eventStatement(db, credential.club_id, type, "court_location", subjectId,
    credential.kind === "api_key" ? { type: "api_key", id: credential.id } : { type: "member", id: credential.member_id! }, payload);
}

export async function readWeatherAdmin(db: D1Database, hash: string, kind: CredentialKind) {
  const identity = await readIdentity(db, hash, kind, null, weatherReads(db));
  return { identity, weather: weatherRecord(identity.extraResults[0]!, identity.extraResults[1]!) };
}

export async function updateWeatherAdmin(db: D1Database, state: IdentitySnapshot, units: WeatherUnits): Promise<WeatherRecord> {
  const credential = state.credential!;
  const result = await commitAuthorized(db, state, [
    db.prepare("UPDATE club SET weather_units = ?, updated_at = ? WHERE id = ?").bind(units, state.now, state.club!.id),
    eventStatement(db, credential.club_id, "weather.updated", "club", state.club!.id,
      credential.kind === "api_key" ? { type: "api_key", id: credential.id } : { type: "member", id: credential.member_id! }, { changed: ["units"] }),
    ...weatherReads(db),
  ]);
  return weatherRecord(result.at(-2)!, result.at(-1)!);
}

export async function createCourtLocation(db: D1Database, state: IdentitySnapshot, input: {
  id: string; name: string; latitude: number; longitude: number;
}): Promise<CourtLocationRecord> {
  const result = await commitAuthorized(db, state, [
    db.prepare("INSERT INTO court_location (id, club_id, name, latitude, longitude) VALUES (?, ?, ?, ?, ?)")
      .bind(input.id, state.club!.id, input.name, input.latitude, input.longitude),
    audit(db, state, "court_location.created", input.id),
    courtRead(db, input.id),
  ]);
  return courtRecord(rows(result.at(-1)!)[0]!);
}

export async function updateCourtLocation(db: D1Database, state: IdentitySnapshot, id: string, changes: {
  name?: string; latitude?: number; longitude?: number;
}): Promise<CourtLocationRecord> {
  const result = await commitAuthorized(db, state, [
    db.prepare(`UPDATE court_location SET name = coalesce(?, name), latitude = coalesce(?, latitude),
      longitude = coalesce(?, longitude), updated_at = ? WHERE id = ? AND club_id = ?`)
      .bind(changes.name ?? null, changes.latitude ?? null, changes.longitude ?? null, state.now, id, state.club!.id),
    audit(db, state, "court_location.updated", id, { changed: Object.keys(changes) }),
    courtRead(db, id),
  ]);
  return courtRecord(rows(result.at(-1)!)[0]!);
}

export async function deleteCourtLocation(db: D1Database, state: IdentitySnapshot, id: string): Promise<void> {
  await commitAuthorized(db, state, [
    db.prepare("DELETE FROM court_location WHERE id = ? AND club_id = ?").bind(id, state.club!.id),
    audit(db, state, "court_location.deleted", id),
  ]);
}

/**
 * The website's whole view of DeuceLeague: HTTP calls to the API, each with a
 * credential. Written by hand from /openapi.json for the few shapes it needs;
 * a club extending the site might generate a client instead.
 */

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** An RFC 9457 problem, as the API reports every failure. */
export type Problem = {
  status: number;
  code: string;
  title: string;
  detail?: string;
  errors?: { path: string; message: string }[];
};

export class ApiProblem extends Error {
  readonly problem: Problem;
  constructor(problem: Problem) {
    super(`${problem.status} ${problem.code}: ${problem.detail ?? problem.title}`);
    this.problem = problem;
  }
}

export type Api = <T = unknown>(method: string, path: string, credential: string, body?: unknown) => Promise<T>;

export function apiClient(baseUrl: string, fetcher: Fetch = fetch): Api {
  return async (method, path, credential, body) => {
    const res = await fetcher(new URL(path, baseUrl).href, {
      method,
      headers: {
        authorization: `Bearer ${credential}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new ApiProblem(json?.code ? json : { status: res.status, code: "http_error", title: res.statusText });
    }
    return json;
  };
}

// ─────────────────────────────────────── the shapes the website reads ──

export type Side = 0 | 1;
export type Page<T> = { data: T[]; next_cursor: string | null };
export type SetScore = { games: [number, number]; tiebreak?: [number, number] };
export type Score = { sets: SetScore[] };
export type Outcome = "completed" | "retired" | "walkover" | "conceded" | "unplayed";

export type Me = {
  club: { id: string; slug: string; name: string; timezone: string };
  credential: { type: "session"; id: string; member: { id: string; display_name: string } } | { type: "api_key" };
};

export type Season = { id: string; name: string; state: string; results_deadline_at: string | null };

export type MatchFormat = {
  setsToWin: number;
  set: { gamesToWin: number };
  finalSet: { type: "standard" } | { type: "champions_tiebreak"; to: number };
};

export type Competition = {
  id: string;
  season_id: string;
  name: string;
  discipline: "singles" | "doubles";
  match_format: MatchFormat;
  state: "draft" | "active" | "complete" | "archived";
};

export type Entry = {
  id: string;
  competition_id: string;
  division_id: string;
  label: string;
  members: { id: string; display_name: string }[];
  state: "active" | "withdrawn";
  opted_out_at: string | null;
};

export type Result = {
  outcome: Outcome;
  score: Score | null;
  winning_side: Side | null;
  retired_side: Side | null;
  played_on: string | null;
};

export type Match = {
  id: string;
  competition_id: string;
  division_id: string | null;
  status: "open" | "reported" | "played" | "disputed";
  sides: { side: Side; entry_id: string | null; label: string | null }[];
  result: Result | null;
};

export type Claim = {
  id: string;
  side: Side | null;
  outcome: Outcome;
  score: Score | null;
  retired_side: Side | null;
  played_on: string | null;
  state: "pending" | "confirmed" | "superseded";
  accepts_claim_id: string | null;
};

export type MatchDetail = Match & { claims: Claim[]; waiting_on: Side | null; differences: string[] };

export type StandingsRow = {
  position: number | null;
  standing: "ranked" | "unranked" | "withdrawn";
  entry_id: string;
  label: string;
  points: number;
  played: number;
  won: number;
  lost: number;
  outstanding: number;
};

export type Standings = {
  final: boolean;
  divisions: { division_id: string; name: string; rows: StandingsRow[] }[];
};

export type Member = { id: string; display_name: string; deleted_at: string | null };

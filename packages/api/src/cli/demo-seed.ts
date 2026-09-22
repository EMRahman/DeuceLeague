import { createHmac } from "node:crypto";
import {
  assertRowLevelSecurityApplies,
  connect,
  createApiKey,
  createClub,
  recordEvent,
  setClub,
  SYSTEM,
  violatedUniqueConstraint,
} from "@deuceleague/db";
import { DEFAULT_RULES, Scope, type RulesSpec } from "@deuceleague/schema";
import { createApp } from "../app.js";
import { generateApiKey, hashKey, KEY_PREFIX } from "../keys.js";

/**
 * npm run demo:seed
 *
 * Fills a fresh database with fake clubs for the demo instance: a spring
 * season played out, and a summer season under way whose competitions were
 * filled by placements from the spring tables. Every step goes through the
 * API itself, in-process, so the demo shows exactly what the API does.
 *
 * Prints one read-only key per club — nothing in the API is readable without
 * one. With DEMO_KEY_SEED set, the keys come out the same on every rebuild, so
 * they can be published; they read fake clubs and nothing else. The demo is
 * rebuilt from an empty database, so this refuses to run where its clubs
 * already exist.
 */

type Api = (method: string, path: string, body?: unknown) => Promise<any>;

/** A small, seeded random-number generator, so the demo comes out the same every night. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MEN = [
  "Sam K.", "Alex P.", "Jordan M.", "Chris D.", "Tom W.", "Raj S.", "Ben H.", "Luca R.",
  "Omar F.", "Dan C.", "Kenji T.", "Will B.", "Mateo G.",
];
const WOMEN = [
  "Priya N.", "Emma L.", "Chloe B.", "Aisha K.", "Hannah J.", "Sofia R.", "Grace T.", "Mei W.",
  "Lucy A.", "Zara Q.", "Ines V.", "Ruth O.", "Nadia E.", "Kate M.", "Fern D.", "Ola S.",
];
const OPEN = ["Jess F.", "Marcus L.", "Ngozi A.", "Pete R.", "Yuki H."];

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** A score for this format, won by `winner`: two sets, or three with a champions tiebreak. */
function scoreFor(rng: () => number, winner: 0 | 1) {
  const set = (): [number, number] => {
    const r = rng();
    return r < 0.12 ? [7, 5] : r < 0.25 ? [7, 6] : [6, Math.floor(rng() * 5)];
  };
  const forWinner = ([w, l]: [number, number]) => ({ games: winner === 0 ? [w, l] : [l, w] });
  const forLoser = ([w, l]: [number, number]) => ({ games: winner === 0 ? [l, w] : [w, l] });
  if (rng() < 0.7) return { sets: [forWinner(set()), forWinner(set())] };
  const tiebreak: [number, number] = rng() < 0.8 ? [10, Math.floor(rng() * 9)] : [11, 9];
  return { sets: [forWinner(set()), forLoser(set()), forWinner(tiebreak)] };
}

/**
 * Records results for a division's matches the ways real players do. The
 * stronger entry — earlier in `strength` — usually wins. `share` is how many
 * of the matches get anywhere; `settled` leaves none waiting or disputed.
 */
async function play(
  api: Api,
  rng: () => number,
  divisionId: string,
  strength: string[],
  options: { share: number; settled: boolean; from: number; to: number },
) {
  const { data: matches } = await api("GET", `/v1/matches?division_id=${divisionId}&limit=200`);
  for (const m of matches) {
    if (rng() > options.share) continue;
    const [a, b] = m.sides.map((s: { entry_id: string }) => strength.indexOf(s.entry_id));
    const favourite: 0 | 1 = a < b ? 0 : 1;
    const winner: 0 | 1 = rng() < 0.5 + Math.min(0.35, Math.abs(a - b) * 0.07) ? favourite : favourite === 0 ? 1 : 0;
    const score = scoreFor(rng, winner);
    const played_on = day(options.from + Math.floor(rng() * (options.to - options.from)));
    const claim = (side: 0 | 1, s: unknown = score) =>
      api("POST", `/v1/matches/${m.id}/claims`, { side, outcome: "completed", score: s, played_on, source: "web" });

    const r = rng();
    if (options.settled && r < 0.03) {
      await api("POST", `/v1/matches/${m.id}/settle`, { outcome: "walkover", retired_side: winner === 0 ? 1 : 0 });
    } else if (options.settled && r < 0.1) {
      await api("POST", `/v1/matches/${m.id}/settle`, { outcome: "completed", score, played_on });
    } else if (r < 0.6) {
      await claim(0);
      await claim(1);
    } else if (r < 0.85 || options.settled) {
      const reported = await claim(winner);
      await api("POST", `/v1/matches/${m.id}/claims/${reported.claims[0].id}/accept`, { source: "telegram" });
    } else if (r < 0.95) {
      await claim(winner);
    } else {
      // The score remembered differently: the dispute the players will sort out.
      let other = scoreFor(rng, winner);
      while (JSON.stringify(other) === JSON.stringify(score)) other = scoreFor(rng, winner);
      await claim(0);
      await claim(1, other);
    }
  }
}

async function seedDeuce(api: Api, rng: () => number) {
  const men: string[] = [];
  for (const name of MEN) men.push((await api("POST", "/v1/members", { display_name: name })).id);
  const women: string[] = [];
  for (const name of WOMEN) women.push((await api("POST", "/v1/members", { display_name: name })).id);

  const year = new Date().getUTCFullYear();
  const spring = await api("POST", "/v1/seasons", {
    name: `Spring ${year}`,
    kind: "spring",
    year,
    starts_on: day(-150),
    ends_on: day(-60),
    // A season that is already over, built in one run: the results go in while
    // the deadline is still ahead — it is a cut-off — and it is set back to
    // where it belongs once they are all in.
    results_deadline_at: `${day(1)}T22:59:00Z`,
  });
  await api("PATCH", `/v1/seasons/${spring.id}`, { state: "active" });

  const doublesRules = { ...DEFAULT_RULES, movement: { ...DEFAULT_RULES.movement, promote: 1, relegate: 1 } };
  const leagues: {
    name: string;
    discipline: string;
    category: string;
    units: string[][];
    size: number;
    rules?: RulesSpec;
  }[] = [
    { name: "Men's Singles", discipline: "singles", category: "mens", units: men.slice(0, 12).map((m) => [m]), size: 6 },
    {
      name: "Women's Doubles",
      discipline: "doubles",
      category: "womens",
      units: Array.from({ length: 8 }, (_, i) => [women[2 * i]!, women[2 * i + 1]!]),
      size: 4,
      rules: doublesRules,
    },
  ];

  // Spring: entered, played out and completed.
  const springCompetitions: Record<string, string> = {};
  for (const league of leagues) {
    const competition = await api("POST", "/v1/competitions", {
      season_id: spring.id,
      name: league.name,
      discipline: league.discipline,
      category: league.category,
      match_format: "best_of_3_champions_tiebreak",
      ...(league.rules ? { rules: league.rules } : {}),
    });
    springCompetitions[league.name] = competition.id;
    const strength: string[] = [];
    for (let d = 0; d < league.units.length / league.size; d++) {
      const division = await api("POST", `/v1/competitions/${competition.id}/divisions`, {});
      for (const unit of league.units.slice(d * league.size, (d + 1) * league.size)) {
        const entry = await api("POST", `/v1/competitions/${competition.id}/entries`, {
          division_id: division.id,
          member_ids: unit,
          placement_reason: "new",
        });
        strength.push(entry.id);
      }
      await api("POST", `/v1/divisions/${division.id}/fixtures`);
    }
    // Shuffled, so the tables are not simply the order of entry.
    strength.sort(() => rng() - 0.5);
    await api("PATCH", `/v1/competitions/${competition.id}`, { state: "active" });
    for (const division of (await api("GET", `/v1/competitions/${competition.id}/divisions`)).data) {
      await play(api, rng, division.id, strength, { share: 1, settled: true, from: -148, to: -62 });
    }
    await api("PATCH", `/v1/competitions/${competition.id}`, { state: "complete" });
  }
  await api("PATCH", `/v1/seasons/${spring.id}`, { results_deadline_at: `${day(-60)}T22:59:00Z` });
  await api("PATCH", `/v1/seasons/${spring.id}`, { state: "complete" });

  // Summer: filled from the spring tables, adjusted, and under way.
  const summer = await api("POST", "/v1/seasons", {
    name: `Summer ${year}`,
    kind: "summer",
    year,
    starts_on: day(-30),
    ends_on: day(40),
    results_deadline_at: `${day(40)}T22:59:00Z`,
  });
  await api("PATCH", `/v1/seasons/${summer.id}`, { state: "active" });
  for (const league of leagues) {
    const competition = await api("POST", "/v1/competitions", {
      season_id: summer.id,
      name: league.name,
      discipline: league.discipline,
      category: league.category,
      match_format: "best_of_3_champions_tiebreak",
      previous_competition_id: springCompetitions[league.name],
      ...(league.rules ? { rules: league.rules } : {}),
    });
    const placements = await api("POST", `/v1/competitions/${competition.id}/placements`);
    const divisions = (await api("GET", `/v1/competitions/${competition.id}/divisions`)).data;
    if (league.discipline === "singles") {
      // A newcomer, placed by the coach at the bottom.
      await api("POST", `/v1/competitions/${competition.id}/entries`, {
        division_id: divisions.at(-1).id,
        member_ids: [men[12]],
        placement_reason: "new",
      });
    }
    await api("PATCH", `/v1/competitions/${competition.id}`, { state: "active" });
    const strength = placements.placed.map((p: { entry_id: string }) => p.entry_id).sort(() => rng() - 0.5);
    for (const division of divisions) {
      await api("POST", `/v1/divisions/${division.id}/fixtures`);
      await play(api, rng, division.id, strength, { share: 0.55, settled: false, from: -28, to: -1 });
    }
  }
}

async function seedAdvantage(api: Api, rng: () => number) {
  const players: string[] = [];
  for (const name of OPEN) players.push((await api("POST", "/v1/members", { display_name: name })).id);
  const year = new Date().getUTCFullYear();
  const season = await api("POST", "/v1/seasons", {
    name: `Summer ${year}`,
    starts_on: day(-20),
    ends_on: day(50),
    results_deadline_at: `${day(50)}T22:59:00Z`,
  });
  await api("PATCH", `/v1/seasons/${season.id}`, { state: "active" });
  const competition = await api("POST", "/v1/competitions", {
    season_id: season.id,
    name: "Open Singles",
    discipline: "singles",
    match_format: "pro_set_8",
  });
  const division = await api("POST", `/v1/competitions/${competition.id}/divisions`, { name: "Box A" });
  const strength: string[] = [];
  for (const p of players) {
    strength.push((await api("POST", `/v1/competitions/${competition.id}/entries`, { division_id: division.id, member_ids: [p] })).id);
  }
  await api("POST", `/v1/divisions/${division.id}/fixtures`);
  await api("PATCH", `/v1/competitions/${competition.id}`, { state: "active" });
  const { data: matches } = await api("GET", `/v1/matches?division_id=${division.id}`);
  for (const m of matches) {
    if (rng() > 0.5) continue;
    const winner: 0 | 1 = rng() < 0.5 ? 0 : 1;
    const loserGames = Math.floor(rng() * 7);
    const games = winner === 0 ? [8, loserGames] : [loserGames, 8];
    await api("POST", `/v1/matches/${m.id}/settle`, { outcome: "completed", score: { sets: [{ games }] }, played_on: day(-5) });
  }
}

const CLUBS = [
  { slug: "demo-deuce", name: "Deuce Lawn Tennis Club (demo)", timezone: "Europe/London", seed: seedDeuce },
  { slug: "demo-advantage", name: "Advantage Tennis Club (demo)", timezone: "America/New_York", seed: seedAdvantage },
];

function fail(message: string): never {
  console.error(`demo:seed: ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) fail("set DATABASE_URL — the same connection the server uses, as deuceleague_app");
const keySeed = process.env.DEMO_KEY_SEED;

const { db, close } = connect(url);
try {
  await assertRowLevelSecurityApplies(db);

  const app = createApp({ db, log: () => {} });
  const printed: string[] = [];
  for (const club of CLUBS) {
    // The admin key does the seeding and is never shown: the demo is read-only.
    const admin = generateApiKey();
    const { clubId } = await createClub(db, {
      slug: club.slug,
      name: club.name,
      timezone: club.timezone,
      adminKey: { name: "demo:seed", hash: admin.hash, prefix: admin.prefix, scopes: [...Scope.options] },
    }).catch((error: unknown) => {
      if (violatedUniqueConstraint(error) === "club_slug_unique") {
        fail(`the club ${club.slug} already exists. The demo is rebuilt from an empty database.`);
      }
      throw error;
    });
    const api: Api = async (method, path, body) => {
      const res = await app.request(path, {
        method,
        headers: { authorization: `Bearer ${admin.key}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json?.detail ?? json?.title ?? text}`);
      return json;
    };
    await club.seed(api, mulberry32([...club.slug].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)));

    // With a seed, the same key every night; without one, a fresh key each run.
    const key = keySeed
      ? KEY_PREFIX + createHmac("sha256", keySeed).update(club.slug).digest("base64url")
      : generateApiKey().key;
    await db.transaction(async (tx) => {
      await setClub(tx, clubId);
      const made = await createApiKey(tx, clubId, {
        name: "Demo read-only key",
        hash: hashKey(key),
        prefix: key.slice(0, KEY_PREFIX.length + 6),
        scopes: ["league:read"],
        expiresAt: null,
      });
      await recordEvent(tx, clubId, {
        type: "api_key.created",
        subjectType: "api_key",
        subjectId: made.id,
        actor: SYSTEM,
        payload: { name: made.name, scopes: made.scopes },
      });
    });
    printed.push(`  ${club.name} (${club.slug})\n    read key: ${key}`);
  }

  console.log(
    `Seeded ${CLUBS.length} demo clubs. Each key reads its club and nothing else; try GET /v1/competitions:\n\n` +
      printed.join("\n\n"),
  );
} finally {
  await close();
}

// Deterministic, in-process scenario using the current validation and league engine.
// This models human and persistence steps; it does not claim to exercise Worker routes.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { roundRobin, judgeClaims, computeStandings, planPlacements } from "@deuceleague/engine";
import { DEFAULT_RULES, MATCH_FORMATS, validateResult } from "@deuceleague/schema";
import { readJoinForm, PRIVACY_NOTICE } from "../../adapters/website/dist/join.js";
import { joinConfig } from "../../deploy/cloudflare/dist/website-config.js";

let state = 20261007;
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
const first = ["Ava", "Ben", "Chloe", "Daniel", "Ella", "Farah", "Grace", "Hannah", "Imran", "Jack", "Kira", "Leo", "Maya", "Nadia", "Omar", "Priya", "Ravi", "Sara", "Tomasz", "Uma", "Vera", "Will", "Yasmin", "Zoe"];
const last = ["Adams", "Barker", "Cole", "Dawson", "Evans", "Farrell", "Green"];
const rules = structuredClone(DEFAULT_RULES);
rules.movement = { promote: 2, relegate: 2, minMatchesForPromotion: 2 };
const doublesRules = structuredClone(rules);
doublesRules.movement = { promote: 1, relegate: 1, minMatchesForPromotion: 2 };
const format = MATCH_FORMATS.best_of_3_champions_tiebreak;
const output = { seed: 20261007, signup: {}, seasons: [], whatsapp: [], checks: {}, method: "in-process model" };
const contact = (round, sender, recipient, message, result) => output.whatsapp.push({ round, sender, recipient, message, result });

// All 150 begin outside the member list and use the latest join-form parser.
const applications = [];
const members = [];
for (let i = 0; i < 150; i++) {
  const form = { first_name: first[i % first.length], surname: last[Math.floor(i / first.length)],
    email: `member-${i + 1}@example.invalid`, phone: `07700${String(900000 + i).slice(-6)}`,
    gender: i < 75 ? "male" : "female", age_group: "35_49", plays: i % 75 < 44 ? "all" : "not_now", privacy: "yes" };
  const read = readJoinForm(form);
  assert.deepEqual(read.problems, []);
  applications.push({ ...read.values, id: `request-${i + 1}` });
}
assert.equal(members.length, 0);
output.signup = { applications: applications.length, members_before_approval: members.length,
  default_daily_cap: joinConfig({}).perDay, configured_daily_cap_for_launch: joinConfig({ SIGNUPS_PER_DAY: "1000" }).perDay,
  required_ip_buckets_at_50_each: 3,
  privacy_notice: PRIVACY_NOTICE, approved: 0, social: 0, interested: 0, signed_in: 0 };
for (const [i, application] of applications.entries()) {
  const member = { id: `member-${i + 1}`, name: `${application.first_name} ${application.surname}`,
    gender: application.gender, wants: application.plays, level: 1 + (i % 10), signedIn: application.plays !== "not_now" };
  members.push(member);
}
output.signup.approved = members.length;
output.signup.social = members.filter((m) => m.wants === "not_now").length;
output.signup.interested = members.length - output.signup.social;
output.signup.signed_in = members.filter((m) => m.signedIn).length;
contact("launch", "Coach", "Club group", "Please apply through the join page and choose what you want to play. I will place you after approval.", "150 applications modeled");
contact("launch", "Coach", "League applicants", "Your one-use sign-in link works for seven days. Open it on the phone you will use for league results.", "88 sign-ins modeled");

const byId = new Map(members.map((m) => [m.id, m]));
const men = members.slice(0, 75), women = members.slice(75);
const specs = [
  { name: "Men's Singles", discipline: "singles", pool: men.slice(0, 32), divisions: 4, size: 8 },
  { name: "Women's Singles", discipline: "singles", pool: women.slice(0, 32), divisions: 4, size: 8 },
  { name: "Men's Doubles", discipline: "doubles", pool: men.slice(0, 24), divisions: 2, size: 6 },
  { name: "Women's Doubles", discipline: "doubles", pool: women.slice(0, 24), divisions: 2, size: 6 },
  { name: "Mixed Doubles", discipline: "doubles", pool: [...men.slice(32, 44), ...women.slice(32, 44)], divisions: 2, size: 6 },
];
const makeFirst = (spec) => Array.from({ length: spec.divisions }, (_, d) => {
  const group = spec.discipline === "singles" ? spec.pool.slice(d * 8, d * 8 + 8).map((m) => [m])
    : spec.name === "Mixed Doubles" ? Array.from({ length: 6 }, (_, j) => [spec.pool[d * 6 + j], spec.pool[12 + d * 6 + j]])
      : Array.from({ length: 6 }, (_, j) => [spec.pool[d * 12 + j * 2], spec.pool[d * 12 + j * 2 + 1]]);
  return { ordinal: d + 1, name: `Division ${d + 1}`, entries: group.map((players, n) => ({
    id: `${spec.name.replace(/\W/g, "")}-s1-d${d + 1}-e${n + 1}`, memberIds: players.map((p) => p.id),
    label: players.map((p) => p.name).join(" / "), withdrawn: false })) };
});
let current = new Map(specs.map((s) => [s.name, makeFirst(s)]));
const scoreFor = (winner) => ({ sets: [
  { games: winner === 0 ? [6, 4] : [4, 6] }, { games: winner === 0 ? [6, 3] : [3, 6] },
] });
const claim = (score) => ({ outcome: "completed", score, retiredSide: null });
function playSeason(index, divisionsBySpec) {
  const season = { name: index === 1 ? "Spring 2026" : "Summer 2026", competitions: 5, divisions: 14,
    fixtures: 0, both_agreed: 0, disputes: 0, whatsapp_corrections: 0, coach_decisions: 0,
    one_sided_unresolved: 0, never_arranged: 0, played: 0, standings_rows: 0, draft: null };
  const standingsBySpec = new Map();
  for (const spec of specs) {
    const tables = [];
    const divisions = divisionsBySpec.get(spec.name);
    for (const division of divisions) {
      const entries = division.entries;
      assert.equal(new Set(entries.flatMap((e) => e.memberIds)).size, entries.flatMap((e) => e.memberIds).length);
      const matches = roundRobin(entries.map((e) => e.id)).map((pair, n) => ({ id: `${index}-${spec.name}-${division.ordinal}-${n}`,
        side0: pair.side0, side1: pair.side1, status: "open", outcome: null, winningSide: null, retiredSide: null, score: null }));
      season.fixtures += matches.length;
      const entryOf = new Map(entries.map((e) => [e.id, e]));
      for (const [n, match] of matches.entries()) {
        const a = entryOf.get(match.side0), b = entryOf.get(match.side1);
        const round = `${season.name} W${1 + (n % 10)}`;
        const organizer = byId.get((random() < 0.5 ? a : b).memberIds[0]);
        const opponent = byId.get((organizer.id === a.memberIds[0] ? b : a).memberIds[0]);
        const roll = random();
        if (roll < 0.08) { season.never_arranged++; continue; }
        if (output.whatsapp.length < 28) contact(round, organizer.name, opponent.name,
          "Could we play Saturday morning? I can book a court. Please enter your score after.", "arranged off-platform");
        const strength0 = a.memberIds.reduce((n, id) => n + (11 - byId.get(id).level), 0) / a.memberIds.length;
        const strength1 = b.memberIds.reduce((n, id) => n + (11 - byId.get(id).level), 0) / b.memberIds.length;
        const chance0 = Math.max(0.15, Math.min(0.85, 0.5 + (strength0 - strength1) * 0.045));
        const winner = random() < chance0 ? 0 : 1;
        const score = scoreFor(winner);
        assert.equal(validateResult({ outcome: "completed", score, retiredSide: null }, format).winningSide, winner);
        const first = claim(score);
        assert.equal(judgeClaims(first, null).status, "reported");
        if (roll < 0.20) {
          if (random() < 0.48) { match.status = "played"; match.outcome = "completed"; match.winningSide = winner;
            match.score = score; season.coach_decisions++; season.played++; }
          else { match.status = "reported"; season.one_sided_unresolved++; }
          continue;
        }
        if (roll < 0.26) {
          const wrong = structuredClone(score);
          wrong.sets[1].games[winner === 0 ? 1 : 0] = 2;
          assert.equal(judgeClaims(first, claim(wrong)).status, "disputed");
          season.disputes++;
          if (random() < 0.68) {
            assert.equal(judgeClaims(first, claim(score)).status, "played");
            season.whatsapp_corrections++;
            if (output.whatsapp.length < 50) contact(round, organizer.name, opponent.name,
              "The site says our scores differ. I have 6-4 6-3. Can you check your second set?", "opponent corrects typo");
          } else season.coach_decisions++;
        } else { assert.equal(judgeClaims(first, claim(score)).status, "played"); season.both_agreed++; }
        match.status = "played"; match.outcome = "completed"; match.winningSide = winner; match.score = score; season.played++;
      }
      const table = computeStandings({ entries, matches, rules: spec.discipline === "singles" ? rules : doublesRules,
        format, deadlinePassed: true });
      assert.equal(table.length, entries.length);
      assert.ok(table.every((row) => row.points === row.matches.reduce((n, m) => n + m.points, 0) + row.allPlayedBonus));
      season.standings_rows += table.length;
      tables.push({ ordinal: division.ordinal, name: division.name, standings: table });
    }
    standingsBySpec.set(spec.name, tables);
  }
  output.seasons.push(season);
  return standingsBySpec;
}

const firstTables = playSeason(1, current);
// Coach and players handle two opt-outs and a doubles partner change through WhatsApp.
const optedOut = new Set();
const breakingUp = new Map();
for (const spec of specs) {
  const divisions = current.get(spec.name);
  if (spec.name === "Men's Singles") optedOut.add(divisions[0].entries[0].id);
  if (spec.name === "Women's Singles") optedOut.add(divisions[0].entries[1].id);
  if (spec.name === "Mixed Doubles") breakingUp.set(divisions[1].entries[0].id, "partners asked to change after WhatsApp discussion");
}
contact("turnover", "Mixed player", "Former partner", "I am looking for a different partner next season. Can we tell the coach before the draft?", "pair omitted from automatic carry-over");
const next = new Map();
const draft = [];
for (const spec of specs) {
  const oldDivisions = current.get(spec.name);
  const target = oldDivisions.map((d) => ({ ordinal: d.ordinal, name: d.name }));
  const plan = planPlacements(firstTables.get(spec.name), spec.discipline === "singles" ? rules.movement : doublesRules.movement,
    target, optedOut, new Map(), breakingUp);
  const oldEntries = new Map(oldDivisions.flatMap((d) => d.entries.map((e) => [e.id, e])));
  const divisions = target.map((d) => ({ ...d, entries: [] }));
  for (const suggestion of plan.suggestions.filter((x) => x.to !== null)) {
    const old = oldEntries.get(suggestion.entryId);
    divisions[suggestion.to - 1].entries.push({ ...old, id: `${old.id}-s2`, withdrawn: false });
  }
  if (spec.name === "Mixed Doubles") {
    const departed = oldEntries.get([...breakingUp.keys()][0]);
    const m = departed.memberIds;
    const spare = members[99].id;
    divisions[1].entries.push({ id: "new-mixed-pair-s2", memberIds: [m[0], spare],
      label: [m[0], spare].map((id) => byId.get(id).name).join(" / "), withdrawn: false });
  }
  next.set(spec.name, divisions);
  draft.push({ competition: spec.name, carried: plan.suggestions.filter((x) => x.to !== null).length,
    omitted: plan.suggestions.filter((x) => x.to === null).length, vacancies: plan.vacancies.length,
    sizes: divisions.map((d) => d.entries.length), reasons: plan.suggestions.reduce((out, x) => (
      out[x.reason ?? "omitted"] = (out[x.reason ?? "omitted"] ?? 0) + 1, out), {}) });
}
output.seasons[0].draft = draft;
playSeason(2, next);
output.checks = { fixtures_first: output.seasons[0].fixtures, fixtures_second: output.seasons[1].fixtures,
  all_150_applied_before_approval: output.signup.members_before_approval === 0 && output.signup.approved === 150,
  tables_from_current_engine: true, claims_from_current_engine: true, placements_from_current_engine: true };
assert.equal(output.seasons[0].fixtures, 314);
assert.equal(output.seasons.length, 2);
await writeFile(new URL("model-results.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ signup: output.signup, seasons: output.seasons.map((s) => ({ name: s.name, fixtures: s.fixtures,
  played: s.played, disputes: s.disputes, coach_decisions: s.coach_decisions })) }, null, 2));

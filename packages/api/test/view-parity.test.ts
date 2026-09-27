import assert from "node:assert/strict";
import { after, test } from "node:test";
import { daysRemaining, progressCounts } from "../dist/league/progress.js";
import { closeAll, owner, newClub, league, enter, member, send } from "./helpers.ts";

after(closeAll);

test("D1 calendar-day calculations match PostgreSQL across zones, DST, leap days and past deadlines", async () => {
  const cases = [
    ["2026-03-28T23:30:00Z", "2026-03-29T23:30:00Z"],
    ["2026-10-24T23:30:00Z", "2026-10-25T23:30:00Z"],
    ["2028-02-28T23:59:00Z", "2028-03-01T00:01:00Z"],
    ["2026-06-30T10:30:00Z", "2026-06-30T23:30:00Z"],
    ["2026-07-01T01:00:00Z", "2026-06-29T01:00:00Z"],
  ];
  for (const zone of ["Europe/London", "America/New_York", "Pacific/Kiritimati", "America/Los_Angeles", "Asia/Kathmandu", "UTC"]) {
    for (const [now, deadline] of cases) {
      const [row] = await owner`select ((${deadline}::timestamptz at time zone ${zone})::date - (${now}::timestamptz at time zone ${zone})::date) as days`;
      assert.equal(daysRemaining(new Date(deadline!), zone, new Date(now!)), Number(row!.days), `${zone}: ${now} to ${deadline}`);
    }
  }
});

test("D1 progress counting matches PostgreSQL's division view through report, dispute and settlement", async () => {
  const club = await newClub("view-parity"); const l = await league(club);
  for (let i = 0; i < 3; i++) await enter(club, l.competitionId, l.divisionIds[0]!, [await member(club)]);
  await send("POST", `/v1/divisions/${l.divisionIds[0]}/fixtures`, club.key);
  await send("PATCH", `/v1/competitions/${l.competitionId}`, club.key, { state: "active" });
  const matches = (await send("GET", `/v1/matches?competition_id=${l.competitionId}`, club.key)).body.data;
  const claim = { outcome: "completed", score: { sets: [{ games: [6, 1] }, { games: [6, 1] }] } };
  for (const action of [null, "report", "dispute", "settle"]) {
    if (action === "report") await send("POST", `/v1/matches/${matches[0].id}/claims`, club.key, { side: 0, ...claim });
    if (action === "dispute") await send("POST", `/v1/matches/${matches[0].id}/claims`, club.key, { side: 1, outcome: "walkover", retired_side: 0 });
    if (action === "settle") await send("POST", `/v1/matches/${matches[1].id}/settle`, club.key, claim);
    const rows = await owner<{ status: string }[]>`select status from match where division_id = ${l.divisionIds[0]!}`;
    const [view] = await owner`select * from division_progress where division_id = ${l.divisionIds[0]!}`;
    assert.deepEqual(progressCounts(rows), {
      matches: Number(view!.matches), played: Number(view!.played), outstanding: Number(view!.outstanding),
      reported: Number(view!.reported), disputed: Number(view!.disputed), percentPlayed: view!.percent_played === null ? null : Number(view!.percent_played),
    }, action ?? "open");
  }
});

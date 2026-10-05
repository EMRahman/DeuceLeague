import type { FC } from "hono/jsx";
import { claimToForm, describe, formatHint, playedOn, setRows, type Competition, type Match, type MatchDetail } from "@deuceleague/website";
import { Layout, type FeedEvent, type Frame } from "./views.js";
import { MIRRORED, mirrored, REASONS, type SettlementPreview } from "./results.js";

const namesOf = (m: Match): [string, string] => [0, 1].map(side => m.sides.find(s => s.side === side)?.label ?? `Side ${side + 1}`) as [string, string];
const where = (m: Match) => [m.competition_name, m.division_name].filter(Boolean).join(" · ");
const at = (value: string, timezone: string) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
const reasonLabel = (value: unknown) => REASONS.find(r => r.value === value)?.label ?? "Reason not recorded";

export const CoachMatches: FC<{
  frame: Frame; matches: Match[]; status: string; after: string | undefined; next: string | null;
}> = ({ frame, matches, status, after, next }) => (
  <Layout title="Find a match" frame={frame}>
    <h1>Find a match</h1>
    <p><a href="/coach/results">Results to sort out</a></p>
    <form method="get" action="/coach/matches">
      <label for="match-status">Show</label>{" "}
      <select id="match-status" name="status">
        {[["", "All matches"], ["open", "No entries yet"], ["reported", "Waiting for one side"], ["disputed", "Entries differ"], ["played", "Confirmed results"]].map(([value, label]) => (
          <option value={value} selected={status === value}>{label}</option>
        ))}
      </select>{" "}<button type="submit">Show matches</button>
    </form>
    <p class="muted">50 matches per page, including earlier seasons. Open a match to see both sides' entries, settle it or correct a confirmed result.</p>
    <ul class="list card">
      {matches.map(m => <li class="answer">
        <a href={`/coach/matches/${m.id}`}>{namesOf(m).join(" v ")}</a>
        <div class="muted">{where(m)} · {m.status === "played" ? "Confirmed" : m.status === "disputed" ? "Entries differ" : m.status === "reported" ? "Waiting for one side" : "No entries yet"}</div>
      </li>)}
    </ul>
    {matches.length === 0 && <p>No matches on this page.</p>}
    <p class="jump">
      {after && <a href={`/coach/matches?status=${status}`}>Back to the first page</a>}
      {next && <a href={`/coach/matches?status=${status}&after=${encodeURIComponent(next)}`}>Show the next 50</a>}
    </p>
  </Layout>
);

/** The entry each side stands by now: its newest one still pending. */
const pending = (match: MatchDetail, side: 0 | 1) => match.claims.findLast(c => c.side === side && c.state === "pending");

/** The current entries; offering each as the start of a decision only where one can be made. */
const Entries: FC<{ match: MatchDetail; timezone: string; deciding?: boolean }> = ({ match, timezone, deciding = false }) => {
  const names = namesOf(match);
  const claims = ([0, 1] as const).map(side => pending(match, side));
  return <section class="card">
    <h2>{match.result ? "Confirmed result" : "Current entries"}</h2>
    {match.result ? <p>{describe(match.result, 0, names)}{match.result.winning_side !== null && ` · Winner: ${names[match.result.winning_side]}`}</p> : (
      <div class="claims">{([0, 1] as const).map(side => {
        const claim = claims[side];
        return <div><strong>{names[side]}</strong>
          <p>{claim ? describe(claim, 0, names) : "No result entered yet."}</p>
          {/* Players type their own games first, so side 1's form reads the other way round from the line above. */}
          {claim?.score && <p class="muted">As typed on {names[side]}'s form, their games first: {describe(claim, side, names)}</p>}
          {claim && <span class="muted">Entered {at(claim.submitted_at, timezone)}</span>}
          {claim && deciding && <p><a href={`/coach/matches/${match.id}?use=${claim.id}#decide`}>Use {names[side]}'s entry</a></p>}
        </div>;
      })}</div>
    )}
    <p class="muted">
      Scores are written with {names[0]}'s games first. On their own form, every player types their games first, then
      their opponent's. Both sides' submissions are visible to the coach.
    </p>
    {!match.result && mirrored(claims[0], claims[1]) && <p>{MIRRORED}</p>}
  </section>;
};

const DecisionForm: FC<{ match: MatchDetail; competition: Competition; values: Record<string, string> }> = ({ match, competition, values }) => {
  const names = namesOf(match);
  const outcomes = [
    ["completed", "Played to completion"], ["retired", "Retirement during play"],
    ["conceded", "Injury before play"], ["walkover", "No-show"], ["unplayed", "Not played — neither side credited"],
  ];
  return <form class="card report" id="decide" method="post" action={`/coach/matches/${match.id}/preview`}>
    <h2>{match.result ? "Correct the result" : "Decide the result"}</h2>
    <fieldset><legend>How did it end?</legend><div class="choices">
      {outcomes.map(([value, label]) => <label><input type="radio" name="outcome" value={value} checked={(values.outcome ?? "completed") === value} />{label}</label>)}
    </div></fieldset>
    <fieldset class="stopped"><legend>Who retired, was injured or did not turn up?</legend><div class="choices">
      {names.map((name, side) => <label><input type="radio" name="stopped" value={side === 0 ? "me" : "them"} checked={values.stopped === (side === 0 ? "me" : "them")} />{name}</label>)}
    </div></fieldset>
    <div class="scoring">
      <p class="hint">{formatHint(competition.match_format)} Enter the partial score for a retirement; leave scores blank if no games finished.</p>
      <div class="sets"><span /><span class="head">{names[0]}</span><span class="head">{names[1]}</span>
        {setRows(competition.match_format).map(row => <>
          <span>{row.label}</span>
          {names.map((name, side) => {
            const field = `${side === 0 ? "mine" : "theirs"}_${row.n}`;
            return <input type="number" min="0" step="1" inputmode="numeric" name={field} value={values[field] ?? ""} aria-label={`${row.label}, ${name}`} />;
          })}
        </>)}
      </div>
    </div>
    <div class="field"><label for="played_on">Played on (optional)</label><input id="played_on" name="played_on" type="date" value={values.played_on ?? ""} /></div>
    <div class="field"><label for="reason">Why are you deciding this result?</label><select id="reason" name="reason" required>
      <option value="">Choose a reason</option>
      {REASONS.map(r => <option value={r.value} selected={values.reason === r.value}>{r.label}</option>)}
    </select></div>
    <p class="muted">Your coach sign-in and this reason will be recorded. Review the points and participation before saving.</p>
    <button type="submit">Review decision</button>
  </form>;
};

export const CoachMatch: FC<{
  frame: Frame; match: MatchDetail; competition: Competition; timezone: string;
  events: FeedEvent[]; historyAfter: string | undefined; historyNext: string | null;
  values?: Record<string, string>; errors?: string[]; saved?: boolean;
  /** A pending entry to start the decision from; the coach still reviews it and gives a reason. */
  use?: string;
}> = ({ frame, match, competition, timezone, events, historyAfter, historyNext, values, errors, saved, use }) => {
  const names = namesOf(match);
  const chosen = use ? match.claims.find(c => c.id === use && c.side !== null && c.state === "pending") : undefined;
  const initial = chosen ? { ...claimToForm(chosen, 0), outcome: chosen.outcome }
    : match.result ? { ...claimToForm(match.result, 0), outcome: match.result.outcome } : {};
  return <Layout title={names.join(" v ")} frame={frame}>
    <p><a href="/coach/results">Results to sort out</a> · <a href="/coach/matches">Find a match</a></p>
    <h1>{names.join(" v ")}</h1><p class="muted">{where(match)}</p>
    {saved && <p class="notice">Decision saved. The result and standings are updated.</p>}
    {errors?.length ? <div role="alert" class="notice"><ul>{errors.map(e => <li>{e}</li>)}</ul></div> : null}
    <Entries match={match} timezone={timezone} deciding={competition.state === "active"} />
    {chosen && <p class="notice">The form below holds {names[chosen.side!]}'s entry. Check it, choose a reason, and review before saving.</p>}
    {competition.state === "active" ? <DecisionForm match={match} competition={competition} values={values ?? initial} /> :
      <p class="notice">This competition is {competition.state}. Reopen it before changing a result.</p>}
    <h2>Submission history</h2>
    <p class="muted">Earlier submissions remain here after a correction.</p>
    {match.claims.length === 0 && <p>No submissions yet.</p>}
    <ul class="list card">{[...match.claims].reverse().map(claim => <li class="answer">
      <strong>{claim.side === null ? "Coach decision" : names[claim.side]}</strong> · {claim.state}
      <p>{describe(claim, 0, names)}{claim.played_on && ` · Played ${playedOn(claim.played_on)}`}</p>
      <span class="muted">{at(claim.submitted_at, timezone)}</span>
    </li>)}</ul>
    <h2 id="history">Decision history</h2>
    <ul class="list card">{events.filter(e => e.type === "match.result.confirmed").map(e => {
      const claim = match.claims.find(c => c.id === e.payload.claim_id);
      return <li class="answer">
        <strong>{e.payload.how === "settled" ? e.actor_name ?? "Coach API key" : "Both sides confirmed the result"}</strong>
        {claim && <p>{describe(claim, 0, names)}</p>}
        {e.payload.how === "settled" && <p>{reasonLabel(e.payload.reason)}</p>}
        <span class="muted">{at(e.occurred_at, timezone)}</span>
      </li>;
    })}</ul>
    <p class="jump">
      {historyAfter && <a href={`/coach/matches/${match.id}`}>Latest history</a>}
      {historyNext && <a href={`/coach/matches/${match.id}?history_after=${encodeURIComponent(historyNext)}#history`}>Older history</a>}
    </p>
  </Layout>;
};

export const ReviewSettlement: FC<{
  frame: Frame; preview: SettlementPreview; values: Record<string, string>; timezone: string;
}> = ({ frame, preview, values, timezone }) => {
  const names = namesOf(preview.match);
  return <Layout title="Review coach decision" frame={frame}>
    <h1>Review coach decision</h1><h2>{names.join(" v ")}</h2><p class="muted">{where(preview.match)}</p>
    <Entries match={preview.match} timezone={timezone} />
    <section class="card"><h2>Your proposed result</h2>
      <p><strong>{describe(preview.result, 0, names)}</strong></p>
      <p>{preview.result.winning_side === null ? "Neither side is credited with a win." : `Winner: ${names[preview.result.winning_side]}.`}</p>
      <p class="muted">Scores have {names[0]}'s games first.{preview.result.played_on && ` Played ${playedOn(preview.result.played_on)}.`}</p>
      <p>Reason: {reasonLabel(values.reason)}</p>
      <h3>Effect on the table</h3>
      {preview.effects.map(e => <div class="card">
        <strong>{e.label}</strong>
        <p>Points: {e.points_before} → {e.points_after}. Played credit: {e.played_before} → {e.played_after}.</p>
        <p>{e.withdrawn ? "This entry is withdrawn; the competition's withdrawal rules apply." : e.minimum === 0 ? "No minimum-match requirement." :
          e.played_after < e.minimum ? `Minimum: ${e.minimum}. Still ${e.minimum - e.played_after} ${e.minimum - e.played_after === 1 ? "match" : "matches"} short; excluded from next season's draft if still short when standings are final.` : `Minimum: ${e.minimum}. Requirement met.`}</p>
      </div>)}
      <p class="muted">Totals include the competition's bonuses and withdrawal rules.</p>
    </section>
    <form method="post" action={`/coach/matches/${preview.match.id}/settle`} class="card">
      {Object.entries(values).filter(([name]) => name !== "override" && name !== "expected_version" && name !== "confirm").map(([name, value]) => <input type="hidden" name={name} value={value} />)}
      <input type="hidden" name="expected_version" value={preview.version} />
      {preview.requires_override && <label class="choice"><input type="checkbox" name="override" value="yes" required /> I explicitly override the confirmed result shown above.</label>}
      <p>Saving records the result immediately and keeps the previous submissions and your reason.</p>
      <button type="submit" name="confirm" value="yes">Save coach decision</button>
      <button type="submit" class="quiet" formaction={`/coach/matches/${preview.match.id}/edit`} formnovalidate>Edit decision</button>
    </form>
  </Layout>;
};

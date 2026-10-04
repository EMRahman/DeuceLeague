import type { FC } from "hono/jsx";
import { deadlineLine, type Match, type Season } from "@deuceleague/website";
import { fits, genderUnclear, type DraftView, type Division, type LeftOut, type PairsView, type PlacedEntry, type Turnover,
  type Unplaced } from "./season.js";
import { Layout, type CoachCompetition, type Frame, type SeasonProgress } from "./views.js";

/** The Season tab's pages: ending a season, starting the next from its tables, and adjusting the drafts. */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
function nth(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/** "3 Oct 2026". */
const dayOf = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const dates = (s: Season) => (s.starts_on && s.ends_on ? `${dayOf(s.starts_on)} to ${dayOf(s.ends_on)}` : null);

const Notice: FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div class="notice" role="alert">
      {message}
    </div>
  ) : null;

export type NextForm = { from: string; name: string; starts_on: string; ends_on: string };

/** A match whose sides never agreed a result, nor the coach decided one: disputed, or entered by one side only. */
export type LooseEnd = Match & { updated_at: string };

/** Each loose end on a line, linked to its match page, where the coach can decide it while the season runs. */
const LooseEnds: FC<{ matches: LooseEnd[] }> = ({ matches }) => (
  <ul class="list">
    {matches.map((m) => {
      const names = [0, 1].map((side) => m.sides.find((s) => s.side === side)?.label ?? `Side ${side + 1}`);
      return (
        <li class="answer">
          <a href={`/coach/matches/${m.id}`}>{names.join(" v ")}</a>
          <span class="muted">
            {" "}· {[m.competition_name, m.division_name].filter(Boolean).join(" · ")} ·{" "}
            {m.status === "disputed" ? "the sides entered different results" : "only one side entered a result"}
          </span>
        </li>
      );
    })}
  </ul>
);

export const SeasonPage: FC<{
  frame: Frame;
  turnover: Turnover;
  /** Each running season's progress, for how much is left unplayed. */
  progress: Map<string, SeasonProgress>;
  /** Next season's form, as suggested or as last sent. */
  next: NextForm | null;
  message: string | null;
  timezone: string;
  /** The latest ended season, and its matches left disputed or entered by one side only. */
  closed: { season: Season; loose: LooseEnd[] } | null;
}> = ({ frame, turnover, progress, next, message, timezone, closed }) => {
  const { running, ended, preparing } = turnover;
  return (
    <Layout title="Season" frame={frame}>
      <h1>Season</h1>
      <Notice message={message} />
      {running.length === 0 && !ended && preparing.length === 0 && (
        <p>
          No season is running. The first season is set up through the API, usually by your coding agent; after that,
          each season is started here from the one before.
        </p>
      )}

      {running.map(({ season, drafts }) => {
        const competitions = progress.get(season.id)?.competitions.filter((x) => x.state === "active") ?? [];
        const outstanding = competitions.reduce((n, x) => n + x.outstanding, 0);
        const deadline = deadlineLine(season.results_deadline_at, timezone);
        return (
          <div class="card">
            <div class="titleline">
              <h2>{season.name}</h2>
              {deadline && <span class="deadline">{deadline}</span>}
            </div>
            <p>
              Under way{dates(season) && `, ${dates(season)}`}.{" "}
              {outstanding === 0 ? "Every match has a result." : `${plural(outstanding, "match", "matches")} still to be played or agreed.`}
            </p>
            {drafts.length > 0 && (
              <div class="notice">
                <p>
                  {drafts.map((x) => x.name).join(" and ")} {drafts.length === 1 ? "has" : "have"} not started yet.
                </p>
                <a class="button small" href={`/coach/season/${season.id}/start`}>
                  Start {drafts.length === 1 ? "it" : "them"}…
                </a>
              </div>
            )}
            <p class="muted">
              Ending the season makes the tables final, so next season can be started from them: promotion and
              relegation, and leaving out anyone who opted out or played too few matches.
            </p>
            <a class="button" href={`/coach/season/${season.id}/end`}>
              End season now
            </a>
          </div>
        );
      })}

      {ended && next && (
        <div class="card">
          <h2>Prepare next season</h2>
          <p>
            {ended.season.name} has ended. Preparing next season makes{" "}
            {ended.competitions.map((x) => x.name).join(" and ")} again as drafts, filled from the final tables:
            promoted, relegated or held by each competition's rules. Anyone who opted out, or played fewer matches than
            the minimum, is left out; you can add them back.
          </p>
          <p class="muted">
            Players see nothing of next season, their own place included, until you start it. Then they see their
            competition, division and fixtures.
          </p>
          <form method="post" action="/coach/season/next">
            <input type="hidden" name="from" value={next.from} />
            <div class="field">
              <label for="name">Name</label>
              <input id="name" name="name" maxlength={100} value={next.name} required />
            </div>
            <div class="field">
              <label for="starts_on">First day</label>
              <input id="starts_on" name="starts_on" type="date" value={next.starts_on} required />
            </div>
            <div class="field">
              <label for="ends_on">Last day</label>
              <input id="ends_on" name="ends_on" type="date" value={next.ends_on} required />
              <p class="muted">Results close at the end of the last day.</p>
            </div>
            <p class="muted">This only prepares the drafts for you to adjust. Nothing starts until you start it.</p>
            <button type="submit">Prepare next season's drafts</button>
          </form>
        </div>
      )}

      {closed && (
        <div class="card">
          <h2>How {closed.season.name} closed</h2>
          {closed.loose.length === 0 ? (
            <p class="muted">Every result was agreed by both sides or decided by you.</p>
          ) : (
            <>
              <p>
                {plural(closed.loose.length, "match", "matches")} ended without an agreed result and count as unplayed.
                Its competitions are a record now: reopen one through the API to change a result.
              </p>
              <LooseEnds matches={closed.loose} />
            </>
          )}
        </div>
      )}

      {preparing.map(({ season, drafts }) => (
        <div class="card">
          <div class="titleline">
            <h2>{season.name}</h2>
            <span class="tag past">Being prepared</span>
          </div>
          {dates(season) && <p>{dates(season)}</p>}
          {drafts.length === 0 ? (
            <p class="muted">It has no competitions yet.</p>
          ) : (
            <ul class="list">
              {drafts.map((x) => (
                <li class="answer">
                  <a href={`/coach/season/drafts/${x.id}`}>{x.name}</a>
                  <span class="muted"> · who plays where, and who else could</span>
                </li>
              ))}
            </ul>
          )}
          {drafts.length > 0 && (
            <div class="after">
              <p class="muted">
                Starting it draws up every division's matches and opens the season to players. Adjust the drafts first:
                after this, a player can only be moved before they have played.
              </p>
              <a class="button" href={`/coach/season/${season.id}/start`}>
                Start {season.name}…
              </a>
            </div>
          )}
        </div>
      ))}
    </Layout>
  );
};

export const EndSeason: FC<{ frame: Frame; season: Season; progress: SeasonProgress; loose: LooseEnd[]; message?: string | null }> = ({
  frame,
  season,
  progress,
  loose,
  message = null,
}) => {
  const competitions = progress.competitions.filter((x) => x.state === "active");
  const outstanding = competitions.reduce((n, x) => n + x.outstanding, 0);
  const unentered = Math.max(0, outstanding - loose.length);
  const early = season.results_deadline_at === null || Date.parse(season.results_deadline_at) > Date.now();
  return (
    <Layout title={`End ${season.name}`} frame={frame}>
      <h1>End {season.name} now?</h1>
      <Notice message={message} />
      {loose.length > 0 && (
        <div class="card">
          <h2>{plural(loose.length, "result")} never agreed</h2>
          <p>
            These will count as unplayed unless you decide them first. Open one to see both sides' entries and decide
            it.
          </p>
          <LooseEnds matches={loose} />
        </div>
      )}
      <ul class="plain">
        {early && <li>Reporting closes now, before the deadline. Players can no longer report or agree scores.</li>}
        {unentered > 0 && (
          <li>
            <strong>{plural(unentered, "match", "matches")}</strong> nobody entered a result for will count as unplayed.
          </li>
        )}
        {loose.length > 0 && (
          <li>
            <strong>{plural(loose.length, "match", "matches")}</strong> above, disputed or entered by one side only,
            will count as unplayed too.
          </li>
        )}
        <li>The tables become final, and {competitions.map((x) => x.name).join(" and ")} become a record.</li>
        {competitions.map((x) =>
          x.opted_out.length > 0 ? (
            <li>
              {x.name}: {x.opted_out.map((e) => e.label).join(", ")} opted out of next season.
            </li>
          ) : null,
        )}
      </ul>
      <p class="muted">
        Nothing is deleted. A season ended by mistake can be reopened through the API, which moves it back a step.
      </p>
      <form method="post" action={`/coach/season/${season.id}/end`}>
        <input type="hidden" name="shown" value={loose.map((m) => m.id).join(",")} />
        {loose.length > 0 && (
          <label class="choice">
            <input type="checkbox" name="leave" value="yes" required /> Leave{" "}
            {loose.length === 1 ? "this result" : `these ${loose.length} results`} undecided: {loose.length === 1 ? "it counts" : "they count"} as
            unplayed.
          </label>
        )}
        <button type="submit">End {season.name}</button>
      </form>
      <p class="after">
        <a href="/coach/season">Back to Season</a>
      </p>
    </Layout>
  );
};

const REASONS: Record<string, { label: string; tag: string }> = {
  promoted: { label: "↑ Promoted", tag: "up" },
  relegated: { label: "↓ Relegated", tag: "down" },
  held: { label: "Held", tag: "past" },
  new: { label: "New", tag: "now" },
  returning: { label: "Added back", tag: "now" },
  manual: { label: "Moved by coach", tag: "now" },
};

const DivisionSelect: FC<{ id: string; divisions: Division[]; selected: number }> = ({ id, divisions, selected }) => (
  <select id={id} name="division_id">
    {divisions.map((d) => (
      <option value={d.id} selected={d.ordinal === selected}>
        {d.name}
      </option>
    ))}
  </select>
);

const Placed: FC<{ placed: PlacedEntry; divisions: Division[]; here: Division }> = ({ placed, divisions, here }) => {
  const { entry, from } = placed;
  const reason = entry.placement_reason ? REASONS[entry.placement_reason] : undefined;
  return (
    <li class="answer" id={`entry-${entry.id}`}>
      <div class="answer-row">
        <span>
          {entry.label}
          {reason && <span class={`tag ${reason.tag}`}>{reason.label}</span>}
          {from && (
            <span class="muted">
              {" "}
              · {entry.placement_reason === "manual" ? "moved by coach from " : entry.placement_reason === "returning" ? "added back, was " : ""}
              {from.position === null ? "unranked" : nth(from.position)} in {from.division}
            </span>
          )}
        </span>
        <form method="post" action={`/coach/season/entries/${entry.id}/remove`}>
          <input type="hidden" name="draft" value={entry.competition_id} />
          <button class="quiet small" type="submit">
            Take out
          </button>
        </form>
      </div>
      {divisions.length > 1 && (
        <form class="level" method="post" action={`/coach/season/entries/${entry.id}/move`}>
          <input type="hidden" name="draft" value={entry.competition_id} />
          <label class="muted" for={`move-${entry.id}`}>
            Move to
          </label>
          <DivisionSelect id={`move-${entry.id}`} divisions={divisions} selected={here.ordinal} />
          <button class="quiet small" type="submit">
            Move
          </button>
        </form>
      )}
    </li>
  );
};

const AddBack: FC<{ draft: string; left: LeftOut; divisions: Division[] }> = ({ draft, left, divisions }) => (
  <li class="answer">
    {left.entry.label}
    <br />
    <span class="muted">{left.why}</span>
    {left.addable ? (
      <form class="level" method="post" action={`/coach/season/drafts/${draft}/entries`}>
        <input type="hidden" name="previous_entry_id" value={left.entry.id} />
        {left.entry.members.map((m, i) => (
          <input type="hidden" name={i === 0 ? "member" : "partner"} value={m.id} />
        ))}
        <label class="muted" for={`back-${left.entry.id}`}>
          Add back to
        </label>
        <DivisionSelect id={`back-${left.entry.id}`} divisions={divisions} selected={left.ordinal} />
        <button class="quiet small" type="submit">
          Add
        </button>
      </form>
    ) : (
      <p class="muted">
        Can't be added back as it was: someone in it has left the club, is on a break (bring them back from the Members
        page first), or is already in the draft.
      </p>
    )}
  </li>
);

const Level: FC<{ level: number | null }> = ({ level }) =>
  level === null ? null : <span class="tag level">Level {level}</span>;

export const Draft: FC<{
  frame: Frame;
  season: Season;
  draft: CoachCompetition;
  previous: CoachCompetition;
  view: DraftView;
  /** The draft has not been filled from last season's tables yet. */
  empty: boolean;
  /** The coach's key can read members' genders, so the lists can be narrowed by them. */
  genders: boolean;
}> = ({ frame, season, draft, previous, view, empty, genders }) => {
  const doubles = draft.discipline === "doubles";
  const divisions = view.divisions;
  const bottom = divisions.at(-1)?.ordinal ?? 1;
  const newcomers = view.unplaced.filter((u) => !u.last);
  return (
    <Layout title={`${draft.name}, ${season.name}`} frame={frame}>
      <p class="muted">
        <a href="/coach/season">Season</a> · {season.name} · draft
        {doubles && <> · <a href={`/coach/pairs#competition-${previous.id}`}>What players said about partners</a></>}
      </p>
      <h1>{draft.name}</h1>
      {empty ? (
        <>
          <p>Nobody has been placed yet. Fill it from the final tables of {previous.name}.</p>
          <form method="post" action={`/coach/season/drafts/${draft.id}/fill`}>
            <button type="submit">Fill from last season's tables</button>
          </form>
        </>
      ) : (
        <p class="muted">
          Placed from the final tables of {previous.name}. Move anyone, take them out, or add players below: players see
          none of this until you start {season.name}.
        </p>
      )}

      {!empty && draft.category !== "open" && (
        <p class="muted">
          {genders
            ? `Players below are those who suit a ${draft.category === "mixed" ? "mixed" : draft.category === "mens" ? "men's" : "women's"} competition by the gender recorded. Anyone with none recorded, or who prefers not to say, is still listed and marked.`
            : "This key cannot read members' genders, so the lists below are not narrowed by gender."}
        </p>
      )}

      {divisions.map((d) => (
        <>
          <h2>
            {d.name}{" "}
            <span class="muted">
              · {plural(d.entries.length, doubles ? "pair" : "player")}
              {d.target_size ? ` of ${d.target_size}` : ""}
            </span>
          </h2>
          {!empty &&
            view.vacancies
              .filter((v) => v.to.id === d.id)
              .map(({ vacancy, to, fill, back }) => (
                <div class="notice">
                  {back
                    ? `${vacancy.label} ${vacancy.label.includes(" / ") ? "are" : "is"} back in ${back.name}; ${to.name} receives one fewer this season.`
                    : vacancy.explanation}
                  {fill && (
                    <form method="post" action={`/coach/season/entries/${fill.id}/move`}>
                      <input type="hidden" name="draft" value={fill.competition_id} />
                      <input type="hidden" name="division_id" value={to.id} />
                      <input type="hidden" name="reason" value={vacancy.kind === "promotion" ? "promoted" : "relegated"} />
                      <button class="small quiet" type="submit">
                        Suggestion: {vacancy.kind === "promotion" ? "promote" : "relegate"} {fill.label}
                      </button>
                    </form>
                  )}
                </div>
              ))}
          {!empty &&
            view.small
              .filter((s) => s.ordinal === d.ordinal)
              .map((s) => (
                <p class="deadline">
                  Only {plural(s.entries, doubles ? "pair" : "player")}:{" "}
                  {s.entries < 2
                    ? "no match can be played."
                    : `a division needs at least ${s.minimum + 1} for everyone to be able to play the ${s.minimum}-match minimum, so each is expected to play all ${s.entries - 1} of their matches.`}
                </p>
              ))}
          <div class="card">
            {d.entries.length === 0 ? (
              <p class="muted">Nobody yet.</p>
            ) : (
              <ul class="list">
                {d.entries.map((placed) => (
                  <Placed placed={placed} divisions={divisions} here={d} />
                ))}
              </ul>
            )}
          </div>
        </>
      ))}

      {!empty && view.leftOut.length > 0 && (
        <>
          <h2>Not carried over from last season</h2>
          <div class="card">
            <ul class="list">
              {view.leftOut.map((left) => (
                <AddBack draft={draft.id} left={left} divisions={divisions} />
              ))}
            </ul>
          </div>
        </>
      )}

      {!empty && !doubles && (
        <>
          <h2>Not in {previous.name} last season</h2>
          {newcomers.length === 0 ? (
            <p class="muted">Everyone in the club played in it last season.</p>
          ) : (
            <div class="card">
              <p class="muted">Strongest first, by the level you gave them.</p>
              <ul class="list">
                {newcomers.map((m) => (
                  <li class="answer">
                    {m.display_name}
                    <Level level={m.level} />
                    {genderUnclear(m, draft.category) && <span class="tag">Gender not recorded</span>}
                    <form class="level" method="post" action={`/coach/season/drafts/${draft.id}/entries`}>
                      <input type="hidden" name="member" value={m.id} />
                      <label class="muted" for={`add-${m.id}`}>
                        Add to
                      </label>
                      <DivisionSelect id={`add-${m.id}`} divisions={divisions} selected={bottom} />
                      <button class="quiet small" type="submit">
                        Add
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!empty && doubles && (
        <Pairing draft={draft.id} view={view} divisions={divisions} bottom={bottom} category={draft.category}
          previous={previous.name} />
      )}
    </Layout>
  );
};

/** Why someone has no pair in the draft, in a few words: what they said, else what became of their pair. */
const note = (u: Unplaced, previous: string) =>
  u.said ?? (u.last ? `Was in ${u.last.entry.label} · ${u.last.why}` : `Not in ${previous} last season`);

const Pairing: FC<{ draft: string; view: DraftView; divisions: Division[]; bottom: number; category: string; previous: string }> = ({
  draft,
  view,
  divisions,
  bottom,
  category,
  previous,
}) => {
  const paired = new Set(view.pairs.flat().map((u) => u.id));
  const free = view.unplaced.filter((u) => !u.out && !paired.has(u.id));
  const out = view.unplaced.filter((u) => u.out);
  const choosable = view.unplaced.filter((u) => !u.out);
  return (
    <>
      {view.pairs.length > 0 && (
        <>
          <h2>New pairs waiting</h2>
          <p class="muted">Players who asked each other to be partners next season, and both agreed.</p>
          <div class="card">
            <ul class="list">
              {view.pairs.map(([a, b]) => (
                <li class="answer">
                  {a.display_name} / {b.display_name}
                  <form class="level" method="post" action={`/coach/season/drafts/${draft}/entries`}>
                    <input type="hidden" name="member" value={a.id} />
                    <input type="hidden" name="partner" value={b.id} />
                    <label class="muted" for={`pair-${a.id}`}>
                      Add to
                    </label>
                    <DivisionSelect id={`pair-${a.id}`} divisions={divisions} selected={bottom} />
                    <button class="quiet small" type="submit">
                      Add
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <h2>Players without a pair</h2>
      {free.length === 0 ? (
        <p class="muted">Nobody is waiting for a partner.</p>
      ) : (
        <div class="card">
          <ul class="list">
            {free.map((u) => (
              <li class="answer">
                {u.display_name}
                <Level level={u.level} />
                {genderUnclear(u, category) && <span class="tag">Gender not recorded</span>}
                <br />
                <span class="muted">{note(u, previous)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {choosable.length >= 2 && (
        <div class="card">
          <h2>Make a pair</h2>
          <form method="post" action={`/coach/season/drafts/${draft}/entries`}>
            <div class="field">
              <label for="member">{category === "mixed" ? "Woman" : "Player"}</label>
              <PlayerSelect id="member" name="member" players={choosable.filter((p) => fits(p, category, 0))}
                category={category} />
            </div>
            <div class="field">
              <label for="partner">{category === "mixed" ? "Man" : "Partner"}</label>
              <PlayerSelect id="partner" name="partner" players={choosable.filter((p) => fits(p, category, 1))}
                category={category} />
            </div>
            <div class="field">
              <label for="pair-division">Division</label>
              <DivisionSelect id="pair-division" divisions={divisions} selected={bottom} />
            </div>
            <button type="submit">Add the pair</button>
          </form>
        </div>
      )}
      {out.length > 0 && (
        <>
          <h2>Not playing next season</h2>
          <p class="muted">{out.map((u) => u.display_name).join(", ")}</p>
        </>
      )}
    </>
  );
};

const PlayerSelect: FC<{ id: string; name: string; players: Unplaced[]; category: string }> = ({
  id,
  name,
  players,
  category,
}) => (
  <select id={id} name={name} required>
    <option value="">Choose</option>
    {players.map((p) => (
      <option value={p.id}>
        {p.display_name}
        {p.level !== null ? ` (level ${p.level})` : ""}
        {genderUnclear(p, category) ? " (gender not recorded)" : ""}
      </option>
    ))}
  </select>
);

/** What starting a season does, asked before it is done: players get their fixtures at once. */
export const StartSeason: FC<{ frame: Frame; season: Season; drafts: CoachCompetition[] }> = ({ frame, season, drafts }) => (
  <Layout title={`Start ${season.name}`} frame={frame}>
    <h1>Start {season.name} now?</h1>
    <ul class="plain">
      <li>
        Every division of {drafts.map((x) => x.name).join(" and ")} gets its matches drawn up, and players see their
        competition, division and fixtures straight away.
      </li>
      {season.state === "planning" && <li>{season.name} opens{dates(season) && `, ${dates(season)}`}.</li>}
      <li>After this, a player can only be moved before they have played.</li>
    </ul>
    <form method="post" action={`/coach/season/${season.id}/start`}>
      <input type="hidden" name="confirm" value="yes" />
      <button type="submit">Start {season.name}</button>
    </form>
    <p class="after">
      <a href="/coach/season">Not yet: back to Season</a>
    </p>
  </Layout>
);

/** Every doubles competition's players by what they said about next season: who is with whom, who needs whom. */
export const Pairs: FC<{ frame: Frame; season: Season | null; competitions: { competition: CoachCompetition; view: PairsView }[] }> = ({
  frame,
  season,
  competitions,
}) => (
  <Layout title="Next season's pairs" frame={frame}>
    <h1>Next season's pairs</h1>
    <p class="muted">
      What each doubles player{season ? ` in ${season.name}` : ""} has said about next season. Nobody saying anything
      means keeping their partner. Filling next season's draft follows the same: agreed new pairs wait for you to place
      them, and those without a partner are listed for you to pair.
    </p>
    {competitions.length === 0 && <p>No doubles competition is running.</p>}
    {competitions.length > 1 && (
      <p class="jump">
        {competitions.map(({ competition }) => <a href={`#competition-${competition.id}`}>{competition.name}</a>)}
      </p>
    )}
    {competitions.map(({ competition, view }) => (
      <section class="card" id={`competition-${competition.id}`}>
        <h2>{competition.name}</h2>
        <h3>New pairs agreed ({view.agreed.length})</h3>
        {view.agreed.length === 0 ? <p class="muted">None yet.</p> : (
          <ul class="list">{view.agreed.map(([a, b]) => <li class="answer">{a} and {b}</li>)}</ul>
        )}
        <h3>Looking for a partner ({view.seeking.length + view.partnerless.length})</h3>
        {view.seeking.length + view.partnerless.length === 0 ? <p class="muted">Nobody.</p> : (
          <ul class="list">
            {view.seeking.map((s) => (
              <li class="answer">
                {s.name} <span class="muted">· {s.asked ? `asked ${s.asked}, who has not agreed yet` : "wants you to find a partner"}</span>
              </li>
            ))}
            {view.partnerless.map((p) => (
              <li class="answer">
                {p.name} <span class="muted">· has said nothing, but {p.partner} {p.why}</span>
              </li>
            ))}
          </ul>
        )}
        <h3>Not playing next season ({view.out.length})</h3>
        {view.out.length === 0 ? <p class="muted">Nobody.</p> : (
          <ul class="list">{view.out.map((o) => <li class="answer">{o.name} <span class="muted">· {o.why}</span></li>)}</ul>
        )}
        <h3>Keeping their partner ({view.keeping.length})</h3>
        {view.keeping.length === 0 ? <p class="muted">None.</p> : (
          <ul class="list">{view.keeping.map((k) => <li class="answer">{k}</li>)}</ul>
        )}
      </section>
    ))}
  </Layout>
);

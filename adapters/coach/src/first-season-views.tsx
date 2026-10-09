import type { FC } from "hono/jsx";
import type { Entry, Season } from "@deuceleague/website";
import { FIRST_COMPETITIONS, suggestedPairs, type FirstCompetition, type RatedMember } from "./first-season.js";
import { fits, wantsThis, type Division } from "./season.js";
import { Layout, type CoachCompetition, type Frame } from "./views.js";

export type FirstForm = { name: string; starts_on: string; ends_on: string; selected: string[] };

export const FirstSeasonSetup: FC<{ frame: Frame; form: FirstForm; members: RatedMember[]; existingDrafts: boolean; message?: string }> = ({ frame, form, members, existingDrafts, message }) => (
  <Layout title="Prepare first season" frame={frame}>
    <p class="jump"><a href="/coach/season">← Season</a></p>
    <h1>Prepare your first season</h1>
    <p>Choose the competitions. The site will create drafts and place approved singles players by the level you reviewed, strongest first. Sign-in is not required. Review every division and pair before starting: this step creates no fixtures.</p>
    {message && <div class="notice" role="alert">{message}</div>}
    <form method="post" action="/coach/season/first">
      <div class="field"><label for="first-name">Season name</label>
        <input id="first-name" name="name" maxlength={100} value={form.name} required /></div>
      <div class="field"><label for="first-start">First day</label>
        <input id="first-start" name="starts_on" type="date" value={form.starts_on} required /></div>
      <div class="field"><label for="first-end">Last day</label>
        <input id="first-end" name="ends_on" type="date" value={form.ends_on} required /></div>
      <fieldset class="field"><legend>Competitions</legend>
        {FIRST_COMPETITIONS.map((spec) => {
          const interested = members.filter((m) => !m.leaving_at && wantsThis(m, spec.discipline, spec.category)
            && (spec.category === "mixed" ? ["female", "male"].includes(m.gender ?? "") : fits(m, spec.category)));
          return <label class="choice"><input type="checkbox" name={spec.key} value="yes" checked={form.selected.includes(spec.key)} />
            {spec.name} · {interested.length} interested · target {spec.target} {spec.discipline === "singles" ? "players" : "pairs"} per division</label>;
        })}
      </fieldset>
      <p class="muted">Singles players with no level or an unconfirmed gender stay for manual review. Doubles players wait for pair selection.</p>
      {existingDrafts && <label class="choice"><input type="checkbox" name="resume_existing" value="yes" />
        Finish automatic sorting in existing drafts if the first setup was interrupted. This can restore players you manually removed.</label>}
      <button type="submit">Create drafts and sort singles</button>
    </form>
  </Layout>
);

const DivisionChoice: FC<{ divisions: Division[]; selected: string; id?: string }> = ({ divisions, selected, id }) => (
  <select id={id} name="division_id">{divisions.map((d) => <option value={d.id} selected={d.id === selected}>{d.name}</option>)}</select>
);

export const FirstDraft: FC<{ frame: Frame; season: Season; draft: CoachCompetition; divisions: Division[];
  entries: Entry[]; members: RatedMember[] }> = ({ frame, season, draft, divisions, entries, members }) => {
  const placed = new Set(entries.flatMap((e) => e.members.map((m) => m.id)));
  const free = members.filter((m) => !placed.has(m.id) && !m.leaving_at && wantsThis(m, draft.discipline, draft.category)
    && fits(m, draft.category)).sort((a, b) => (a.level ?? 11) - (b.level ?? 11) || a.display_name.localeCompare(b.display_name));
  const pairs = draft.discipline === "doubles" ? suggestedPairs(free, draft.category) : [];
  const fallback = divisions.at(-1)?.id ?? "";
  return <Layout title={`${draft.name}, ${season.name}`} frame={frame}>
    <p class="jump"><a href="/coach/season">← Season</a></p>
    <h1>{draft.name}</h1>
    <p>This is a draft. Check each level, pair and division before you start the season. Changing a level on a member's page does not move an existing entry; move it here too.</p>
    {divisions.map((division) => <section class="card">
      <h2>{division.name} <span class="muted">({entries.filter((e) => e.division_id === division.id).length} / target {division.target_size ?? (draft.discipline === "singles" ? 8 : 6)})</span></h2>
      <ul class="list">{entries.filter((e) => e.division_id === division.id).map((entry) => <li class="answer" id={`entry-${entry.id}`}>
        <strong>{entry.label}</strong>
        <span class="muted"> · {entry.members.map((m) => members.find((person) => person.id === m.id)?.level ?? "unrated").join(" / ")}</span>
        {divisions.length > 1 && <form class="level" method="post" action={`/coach/season/entries/${entry.id}/move`}>
          <input type="hidden" name="draft" value={draft.id} />
          <DivisionChoice divisions={divisions} selected={division.id} />
          <button class="quiet small" type="submit">Move</button>
        </form>}
        <form method="post" action={`/coach/season/entries/${entry.id}/remove`}>
          <input type="hidden" name="draft" value={draft.id} />
          <button class="quiet small" type="submit">Remove</button>
        </form>
      </li>)}</ul>
    </section>)}
    {draft.discipline === "doubles" && pairs.length > 0 && <section class="card">
      <h2>Suggested pairs</h2>
      <p class="muted">Matched by similar levels. Discuss each suggestion with the players; only you can add the pair.</p>
      <ul class="list">{pairs.map(([a, b], index) => <li class="answer">
        <strong>{a.display_name} / {b.display_name}</strong> · levels {a.level ?? "?"} / {b.level ?? "?"}
        <form class="level" method="post" action={`/coach/season/drafts/${draft.id}/entries`}>
          <input type="hidden" name="member" value={a.id} /><input type="hidden" name="partner" value={b.id} />
          <DivisionChoice divisions={divisions} selected={divisions[Math.min(Math.floor(index / 6), divisions.length - 1)]?.id ?? fallback} />
          <button class="quiet small" type="submit">Add pair</button>
        </form>
      </li>)}</ul>
    </section>}
    <section class="card"><h2>{draft.discipline === "singles" ? "Players to place" : "Players without a pair"}</h2>
      {free.length === 0 ? <p class="muted">Nobody waiting.</p> : <ul class="list">{free.map((m) => <li class="answer">
        <a href={`/coach/members/${m.id}`}>{m.display_name}</a> · level {m.level ?? "not set"}
        {draft.discipline === "singles" && <form class="level" method="post" action={`/coach/season/drafts/${draft.id}/entries`}>
          <input type="hidden" name="member" value={m.id} />
          <DivisionChoice divisions={divisions} selected={fallback} />
          <button class="quiet small" type="submit">Add</button>
        </form>}
      </li>)}</ul>}
      {draft.discipline === "doubles" && free.length >= 2 && <form class="approve" method="post" action={`/coach/season/drafts/${draft.id}/entries`}>
        <h3>Make a different pair</h3>
        <div class="field"><label for="first-player">{draft.category === "mixed" ? "Woman" : "Player"}</label>
          <select id="first-player" name="member">{free.filter((m) => fits(m, draft.category, 0)).map((m) => <option value={m.id}>{m.display_name} · {m.level ?? "?"}</option>)}</select></div>
        <div class="field"><label for="second-player">{draft.category === "mixed" ? "Man" : "Partner"}</label>
          <select id="second-player" name="partner">{free.filter((m) => fits(m, draft.category, 1)).map((m) => <option value={m.id}>{m.display_name} · {m.level ?? "?"}</option>)}</select></div>
        <div class="field"><label for="first-division">Division</label><DivisionChoice id="first-division" divisions={divisions} selected={fallback} /></div>
        <button type="submit">Add pair</button>
      </form>}
    </section>
  </Layout>;
};

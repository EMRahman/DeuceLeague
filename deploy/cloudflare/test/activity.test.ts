import assert from "node:assert/strict";
import test from "node:test";
import { sentence, type FeedEvent } from "../../../adapters/coach/dist/views.js";
import { browser, websiteFixture } from "./website-helpers.ts";

const event = (type: string, payload: Record<string, unknown> = {}, more: Partial<FeedEvent> = {}): FeedEvent => ({
  cursor: "1.1", type, subject_type: "member", actor_type: "api_key", actor_name: "Coach website",
  subject_name: "Zak Ellis", occurred_at: "2026-10-03T10:00:00Z", payload, competition_name: null, partner_name: null, ...more,
});

test("Activity says in words what invitations, leaving, breaks and next season's choices did", () => {
  const cases: [FeedEvent, string][] = [
    [event("member.invitation.recorded", { state: "accepted" }), "Coach website emailed a sign-in link to Zak Ellis"],
    [event("member.invitation.recorded", { state: "failed" }), "Coach website could not email a sign-in link to Zak Ellis"],
    [event("member.leaving.recorded"), "Zak Ellis is not playing next season"],
    [event("member.leaving.cleared"), "Zak Ellis is playing next season again"],
    [event("member.paused"), "Zak Ellis is taking a break"],
    [event("member.resumed"), "Zak Ellis is back from a break"],
    [event("entry.opt_out.recorded", { competition_id: "c" }, { subject_type: "entry", actor_type: "member", actor_name: "Owen Nolan",
      subject_name: "Owen Nolan", competition_name: "Men's Singles" }), "Owen Nolan opted out of Men's Singles next season"],
    [event("entry.opt_out.recorded", { competition_id: "c" }, { subject_type: "entry", actor_type: "member", actor_name: "Tom Fletcher",
      subject_name: "Tom Fletcher / Daniel Osei", competition_name: "Men's Doubles" }),
      "Tom Fletcher opted Tom Fletcher / Daniel Osei out of Men's Doubles next season"],
    [event("entry.opt_out.cleared", { competition_id: "c" }, { subject_type: "entry", subject_name: "Owen Nolan",
      competition_name: "Men's Singles" }), "Coach website opted Owen Nolan back in to Men's Singles next season"],
    [event("partner_choice.recorded", { competition_id: "c", choice: "leaving", partner_id: null, agreed: false },
      { subject_name: "Arjun Mehta", competition_name: "Mixed Doubles" }), "Arjun Mehta is not playing Mixed Doubles next season"],
    [event("partner_choice.recorded", { competition_id: "c", choice: "new_partner", partner_id: "p", agreed: true },
      { subject_name: "Callum Reid", competition_name: "Mixed Doubles", partner_name: "Priya Shah" }),
      "Callum Reid agreed to play Mixed Doubles with Priya Shah next season"],
    [event("partner_choice.recorded", { competition_id: "c", choice: "new_partner", partner_id: "p", agreed: false },
      { subject_name: "Callum Reid", competition_name: "Mixed Doubles", partner_name: "Priya Shah" }),
      "Callum Reid asked Priya Shah to play Mixed Doubles with them next season"],
    [event("partner_choice.recorded", { competition_id: "c", choice: "new_partner", partner_id: null, agreed: false },
      { subject_name: "Callum Reid", competition_name: "Mixed Doubles" }),
      "Callum Reid is looking for a new partner in Mixed Doubles next season"],
    [event("partner_choice.cleared", { competition_id: "c" }, { subject_name: "Callum Reid", competition_name: "Mixed Doubles" }),
      "Callum Reid is keeping their partner in Mixed Doubles next season"],
    [event("partner_choice.declined", { competition_id: "c", partner_id: "p" }, { actor_type: "member", actor_name: "Priya Shah",
      subject_name: "Callum Reid", competition_name: "Mixed Doubles" }), "Priya Shah said no to playing Mixed Doubles with Callum Reid next season"],
    // A name that could not be looked up keeps the line readable.
    [event("partner_choice.recorded", { competition_id: "c", choice: "new_partner", partner_id: "p", agreed: true },
      { subject_name: "Callum Reid" }), "Callum Reid agreed to play doubles with someone next season"],
    // Only an object with from and to is a move: an unknown event's string state is not.
    [event("member.something", { state: "accepted" }), "Coach website: member.something"],
    [event("season.updated", { state: { from: "planning", to: "active" } }, { subject_type: "season", subject_name: "Autumn 2026" }),
      "Coach website moved the season Autumn 2026 from planning to active"],
  ];
  for (const [e, expected] of cases) {
    assert.equal(sentence(e), expected);
    assert.doesNotMatch(sentence(e), /undefined/);
  }
});

test("the coach's Activity names the competition and partner of next season's choices", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const members = (await f.api("/v1/members?limit=100", f.admin)).body.data as { id: string; display_name: string }[];
  const id = (name: string) => members.find((m) => m.display_name === `Sample ${name}`)!.id;
  assert.equal((await f.api(`/v1/members/${id("Morgan")}/pause`, f.admin, "POST")).status, 200);
  assert.equal((await f.api(`/v1/members/${id("Gray")}/leave`, f.admin, "POST")).status, 200);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const page = (await coach.get("/coach/activity/all")).html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(page, /Sample Morgan is taking a break/);
  assert.match(page, /Sample Gray is not playing next season/);
  assert.match(page, /Sample Harper agreed to play Sample doubles with Sample Parker next season/);
  assert.match(page, /Sample Indy asked Sample Bailey to play Sample doubles with them next season/);
  assert.match(page, /Sample Taylor is not playing Sample doubles next season/);
  assert.doesNotMatch(page, /undefined|member\.(paused|leaving)/);
  // The feed names them itself, the partner only for a key that may read members.
  const choice = (body: any) => body.data.find((e: any) => e.type === "partner_choice.recorded" && e.payload.agreed);
  const feed = (await f.api("/v1/events?order=newest&limit=100", f.admin)).body;
  assert.equal(choice(feed).competition_name, "Sample doubles");
  assert.match(choice(feed).partner_name, /^Sample (Harper|Parker)$/);
  const key = await f.api("/v1/api-keys", f.admin, "POST", { name: "Feed only", scopes: ["league:read"] });
  assert.equal(key.status, 201, JSON.stringify(key.body));
  const narrow = (await f.api("/v1/events?order=newest&limit=100", key.body.key)).body;
  assert.equal(choice(narrow).competition_name, "Sample doubles");
  assert.equal(choice(narrow).partner_name, null);
});

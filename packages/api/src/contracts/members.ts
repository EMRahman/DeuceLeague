import { createRoute, z } from "@hono/zod-openapi";
import { AgeGroup, Gender, MemberStatus } from "@deuceleague/schema";
import { authProblems, conflictProblem, Flag, IdParam, notFoundProblem, PageQuery, pageOf, requires, Timestamp, validationProblem } from "./shared.js";

/** The coach's playing level, on the scale British clubs know from the LTA's ratings. */
export const Level = z.number().int().min(1).max(10).openapi({
  example: 5,
  description:
    "How well they play, as the coach judges it: 10 a beginner, 5 intermediate, 4 a strong club player, " +
    "1 a national player. Set by the coach; the core computes nothing from it.",
});

/** Marks a field as personal data in the spec, as docs/SCHEMA.md marks its column. */
export const pii = (description: string) =>
  `PII. ${description} Present only for a credential holding \`members:pii\`.`;
export const PII_INPUT = "PII. Setting it needs `members:pii`.";

export const Member = z
  .object({
    id: z.uuid(),
    display_name: z.string().openapi({
      example: "Sam K.",
      description: "The name they play under: the only one shown to players and the public.",
    }),
    status: MemberStatus,
    rating: z.number().nullable().openapi({ description: "Stored as given; the core computes no ratings." }),
    rating_system: z.string().nullable().openapi({ example: "UTR" }),
    level: Level.nullable(),
    joined_on: z.iso.date().nullable(),
    leaving_at: Timestamp.nullable().openapi({
      description:
        "When they said they are not playing next season at all, if they did. It takes every entry they held " +
        "then out of next season's draft, singles and doubles, as if each had opted out; their results and " +
        "outstanding matches stand. See `POST /v1/members/{id}/leave`.",
    }),
    deleted_at: Timestamp.nullable().openapi({
      description: "When they were removed from the club's list. Their results remain.",
    }),
    signed_in_at: Timestamp.nullable().openapi({
      description:
        "When they signed in on the newest device where they are still signed in. Null when they are signed " +
        "in nowhere, so they need a login link.",
    }),
    created_at: Timestamp,
    updated_at: Timestamp,
    full_name: z.string().nullable().optional().openapi({ description: pii("Their full name.") }),
    email: z.string().nullable().optional().openapi({ description: pii("Unique within the club.") }),
    invitation_state: z.enum(["accepted", "failed"]).nullable().optional().openapi({ description: pii("Latest coach invitation outcome. Accepted means provider acceptance, not inbox delivery.") }),
    invitation_at: Timestamp.nullable().optional().openapi({ description: pii("When the latest invitation outcome was recorded.") }),
    phone: z.string().nullable().optional().openapi({ description: pii("As they gave it.") }),
    date_of_birth: z.iso.date().nullable().optional().openapi({ description: pii("For junior eligibility.") }),
    gender: Gender.nullable()
      .optional()
      .openapi({ description: pii("Used only to warn about an unusual mixed pair; never enforced.") }),
    age_group: AgeGroup.nullable()
      .optional()
      .openapi({ description: pii("An age band the club reads at a glance, never a birth date. Used to plan draws.") }),
    notes: z.string().nullable().optional().openapi({ description: pii("Anything the coach wrote down.") }),
  })
  .openapi("Member");

/** The fields that are personal data. Reading or writing any of them needs members:pii. */
export const PERSONAL = ["full_name", "email", "phone", "date_of_birth", "gender", "age_group", "notes"] as const;

export const MemberFields = z.object({
  display_name: z.string().trim().min(1).max(60),
  status: MemberStatus.optional().openapi({ description: "Defaults to `active` for a new member." }),
  rating: z.number().min(-999.999).max(999.999).nullable().optional(),
  rating_system: z.string().trim().min(1).max(40).nullable().optional(),
  level: Level.nullable().optional(),
  joined_on: z.iso.date().nullable().optional(),
  full_name: z.string().trim().min(1).max(200).nullable().optional().openapi({ description: PII_INPUT }),
  email: z.email().max(254).nullable().optional().openapi({ description: PII_INPUT }),
  phone: z.string().trim().min(1).max(40).nullable().optional().openapi({ description: PII_INPUT }),
  date_of_birth: z.iso.date().nullable().optional().openapi({ description: PII_INPUT }),
  gender: Gender.nullable().optional().openapi({ description: PII_INPUT }),
  age_group: AgeGroup.nullable().optional().openapi({ description: PII_INPUT }),
  notes: z.string().max(5000).nullable().optional().openapi({ description: PII_INPUT }),
});
export const NewMember = MemberFields.openapi("NewMember");
export const MemberPatch = MemberFields.partial().openapi("MemberChanges");

export const one = { content: { "application/json": { schema: Member } } };

export const list = createRoute({
  method: "get",
  path: "/v1/members",
  tags: ["Members"],
  summary: "List members",
  description:
    "Oldest first. Display names and status for `members:read`; the personal fields as well for a " +
    "credential that also holds `members:pii`. Removed members are left out unless asked for. Finding a " +
    "member by email needs `members:pii` too: it is how a website sends a player their login link.",
  ...requires("members:read"),
  request: {
    query: PageQuery.extend({
      status: MemberStatus.optional(),
      email: z.email().max(254).optional().openapi({
        description: "PII. The member with this email address, whatever its case. Needs `members:pii`.",
      }),
      never_entered: Flag.optional().openapi({ description: "Only members who have never held a league entry, including withdrawn or historical entries. Needs `league:read`." }),
      include_removed: Flag.optional().openapi({ description: "Include members removed from the list." }),
    }),
  },
  responses: {
    200: { description: "A page of members.", content: { "application/json": { schema: pageOf(Member, "MemberPage") } } },
    ...validationProblem,
    ...authProblems,
  },
});

export const get = createRoute({
  method: "get",
  path: "/v1/members/{id}",
  tags: ["Members"],
  summary: "A member",
  description: "Removed members too: their id still appears on old results.",
  ...requires("members:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The member.", ...one }, ...authProblems, ...notFoundProblem },
});

export const create = createRoute({
  method: "post",
  path: "/v1/members",
  tags: ["Members"],
  summary: "Add a member",
  description: "Only `display_name` is required. Setting any personal field also needs `members:pii`.",
  ...requires("members:write"),
  request: { body: { content: { "application/json": { schema: NewMember } }, required: true } },
  responses: {
    201: { description: "The new member.", ...one },
    ...validationProblem,
    ...authProblems,
    ...conflictProblem("`email_taken`: another member has that email address."),
  },
});

export const patch = createRoute({
  method: "patch",
  path: "/v1/members/{id}",
  tags: ["Members"],
  summary: "Change a member",
  description:
    "Only the fields sent change; null clears one. Changing any personal field also needs `members:pii`. " +
    "`status: paused` is a break (see `POST /v1/members/{id}/pause`). `status: left` records that they have left the club: their results stay, they are not placed in the next " +
    "season's draft, and they cannot be entered in a competition. Any place they hold in a draft is taken out at once. Setting " +
    "it back to `active` undoes the status, not the places taken out.",
  ...requires("members:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: MemberPatch } }, required: true } },
  responses: {
    200: { description: "The member, changed.", ...one },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`email_taken`, or `member_removed`: a removed member cannot be changed."),
  },
});

export const leave = createRoute({
  method: "post",
  path: "/v1/members/{id}/leave",
  tags: ["Members"],
  summary: "Say this member is not playing next season at all",
  description:
    "For a player who is leaving the league altogether, not only one competition: every entry they hold now, in " +
    "singles and doubles, is left out of next season's draft with a sentence saying why, and a doubles partner is " +
    "left needing a partner. Recorded once, as one event. It changes nothing about this season: their results " +
    "and outstanding matches stand, and they can still report them. An entry made after they said it is not " +
    "covered, so a player who changes their mind and is entered again is not caught by it. A player's session " +
    "may do this for themselves; a key needs `league:write`, for a player who said so in person. Saying it twice " +
    "keeps the first time. It is not leaving the club: that is `status: left` on the member.",
  ...requires.orPlayerOwn("league:write"),
  request: { params: IdParam },
  responses: {
    200: { description: "The member, leaving.", ...one },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`member_removed`: a removed member cannot be changed."),
  },
});

export const stay = createRoute({
  method: "delete",
  path: "/v1/members/{id}/leave",
  tags: ["Members"],
  summary: "Take back not playing next season at all",
  description:
    "Clears it, so the entries it covered are back in the reckoning for next season, except those that had " +
    "opted out on their own: the opt-outs a player made one entry at a time are left as they were. Harmless " +
    "if they never said it.",
  ...requires.orPlayerOwn("league:write"),
  request: { params: IdParam },
  responses: {
    200: { description: "The member, playing on.", ...one },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`member_removed`: a removed member cannot be changed."),
  },
});

export const pause = createRoute({
  method: "post",
  path: "/v1/members/{id}/pause",
  tags: ["Members"],
  summary: "Take a break from the league until they say they are back",
  description:
    "Sets the member's status to `paused`: a player taking a season off, or longer, who will return. Unlike " +
    "`/leave`, which covers the next draft only, a break lasts until it is ended with `DELETE`. While it lasts they " +
    "are left out of every draft (the reason says a member is taking a break), a doubles partner is left needing " +
    "a partner, they cannot be entered in a competition, and a match against an entry whose members are all away is " +
    "not chased. It changes nothing about this season: their results and matches stand, and anyone whose opponent " +
    "has stepped away for good is credited by withdrawing the entry. A player's session may do this for themselves; " +
    "a key needs `league:write`. Not for someone who has left the club (`status: left`). Saying it twice does nothing more.",
  ...requires.orPlayerOwn("league:write"),
  request: { params: IdParam },
  responses: {
    200: { description: "The member, on a break.", ...one },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`member_removed`, or `member_left`: someone who has left the club is not on a break."),
  },
});

export const resume = createRoute({
  method: "delete",
  path: "/v1/members/{id}/pause",
  tags: ["Members"],
  summary: "Say they are back from a break",
  description:
    "Sets the member's status back to `active`. They are in the reckoning for drafts again, but not placed in one " +
    "already filled: the coach adds them from the draft's newcomers, or from those not carried over, who are listed " +
    "with where they finished. Harmless if they were not on a break.",
  ...requires.orPlayerOwn("league:write"),
  request: { params: IdParam },
  responses: {
    200: { description: "The member, active.", ...one },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`member_removed`, or `member_left`."),
  },
});

export const remove = createRoute({
  method: "delete",
  path: "/v1/members/{id}",
  tags: ["Members"],
  summary: "Remove a member",
  description:
    "Takes them off the club's list and ends any login they hold. Nothing is deleted: their results " +
    "stay, under their display name. To remove their personal data as well, erase them.",
  ...requires("members:write"),
  request: { params: IdParam },
  responses: { 204: { description: "Removed." }, ...authProblems, ...notFoundProblem },
});

export const erase = createRoute({
  method: "post",
  path: "/v1/members/{id}/erase",
  tags: ["Members"],
  summary: "Erase a member's personal data",
  description:
    "For an erasure request under GDPR. Clears every personal field, replaces their display name with " +
    '"Erased member", clears entry names and typed-in score reports that could name them, ends their ' +
    "logins and removes them from the list. Their results stay, so every table still adds up. " +
    "Cannot be undone.",
  ...requires("admin"),
  request: { params: IdParam },
  responses: { 200: { description: "What is left of the member.", ...one }, ...authProblems, ...notFoundProblem },
});

/** Adapters send mail; the core records the outcome without storing a link or provider error. */
export const invitation = createRoute({
  method: "post", path: "/v1/members/{id}/invitation", tags: ["Members"],
  summary: "Record a sign-in invitation outcome",
  description: "The sending adapter records provider acceptance or failure. This does not send email or confirm inbox delivery.",
  ...requires("members:write", "members:pii"),
  request: { params: IdParam, body: { required: true, content: { "application/json": {
    schema: z.object({ state: z.enum(["accepted", "failed"]), email: z.email().max(254) }),
  } } } },
  responses: { 200: { description: "Outcome recorded.", ...one }, ...authProblems, ...notFoundProblem, ...conflictProblem, ...validationProblem },
});

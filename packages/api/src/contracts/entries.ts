import { EntryRole, EntryState, PlacementReason } from "@deuceleague/schema";
import { createRoute, z } from "@hono/zod-openapi";
import {
  authProblems,
  conflictProblem,
  IdParam,
  notFoundProblem,
  requires,
  Timestamp,
  validationProblem,
} from "./shared.js";

export const Entry = z
  .object({
    id: z.uuid(),
    competition_id: z.uuid(),
    division_id: z.uuid(),
    label: z.string().openapi({
      example: "Sam Kerr / Alex Price",
      description: "How the entry is written in a table: its own name, or its members' display names.",
    }),
    display_name: z.string().nullable().openapi({ description: "The entry's own name, if it has one." }),
    members: z
      .array(z.object({ id: z.uuid(), display_name: z.string(), role: EntryRole }))
      .openapi({ description: "One for singles, two for doubles: the player, then their partner." }),
    seed: z.number().int().nullable(),
    state: EntryState,
    placement_reason: PlacementReason.nullable().openapi({ description: "Why the entry is in this division." }),
    previous_entry_id: z.uuid().nullable().openapi({
      description: "The same unit's entry in the previous competition.",
    }),
    withdrawn_at: Timestamp.nullable(),
    opted_out_at: Timestamp.nullable().openapi({
      description:
        "When the player said they are not playing in the next competition, or the coach recorded it for " +
        "them. Filling next season's draft leaves them out. It changes nothing about this competition.",
    }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Entry");

export const Warning = z
  .object({
    code: z.string().openapi({ example: "mixed_pair" }),
    detail: z.string(),
  })
  .openapi("Warning", { description: "Something that looks wrong, but was done anyway: the coach's judgement wins." });

export const NewEntry = z
  .object({
    division_id: z.uuid(),
    member_ids: z
      .array(z.uuid())
      .min(1)
      .max(2)
      .refine((ids) => new Set(ids).size === ids.length, "a member can only appear once")
      .openapi({ description: "One member for singles, two for doubles: the player first, then the partner." }),
    display_name: z.string().trim().min(1).max(100).nullable().optional(),
    seed: z.number().int().min(1).max(1000).nullable().optional(),
    placement_reason: PlacementReason.nullable().optional(),
    previous_entry_id: z.uuid().nullable().optional(),
  })
  .openapi("NewEntry");

export const EntryPatch = z
  .object({
    division_id: z.uuid().optional().openapi({
      description:
        "Moves the entry to another division of its competition. Only an entry with no match under way can " +
        "move; its untouched fixtures are removed, and generating fixtures in the new division adds its new ones. " +
        "An entry placed as promoted, relegated or held becomes `manual` unless a new `placement_reason` is sent.",
    }),
    display_name: z.string().trim().min(1).max(100).nullable().optional(),
    seed: z.number().int().min(1).max(1000).nullable().optional(),
    state: EntryState.optional().openapi({
      description:
        "`withdrawn` withdraws it: its matches stay, and the competition's rules say what they count for. " +
        "`active` reinstates it.",
    }),
    placement_reason: PlacementReason.nullable().optional(),
    previous_entry_id: z.uuid().nullable().optional(),
  })
  .openapi("EntryChanges");

export const one = { content: { "application/json": { schema: Entry } } };

export const list = createRoute({
  method: "get",
  path: "/v1/competitions/{id}/entries",
  tags: ["Entries"],
  summary: "A competition's entries",
  description: "In the order they were made. Not paged: a competition has a few dozen at most.",
  ...requires.orPlayer("league:read"),
  request: {
    params: IdParam,
    query: z.object({ division_id: z.uuid().optional(), state: EntryState.optional() }),
  },
  responses: {
    200: {
      description: "The entries.",
      content: { "application/json": { schema: z.object({ data: z.array(Entry) }).openapi("EntryList") } },
    },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
  },
});

export const get = createRoute({
  method: "get",
  path: "/v1/entries/{id}",
  tags: ["Entries"],
  summary: "An entry",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The entry.", ...one }, ...authProblems, ...notFoundProblem },
});

export const create = createRoute({
  method: "post",
  path: "/v1/competitions/{id}/entries",
  tags: ["Entries"],
  summary: "Enter a player or pair",
  description:
    "Checks the entry has one member for singles or two for doubles, and that none of them is already " +
    "in the competition. A pair that looks wrong for a mixed competition is entered with a warning, " +
    "never refused — and the warning, which reveals recorded gender, goes only to a credential holding " +
    "`members:pii`. Confirming placements is making entries with a `placement_reason`.",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: NewEntry } }, required: true } },
  responses: {
    201: {
      description: "The new entry, and anything that looked wrong about it.",
      content: {
        "application/json": { schema: Entry.extend({ warnings: z.array(Warning) }).openapi("NewEntryResult") },
      },
    },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`already_entered`, or `competition_closed`."),
  },
});

export const patch = createRoute({
  method: "patch",
  path: "/v1/entries/{id}",
  tags: ["Entries"],
  summary: "Change, move, withdraw or reinstate an entry",
  description: "Only the fields sent change; null clears one.",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: EntryPatch } }, required: true } },
  responses: {
    200: { description: "The entry, changed.", ...one },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`entry_has_matches`, moving an entry with a match under way; or `competition_closed`."),
  },
});

export const remove = createRoute({
  method: "delete",
  path: "/v1/entries/{id}",
  tags: ["Entries"],
  summary: "Delete an entry made by mistake",
  description:
    "Only an entry with no match under way, together with its untouched fixtures. An entry that has " +
    "played is withdrawn instead, so its results stay on record.",
  ...requires("league:write"),
  request: { params: IdParam },
  responses: {
    204: { description: "Deleted." },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`entry_has_matches`, or `competition_closed`."),
  },
});

export const optOut = createRoute({
  method: "post",
  path: "/v1/entries/{id}/opt-out",
  tags: ["Entries"],
  summary: "Say this entry is not playing in the next competition",
  description:
    "The one thing a player says about next season, and they say it about the entry they hold now: filling " +
    "next season's draft leaves them out, with a sentence saying why, and the coach can add them back if " +
    "they change their mind. It changes nothing about this competition — their outstanding matches stand, " +
    "and they can still report them. A player's session may do this for an entry they play in; a key needs " +
    "`league:write`, for a player who said so in person. Saying it twice keeps the first time.",
  ...requires.orPlayerOwn("league:write"),
  request: { params: IdParam },
  responses: {
    200: { description: "The entry, opted out.", ...one },
    ...authProblems,
    ...notFoundProblem,
  },
});

export const optIn = createRoute({
  method: "delete",
  path: "/v1/entries/{id}/opt-out",
  tags: ["Entries"],
  summary: "Take back opting out of the next competition",
  description: "Puts the entry back in the reckoning for next season's placements. Harmless if it never opted out.",
  ...requires.orPlayerOwn("league:write"),
  request: { params: IdParam },
  responses: {
    200: { description: "The entry, back in the reckoning.", ...one },
    ...authProblems,
    ...notFoundProblem,
  },
});

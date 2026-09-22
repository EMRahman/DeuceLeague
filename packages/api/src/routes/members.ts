import {
  createMember,
  eraseMember,
  getMember,
  listMembers,
  removeMember,
  updateMember,
  type MemberChanges,
  type MemberRecord,
} from "@deuceleague/db";
import { Gender, MemberStatus } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv, Auth } from "../context.js";
import { problems } from "../problems.js";
import {
  audit,
  authProblems,
  conflictProblem,
  definedOnly,
  Flag,
  IdParam,
  iso,
  notFoundProblem,
  PageQuery,
  pageOf,
  requires,
  sentFields,
  Timestamp,
  validationProblem,
} from "./shared.js";

/** Marks a field as personal data in the spec, as docs/SCHEMA.md marks its column. */
const pii = (description: string) =>
  `PII. ${description} Present only for a credential holding \`members:pii\`.`;
const PII_INPUT = "PII. Setting it needs `members:pii`.";

const Member = z
  .object({
    id: z.uuid(),
    display_name: z.string().openapi({
      example: "Sam K.",
      description: "The name they play under: the only one shown to players and the public.",
    }),
    status: MemberStatus,
    rating: z.number().nullable().openapi({ description: "Stored as given; the core computes no ratings." }),
    rating_system: z.string().nullable().openapi({ example: "UTR" }),
    joined_on: z.iso.date().nullable(),
    deleted_at: Timestamp.nullable().openapi({
      description: "When they were removed from the club's list. Their results remain.",
    }),
    created_at: Timestamp,
    updated_at: Timestamp,
    full_name: z.string().nullable().optional().openapi({ description: pii("Their full name.") }),
    email: z.string().nullable().optional().openapi({ description: pii("Unique within the club.") }),
    phone: z.string().nullable().optional().openapi({ description: pii("As they gave it.") }),
    date_of_birth: z.iso.date().nullable().optional().openapi({ description: pii("For junior eligibility.") }),
    gender: Gender.nullable()
      .optional()
      .openapi({ description: pii("Used only to warn about an unusual mixed pair; never enforced.") }),
    notes: z.string().nullable().optional().openapi({ description: pii("Anything the coach wrote down.") }),
  })
  .openapi("Member");

/** The fields that are personal data. Reading or writing any of them needs members:pii. */
const PERSONAL = ["full_name", "email", "phone", "date_of_birth", "gender", "notes"] as const;

const MemberFields = z.object({
  display_name: z.string().trim().min(1).max(60),
  status: MemberStatus.optional().openapi({ description: "Defaults to `active` for a new member." }),
  rating: z.number().min(-999.999).max(999.999).nullable().optional(),
  rating_system: z.string().trim().min(1).max(40).nullable().optional(),
  joined_on: z.iso.date().nullable().optional(),
  full_name: z.string().trim().min(1).max(200).nullable().optional().openapi({ description: PII_INPUT }),
  email: z.email().max(254).nullable().optional().openapi({ description: PII_INPUT }),
  phone: z.string().trim().min(1).max(40).nullable().optional().openapi({ description: PII_INPUT }),
  date_of_birth: z.iso.date().nullable().optional().openapi({ description: PII_INPUT }),
  gender: Gender.nullable().optional().openapi({ description: PII_INPUT }),
  notes: z.string().max(5000).nullable().optional().openapi({ description: PII_INPUT }),
});
const NewMember = MemberFields.openapi("NewMember");
const MemberPatch = MemberFields.partial().openapi("MemberChanges");

const holdsPii = (auth: Auth) => auth.scopes.has("members:pii");

function toMember(m: MemberRecord, withPii: boolean): z.infer<typeof Member> {
  const listed = {
    id: m.id,
    display_name: m.displayName,
    status: m.status as MemberStatus,
    rating: m.rating === null ? null : Number(m.rating),
    rating_system: m.ratingSystem,
    joined_on: m.joinedOn,
    deleted_at: iso(m.deletedAt),
    created_at: iso(m.createdAt),
    updated_at: iso(m.updatedAt),
  };
  if (!withPii) return listed;
  return {
    ...listed,
    full_name: m.fullName ?? null,
    email: m.email ?? null,
    phone: m.phone ?? null,
    date_of_birth: m.dateOfBirth ?? null,
    gender: (m.gender ?? null) as Gender | null,
    notes: m.notes ?? null,
  };
}

/**
 * Personal data is behind members:pii both ways: a credential that cannot
 * read an email address cannot set or overwrite one either.
 */
function checkPersonalWrite(body: z.infer<typeof MemberPatch>, auth: Auth): void {
  if (!holdsPii(auth) && PERSONAL.some((field) => body[field] !== undefined)) {
    throw problems.insufficientScope(["members:pii"]);
  }
}

function toChanges(body: z.infer<typeof MemberPatch>): MemberChanges {
  return definedOnly({
    displayName: body.display_name,
    status: body.status,
    rating: body.rating === undefined || body.rating === null ? body.rating : String(body.rating),
    ratingSystem: body.rating_system,
    joinedOn: body.joined_on,
    fullName: body.full_name,
    email: body.email,
    phone: body.phone,
    dateOfBirth: body.date_of_birth,
    gender: body.gender,
    notes: body.notes,
  });
}

const one = { content: { "application/json": { schema: Member } } };

const list = createRoute({
  method: "get",
  path: "/v1/members",
  tags: ["Members"],
  summary: "List members",
  description:
    "Oldest first. Display names and status for `members:read`; the personal fields as well for a " +
    "credential that also holds `members:pii`. Removed members are left out unless asked for.",
  ...requires("members:read"),
  request: {
    query: PageQuery.extend({
      status: MemberStatus.optional(),
      include_removed: Flag.optional().openapi({ description: "Include members removed from the list." }),
    }),
  },
  responses: {
    200: { description: "A page of members.", content: { "application/json": { schema: pageOf(Member, "MemberPage") } } },
    ...validationProblem,
    ...authProblems,
  },
});

const get = createRoute({
  method: "get",
  path: "/v1/members/{id}",
  tags: ["Members"],
  summary: "A member",
  description: "Removed members too: their id still appears on old results.",
  ...requires("members:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The member.", ...one }, ...authProblems, ...notFoundProblem },
});

const create = createRoute({
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

const patch = createRoute({
  method: "patch",
  path: "/v1/members/{id}",
  tags: ["Members"],
  summary: "Change a member",
  description:
    "Only the fields sent change; null clears one. Changing any personal field also needs `members:pii`.",
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

const remove = createRoute({
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

const erase = createRoute({
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

export function registerMembers(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const query = c.req.valid("query");
    const withPii = holdsPii(c.get("auth"));
    const page = await listMembers(c.get("tx"), {
      pii: withPii,
      status: query.status,
      includeRemoved: query.include_removed ?? false,
      limit: query.limit,
      after: query.after,
    });
    return c.json({ data: page.rows.map((m) => toMember(m, withPii)), next_cursor: page.next }, 200);
  });

  app.openapi(get, async (c) => {
    const withPii = holdsPii(c.get("auth"));
    const member = await getMember(c.get("tx"), c.req.valid("param").id, withPii);
    if (!member) throw problems.notFound("member");
    return c.json(toMember(member, withPii), 200);
  });

  app.openapi(create, async (c) => {
    const body = c.req.valid("json");
    const auth = c.get("auth");
    checkPersonalWrite(body, auth);
    const tx = c.get("tx");
    const id = await createMember(tx, auth.clubId, { ...toChanges(body), displayName: body.display_name });
    await audit(c, "member.created", { type: "member", id }, { fields: sentFields(body) });
    const member = await getMember(tx, id, holdsPii(auth));
    return c.json(toMember(member!, holdsPii(auth)), 201);
  });

  app.openapi(patch, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const auth = c.get("auth");
    const tx = c.get("tx");
    const existing = await getMember(tx, id, false);
    if (!existing) throw problems.notFound("member");
    if (existing.deletedAt) {
      throw problems.conflict("member_removed", "A removed member cannot be changed");
    }
    checkPersonalWrite(body, auth);
    const changed = sentFields(body);
    if (changed.length > 0) {
      await updateMember(tx, id, toChanges(body));
      await audit(c, "member.updated", { type: "member", id }, { changed });
    }
    const member = await getMember(tx, id, holdsPii(auth));
    return c.json(toMember(member!, holdsPii(auth)), 200);
  });

  app.openapi(remove, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const existing = await getMember(tx, id, false);
    if (!existing) throw problems.notFound("member");
    if (!existing.deletedAt) {
      await removeMember(tx, id);
      await audit(c, "member.removed", { type: "member", id });
    }
    return c.body(null, 204);
  });

  app.openapi(erase, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    if (!(await eraseMember(tx, id))) throw problems.notFound("member");
    await audit(c, "member.erased", { type: "member", id });
    const member = await getMember(tx, id, holdsPii(c.get("auth")));
    return c.json(toMember(member!, holdsPii(c.get("auth"))), 200);
  });
}

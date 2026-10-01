import { createRoute, z } from "@hono/zod-openapi";
import { AgeGroup, Gender } from "@deuceleague/schema";
import { Level, Member, pii } from "./members.js";
import { authProblems, conflictProblem, IdParam, notFoundProblem, PageQuery, pageOf, requires, Timestamp, validationProblem } from "./shared.js";

export const JoinRequest = z
  .object({
    id: z.uuid(),
    first_name: z.string().openapi({ description: pii("As they typed it.") }),
    surname: z.string().openapi({ description: pii("As they typed it.") }),
    email: z.string().nullable().openapi({ description: pii("An email address, a phone number, or both.") }),
    phone: z.string().nullable().openapi({ description: pii("As they typed it.") }),
    gender: Gender.nullable().openapi({ description: pii("As they chose it on the form; null if the request did not carry one.") }),
    age_group: AgeGroup.nullable().openapi({ description: pii("The band they chose on the form, or null if they left it blank.") }),
    privacy_notice: z.string().openapi({
      example: "uk-2026-09-30",
      description: "Which privacy notice they read and agreed to, when they asked.",
    }),
    created_at: Timestamp.openapi({ description: "When they asked, and agreed to the privacy notice." }),
    expires_at: Timestamp.openapi({ description: "When the request is deleted if nobody has decided it." }),
    member: z
      .object({ id: z.uuid(), display_name: z.string() })
      .nullable()
      .openapi({ description: "A member already on the club's list with the same email address." }),
  })
  .openapi("JoinRequest");

export const NewJoinRequest = z
  .object({
    first_name: z.string().trim().min(1).max(60),
    surname: z.string().trim().min(1).max(60),
    email: z.email().max(254).nullable().optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9 ()-]{5,23}$/, "A phone number has digits, and may start with +")
      .nullable()
      .optional(),
    gender: Gender.nullable().optional().openapi({ description: "The club's own form always sends one. Copied to the member on approval." }),
    age_group: AgeGroup.nullable().optional().openapi({ description: "Optional. Copied to the member on approval." }),
    privacy_notice: z.string().trim().min(1).max(40).openapi({
      example: "uk-2026-09-30",
      description: "Which privacy notice the person read and agreed to. The form that showed it names it.",
    }),
  })
  .refine((r) => r.email || r.phone, { path: ["email"], message: "Give an email address, a phone number, or both" })
  .openapi("NewJoinRequest");

export const Approval = z
  .object({
    display_name: z.string().trim().min(1).max(60).optional().openapi({
      description: 'The name they play under. Defaults to their first name and initial, such as "Sam K."',
    }),
    level: Level.nullable().optional(),
    gender: Gender.nullable().optional().openapi({ description: "Replaces the one on the request, if the coach knows better." }),
    age_group: AgeGroup.nullable().optional().openapi({ description: "Replaces the one on the request." }),
  })
  .openapi("JoinRequestApproval");

const one = { content: { "application/json": { schema: JoinRequest } } };

export const list = createRoute({
  method: "get",
  path: "/v1/join-requests",
  tags: ["Join requests"],
  summary: "List join requests",
  description:
    "People who asked to join on the club's form and are waiting for the coach, oldest first. Each is " +
    "deleted after 30 days if nobody decides it. Everything in one is personal, so this needs `members:pii`.",
  ...requires("members:read", "members:pii"),
  request: { query: PageQuery },
  responses: {
    200: { description: "A page of join requests.", content: { "application/json": { schema: pageOf(JoinRequest, "JoinRequestPage") } } },
    ...validationProblem,
    ...authProblems,
  },
});

export const get = createRoute({
  method: "get",
  path: "/v1/join-requests/{id}",
  tags: ["Join requests"],
  summary: "A join request",
  ...requires("members:read", "members:pii"),
  request: { params: IdParam },
  responses: { 200: { description: "The join request.", ...one }, ...authProblems, ...notFoundProblem },
});

export const create = createRoute({
  method: "post",
  path: "/v1/join-requests",
  tags: ["Join requests"],
  summary: "Ask to join",
  description:
    "What a club's public sign-up form sends, with its own key. The person is not a member until the coach " +
    "approves them. Nothing here limits how many arrive: the form's website does that, since only it sees " +
    "who is asking.",
  ...requires("members:write", "members:pii"),
  request: { body: { content: { "application/json": { schema: NewJoinRequest } }, required: true } },
  responses: {
    201: { description: "The request, waiting for the coach.", ...one },
    ...validationProblem,
    ...authProblems,
    ...conflictProblem("`already_requested`: someone with that email address is already waiting."),
  },
});

export const approve = createRoute({
  method: "post",
  path: "/v1/join-requests/{id}/approve",
  tags: ["Join requests"],
  summary: "Approve a join request",
  description:
    "Adds them to the club's list as an active member, with their full name, contact details, gender and age " +
    "group, and the level given, and deletes the request. They are not placed in a running season: the " +
    "coach places them in the draft for the next one. The member's `member.created` event records the request and the privacy " +
    "notice they agreed to.",
  ...requires("members:write", "members:pii"),
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: Approval } }, required: false },
  },
  responses: {
    201: { description: "The new member.", content: { "application/json": { schema: Member } } },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`email_taken`: a member already has that email address."),
  },
});

export const decline = createRoute({
  method: "delete",
  path: "/v1/join-requests/{id}",
  tags: ["Join requests"],
  summary: "Decline a join request",
  description: "Deletes the request and everything they sent. They are not told.",
  ...requires("members:write"),
  request: { params: IdParam },
  responses: { 204: { description: "Declined." }, ...authProblems, ...notFoundProblem },
});

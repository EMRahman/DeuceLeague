import type { MemberRecord, MemberChanges } from "@deuceleague/db-d1";
import type { AgeGroup, Gender, MemberStatus, WantsToPlay } from "@deuceleague/schema";
import type { Auth } from "../context.js";
import { PERSONAL, type MemberPatch, type Member } from "../contracts/members.js";
import { problems } from "../problems.js";
import type { z } from "@hono/zod-openapi";
import { iso, definedOnly } from "../contracts/shared.js";

export const holdsPii = (auth: Auth) => auth.scopes.has("members:pii");

export function toMember(m: MemberRecord, withPii: boolean): z.infer<typeof Member> {
  const listed = {
    id: m.id,
    display_name: m.displayName,
    status: m.status as MemberStatus,
    rating: m.rating === null ? null : Number(m.rating),
    rating_system: m.ratingSystem,
    level: m.level,
    joined_on: m.joinedOn,
    wants_to_play: m.plays as WantsToPlay | null,
    leaving_at: iso(m.leavingAt),
    deleted_at: iso(m.deletedAt),
    signed_in_at: iso(m.signedInAt),
    last_signed_in_at: iso(m.lastSignedInAt),
    created_at: iso(m.createdAt),
    updated_at: iso(m.updatedAt),
  };
  if (!withPii) return listed;
  return {
    ...listed,
    full_name: m.fullName ?? null,
    email: m.email ?? null,
    phone: m.phone ?? null,
    invitation_state: m.invitationState ?? null,
    invitation_at: m.invitationAt == null ? null : new Date(m.invitationAt).toISOString(),
    date_of_birth: m.dateOfBirth ?? null,
    gender: (m.gender ?? null) as Gender | null,
    age_group: (m.ageGroup ?? null) as AgeGroup | null,
    notes: m.notes ?? null,
  };
}

/**
 * Personal data is behind members:pii both ways: a credential that cannot
 * read an email address cannot set or overwrite one either.
 */
export function checkPersonalWrite(body: z.infer<typeof MemberPatch>, auth: Auth): void {
  if (!holdsPii(auth) && PERSONAL.some((field) => body[field] !== undefined)) {
    throw problems.insufficientScope(["members:pii"]);
  }
}

export function toChanges(body: z.infer<typeof MemberPatch>): MemberChanges {
  return definedOnly({
    displayName: body.display_name,
    status: body.status,
    rating: body.rating === undefined || body.rating === null ? body.rating : String(body.rating),
    ratingSystem: body.rating_system,
    level: body.level,
    joinedOn: body.joined_on,
    plays: body.wants_to_play,
    fullName: body.full_name,
    email: body.email,
    phone: body.phone,
    dateOfBirth: body.date_of_birth,
    gender: body.gender,
    ageGroup: body.age_group,
    notes: body.notes,
  });
}

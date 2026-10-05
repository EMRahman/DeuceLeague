import { JOIN_REQUEST_DAYS, type JoinRequestRecord } from "@deuceleague/db-d1";
import type { AgeGroup, Gender, WantsToPlay } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import type { JoinRequest } from "../contracts/join-requests.js";
import { iso } from "../contracts/shared.js";

export function toJoinRequest(r: JoinRequestRecord): z.infer<typeof JoinRequest> {
  return {
    id: r.id,
    first_name: r.firstName,
    surname: r.surname,
    email: r.email,
    phone: r.phone,
    gender: r.gender as Gender | null,
    age_group: r.ageGroup as AgeGroup | null,
    wants_to_play: r.plays as WantsToPlay | null,
    privacy_notice: r.privacyNotice,
    created_at: iso(r.createdAt),
    expires_at: iso(new Date(r.createdAt.getTime() + JOIN_REQUEST_DAYS * 86_400_000)),
    member: r.member && { id: r.member.id, display_name: r.member.displayName },
  };
}

/** "Sam Kerr": how players are named to each other unless the coach chooses otherwise. A name too long for the
 * field becomes "Sam K.". */
export function displayNameOf(r: Pick<JoinRequestRecord, "firstName" | "surname">): string {
  const first = r.firstName.trim(), surname = r.surname.trim();
  const full = `${first} ${surname}`.trim();
  if (full.length <= 60) return full;
  const initial = [...surname][0];
  return (initial ? `${first} ${initial.toUpperCase()}.` : first).slice(0, 60);
}

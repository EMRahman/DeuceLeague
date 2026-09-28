import type { IdentitySnapshot } from "@deuceleague/db-d1";
import { Scope } from "@deuceleague/schema";
import type { AccessEnv } from "./access.js";
import type { Auth } from "./context.js";
import { problems } from "./problems.js";

export type CloudflareEnv = { Variables: AccessEnv["Variables"] & { requestId: string; identity: IdentitySnapshot } };

export function authFor(state: IdentitySnapshot): Auth {
  const row = state.credential;
  if (!row || !state.club || row.club_id !== state.club.id) throw problems.invalidCredential();
  const scopes: unknown[] = JSON.parse(row.scopes);
  return {
    clubId: row.club_id,
    scopes: new Set(row.kind === "login_link" ? [] : scopes.filter((s): s is Scope => Scope.safeParse(s).success)),
    credential: row.kind === "api_key"
      ? { type: "api_key", id: row.id }
      : { type: row.kind, id: row.id, memberId: row.member_id! },
  };
}

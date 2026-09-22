import type { Tx } from "@deuceleague/db";
import type { Scope } from "@deuceleague/schema";

/**
 * What presented the request: a coach's API key, a player's session, or a
 * login link being exchanged for one. A session and a link each speak for
 * exactly one member.
 */
export type Credential =
  | { type: "api_key"; id: string }
  | { type: "session"; id: string; memberId: string }
  | { type: "login_link"; id: string; memberId: string };

/** Who is asking, for which club, allowed to do what. Set once, by authenticate. */
export type Auth = {
  clubId: string;
  scopes: ReadonlySet<Scope>;
  credential: Credential;
};

/** What every handler can read from its context. */
export type AppEnv = {
  Variables: {
    requestId: string;
    /** This request's transaction, already scoped to the club by row-level security. */
    tx: Tx;
    auth: Auth;
    /** Set once the route has checked the credential against what it takes. See requireAccess. */
    accessChecked: boolean;
  };
};

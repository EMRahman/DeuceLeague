import type { Tx } from "@deuceleague/db";
import type { Scope } from "@deuceleague/schema";

/** What presented the request. Member sessions from magic links arrive in a later phase. */
export type Credential = { type: "api_key"; id: string };

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
    /** A public request's club, found from the slug in its path. Public routes have no `auth`. */
    publicClubId: string;
  };
};

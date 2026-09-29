# The coach's website

What a club's coach uses, at `/coach`: sign in with an API key, see the
member list, and make a player's sign-in link to hand over, for example on
WhatsApp. Server-rendered HTML with no scripts, in the players' site's style.

Like the [players' website](../website/README.md), it is an adapter. It
reaches the league only through the HTTP API and holds nothing of its own.
MIT-licensed.

## How it works

- **Signing in.** The coach pastes a key; logins are for players only. With
  an administrator key, the site makes a key for this browser
  (`POST /v1/api-keys`), named "Coach website" with the date, holding
  `league:read`, `league:write`, `members:read`, `members:write` and
  `members:pii`, and expiring after 90 days. The administrator key is used
  for that one call and never stored. A key without `admin` that holds
  `members:read` and `members:write` is kept as it is.
- **Staying signed in.** The key lives in an `HttpOnly`, `SameSite=Strict`
  cookie sent only to `/coach`. A key the API no longer accepts, because it
  expired or was revoked, is forgotten, and the coach signs in again.
- **Sign-in links.** "Sign-in link" on a member calls
  `POST /v1/members/{id}/login-link` with `expires_in_minutes` set to 72
  hours, since a chat message is often read hours later, and shows the link
  once. It works once.
- **Who is signed in.** The member list shows each member's `signed_in_at`,
  lists those not signed in yet first, and counts how many are signed in.

## Running it

The Cloudflare Worker mounts it at `/coach`, next to the players' website. See
the [Cloudflare deployment guide](../../deploy/cloudflare/README.md#coachs-site).

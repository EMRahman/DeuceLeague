# New players joining

Anyone can ask to join the league at `/join` on your site, for example
`https://riverside-league.your-subdomain.workers.dev/join`. Share that link
however you like: on the club's website, a poster's QR code, or WhatsApp. The
sign-in page links to it too, as "Ask to join the league".

The form asks for a first name, a surname, and an email address, a phone number
or both. It shows the club's [privacy notice](#the-privacy-notice-is-written-for-the-uk)
and asks the person to tick that they have read it.

Nobody is a member until you approve them. Until then, they are only a request.

## Approving

Sign in at `/coach`. When someone is waiting, the dashboard says so. On
**Members**, **Asking to join** lists each request, with the contact details
they gave. It also warns you if a member already has the same email address.

- **Approve** adds them to the club's list, under the name they play under
  (their first name and initial, such as "Robin H.", unless you change it) and
  the level you choose. You can then make them a **Sign-in link**. If they gave
  an email address and [sign-in emails](EMAIL.md) are set up, they can also
  sign in with that.
- **Decline** deletes the request and everything they sent. They are not told.

A request nobody decides is deleted after 30 days.

## Levels

Each member can have a level from 10 to 1, as British clubs know it from the
LTA's ratings:

| Level | Roughly |
| --- | --- |
| 10 | Beginner |
| 5 | Intermediate |
| 4 | Strong club player |
| 1 | National player |

Set it when you approve someone, and change it later on **Members**. Your
coding agent can read and set it through the API (`level` on a member) when it
places players in divisions. Nothing in DeuceLeague computes it or uses it on
its own.

## Keeping spam out

The form is open to the whole internet, so the Worker checks every request
before it reaches you:

- A hidden field that people never see is filled in only by programs.
- The form carries the time it was shown, signed by the Worker. A form sent
  within three seconds, or with a time the Worker did not sign, came from a
  program.
- Programs are thanked just as people are, and nothing they send is kept, so
  they learn nothing from trying.
- Each connection can send 3 requests a day. The Worker counts them against a
  scrambled form of the address, changed daily, and never stores the address.
- The club takes at most 100 requests a day. After that, the form asks people
  to try again tomorrow.
- Someone asking twice with the same email address is thanked again, but their
  first request stands.

These need no set-up. For a live club, also turn on Turnstile.

### Turnstile

[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) checks
that a person, not a program, is sending the form. Most people see only a
tick. It is free and uses no tracking cookies. It adds Cloudflare's script to
the join page only; every other page stays script-free.

1. In the Cloudflare dashboard, open **Turnstile** and choose **Add widget**.
2. Name it after your league. Add your site's hostname, such as
   `riverside-league.your-subdomain.workers.dev`, and your own domain if you
   use one. Leave the widget mode as **Managed**.
3. Copy the **site key** into `wrangler.jsonc`, under `vars`:

   ```jsonc
   "vars": {
     "PUBLIC_URL": "https://riverside-league.your-subdomain.workers.dev",
     "TURNSTILE_SITE_KEY": "0x4AAAAAAA…"
   }
   ```

4. Add the **secret key** as a Worker secret named `TURNSTILE_SECRET_KEY`:
   in the Worker's **Settings → Variables and Secrets**, or with
   `npx wrangler secret put TURNSTILE_SECRET_KEY`.
5. Commit `wrangler.jsonc`. Merging deploys it.

Set both keys or neither. With only one set, the site shows "not ready" rather
than run the form half-guarded.

### Settings

| Name | Where | What it does |
| --- | --- | --- |
| `SIGNUPS_PER_DAY` | `vars` | Requests the club takes a day, from 1 to 1000. Default 100. `"0"` turns the form off and removes its link. |
| `TURNSTILE_SITE_KEY` | `vars` | The Turnstile widget's site key. |
| `TURNSTILE_SECRET_KEY` | secret | The Turnstile widget's secret key. |

## The privacy notice is written for the UK

The form's [privacy notice](../../adapters/website/src/views.tsx) (the
`Privacy` page, at `/privacy`) is written for a club in the UK, under UK GDPR
and the Data Protection Act 2018. It says:

- who holds the details (the club), and what it holds;
- why: to run the league the person asked to join. That is a contract, so it
  needs no consent box;
- who sees what (other players see only the name they play under and their
  results), and that Cloudflare hosts it and runs Turnstile;
- how long it keeps them;
- the person's rights, and that they can complain to the
  [ICO](https://ico.org.uk/).

The league sends no marketing, so the form asks for no marketing consent. The
tick box records that the person read the notice. Each request, and the member
it becomes, records which version of the notice they agreed to and when.

Read the notice before you go live, and add your own contact details if people
should reach someone other than "your coach".

**A club outside the UK must change it.** The EU's GDPR is close to the UK's,
but it names a different regulator. Other countries have their own laws on
consent, children's data and what a notice must say. With your coding agent
(see [make the site your own](CUSTOMISE.md)):

1. Rewrite the `Privacy` page in `adapters/website/src/views.tsx`. Change the
   form's tick-box wording in `Join` too, if your law asks for something
   different, such as a consent box or a parent's consent for juniors.
2. Give the notice a new name in `PRIVACY_NOTICE`, in
   `adapters/website/src/join.ts`, such as `ie-2027-01-15`. Do the same whenever
   you change its wording, so each record says which notice that person agreed
   to.

Take advice if you are unsure what your country requires. This page is not
legal advice.

## Through the API

Your coding agent can do everything the members page does:

- `GET /v1/join-requests` lists the requests.
- `POST /v1/join-requests/{id}/approve`, with an optional `display_name` and
  `level`, approves one.
- `DELETE /v1/join-requests/{id}` declines one.

Listing and approving need `members:pii`, because everything in a request is
personal; declining needs only `members:write`. A
club that builds its own form can send `POST /v1/join-requests` with a key
holding `members:write` and `members:pii`. It then has to keep out spam itself,
as the Worker does for `/join`.

# Start your club

You have [tried DeuceLeague](TRY.md) and want to run your club on it. A real
club is a fresh deployment without the sample, because the sample can't be
removed. Keep the trial until the real club works, then delete it.

## 1. Deploy the club

Follow [Try it, steps 1 and 2](TRY.md#1-make-two-passwords) again, with:

- **two new passwords**, not the trial's;
- a Worker name for the real club, such as `riverside-league`;
- a **new database**. Never reuse the trial's.

## 2. Create the club

1. Open `/install` and enter the new `SETUP_TOKEN`.
2. **Save the administrator key** in your password manager. It is shown once.
   It is how you sign in as the coach and manage the club, and losing it means
   the [account-owner recovery procedure](RECOVERY.md).
3. Enter your club's name, identifier and time zone.
4. Leave **Add a sample league** unticked, and create the club.

Once it's created, you can remove `SETUP_TOKEN` from the Worker's secrets to
close the installer. Setup never reopens either way.

## 3. Set up the league

The coach's site doesn't add members or seasons yet. A coding agent, such as
Claude Code, does it through the API, and shows you the changes before making
them. For example:

> Using the DeuceLeague API at https://riverside-league.your-subdomain.workers.dev,
> add the members in members.csv, then create a summer season with men's and
> women's singles in divisions of six, from last year's tables in results.pdf.

[Running the league day to day](../../docs/COACH-WORKFLOW.md) explains how to
give the agent its own key and what it can do.

Add your courts for the forecast as described in
[court forecasts](WEATHER.md).

## 4. Invite your players

Sign in at `/coach` with the administrator key. On **Members**, press
**Sign-in link** for each player and send it to them, for example on WhatsApp.
A link works once, within 72 hours; once signed in, a player stays signed in on
that phone.

The list shows when each player signed in, with those who haven't at the top,
so you know who to nudge. Once the season is running, the dashboard, **Results**,
**Activity** and the **Chase list** show how it is going.

## 5. When you want them

- **Your own address**, such as `league.yourclub.org`: add it as a custom
  domain in the Worker's settings, then set `PUBLIC_URL` to it in
  `wrangler.jsonc`. Players sign in again on the new address.
- **Sign-in emails**, so players can request their own links: see
  [sign-in emails](EMAIL.md).

## 6. Delete the trial

In the Cloudflare dashboard, delete the trial's Worker and its D1 database. You
can also delete the trial's repository.

## Looking after it

- **Settings** live in your repository's `wrangler.jsonc`, since a deployment
  overwrites changes made only in the dashboard. Passwords and keys stay in the
  Worker's secrets. Keep the `DB` binding's `database_id` as it is.
- **Your own look:** your coding agent can change the site's pages on your
  computer, with the sample league, before you put them live. See
  [make the site your own](CUSTOMISE.md).
- **Updates:** your coding agent brings new DeuceLeague versions into your
  repository as a pull request, and you choose what to take. See
  [update your club](UPDATING.md) for the prompt to give it. Merging deploys,
  and database changes apply before the new Worker is published.
- **Your data:** D1's [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
  can restore the database to an earlier point; check how far back your plan
  allows.
- **A lost administrator key:** follow the [recovery guide](RECOVERY.md). It
  needs access to your Cloudflare account.
- **Usage:** your D1 database's **Metrics** tab shows rows read and written. In
  local tests a player's home page reads about 2,700 rows, and Cloudflare's free
  plan allows 5 million a day. The free plan's 10 ms CPU limit per request has
  not been measured on Cloudflare yet: after a few days of use, check the
  Worker's **Observability** tab before deciding whether to upgrade.

For how the deployment works under the hood, see the
[deployment reference](README.md).

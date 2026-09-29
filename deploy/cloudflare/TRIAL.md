# Try DeuceLeague on Cloudflare

This guide takes you from deployment to signing in and reporting a sample score.
It creates one website and a new database for a test club on **Cloudflare
Workers Free**. No email service is needed: players sign in with one-time links
that the coach makes on the coach's site and hands over, for example on
WhatsApp. Everything happens in your browser: you are the coach, and you send
the sample players' links to yourself.

Use the sample club for this trial. It does not move an existing club or
rehearse data backup/restore or administrator recovery for a live club; plan
those operational changes separately.

## 1. Get ready

You need:

- A Cloudflare account and a GitHub or GitLab account for the repository created
  during deployment.
- A password manager to save the installation secrets and administrator key.

Deployment and setup ask nothing about email. Once the club is running, the
coach can add sign-in emails if they want them; see
[sign-in emails](EMAIL.md).

Generate and save these two **different** secrets. On macOS, Linux or WSL,
run this command twice:

```sh
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

Run it twice. Use the first output as `SETUP_TOKEN`. Prefix the second output with `dl_` and
use that as `WEBSITE_API_KEY`. Copy the complete single-line values into your
password manager; do not commit them to the repository or put them in a URL.

| Name | What to generate | Used for |
| --- | --- | --- |
| `SETUP_TOKEN` | First `openssl` output | Opening the club installer |
| `WEBSITE_API_KEY` | Second output, prefixed with `dl_` | Connecting the website to the league API |

Choose a Worker name, such as `riverside-league-trial`. Your website address
will look like `https://riverside-league-trial.your-subdomain.workers.dev`, using
that name and your Cloudflare account's Workers subdomain.

## 2. Deploy the website

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/EMRahman/DeuceLeague/tree/main)

1. Select your account and create the repository. The button uses the whole
   repository from `main`; keep the repository root as the build location.
2. Choose your Worker name and a **new database** for this test club. You can
   rename the database, but keep its binding name **DB**. Do not select an
   existing live club database.
3. In the **API token** selector, choose **Create new token**. If prompted for
   a name, use **DeuceLeague build token**. Cloudflare may offer an existing
   token from another project; creating a separate one lets you manage this
   club's deployment access independently. Leave the other project's token intact.
4. Check the build token's permissions under **My Profile → API Tokens**.
   Keep the deployment permissions and ensure **Account → Workers Scripts → Edit**
   and **Account → D1 → Edit** are included for the account hosting this club.
   The deploy command applies database migrations, so it needs D1 write access;
   Cloudflare's documented default build-token permissions do not include D1.
5. Enter the settings below. Add the two credentials as **secrets**.
6. Keep **`npm run build`** as the build command, **`npm run deploy`** as the
   deploy command, and **Node 22** as the Node version.
7. Deploy and wait for the build to finish.

The Cloudflare build token authorizes deployment to your Cloudflare account.
It is separate from `SETUP_TOKEN` and `WEBSITE_API_KEY`; do not put it into
those fields. See [Cloudflare's build-token settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token)
and [D1 permission requirements](https://developers.cloudflare.com/d1/platform/release-notes/).

| Setting | Value |
| --- | --- |
| `PUBLIC_URL` | Your full `https://…workers.dev` address, with no path or query. If you do not know it yet, enter `https://setup.invalid` and follow the next section. |
| `SETUP_TOKEN` — secret | The first password you saved |
| `WEBSITE_API_KEY` — secret | The password starting with `dl_` |

Weather has no locations initially. Add them after setup through the coach API.

### Check the website address

Open `/healthz` at the assigned address, for example:

```text
https://riverside-league-trial.your-subdomain.workers.dev/healthz
```

You should see `{"status":"ok"}`.

If you used `https://setup.invalid`, or the assigned address differs from what
you entered, open **your new repository's `wrangler.jsonc`** in its web editor.
Set `PUBLIC_URL` under `vars` to the exact assigned HTTPS address and commit the
change. Wait for the connected build to finish before continuing. The temporary
address allows the health check to work but blocks the website and installer.

In Workers Builds, disable **builds for non-production branches** for this trial.

## 3. Create your test club

1. Open `/install` on your website and enter your saved `SETUP_TOKEN`.
2. **Save the administrator key** shown by the installer in your password
   manager. This is a new key, separate from the two passwords above.
3. Confirm you saved it, then enter the club name, identifier and time zone.
4. Select the **sample league** and create the club.

The sample is a small club in mid-season:

- 22 fictional players;
- singles in three divisions of five;
- doubles in two divisions of five pairs;
- 50 matches. Most are already played, two are disputed, three are waiting for the
  other side to agree, and the rest are still to play.

Two entries have opted out of next season, and two members have no entry yet, as
newcomers would. Alex and Bailey are in the same singles division, and their match
against each other is left unplayed for you.

## 4. Send yourself the players' sign-in links

As the coach, you make each player's sign-in link and send it to them. In this
trial you play both sample players, so you send the links to yourself: Sample
Alex in your normal browser window, and Sample Bailey in a private window, since
a browser holds one player's sign-in.

1. Open `/coach` on your website, paste the administrator key you saved at
   setup, and press **Sign in**. The coach's site makes its own key for this
   browser, lasting 90 days; it does not keep the administrator key.
2. Find **Sample Alex** and press **Sign-in link**. With a real player you would
   copy the link and send it on WhatsApp; here, open it in this window and press
   **Sign in**. Simply opening the link does not sign you in.
3. Go back to `/coach`, press **Sign-in link** for **Sample Bailey**, copy the
   link, and open it in a private window. Press **Sign in** there.

A sign-in link works once, within 72 hours, and is shown once. If one runs
out, make a new one the same way. The members list shows who has signed in:
Alex and Bailey should now say **Signed in**.

## 5. Report and agree a score

- As Sample Alex, check that you can see singles and doubles and the tables.
  Open the match against Sample Bailey and report a score. **The score stays
  pending until the opponent agrees.**
- In the private window, as Sample Bailey, agree Alex's score.
- Check, as either player, that the match shows as played and the singles table
  has changed.
- Reopen `/install`. It should show setup complete and the sample created,
  without adding duplicate players or matches.
- Redeploy from the same repository. Check that the club, player sessions,
  coach sign-in, administrator key and fixtures still work. Keep the same `database_id`,
  `WEBSITE_API_KEY` and other club secrets.
- Open the home page signed out. It should ask you to get a sign-in link from
  your coach, with no email form.

Keep a short record of the source commit, Worker/database names, migration
count, and whether setup, coach sign-in, player sign-in, score reporting and
redeployment worked. Leave credentials, private email addresses and sign-in
links out of anything you share.

## Optional weather

To show forecasts, use the administrator key you saved at setup to add one or
more named court locations and choose the display units:

```sh
curl -X POST "https://your-club.example/v1/court-locations" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  --data '{"name":"Main Courts","latitude":51.4343,"longitude":-0.2141}'

curl -X PATCH "https://your-club.example/v1/weather" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  --data '{"units":"uk"}'
```

Replace the example name and coordinates with your courts; repeat the first
request for each location (up to eight). Units can be `uk` (the default,
Celsius/mph), `metric`, or `us`. Deleting every location hides forecasts again.

Existing `WEATHER_VENUES` and `WEATHER_UNITS` variables are ignored after this
release. Re-enter their values through the API after the migration deploys.

## Settings, usage and recovery

- **Changing settings:** keep Worker configuration in your repository's
  `wrangler.jsonc`; deployments can overwrite dashboard-only changes. Club
  settings such as forecast locations and units are changed through the API and
  stay in D1. Keep credentials in Worker secrets. The generated `DB` binding
  must retain the database's actual `database_id`.
- **Checking usage:** open your D1 database's **Metrics** tab to view rows read
  and written. Also check Worker CPU usage and errors before deciding to upgrade.
  - In local tests, a signed-in player's home page on the sample reads about 2,700
    rows; Free allows 5 million a day.
  - Installing the sample writes about 3,300 rows, once; Free allows 100,000 a day.
  - Free's 10 ms CPU limit per request hasn't been measured on Cloudflare yet.
    After your walkthrough, open the Worker's **Observability** tab and note the
    CPU time of the home, table and match pages.
  SQL statement counts alone do not establish a need for Workers Paid. See
  [D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/)
  and the [local rehearsal notes](README.md).
- **Lost administrator key:** follow the [recovery guide](RECOVERY.md). Recovery
  requires access to your Cloudflare account; `SETUP_TOKEN` cannot reopen an
  initialized club. Record the recovery result if you rehearse it on this test club.
- **Closing the installer:** after checking setup, you can remove `SETUP_TOKEN`
  to disable installer and setup-status access.
- **Future schema changes:** rehearse them on a separate test deployment before
  applying them to an established club.

Local tests verify application behavior, but your trial still needs to confirm
Cloudflare provisioning and account limits, and delivery to your inbox if you
add email.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Weather is not visible | Add at least one court location through `POST /v1/court-locations` with an administrator key. |
| Deployment or migrations fail with an authentication/permission error | Check the selected Cloudflare build token is valid, targets the right account, and includes Workers Scripts: Edit and D1: Edit. After correcting its permissions or selecting a replacement in the Worker's Settings → Builds → API token, retry the build. |
| No provisioned D1 database ID | Find the new database in Cloudflare and check its ID matches the repository's `DB` binding. Do not create a second database just to retry. |
| Migration failure | The deployment stopped before publishing the Worker. Correct the reported cause before retrying. The failing migration rolls back; earlier successful migrations may already be recorded. |
| `/healthz` fails | Check migrations ran against the same database the Worker's `DB` binding uses. |
| `/install` returns 404 | Check `SETUP_TOKEN` exists and has at least 32 characters, unless you intentionally removed it after setup. |
| `/install` returns 403, or the site asks you to use another address | Set `PUBLIC_URL` to the exact assigned HTTPS address. Check for a renamed Worker or incorrect subdomain. |
| Installer needs configuration, or website says it is not ready | Check `PUBLIC_URL` and the `dl_` website secret. If you added `MAIL_PROVIDER`, check its sender and key too, or remove it to run without email. Then initialize through `/install`. |
| `/coach` does not accept the key | Paste the whole administrator key from setup, starting `dl_`. A revoked key, or one from another club, does not work. |
| `/coach` asks you to sign in again | Its key for this browser lasts 90 days, or it was revoked. Sign in again with the administrator key. |
| A sign-in link says it has been used or has expired | Links from `/coach` work once, within 72 hours; emailed ones within fifteen minutes. Make a new one. |
| Email problems | See [sign-in emails](EMAIL.md#troubleshooting). |

When reporting a problem, leave out credentials, working sign-in links and
provider diagnostics that could contain private details.

## Later: sign-in emails

The club runs without email. If the coach later wants players to request their
own sign-in link by email, follow the [sign-in emails guide](EMAIL.md). It can
be added at any time, and nothing in the club's data changes.

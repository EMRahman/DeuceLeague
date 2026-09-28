# Try DeuceLeague on Cloudflare

This guide takes you from deployment to signing in and reporting a sample score.
It creates one website and a new database for a test club, using **Cloudflare
Workers Free** and **Resend** for sign-in emails. You can do it in your browser;
no terminal, Docker or local database is needed.

Use the sample club for this trial. Moving an existing PostgreSQL club, rehearsing
backup/restore and switching a live club remain separate migration steps.

## 1. Get ready

You need:

- A Cloudflare account and a GitHub or GitLab account for the repository created
  during deployment.
- A Resend account and a sending API key.
- A password manager to save the installation secrets and administrator key.

For a first test, use `onboarding@resend.dev` as the sender and **your Resend
account email** as the player email. This test sender can only deliver to that
address. To email other players later, verify your own domain in Resend and
change the sender. See [Resend's test-sender restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Generate and save these two **different** passwords:

| Name | What to generate | Used for |
| --- | --- | --- |
| `SETUP_TOKEN` | 43 random letters and numbers | Opening the club installer |
| `WEBSITE_API_KEY` | Another 43 random letters and numbers, prefixed with `dl_` (46 characters total) | Connecting the website to the league API |

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
3. Enter the settings below. Add the three credentials as **secrets**.
4. Keep **`npm run build`** as the build command, **`npm run deploy`** as the
   deploy command, and **Node 22** as the Node version.
5. Deploy and wait for the build to finish.

| Setting | Value |
| --- | --- |
| `PUBLIC_URL` | Your full `https://…workers.dev` address, with no path or query. If you do not know it yet, enter `https://setup.invalid` and follow the next section. |
| `MAIL_PROVIDER` | `resend` |
| `MAIL_FROM` | `onboarding@resend.dev` for the first test, or your verified sender |
| `SETUP_TOKEN` — secret | The first password you saved |
| `WEBSITE_API_KEY` — secret | The password starting with `dl_` |
| `RESEND_API_KEY` — secret | Your Resend sending API key |

Weather is disabled initially. If an older template asks for `WEATHER_VENUES`
and rejects a blank value, enter a single semicolon (`;`) to leave it disabled.

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
4. Select the **sample league** and enter your Resend account email for
   **Sample Alex**. Create the club.

The sample includes four fictional players, singles and doubles divisions, and
seven matches. Creating the club does not send an email.

## 4. Sign in and try a match

- Open the home page and request a sign-in link using Sample Alex's email.
- Check your inbox, open the link and press **Sign in**. The link should use
  your website address; simply opening it does not sign you in.
- Check that you can see singles and doubles, open a match and report a score.
  **The score stays pending until the opponent agrees.** Sample opponents have
  no email addresses; further opponent or coach actions use the
  [API](../../docs/API.md) with the saved administrator key.
- Reopen `/install`. It should show setup complete and the sample created,
  without adding duplicate players or matches.
- Redeploy from the same repository. Check that the club, player session,
  administrator key and fixtures still work. Keep the same `database_id`,
  `WEBSITE_API_KEY` and other club secrets.

Keep a short record of the source commit, Worker/database names, migration
count, and whether setup, email delivery, score reporting and redeployment
worked. Leave credentials, private email addresses and sign-in links out of
anything you share.

## Optional weather

To show forecasts, add these settings **inside the existing `vars` object** in
your repository's `wrangler.jsonc`:

```jsonc
"WEATHER_VENUES": "Main Courts@51.4343,-0.2141;Park Courts@51.4059,-0.2229",
"WEATHER_UNITS": "uk"
```

Replace the example names and coordinates with your courts. Each venue uses
`Name@latitude,longitude`; separate venues with semicolons. Units can be `uk`
(the default, Celsius/mph), `metric`, or `us`.

Keep commas between the settings, then commit to deploy the change. Remove
`WEATHER_VENUES` to disable forecasts again.

## Settings, usage and recovery

- **Changing settings:** keep non-secret settings in your repository's
  `wrangler.jsonc`. Deployments can overwrite changes made only in the Cloudflare
  dashboard. Keep credentials in Worker secrets. The generated `DB` binding
  must retain the database's actual `database_id`.
- **Checking usage:** open your D1 database's **Metrics** tab to view rows read
  and written. Also check Worker CPU usage and errors before deciding to upgrade.
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
Cloudflare provisioning, account limits and delivery to your inbox.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Weather field will not accept a blank value | Enter `;` to disable weather in an older deploy template. |
| No provisioned D1 database ID | Find the new database in Cloudflare and check its ID matches the repository's `DB` binding. Do not create a second database just to retry. |
| Migration failure | The deployment stopped before publishing the Worker. Correct the reported cause before retrying. The failing migration rolls back; earlier successful migrations may already be recorded. |
| `/healthz` fails | Check migrations ran against the same database the Worker's `DB` binding uses. |
| `/install` returns 404 | Check `SETUP_TOKEN` exists and has at least 32 characters, unless you intentionally removed it after setup. |
| `/install` returns 403, or the site asks you to use another address | Set `PUBLIC_URL` to the exact assigned HTTPS address. Check for a renamed Worker or incorrect subdomain. |
| Installer needs configuration, or website says it is not ready | Check `PUBLIC_URL`, the `dl_` website secret, `MAIL_PROVIDER`, sender and Resend key. Then initialize through `/install`. |
| Email delivery error | Check the Resend key and sender. With `onboarding@resend.dev`, use your Resend account email. Wait one minute before retrying. |
| Resend accepted the email but nothing arrived | Check spam and Resend's delivery records. Acceptance does not guarantee inbox delivery. |

When reporting a problem, leave out credentials, working sign-in links and
provider diagnostics that could contain private details.

## Using native Cloudflare email instead

Resend is the route used above. Native Cloudflare Email Sending requires its
own sender onboarding and an `EMAIL` binding; a Cloudflare account alone does
not configure it. Check the current [requirements](https://developers.cloudflare.com/email-service/get-started/send-emails/)
and [pricing](https://developers.cloudflare.com/email-service/platform/pricing/).

To make a native-only deploy template, edit your own public fork before
clicking its deploy button: remove `RESEND_API_KEY` from `.dev.vars.example`,
set `MAIL_PROVIDER` to `cloudflare`, and add `"send_email": [{ "name": "EMAIL" }]`
to Wrangler configuration. Verify the sender and binding separately in your
account. See the [email configuration guide](README.md#email).

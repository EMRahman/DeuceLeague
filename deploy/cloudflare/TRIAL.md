# First Cloudflare account trial

This preview installs one Worker and one fresh D1 database for a single club.
Use fictional sample data for this first trial. PostgreSQL import, portable
backup/restore rehearsal and production cutover are separate remaining stages.

The button uses the whole repository, including the shared workspace packages:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/EMRahman/DeuceLeague/tree/cloudflare-preview)

The source is the **cloudflare-preview** branch, kept separate from `main`
for this trial. A successful local rehearsal does not verify the account-specific
provisioning or email steps.

## Before clicking

- Use your Cloudflare account with Workers Paid for this preview, and a GitHub
  or GitLab account for the repository Cloudflare creates.
- Prepare an email sender verified with Resend and a sending API key. Resend
  is the initial button template's email route; native Cloudflare email is
  described below. The backend and website still run on Cloudflare.
- In your password manager, generate and save **two independent random
  43-character alphanumeric strings**. The first is `SETUP_TOKEN`. Prefix the
  second with `dl_` to make `WEBSITE_API_KEY` (46 characters total). The optional
  developer helper `npm run cf:secrets` generates equivalent strong values.
- Choose a unique Worker name, for example `riverside-league-trial`. Find your
  account's `workers.dev` subdomain in the Cloudflare dashboard. Together these
  determine the website address, such as
  `https://riverside-league-trial.your-subdomain.workers.dev`.

The initial installation needs no local PostgreSQL, Docker or terminal.
Cloudflare account ownership alone does not configure email delivery.

## Choosing email

Both routes send player sign-in links from the website. Changing providers
does not require moving the league database. Neither route supplies a personal
inbox: Cloudflare's free [Email Routing](https://www.cloudflare.com/products/email-routing/)
forwards incoming mail to an existing inbox.

| Route | Setup and implications |
| --- | --- |
| Native Cloudflare Email Sending | Requires a domain using Cloudflare DNS, sender onboarding, Workers Paid and an `EMAIL` binding. Keeps hosting and delivery in one account; currently beta. Includes 3,000 outbound emails/account/month, then $0.35 per 1,000. |
| Resend | Requires a separate Resend account, verified sender domain and API key. Works with the template's existing secret prompts. Free tier includes 3,000 emails/month, capped at 100/day. |

Prices checked 27 September 2026: [Cloudflare email](https://developers.cloudflare.com/email-service/platform/pricing/),
[Cloudflare domain setup](https://developers.cloudflare.com/email-service/get-started/send-emails/),
and [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits).
Workers Paid has a [$5 monthly subscription](https://developers.cloudflare.com/workers/platform/pricing/)
before usage charges; it is already the target plan for this preview.

For a club of this size, 3,000 monthly sign-in messages is likely ample, but
Resend's 100/day cap could affect a launch when many members request access on
the same day. Native sending is a reasonable first choice if the owner already
has Workers Paid and a domain on Cloudflare. Otherwise Resend is the simpler
deployment-template route. The owner's choice remains open; the template's
Resend default is provisional. Account onboarding and inbox delivery must be
checked whichever route is chosen.

## Deploy

1. Click the button, select your account and create the repository. Use the
   repository root; selecting only `deploy/cloudflare` would omit dependencies.
2. Choose the Worker name and a new database for this trial. You may rename the
   database; retain the binding name **DB**. Never select a live club database
   for the first acceptance test.
3. Complete the variable prompts:

   | Variable | Value |
   | --- | --- |
   | `PUBLIC_URL` | The exact HTTPS origin above, without a path or query |
   | `MAIL_PROVIDER` | `resend` |
   | `MAIL_FROM` | Your verified sender address, optionally `League <address>` |
   | `WEATHER_VENUES` | Empty for this trial |
   | `WEATHER_UNITS` | `uk`, `metric` or `us` |

4. Enter the three secret values: `SETUP_TOKEN`, `WEBSITE_API_KEY` and
   `RESEND_API_KEY`. No PostgreSQL passwords or connection URLs are required.
5. Retain the detected build command **`npm run build`** and deploy command
   **`npm run deploy`**, and use Node **22** (`.node-version`). The deploy command
   compiles, applies D1 migrations through `DB --remote`, then publishes the
   Worker. A failed migration prevents that deployment. Cloudflare provisions
   D1 before running the template's deployment commands.
6. Check the build result and open `/healthz` at the assigned URL; it should
   return `{"status":"ok"}`. The generated repository must retain the real D1
   `database_id` in its `DB` binding. Record the repository, Worker and database
   IDs privately for future maintenance.

If you could not determine the URL beforehand, an empty `PUBLIC_URL` leaves
the website closed while `/healthz` still works. After deployment, edit
`vars.PUBLIC_URL` in your cloned repository's `wrangler.jsonc` using GitHub's
web editor and commit the exact assigned origin. The connected build deploys
that configuration. Configure missing sender settings there in the same way.
Never derive this address from an incoming request or proxy headers.

Keep non-secret settings in your cloned repository's Wrangler configuration;
later deployments can overwrite dashboard-only variable changes. Keep secret
values in Worker secrets. Disable **builds for non-production branches** in
Workers Builds for this trial. A separate test deployment is required before
trying schema updates against an established club database.

## Create the club and test the player journey

1. Open `/install` on the configured website address. Enter the saved
   installation secret. It must not appear in the URL.
2. Save the administrator key shown by the installer in your password manager.
   Confirm it is saved, then enter the club name, identifier and time zone.
3. Select the sample league and enter **your own** email for Sample Alex.
   Creating the club adds four fictional players, singles/doubles divisions
   and seven matches. Setup sends no email.
4. Open the home page and request a sign-in link using your email. Confirm it
   reaches your inbox and uses the configured HTTPS origin. Open it and press
   **Sign in**. Opening the email link alone must not consume it.
5. Check that Sample Alex can see singles and doubles, open a match and report
   a score. An unanswered report must stay pending. Use the saved admin key and
   the API for opponent/coach actions when extending the trial; sample opponents
   deliberately have no email addresses.
6. Reopen `/install` and confirm it reports setup complete and sample created.
   Retrying initialization must not add another club or duplicate matches.
7. Trigger a redeploy from the same repository. Confirm the same club, saved
   key, player session and fixtures still work. Migrations should have nothing
   left to apply. Do not change `database_id`, `WEBSITE_API_KEY` or club secrets
   just to redeploy.

The [owner recovery procedure](RECOVERY.md) is available if admin credentials
are lost. Its remote use still needs an acceptance rehearsal on this disposable
deployment. It requires your Cloudflare account access, not `SETUP_TOKEN`.
You can remove `SETUP_TOKEN` after setup to disable installer/status access.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No provisioned D1 database ID | Check the button-created repository's DB binding and the account's new D1 database. Insert the correct generated ID there; do not run a blind second creation. |
| Migration failure | The new Worker was not deployed. Inspect the failed migration and retry only after correcting the cause. A failing migration rolls back, but earlier successful migrations may already be recorded. |
| `/healthz` fails | Confirm migrations ran against the same DB binding the Worker uses. |
| `/install` is 404 | Set a saved `SETUP_TOKEN` of at least 32 characters, unless intentionally disabled after setup. |
| `/install` is 403 | Use the exact `PUBLIC_URL` origin; check for a renamed Worker or incorrect account subdomain. |
| Installer says configuration needs attention | Check the website secret format, sender and explicit mail provider. |
| Website says it is not ready | Confirm `PUBLIC_URL`, website secret and provider settings; initialize through `/install`. |
| Email delivery error | Check the provider key and verified sender; wait one minute before retrying. Do not paste provider diagnostics, login links or credentials into an issue. |
| Provider accepted email but no inbox message | Check spam and provider delivery records. Provider acceptance is not inbox delivery. |

## Native Cloudflare email

The shipped button template prompts for Resend. For a native-only template,
edit your own public fork before deploying: remove `RESEND_API_KEY` from
`.dev.vars.example`, set `MAIL_PROVIDER` to `cloudflare`, and add
`"send_email": [{ "name": "EMAIL" }]` to Wrangler configuration. Complete
Cloudflare Email Sending onboarding for your sender domain. The deploy button's
documented automatic-resource list does not include email setup, so verify that
binding and sender separately in your account. Do not put a real credential
into the example file. See the [email configuration guide](README.md#email).

## Record the trial

Record the source commit, renamed Worker/database names, migration count,
setup result, inbox result, score-report result, redeploy result and recovery
result. Keep credentials, private email addresses and login URLs out of this
record. The maintainer will use those results to distinguish verified account
behavior from the local rehearsal.

The template follows Cloudflare's [deploy-button documentation](https://developers.cloudflare.com/workers/platform/deploy-buttons/),
including secret prompts, binding-name migrations and root-repository handling.
See also [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
and [build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).

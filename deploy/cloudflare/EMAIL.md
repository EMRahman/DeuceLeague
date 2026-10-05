# Sign-in emails

A club runs without email. Deployment and setup never ask for it: players sign
in with one-time links that the coach makes on `/coach` (or with
`POST /v1/members/{id}/login-link`) and hands over, for example on WhatsApp. A
link opens `/login?token=…`, works once and lasts 72 hours. A coach's emailed
invitation lasts seven days; a link a player asks for by email lasts fifteen
minutes.

If the coach later wants players to request their own sign-in link by email,
they can add a provider at any time. Nothing in the club's data changes:
players already signed in stay signed in, and coach-made links keep working
alongside email.

## Coach invitations

On **Members**, the coach can **Email sign-in link**, select up to five members per batch, or **Approve and email sign-in link** for a join request. Links work once, for seven days. The page records the latest provider acceptance or failed attempt, and separately shows who has signed in. Acceptance does not confirm inbox delivery. Failed sends can be retried after checking contacts and the provider; approval is never undone by a mail failure.

Existing members without either contact are listed under **Contact details to complete**. Complete their email and telephone using **Save contacts**. They remain members while you collect these details. New sign-ups require both. Without a provider, the page explains how to enable email and still offers manual links.

## Settings

None of these are in the deployment template. Add the variables under `vars`
in your repository's `wrangler.jsonc`, since deployments can overwrite
dashboard-only changes, and add secrets in the Worker's settings.

| Name | Purpose |
| --- | --- |
| `MAIL_PROVIDER` | `resend` or `cloudflare`. Absent or empty means no email. |
| `MAIL_FROM` | Sender address, optionally with a display name, such as `League <league@your-club.org>`. Must be accepted by the selected provider. |
| `RESEND_API_KEY` | Secret, required only with `MAIL_PROVIDER=resend`. |
| `EMAIL` | Cloudflare send-email binding, required only with `MAIL_PROVIDER=cloudflare`. |

There is no logging mailer or automatic provider fallback. A named provider
that is incomplete keeps the website offline, with a generic 503 to visitors,
rather than silently dropping email. Remove `MAIL_PROVIDER` to run without
email again.

## Turning it on with Resend

1. In your repository's `wrangler.jsonc`, add `MAIL_PROVIDER` set to `resend`
   and `MAIL_FROM` set to your sender under `vars`, and commit:

   ```jsonc
   "vars": {
     "PUBLIC_URL": "https://riverside-league-trial.your-subdomain.workers.dev",
     "MAIL_PROVIDER": "resend",
     "MAIL_FROM": "League <league@your-club.org>"
   }
   ```

2. Add `RESEND_API_KEY` as a **secret** in the Worker's settings.
3. Give each member who wants email sign-in an email address, using the
   administrator key. Members without one carry on with links from the coach.

For a first test, use `onboarding@resend.dev` as the sender. This test sender
only delivers to your Resend account's own email, so only one member can receive
links; to email others, verify your own domain in Resend and change the sender.
See [Resend's test-sender restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

The adapter calls
[`POST https://api.resend.com/emails`](https://resend.com/docs/api-reference/emails/send-email)
with a ten-second timeout and refuses redirects. It sends plain text only.

## Turning it on with Cloudflare Email Sending

Native Cloudflare Email Sending requires its own sender onboarding; having a
Cloudflare account alone does not complete it. Check the current
[sending setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
and [pricing](https://developers.cloudflare.com/email-service/platform/pricing/).

Add `MAIL_PROVIDER` set to `cloudflare` and `MAIL_FROM` under `vars`, and this
binding to `wrangler.jsonc`:

```json
"send_email": [{ "name": "EMAIL" }]
```

Then give members email addresses as in step 3 above. The adapter uses
Cloudflare's structured `send({from,to,subject,text})` method; see the
[Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).

## Delivery and failures

Both adapters await the provider acknowledgement before reporting success.
Provider acceptance is not proof of inbox delivery; check that separately with
your account. A failure shows an email-delivery error, keeps the one-minute
cooldown, and is not retried automatically. No provider error body, working
login link, email address or credential is logged by these adapters.

Each address can request one link a minute. `0007_website_login_cooldown.sql`
holds these reservations, keyed by an HMAC of the normalized email with the
website service key; the key itself is not stored there. Reservations happen
before member lookup, including unknown addresses, and survive isolate reloads.
A guarded D1 batch prunes expired rows and inserts the reservation; email
delivery is outside mutation retries. Rotating the website key changes the
hashes and resets effective cooldowns. This is a recipient resend control, not
a complete abuse-protection system.

## Sample players

When email is already configured at installation, the installer also offers two
optional, different email addresses for Sample Alex and Sample Bailey. Setup
sends nothing: open the home page afterwards and request normal sign-in links.
The addresses stay in the private member records and never enter audit payloads
or setup status. If you add email after installation, give them addresses
through the API like any other member.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Website says it is not ready after adding email | Check `MAIL_FROM` and the provider's key or binding, or remove `MAIL_PROVIDER` to run without email. |
| Email delivery error | Check the Resend key and sender. With `onboarding@resend.dev`, use your Resend account email. Wait one minute before retrying. |
| Resend accepted the email but nothing arrived | Check spam and Resend's delivery records. Acceptance does not guarantee inbox delivery. |

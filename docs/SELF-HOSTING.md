# Running DeuceLeague for your club

This guide takes a club from nothing to a league its players can sign in to
from their phones: the database, the API and the reference website, on a
server of the club's own, over HTTPS, backed up every night.

It is written for a coach and their coding agent working together. The agent
can run every command here; the coach makes the few decisions that are theirs
— the address, the email service, who holds the keys — and keeps the keys.
Plan on an hour, most of it waiting for DNS.

## What you end up with

```
                 https://league.your-club.org
                             │
                          Caddy          HTTPS certificates, renewed by itself
                   ┌─────────┴──────────┐
     /v1/*, /openapi.json          everything else
                   │                    │
                  API ◄──────────── website        sign-in links, scores, tables
                   │                    │
                Postgres            your email service (SMTP)
                   │
             ./backups             a dump every night, fourteen days kept
```

Five containers from one `docker-compose.yml`, on one small server. Nothing is
reachable from the internet except Caddy, on ports 80 and 443.

## Before you start

- **A server.** Any Linux VPS with 2 GB of memory will do. This guide is
  written against Hetzner Cloud's smallest shared-CPU server running Ubuntu
  24.04, at around €5 a month, and the steps are the same anywhere you can SSH
  in as root.
- **An address.** A domain or subdomain the club controls, such as
  `league.your-club.org`, where you can add a DNS record.
- **An email service.** Players sign in with a link sent by email, so the
  website needs somewhere to send it from: Postmark, Amazon SES, Mailgun, your
  club's own mail host, or a Gmail account with an app password. Anything that
  speaks SMTP.

## 1. The server

Create the server with your SSH key, and while you are in the provider's
console:

- **Turn on its backups** (Hetzner: *Backups*, 20% of the server price). They
  cover the whole disk, including the nightly dumps in step 6.
- **Add a firewall** allowing only ports 22, 80 and 443 in. Use the
  provider's firewall rather than `ufw` on the server: Docker writes its own
  rules and would get round `ufw`. The Compose files also publish nothing but
  Caddy, so the database is never exposed either way.

Then point the address at it: an `A` record for `league.your-club.org` with the
server's IPv4 address, and an `AAAA` record with its IPv6 one. Check it has
taken with `dig +short league.your-club.org`.

## 2. Docker and the code

On the server, as root:

```bash
curl -fsSL https://get.docker.com | sh
git clone <the DeuceLeague repository> /srv/deuceleague
cd /srv/deuceleague
```

## 3. Configuration

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env`. Passwords go inside connection URLs, so make them letters and
digits only — `openssl rand -hex 24` makes a good one:

```bash
POSTGRES_PASSWORD=<openssl rand -hex 24>
APP_DB_PASSWORD=<another one>

COMPOSE_FILE=docker-compose.yml:deploy/compose.production.yml
DOMAIN=league.your-club.org
PUBLIC_URL=https://league.your-club.org
```

`COMPOSE_FILE` adds `deploy/compose.production.yml` to every `docker compose`
command: it adds Caddy and the backups and closes every other port. Leave
`WEBSITE_API_KEY` and the email settings empty for now.

`POSTGRES_PASSWORD` is for the role that owns the tables; `APP_DB_PASSWORD` is
for `deuceleague_app`, the role the API connects as so that row-level security
applies to it. Each start sets `deuceleague_app`'s password from `.env`, so
changing it later is an edit and a restart.

## 4. Start it

```bash
docker compose up -d --build
```

The first build takes a few minutes. Each start runs the migrations before the
API, and the API waits for them to succeed. Check it is up:

```bash
docker compose ps
curl https://league.your-club.org/healthz        # {"status":"ok"}
```

If the address does not answer over HTTPS, Caddy could not get a certificate
yet — almost always DNS that has not reached the server. `docker compose logs
caddy` says so; it keeps retrying on its own.

## 5. The club and its keys

Create the club. It prints the first admin key, once:

```bash
docker compose run --rm api node packages/api/dist/cli/club-create.js \
  --slug your-club --name "Your Tennis Club" --timezone Europe/London
```

The admin key carries every scope. **The coach keeps it**, in a password
manager, and it goes nowhere else. The key it prints to check with names
`localhost:3000`; on the server it is `https://league.your-club.org`:

```bash
curl -H "Authorization: Bearer dl_…" https://league.your-club.org/v1/me
```

Everything from here on — seasons, members, competitions — goes through the
API. A coding agent does this best from the spec at
`https://league.your-club.org/openapi.json`, with a key of its own made for the
job rather than the admin key. [API.md § Scopes](API.md#scopes) lists what
each scope allows.

## 6. The website

The website finds a player by email and sends them a sign-in link, so it
needs a key that can do exactly that — read members, including their email
addresses, and make login links. Make it with the admin key:

```bash
curl -X POST https://league.your-club.org/v1/api-keys \
  -H "Authorization: Bearer <admin key>" -H "content-type: application/json" \
  -d '{"name": "Website", "scopes": ["members:read", "members:write", "members:pii"]}'
```

Put the `key` it returns in `.env`, with your email service's SMTP details:

```bash
WEBSITE_API_KEY=dl_…
SMTP_URL=smtp://<user>:<password>@<host>:587
MAIL_FROM="Your Tennis Club <league@your-club.org>"
```

Some shapes of `SMTP_URL`, with anything unusual in a user name or password
percent-encoded (`@` is `%40`):

| Service | SMTP_URL |
|---|---|
| Postmark | `smtp://<server token>:<server token>@smtp.postmarkapp.com:587` |
| Amazon SES | `smtp://<SMTP user>:<SMTP password>@email-smtp.<region>.amazonaws.com:587` |
| Gmail (app password) | `smtps://you%40gmail.com:<app password>@smtp.gmail.com:465` |

Optionally, give the home page a 14-day weather outlook at the courts — rain
chance and wind, to help players pick a day — by naming where the club plays
(right-click the courts in a map app to copy the coordinates). Several venues
get a pill each to switch between them:

```bash
WEATHER_VENUES="Centre Courts@51.4343,-0.2141;Park Courts@51.4059,-0.2229"
# °C and mph; or metric (°C, km/h), or us (°F, mph)
WEATHER_UNITS=uk
```

It comes from Open-Meteo, which is free for non-commercial use and needs no
account; the website asks for it with the coordinates alone.

Your email service will ask you to add SPF and DKIM records for the sending
domain. Add them: without them sign-in links land in spam.

```bash
docker compose up -d
```

Then add at least one member with an email address — yours — and sign in at
`https://league.your-club.org` from your phone. A player signs in once per
phone and stays signed in; the website asks for nothing else.

That key is the most powerful thing on the server after the admin key: it can
read every member's personal details. It lives only in `.env`, which is why
that file is `chmod 600`. If you think it has leaked, revoke it
(`POST /v1/api-keys/{id}/revoke`), make another and restart. The event feed
records every login link made and which key made it, so it also tells you
which players to sign out.

## 7. Backups

The `backup` service writes a dump of the database to `/srv/deuceleague/backups`
when it starts and every 24 hours after, and keeps fourteen days of them
(`BACKUP_KEEP_DAYS` changes that). With the provider's backups on, those dumps
are copied off the server too.

A second copy somewhere you control costs one line on the coach's own
computer, run now and then or from its scheduler:

```bash
rsync -a root@league.your-club.org:/srv/deuceleague/backups/ ~/deuceleague-backups/
```

To restore a dump, onto this server or a new one set up as above:

```bash
docker compose stop api website
docker compose exec -T postgres pg_restore -U deuceleague -d deuceleague --clean --if-exists \
  < backups/deuceleague-20260922-030000.dump
docker compose up -d
```

A backup that has never been restored is a hope. Restore one onto a spare
server, or onto your own computer (see below), once a season.

## Upgrading

```bash
cd /srv/deuceleague
docker compose exec -T postgres pg_dump -U deuceleague -Fc deuceleague > backups/before-upgrade.dump
git pull
docker compose up -d --build
```

The migrations run by themselves before the new API starts. If one fails, the
API does not start and the old data is untouched: `docker compose logs migrate`
says why.

## When something is wrong

| What you see | Where to look |
|---|---|
| The address does not load | `docker compose ps`, then `docker compose logs caddy` |
| "This league website is not set up yet" | `WEBSITE_API_KEY` is empty or wrong in `.env`; restart after fixing it |
| A player gets no email | `docker compose logs website`; then the email service's own activity log; then spam |
| An API error | Every response carries `X-Request-Id`; `docker compose logs api` has the same id |
| The API will not start | `docker compose logs migrate api`: it refuses to run as a role that would switch row-level security off, and says so |

## Trying it on your own computer

Everything above works locally too, without a domain or email. With Docker
running:

```bash
cp .env.example .env
docker compose up -d --build
docker compose run --rm api node packages/api/dist/cli/club-create.js --slug test --name "Test Club"
```

The API is at `http://localhost:3000`, the website at `http://localhost:8080`.
Make the website's key as in step 6, against `http://localhost:3000`, put it
in `.env` and run `docker compose up -d`. With no `SMTP_URL`, sign-in links
are written to `docker compose logs website` instead of being sent.

`npm run demo:seed` fills an empty database with two fake clubs to look at;
inside Docker it is `docker compose run --rm api node packages/api/dist/cli/demo-seed.js`.

## The demo instance

The public demo is this same setup on its own server, holding fake clubs only
and rebuilt every night. It runs without a website key, so its address shows a
page pointing at the API.

In its `.env`, as well as step 3, set `DEMO_KEY_SEED` to a long random string
and keep it: it makes the read-only keys come out the same every night, so the
ones published in the README keep working. Then schedule the rebuild:

```bash
crontab -e
15 3 * * *  /srv/deuceleague/deploy/demo-reset.sh >> /var/log/deuceleague-demo.log 2>&1
```

Run it once by hand first: it prints each club's read-only key, to publish.
The keys can only read, and only fake clubs; a shared key that could write
would be vandalised. **Never run `demo-reset.sh` on a real club's server** —
it deletes the database.

# Recovering administrator access

Use this procedure when no saved administrator credential remains. If another
administrator can still sign in to the API, have them create a replacement
through `POST /v1/api-keys` instead.

Recovery requires control of the Cloudflare account and its D1 database. It
runs from your computer, outside the league website, using Wrangler's account
authentication. `SETUP_TOKEN`, player sessions and website keys cannot perform
it. There is no public recovery endpoint, and initialization stays closed.
This is an offline account-owner procedure; remote database access still
requires an internet connection.

The command adds one full administrator key and two audit events atomically.
It does not change members, competitions, scores, website credentials or
existing keys. Database errors roll back the whole change. Keep the saved
recovery file until you have verified access: it identifies the same operation
if a connection fails after the database commits.

## Account-owner commands

These commands change a remote database only at **apply**. Run them yourself
against the intended installation. The implementation has been rehearsed
locally; remote authentication and recovery remain an account acceptance check.

1. Use the matching project checkout, run `npm ci`, and authenticate with
   `npx wrangler login`. In the Cloudflare dashboard, find the account ID and
   the database ID bound as `DB` to this club's Worker. Review the target and
   retain your normal backup or recovery point before repairing access.
2. Inspect the target. Replace the placeholders with those actual IDs:

   ```sh
   npm run cf:recover-admin -- inspect --remote --account-id ACCOUNT_ID --database-id DATABASE_ID
   ```

   The result includes the club UUID, slug and name, plus the mutation revision.
   Verify these identify the intended club. A missing or incompatible database
   is an error; the tool does not create or migrate one.
3. Prepare a new recovery file in a private directory. For example, the ignored
   `.recovery` directory in your checkout:

   ```sh
   mkdir -p .recovery
   npm run cf:recover-admin -- prepare --club-id CLUB_UUID --key-file .recovery/admin.json
   ```

   This step contacts no account. It exclusively creates a file with Unix mode
   `0600` and refuses to overwrite it. Open it privately and save its `key`
   value in your password manager **before applying**. The command does not
   print the credential. Never commit or share the file. On Windows, protect
   its access with your user account's file permissions.
4. Apply using the same target, the inspected club UUID and its exact slug:

   ```sh
   npm run cf:recover-admin -- apply --remote --account-id ACCOUNT_ID --database-id DATABASE_ID --club-id CLUB_UUID --confirm-slug CLUB_SLUG --key-file .recovery/admin.json
   ```

   The file must belong to that club. The result is `created`, or
   `already_applied` if this exact recovery already succeeded. Only a hash and
   prefix reach D1; plaintext stays in your saved file/password manager.
5. Use the saved key as a Bearer credential for `GET /v1/me` on the club's
   normal API. Check the club and administrator scopes, then use
   `GET /v1/api-keys` to review old credentials. Revoke lost or suspect keys via
   `POST /v1/api-keys/{id}/revoke` after confirming the new one works. Normal
   last-administrator protection still applies. Retain the credential securely;
   remove the local plaintext copy when your password-manager copy is verified.

If **apply** loses its response, keep the file and repeat the identical command.
Do not generate a different credential merely because the result is uncertain.
The same operation produces no duplicate key or audit events. A previously
recovered key that has since been revoked or expired is refused; prepare a new
file to perform a new recovery. Different files deliberately represent separate
recovery operations, so coordinate with other account administrators.

Changing `SETUP_TOKEN` never reopens initialization. Removing it after setup
does not prevent this account-owner procedure.

## Local rehearsal

Use explicit local options against your disposable development database:

```sh
npm run cf:recover-admin -- inspect --local --persist-to .wrangler/state/v3 --database-id DB
```

The `--database-id` must match the local D1 persistence ID used by Wrangler:
with the unbound root development config it is the binding name `DB`;
if the config has a `preview_database_id` or `database_id`, use the preview ID
first, otherwise the database ID. `--persist-to` is the
full state directory, including `v3`, rather than Wrangler CLI's parent path.
Use the same options for **apply**, with the inspected club ID and slug.
Never combine local and remote flags. Remote mode requires explicit account
and database IDs and accepts no local persistence path.

The automated recovery test creates a temporary database, applies all migrations,
initializes a club, then runs inspect/prepare/apply/replay through the same
Wrangler proxy used by the command. It needs no Cloudflare login or account.

## Implementation and sources

The command creates an isolated temporary Wrangler configuration with only the
selected D1 binding; it does not load deployment `.env` or `.dev.vars` files.
It uses [`getPlatformProxy`](https://developers.cloudflare.com/workers/wrangler/api/)
and an explicit [remote binding](https://developers.cloudflare.com/workers/local-development/)
for account access. Local mode disables remote bindings.

The recovery module is exposed through a separate `@deuceleague/db-d1/recovery`
entry point and is not imported into the application Worker. SQL uses bound
parameters and the same revision-guarded D1 batch as application writes. Recovery
audits contain scopes and the recovery method, without credential values. Only
definitive stale-revision failures retry automatically; other failures require
checking with the same saved operation.

# Migration checkpoint: account-owner administrator recovery

27 September 2026. This batch adds and locally rehearses administrator recovery
outside the application website. Nothing was deployed remotely, no Cloudflare
account was accessed and no external email was sent. The deploy button is
still pending.

## Completed

`npm run cf:recover-admin` has three explicit operations:

- `inspect`: identify the selected database's club and revision without writes.
- `prepare`: save a new credential and operation ID in an exclusive private
  file, bound to the expected club UUID. No account connection or secret output.
- `apply`: confirm the club UUID and slug, then add one full administrator key
  with its creation and recovery audits in one revision-guarded D1 batch.

The owner saves the new credential before applying. Repeating the same file
after interruption confirms the original result without duplicate credentials
or audits. A revoked or expired recovery key cannot be resurrected. A key-ID
or hash collision with another credential fails without modifying it. Recovery
leaves existing keys and league data intact; the owner can review/revoke lost
credentials through the normal API after verifying the replacement.

Remote mode requires explicit account/database IDs and Wrangler account
authentication. Local mode requires an explicit persistence path and database
ID. An isolated temporary Wrangler config contains only the selected binding;
the command does not load the application's environment files. Only hashes and
prefixes reach D1. Generic command failures suppress provider/parser details.

The recovery module has a separate package entry point. It is not imported by
the application Worker and adds no public HTTP route or setup-secret powers.
No database migration or PostgreSQL implementation change is needed.

## Validation

Seven focused tests pass, covering recovered API access, preserved website
permissions and member data, concurrent/repeated recovery, revoked-key replay,
wrong-club/credential collision refusal, late-audit rollback, stale writers,
ambiguous commit responses, private key files and the complete local CLI flow.
The CLI rehearsal uses persistent Wrangler D1 through `getPlatformProxy`.

`npm run cf:test`: **162 checks passed** (18 foundation, 144 runtime),
including all seven recovery tests. Typecheck, SQL-binding and whitespace
checks pass, and Wrangler's dry-run build succeeds. The recovery CLI npm entry
point also passes its help smoke check. No schema migration is needed.

PostgreSQL code was unchanged in this batch; its previous Stage 3B2 validation
remains 75 API tests and 11 website tests passed.

Logs: `/private/tmp/deuceleague-recovery-stage3b3.log` and
`/private/tmp/deuceleague-cloudflare-stage3b3.log`.

## Next batch

Prepare deploy-button provisioning, migration execution during installation,
configuration prompts and account-trial instructions. The owner can then test
initial setup, sample sign-in, actual email delivery and account-authorized
recovery on a disposable deployment. Remote recovery remains an explicit
acceptance check; the local rehearsal does not verify account permissions.

Offline data transfer, backup/restore rehearsal and release/cutover checks
remain required before the full migration is declared ready.

See the [owner recovery procedure](../../deploy/cloudflare/RECOVERY.md),
[configuration guide](../../deploy/cloudflare/README.md),
[migration plan](../CLOUDFLARE-MIGRATION.md) and
[previous checkpoint](STAGE-3B2.md).

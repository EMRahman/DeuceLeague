# Update your club

New versions of DeuceLeague don't reach your club by themselves. Your
repository is a copy the deploy button made, not a fork, so GitHub has no
"Sync fork" button for it. Your coding agent brings the changes in instead. You
choose what to take, and nothing goes live until you merge.

## For the coach

Give your coding agent, such as Claude Code, Codex or Pi Agent, this prompt,
with your repository's address:

> Update my DeuceLeague club's repository, https://github.com/YOU/YOUR-REPO,
> with the latest from DeuceLeague. Follow
> https://github.com/EMRahman/DeuceLeague/blob/main/deploy/cloudflare/UPDATING.md.
> Before changing anything, tell me in plain words what's new and let me choose
> what to take. Open a pull request for me to merge; don't push to main.

The agent will:

1. Tell you what has changed since your last update: new pages, fixes, and any
   database changes.
2. Ask which you want. Taking everything is the safe choice, because later
   changes often build on earlier ones. If you leave something out, the agent
   says what else depends on it, and asks again at your next update. Database
   changes are always taken, since later versions rely on them.
3. Open a pull request that keeps your own settings and changes, and describe
   what it takes and what it leaves out.

Read the pull request, then **Merge** it on GitHub. Merging deploys it: any
database changes apply first, then the new version goes live, usually within a
few minutes. Check the site afterwards.

**Preview builds.** Cloudflare may try to build a preview of the pull request
and fail with "missing a `previews` block". That doesn't affect merging or the
deploy. To stop it, open your Worker in the Cloudflare dashboard, go to
**Settings → Build → Branch control**, and untick **Enable Preview Builds**.

## For the coding agent

The club's repository started as a copy of DeuceLeague with no shared history:
usually a single "source repo import" commit. `git merge upstream/main` refuses
unrelated histories, and `--allow-unrelated-histories` conflicts on every file
the club changed. Merge three ways from the DeuceLeague commit the club last
took, on a branch, and open a pull request. Never push to `main`: a push to
`main` deploys.

### 1. Find where the club last took DeuceLeague

```sh
git remote add upstream https://github.com/EMRahman/DeuceLeague.git
git fetch upstream main
```

The base is the DeuceLeague commit the club's code last matched:

- The newest commit with a `DeuceLeague-Upstream: <sha>` trailer names it.
  Earlier updates may name it only in the title, "Update DeuceLeague to
  `<sha>`".
- With neither, it's the commit the copy was made from: the upstream commit
  whose files differ least from the repository's first commit
  (`git rev-list --max-parents=0 HEAD`). The deploy button changes only
  `package.json` and `wrangler.jsonc`, so the true source usually differs in
  just those two. On a tie, take the **older** commit: an older base can only
  bring in a change the club already has, which merges cleanly or shows as a
  conflict, while a newer one would silently skip a change.

The same commit's `DeuceLeague-Declined:` trailers, if any, list changes the
coach left out before. Tell the coach which commit you found and why.

### 2. Tell the coach what's new, and agree what to take

First, offer again each change a `DeuceLeague-Declined:` trailer names: "Last
time you left out X. Take it now?"

Then read `git log --no-merges base..upstream/main` and the diff. Describe it in
plain words: what players and the coach will notice, fixes, and any new files
under `packages/db-d1/migrations`, which change the database on deploy. Say
when a change depends on an earlier one. Recommend taking everything unless the
coach has a reason not to.

Migrations are always taken: they are additive, and later versions rely on
them. If the coach doesn't want the feature that came with one, take the
migration and leave out the code or page that uses it.

### 3. Merge on a branch

Apply DeuceLeague's changes since the base to the club's code, three ways:

```sh
git switch -c update-deuceleague
git diff --binary "$base" upstream/main | git apply --3way
```

Files that merge cleanly are staged. Where the club changed the same lines as
DeuceLeague, the file is left with conflict markers: resolve those with the
coach, then `git add` them. The commit that follows has the club's branch as its
only parent, so DeuceLeague's own history isn't pushed.

If the coach leaves changes out, revert just those files or hunks on the
branch. If they take one they left out before, apply that upstream commit too,
with `git show --binary <sha> | git apply --3way`, or take the current
DeuceLeague version of the parts it changed.

Always keep:

- `wrangler.jsonc`: the club's Worker `name`, `PUBLIC_URL`, the `DB` binding's
  `database_id`, and any other settings the club chose;
- `package.json`: the club's `name`;
- every migration the club has already deployed, unchanged and under the same
  name, and new migrations in order, never skipping one a later one needs.

Never commit secrets: `SETUP_TOKEN`, API keys, mail keys and `.dev.vars` stay
out of the repository.

### 4. Check it

```sh
npm ci
npm run typecheck
npm test
npm run cf:test
npm run deploy -- --dry-run
```

These run locally and touch no Cloudflare account. To let the coach see the
update before merging, run it with `npm run local` (see
[make the site your own](CUSTOMISE.md)).

### 5. Open the pull request

Title the commit and pull request "Update DeuceLeague to `<short sha>`", and end
the commit message with trailers: the full upstream commit, which the next
update starts from, and one line for every change still left out, including
earlier ones the coach declined again. The next update reads them from this
commit alone.

```
DeuceLeague-Upstream: <full sha>
DeuceLeague-Declined: <upstream sha> <what it is, and the files or parts left out>
```

Recording what was left out keeps it from being forgotten: the next update
starts after this commit, so without the trailer a skipped change would look
like one of the club's own and never be offered again.

In the pull request, say what it takes, what it leaves out, which migrations
will run on deploy, and that merging deploys. Leave merging to the coach.

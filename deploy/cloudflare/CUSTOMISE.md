# Make the site your own

Your club's site runs on your own computer as well as on Cloudflare: the same
players' site, coach's site and API, with the sample league, and nothing sent
anywhere. Your coding agent changes how it looks and works while you watch at
`localhost`, and each change shows within seconds. When you like it, it becomes
a pull request, and merging it puts it live.

It's also the quickest way to try DeuceLeague: no Cloudflare account needed.

## For the coach

You need a coding agent, such as Claude Code, and Node.js 22 or later. Give the
agent this prompt, with your club's repository, or DeuceLeague's to try it out:

> Run my club's DeuceLeague site on this computer and help me change how it
> looks and works. The repository is https://github.com/YOU/YOUR-REPO. Follow
> https://github.com/EMRahman/DeuceLeague/blob/main/deploy/cloudflare/CUSTOMISE.md.
> Show me each change at localhost before we keep it. When I'm happy, open a
> pull request for me to merge; don't push to main.

The agent starts the site and tells you where it is, usually
`http://localhost:8787`:

- **As the coach:** open `/coach` and paste the administrator key, which the
  agent leaves on your clipboard.
- **As players:** sign-in links for Sample Alex and Sample Bailey are in
  `.wrangler/local-club.txt`. Open one in your browser and the other in a
  private window.

Then say what you want: the club's colours, wording, a page laid out
differently, something the coach's site doesn't show yet. Refresh to see each
change. Nothing you do locally touches your real club or its players.

When you're happy, the agent opens a pull request. Read it, then **Merge** it on
GitHub, and the change goes live. [Updates](UPDATING.md) keep your changes.

## For the coding agent

### Run it

From a clone of the club's repository:

```sh
npm ci
npm run local
```

`npm run local` keeps running and does everything else:

- The first time, it writes `.dev.vars` with local secrets, creates the club with
  the sample league, and saves the keys to `.wrangler/local-club.txt`. Both are
  ignored by Git.
- Each time, it applies the migrations to the local D1, serves the Worker at
  `http://localhost:8787`, recompiles on every save, and makes fresh sign-in
  links for Sample Alex and Sample Bailey. It copies the administrator key to
  the clipboard where it can.

It never prints a key. Don't paste keys into the conversation: point the coach
at the clipboard and the file instead. `-- --port 8788` uses another port the
first time; after that the port comes from `PUBLIC_URL` in `.dev.vars`. Open the
site at `localhost`, not `127.0.0.1`: it answers only on the address in
`PUBLIC_URL`. To start again from nothing, stop it and delete `.wrangler/`.

### Change it

The two sites are server-rendered HTML with no scripts, in the players' site's
style:

- `adapters/website/src`: the players' site. `views.tsx` holds the pages and
  `STYLE`, whose colour tokens (`--accent`, `--bg` and the rest) set the look,
  with dark-mode values alongside.
- `adapters/coach/src`: the coach's site, which adds its own `COACH_STYLE`.

Both are MIT-licensed adapters that reach the league only through the API.
Keep changes there. Changing `packages/`, the API or the migrations makes a
different league, is AGPL, and is where [updates](UPDATING.md) clash most.
Show the coach each change at `localhost` before moving on.

### Keep it

```sh
npm run typecheck
npm test
npm run cf:test
npm run deploy -- --dry-run
```

Then commit on a branch and open a pull request describing what changed, with
before and after screenshots if you can take them. Never commit `.dev.vars` or
anything from `.wrangler/`. Merging deploys, so leave it to the coach.

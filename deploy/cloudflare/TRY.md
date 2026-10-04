# Try DeuceLeague

See a real league working in about fifteen minutes, all in your browser. You
deploy DeuceLeague to your own Cloudflare account with a sample club near the
end of its season, play it as the coach and as two of its players, then end
the season and start the next.

![The players' website on a phone: the home page with results to enter, a division table, and reporting a match.](../../docs/images/product-preview.png)

**What you get:** a club with 22 fictional players, singles and doubles in five
divisions, 50 matches (all but five played; the rest open, disputed or waiting
for matching independent entries), tables with promotion and relegation, and a 14-day forecast for
two courts.

**What you need:** a free Cloudflare account, a GitHub or GitLab account, and a
password manager. No email service, no server, and no cost on
Cloudflare's free plan.

When you are happy, [start your club for real](GO-LIVE.md). The sample can't be
removed, so your real club is a fresh deployment.

**Have a coding agent?** It can run the same sample club on your own computer in
a few minutes, with no Cloudflare account: see
[make the site your own](CUSTOMISE.md).

## 1. Make two passwords

The deployment needs two secrets. Make them with your password manager's
generator, or run this twice in a terminal on macOS, Linux or WSL:

```sh
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

| Name | Value |
| --- | --- |
| `SETUP_TOKEN` | The first one. It opens the club installer. |
| `WEBSITE_API_KEY` | The second one, with `dl_` in front. It connects the website to the league. |

Save both in your password manager. With a password manager's generator, use
43 letters and digits for each.

## 2. Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/EMRahman/DeuceLeague/tree/main)

1. Choose your account, and let the button create a repository.
2. Choose a Worker name, such as `riverside-league-trial`, and a **new
   database**. Keep the database's binding name **DB**.
3. For the **API token**, choose **Create new token**. Then, under **My Profile
   → API Tokens**, make sure it has **Account → D1 → Edit** as well as **Workers
   Scripts → Edit**: the deployment sets up the database, and Cloudflare's
   default token cannot.
4. Enter the settings, with the two passwords as **secrets**:

   | Setting | Value |
   | --- | --- |
   | `PUBLIC_URL` | Your site's address, `https://<worker name>.<your subdomain>.workers.dev`. Not sure of it yet? Enter `https://setup.invalid` and fix it below. |
   | `SETUP_TOKEN` (secret) | Your first password |
   | `WEBSITE_API_KEY` (secret) | Your second password, starting `dl_` |

5. Leave the build settings as they are (`npm run build`, `npm run deploy`,
   Node 22) and deploy.

When the build finishes, open `/healthz` on your site. It should say
`{"status":"ok"}`.

If you entered `https://setup.invalid`, or your address turned out different,
open `wrangler.jsonc` in your new repository, set `PUBLIC_URL` under `vars` to
the exact address, and commit. Wait for the build to finish again.

## 3. Create the sample club

1. Open `/install` on your site and enter your `SETUP_TOKEN`.
2. **Save the administrator key it shows you** in your password manager. It is
   shown once, and it is how you sign in as the coach.
3. Enter a club name, identifier and time zone.
4. Tick **Add a sample league** and create the club.

## 4. Be the coach

1. Open `/coach` and sign in with the administrator key. The dashboard shows
   how far through the sample season each competition is.
2. Look at **Results**, with the sample's two disputes and a score waiting on
   the other side, at **Tables**, which shows the tables and the
   forecast as players see them, and at **Activity** and the **Chase list**.
3. On **Members**, press **Sign-in link** for **Sample Alex**. With a real
   player you would send this link on WhatsApp; here, open it in this window
   and press **Sign in**.
4. Back on `/coach/members`, make a link for **Sample Bailey** and open it in a
   **private window**, since a browser holds one player's sign-in.

A link works once, within 72 hours.

## 5. Be the players

1. **As Alex:** look at the home page, the tables and the forecast. Open the
   match against Sample Bailey and report a score. It stays pending until
   Bailey independently enters a matching result.
2. **As Bailey,** in the private window: open the match from the home page and
   enter the result, with Bailey's games first. Alex's submission stays private.
   If the entries differ, speak outside the app and correct your own entry.
3. **As either:** the match now shows as played, and the singles table has
   changed.
4. **As Bailey,** open **Tables** and then **Sample doubles**. Under
   **Next season**, Sample Indy has asked Bailey to be their partner. Press
   **Agree**.

That's the league: both sides enter matching results, the tables follow, and the coach
hands out links.

To try the coach's result controls, open **Results** on `/coach` and select a
match. Review both submissions, choose a result and a reason, then press
**Review decision**. Try **No-show**, naming the absent side: the preview shows
who earns points and played credit, and who remains short of the minimum.
Save it, then open it again to try a correction. Replacing the confirmed result
requires the override checkbox; both decisions remain in the history. **Find a
match** lets you browse every match, including confirmed results.

## 6. End the season and start the next

1. **As the coach,** open **Season** and press **End season now**. It says
   what ending early does: the matches without an agreed result count as
   unplayed, and the tables become final. It lists the sample's disputed and
   one-sided results, each linked to decide it. Tick the box to leave them
   undecided, and end it. The Season page then shows how the season closed.
2. Press **Prepare next season's drafts**. Its competitions are made again as drafts,
   filled from the final tables: the top two of each division promoted, the
   bottom two relegated, the rest held. Sample Gray and Sample Morgan opted
   out, so they are left out; so is anyone who played fewer than the 4 matches
   expected, such as Sample Casey, with a line saying so.
3. Open the singles draft. Move anyone, take them out, add back anyone left
   out, and add **Sample Umi** and **Sample Val**, who played no singles last
   season. In the doubles draft, the pairs whose players asked each other
   (Harper and Parker, and Indy and Bailey) wait to be added. Sample Taylor
   said they are not playing. Pair Umi and Val, and anyone else without a
   partner.
4. Press **Start Sample season 2…**, then confirm. Every division gets its matches, and the
   players see the new tables.

## Next

- [Start your club for real](GO-LIVE.md): a fresh deployment without the
  sample, your members and courts, and inviting players.
- [Running the league day to day](../../docs/COACH-WORKFLOW.md) with a coding
  agent.
- [Make the site your own](CUSTOMISE.md): change its pages with your coding
  agent, on your own computer first.
- [How the deployment works](README.md), for the technical detail.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| The build fails with an authentication or permission error | The build token needs **Workers Scripts: Edit** and **D1: Edit** on this account. Fix it, or pick a replacement in the Worker's **Settings → Builds → API token**, then retry the build. |
| A migration fails | The Worker was not published. Fix the reported cause and retry. Earlier migrations may already be applied; that is fine. |
| No provisioned D1 database ID | Check the new database's ID matches the repository's `DB` binding. Don't create a second database to retry. |
| `/healthz` fails | The Worker's `DB` binding must point at the database the migrations ran against. |
| `/install` says not found | `SETUP_TOKEN` must be set and at least 32 characters. |
| `/install` or the site asks you to use another address | Set `PUBLIC_URL` to the exact address in `wrangler.jsonc`. |
| The installer or site says it is not ready | Check `PUBLIC_URL`, and that `WEBSITE_API_KEY` starts `dl_` and is complete. |
| `/coach` does not accept the key | Paste the whole administrator key from setup, starting `dl_`. |
| A sign-in link has been used or has expired | Make a new one on `/coach/members`. |
| No weather on the home page | See [court forecasts](WEATHER.md#when-forecasts-do-not-show). |

When asking for help, leave out passwords, keys and working sign-in links.

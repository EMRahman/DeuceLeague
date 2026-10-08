# Persona notes and simulated messages

Two `gpt-6-luna` agents inspected the current coach and player code/docs and
answered in character. These are **imagined decisions grounded in current
features**, not observations from a live browser. The deterministic model's
counts are in [model-results.json](model-results.json).

## Volunteer coach

> I would post `/join` in the club WhatsApp group, explain that applying is
> separate from being placed, then review requests oldest first. The Members
> page shows 25 requests at a time. I would check duplicates and contacts,
> assign a level, approve, and then set up the first divisions. With no old
> league table, that initial structure needs my coding agent/API. Afterward I
> would give each placed player a seven-day, one-use sign-in link.

> With 150 applications I would set aside time for the one-by-one decisions.
> The modeled 22 and 17 disputes and 20 and 18 one-sided unresolved results
> mean regular chasing. The Chase list helps me find who needs attention, but
> I still contact people by WhatsApp or email outside the site. Before ending
> the season I would review the unresolved matches and draft sizes; ending
> cannot be undone in the coach site.

Illustrative coach messages:

> “Please apply on the league site and choose singles, doubles, mixed doubles,
> or social. I will approve requests and share divisions after I review them.”

> “The season closes soon. Please arrange remaining matches and enter your
> score. If you have a score waiting on the other side, contact them now.”

Coach priorities: a safe bulk review with duplicate/level preview, a practical
WhatsApp handoff for unresolved results, and a single closeout view showing
disputes, one-sided claims and division progress.

## Players

**New player:** “I fill in `/join` with email, phone and what I want to play.
I expect the coach to approve me before I see matches. If I join while a season
is already running, I would ask in WhatsApp when the next draft starts.” The
current join confirmation does say next-season placement; the wait is a
scenario reaction.

**Doubles player:** “I use the WhatsApp link from the match card to agree a
time. ‘Free Thursday at 6:30 or Saturday morning?’ ‘Thursday works; I’ll book
Court 2.’ After that, I mark the match arranged for myself. I would want to
know that marker is private and does not notify my opponent.”

**Disputed score:** “If the site says the scores differ, I message my opponent:
‘I recorded 6–4, 6–3; what have you got for set two?’ If I typed 6–2 by
mistake, I correct my own entry. The result counts when our independent entries
match.” The engine model created 22 and 17 disputes and modeled 15 and 14
WhatsApp-led corrections. The dialogue is illustrative.

**Changing partner:** “I tell my current partner first. ‘I am hoping to pair
with someone else next season; can we update our choices before the coach
drafts?’ The website records next-season preferences, and the coach still
decides placement.” The model breaks one mixed pair and adds one replacement
pair; it does not test the partner-choice route.

## Harness finding

An attempted website/D1 run failed before club setup: Miniflare tried to bind
`127.0.0.1`, and this sandbox returned `EPERM`. A representative Cloudflare
installer test failed the same way. The in-process model therefore does not
substitute for a Worker request log or screenshots.

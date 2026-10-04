# Raw friction logs: 4 October 2026 simulation

These are the 46 persona checkpoint reports, unmerged and unedited apart from heading levels and one redacted sign-in token. The coach ran at the session default model and the players at Haiku 4.5.

Read them alongside [the harness faults](#harness-faults):

- Several player complaints about "the messaging system" concern the harness stand-in for WhatsApp, which is not part of DeuceLeague.
- Dates, countdowns ("70 days", "175 days") and "4 Oct" played-on dates come from the clock not advancing.
- The coach's "blank pages" at s1-end came from the harness browser not following a 307.

---

## Checkpoint s1-w0

### Helen Marsh (coach)

#### Friction log: Helen Marsh (coach), s1-w0, launch night, Sunday 4 October 2026

1. **Goal:** Sign in and check the season looks right.
   **Action:** /coach sign-in form, pasted admin key; read the Dashboard.
   **Outcome:** Signed straight in. The Dashboard shows every competition with its divisions, match totals and player/pair counts. They all matched my entry sheet (4×8 singles, 2×6 pairs doubles, 314 matches, closes 13 Dec).
   **Confusion or annoyance:** The same "What the columns mean" glossary is printed under all five competitions, so it's a long scroll to see five small tables. The Season tab says nothing about divisions or players. It only offers "End season now", which is a scary button to have sitting there on launch night.
   **Severity:** minor
   **URL:** /coach, /coach/season

2. **Goal:** See which players are in which division.
   **Action:** Tables tab.
   **Outcome:** Divisions and fixtures ("Still to play") are all there and look right.
   **Confusion or annoyance:** Every player row has a stray tick-box next to the name and I don't know what it's for.
   **Severity:** minor
   **URL:** /coach/tables

3. **Goal:** Find out who in the league needs to be got onto the site.
   **Action:** Members tab, then "Show only those placed but never signed in".
   **Outcome:** That filter is exactly what I wanted: 88 league players. The Members page itself is enormous, though. Every member gets a full block of forms (contacts, level, gender/age, break, leaving, left club), so 150 members makes one endless page. The "Waiting to be placed" list calls 62 social/lapsed members "new club members", which they aren't.
   **Confusion or annoyance:** I had to scroll through the whole thing to find one person, and once I've done something to someone the page reloads at the top, so I'm scrolling all over again. A search box or a compact one-line-per-person list would save a lot of time.
   **Severity:** painful
   **URL:** /coach/members, /coach/members?show=unsigned

4. **Goal:** Get the ~74 league players who have an email signed in.
   **Action:** Read the invitation options, then sent a club-wide announcement telling people to use the front-page "Email me a sign-in link" form.
   **Outcome:** This worked well: within the evening, 98 of 151 members had signed in. The self-service sign-in on the front page is the hero feature here.
   **Confusion or annoyance:** The site's own email invitations go out only 5 at a time, and the link in them works for just fifteen minutes. On a Sunday night that's no good, because people open their email the next morning. I tried one batch of 5 (Derek, Dominic, Euan, Marcus, Rory) and only Euan signed in. Emailing 74 people would have taken 15 batches, each with a reload and a scroll, to send links that would mostly be dead by morning. There's no "email everyone in the league who hasn't signed in" button.
   **Severity:** painful
   **URL:** /coach/members/invite, /

5. **Goal:** Get the 10 phone-only league players signed in.
   **Action:** For each one: found them on the Members page, pressed "Sign-in link", and WhatsApped them the link.
   **Outcome:** It works, and the 72-hour link is sensible. Five of them were in within minutes and said "that worked".
   **Confusion or annoyance:** Each person meant reload the giant page, find them, click, copy, send. For 10 people that was fine. For 40 it wouldn't be. A front-page message such as "No email? Ask your coach for a link" would also save the players asking me one by one. Five of them messaged me within minutes of the announcement.
   **Severity:** painful
   **URL:** /coach/members/{id}/sign-in-link

6. **Goal:** Reach the 4 league players with no email and no phone (Bella Wood, Gavin Evans, Kofi West, Robbie Edwards).
   **Action:** Second announcement naming them, and messages to their doubles partners.
   **Outcome:** Nothing yet. The partners didn't answer my question.
   **Confusion or annoyance:** The site can only make me a link. It can't help me find these people. It would help if the Tables or Chase list showed partners' phone numbers so I could ring around. The Chase list shows only emails, even for people (like Callum) who have a phone and no email.
   **Severity:** painful
   **URL:** /coach/chase

7. **Goal:** Handle Hannah Cole's join request.
   **Action:** Members > Asking to join > "Approve and email sign-in link".
   **Outcome:** Easy. It filled in her gender and age from her form and told me plainly that she goes into next season, not this one.
   **Confusion or annoyance:** I couldn't give her a match this season, which she was hoping for, so I had to manage her expectations by WhatsApp. The approve button also emails her a 15-minute link at night.
   **Severity:** fine
   **URL:** /coach/members

8. **Goal:** Add the two court locations for the weather forecast.
   **Action:** Weather tab, Add a court, twice.
   **Outcome:** Both courts were added in the end. After adding the first court, though, the form at the top of the page became that court's edit form. My second entry overwrote the first court (the page said "Court saved", not "Court added") and I had to add Hollins Park again. Both times it also said "The forecast could not be fetched just now".
   **Confusion or annoyance:** I nearly didn't notice I'd overwritten the first court. The "Add a court" box should stay at the top, or the page should go back to it empty. I'm not sure whether the forecast failure means I typed the numbers wrong. The page doesn't say.
   **Severity:** minor
   **URL:** /coach/weather

9. **Goal:** Know who's signed in and who to chase.
   **Action:** Activity tab, Members counts, Chase list.
   **Outcome:** The Activity feed shows each sign-in as it happens, which was reassuring to watch. The Chase list has an "Email 74 players (BCC)" link, which will be handy later.
   **Confusion or annoyance:** The headline "98 of 151 signed in" counts social members too. The league-only number (31 still out) only appears inside the filter.
   **Severity:** minor
   **URL:** /coach/activity, /coach/chase

10. **Goal:** Avoid the coding agent.
    **Action:** Didn't use it.
    **Outcome:** Everything tonight could be done on the website, which pleased me.
    **Confusion or annoyance:** none
    **Severity:** fine
    **URL:** n/a

**Overall:** Launch night went better than I feared. One announcement pointing people at the front-page sign-in form got most of the league on in an evening, and the personal WhatsApp links mopped up the phone-only players. The coach's Members page is the weak spot at our size: it's one huge page, there's no search, the email invites go 5 at a time with 15-minute links, and every action sends me back to the top. I'd tell the club the site is easy for players and to make sure the club has their email, and I'd tell the developers that the coach's member list needs a search box and a bulk "send links to everyone not signed in" option.

### Hannah Cole

#### Hannah's Friction Log - Checkpoint s1-w0

##### Entry 1: Finding the Join Page
- **Goal:** Find how to join the league at Hollins Park
- **Action:** Opened http://localhost:8790, saw sign-in page with link "Ask to join the league" (L2)
- **Outcome:** Successfully found the join page at /join
- **Confusion or annoyance:** None - the link was clearly visible and easy to find
- **Severity:** Fine
- **URL:** http://localhost:8790

##### Entry 2: Filling Out the Join Form
- **Goal:** Apply to join the league with my details
- **Action:** Filled in join form (F1) with name (Hannah Cole), email (hannah.cole@example.net), phone (07700 900310), gender (female), age group (35-49), and agreed to privacy notice
- **Outcome:** Form submitted successfully, received confirmation message
- **Confusion or annoyance:** None - the form was clear and straightforward
- **Severity:** Fine
- **URL:** http://localhost:8790/join

##### Entry 3: Understanding What Happens Next
- **Goal:** Understand the approval process and when I'd get into matches
- **Action:** Read the confirmation page after submitting the join form
- **Outcome:** Page said coach must approve, then coach will consider me for a division in next season's draft and "be in touch about signing in". Says to ask at club if no word in a couple of weeks.
- **Confusion or annoyance:** The message doesn't explain WHEN approval happens, or what "a couple of weeks" means in practical terms. Is it 1-2 weeks? 2-3 weeks? Also doesn't say if coach will reach out via email or WhatsApp.
- **Severity:** Minor
- **URL:** http://localhost:8790/join (after submission)

##### Entry 4: Contacting the Coach Directly
- **Goal:** Get more information about timeline from the coach
- **Action:** Sent WhatsApp to Helen Marsh asking about how long approval takes and when I might get into a match
- **Outcome:** Message sent, no reply yet (which is realistic for a coach who's probably busy)
- **Confusion or annoyance:** None - this is expected and realistic
- **Severity:** Fine
- **URL:** N/A (WhatsApp message)

##### Entry 5: Exploring Public League Information
- **Goal:** Understand how the league works and see standings/schedule
- **Action:** Tried to explore the website to find more info; clicked on DeuceLeague link at bottom of page
- **Outcome:** Got a 404 error ("Nothing here"). No public information visible about league structure without signing in
- **Confusion or annoyance:** It would be helpful to have some public information about the league - how many divisions, what the schedule looks like, when matches happen, etc. New members would want to understand what they're joining.
- **Severity:** Minor
- **URL:** http://localhost:8790/EMRahman/DeuceLeague (404)

##### Summary
The join process itself was smooth and easy - I found the page, filled in the form, and got immediate confirmation. However, there are some gaps in information for a nervous beginner like me. I don't understand the timeline clearly (how long for approval? when do matches start?), and the site doesn't show any public information about how the league actually works. As someone new and nervous, I'd like to see more details about what to expect - how many divisions are there, what level am I likely placed in, when do matches typically happen each week, etc.

I've done what a real person would do: applied online, read the confirmation, and reached out to the coach directly to ask questions. Now I'm waiting for Helen to respond so I can understand the next steps better. Overall, I feel cautiously optimistic but uncertain about the timeline.

---

## Checkpoint s1-w1

### Helen Marsh (coach)

#### Friction log: Helen Marsh (coach), s1-w1, Sunday 11 October 2026 (after week 1 of matches)

1. **Goal:** See how the first week went.
   **Action:** Opened the Dashboard.
   **Outcome:** Clear. It showed played/total for each division and a link at the top: "1 result disputed, 6 results waiting on the other side". I went straight to that link.
   **Confusion or annoyance:** As last week, the glossary is printed five times. After one week, every "Short" and "% short" column reads 100%, which is accurate but tells me nothing yet. The page also says "Results close in 70 days" and the entries are stamped 4 Oct, when to me it's 11 Oct and 63 days. It may only be the clock, but I noticed it.
   **Severity:** minor
   **URL:** /coach

2. **Goal:** Sort out the disputed Stefan Barnes v James Hale result.
   **Action:** Results > the dispute > asked both players who won > "Use James Hale's entry" > picked a reason > Review decision > Save coach decision.
   **Outcome:** Very good. The page told me in plain words that "these are the same score reversed: one side may have entered its own games first" and listed each set side by side. The review screen showed the points each player gets before I saved. It took two minutes once both players had answered.
   **Confusion or annoyance:** I had no mobile for Stefan, so I had to email him. Small thing: once the dispute was cleared, the link numbers on the Results page moved and I opened the wrong match the next time I went back.
   **Severity:** fine
   **URL:** /coach/results, /coach/matches/{id}

3. **Goal:** Deal with Zoe Walsh's result against Bella Wood. Bella can't confirm it because she isn't on the site and we have no contact for her.
   **Action:** Messaged Zoe. She told me she LOST 2-6 6-0 6-10. Her entry on the site, though, shows the score with Bella's games first, which makes it a Zoe win. I decided the result myself as Bella's win, 6-2 0-6 10-6.
   **Outcome:** Saved, and the tables updated. The decision form let me type the correct score and showed the effect before saving.
   **Confusion or annoyance:** This is the second "wrong way round" score in the first week. The dispute caught Stefan's, but Zoe's would have quietly gone in as the wrong winner if I hadn't asked her. A result can't be checked when the other side never signs in. The player's score form clearly confuses people about whose games go first. None of the reasons in the list fits "the entered score was the wrong way round". I used "One side has not responded".
   **Severity:** painful
   **URL:** /coach/matches/{id}

4. **Goal:** Get the remaining 13 never-signed-in league players on.
   **Action:** Members > "Show only those placed but never signed in". For each person: Sign-in link, then a WhatsApp (6 people) or an email from my own account with the 72-hour link (3 email-only people).
   **Outcome:** The filter is excellent: down from 31 to 13, exactly the people I need. Making nine links took about ten minutes. For the people with a result waiting (Marcus, Tomasz, Grace), I could tell them so in the same message.
   **Confusion or annoyance:** It's still one link at a time, with a page reload for each, and the filtered page still carries every member's full block of forms. For the email-only players I worked out that I can paste the 72-hour link into my own email instead of using the site's 15-minute email, which is what I wanted last week. It would be nice if the site's "Email sign-in link" button sent the 72-hour kind. None of the nine had signed in by the end of my session.
   **Severity:** minor
   **URL:** /coach/members?show=unsigned, /coach/members/{id}/sign-in-link

5. **Goal:** Let players see who's still waiting to confirm a result, so I don't have to chase it all myself.
   **Action:** Read the "Waiting on the other side" list.
   **Outcome:** It's useful, and each line says who has not answered and for how long. Three of the six were waiting on people who have never signed in, so they can't see the result at all.
   **Confusion or annoyance:** The site could tell me "waiting on someone who has never signed in". As it is, I had to compare it with the Members list myself.
   **Severity:** minor
   **URL:** /coach/results

6. **Goal:** Reach the four league players with no phone and no email (Bella Wood, Gavin Evans, Kofi West, Robbie Edwards).
   **Action:** The Activity feed showed "Kofi West / Dana Park beat ..." and Bella had played Zoe, so these people are playing. I messaged their partners and opponents (Dana Park, Euan Osei, Phoebe Lane, Zoe Walsh) and repeated the plea in the club announcement.
   **Outcome:** Nobody passed on a number. Results still get entered by the partner, which is something.
   **Confusion or annoyance:** It's frustrating that people can play in my league for a week while I still can't reach them. The Chase list does now show partners, which made it easier to work out who to ask. It still shows emails only, not phone numbers.
   **Severity:** painful
   **URL:** /coach/activity, /coach/chase

7. **Goal:** Check the tables after my decisions.
   **Action:** Tables > Men's Singles. Looked up James Hale and Stefan Barnes.
   **Outcome:** Correct: James played 3, won 3, 18 points; Stefan 3 points.
   **Confusion or annoyance:** All four divisions are on one long page with the stray tick-boxes still next to every name. I had to search the page to find two players.
   **Severity:** minor
   **URL:** /coach/tables/{competition}

8. **Goal:** Make sure the weather forecast is showing for players.
   **Action:** Weather tab.
   **Outcome:** Both courts are listed. It still says "The forecast could not be fetched just now", a week after I added them.
   **Confusion or annoyance:** "Just now" a week later suggests it's broken, but nothing tells me what to do or whether my numbers are wrong. I'll ask my nephew if it's still like this next week.
   **Severity:** minor
   **URL:** /coach/weather

9. **Goal:** Weekly message to the club.
   **Action:** Phone announcement (email list and WhatsApp group). Week 1 round-up, "score boxes follow the order of the names", please confirm your opponent's result promptly, and a plea about the four uncontactable players.
   **Outcome:** Sent. The site itself sends nothing (the Chase list says so plainly), so the reminders are mine to do.
   **Confusion or annoyance:** none
   **Severity:** fine
   **URL:** n/a

10. **Goal:** Avoid the coding agent.
    **Action:** Didn't use it.
    **Outcome:** Everything this week could be done on the website.
    **Confusion or annoyance:** none
    **Severity:** fine
    **URL:** n/a

**Overall:** A good first week: 17 results in, and the coach's results tools (dispute page, "use this entry", the review step showing points before saving) are clear and reassuring. My worry is the score order. Two of the first handful of results were entered back to front, and one of them would have gone in silently if I hadn't checked with the player. I'd tell the club that the site is working and that players should check whose name is on the left before typing a score. I'd tell the developers to make the player's score boxes say "Your games / Their games", or show who won before saving, and to flag results waiting on someone who has never signed in.

### Marcus Bell

#### Friction Log - Marcus Bell - s1-w1 (11 October 2026)

##### Summary
The new league website is clean, responsive, and easy to navigate. I got signed in quickly, entered my two results from week 1, and checked the standings. I'm currently 1st in Men's Singles Division 1 with 7 points. The site performed well with no significant friction points.

---

##### Friction Log Entries

###### 1. Sign-in Process
- **Goal:** Get access to the league website to enter my results
- **Action:** Used WhatsApp sign-in link K149 that Helen sent me
- **Outcome:** Signed in immediately with one button press; stayed signed in on my device
- **Confusion or annoyance:** None
- **Severity:** Fine
- **URL:** /login?token=...

###### 2. Finding the Dominic Moore Result to Confirm
- **Goal:** Confirm my win against Dominic Moore (6-2, 6-2)
- **Action:** Clicked on "Needs your answer" section on home page, then followed L6 link to enter result
- **Outcome:** Found the match form immediately; Dominic had already entered the result; I entered mine and both matched, so it counted
- **Confusion or annoyance:** None - the layout was clear
- **Severity:** Fine
- **URL:** /matches/01a10688-bc8f-7d31-8c09-ecf6f489d711

###### 3. Score Entry Form Clarity
- **Goal:** Enter my scores correctly without confusion about order
- **Action:** Filled in the form with Set 1 (6-2), Set 2 (6-2) with "You" on left, opponent on right
- **Outcome:** Form was clear - "You" and "Dominic Moore" labels removed any ambiguity. Result confirmed both sides matched
- **Confusion or annoyance:** None - Helen's earlier warning about score order wasn't needed here; the form was unambiguous
- **Severity:** Fine
- **URL:** /matches/01a10688-bc8f-7d31-8c09-ecf6f489d711#report

###### 4. Entering Rory Kelly Result
- **Goal:** Enter my singles result against Rory Kelly (7-5, 6-4)
- **Action:** Navigated to Rory Kelly match from "To play" list (L11), filled in Set 1 (7-5), Set 2 (6-4)
- **Outcome:** Result saved successfully; now waiting for Rory to confirm. Shows "Waiting for Rory Kelly to enter their result independently"
- **Confusion or annoyance:** None - process was straightforward
- **Severity:** Fine
- **URL:** /matches/01a10688-bc8f-7d8c-86e6-a64508be2202

###### 5. Viewing Current Standings
- **Goal:** Check where I stand in Men's Singles and Men's Doubles
- **Action:** Clicked "Tables" link from navigation, then viewed Men's Singles and Men's Doubles tables
- **Outcome:** Easily found the standings; clear layout with my current position (1st in Singles with 7 pts, 5th in Doubles with 0 pts). Could see detailed breakdowns of matches played and points earned
- **Confusion or annoyance:** None
- **Severity:** Fine
- **URL:** /competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b (Men's Singles)

###### 6. Opponent Contact Details Visibility
- **Goal:** Potentially arrange remaining matches
- **Action:** Viewed match pages which showed opponent phone and email (e.g., Rory Kelly: 07700 935926, rory.kelly@example.net)
- **Outcome:** Contact details were visible only on match pages, which is appropriate for privacy. Note shows these are "Only the players in your matches see these, to arrange them"
- **Confusion or annoyance:** None - sensible privacy approach
- **Severity:** Fine
- **URL:** /matches/01a10688-bc8f-7d8c-86e6-a64508be2202

---

##### Overall Assessment

The DeuceLeague website is well-designed and performs excellently. There are no significant usability issues. The interface is intuitive, forms are clear, navigation is straightforward, and the data presentation (standings, match history) is easy to understand. 

As a software tester who is impatient with clunky websites, I was pleasantly surprised. This is professional-grade work. The only very minor suggestion would be to perhaps show a quick summary of "pending results" on the home page (matches where I've entered a score but opponent hasn't confirmed yet), but it's not a blocker since that info is clearly shown and easy to find.

I'd tell the club: The website works great. Keep using it. The tennis is more important than the technology anyway, and you've got good tech here.

### Tomasz Nowak

#### Friction Log - s1-w1 (Sunday 11 October 2026)

##### 1. Confusing score notation in coach's message
**Goal:** Understand what score Callum entered so I can confirm or dispute it.

**Action:** Read Helen's WhatsApp: "Callum Byrne has entered your Men's Singles result (4-6 6-3 10-8 to him)".

**Outcome:** Unclear what "to him" means. Does it mean he won 10-8? Or is it just saying "he submitted this score"? I had to ask Callum to clarify. 

**Confusion or annoyance:** The notation is ambiguous. In tennis, scores can be written different ways, and "10-8 to him" could mean he scored 10 (and won) or it could be a clumsy way of saying "this is his submission". I don't like ambiguous language. 

**Severity:** minor

**URL:** N/A (WhatsApp message)

---

##### 2. Score discrepancy with opponent - contradictory information
**Goal:** Confirm my match score against Callum Byrne (I remember winning 6-4, 3-6, 10-8).

**Action:** Called Callum to ask about the score. He said "I am sure I won the match tiebreak 10-8" but also said "You lost 4-6, 6-3, 8-10 (my games first)".

**Outcome:** Callum gave me contradictory information. If scores are "his games first" and it's 8-10, that means he scored 8 and I scored 10 - so I WON 10-8, not him. He's either confused about the notation or misremembered who won.

**Confusion or annoyance:** This is annoying because Callum seems to have entered the score correctly (8-10 with his games first = I won 10-8) but then told me verbally that he won. Either he doesn't understand the notation or he's being careless. I'm straightforward about fairness - if someone beats me, I'll say so, and I expect the same from others. 

**Severity:** painful

**URL:** (phone call - not on website)

---

##### 3. Can't see opponent's entered score on the website
**Goal:** Compare what I entered (6-4, 3-6, 10-8) with what Callum entered to find the discrepancy.

**Action:** Looked at the match page after entering my score. It says "entries do not match" but doesn't show me what Callum actually entered.

**Outcome:** Can only see that our scores don't match, not where the difference is. I had to call Callum and ask him verbally what he entered.

**Confusion or annoyance:** This makes it hard to diagnose score problems. If I could see both scores side by side, it would be obvious that Callum entered the same score as me (based on what he told me). The website should show both scores when there's a mismatch, so we can quickly spot the difference. 

**Severity:** painful

**URL:** http://localhost:8790/matches/01a10688-be3d-7567-9d0a-56387da90f45#report

---

##### 4. Score form is clear, but only after thinking carefully
**Goal:** Understand which column is which when entering the match score.

**Action:** Looked at the match form. It showed "You | Callum Byrne" at the top, with "mine_1" and "theirs_1" fields. I entered my score in the left columns.

**Outcome:** The form is actually clear once you read it. "mine_1" = my set 1 score in the left box, "theirs_1" = their score in the right box. This is correct and I entered 6-4, 3-6, 10-8 correctly.

**Confusion or annoyance:** none - the form design is good. Helen did warn in her announcement that scores had come in backwards this week, so I was careful to check which name was on the left. The form itself is fine.

**Severity:** fine

**URL:** http://localhost:8790/matches/01a10688-be3d-7567-9d0a-56387da90f45#report

---

##### 5. Unconfirmed match doesn't count toward my record
**Goal:** Get my first win of the season recorded.

**Action:** Entered my score (6-4, 3-6, 10-8 vs Callum) on the website. Waited for his confirmation.

**Outcome:** Score still shows as unconfirmed because Callum entered a conflicting tiebreak score. Even though I'm confident I won, my match statistics still show 0 wins, 0 losses, 0 points. I'm in 8th place with 0 points while other people who won their first match have 3-7 points.

**Confusion or annoyance:** It's frustrating that my result doesn't count yet. I played the match, I remember winning, I entered the score correctly - but because Callum is confused or careless, my win doesn't show up. This affects the table standings. I need this sorted urgently.

**Severity:** painful

**URL:** http://localhost:8790/ (home page shows I'm 8th with 0 pts)

---

##### 6. No scheduled dates shown for upcoming matches
**Goal:** Know when I'm supposed to play my next matches.

**Action:** Looked at the division standings and my home page. Saw a list of 6 opponents I still need to play but no dates or scheduling information.

**Outcome:** The website doesn't show scheduled match dates - just lists who I need to play. I don't know if these are coming up next week or later this season.

**Confusion or annoyance:** It would be helpful to know when matches are scheduled, or at least a rough timeframe. Are these matches arranged outside the app? Helen mentioned matches on 4 Oct, but I don't see where the schedule was set. 

**Severity:** minor

**URL:** http://localhost:8790/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b#mine

---

##### Summary

The league website is mostly straightforward to use. The sign-in process works well, the standings are clear, and entering a score is easy once you're on the page. However, there's a real problem when scores don't match: you can't see the opponent's entered score to figure out where the discrepancy is. This put me in a frustrating position where Callum gave me contradictory information verbally, and I had to ring him to sort it out. 

The bigger issue is that Callum seems confused about the score he entered, or he's being careless. For a fairness-focused league, it's important that score disputes get resolved quickly and clearly. I'd tell the club: make it possible to see both scores when they don't match, and remind players to double-check their entry before submitting. Also, Helen should clarify her notation in messages - "10-8 to him" is ambiguous.

I like the website overall but need this score issue resolved today so my win gets recorded and the table updates correctly.

### Grace Adeyemi

#### Grace's Friction Log - Checkpoint s1-w1

##### 1. Score entry column order confusion
**Goal:** Confirm my match result from week 1
**Action:** Went to match page at `/matches/01a10688-c439-70cd-8292-8487fa8f1865` and filled in score form
**Outcome:** Successfully entered 4-6, 6-4, 8-10 and confirmed the result
**Confusion or annoyance:** The coach had to send an announcement reminding players that "the boxes are in the order the NAMES are shown on the match page, not 'my score first'" because "two results this week came in the wrong way round." This suggests the form's labeling could be clearer - the headers just say "You" and "Anna Evans / Ella Doyle" but it took an announcement to clarify what that meant.
**Severity:** painful
**URL:** `/matches/01a10688-c439-70cd-8292-8487fa8f1865`

##### 2. Unclear "enter your result independently" wording
**Goal:** Understand whether I needed to enter a new result or confirm the opponent's result
**Action:** Checked the match page which said "Anna Evans / Ella Doyle has entered a result. Enter yours independently."
**Outcome:** I correctly interpreted this as "enter your own version independently," which matched their entry and confirmed the result
**Confusion or annoyance:** The language "enter your result independently" doesn't explicitly say "even though they already entered one" or "to confirm." It could be clearer that this is a confirmation process, not re-entering a different result.
**Severity:** minor
**URL:** `/matches/01a10688-c439-70cd-8292-8487fa8f1865`

##### 3. Missing partner blocks Mixed Doubles play
**Goal:** Be able to schedule and play Mixed Doubles matches
**Action:** Checked my Mixed Doubles competition page
**Outcome:** I'm in 6th place (bottom, marked "going down") with 0 points because Robbie Edwards hasn't been added to the website yet. The coach has no phone or email for him.
**Confusion or annoyance:** I can't do anything with my Mixed Doubles pairing. I messaged Helen saying I'd try to find Robbie's number, but this is frustrating because I'm stuck at the bottom of the standings through no fault of my own, just because my partner isn't on the system.
**Severity:** blocker
**URL:** `/competitions/01a10688-c4ee-7f4f-a42b-75b78c19545e`

##### 4. Initial confusion about result status
**Goal:** Understand what action was needed on my match result
**Action:** Read home page which had a "Needs your answer" section for the Anna Evans / Ella Doyle match with an "Enter result" link
**Outcome:** I realized I needed to go to the match page and enter my own version of the score
**Confusion or annoyance:** The home page said "Needs your answer" but didn't clearly state whether the opponent had already entered their result or whether this was a new match. The match page made it clearer, but the home page could say "Opponent's result ready to confirm" or similar.
**Severity:** minor
**URL:** `/`

##### 5. No easy way to find Robbie Edwards's contact info
**Goal:** Help the coach by providing Robbie Edwards's phone number or email
**Action:** Checked home page and website, didn't see an obvious "player directory" or "contact your teammates" feature
**Outcome:** I messaged Helen that I don't have his number, but I have no way to look it up on the website or easily ask my partner for their contact details
**Confusion or annoyance:** The website shows contact info for some players (like on match pages), but there's no central directory or way for me to look up or message other players. I can see Anna and Ella's phone and email on my match page, but nowhere to see Robbie's or to ask him directly through the app.
**Severity:** painful
**URL:** `/` (home page lacks player directory)

##### Summary

The league website is working well overall - I successfully confirmed my Women's Doubles result and can see the standings clearly. However, there are a few friction points:

1. The score entry column order is confusing enough that the coach needed to send a correction announcement
2. Partner management is a blocker - Robbie Edwards can't be on the system, so Mixed Doubles can't happen yet
3. The website could make it easier to find and contact other players
4. The home page messaging about "needs your answer" could be clearer about what's actually needed

I'm happy with my Women's Doubles progress (2nd place after one match) but frustrated that I can't play Mixed Doubles until Robbie gets added to the system.

### Derek Mills

#### Derek Mills - Friction Log (s1-w1: Sunday 11 October 2026)

##### Entry 1: Sign-in via email link
**Goal:** Get onto the league website to see fixtures and division standings
**Action:** Found sign-in link K155 in Helen's email, clicked to open link, signed in on the confirmation page
**Outcome:** Successfully signed in and remained logged in on the browser
**Confusion or annoyance:** None - the process was straightforward and Helen's direct email link gave me confidence
**Severity:** Fine
**URL:** `/login?token=<redacted>`

##### Entry 2: Viewing division standings and fixtures
**Goal:** See who I'm playing against and understand the division
**Action:** Clicked "See your competition and fixtures" link from home page
**Outcome:** Saw full Division 2 standings with all 8 players, match history for players who've already played (Elliot Khan 2-0, Matt Tran and Ryan Wood each 0-1), and my 7 opponents listed
**Confusion or annoyance:** The page is quite long and shows all divisions - had to scroll past Division 1, 3, and 4 to focus on mine. The scoring system explanation at the bottom is comprehensive but a bit dense (various point combinations for wins/losses/sets/bonus points).
**Severity:** Minor - not a blocker but the page length could be trimmed for quicker scanning
**URL:** `/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b#mine`

##### Entry 3: Viewing match details and opponent contact info
**Goal:** See how to enter a score and get opponent's contact details
**Action:** Clicked on "Ryan Wood" opponent link from home page
**Outcome:** Saw match page with opponent's phone number and email, score entry form with dropdowns for each set, note that "both sides enter independently"
**Confusion or annoyance:** The scoring form is clear, but the match format rules (best of 3 sets to 6, tiebreak at 6-6, match tiebreak to 10 instead of deciding set) are non-standard tennis. I had to read the rules carefully to understand. Also, the form helpfully notes that "the boxes are in the order the NAMES are shown" - Helen's email mentioned this because some results came in backwards last week.
**Severity:** Minor - the form is clear, but the non-standard match tiebreak format took a moment to understand
**URL:** `/matches/01a10688-bd4e-78d4-bbdd-76a9f28eee14`

##### Entry 4: Email notification from Helen
**Goal:** Get started with the new league system
**Action:** Received sign-in link email from Helen, also received announcement about league progress and scoring reminders
**Outcome:** Got signed in successfully, but Helen also asked for my mobile number and I haven't replied yet - I'm still not keen to give out personal numbers to a website system I don't fully trust yet
**Confusion or annoyance:** Helen seems friendly and helpful, but the new website still feels slightly foreign. I prefer email communication anyway.
**Severity:** Minor - no real friction, just my own caution
**URL:** Email messages

---

##### Summary

The league website is functional and I've successfully got signed in and can see my division and fixtures. The sign-in process was smooth once I clicked Helen's email link. The standings are clear, and I can see opponent details and a form to enter scores. However, I'm still taking a cautious approach to the new website system - this is my first time using it and I'm not fully comfortable yet. The non-standard match format (especially the match tiebreak to 10 instead of a deciding set) needed a moment to understand, but it's clearly explained on the site.

I'd tell the club that the website is workable and Helen's direct email support (sending personal sign-in links) was helpful for getting me started. The information is all there - divisions, fixtures, opponent details. I just need time to get used to the new system. I haven't played any matches yet (no one has arranged them with me), but I know I can find opponent contact details when I need to arrange a game.

### Sofia Marin

#### Sofia's Friction Log - Checkpoint s1-w1
##### Sunday 11 October 2026 - After Week 1 of Autumn 2026 League

###### 1. Late Sign-In Access
- **Goal:** Get onto the league website and see my fixtures
- **Action:** Received personal sign-in link (K154) from Helen via WhatsApp on Friday (week 1). Opened link on Sunday evening and clicked sign-in button (B1).
- **Outcome:** Successfully signed in and now have persistent access to the site
- **Confusion or annoyance:** Minor. I should have signed in earlier when the league announcement came out. The initial announcement said to sign in "this week" but I didn't get around to it until Friday when Helen sent me a personal link. Not everyone may realize they need to act immediately on these things.
- **Severity:** minor
- **URL:** http://localhost:8790

###### 2. Discovering My Fixtures
- **Goal:** Understand what I need to play and who I need to play against
- **Action:** From home page, clicked on "See your competition and fixtures" links (L4, L5, L6) to view all three divisions (Women's Singles, Women's Doubles, Mixed Doubles)
- **Outcome:** Successfully found all 17 fixtures clearly displayed with opponents listed
- **Confusion or annoyance:** None - the layout is very clear and easy to navigate
- **Severity:** fine
- **URL:** http://localhost:8790/competitions/ (for each competition)

###### 3. Finding Contact Information
- **Goal:** Get phone numbers and emails to contact partners and opponents about arranging matches
- **Action:** Clicked on individual opponent links from home page, which took me to match pages (e.g., L7 for Carys Wood, L9 for Jade Mahmood)
- **Outcome:** Match pages display phone numbers and emails clearly with label "Get in touch" and note that "Only the players in your matches see these"
- **Confusion or annoyance:** None - the contact information is prominently displayed and easy to find
- **Severity:** fine
- **URL:** http://localhost:8790/matches/[match-id]

###### 4. Attempting to Arrange Matches with Phone Contacts
- **Goal:** Contact my partners (Dana Park, Arjun Farrell) and opponents to arrange matches for week 2
- **Action:** Called Dana Park twice (using her phone number from match page) and called Jade Mahmood. Also sent WhatsApp messages to Dana Park and Arjun Farrell asking about availability.
- **Outcome:** People responded, but only with summaries of their week 1 matches, not with information about availability or willingness to arrange future matches
- **Confusion or annoyance:** Mild annoyance. When I tried to discuss arranging future matches, people just told me what they played in week 1. It's unclear whether they're: (a) not understanding my question, (b) busy on Sunday evening, (c) unable to commit to future times, or (d) thinking I just wanted to know about their week. I can't tell if I should try again or if people generally coordinate differently (e.g., at the club itself).
- **Severity:** painful
- **URL:** (phone calls and messages, not website-based)

###### 5. Attempting to Arrange Matches via Email
- **Goal:** Contact opponents via email as an alternative to phone calls
- **Action:** Sent email to Carys Wood proposing a match "this coming week"
- **Outcome:** Carys replied via email saying she hasn't played any league matches yet this season
- **Confusion or annoyance:** Mild annoyance. Again, the response doesn't address my question about availability; she just states her status (hasn't played). I'm not sure if I need to be more specific with dates/times or if everyone is just winding down on Sunday.
- **Severity:** painful
- **URL:** (email, not website-based)

###### 6. Understanding Score Entry Rules
- **Goal:** Learn how to properly enter match results
- **Action:** Read Helen's announcement about score entry, which stated: "When you enter a score on the league site, the boxes are in the order the NAMES are shown on the match page, not 'my score first'. Two results this week came in the wrong way round and I had to sort them out."
- **Outcome:** I understand that scores must go in name order, not player order
- **Confusion or annoyance:** Mild concern. This is a potential gotcha - people might naturally think "my score first" but the system requires name order. Helen noted two results this week had to be corrected. The site should probably be more explicit about this at the score entry point, not just in announcements.
- **Severity:** painful (if you make the mistake) / fine (once you know about it)
- **URL:** http://localhost:8790/matches/[match-id] (score entry form)

###### 7. Discovering No Built-In Scheduling System
- **Goal:** Find a way to propose and coordinate match times with other players
- **Action:** Explored the website looking for a calendar, scheduling tool, or "propose a match" feature
- **Outcome:** No such feature exists - players must coordinate entirely through phone, email, or text outside the website
- **Confusion or annoyance:** Mild frustration. The website has all the match fixtures and contact info, but no way to coordinate availability or propose specific times. In a modern league system, I might expect something like: "Check availability", "Propose a time", or even just a simple calendar. Having to manually contact each person makes it harder to organize, especially when people respond with summaries rather than actual availability.
- **Severity:** painful
- **URL:** http://localhost:8790 (website generally)

###### 8. Understanding League Rules
- **Goal:** Learn the scoring system and league rules
- **Action:** Scrolled through competition pages to read "How points work" section and "Matches:" details
- **Outcome:** Rules are clearly displayed: Win = 4 pts, Loss = 1 pt, +1 per set won, +1 for close loss (≤4 games), +1 for big win (≥8 games), Best of 3 sets to 6, tiebreak at 6-6, match tiebreak to 10
- **Confusion or annoyance:** None - the rules are clearly explained
- **Severity:** fine
- **URL:** http://localhost:8790/competitions/[id]

###### 9. Realizing I'm Behind on Match Play
- **Goal:** Assess my progress in the league
- **Action:** Checked standings and saw that week 1 is already done with 17 matches played, and I haven't played any yet
- **Outcome:** I'm currently:
  - Women's Singles: 7th place (last) in Division 2 with 0 matches played
  - Women's Doubles: 3rd place in Division 1 with 0 matches played
  - Mixed Doubles: 3rd place in Division 1 with 0 matches played
- **Confusion or annoyance:** Mild concern. I'm last in Women's Singles and haven't played any matches while everyone else has had their week 1 games. The season is 10 weeks long, so there's still time, but I'm definitely starting from behind. This is partly my fault for signing in late, but the website could have been clearer that sign-in needed to happen immediately.
- **Severity:** minor
- **URL:** http://localhost:8790/competitions/[id] (standings tables)

###### 10. Observing Partner and Opponent Status
- **Goal:** Understand the wider context of the league
- **Action:** Reviewed match pages and standings to see who else has played
- **Outcome:** Key observations:
  - Dana Park (my Women's Doubles partner) has already played Mixed Doubles with Kofi West (won 6-1, 6-1 vs Dominic/Jade)
  - Jade Hart / Zoe West (my Women's Doubles opponent) had to retire from their match against Anna Evans / Ella Doyle
  - Anna Evans leads both Women's Singles and Women's Doubles with multiple wins
  - Most people who have played did so on Friday 4 October
- **Confusion or annoyance:** None - this context is useful for understanding the league
- **Severity:** fine
- **URL:** http://localhost:8790/competitions/ (various)

##### Overall Assessment

The league website itself is **well-designed and easy to use**. The interface is clean, information is well-organized, and all necessary contact details are readily available. However, there are friction points around:

1. **Onboarding timing** - The initial announcement to "sign in this week" isn't urgent enough for some people, leading to late sign-ins
2. **Match coordination** - No built-in scheduling system means players have to coordinate entirely through external channels, which is inefficient
3. **Communication clarity** - Score entry rules need to be more prominent (not just in announcements), and it's unclear whether people are avoiding scheduling or just unwilling to commit on Sunday
4. **Starting late** - Getting a sign-in link on Friday of week 1 means you're already behind on matches

**If I were advising the coach:**
The website is solid, but Helen should send the sign-in links proactively (rather than waiting for people to ask), and she should consider adding a simple "propose a match" feature or at least a message board where players can post availability. The score entry page should have a more prominent warning about name order, not just a reminder in announcements.

### Hannah Cole

#### Hannah's Friction Log - Checkpoint s1-w1
##### Sunday 11 October 2026

###### 1. Unclear New Season Start Date
- **Goal:** Understand when I'd be able to start playing in the league
- **Action:** Signed in and read the home page
- **Outcome:** Learned results close 13 December, and I'll be placed "next season" starting after that date
- **Confusion:** The site never says WHEN the new season actually starts. Do I start playing on 14 December? January? I'm left guessing.
- **Severity:** Painful
- **URL:** /

###### 2. No Website Information About Social Sessions
- **Goal:** Find out when and where social sessions are held (Helen mentioned them)
- **Action:** Looked through the website pages and the home page
- **Outcome:** No information about social sessions, times, or how to join them
- **Confusion:** Helen said "come along to club social sessions" but I don't know when they are! I'd have to ask her separately, which is awkward.
- **Severity:** Painful
- **URL:** /

###### 3. Sign-In Link Time Limit
- **Goal:** Get onto the website to see my status
- **Action:** Clicked the sign-in link in the email
- **Outcome:** Successfully signed in, but I noticed the link expires in 15 minutes
- **Confusion:** If I'd been busy or hadn't checked email immediately, I'd have had to ask for another link. Makes me feel pressured.
- **Severity:** Minor
- **URL:** (email, not website)

###### 4. Had to Use WhatsApp to Confirm My Level
- **Goal:** Tell the coach what standard I play at (as she requested)
- **Action:** Used WhatsApp to send Helen my playing level
- **Outcome:** Sent successfully, but this is outside the website
- **Confusion:** The website doesn't have a way to enter my level or respond to coach questions - I had to use WhatsApp instead
- **Severity:** Minor
- **URL:** / (messaging via WhatsApp instead)

###### 5. "Do Nothing" Is Confusing
- **Goal:** Understand what I need to do next
- **Action:** Read the home page carefully
- **Outcome:** It says "You do not need to do anything now. The coach will be in touch when your place and fixtures are ready."
- **Confusion:** Do I check back next week? Will Helen message me? How will I know when something changes? It feels like I should be checking the site regularly but also that I shouldn't need to.
- **Severity:** Minor
- **URL:** /

##### Overall Impression

The website was easy to sign into and clearly shows me where I stand (approved, waiting, will be in bottom division). But there are some gaps that leave me feeling anxious:

- I don't know the exact date the new season starts, just that it's sometime after 13 December
- I don't know when I'll be assigned to a division or how I'll be notified
- I have no way to find out about social sessions to play in the meantime
- Important information about next steps seems to be communicated via WhatsApp rather than the website

I'd tell the club: It would help to have clearer dates (exactly when does the new season start?) and more visibility about opportunities to play socially while I'm waiting. Maybe add a page with social session times, or at least let players fill in their playing level through the website rather than having to message the coach.

The website itself is clear and well-organized - my frustration is about missing information rather than confusing design.

---

## Checkpoint s1-w5

### Helen Marsh (coach)

#### Friction log: Helen Marsh (coach), s1-w5, Sunday 8 November 2026

The session had a short break partway through when the website went offline. When it came back, nothing I'd saved had been lost.

1. **Seeing the backlog at a glance**
   - **Goal:** Find out what had piled up over four weeks.
   - **Action:** Dashboard, then the link "4 results disputed, 44 results waiting on the other side".
   - **Outcome:** The headline counts were clear. The per-competition tables are good, but the long "What the columns mean" box is repeated five times.
   - **Confusion or annoyance:** It said "Results close in 70 days". It's 8 November and the deadline is 13 December, so that's 5 weeks. Every waiting result said "has not answered in less than a day" and "since 4 Oct", even though members had been waiting weeks. I couldn't tell which results were stale.
   - **Severity:** painful
   - **URL:** /coach, /coach/results

2. **Working through 44 waiting results one at a time**
   - **Goal:** Clear the waiting queue.
   - **Action:** Results, then open each match, "Use X's entry", choose a reason, "Review decision", "Save coach decision".
   - **Outcome:** It worked every time, and the review screen showing the effect on the table is reassuring. But it takes about 4 clicks per match. Only the first 8 waiting results show who entered what. The other 36 are bare names, so you have to open each one just to see whether the loser or the winner entered it.
   - **Confusion or annoyance:** At this club's size I need a way to confirm, in one go, all the results that the losing side entered (those are safe) or that have waited more than X days. I ended up asking players one by one.
   - **Severity:** painful
   - **URL:** /coach/results, /coach/matches/{id}

3. **Member complaints that had already sorted themselves out**
   - **Goal:** Reply to members chasing unconfirmed results.
   - **Action:** Looked for each match on "Find a match".
   - **Outcome:** Four of the seven complaints were already confirmed. "Find a match" has no search by name, only a status filter and 50 per page across 314 matches. I had to page through and scan.
   - **Confusion or annoyance:** I want to type a player's name and see their matches.
   - **Severity:** painful
   - **URL:** /coach/matches

4. **Disputes**
   - **Goal:** Settle 4 (later 6) disputes.
   - **Action:** Phoned the players, then used "Use X's entry" with reason "The sides entered different results".
   - **Outcome:** The side-by-side "set 2: A says 7-5, B says 7-6" display is excellent. Five were settled quickly. One (Byrne v Nowak) is word against word about who won the match tiebreak, so I asked them to replay it.
   - **Confusion or annoyance:** The "Players in repeated disputes" box is a nice touch. New disputes kept appearing while I worked, which was fine.
   - **Severity:** fine
   - **URL:** /coach/results

5. **The played date on coach decisions**
   - **Goal:** Record results correctly.
   - **Action:** Reviewed the decision screen.
   - **Outcome:** "Played on" filled itself with 4 Oct for matches played in weeks 2 to 5. The tables show every match as "4 Oct".
   - **Confusion or annoyance:** The results history looks wrong to players.
   - **Severity:** minor
   - **URL:** /coach/matches/{id}

6. **Withdrawing a player who left and an injured player**
   - **Goal:** James Hale has moved to Leeds and Sofia Marin is out for the season, so their remaining matches shouldn't hang about.
   - **Action:** Members, then "Left the club…" for James. I looked on Season, Tables and Members for a withdraw option.
   - **Outcome:** "Left the club" only takes him out of future drafts: "you can still decide the rest". There was nothing on the coach site to withdraw a player or pair from the running season, so I had to ask the coding agent to withdraw 5 entries. That worked, and the remaining matches became walkovers.
   - **Confusion or annoyance:** Injuries and leavers happen every season. This should be a button next to the member: "Withdraw from this season's competitions".
   - **Severity:** blocker (on the website)
   - **URL:** /coach/members, /coach/season

7. **Join requests nearly expired**
   - **Goal:** Approve Ravi Menon and Nora Quill.
   - **Action:** Members, then "Approve and email sign-in link".
   - **Outcome:** Both approved. Each request said "deleted 3 Nov 2026 if not decided". That's before today, so had the dates been real they would have vanished while I was away, with no warning.
   - **Confusion or annoyance:** A volunteer who checks in monthly needs a reminder, or no silent auto-delete.
   - **Severity:** painful
   - **URL:** /coach/members

8. **Finding one member on the Members page**
   - **Goal:** Set Hannah Cole's level, find James Hale, add a phone number.
   - **Action:** Members page (150+ members, each with 5 or 6 forms).
   - **Outcome:** The page is enormous. The name links at the top just jump down the same page. There's no search, and no confirmation after saving a level or phone number; the page just reloads.
   - **Confusion or annoyance:** I'd like a name search and a "Saved" message.
   - **Severity:** painful
   - **URL:** /coach/members

9. **A wrong phone number can't be removed**
   - **Goal:** Fix Scott Thorne's number after I'd saved the wrong one (it was Dmitri's).
   - **Action:** Cleared the telephone box and saved.
   - **Outcome:** "Contacts not saved: enter a valid email address and telephone number." Now two members share one number, and players will see the wrong number for Scott.
   - **Confusion or annoyance:** I need to be able to clear a field.
   - **Severity:** painful
   - **URL:** /coach/members/{id}/contacts

10. **Sign-in link shown once and lost on Back**
    - **Goal:** Get personal links to Kofi West and Robbie Edwards through their partners.
    - **Action:** Pressed "Sign-in link", made the next link, then went Back.
    - **Outcome:** The first link was gone ("not shown again"), so I had to make another one.
    - **Confusion or annoyance:** I also can't tell whether a link went to the right person. Dana replied "got it, signed in", and Kofi still shows as not signed in.
    - **Severity:** minor
    - **URL:** /coach/members?show=unsigned

11. **Chase list**
    - **Goal:** Find who's behind on matches.
    - **Action:** Chase list.
    - **Outcome:** Useful: short-of-minimum counts, plus scores to confirm per player. But it runs to 24,000 characters, one section per division. A player in three competitions appears three times, and only emails are shown, no phones.
    - **Confusion or annoyance:** I'd like one line per person, sorted by most behind, with their phone.
    - **Severity:** minor
    - **URL:** /coach/chase

12. **Players can't reach opponents who have no contact details**
    - **Goal:** Chase Hugo Dale and Zak Osei (0 matches played).
    - **Action:** WhatsApp.
    - **Outcome:** Both say they don't have numbers for several opponents. Many members are missing a phone number, so the site can't help them arrange matches.
    - **Confusion or annoyance:** Not really the site's fault, but there's no way to nudge a player to add their own phone number.
    - **Severity:** minor
    - **URL:** /coach/members

13. **Weather**
    - **Goal:** Check whether the forecast works yet.
    - **Action:** Weather page.
    - **Outcome:** It still says "The forecast could not be fetched just now", five weeks on.
    - **Severity:** minor
    - **URL:** /coach/weather

Overall: once I'm on a match page, the site is good at the fiddly decisions. The previews and the dispute comparisons make me feel safe. Coming back after four weeks at a 150-member club was hard work, though. There's no search, no bulk confirming, no withdraw button, the dates and waiting times on screen were wrong, and the Members page is a wall of forms. I'd tell the club it does the job if the coach logs in weekly. Someone needs to add a withdraw-from-season button and a name search before the next season.

### Marcus Bell

#### Marcus Bell - Friction Log (s1-w5)
##### Sunday 8 November 2026, Week 5 of Season 1

###### 1. Result Confirmation Form Labels

**Goal:** Confirm 7 pending match results from my diary

**Action:** Navigated to each match and filled in the score entry form with set scores

**Outcome:** All 7 results confirmed successfully and immediately counted toward standings

**Confusion or annoyance:** The form columns are labeled "You" and opponent name, but I had to be careful about the order - Helen's warning message said the fields follow the name order on the match page, not "my score first". This was explained clearly in the announcement, but it's still a potential pitfall for someone who doesn't read carefully.

**Severity:** Minor - the announcement made it clear and I didn't make mistakes

**URL:** `/matches/01a10688-bc8f-7112-9dbe-f86180d350b3#report`

---

###### 2. Missing Contact Details for Some Players

**Goal:** Arrange remaining matches with opponents

**Action:** Looked up contact details on the match pages to reach out to opponents

**Outcome:** Could reach Rory Kelly, Euan Osei, and Callum Hall, but Gavin Evans and Kofi West had no contact info on file

**Confusion or annoyance:** The website says "No contact details: ask the coach" for players without contact info. This means I can't independently arrange matches with them - I have to involve the coach as a middleman, which delays things.

**Severity:** Painful - creates friction for match scheduling with certain players

**URL:** `/matches/01a10688-bc8f-76ba-b062-3712d4f14ab6` and `/matches/01a10688-c2c3-7ccf-a681-6e98c22cefc9`

---

###### 3. Date Field Lock on Results

**Goal:** Enter match results with accurate dates

**Action:** Submitted result forms with dates set to 2026-10-04 (the default)

**Outcome:** All results recorded as played on 4 Oct 2026, despite being from weeks 2-5

**Confusion or annoyance:** The date field shows "max 2026-10-04" which locks it to the season start date. I wasn't sure if this was intentional, but it resulted in all my results being recorded with an early October date when they should reflect weeks 2-5 (around mid-October and later).

**Severity:** Minor - doesn't affect point calculations, but creates incorrect historical record

**URL:** `/matches/01a10688-bc8f-7112-9dbe-f86180d350b3#report`

---

###### 4. No Visual Way to See Fixture Schedule in One Place

**Goal:** See all my remaining matches at a glance

**Action:** Navigated between the home page and the competition page

**Outcome:** Had to click through to the full competition/division page to see my complete fixture list and who I still need to play

**Confusion or annoyance:** The home page shows "To play (3)" with match names, but only as links. I had to navigate to the competition page to see the full context and check standings. A dedicated "fixture schedule" view would be clearer.

**Severity:** Minor - the information is there, just requires navigation

**URL:** `/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b#mine`

---

###### 5. Immediate Standing Updates

**Goal:** Track my position in the league as I confirm results

**Action:** Navigated back to home page after each result confirmation

**Outcome:** Standings updated in real-time showing my current points and division position

**Confusion or annoyance:** None

**Severity:** Fine - the website is responsive

**URL:** `/`

---

###### 6. Clear Point Calculation Breakdown

**Goal:** Understand how points are awarded

**Action:** Reviewed the standings page which explains point calculation rules

**Outcome:** Points system is clearly documented - win/loss base points, plus additional points for sets won, close losses, and big wins

**Confusion or annoyance:** None

**Severity:** Fine - excellent documentation

**URL:** `/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b#mine`

---

###### 7. Match Arrangement Process Requires Multiple Tools

**Goal:** Arrange remaining matches quickly

**Action:** Used WhatsApp/email/text messaging to contact players; would have preferred a "request match" feature in the website

**Outcome:** Successfully arranged 3 double matches for Sunday at 2 PM; single match with Gavin Evans still pending due to lack of contact details

**Confusion or annoyance:** The website doesn't have a built-in way to request matches or send messages. I have to use external messaging. It would be helpful if the website had a "message player" feature or "request match" button.

**Severity:** Painful - adds friction to the match arrangement workflow

**URL:** N/A (multi-page process)

---

###### 8. Efficient Result Confirmation When Both Sides Have Entered

**Goal:** Confirm scores and have them count

**Action:** Checked the match pages and submitted my scores

**Outcome:** When I entered a result that matched what the opponent had submitted, the system immediately confirmed it as counting

**Confusion or annoyance:** None

**Severity:** Fine - the workflow is smooth once both sides have entered

**URL:** `/matches/01a10688-bc8f-7112-9dbe-f86180d350b3?done=confirmed`

---

##### Summary

Overall, the league website is well-designed and functional. The core features work smoothly - viewing standings, entering results, and confirming scores. The main friction points are:

1. **Players without contact details create a bottleneck** - Gavin Evans and Kofi West have no phone/email on file, making it impossible to arrange matches independently
2. **Match arrangement is entirely outside the website** - I had to use phone/email/WhatsApp, not the website itself
3. **Date field limitation** - Results are locked to the season start date

The website is definitely an improvement over the old system, and I'm happy with how it tracks standings and results. The key improvement would be either (a) getting everyone's contact details into the system, or (b) adding a built-in messaging/match request feature to the website.

I'm currently 1st in Men's Singles Division 1 with 24 points from 6 matches, and 2nd in Men's Doubles with 16 points from 3 matches (with 3 more to play). If I win my remaining matches, I should be in great shape for the end of season.

### Tomasz Nowak

#### Friction Log - Checkpoint s1-w5 (8 Nov 2026)

##### Notable Issues

###### 1. Entering Match Results (Malik Fox)
- **Goal:** Confirm my win against Malik Fox (6-4, 6-0)
- **Action:** Clicked "Enter result" link, filled form with sets won
- **Outcome:** Result confirmed immediately - both players had entered matching scores
- **Confusion or annoyance:** None - clear, straightforward form with good labels
- **Severity:** Fine
- **URL:** /matches/01a10688-be3d-718b-aaf9-06a7e816dda5

###### 2. Entering Match Results (Malik Rose)
- **Goal:** Confirm my loss to Malik Rose (3-6, 4-6)
- **Action:** Clicked "Enter result" link, filled form with sets
- **Outcome:** Result confirmed immediately - both players' scores matched
- **Confusion or annoyance:** None - clear form entry
- **Severity:** Fine
- **URL:** /matches/01a10688-be3d-73b0-bd67-223e0f3b5fea

###### 3. Entering Match Results with Retirement (James Hale)
- **Goal:** Confirm my win vs James Hale where they retired (6-2)
- **Action:** Changed outcome from "completed" to "retired", selected "them" as who retired, entered 6-2
- **Outcome:** Result confirmed and marked correctly with "James Hale retired" notation
- **Confusion or annoyance:** None - the form handled retirement case well
- **Severity:** Fine
- **URL:** /matches/01a10688-be3d-73b8-9a15-aa65e06f69e0

###### 4. Disputed Score with Callum Byrne (continued issue)
- **Goal:** Get clarification on conflicting scores with Callum Byrne (I said 6-4, 3-6, 10-8 won, he entered something different)
- **Action:** Called Callum, then sent WhatsApp asking for clarification
- **Outcome:** Coach Helen had already messaged saying we both claim we won the tiebreak 10-8, and we need to replay just that tiebreak by 22 Nov
- **Confusion or annoyance:** Frustrating that Callum acted like he didn't know what match I meant at first. Would have been clearer if the site showed me his exact score entry to understand the notation issue
- **Severity:** Painful
- **URL:** /matches/01a10688-be3d-7567-9d0a-56387da90f45

###### 5. No Visibility into Opponent's Score Entry
- **Goal:** Understand what score Callum Byrne actually entered to diagnose the mismatch
- **Action:** Clicked into match page showing "entries do not match" message
- **Outcome:** Page only showed my entry and explanation, not his actual submission. Had to contact him outside the app to find out
- **Confusion or annoyance:** This makes debugging score disputes very difficult. If I could see both entries side-by-side, it would be obvious whether we're using different notation or if someone really does disagree on the result
- **Severity:** Painful
- **URL:** /matches/01a10688-be3d-7567-9d0a-56387da90f45

###### 6. Checking My Overall Standing
- **Goal:** See where I stand in Division 3 with my new results entered
- **Action:** Clicked on "Men's Singles Division 3" to view standings table
- **Outcome:** Moved from 8th (0 pts) to 5th (11 pts) with my 3 results confirmed. Clear table showing all players, wins/losses, games, points
- **Confusion or annoyance:** None - standings are very clear
- **Severity:** Fine
- **URL:** /competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

###### 7. Arranging Match with Hugo Collins
- **Goal:** Schedule a match with Hugo Collins
- **Action:** Clicked on his name in "To play" section, saw his phone contact (07700 902413), sent WhatsApp asking when he's free
- **Outcome:** Hugo replied immediately suggesting Sunday 2pm at Hollins Park. Confirmed the time
- **Confusion or annoyance:** None - clear and smooth
- **Severity:** Fine
- **URL:** /matches/01a10688-be3d-7278-8b70-859334dccd19

###### 8. Arranging Match with Raj Wood (Scheduling Conflict)
- **Goal:** Schedule match with Raj Wood who is also available Sundays
- **Action:** Got his contact info (07700 938520), messaged asking when available
- **Outcome:** Raj suggested same Sunday 2pm, but I already had Hugo booked. Suggested 4pm or different day
- **Confusion or annoyance:** Raj replied with his match history instead of confirming a time. Seems like he may have misunderstood my message or was on autopilot. Still unclear when we'll actually play
- **Severity:** Minor
- **URL:** /matches/01a10688-be3d-7d93-9756-c94804604645

###### 9. Stefan Barnes - No Phone Contact
- **Goal:** Contact Stefan Barnes to arrange match
- **Action:** Clicked on his name in "To play" section
- **Outcome:** Only his email (stefan.barnes@example.net) is shown. No phone number
- **Confusion or annoyance:** I don't use email - I'm WhatsApp only. Can't reach Stefan through my preferred channel
- **Severity:** Painful
- **URL:** /matches/01a10688-be3d-7f95-a8fd-9eec847d5b65

###### 10. Coach Asking for Email Address
- **Goal:** Respond to Helen's request for email address
- **Action:** Sent WhatsApp message explaining I don't really use email, prefer WhatsApp
- **Outcome:** Message sent, no reply yet. Helen clearly wants email but I'm not on email
- **Confusion or annoyance:** The site and coach seem to assume email is primary. I prefer WhatsApp and rarely check email. There should be a way to set communication preference
- **Severity:** Minor
- **URL:** / (home page)

###### 11. No Match Dates in "To Play" List
- **Goal:** See when upcoming matches should be played
- **Action:** Looked at "To play (3)" list on home page
- **Outcome:** Just shows player names with links, no dates or suggested timing
- **Confusion or annoyance:** Would be helpful to know if there's a preferred week to play each match, or if it's all flexible until end of season
- **Severity:** Minor
- **URL:** /

###### 12. Viewing Full League Standings
- **Goal:** See how all divisions are doing
- **Action:** Navigated to tables page and scrolled through Division 1-4
- **Outcome:** Can see all divisions with full stats, clear rankings, games won/lost, points
- **Confusion or annoyance:** None - very comprehensive
- **Severity:** Fine
- **URL:** /competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

###### 13. Minimum Matches Requirement
- **Goal:** Understand if I need to play more matches to stay in the league
- **Action:** Read the rules at bottom of standings page
- **Outcome:** Need to play at least 4 matches, or all matches if fewer than 4. I've played 3, so need at least 1 more. Still have 4 more to play, so no problem meeting minimum
- **Confusion or annoyance:** None - rule is clear. Still no clarity on when the season ends though - just says "70 days" from now
- **Severity:** Fine
- **URL:** /competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

---

##### Overall Feelings

The site is working well for recording and viewing results. Entering match scores is straightforward and the standings are clear. However, the dispute resolution for conflicting scores is frustrating - you can't see your opponent's actual entry to understand the disagreement, and it requires external coordination. Some players only have email contact info, which doesn't work for me as a WhatsApp-only user. The match arrangement flow is okay but relies on WhatsApp outside the site, and there's no reminder system if someone doesn't confirm. I'd tell the club: fix the score dispute view to show both entries side by side, let players set communication preferences (WhatsApp, email, phone), and maybe add suggested week-by-week match schedules to help organize the season better.

### Grace Adeyemi

#### Grace's Friction Log - Checkpoint s1-w5

##### 1. Score Entry Form Validation Error

**Goal:** Enter the Kofi West / Dana Park Mixed Doubles result (0-6, 6-4, 4-10)

**Action:** Filled form with sets 1-3 scores and submitted

**Outcome:** Form rejected with error "set 3: the match was already won". Later re-submission with reversed interpretation (6-0, 4-6, 4-10) was accepted and confirmed.

**Confusion or annoyance:** The form validation doesn't clearly explain the rules for when a set 3 is required. I had to guess that switching the first two sets from 0-6, 6-4 to 6-0, 4-6 would make sense for a match that went to tiebreak, but the error message was cryptic.

**Severity:** Painful

**URL:** /matches/01a10688-c57a-74a5-9bb2-f05234dfdc02#report

---

##### 2. Date Field Constraint Too Restrictive

**Goal:** Enter match dates for week 5 matches (played around Nov 1-8)

**Action:** Attempted to set match date to 2026-11-01 and 2026-10-25

**Outcome:** Form showed "max 2026-10-04" in the date field constraint, suggesting the date limit wasn't updated for week 5 matches. Entries were accepted anyway but the constraint message was confusing.

**Confusion or annoyance:** The form made it seem like I couldn't enter dates for week 5 when I actually could. This suggests a bug in the form's max date validation.

**Severity:** Minor

**URL:** /matches/01a10688-c439-7a2e-9e27-8a9e63dffc8b#report

---

##### 3. Score Discrepancy with Opponent

**Goal:** Confirm the Dana Park / Sofia Marin Women's Doubles score from week 2

**Action:** Entered 6-2, 6-7, 4-10 based on my recollection. Sofia Marin messaged saying she had 2-6, 7-5, 10-4 (her games first).

**Outcome:** Score was marked as confirmed even though Sofia reported set 2 was 5-7 (not 6-7). The system counted my entry as valid despite the apparent mismatch. Unclear if Sofia later corrected her entry to match mine or if the discrepancy was overlooked.

**Confusion or annoyance:** When opponent scores don't match, it's stressful not knowing whether my memory is wrong or if they are. The system allowed the result to count without getting full agreement. I'm still unsure which score was correct.

**Severity:** Painful

**URL:** /matches/01a10688-c439-7e7a-be3a-462147048d88

---

##### 4. Scheduling Conflicts Not Prevented

**Goal:** Arrange Women's Doubles matches with Vera and Emily Hale

**Action:** Vera offered Sunday at 2pm. Then separately, Emily Hale also offered Sunday at 2pm. I messaged Emily to propose 4pm instead.

**Outcome:** The website has no built-in conflict detection or central booking system. Two matches were independently proposed for the same time/court without any warning. This could easily cause real problems.

**Confusion or annoyance:** I had to manually track conflicting time slots and negotiate with players. A calendar or booking system would prevent this entirely. This is the kind of problem that would cause people to miss matches.

**Severity:** Painful

**URL:** /matches/01a10688-c439-7a11-9f34-37fec2f0ac64

---

##### 5. Unreliable Message Delivery

**Goal:** Arrange upcoming matches by messaging opponents

**Action:** Sent multiple text/email messages to Vera Cross and Emily Hale with scheduling details and clarifications

**Outcome:** Emily's responses repeated the same "Sunday 2pm" offer twice, without acknowledging my follow-up message about the conflict. This suggests messages either didn't get through or responses weren't being updated. Communication became frustrating and unclear.

**Confusion or annoyance:** I couldn't tell if Emily received my revision or if there was a system lag. This made it impossible to confirm new times or resolve the double-booking. I had to guess whether she got my latest message.

**Severity:** Painful

**URL:** N/A (messaging system)

---

##### 6. Unreachable Mixed Doubles Partner

**Goal:** Schedule remaining Mixed Doubles matches

**Action:** Tried to reach Robbie Edwards through the website and asked Helen Marsh for his contact details

**Outcome:** Robbie Edwards has no contact information on file. Despite having already played 2 matches with him, there's no way to contact him to arrange future matches. Helen said she's been trying to track him down since week 1.

**Confusion or annoyance:** It's surreal to be playing matches with someone I can't contact. I have no idea how future matches will be arranged. This is a blocker for scheduling 3 remaining Mixed Doubles matches and means I might not be able to fulfill the "4 matches minimum" requirement if Robbie can't be reached.

**Severity:** Blocker

**URL:** /competitions/01a10688-c4ee-7f4f-a42b-75b78c19545e

---

##### 7. Confusing Score Notation

**Goal:** Understand and enter match results correctly

**Action:** Entered Women's Doubles scores using "my games first" notation, but the form presentation used "You vs. Opponent" columns

**Outcome:** Entries were accepted, but Helen's week 1 announcement specifically warned about "two results came in the wrong way round" because players misunderstood the column order. The notation is not intuitive.

**Confusion or annoyance:** The website uses two different score notations - the form shows "You vs. Them" columns, but messages and announcements use "my games first" notation. This is confusing and error-prone even though my entries ended up correct.

**Severity:** Minor

**URL:** /matches/01a10688-c439-7e7a-be3a-462147048d88#report

---

##### Overall Impression

The league website is functional for basic operations (viewing standings, confirming results) but lacks features that would make match coordination smooth. The score entry worked once I understood the format, but missing coordination features (calendar, messaging reliability, unreachable players) create friction. The system allows mismatches and double-bookings without preventing them.

As a nurse working night shifts trying to coordinate doubles matches, I'm frustrated by the scheduling conflict I can't resolve within the app, messages that don't seem to get through, and a partner I can't reach. The minimum 4-match requirement feels risky when I can't guarantee all my partners can be contacted. The website feels like it was designed for clubs where everyone knows each other and can figure things out in person, not for apps that should make remote coordination easier.

What I'd tell the club: Add a simple match booking calendar that prevents double-booking. Make sure contact details are required before players can be added to the league. Add a message read-receipt system so I know if someone got my message. And for goodness sake, track down Robbie Edwards or let his teammates know how to reach him.

### Derek Mills

#### Derek Mills - Friction Log - Checkpoint s1-w5 (Sunday 8 November 2026)

##### Friction Log Entries

**Goal:** Enter three overdue match scores from weeks 3 and 5  
**Action:** Opened website (already signed in), navigated to "Needs your answer" section, clicked "Enter result" links for each match  
**Outcome:** All three scores entered successfully and confirmed immediately (opponents' results matched)  
**Confusion or annoyance:** None - straightforward process  
**Severity:** Fine  
**URL:** http://localhost:8790 (matches pages)

---

**Goal:** Remember the exact scores from matches played several weeks ago  
**Action:** Relied on match diary entries and entered scores from memory  
**Outcome:** Scores were correct and matched opponent submissions  
**Confusion or annoyance:** None, but had to hunt through diary to recall exact scores  
**Severity:** Minor  
**URL:** http://localhost:8790/matches/[match-id]

---

**Goal:** Understand which score goes in which box on the score entry form  
**Action:** Observed the form layout showing "You" and opponent name  
**Outcome:** Clear and unambiguous - entered scores correctly on first try  
**Confusion or annoyance:** Helen's earlier email warned about "enter scores in the order the NAMES are shown, not 'my score first'" - that warning turned out to be important and well-heeded  
**Severity:** Fine  
**URL:** http://localhost:8790/matches/[match-id]#report

---

**Goal:** Check current league standings after entering scores  
**Action:** Clicked on "Tables" link from main page  
**Outcome:** Saw comprehensive standings for all divisions with full match histories  
**Confusion or annoyance:** The tables page is long and shows a lot of information - somewhat overwhelming but comprehensive  
**Severity:** Minor  
**URL:** http://localhost:8790/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

---

**Goal:** Stay on top of my league commitments  
**Action:** Checked email inbox - no new messages requiring action  
**Outcome:** No new requests from coach or other players  
**Confusion or annoyance:** None  
**Severity:** Fine

---

##### Summary

The website works well for score entry and is quite usable even for someone like me who isn't particularly keen on new tech. The flow is logical: sign in, see what's pending, click through to enter scores, get confirmation. No passwords to remember or confusing steps. My only hesitation is that I tend to be slow getting round to these things, but the website itself makes it easy once you're ready.

The standings are comprehensive but the page is very long - might be helpful to have them broken down or paginated, though I can navigate it fine. The coach's communication about score ordering was helpful. Overall, the site does what it's supposed to do and stays out of your way. I'll use it.

### Sofia Marin

#### Sofia's Friction Log - Checkpoint s1-w5 (Sunday 8 November 2026)

##### Friction Entry 1: Score Mismatch with Vera Cross / Grace Adeyemi (Women's Doubles)
**Goal:** Confirm the Women's Doubles result from 4 Oct (my diary says 2-6, 7-6, 10-4)
**Action:** Clicked "Enter result" link on home page, form showed 2-6, 7-5, 10-4 (not 7-6), submitted match result
**Outcome:** System confirmed my entry but says "entries do not match" - their entry is hidden from me and I can't see what score they recorded
**Confusion or annoyance:** I'm confused about whether I recorded the wrong score in my memory, or whether the form defaulted incorrectly. The website won't tell me what score Vera and Grace entered, so I can't figure out where the discrepancy is. I tried emailing Vera but got a generic response ("Yes, let's do it...") that didn't answer my question. Feels like the score dispute is unresolvable from my side.
**Severity:** painful
**URL:** /matches/01a10688-c439-7e7a-be3a-462147048d88

##### Friction Entry 2: Score Mismatch with Gavin Evans / Phoebe Lane (Mixed Doubles)
**Goal:** Enter the Mixed Doubles result from 4 Oct where we lost 2-6, 3-6
**Action:** Clicked "Enter result" for Mixed Doubles match, submitted 2-6, 3-6
**Outcome:** System says "entries do not match" but won't show me what Gavin and Phoebe entered. Match stuck in mismatch state.
**Confusion or annoyance:** Same problem as above - I can't resolve the mismatch because I can't see their score. When I messaged Phoebe, she said "I don't think we're drawn against each other in the league?" which suggests she either doesn't remember the match or is confused. This is frustrating because I clearly played this match (it's in my diary) but now I can't get confirmation.
**Severity:** painful
**URL:** /matches/01a10688-c57a-7184-b9f1-da909f8f4cf8

##### Friction Entry 3: Invisible Opponent Score Entries Block Dispute Resolution
**Goal:** Resolve two score mismatches (Vera Cross WD and Gavin Evans MD)
**Action:** Tried to view match pages and see what scores opponents entered
**Outcome:** Match pages show "Opposing submissions stay private" - I can't see their entries at all
**Confusion or annoyance:** This is a catch-22. The system tells me the scores don't match, but won't show me what they entered, so I can't figure out how to fix it. I can't even ask "did you enter 2-6, 3-6?" because I'm supposed to reach out to them separately, but when I do (via WhatsApp/email), they don't give me useful answers or seem to not remember the match.
**Severity:** blocker
**URL:** Multiple match pages

##### Friction Entry 4: Messaging Players About Scores Doesn't Work Well
**Goal:** Reach out to players (Vera Cross, Grace Adeyemi, Phoebe Lane) to clarify score mismatches
**Action:** Sent WhatsApp to Grace Adeyemi, email to Vera Cross, WhatsApp to Phoebe Lane, asking what score they recorded
**Outcome:** Vera responded with a generic "Yes, let's do it - how about Sunday 2pm?" response (not relevant to my question). Phoebe said "I don't think we're drawn against each other?" (confusion). Grace hasn't replied. Arjun also gave a generic response about playing Sunday.
**Confusion or annoyance:** The messaging system seems broken or the players aren't reading the full context. I'm asking specific questions about scores but getting back responses about scheduling or denying they played the match. It's unclear whether they're just being casual, whether they're genuinely confused, or whether the messaging got garbled.
**Severity:** painful
**URL:** /

##### Friction Entry 5: Taking a Break Was Straightforward
**Goal:** Pause my league participation due to injury and communicate this to the league
**Action:** Clicked "I am taking a break" button on home page
**Outcome:** System confirmed "Done. You are on a break, and the coach will see it." Page updated to show pause status.
**Confusion or annoyance:** None - this feature worked exactly as expected. I appreciate that the league site has an explicit "break" option that's different from permanently leaving or playing injured.
**Severity:** fine (no issue)
**URL:** /

##### Friction Entry 6: Score Entry Form Confusion (7-5 vs 7-6)
**Goal:** Enter an accurate result for the Vera Cross match
**Action:** Form appeared with 2-6, 7-5, 10-4 pre-filled (but my diary said 7-6 in set 2)
**Outcome:** I submitted what the form showed (7-5) but now I'm unsure if that was the actual score or if the form had an error
**Confusion or annoyance:** I don't know if the mismatch is because the form picked the wrong default, or because Vera actually beat me 7-5 (not 7-6), or because I misremembered. The form should either let me see what I *actually* recorded, or help me remember clearly (e.g., "you previously said 7-6, Vera said 7-5").
**Severity:** minor (affects past match, but contributes to confusion)
**URL:** /matches/01a10688-c439-7e7a-be3a-462147048d88

---

##### Overall Summary

Sofia's experience with the league site this week was dominated by an unavoidable injury that requires stepping back from the league. The injury management itself was smooth - the "take a break" feature worked well and clearly communicated her status to the league.

However, Sofia encountered significant friction with score confirmation and dispute resolution. Two of her past matches have score mismatches that can't be resolved because the website won't show her what scores the opponents recorded. When she tried to reach out via WhatsApp and email to clarify, she got either generic responses or confusion from the players, making it impossible to sort out what happened.

The core issue: **score disputes are unsolvable from a player's perspective** because opponent entries are hidden. A keen, organised player like Sofia wants to get every detail right, but the league site prevents her from doing so. The messaging system also seems limited - players give generic responses rather than understanding specific questions about match details.

**Recommendation to the club:** For score disputes, either (1) show both entries on the mismatch page so players can see where the discrepancy is, or (2) require player entry comments/explanations so disputes can be resolved, or (3) provide a direct dispute resolution flow in the app rather than making players message each other outside the system.

### Hannah Cole

#### Hannah's Friction Log - Checkpoint s1-w5 (Sunday 8 November 2026)

##### 1. No communication for 4 weeks

**Goal:** Understand when I'll get placed in a division and what happens next

**Action:** Checked my email inbox and WhatsApp; last contact from Helen was in week 1. Tried calling Helen to ask about placement timeline; no answer. Sent WhatsApp to Helen asking for update on placement.

**Outcome:** No new messages. Call to Helen went unanswered. WhatsApp sent but no response yet.

**Confusion or annoyance:** I'm approved and keen to play, but I haven't heard from the coach in a month. I don't know if I've been forgotten, if there's a problem, or if this is normal. It's making me feel uncertain about whether I'm really expected.

**Severity:** painful

**URL:** N/A (phone/messaging)

---

##### 2. Website doesn't show next season information

**Goal:** Find out when next season starts and what to expect

**Action:** Visited the league website homepage and tables pages

**Outcome:** The site says "Next season's name and dates have not been announced yet" - same as when I signed up in week 1. Also says "You do not need to do anything now."

**Confusion or annoyance:** It's been a month and there's still no info on next season. I don't know if I should be doing something, practising, or just waiting. The "don't do anything" message feels a bit dismissive when you're a new member eager to get involved.

**Severity:** painful

**URL:** http://localhost:8790

---

##### 3. No visibility into social sessions mentioned by coach

**Goal:** Join social sessions that Helen mentioned to meet other players

**Action:** Explored the website looking for social session info or club calendar

**Outcome:** No mention of social sessions anywhere on the public site. I would have to already know the coach's phone number and ask directly.

**Confusion or annoyance:** Helen said "come along to club social sessions" but didn't tell me when or where they are, and the website has no info about them. If I didn't have her number from my phone, I'd have no way to find out.

**Severity:** painful

**URL:** http://localhost:8790

---

##### 4. Can't contact club from website

**Goal:** Reach the coach or club if I have questions

**Action:** Looked for a contact page, about page, or messaging feature on the website

**Outcome:** No contact info, email, phone, or messaging system on the website. Only way to contact is if you already have the coach's phone number.

**Confusion or annoyance:** The website is for managing the league but has no way to contact the people running it. If I'd lost Helen's number or forgot to save it, I'd be stuck.

**Severity:** painful

**URL:** http://localhost:8790

---

##### 5. Mixed signals about what to do while waiting

**Goal:** Understand what I should be doing as an approved new member waiting for placement

**Action:** Signed in to website, read the homepage

**Outcome:** Homepage says "You do not need to do anything now. The coach will be in touch when your place and fixtures are ready." But no timeline given, no next steps suggested, and no way to get social play in the meantime even though coach mentioned it.

**Confusion or annoyance:** I'm keen to get involved but the site is essentially telling me to do nothing and wait. The coach mentioned social tennis but I have to know to ask her for details. Feels like new players are left in limbo.

**Severity:** minor

**URL:** http://localhost:8790

---

##### 6. No upcoming matches or schedule visible

**Goal:** See what matches are coming up and understand the pace of the league

**Action:** Browsed the league site tables and tried to find a match schedule or calendar

**Outcome:** Can see current season standings from 4 Oct but no way to see which matches are coming up or when my own matches will be.

**Confusion or annoyance:** As a new member waiting to be placed, I can't see what a typical match schedule looks like. I see Division 4 women have a lot of matches already (4-6 weeks in) but I don't know if they're all played at once or spread throughout the season.

**Severity:** minor

**URL:** http://localhost:8790/competitions/01a10688-bf18-7832-a61c-1521e5436dd5

---

##### Summary

The website itself is clear and well-organized for members actively playing in the league, but it leaves new members approved but waiting for placement in a difficult position. I was told in week 1 to come to social sessions, but there's no info on the site about them. I've heard nothing from the coach for 4 weeks, which is worrying. The site keeps saying "don't do anything, we'll contact you" but it's hard to be patient without a timeline or a way to stay engaged. I'm still keen to play, but I'm starting to wonder if I should follow up more aggressively or if this is normal. A simple calendar of next season's dates, or a way to message the coach through the website, would make a big difference.

---

## Checkpoint s1-w9

### Helen Marsh (coach)

#### Friction log, s1-w9 (Sunday 6 December 2026, one week before results close). Helen Marsh, coach

1. **Goal:** See how long is left before results close.
   **Action:** Dashboard, Season tab and Chase list.
   **Outcome:** Every page said "Results close in 70 days (Sun 13 Dec)", the Chase list said "70 days left" on every division, and every entry and decision was stamped "4 Oct 2026". Elsewhere the site said "has not answered in less than a day".
   **Confusion or annoyance:** It's a week away, not 70 days! The "Deadline within 7 days" button on the Chase list would be no use to me if the site thinks it's October. I trusted the date in brackets and ignored the count. It might be the test copy and not the real site, but it shook my confidence.
   **Severity:** painful
   **URL:** /coach, /coach/chase, /coach/season

2. **Goal:** Settle the two disputes.
   **Action:** Results > dispute > phoned the players > "Use X's entry" > reason "sides entered different results" > Review > Save.
   **Outcome:** Both settled in a few minutes. On Euan v Rory the site told me "same score reversed: one side may have entered its own games first", which was exactly what had happened. The review screen showing points and the minimum before saving is reassuring.
   **Confusion or annoyance:** None. This is the best part of the site.
   **Severity:** fine
   **URL:** /coach/results, /coach/matches/…

3. **Goal:** Answer Callum Byrne, who said his match against Tomasz "still isn't showing as confirmed".
   **Action:** Looked for a search box on "Find a match".
   **Outcome:** There's no search by name. I had to page through the list 50 at a time until I found Byrne v Nowak on page 2. It turned out to be confirmed already, so Callum had it wrong.
   **Confusion or annoyance:** A box where I can type a player's name is the first thing I'd want. A filter by competition and division would also help.
   **Severity:** minor
   **URL:** /coach/matches

4. **Goal:** Clear 21 results waiting on the other side before the deadline.
   **Action:** For players who never answer (Gavin, Robbie, Bella) I decided on the opponent's entry. For the rest I WhatsApped the player who hadn't confirmed, checked their score matched, then used "Use X's entry" and saved, three screens per match.
   **Outcome:** The queue went from 21 to 0. The "X entered: score, written with Y's games first" line is clear.
   **Confusion or annoyance:** Three screens for each of 17 matches is a lot of clicking at this time of year. I'd like a quick "confirm as entered" button on the waiting list itself. I was also worried that the "And 11 more" section only shows names, not the score entered, so I had to open each one.
   **Severity:** minor
   **URL:** /coach/results

5. **Goal:** Send one reminder email to everyone on the Chase list.
   **Action:** Pressed "Email 55 players with an address (BCC)".
   **Outcome:** My browser showed the PLAYERS' sign-in page with a long list of addresses in the address bar. When I went back to /coach I was signed out and had to paste the administrator key again.
   **Confusion or annoyance:** I expected my email to open with everyone in BCC. Instead I lost my session and the email never went. I used the club announcement instead.
   **Severity:** painful
   **URL:** /coach/chase

6. **Goal:** Know who is still short of the 4-match minimum and chase them.
   **Action:** Chase list > Short of the minimum, then each division.
   **Outcome:** Very good. It tells me who is short, by how many, and who they still have to play. That made the WhatsApps easy to write.
   **Confusion or annoyance:** The players' phone numbers aren't shown here, only emails, so I still have to go to my phone contacts. Players keep telling me "surely you have their number too". I don't, for many of them.
   **Severity:** fine
   **URL:** /coach/chase

7. **Goal:** Send Tomasz Nowak a fresh sign-in link.
   **Action:** Members > scrolled to Tomasz > Sign-in link.
   **Outcome:** It worked (K169). But the Members page is enormous and Tomasz is about 5,000 lines down. Clicking a name in the lists at the top doesn't open that person, it just reloads the same page.
   **Confusion or annoyance:** With 152 members I need a search box or a page for each member. Finding one person is the most common thing I do there.
   **Severity:** painful
   **URL:** /coach/members

8. **Goal:** Start Spring 2027 planning: who's playing and with whom.
   **Action:** Dashboard opt-out lines, then "Next season's pairs".
   **Outcome:** The pairs page is excellent. It showed the new pairs agreed (Arjun + Ali), who is looking for a partner (Ryan Wood, Tom Fleming, Gavin Evans, Grace, Jade Mahmood) and who isn't playing. That's exactly my list for the phone calls.
   **Confusion or annoyance:** Jamal Owen, whose partner James Hale left, is put under "Not playing next season" with James and not under "Looking for a partner". Dana Park (Sofia injured) and Arjun (in mixed) disappear the same way. I'd have forgotten Jamal if I hadn't known. There's also no way for me to record a pairing I agree on the phone (for example Ryan + Tom) until the draft.
   **Severity:** painful
   **URL:** /coach (Next season's pairs)

9. **Goal:** Mark Vera Cross as "not playing doubles next season" (she still plays singles).
   **Action:** Looked at her member card.
   **Outcome:** The only choices are "Take a break" and "Not playing next season", which covers singles AND doubles. There's nothing for one competition only. The card also doesn't say which competitions she's in.
   **Confusion or annoyance:** I left it for her to do herself on the site. I can't do it for her.
   **Severity:** minor
   **URL:** /coach/members

10. **Goal:** See which newcomers are waiting to join for Spring.
    **Action:** Members > "Waiting to be placed".
    **Outcome:** 64 names, nearly all of them social members who've never asked to play. The real newcomers (Hannah, Ravi, Nora, Hamza, Neil, Molly) are mixed in with them. Hannah, Ravi and Nora show as "Hannah C.", "Ravi M." and "Nora Q.", and Ravi and Nora have no level. Nothing records what each one asked to play (singles/doubles).
    **Confusion or annoyance:** I'm worried the draft will try to place all 64. I need a "wants to play next season" tick, or at least the join request text kept.
    **Severity:** painful
    **URL:** /coach/members

11. **Goal:** Draft Spring 2027.
    **Action:** Season tab.
    **Outcome:** The only option is "End season now". It says the draft starts from the final tables, so I can't draft until after 13 Dec. Fair enough, but I can't sketch it in advance.
    **Confusion or annoyance:** I'd have liked a "draft preview" to see the rough shape of the divisions with this week's tables.
    **Severity:** minor
    **URL:** /coach/season

12. **Goal:** Fix Scott Thorne's wrong phone number (it's Dmitri James's).
    **Action:** Emailed Scott (WhatsApp would go to Dmitri!).
    **Outcome:** Still not fixed after a month. The site won't let me clear a phone number, only replace it.
    **Confusion or annoyance:** A "remove" option on contact details would stop me messaging the wrong person.
    **Severity:** minor
    **URL:** /coach/members

13. **Goal:** Weather forecast for players.
    **Action:** Weather tab.
    **Outcome:** Still "The forecast could not be fetched just now", two months after I set up the courts.
    **Confusion or annoyance:** I've stopped expecting it to work.
    **Severity:** minor
    **URL:** /coach/weather

I didn't need the coding agent this week. Everything I had to do in the run-up to the deadline (disputes, waiting results, sign-in links, chasing) the website could do, and the Results, Chase list and Next season's pairs pages are genuinely good. What wears me down is size: finding one member or one match means paging and scrolling. The day count saying 70 days with one week left nearly gave me a heart attack. I'd tell the club the site is worth it, but before Spring it needs a member search, a proper newcomers list, and clearer handling of people whose partner has gone.

### Marcus Bell

#### Marcus Bell - Friction Log - Checkpoint s1-w9 (Sunday 6 December 2026)

##### 1. Display bug: "70 days" instead of "7 days" for results close date
- **Goal:** Understand the current deadline for results submission
- **Action:** Viewed homepage and saw "Results close in 70 days (Sun 13 Dec)"
- **Outcome:** Confused by the count - clearly meant 7 days (one week), not 70 days
- **Confusion or annoyance:** It's clearly a display bug showing the wrong count. The actual date (Sun 13 Dec) is correct, but "70 days" is obviously wrong. I had to ignore the number and go by the actual date.
- **Severity:** minor
- **URL:** http://localhost:8790/

##### 2. All match dates show "4 Oct" regardless of when they were actually played
- **Goal:** Track when I actually played each match during the season
- **Action:** Reviewed my match history on the standings page
- **Outcome:** Every match shows a played date of "4 Oct 2026" even though matches ran across October, November, and December
- **Confusion or annoyance:** Makes it impossible to tell from the website when matches actually took place. I had to rely on memory and my diary to know which matches were in which weeks. The system seems to only store the scheduled date, not the actual date.
- **Severity:** minor
- **URL:** http://localhost:8790/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

##### 3. No direct messaging to opponent about unconfirmed results
- **Goal:** Follow up with Gavin Evans about confirming our match result
- **Action:** Entered my result (5-7, 1-6) and waited for him to confirm. No way to message him through the app.
- **Outcome:** Had to leave the site and use external means (phone/email) or hope he checks the site. Fortunately he did confirm after a few weeks.
- **Confusion or annoyance:** The website tells you "waiting for opponent to enter result" but gives no way to notify them or message them. I'm missing their contact details anyway (Gavin's not on file), so I couldn't even contact him externally.
- **Severity:** minor
- **URL:** http://localhost:8790/matches/01a10688-bc8f-76ba-b062-3712d4f14ab6

##### 4. Standings page is long and hard to scan for specific players
- **Goal:** Check my ranking and see if I'm still winning Division 1
- **Action:** Navigated to standings and scrolled through long tables
- **Outcome:** Found my information but had to read carefully through many entries. The table format is dense.
- **Confusion or annoyance:** With 8 players in Division 1 and detailed match history for each, the page gets quite long. Would be nice to highlight "you" more clearly or provide a personal standings view.
- **Severity:** minor
- **URL:** http://localhost:8790/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

##### 5. Can't easily see projected final standings with pending matches
- **Goal:** Understand if Callum Hall could overtake me if he wins his remaining matches
- **Action:** Reviewed his record (4-0 with 3 matches still to play) vs my 3-4
- **Outcome:** Had to manually calculate in my head. No clear indication of best/worst case scenarios.
- **Confusion or annoyance:** Callum Hall is 25 pts, only 1 point behind me, and has 3 matches left. Depending on how those go, he could potentially finish with more points. Would be helpful to see a "if remaining matches..." scenario.
- **Severity:** minor
- **URL:** http://localhost:8790/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

##### 6. Match partner confirmation form could be clearer about timing
- **Goal:** Confirm I want to keep playing with Rory Kelly next season
- **Action:** Navigated to Men's Doubles standings and clicked "Save" on partner preference
- **Outcome:** Got confirmation "Saved. You are down to play with Rory Kelly next season."
- **Confusion or annoyance:** None really - the form works fine. Just confirming for completeness.
- **Severity:** fine
- **URL:** http://localhost:8790/competitions/01a10688-c249-7d57-8c1e-a82a69b2bb86

##### 7. No clear timeline visibility for when fixtures will be published for next season
- **Goal:** See when next season draws will be released
- **Action:** Looked through standings, matches, and partner selection pages
- **Outcome:** No information visible about next season fixture release date
- **Confusion or annoyance:** I can confirm I want to play and with whom, but there's no info about when the draft/draw will happen or when fixtures will be published. Would want to know this.
- **Severity:** minor
- **URL:** http://localhost:8790/

##### 8. Doubles "all matches played" bonus awarded correctly
- **Goal:** Understand how my points reached 24 in doubles
- **Action:** Reviewed match details and point calculation
- **Outcome:** Got +1 point for "Turned up to every match" bonus in both singles and doubles
- **Confusion or annoyance:** None - this is working correctly
- **Severity:** fine
- **URL:** http://localhost:8790/competitions/01a10688-c249-7d57-8c1e-a82a69b2bb86

---

##### Overall Impression

The site is clear and easy to navigate - I was able to enter all my results, confirm standings, and register my preferences for next season without major issues. The core functionality works well: score entry is intuitive, standings are comprehensive, and the confirmation system ensures both players agree before results count.

However, there are some minor UX quirks: the "70 days" display bug is confusing, the match dates all showing "4 Oct" makes it hard to track actual timeline, and there's no way to message opponents directly through the site to follow up on pending results. The lack of next season information (when draws will be published, division assignments, etc.) also leaves me wondering what's next.

As a software tester, I'd say the site is functional and reliable, but could use some polish. I ended up 3rd in singles (not winning like I hoped) and 2nd in doubles, which is a decent season. Looking forward to playing with Rory again next year - we're a good partnership.

### Tomasz Nowak

#### Tomasz - Friction Log - Checkpoint s1-w9 (6 Dec 2026)

##### Friction Items

1. **Old sign-in link had expired**
   - **Goal:** Access league site to check standings and enter results
   - **Action:** Opened site using old sign-in link K150 (given in Week 1)
   - **Outcome:** Got 401 error "That link has already been used, or has expired"
   - **Confusion or annoyance:** None - understood links expire, but expected 3-day duration; had to ask Helen for new link
   - **Severity:** minor
   - **URL:** /login?token=...

2. **Browser session stayed signed in after link expired - good design**
   - **Goal:** Access league site
   - **Action:** After link failed, tried opening main page
   - **Outcome:** Found myself still signed in on home page
   - **Confusion or annoyance:** None - this was actually helpful
   - **Severity:** fine
   - **URL:** /

3. **Entering match results was seamless - both matches already had opponent's scores**
   - **Goal:** Enter Hugo Collins and Raj Wood results that I played in Week 6
   - **Action:** Clicked "Enter result" links, found opponent scores already on form, verified and submitted
   - **Outcome:** Both results confirmed instantly (Hugo: 5-7, 6-2, 7-10 Lost; Raj: 6-3, 6-1 Won)
   - **Confusion or annoyance:** None
   - **Severity:** fine (excellent UX)
   - **URL:** /matches/01a10688-be3d-7278-8b70-859334dccd19 and /matches/01a10688-be3d-7d93-9756-c94804604645

4. **Players with only email contact are unreachable if you don't use email**
   - **Goal:** Arrange final match with Stefan Barnes
   - **Action:** Viewed match page, saw only email contact (stefan.barnes@example.net), tried asking Helen for phone number
   - **Outcome:** Helen didn't respond; couldn't contact Stefan
   - **Confusion or annoyance:** Site shows contact details but only email for Stefan; I can't use email (WhatsApp only)
   - **Severity:** minor (have minimum 4 matches already, Stefan match is optional)
   - **URL:** /matches/01a10688-be3d-7f95-a8fd-9eec847d5b65

5. **Player responses to contact requests were generic and not helpful**
   - **Goal:** Get Stefan Barnes' phone number from people who've played with him
   - **Action:** Sent WhatsApp to Raj Wood, Hugo Collins, Malik Rose asking for Stefan's number
   - **Outcome:** All three replied with identical generic message: "Happy to have a hit, but I don't think we're drawn against each other in the league?"
   - **Confusion or annoyance:** Frustrating - they didn't understand I was asking for a phone number, not to play them again
   - **Severity:** painful (wasted multiple message exchanges)
   - **URL:** N/A (messaging outside site)

6. **Helen didn't respond to calls or messages**
   - **Goal:** Get Stefan Barnes' contact details from Helen
   - **Action:** Sent WhatsApp and left voicemail asking for Stefan's number
   - **Outcome:** No response
   - **Confusion or annoyance:** Helen usually responds promptly; unclear why no reply this time
   - **Severity:** minor (not critical; have my 4 match minimum already)
   - **URL:** N/A (messaging outside site)

7. **Callum Byrne replay score is correct on site**
   - **Goal:** Verify Week 7 tiebreak replay is recorded correctly
   - **Action:** Checked my played matches list
   - **Outcome:** Confirmed Callum Byrne shows "Won 6-4, 3-6, 10-8" - correct!
   - **Confusion or annoyance:** None - dispute is fully resolved
   - **Severity:** fine
   - **URL:** /

8. **Standings show me in strong position**
   - **Goal:** Check where I stand in Division 3
   - **Action:** Viewed standings table
   - **Outcome:** I'm 2nd place with 27 points (4W, 2L from 6 matches); Raj Wood 1st with 31 points (7 matches)
   - **Confusion or annoyance:** None
   - **Severity:** fine
   - **URL:** /competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

##### Overall Assessment

The site worked really well today. Entering my two outstanding results was smooth and quick - both opponents had already entered their scores, I just verified and submitted. The Callum Byrne dispute from earlier is fully resolved and showing correctly on the site.

I'm happy with my performance: 2nd place in Division 3 with 27 points from 6 matches, well above the required 4. The only frustration is Stefan Barnes - I can't reach him because he only has email contact on the site, Helen hasn't replied to my requests for his phone number, and other players either aren't paying attention or don't understand a simple phone number request.

If I were running the club, I'd suggest:
1. Requiring phone numbers for all players at signup (or at least a way to contact them if email doesn't work)
2. Maybe a messaging system built into the site would help - right now you have to rely on knowing people's WhatsApp/phone numbers
3. Helen's contact info system seems to work (she has my number), but it's not a two-way street where I can easily find other players

The site itself is solid - good match entry flow, clear standings, simple design. Just need to solve the contact problem.

### Grace Adeyemi

#### Friction Log - Checkpoint s1-w9
##### Grace Adeyemi, Sunday 6 December 2026

###### 1. Messaging System Sends Match History Instead of Actual Responses

**Goal:** Schedule remaining 4 matches before season ends (Sunday 13 Dec)

**Action:** Sent text and WhatsApp messages to Emily Hale, Paige Booth, Vera Cross, and Robbie Edwards asking about match availability and timing

**Outcome:** When recipients tried to reply, the messaging system sent their match history (list of previous games played) instead of their actual responses. This happened consistently with Emily Hale (twice), Paige Booth, and Robbie Edwards. I couldn't see their actual answers to my scheduling questions.

**Confusion or annoyance:** This is completely broken and makes coordination impossible. I asked questions and got tennis statistics in return. I don't need to know what matches people played; I need to know if they're available Wednesday at 7:30. The system is preventing communication.

**Severity:** Blocker

**URL:** N/A (messaging system)

---

###### 2. Unable to Confirm Match Schedules Due to Messaging Failures

**Goal:** Confirm specific dates and times for remaining matches

**Action:** Asked Emily Hale for confirmation that our match is Wednesday 11th at 7:30pm. Asked Paige Booth for confirmation that our match is Sunday 13th at 2pm. Asked Robbie Edwards to confirm the date.

**Outcome:** Could not confirm any matches definitively. For Emily and Paige, got match histories instead of confirmations. For Robbie, phone call gave me an answer ("Wednesday 7:30") but text confirmation got match history. I don't actually know if these times are real.

**Confusion or annoyance:** I've potentially scheduled two matches for the same time (Emily's Women's Doubles and Robbie's Mixed Doubles both Wednesday 7:30) and I can't even confirm this with them to resolve it. This is a disaster with 7 days left in the season.

**Severity:** Blocker

**URL:** N/A

---

###### 3. Women's Doubles Partner Vera Cross Has Ghosted with One Week Left

**Goal:** Coordinate with partner Vera for remaining Women's Doubles matches

**Action:** Sent messages and texts to Vera asking where she's been (no contact for 2 weeks) and about match availability

**Outcome:** No response. Vera's last message was from week 5. According to my diary, she missed a match we arranged and has been silent since. With only 7 days left in the season and 2 matches still to play, I have no partner confirmation.

**Confusion or annoyance:** This is very stressful. I care about having a reliable partner - that's what drew me to play doubles in the first place. Vera committed to playing with me but then disappeared. I've already changed my partner preference to let the coach find someone new, but that doesn't help for these final matches. I'm worried about her but also frustrated by her unreliability.

**Severity:** Painful

**URL:** /competitions/01a10688-c394-7e14-8f79-0576661598a8

---

###### 4. Match Entry Form Date Field Incorrectly Constrains Entries

**Goal:** Enter Mixed Doubles result for Week 9 match (29 Nov 2026)

**Action:** Filled out match report form showing "max 2026-10-04" as the date constraint

**Outcome:** The form allowed me to enter "2026-11-29" as the played date, but the field display showed a max date of 2026-10-04 (week 1). This is incorrect - the form should allow any date within the season. The form worked (my entry was accepted), but the constraint shown is wrong.

**Confusion or annoyance:** Minor - the form was flexible enough to accept the correct date, but the UI is misleading. It looks like the field is constrained when it's not.

**Severity:** Minor

**URL:** /matches/01a10688-c57a-79f2-a87d-ab347420938a#report

---

###### 5. No Partner Selection Help from Site

**Goal:** Find a reliable Women's Doubles partner after Vera ghosted

**Action:** Clicked "change" on Women's Doubles next-season partner and selected "let coach find me someone"

**Outcome:** The form accepted this choice and told me "The coach will find you one, or ask someone below." It gave me a dropdown of all players in the league to choose from, but I had to rely on the coach's judgment rather than the site suggesting compatible partners based on skill level, playing style, or reliability ratings.

**Confusion or annoyance:** The site puts all the work on me to either pick someone (with no information about them) or hope the coach matches me well. I don't know most of these people. A better system would suggest partners based on availability, skill level, or player feedback/ratings.

**Severity:** Minor

**URL:** /competitions/01a10688-c394-7e14-8f79-0576661598a8#next-season

---

###### 6. Robbie Edwards (Mixed Doubles Partner) Has Been Unreachable Most of Season

**Goal:** Coordinate Mixed Doubles matches with partner

**Action:** Tried to reach Robbie throughout the season. Helen mentioned he had no contact info on file. I received a sign-in link to pass to him. This week I finally reached him by phone.

**Outcome:** Robbie was completely unreachable via the site/email/phone until I called him directly this week. The site still shows "No contact details: ask the coach" for him. He finally answered and agreed to play Wednesday, but I had to hunt him down.

**Confusion or annoyance:** This is a reliability issue - if a partner doesn't have working contact info on file, matches can't be organized properly. I was able to get 2 Mixed Doubles wins with Robbie, but getting him connected took weeks and required coaching intervention.

**Severity:** Painful

**URL:** /matches/01a10688-c57a-74fc-8a8a-8ec793545968

---

###### 7. Multiple Players Have Missing or Unreliable Contact Information

**Goal:** Reach opponents and partners to schedule matches

**Action:** Browsed match pages showing opponent contact details

**Outcome:** Found that several people have "No contact details: ask the coach" including Robbie Edwards, Gavin Evans, and Bella Wood. This makes it hard to coordinate with them. The site relies on players having contact info in the club's system.

**Confusion or annoyance:** The site is only as reliable as the club's data. When info is missing, players can't self-organize. The coach has to intervene, which creates a bottleneck.

**Severity:** Painful

**URL:** Various match pages

---

###### 8. No Built-In Scheduling/Calendar Feature

**Goal:** Coordinate when to play 4 remaining matches before deadline

**Action:** Used phone messages to arrange times and places with opponents

**Outcome:** The site has no scheduling feature. Players must coordinate outside the app via text/email/phone. This worked for me (finally got some tentative times) but is less efficient than a built-in scheduler.

**Confusion or annoyance:** None really - I'm used to texting people. But it would be smoother if the site had an "offer available times" feature or a calendar where everyone could see conflicts.

**Severity:** Minor

**URL:** /matches/* (various match pages)

---

###### 9. Season Timeline is Very Tight for Last-Minute Issues

**Goal:** Deal with partner ghosting and schedule 4 matches in the final week

**Action:** Discovered Vera's disappearance on Sunday 6 December, tried to schedule matches with only 7 days until deadline

**Outcome:** Had to scramble to find matches, change my partner preference, contact Helen, and coordinate new opponents all in one day. If I had more time, I could solve these problems more carefully. The tight timeline (1 week) means any disruption in the first 8 weeks cascades into a crisis at the end.

**Confusion or annoyance:** This isn't really the site's fault, but the timing is brutal. If I'd known earlier that Vera wasn't going to show up, I could have planned better.

**Severity:** Minor

**URL:** / (home page showing season close date)

---

###### 10. Unclear if Matches Are Actually Confirmed

**Goal:** Know which matches I'm definitely playing before Sunday deadline

**Action:** Attempted to schedule matches, got unclear responses due to messaging system issues

**Outcome:** I think I have:
- Wednesday 11th, 7:30pm: Mixed Doubles (Robbie said this by phone; text showed match history)
- Wednesday 11th, 7:30pm: Women's Doubles (Emily said this via message; got history back)
- Sunday 13th, 2pm: Women's Doubles (Paige said this via message; got history back)

But I'm not actually sure because the confirmations are unclear. I might show up to a court and have no one there.

**Confusion or annoyance:** I'm anxious. The messaging system made it impossible to confirm anything definitively. I don't know if I should plan my week around these matches or if they're even happening.

**Severity:** Blocker

**URL:** N/A

---

###### Summary

The league website has a fundamental communication problem: the messaging system is broken in a way that makes coordination nearly impossible. When opponents try to respond to scheduling requests, their messages are being replaced with match histories. This made an already-stressful situation (final week, partner ghosted) completely chaotic.

What I'd tell the club: **The messaging system is the biggest problem right now.** Fix it first. I also want to say: please check in on why partners ghost each other. The site enables strangers to team up with zero accountability, and that's lonely when your partner disappears. The thing I liked about tennis at the club was supposed to be the social connection and having reliable teammates. But Vera proved that's not guaranteed. I've requested the coach find me a new partner next season, but I'm nervous about trusting a stranger again. The site could help by adding a way for players to rate reliability or give feedback on partners.

Also, one positive thing: when I could actually reach people by phone, they were willing to play. Robbie and Emily both said yes immediately. The problem was the messaging system, not the people.

---

**Tool calls used: ~22 out of ~30 allowed**

### Derek Mills

#### Derek's Friction Log — Checkpoint s1-w9

##### Entry 1: Entering match result
- **Goal:** Report my loss to Noah Grant (3-6, 3-6)
- **Action:** Clicked "Enter result" link on home page for Noah Grant match
- **Outcome:** Form appeared with all fields ready to fill. Selected outcome "We played it out", entered set scores and date. Result confirmed successfully when submitted.
- **Confusion or annoyance:** None
- **Severity:** fine
- **URL:** `/matches/01a10688-bd4f-7202-9d22-694ffb0e599f#report`

##### Entry 2: Checking standings
- **Goal:** See where I stand in Division 2 after entering the Noah Grant result
- **Action:** Clicked on "Men's Singles▼ going down Division 2 · 8th · 5 pts" link from home page
- **Outcome:** Full standings table appeared showing all divisions with detailed results. Found Derek Mills at 8th place, 0-4 record, 5 pts. Page was quite long and took time to render fully.
- **Confusion or annoyance:** None, but the page was very large (18,000+ characters). Had to use `show --from` command to see rest of page.
- **Severity:** minor
- **URL:** `/competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b#mine`

##### Entry 3: Deciding about next season
- **Goal:** Decide whether to continue playing next season
- **Action:** Reviewed options on home page: "I am not playing next season at all" vs "I am taking a break". Selected "I am taking a break" button.
- **Outcome:** System confirmed "Done. You are on a break, and the coach will see it." Page now shows "You are not in the draft for any season until you say you are back."
- **Confusion or annoyance:** None. Options were clear and the ability to take a break (rather than permanent withdrawal) felt right.
- **Severity:** fine
- **URL:** `/` (home page)

---

##### Summary

The site continues to work well for me. Everything I needed was clear and accessible: entering a late score, checking standings, making a season decision. The page is long and information-dense, which isn't confusing but does take a moment to navigate. No passwords, no fussy logins—just the link Helen sent me weeks ago still works. 

After 0-4 losses and thinking about my age (61 now), the break option felt right: keeps the door open if I want to come back, doesn't feel like I'm quitting forever. The site doesn't make admin a burden—I entered one score and made one decision, done.

Would tell the club: The website does the job well. No complaints.

### Sofia Marin

#### Friction Log - Sofia Marin - Checkpoint s1-w9 (6 December 2026)

##### Issue 1: Confusing Match Deadline Display

**Goal:** Understand when I need to finish playing my remaining matches

**Action:** Looked at homepage and standings pages

**Outcome:** The site displays "Results close in 70 days (Sun 13 Dec)" but the actual date is Dec 6, so that's only 7 days away. The countdown number doesn't match the date shown.

**Confusion or annoyance:** This is clearly a mismatch. The "70 days" must be a copy-paste error or placeholder from an earlier season. It's confusing because it makes me doubt which deadline is correct. I had to rely on Helen's messages to confirm the actual deadline is next Sunday.

**Severity:** minor

**URL:** / (homepage)

---

##### Issue 2: Confusing Walkover Scoring System

**Goal:** Understand how my withdrawal and walkovers affect my standings and my partners' standings

**Action:** Checked the standings tables for Women's Singles, Women's Doubles, and Mixed Doubles divisions

**Outcome:** The walkover system is explained in the scoring rules ("A walkover: 3 pts and a match played to the player who turned up, 0 pts to the one who did not, for whom it counts as not played"), but seeing it applied to my name on the standings is disorienting. I'm listed as "(withdrawn)" with my actual played matches shown separately from "Did not turn up" entries.

**Confusion or annoyance:** The distinction between "withdrawn" status and "did not turn up" is clear once I read the rules, but it took me a moment to understand that I'm not being penalized for the walkovers - they count as 0 pts for me but 3 pts for my opponents. This is fair, but the display could be clearer about what "injured and could not play" means versus refusing to play.

**Severity:** minor

**URL:** /competitions/01a10688-bf18-7832-a61c-1521e5436dd5#mine (Women's Singles standings)

---

##### Issue 3: Complicated Point Calculation

**Goal:** Understand exactly how my teams' point totals are calculated

**Action:** Read the scoring rules section on the standings pages and tried to verify my totals

**Outcome:** The scoring system is: 4 pts for a win, 1 pt for a loss, plus 1 pt per set won, plus 1 pt for losing by 4 games or fewer, plus 1 pt for winning by 8 games or more, plus 1 pt once you've played all matches. Walkovers are 3 pts to the winner, 0 to the withdrawer. This means a pair's total points might not be obvious from their win/loss record.

**Confusion or annoyance:** The system is mathematically sound, but it's not intuitive. For example, in Women's Doubles, Vera Cross / Grace Adeyemi have 0 wins, 3 losses, and 9 points. That's because they won games in some of those losses (earning set points) and had close losses (earning bonus points). This is actually good game design - it rewards effort even in losses. But it makes the standings harder to read at a glance without understanding all the rules.

**Severity:** minor

**URL:** /competitions/01a10688-c394-7e14-8f79-0576661598a8 (Women's Doubles standings)

---

##### Issue 4: Minimum 4-Match Requirement Not Prominent

**Goal:** Verify whether I'll stay in the league next season after my injury

**Action:** Checked my match totals and re-read the league rules

**Outcome:** I discovered that I need at least 4 matches played to stay in the league next season. For Women's Singles, I've only played 1 actual match (the rest are walkovers). This means I'll be dropped from Women's Singles Division 2 next season, even though I was included in the draft. Helen should have mentioned this explicitly when withdrawing me, or the site should show a warning.

**Confusion or annoyance:** I had to hunt for this rule on the standings page. Helen mentioned "results close Sun 13 Dec. You need at least 4 matches in each competition you're in, or you'll be left out of next season's draw" in her announcement, but when she withdrew me personally, she didn't specifically state which competitions I'd fall below the minimum for. I should have asked, but the site could make this clearer.

**Severity:** painful

**URL:** /competitions/01a10688-c394-7e14-8f79-0576661598a8 (Women's Doubles standings - shows the rule)

---

##### Issue 5: Break/Resume Mechanism Works but Lacks Context

**Goal:** Understand whether I'll be in next season's draft

**Action:** Looked at homepage and saw "You are on a break" status

**Outcome:** The site clearly shows I'm on a break and explains I can resume by clicking "I am back" button. However, there's no information about when next season starts, what divisions I'd be in, or whether my performance this season affects my placement next season.

**Confusion or annoyance:** none - the mechanism itself is clear

**Severity:** fine

**URL:** / (homepage)

---

##### Issue 6: Score Entry Order Confusion (Earlier Issue)

**Goal:** Enter my match scores correctly

**Action:** Read Helen's Week 1 announcement and the rules about score entry

**Outcome:** Helen had to correct two results in Week 1 because players entered scores as "my score first" instead of in the order the NAMES appear on the match page. While the rule is now explained clearly, the default assumption is usually "my score first" in tennis, so this was a teaching moment but led to disputes.

**Confusion or annoyance:** This is a common confusion. Helen's message was clear about it, but not everyone read it carefully, leading to disputes. The site could reduce friction by either: (a) showing "YOUR GAMES" and "OPPONENT'S GAMES" labels in the input boxes, or (b) automatically detecting and flipping scores that don't make sense (though this could cause other problems).

**Severity:** painful

**URL:** (no specific page - this was from message #200 and score entry forms like the match pages)

---

##### Overall Assessment

The league website is well-structured and handles a complex sport (tennis, with multiple divisions, singles and doubles, custom scoring) surprisingly well. The core functionality works: I can see my standings, understand my matches, check my partners' progress, and enter scores. However, there are friction points around clarity:

1. **Clarity of status**: When I was injured and withdrawn, the site didn't make it clear which competitions I'd fall below the 4-match threshold for.
2. **Deadline confusion**: The "70 days" countdown display is contradicted by the actual date shown.
3. **Score entry assumptions**: Players' assumptions about score order differ from the system's design.
4. **Complex scoring**: The points system is fair but unintuitive to players who expect simpler win/loss records.

The biggest friction points are things that affected me after I was injured - I'd tell the club to improve the messaging when withdrawing a player mid-season, especially around the 4-match minimum rule. Also, fix that deadline display!

Overall, the site is more helpful than frustrating. Helen's coaching through messages was excellent and made up for any site friction.

### Hannah Cole

#### Hannah's Friction Log - Checkpoint s1-w9 (Sunday 6 December 2026)

##### 1. Finding social session information
- **Goal:** Discover when and where the social sessions are that Helen mentioned for practice
- **Action:** Searched the website for social session info, used show --grep "social"
- **Outcome:** No results found on the website. No page, link, or section about social sessions.
- **Confusion or annoyance:** Helen suggested coming to social sessions as good practice, but there's no way to find out when they happen or where to go. I had to call and WhatsApp Helen to ask, and I still haven't heard back. As a newcomer, I don't know other players' contact details to ask them.
- **Severity:** painful
- **URL:** http://localhost:8790

##### 2. No timeline for next season announcement
- **Goal:** Understand when the new season will start and when I'll know my division placement
- **Action:** Read the website home page and messages from Helen
- **Outcome:** Website says "Next season's name and dates have not been announced yet." Placement happens "after results close on 13 Dec" but no specific date mentioned.
- **Confusion or annoyance:** It's 6 December and the season ends 13 December (in 7 days). But I have no idea when to expect the next announcement or when matches will start. Will it be 14 December? January? This creates uncertainty about my ability to plan.
- **Severity:** painful
- **URL:** http://localhost:8790

##### 3. Limited contact options
- **Goal:** Ask Helen questions about my placement and next steps
- **Action:** Called Helen and sent WhatsApp message
- **Outcome:** Call went to voicemail. WhatsApp sent but no reply yet.
- **Confusion or annoyance:** Helen is the only contact I have (and I only have her because a friend at the club gave me her WhatsApp). The website has no general club contact email, phone, or contact form. If Helen is unavailable or slow to respond, there's no alternative way to get information. This is especially frustrating when critical season-end decisions are being made.
- **Severity:** painful
- **URL:** http://localhost:8790

##### 4. No visibility into new season draft/placement
- **Goal:** Understand how placement decisions are made and when I'll know my division
- **Action:** Looked through website and messages
- **Outcome:** Helen said she'd "put me down as beginner" and "I'll be placed in a division when we draw up the next season straight after" 13 Dec. No other details about the process.
- **Confusion or annoyance:** I don't know if there are any actions I need to take for placement, whether beginner is a level or a designation, or what factors affect division placement. The website doesn't explain the process. It just says "You do not need to do anything now. The coach will be in touch when your place and fixtures are ready."
- **Severity:** minor
- **URL:** http://localhost:8790

##### 5. Mismatch between approval and participation
- **Goal:** Get into matches as quickly as possible after approval
- **Action:** Got approved 11 October, checked website regularly through 8 November, now checking again 6 December
- **Outcome:** Approved for 8 weeks but still no matches. Helen explained that approval doesn't add me to the current running season, but no alternative way to play in the meantime.
- **Confusion or annoyance:** Helen suggested social sessions as practice, but I can't find them on the website. As a keen player wanting to get involved quickly, the 8-week wait between approval and matches feels long and excludes me from the community action.
- **Severity:** painful
- **URL:** http://localhost:8790

##### 6. Unclear social session availability
- **Goal:** Get some match practice before the league starts properly
- **Action:** Relied on Helen's suggestion to attend social sessions, tried to find details
- **Outcome:** No information available on website. Helen suggested them verbally but provided no details and hasn't responded to my follow-up.
- **Confusion or annoyance:** I want to take Helen's advice and go to social sessions, but without knowing the day, time, location, or how to sign up, I can't actually attend. I feel like I'm missing something obvious that other members know.
- **Severity:** painful
- **URL:** http://localhost:8790

##### Summary

The website feels incomplete for a newcomer. I'm approved and keen to play, but there's no clear path forward. Critical information is missing (social session details, next season timeline), and the only way to get answers is through Helen, who I can't reach easily. The welcome message says "You do not need to do anything now" but this is frustrating when the season is ending in 7 days and I'm still in the dark about what comes next. I feel disconnected from the league community with no way to make contact or find out how to participate in the downtime. For someone as keen as me, this would feel like the club isn't that interested in getting me involved.

---

## Checkpoint s1-end

### Helen Marsh (coach)

#### Friction log - Helen Marsh (coach), s1-end, Sunday 13 Dec 2026 evening

1. **Goal:** Clear the closing-night results queue (1 dispute, 18 waiting)
   - **Action:** Results > open each match > "Use X's entry" > chose a reason > Review decision > Save coach decision
   - **Outcome:** All done except one I chose to leave. The review screen shows the effect on points and on the 4-match minimum before you save, which helped.
   - **Confusion or annoyance:** It takes four screens per match and I had 18 of them on the last night. Most of the work was ringing players, but the clicking added up. A "confirm the ones I've checked" tick-list would save half an hour. Every entry also says "has not answered in less than a day" and is dated 4 Oct, which isn't right.
   - **Severity:** painful
   - **URL:** /coach/results, /coach/matches/…

2. **Goal:** End Autumn 2026 and leave Stefan v Tomasz undecided on purpose
   - **Action:** Season > End season now
   - **Outcome:** The confirmation page listed the undecided match, everyone's opt-outs, and what "unplayed" means. There was a tick-box to leave it undecided. Good.
   - **Confusion or annoyance:** It says a season ended by mistake "can be reopened through the API". I don't know what that is, and I found out later that it means "you can't, ask your agent".
   - **Severity:** fine
   - **URL:** /coach/season

3. **Goal:** Prepare Spring 2027 drafts
   - **Action:** Filled in the name and dates (it offered "Winter 2026–27", 14 Dec to 25 Feb) and pressed Prepare
   - **Outcome:** I got a blank page. When I went back, only Men's Singles, Women's Singles and Men's Doubles had been drafted, and the form was still there with "Winter" back in it. I typed Spring again, pressed it again, and the other two appeared in the same season.
   - **Confusion or annoyance:** For a minute I thought I'd made two seasons. Nothing told me it had half-worked.
   - **Severity:** painful
   - **URL:** /coach/season/next

4. **Goal:** Review the singles drafts (promotions, relegations, holds, gaps)
   - **Action:** Season > Men's Singles / Women's Singles drafts, "Move to" dropdowns, "Add to" for newcomers
   - **Outcome:** Clear labels (Held, Promoted, Relegated, Moved by coach, New) and a "Not carried over" list with reasons (opted out, on a break, left). Moving people was easy. Nobody was left out for too few matches. Men's Singles Division 1 was down to 6 and Division 3 to 4, so I moved the next-best up.
   - **Confusion or annoyance:** The gap suggestions are backwards. When two relegated players had left, it suggested "relegate Matt Tran" and "relegate Robbie Edwards" to fill the empty relegation places, which would push down people who earned their place. Nothing suggested moving someone up to fill Division 1. The warnings stay on the page after I've fixed the sizes.
   - **Severity:** minor
   - **URL:** /coach/season/drafts/…

5. **Goal:** Place the genuine newcomers (Hannah, Ravi, Nora) and not the social members
   - **Action:** Members > "Waiting to be placed", and the draft's "Not in … last season" list
   - **Outcome:** Hannah, Ravi and Nora show as "Hannah C.", "Ravi M." and "Nora Q.", and Ravi and Nora have no level. Their names are cut short everywhere, and I can't find anywhere to fix a name. They sit in the same 64-name list as all the social members.
   - **Confusion or annoyance:** The site can't tell me who actually asked to play. Hamza, Neil and Molly never gave me a straight yes, so I left them out. I'm working from my own notes and phone, not the site.
   - **Severity:** painful
   - **URL:** /coach/members, /coach/season/drafts/…

6. **Goal:** Sort out new doubles pairs and people needing partners
   - **Action:** Dashboard "Next season's pairs", then the draft's "Make a pair" form
   - **Outcome:** Ali/Arjun showed as agreed. Making Ryan Wood/Tom Fleming, Jamal Owen/Gavin Evans, Grace Adeyemi/Dana Park and Jade Mahmood/Arjun Farrell by hand worked well.
   - **Confusion or annoyance:** Dana and Jade both told me they'd "said on the site" who their new partner was, but neither choice showed up. Ryan and Tom both picked Ali Lee by mistake. The site also says Dominic Bennett is "not playing next season" when he's only stopping mixed and is in singles and men's doubles.
   - **Severity:** minor
   - **URL:** /coach/season/drafts/… (Men's/Women's/Mixed Doubles)

7. **Goal:** Start Spring 2027 so fixtures go out
   - **Action:** Season > Start Spring 2027… > Start
   - **Outcome:** Blank page again. Only Men's Singles had started. I had to press "Start them…" four more times, one competition each time.
   - **Confusion or annoyance:** The confirmation says "every division of all five competitions" will start, and then only one does. It also doesn't show a final summary of division sizes before I commit.
   - **Severity:** painful
   - **URL:** /coach/season/…/start

8. **Goal:** Finish starting the last competition
   - **Action:** Pressed the link in the same spot on the Season page once more
   - **Outcome:** Once everything had started, that spot held "End season now", and I ENDED SPRING 2027 a minute after starting it. That was my mistake for clicking without reading. But the site has no undo, and the button looks the same as the one I'd pressed four times.
   - **Confusion or annoyance:** Panic. I had to use the coding agent to put the season and all five competitions back to running. Ending it had also reset the results deadline to tonight. The agent's first fix showed "Mon 29 Mar" because the clocks go forward that weekend, so it needed a second fix. The 258 fixtures survived.
   - **Severity:** blocker (coding agent needed)
   - **URL:** /coach/season

9. **Goal:** Save Gavin Evans's mobile (finally got it from Phoebe) and send him a sign-in link
   - **Action:** Members > Gavin Evans > Save contacts, phone only
   - **Outcome:** "Contacts not saved", because email is required as well as phone. Gavin has no email, so my phone can't reach him either. I sent his link via Phoebe.
   - **Confusion or annoyance:** It's the same problem as Scott Thorne's wrong number. The site insists on both email and phone, and lots of our members only have one.
   - **Severity:** painful
   - **URL:** /coach/members

10. **Goal:** Find one member on the Members page
    - **Action:** Clicked the name in "Waiting to be placed" / "Contact details to complete"
    - **Outcome:** It just reloads the huge page of 150 members, each with six forms. Hard to find anyone.
    - **Confusion or annoyance:** I want one page per member.
    - **Severity:** minor
    - **URL:** /coach/members

11. **Goal:** Check the season afterwards
    - **Action:** Dashboard and Tables
    - **Outcome:** Spring 2027 shows 0 of 78/105/25/25/25 matches played, results close Sun 28 Mar, and fixtures show on the tables. Announcement and personal messages sent.
    - **Confusion or annoyance:** none
    - **Severity:** fine
    - **URL:** /coach, /coach/tables

**Overall:** The end-of-season flow is mostly sensible. The end-season confirmation and the draft pages with "Held / Promoted / Relegated / Not carried over" are the best part of the site, and I could review every division properly. But two big buttons half-worked and left blank pages, and the Season page put "End season" where "Start" had been. I lost my nerve, and I needed the coding agent to undo a disaster. I'd tell the club the site does the job and fixtures are out before Christmas. I'd tell the committee we need an undo for "End season", a way to record phone-only members, and a proper way for newcomers to say "I want to play".

### Marcus Bell

#### Marcus Bell - Friction Log: Season 1 End Checkpoint (Sunday 13 December 2026)

##### 1. Confusing Season Deadline Countdown
- **Goal:** Verify that all my results are final before the season closes tonight
- **Action:** Opened the home page to check when results close
- **Outcome:** Page says "Results close in 70 days (Sun 13 Dec)" but today IS Sunday 13 Dec
- **Confusion or annoyance:** The countdown timer is showing completely wrong information. How can it be 70 days away when it's supposed to be today? This made me unsure whether I was even at the right time or if there was a date sync issue. Had to manually confirm today's date was correct.
- **Severity:** painful
- **URL:** http://localhost:8790/

##### 2. Inconsistent Match Dates on Home Page
- **Goal:** Verify my match history and understand when each match was played
- **Action:** Reviewed the list of 12 played matches on the home page
- **Outcome:** All 12 matches show "4 Oct" as the play date, even though matches spanned from Week 1 through Week 6 (over two months)
- **Confusion or annoyance:** The dates appear truncated or static. It's confusing to see everything dated "4 Oct" when I know I played matches in October, November, and December. This made me question whether the dates were being recorded correctly at all.
- **Severity:** minor
- **URL:** http://localhost:8790/

##### 3. Overwhelming Length of Competition Pages
- **Goal:** Check my final standings in Men's Singles Division 1
- **Action:** Clicked on "Men's Singles Division 1 · 4th · 26 pts" link from home page
- **Outcome:** Loaded a single page showing all divisions (1, 2, 3, 4) with full match histories for every player and every match in each division
- **Confusion or annoyance:** I just wanted to see Division 1. Instead I got Divisions 1-4 with hundreds of lines of match details. Had to scroll through thousands of characters to see my final standing. The page says it's cut at 15,000 characters and suggests using --grep or --from to navigate further. Not user-friendly.
- **Severity:** painful
- **URL:** /competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b#mine

##### 4. No Clear Season Closing State or Urgency
- **Goal:** Confirm that today is the final day and understand what happens next
- **Action:** Read the home page messaging
- **Outcome:** Page says "Your season is open · Autumn 2026" and "Results close in 70 days" - no indication this is the last day or any urgency
- **Confusion or annoyance:** There's no visual indicator that this is the final day results can be submitted. No countdown timer showing hours remaining, no red warning, no "Final day!" banner. Just confusing 70-day message. A player could easily think they have time and miss the deadline.
- **Severity:** blocker
- **URL:** http://localhost:8790/

##### 5. Unclear Next Season Confirmation Status
- **Goal:** Verify my next season participation is properly recorded (Singles + Doubles with Rory Kelly)
- **Action:** Checked the "Next season" section on home page and Men's Doubles page
- **Outcome:** Home page shows "Men's Singles: playing [change]" and "Men's Doubles: playing with Rory Kelly [change]" but doesn't explicitly say "Confirmed" or "Saved"
- **Confusion or annoyance:** It's not crystal clear whether these are defaults (in which case I need to confirm) or whether they're already confirmed. I had to navigate to the Men's Doubles page and find a form with a radio button checked for "Play with Rory Kelly" to feel confident that it was actually saved. No confirmation message appears after making changes.
- **Severity:** minor
- **URL:** http://localhost:8790/ and /competitions/01a10688-c249-7d57-8c1e-a82a69b2bb86

##### 6. No Match History Sort/Filter Options
- **Goal:** Review my season's progression to see how I performed over time
- **Action:** Looked at my "Played (12)" matches list on home page
- **Outcome:** Matches are listed but not organized chronologically or by week. Week 1 matches might be listed between Week 5 matches
- **Confusion or annoyance:** Without clear sorting, it's hard to see how my season progressed. Did I start strong? Did I fade? The list doesn't tell the story clearly. Would be better sorted by date or week played.
- **Severity:** minor
- **URL:** http://localhost:8790/

##### 7. Scores Display Shows "4 Oct" Everywhere
- **Goal:** Verify one of my match scores to make sure it was recorded correctly
- **Action:** Clicked on "Dominic Moore Men's Singles 4 Oct · Won 6-2, 6-2" to view the full match
- **Outcome:** Match detail page confirms 6-2, 6-2 win, but also shows "played 4 Oct 2026" - even though this match was in Week 1 (11 Oct based on my notes)
- **Confusion or annoyance:** Another date issue. The date is wrong or the display is showing a default date. Makes me question data integrity.
- **Severity:** minor
- **URL:** /matches/01a10688-bc8f-7d31-8c09-ecf6f489d711

##### 8. Long Standings Table with Minimal Visual Hierarchy
- **Goal:** Find my ranking in Men's Singles Division 1
- **Action:** Navigated to Men's Singles page, scrolled through Division 1 table
- **Outcome:** Large table with many columns (P, W, L, GW, GL, +/−, Pts) and rows with player names and match details mixed in
- **Confusion or annoyance:** The table is dense and hard to scan quickly. The rows with checkboxes and match details make it harder to see just the standings. A more compact view (just the ranking table without all the match details inline) would be easier to read.
- **Severity:** minor
- **URL:** /competitions/01a10688-bbb3-7a5d-8677-5fd94e4b4e3b

---

##### Summary

Overall, the league website is functional and got me through the season. All my results are recorded correctly and confirmed. However, there are several usability pain points, especially around:

1. **Deadline clarity** - The countdown timer showing "70 days" on the final day is the biggest issue. Dangerous from a user perspective.
2. **Date accuracy** - Match dates all showing "4 Oct" raises questions about data quality.
3. **Information architecture** - Pages are too long and show too much information at once. Need better filtering/organization.

The site works well for someone patient and detail-oriented (like me as a tester), but could frustrate casual players who need clearer status messages and less information overload. The "no matches outstanding" status is good - clearly indicates my season is complete. But the season-closing experience could be much better with urgency messaging and confirmation dialogs.

For next season, I'd recommend:
- Fix the countdown timer to show actual days remaining
- Correct or clarify match play dates throughout the system
- Add division-specific filtering on standings pages
- Add explicit "Season Ending Tonight" or countdown-to-midnight messaging
- Add confirmation messages when next-season choices are saved
- Consider breaking up long standings pages into separate views

Finished 4th in singles (26 pts), 2nd in doubles with Rory (24 pts). Confirmed for next season: Singles + Doubles with Rory Kelly.

### Tomasz Nowak

#### Tomasz's Friction Log - Autumn 2026 Season End (13 December 2026)

##### 1. Confusing score notation in announcements
**Goal:** Understand if my match with Callum Byrne was correctly entered after dispute
**Action:** Looked at Helen's announcement mentioning the disputed match with notation "4-6 6-3 10-8 to him"
**Outcome:** Unclear what "to him" means - does it mean Callum won or that those were the scores from his perspective?
**Confusion or annoyance:** The notation is ambiguous for non-native English readers. "To him" could mean either "in Callum's favour" or "from Callum's view." Had to contact Helen and Callum for clarification.
**Severity:** painful
**URL:** Announcements from Helen via WhatsApp

##### 2. Cannot see opponent's score when entries don't match
**Goal:** Diagnose why my score entry didn't match Callum's entry
**Action:** Checked the match page after entering my score - it said "entries do not match"
**Outcome:** Could not see what Callum actually entered, only that we disagreed
**Confusion or annoyance:** Makes diagnosis impossible without contacting the opponent and coach. If I had been able to see "8-10 (his games first)" I would have immediately known he meant I won 10-8 but got the notation backwards.
**Severity:** painful
**URL:** /competitions/[...] match result entry page

##### 3. Contact method mismatch - email-only players
**Goal:** Arrange final match with Stefan Barnes before deadline
**Action:** Looked for Stefan's contact info on site, found email only; tried WhatsApp but he wasn't listed
**Outcome:** Could not reach Stefan until Helen got involved; even then, Stefan never messaged me despite Helen asking him to
**Confusion or annoyance:** The club assumes everyone has email, but WhatsApp-only players can't reach email-only players. System doesn't show which contact methods each player has.
**Severity:** painful
**URL:** /competitions/[...] player contact info

##### 4. Coach asking for email after I said WhatsApp only works
**Goal:** Keep communication channel open while being clear I use only WhatsApp
**Action:** Told Helen "WhatsApp is absolutely fine" when she kept asking for email
**Outcome:** Helen accepted it, but I had to say it multiple times across the season
**Confusion or annoyance:** Helen kept asking for email address despite me explaining I only use WhatsApp. The site treats email as mandatory.
**Severity:** minor
**URL:** WhatsApp messages

##### 5. Misleading countdown on deadline day
**Goal:** Check when results close and ensure my scores are in
**Action:** Opened site on 13 December, the day results close
**Outcome:** Site showed "Results close in 70 days (Sun 13 Dec)" - this is contradictory and confusing on the actual deadline day
**Confusion or annoyance:** The countdown message doesn't update properly. Shows static text rather than something like "Results close TODAY" on the final day. Makes me wonder if the system even knows it's the deadline.
**Severity:** minor
**URL:** / (home page)

##### 6. Generic responses instead of scheduling confirmations
**Goal:** Schedule final matches early in the season
**Action:** Asked Raj Wood, Hugo Collins, Malik Rose to confirm match times
**Outcome:** All three sent the same generic message: "Happy to have a hit, but I don't think we're drawn against each other in the league?"
**Confusion or annoyance:** They either didn't understand my messages or were copying/pasting a template. Made it hard to schedule matches. Later I played all three successfully, so they were definitely drawn against me - the responses were just unhelpful.
**Severity:** painful
**URL:** WhatsApp messages

##### 7. Promotion/relegation rules not explained on site
**Goal:** Understand if I'm promoted, relegated, or staying in Division 3
**Action:** Looked at the standings table on the competition page
**Outcome:** I saw arrows (▲ and ▼) next to some players' names but no legend or explanation of what they mean. Appears top 2 go up, bottom 2 go down, but this is never stated.
**Confusion or annoyance:** Visual indicators without explanation make the user guess the rules. I had to infer this from the arrows and positions.
**Severity:** minor
**URL:** /competitions/[...] Division 3 standings table

##### 8. Need for fresh sign-in link multiple times
**Goal:** Stay signed in to enter match results
**Action:** Used initial K96 link, but had to request K150 when it expired, then K169 at the end
**Outcome:** Had to ask Helen for new links three times across the season
**Confusion or annoyance:** Links expire and only work once. This makes sense for security, but having to message Helen every time is tedious. The site doesn't offer a self-serve "send me a new link" button.
**Severity:** minor
**URL:** WhatsApp messages from Helen, / (login redirects)

##### 9. Stefan Barnes never reached out despite Helen asking
**Goal:** Play my final optional match against Stefan Barnes
**Action:** Waited for Stefan to message me as Helen said he would
**Outcome:** Stefan never messaged; no match played; results now closed
**Confusion or annoyance:** Helen said Stefan has my number and she'd ask him to contact me. He didn't. Makes me wonder if he lost my number, didn't get the message, or forgot. No way to escalate this on the site.
**Severity:** fine (optional match, already met minimum)
**URL:** WhatsApp messages from Helen, / (match still showing as "to play")

##### 10. Next season details missing from site
**Goal:** Understand when Spring 2027 league starts and if I'm automatically included
**Action:** Checked home page under "Next season" section
**Outcome:** Only says "If you do nothing, you stay in for next season" and "SPRING 2027 starts in January"
**Confusion or annoyance:** No specific start date, no draft/registration process shown, no way to see the new divisions yet
**Severity:** minor
**URL:** / (home page, "Next season" section)

---

##### Overall Assessment

This was my first season using the new website. The core functionality works well - entering scores is smooth, the standings are clear, and I enjoyed the competition. However, there are friction points around communication and clarity:

**What works:** Results entry is intuitive, standings display is clear, sign-in links are convenient (when they work), the system kept me signed in between sessions.

**What needs fixing:** When score disputes happen, players should be able to see each other's entries side-by-side to diagnose the issue without escalating to Helen. The site assumes everyone uses email, but should support mixed contact preferences. Countdown timers should update on the deadline day. Promotion/relegation rules should be explicitly stated, not shown with arrows. Contact directories should show which methods each player prefers.

**What I'd tell the club:** The website is a big improvement over paper. Just make it easier for players to contact each other through their preferred method (WhatsApp, phone, email), show score disputes clearly, and explain the seasonal rules on the site rather than relying on email announcements. Also fix that countdown timer on the final day.

I finished 4th in Division 3 (27 points, 6 matches played, 4 wins, 2 losses) and I'm staying in Division 3 for Spring 2027. Solid mid-table result. Looking forward to next season.

### Grace Adeyemi

#### Grace's Friction Log - s1-end (Sunday 13 December 2026)

##### 1. Result Entry Mismatch - Dominic Bennett/Jade Mahmood Mixed Doubles

**Goal:** Enter Mixed Doubles result from Week 10 match

**Action:** Filled form with Set 1: 6-4, Set 2: 6-2, selected "We played it out" (outcome: completed)

**Outcome:** Result saved, but page shows "entries do not match" - opponent entered a different score. System requires both sides to agree independently, then coach resolves if they don't match.

**Confusion or annoyance:** The system does not make it clear upfront that both players must enter matching results. When the mismatch appears, the UI suggests contacting the opponent outside the app to agree on the correct score, then re-entering it. This puts the burden on players to manually verify rather than the system providing tools to discuss the discrepancy.

**Severity:** Minor

**URL:** /matches/01a10688-c57a-74fc-8a8a-8ec793545968

---

##### 2. Unclear Match Scheduling - Women's Doubles Doubles Booking

**Goal:** Confirm which of 2 remaining Women's Doubles matches is actually scheduled for today

**Action:** Reviewed messages from Emily Hale (with Lily Palmer) and Paige Booth (with Megan Ward). Both confirmed "Yes, let's do it — how about Sunday afternoon at 2 at Hollins Park?"

**Outcome:** Both matches show as "To play" on the website and both opponents confirmed the exact same time/location (Sunday 2pm at Hollins Park). It's now late Sunday evening and neither match appears to have been played. Unclear if the messages were responses to separate scheduling requests or if there was a double-booking.

**Confusion or annoyance:** Very confusing. The website does not provide any scheduling tool or calendar to prevent double-booking. The messaging system showed repeated responses of the same confirmation text, which felt like the app was sending match history instead of actual messages (confirmed in previous checkpoints as a bug). Cannot clearly see which match is actually scheduled for when, or if both teams expected the same 2pm slot.

**Severity:** Painful

**URL:** / (home page shows 2 Women's Doubles matches "To play"), /matches pages show "Still to play"

---

##### 3. Vera Cross Unreliability - Partner Ghosting

**Goal:** Play Women's Doubles matches with reliable partner

**Action:** Attempted to coordinate with Vera Cross for matches throughout the season. Vera missed a match in Week 6 and did not respond to messages for 2 weeks.

**Outcome:** Changed partner preference from Vera Cross to "let coach find someone" before the final checkpoint. Vera's match history confirms she played some Women's Singles matches but was unavailable or unresponsive for Women's Doubles with Grace.

**Confusion or annoyance:** Grace cares about reliable partners (per brief) and was frustrated by Vera's unreliability and lack of communication. This significantly impacted the season - Women's Doubles record is 0 wins, 3 losses with only 3 matches played (below the target of 4+). Missing the Vera partnership timing means fewer matches played.

**Severity:** Painful

**URL:** / (partner selection shows "new partner" selection now)

---

##### 4. Date Constraint Issue - Match Date Entry

**Goal:** Enter accurate date for Week 10 matches played in early December

**Action:** Submitted match result form without modifying the date field (which showed "max 2026-10-04" as a constraint)

**Outcome:** System accepted the result but the date shows as "played 4 Oct 2026" when the match was actually played in Week 10 (early December). The date constraint in the form appears to be from the original match creation date, not updated for late-season entries.

**Confusion or annoyance:** Confusing because the form shows an outdated date constraint ("max 2026-10-04") when entering a Week 10 result. This could mislead players into thinking they can't enter late-season results, or the correct date won't be saved. The system accepted the wrong date without questioning it.

**Severity:** Minor (results still count, but historical record is incorrect)

**URL:** /matches/01a10688-c57a-7dd1-b124-c02979aaac52#report

---

##### 5. Messaging System Bug - Match History Instead of Responses

**Goal:** Coordinate match schedules with opponents via messaging

**Action:** Sent messages to Emily Hale and Paige Booth proposing times; received what appeared to be responses confirming "Sunday 2pm at Hollins Park"

**Outcome:** The same confirmation text appeared multiple times in the message thread in a pattern consistent with the system auto-sending match history instead of the player's actual responses. This was also confirmed in previous checkpoints (s1-w9) where messages included full match history instead of natural conversation.

**Confusion or annoyance:** Major usability bug - cannot reliably communicate with opponents through the app messaging system to coordinate match times. Players must resort to phone/email/WhatsApp for actual communication, making the built-in messaging feature unreliable and frustrating.

**Severity:** Blocker (impacts ability to schedule matches)

**URL:** / (inbox and message history from Emily Hale, Paige Booth)

---

##### 6. No Minimum Match Requirement Enforcement Before Close

**Goal:** Know if 4-match minimum will be met before season closes

**Action:** Checked website standings and match lists

**Outcome:** Women's Doubles shows only 3 matches played (below the 4-match minimum mentioned by coach). The website shows matches "still to play" but with results closing tonight, it's unclear if the requirement will be enforced or if Grace will be excluded from Spring draft. No warning or alert on the home page about being below the minimum.

**Confusion or annoyance:** Grace would be concerned about potentially missing the Spring draft if the 2 remaining WD matches don't get played. The coach's announcement said "anyone under the 4-match minimum when the season closes is LEFT OUT of the Spring draft" but the website provides no pre-closing warning about being at risk.

**Severity:** Painful

**URL:** / (home page shows Women's Doubles 5th place with "going down" indicator)

---

##### Summary

Grace successfully entered the 2 Mixed Doubles results she played in Week 10 (1 confirmed, 1 disputed) and confirmed her partnership preferences for next season (new Women's Doubles partner, keep Robbie Edwards for Mixed). However, the final Women's Doubles matches remain unplayed due to scheduling confusion and likely won't be completed before results close tonight.

The main friction points are:
1. **Messaging bug** - System sends match history instead of actual player responses, making scheduling coordination unreliable
2. **No scheduling tool** - Players must coordinate match times through external messaging (WhatsApp, email) while the app only supports text messaging that doesn't work reliably
3. **Partner reliability** - No mechanism to flag or avoid unreliable partners; Grace had to wait until mid-season to switch away from Vera Cross
4. **Double-booking allowed** - Multiple players can "confirm" the same match slot without the system preventing conflicts
5. **Result matching** - When two sides enter different scores, the burden is on players to resolve it outside the app

Grace would recommend to the club:
- Fix the messaging system so actual player messages are sent, not match history
- Add a built-in scheduling/calendar feature to the website to prevent double-booking and confirm match times
- Provide warnings before the season closes if a player is below the match minimum
- Consider player reliability ratings or a system to report ghost/no-show players
- Make sure date fields are properly initialized for late-season result entries

Overall: The website is functional for tracking results and standings, but the scheduling/coordination features are unreliable and force players to use external communication methods. Grace had a mixed season (strong in Mixed Doubles, weak in Women's Doubles due to partner issues) but wishes the site made it easier to coordinate matches and find reliable partners.

### Derek Mills

#### Derek Mills - Friction Log (s1-end, Sunday 13 December 2026)

##### 1. Confusing "Results close in X days" message
- **Goal:** Understand the deadline for entering results
- **Action:** Checked home page which says "Autumn 2026 · Results close in 70 days (Sun 13 Dec)"
- **Outcome:** Saw the message but date seemed off (it IS Dec 13th)
- **Confusion or annoyance:** The countdown timer showed 70 days when it should show 0 days (or say "today"). Made me momentarily wonder if the date was wrong or if I was confused about the calendar.
- **Severity:** minor
- **URL:** http://localhost:8790/

##### 2. Robbie Edwards shown as "To play" despite already playing him
- **Goal:** Understand which matches need result entry
- **Action:** Checked home page showing matches needing answers vs matches to play
- **Outcome:** Robbie Edwards was listed under "To play (1)" but according to my diary I had played him in Week 10
- **Confusion or annoyance:** Wasn't sure if I had actually played Robbie or not. Made me think I'd missed entering a result.
- **Severity:** minor
- **URL:** http://localhost:8790/

##### 3. Date field locked to October 4th for score entry
- **Goal:** Enter result for Week 10 match (played around Dec 8)
- **Action:** Filled in scores on the match result form
- **Outcome:** Date field showed "2026-10-04" as the max date allowed, which is the start of the season not when Week 10 matches were played
- **Confusion or annoyance:** Wondered if the date constraint was correct. Should I have entered the real match date? The form didn't let me change it so I left it.
- **Severity:** minor
- **URL:** http://localhost:8790/matches/01a10688-bd4f-76fd-837b-8109b97b11eb#report

##### 4. Unclear when Robbie Edwards' result would be confirmed
- **Goal:** Complete all score entry for the season
- **Action:** Entered my Robbie Edwards result (6-4, 6-0)
- **Outcome:** Score shows as sent but with message "Waiting for Robbie Edwards to enter their result independently"
- **Confusion or annoyance:** After entering three other results that both matched and counted immediately, this one shows as still pending. It's clear this is normal (both sides must agree) but the home page still shows Robbie under "Waiting for your opponent" which made me wonder if there's something else I need to do.
- **Severity:** minor
- **URL:** http://localhost:8790/matches/01a10688-bd4f-7924-9a81-5c186349ddaf?done=sent

##### Summary
Overall, the league website is working well for me. I was able to enter all my outstanding match results quickly before the deadline. The form was clear and straightforward. The main confusion was around the UI messaging - things like the countdown timer being inaccurate and Robbie Edwards showing in the wrong category initially. I'd tell the club: the site does what it needs to do, though the messaging about deadlines and match status could be a bit clearer. I'm satisfied I got my scores in.

### Sofia Marin

#### Sofia's Friction Log - Season 1 End (s1-end)
##### Checkpoint: Sunday 13 December 2026 - Results Close Day

###### Entry 1: Understanding Recovery Timeline vs. Draft Schedule
- **Goal**: Determine when to resume from my injury break and understand implications for Spring 2027 season
- **Action**: Reviewed homepage showing "on a break" status and "I am back" button; checked all competition standings
- **Outcome**: Discovered that pressing "I am back" will put me in Spring 2027 draft immediately, but my physio says I can't play until February 2027
- **Confusion or annoyance**: The site has no way to indicate "I want to return but not until February" - it's binary (on break or back). I had to contact Helen via WhatsApp to ask when to resume. For an injured player trying to manage recovery, this is frustrating because the timing decision can't be made on the site alone.
- **Severity**: painful
- **URL**: /

###### Entry 2: Countdown Display Inaccuracy
- **Goal**: Verify when results close to understand the season timeline
- **Action**: Viewed the main page which shows "Results close in 70 days (Sun 13 Dec)"
- **Outcome**: The countdown displays 70 days, but I'm viewing this on Sunday 13 December when results should close tonight
- **Confusion or annoyance**: The counter is clearly wrong - either the date calculation is broken or the page wasn't updated for the current season. This creates uncertainty about actual deadlines.
- **Severity**: minor
- **URL**: /

###### Entry 3: Automatic Division Exclusion Due to Injury
- **Goal**: Understand what divisions I'll be in for Spring 2027 when I return
- **Action**: Checked Women's Singles standings and saw I have only 1 match played out of 4 minimum required
- **Outcome**: The site automatically marks injured players as "withdrawn" and won't count their participation for next season qualification. Women's Singles shows I'll be excluded from Spring 2027 draft automatically.
- **Confusion or annoyance**: There's no override or notation that my low match count was due to injury rather than lack of commitment. An injured player can be unfairly punished by the 4-match minimum rule. A note like "injured - eligible despite <4 matches" would be fair.
- **Severity**: painful
- **URL**: /competitions/01a10688-bf18-7832-a61c-1521e5436dd5

###### Entry 4: Unclear Partnership Status During Break
- **Goal**: Understand what happens to my doubles partnerships when I'm on a break
- **Action**: Reviewed Women's Doubles and Mixed Doubles standings
- **Outcome**: Both partnerships (Dana Park/Sofia and Arjun/Sofia) show as "withdrawn" but there's no explanation of whether partners should find someone new for Spring 2027 or whether the site expects me to resume with them
- **Confusion or annoyance**: Players on a break should know if they should release their partner or if the partnership will be preserved. This creates uncertainty for my partners about whether they should look for other partners now.
- **Severity**: minor
- **URL**: /competitions/01a10688-c394-7e14-8f79-0576661598a8 (Women's Doubles)

###### Entry 5: No In-Site Communication Channel to Coach
- **Goal**: Ask Helen when I should resume from my break given the February physio clearance vs. January draft start
- **Action**: Clicked around the site looking for a message/contact feature; found none
- **Outcome**: Had to resort to calling Helen's voicemail and sending a WhatsApp message instead of using the league website
- **Confusion or annoyance**: The site is good for viewing information, but players can't communicate directly through it. All important questions go through external channels (WhatsApp, phone). This feels like a missed opportunity for better player-coach coordination within the site itself.
- **Severity**: minor
- **URL**: /

###### Entry 6: Binary Break Status Doesn't Support Staged Recovery
- **Goal**: Communicate my planned return date (February) to the system
- **Action**: Reviewed break status which only offers "I am back" button (no other options)
- **Outcome**: There's no field or button to indicate "I want to return on [date]" or "I'll be available from February onward". The only option is to go from "on break" to "back" immediately.
- **Confusion or annoyance**: Real injuries need staged recovery. A physiotherapy student like me knows exactly when I'll be ready (February), but the system treats it as an all-or-nothing decision. Better UX would let me indicate when I expect to be fit.
- **Severity**: painful
- **URL**: /

##### Overall Assessment
The league website handles normal play scenarios well, but it's not designed for injured players managing recovery and staged return. The 4-match minimum rule makes sense for normal players but unfairly penalizes injured players. The site also lacks ways to coordinate with the coach directly about recovery timelines - critical information flows through WhatsApp instead.

For the club: This is a good website for an active league, but consider adding features for injured players: (1) option to indicate "will return on [date]", (2) coach override for 4-match minimum if player was injured, (3) messaging feature within the site so important decisions aren't scattered across WhatsApp, SMS, and email. Also fix the countdown display - it breaks trust in the site's accuracy.

Most importantly: I need to hear back from Helen about whether I should resume now (as someone unavailable until February) or wait until closer to February. This is a basic question that the site should be able to help answer without needing to chase the coach down.

### Hannah Cole

#### Friction Log - Checkpoint s1-end (Sunday 13 December 2026)

##### Issue 1: Incorrect season countdown on website
- **Goal:** Understand when the current season ends and when the next one starts
- **Action:** Viewed home page to check season status and timeline
- **Outcome:** Page displays "Results close in 70 days" - but today is 13 December when results close tonight
- **Confusion or annoyance:** The timer is clearly wrong. This confused me about whether results actually close today or in 70 days.
- **Severity:** minor
- **URL:** http://localhost:8790/

##### Issue 2: Social sessions information not available on the website
- **Goal:** Find out when and where social sessions happen to practice as a beginner
- **Action:** Searched the website repeatedly for social session schedules - checked home page, matches, tables, division pages
- **Outcome:** No information found anywhere on the site. Only learned about Tuesday 6:30-8:30pm, Thursday 6:30-8:30pm, and Saturday 9-11am sessions from Helen's WhatsApp message
- **Confusion or annoyance:** As a newcomer trying to get involved and build confidence, I had to wait for a direct message from the coach rather than finding this info myself on the website. Very unhelpful.
- **Severity:** painful
- **URL:** http://localhost:8790/

##### Issue 3: No dedicated Matches page or unclear navigation
- **Goal:** See my upcoming matches or get clarity on what matches I'd have
- **Action:** Clicked on "Matches" link from navigation
- **Outcome:** Link takes me to the same home page (/). No separate matches listing or detail page.
- **Confusion or annoyance:** Navigation feels broken or unclear. I expected a Matches page to show my upcoming fixtures.
- **Severity:** minor
- **URL:** http://localhost:8790/

##### Issue 4: No visibility into next season dates or division placement
- **Goal:** Understand when Spring 2027 season starts and when I'll know my division/opponents
- **Action:** Checked website for schedule information
- **Outcome:** Page says "Next season's name and dates have not been announced yet" and "You do not need to do anything now." Helen's WhatsApp clarifies divisions will be done next week, aiming for before Christmas, matches start early January. Site doesn't show any of this.
- **Confusion or annoyance:** Important timeline info should be on the site, not just in WhatsApp messages. What if I missed Helen's message?
- **Severity:** painful
- **URL:** http://localhost:8790/

##### Issue 5: 8-week silence between approval (10 Oct) and season close (13 Dec)
- **Goal:** Understand what happens after approval and when I'd get to play
- **Action:** Approved on 11 Oct, checked website regularly, messaged Helen twice (week 5 and week 9) asking about timeline
- **Outcome:** Got responses but had to ask directly. Website never proactively told me I needed to decide on singles vs doubles, no reminders about placement process
- **Confusion or annoyance:** Long wait with unclear communication. As a nervous beginner, more proactive updates would reduce anxiety
- **Severity:** painful
- **URL:** http://localhost:8790/

##### Issue 6: No way to indicate doubles partner preference on website
- **Goal:** Let Helen/the coach know I'm interested in doubles and what my partner preferences are
- **Action:** Site provides no form or way to indicate this. Helen had to ask me directly via WhatsApp.
- **Outcome:** Managed through messaging, but not a scalable solution
- **Confusion or annoyance:** The site should have a form where new members indicate singles/doubles interest
- **Severity:** minor
- **URL:** http://localhost:8790/

##### Issue 7: "Take a break" button feels irrelevant
- **Goal:** Get clarity on next steps as an eager newcomer
- **Action:** Viewed the home page which shows a "Take a break" button and form
- **Outcome:** Button is for players who want to opt out - not relevant to me who is excited to start
- **Confusion or annoyance:** This button actually makes me more anxious - it's the only action I can take on the site, but it's the opposite of what I want
- **Severity:** minor
- **URL:** http://localhost:8790/

##### Overall sentiment

I'm genuinely excited about playing in the league - I joined specifically to play tennis with others at my level. The website works okay for viewing standings and understanding the league structure, but it's not very helpful for new players in the approval/placement phase. I've had to rely entirely on Helen's WhatsApp messages to stay informed about deadlines, social sessions, and what happens next. The site should proactively communicate the placement process timeline and ask new members about their format preferences (singles/doubles) rather than leaving them in the dark. I'm nervous about starting in January - I hope the league is as friendly as Helen seems to be.

---

## Checkpoint s2-start

### Helen Marsh (coach)

#### Friction log: Helen Marsh (coach), s2-start, Sunday 10 January 2027

1. **Goal:** Check that Spring 2027 looks right the night before it starts.
   **Action:** Dashboard, then Tables, going through each competition and division.
   **Outcome:** All 258 fixtures are there and every division and doubles pair matches what I set before Christmas. But the header says "Results close in 175 days (Sun 28 Mar)", and the Activity page dates everything "4 Oct 2026", including the coding agent's fixes from December.
   **Confusion or annoyance:** The divisions are right, which is what matters. But the day count is wrong (it should be about 77 days) and the dates are wrong too, so I can't trust anything on the site with a date on it.
   **Severity:** minor
   **URL:** /coach, /coach/tables/…, /coach/activity

2. **Goal:** Show the newcomers' full names in the tables.
   **Action:** Looked through Members for a way to edit "Ravi M.", "Nora Q." and "Hannah C.".
   **Outcome:** The Members page only lets me edit contacts, level, gender and age group. There's nowhere to change a name, so the tables still show the shortened names.
   **Confusion or annoyance:** Opponents in Division 4 have to work out who "Nora Q." is. I can't fix a name from the coach site.
   **Severity:** minor
   **URL:** /coach/members, /coach/tables/…

3. **Goal:** Get the same four never-signed-in players (Bella, Gavin, Kofi, Robbie) onto the site before their first matches.
   **Action:** Members > "Show only those placed but never signed in" > Sign-in link for each, then WhatsApped the links to their partners.
   **Outcome:** The links were easy to make. All the partners replied "Thanks Helen, that worked", but none of the four shows as signed in, and Gavin's December link was never used either. Grace then texted twice asking me for Robbie's number, so she has no way to reach her own mixed partner.
   **Confusion or annoyance:** It's the fourth time I've tried this and it's still a dead end. "That worked" tells me nothing. A note on the Members page saying the link was made but never opened is the only thing I can actually check.
   **Severity:** painful
   **URL:** /coach/members?…never signed in

4. **Goal:** Save Gavin Evans's mobile (from Phoebe) so I can text him directly.
   **Action:** Typed only the phone number in his "Save contacts" form.
   **Outcome:** "Contacts not saved: Enter a valid email address and telephone number." Gavin has no email, so the site won't keep his number, and because the number isn't on the site I can't even phone him through it.
   **Confusion or annoyance:** Two sessions running now. Plenty of members are phone-only, and the form wants both fields or nothing.
   **Severity:** painful
   **URL:** /coach/members/…/contacts

5. **Goal:** Find out whether the three late newcomers (Hamza Pearce, Neil Allen, Molly Shaw) want to play this spring.
   **Action:** WhatsApped and then phoned each with a yes/no question.
   **Outcome:** All three only said "I haven't played any league matches yet this season". I didn't get a yes from any of them, so I didn't place them.
   **Confusion or annoyance:** It's frustrating, but that's people for you. The bigger worry is that I couldn't find any way on the coach site to add a late player to a running division. If one does say yes, I'm back to the coding agent.
   **Severity:** minor (painful if one says yes)
   **URL:** /coach/tables, /coach/season

6. **Goal:** Sort out players being told "we're not drawn against each other".
   **Action:** Marcus Bell and Tomasz Nowak both messaged me. I checked Tables (Spring 2027, Div 1 and Div 3) and phoned Noah Grant.
   **Outcome:** The site is correct. Noah only talked about his autumn matches, so I think opponents are looking at last season's draw. I told Marcus and Tomasz and put "look at SPRING 2027" in the announcement.
   **Confusion or annoyance:** I can't see what a player sees, so I can't tell whether the player site makes it easy to land on the old season. The front page just shows me a sign-in box.
   **Severity:** minor
   **URL:** /coach/tables/…, /

7. **Goal:** Tidy up the one undecided autumn match (Stefan Barnes v Tomasz Nowak).
   **Action:** Season tab, "How Autumn 2026 closed", and asked Tomasz again.
   **Outcome:** The page lists it clearly but says I can only "reopen through the API" to change it. Tomasz hasn't answered yet.
   **Confusion or annoyance:** I don't know what an API is. If Tomasz agrees, I'll need the coding agent just to record a score.
   **Severity:** minor
   **URL:** /coach/season

8. **Goal:** Make sure I don't end the season by accident again.
   **Action:** Opened the Season tab.
   **Outcome:** "End season now" is the only link under Spring 2027, in the same place as in December.
   **Confusion or annoyance:** After last time it makes me nervous. It's a big plain link with no warning colour, on a page I visit just to read things.
   **Severity:** minor
   **URL:** /coach/season

9. **Goal:** Weather forecast for players.
   **Action:** Weather tab.
   **Outcome:** It still says "The forecast could not be fetched just now", three months on.
   **Confusion or annoyance:** I've given up expecting it to work.
   **Severity:** minor
   **URL:** /coach/weather

10. **Goal:** Get Scott Thorne's real mobile (his record has Dmitri James's).
    **Action:** Tried to WhatsApp him.
    **Outcome:** My phone says I have no number for him. I'll have to email.
    **Confusion or annoyance:** A wrong number I can't clear has left me with no working number at all.
    **Severity:** minor
    **URL:** /coach/members

11. **Goal:** Get players going.
    **Action:** Answered Hannah Cole twice (how to arrange matches, courts, social sessions) and sent a whole-club announcement.
    **Outcome:** Both sent fine. The Results page is clean: no disputes and nothing waiting.
    **Confusion or annoyance:** none
    **Severity:** fine
    **URL:** /coach/results

Coding agent: not used this session.

How I feel: tonight was calm. The season I built in December is exactly as I left it, and nothing needed fixing on the site. The jobs that keep eating my time are the same as ever: the four members with no contact details, a phone number I can't save without an email, and no website way to add or withdraw a player once a season is running. I'd tell the club the site is fine for running the league week to week, but someone needs to fix the contact-details form and the date display before summer.

### Marcus Bell

#### Marcus Bell - Spring 2027 Start (s2-start) Friction Log

##### Sunday 10 January 2027 - Day Before Season Starts

###### 1. Fixture List Mismatch - Players Don't See Their Scheduled Opponents

**Goal:** Arrange my first matches for the Spring 2027 league season

**Action:** 
- Opened the website and reviewed Division 1 standings and fixture list
- Found myself listed as needing to play 6 singles opponents: Noah Grant, Callum Hall, Elliot Ashworth, Ryan Wood, Ali Lee, Elliot Khan
- Clicked through to view individual match pages (confirmed matches exist: "Marcus Bell v Noah Grant", "Marcus Bell v Callum Hall", etc.)
- Retrieved opponent contact details from the match pages
- Messaged multiple opponents (Noah Grant, Callum Hall, Ryan Wood) via WhatsApp to arrange weekend matches

**Outcome:** All three players independently responded with the same message: "Happy to have a hit, but I don't think we're drawn against each other in the league?" This is completely inconsistent with what the website shows.

**Confusion or annoyance:** Extremely frustrating and confusing. The website clearly shows these players as my opponents on:
1. My home page under "To play (11)" - lists Noah Grant, Callum Hall, Ryan Wood, etc.
2. The standings table under each player - shows "Still to play: Marcus Bell" in their list
3. Individual match pages - loads match report form with their contact details

But when I contact them, they don't think we're scheduled to play. Either:
- There's a bug in how the website displays fixtures
- The players are confused about their own fixtures
- I'm misunderstanding how the league fixture system works

**Severity:** BLOCKER - This prevents me from arranging any matches with my scheduled opponents.

**URL:** localhost:8790, /competitions/01a10715-9923-71f2-98b6-5d7293edaac6 (standings), /matches/* (match pages)

---

###### 2. Date Field Defaults to Past Date in Match Report Form

**Goal:** Get a clear understanding of how to report match results

**Action:** Viewed several match report pages to see what data entry would look like

**Outcome:** The "Played on" date field defaults to "2026-10-04", which is several months in the past (the actual date in the simulation is 2027-01-10). This would cause confusion when actually reporting results.

**Confusion or annoyance:** Minor - the form is otherwise clear, but the default date is wrong and will require manual correction every time.

**Severity:** MINOR - Easy to fix, but adds unnecessary friction to result entry.

**URL:** localhost:8790/matches/* (all match pages have this issue)

---

###### 3. Unclear What "To Play (11)" List Represents

**Goal:** Understand my match schedule clearly

**Action:** Read the home page heading which says "To play (11)" followed by a list of 11 players/pairs

**Outcome:** The heading doesn't explain what these 11 items represent. I assumed they were my scheduled opponents, which caused confusion when I contacted them. It could potentially mean:
- Players I need to play against (my interpretation)
- Players who could potentially play against me
- Some other category

**Confusion or annoyance:** This is the root cause of the fixture mismatch issue. The labeling is ambiguous.

**Severity:** MINOR/PAINFUL - It's unclear, but after checking the standings tables I could confirm these were scheduled matches. However, the players' responses suggest maybe this list means something different.

**URL:** localhost:8790/

---

###### Summary

The most critical issue is the fixture mismatch: the website shows I have scheduled matches against multiple opponents, but when I contact them, they say we're not drawn against each other. This is a blocking issue that prevents me from playing the league. 

As a software tester, I would expect the league fixture system to work correctly from day one, especially when launching a new season. The fact that there's this fundamental discrepancy between what the website shows and what the players see/believe is a serious quality problem. 

My recommendation to the club: Before Spring 2027 starts, verify that all players can see the same fixture list. There's either a bug showing incorrect fixtures, or players aren't being notified about their scheduled matches clearly enough. This needs to be sorted urgently or the season will be unplayable.

### Tomasz Nowak

#### Friction Log - Checkpoint s2-start (10 January 2027)

##### Entry 1: Fixture Confusion - Resolved

- **Goal:** Find my Spring 2027 fixtures and start arranging matches
- **Action:** Opened site, viewed Division 3 standings and my home page; contacted all 5 listed opponents (Hugo Dale, Callum Byrne, Malik Rose, Scott Moore, Scott Thorne) via WhatsApp to arrange times
- **Outcome:** Website shows me in Division 3 with 5 fixtures listed. All 5 opponents initially responded "I don't think we're drawn against each other in the league?" Helen then confirmed the fixtures ARE correct - the players were confused and remembering last autumn's draw instead of checking Spring 2027.
- **Confusion or annoyance:** Initial confusion was significant - the identical response from all players suggested a real problem. But Helen's explanation makes sense: they weren't looking at the right season on the site. This is understandable but represents a usability issue - it should be very clear which season's fixtures you're viewing.
- **Severity:** Painful (initially), then resolved quickly by coach clarification
- **URL:** / (home page) and /matches/* (individual match pages)

##### Entry 2: Division 3 Placement - Surprising Ranking

- **Goal:** Understand my division placement for Spring 2027
- **Action:** Viewed the Division 3 standings table on the competition page
- **Outcome:** I'm placed 6th in Division 3, marked with ▼ "going down," even though it's the first day of the season with zero matches played. This placement is based on my finish from Autumn 2026 when I placed 4th.
- **Confusion or annoyance:** It's odd to see the "going down" indicator before any Spring matches are played. This might be a visual indicator of relegation risk rather than a prediction, but it's not clear. The relegation status should only be shown after final results, not at the start of a season.
- **Severity:** Minor
- **URL:** /competitions/01a10715-9923-71f2-98b6-5d7293edaac6

##### Entry 3: Contact Details - All Players Reachable

- **Goal:** Check if I can reach my opponents
- **Action:** Viewed match pages for each opponent to see their contact details
- **Outcome:** All 5 opponents have phone numbers listed and most have email. Since I only use WhatsApp/phone (no email), I'm able to contact all of them. Scott Moore has only a phone number (no email).
- **Confusion or annoyance:** None - this works well for me since I prefer phone/WhatsApp
- **Severity:** Fine
- **URL:** /matches/* (all match pages)

---

##### Overall Assessment

Initial confusion: When I tried to arrange my Spring 2027 matches, all 5 opponents said they weren't drawn together, which contradicted the website display. However, the coach quickly clarified that the fixtures ARE correct - the players were confused and looking at last autumn's draw instead of the new Spring 2027 season.

**Resolved:** My fixtures are confirmed as Hugo Dale, Callum Byrne, Malik Rose, Scott Moore, and Scott Thorne in Division 3.

**UX Issue:** The confusion shows that players can easily mix up which season's draw they're viewing. The site should make it very prominent which season is being displayed, especially when checking fixtures. The tab navigation (This season / Past seasons) helps, but it's easy to miss, and players accessing via links might not notice the season indicator clearly enough.

**Status:** Ready to proceed with arranging matches. I know who I'm playing and can contact them properly now. The confusion was painful in the moment but resolved quickly by Helen's clarification - good customer service from the coach!

### Grace Adeyemi

#### Grace's Friction Log - Spring 2027 Start

##### Usability Session: s2-start
Date: Sunday 10 January 2027 (day before season start)
Goal: Review new season fixtures, connect with new partner Dana Park, and begin arranging matches

---

###### Issue 1: Messaging System Broken - Template Responses

**Goal:** Contact new Women's Doubles partner Dana Park to coordinate match scheduling

**Action:** Sent multiple WhatsApp messages (3 separate messages) trying to explain that Dana and I are partners and need to arrange matches against other pairs. Also attempted a phone call.

**Outcome:** Every single response from Dana was identical: "Happy to have a hit, but I don't think we're drawn against each other in the league?" This suggests either a broken messaging system or Dana completely misunderstanding the pairing structure.

**Confusion or annoyance:** I explicitly explained multiple times that we ARE partners, not opponents, and that I wanted to coordinate our schedule. Dana kept responding as if I was asking to play against her. Extremely frustrating - can't arrange matches with my own partner.

**Severity:** Blocker

**URL:** /matches/01a10719-8943-7437-bac9-f5e0df454405

---

###### Issue 2: Messaging System Returns Match History Instead of Actual Responses

**Goal:** Confirm match arrangement with Emily Hale

**Action:** Sent WhatsApp: "Hi Emily! Dana Park and I are looking to play our Women's Doubles match against you and Lily soon - do you have any availability this week or next?"

**Outcome:** Response was Emily's entire match history from Autumn 2026 (4 matches listed with scores and dates), not an answer to my question about availability.

**Confusion or annoyance:** This is the same bug that happened last season! The messaging system is sending pre-recorded match data instead of actual player responses. It makes it impossible to coordinate.

**Severity:** Blocker (for coordination)

**URL:** /matches/01a10719-8943-7437-bac9-f5e0df454405

---

###### Issue 3: Repeated Template Responses from Multiple Players

**Goal:** Contact several opponents to arrange matches

**Action:** Sent individual messages to Jade Hart, Anna Evans, and others asking about availability

**Outcome:** Jade Hart and Anna Evans both replied with the EXACT same sentence: "Happy to have a hit, but I don't think we're drawn against each other in the league?" This is identical to Dana's responses.

**Confusion or annoyance:** Either the messaging system has a fundamental bug that sends template responses, or multiple people are confused about how the league works. Either way, it breaks communication completely. I can't tell if they're actually interested in playing or if they misunderstood.

**Severity:** Painful (communication failure)

**URL:** /matches/01a10719-8943-796d-a683-57f659393018 and /matches/01a10719-8943-7bea-8849-bf1c1aa21d39

---

###### Issue 4: Double-Booking Allowed - Two Matches Same Time/Court

**Goal:** Arrange Women's Doubles matches

**Action:** 
1. Contacted Lily Palmer/Emily Hale - arranged Sunday 2pm at Hollins Park
2. Contacted Paige James/Naomi Rees - arranged Sunday 2pm at Hollins Park

**Outcome:** The website allowed me to "confirm" two different matches for the same time slot (Sunday 2pm) at the same court (Hollins Park). No conflict warning or constraint enforcement.

**Confusion or annoyance:** This makes scheduling a nightmare. Both Lily and Paige independently offered "Sunday 2pm at Hollins Park" - maybe that's the default slot everyone suggests - but the website should prevent double-booking or at least warn me. Now I have to contact one of them to reschedule.

**Severity:** Painful (requires manual resolution)

**URL:** Home page / showed both matches in "to play" list

---

###### Issue 5: Missing Partner Contact Information

**Goal:** Get in touch with Mixed Doubles partner Robbie Edwards to arrange matches

**Action:** 
1. Checked website for his contact details - none listed ("ask the coach")
2. Messaged coach Helen Marsh asking for his number
3. Helen replied that she doesn't have his contact info either

**Outcome:** Robbie has no phone number or email on file. Helen can't provide his contact. She's asking me to "get it from him if you see him at the club" and passed me a sign-in link (K175) hoping he'll log in eventually.

**Confusion or annoyance:** This is the same problem I had with Robbie last season - he's a player who plays matches with me but has no contact details on file. I can't arrange our 5 Mixed Doubles matches without his phone number. Relying on spotting him at the club is not a reliable scheduling method.

**Severity:** Blocker (for Mixed Doubles coordination)

**URL:** /matches/01a10719-8c24-7518-9973-3a8bd22943e0

---

###### Issue 6: Identical Responses to Different Questions

**Goal:** Arrange Women's Doubles match with Paige Booth on different day than Sunday

**Action:** Sent message to Paige Booth: "We already have matches booked for Sunday afternoon - would Tuesday or Wednesday evening work better for you?"

**Outcome:** Paige Booth replied: "Yes, let's do it — how about Sunday afternoon at 2 at Hollins Park? I'll book a court."

**Confusion or annoyance:** This is word-for-word identical to Paige James's response, despite me asking about different days. The system is clearly not actually transmitting my messages or is sending automated responses. Very concerning.

**Severity:** Blocker (for meaningful communication)

**URL:** /matches/01a10719-8943-7f99-9a72-b27d46634cc6

---

##### Summary

The DeuceLeague messaging system has fundamental problems that make it nearly impossible to coordinate matches at the start of a new season. The issues are:

1. **Template/automated responses** - Multiple players giving identical responses regardless of context
2. **Match history instead of messages** - Player responses replaced with their previous season's match data  
3. **Broken partner coordination** - Can't communicate with my own partner about scheduling
4. **No double-booking prevention** - System allows conflicting matches
5. **Missing critical contact info** - Players without phone numbers on file can't be reached

I was able to get ONE match confirmed (Emily Hale/Lily Palmer, Sunday 2pm), though it creates a conflict with another Sunday 2pm booking. I cannot coordinate Mixed Doubles at all due to Robbie Edwards' missing contact details.

**What I'd tell the club:** The messaging system needs urgent repair. It appears to either be: (a) sending automated template responses, (b) returning cached match data, or (c) not actually transmitting player messages. None of these are acceptable for a functioning league site. Players can't organize matches if they can't communicate reliably. Also, please ensure all players have at least one contact method on file before the season starts - Robbie Edwards is unreachable.

### Derek Mills

#### Derek Mills - Friction Log: s2-start (Sunday 10 January 2027)

##### Summary
Derek is on a break from the league and takes a casual look at the Spring 2027 season starting tomorrow. The site clearly communicates his break status and gives him an easy way to see what's happening without being involved. No significant friction encountered.

##### Issues

1. **Email announcement**
   - **Goal:** Understand what's happening with the new spring season
   - **Action:** Received and read Helen Marsh's Spring 2027 season announcement email (#527)
   - **Outcome:** Clear information about start date (11 Jan), end date (28 Mar), format (same as autumn), new players, and player movements
   - **Confusion or annoyance:** None - the email is well-organized and informative
   - **Severity:** Fine
   - **URL:** Email

2. **Homepage break status display**
   - **Goal:** Confirm his break status is properly registered
   - **Action:** Opened homepage and saw the break message
   - **Outcome:** "You are on a break" message is prominent and clear; says "You are not in the draft for any season until you say you are back"
   - **Confusion or annoyance:** None - Derek finds this reassuring and clear
   - **Severity:** Fine
   - **URL:** /

3. **No outstanding matches notification**
   - **Goal:** Check if any action is needed from him
   - **Action:** Viewed homepage notification area
   - **Outcome:** Clear message "You have no matches outstanding" - indicates he needs to do nothing
   - **Confusion or annoyance:** None - this is exactly what he expected
   - **Severity:** Fine
   - **URL:** /

4. **Viewing spring season tables**
   - **Goal:** See what the new division looks like and who his former opponents are playing
   - **Action:** Clicked "Tables" link to view Men's Singles standings
   - **Outcome:** Can see all divisions and players with preliminary standings (all 0-0-0). Recognizes all the Division 2 players he played against in autumn (Dominic Bennett, Matt Tran, Robbie Edwards, Rory Kelly, Hugo Collins, Raj Wood, Gavin Evans)
   - **Confusion or annoyance:** None - the tables layout is clear though the page is quite long
   - **Severity:** Fine (comprehensive but readable)
   - **URL:** /competitions/01a10715-9923-71f2-98b6-5d7293edaac6

5. **Resume button availability**
   - **Goal:** Know how to rejoin if he changes his mind
   - **Action:** Saw the "I am back" button on the homepage
   - **Outcome:** Clear that he can easily resume playing by clicking this button - the break is not permanent
   - **Confusion or annoyance:** None - this is reassuring to Derek
   - **Severity:** Fine (good UX)
   - **URL:** /

6. **Navigation back to home**
   - **Goal:** Return to homepage after viewing tables
   - **Action:** Clicked "Matches" link while viewing tables
   - **Outcome:** Returned to homepage smoothly
   - **Confusion or annoyance:** None
   - **Severity:** Fine
   - **URL:** / (from /competitions/...)

---

##### Overall Impression

Derek finds the league website handles his break well. The homepage clearly communicates his status, and he can easily see what the new season looks like without feeling excluded or confused. He appreciates that the "I am back" button is visible, which reminds him the break is temporary if he decides to return. The email announcement from Helen was clear and informative. Derek is comfortable with his decision to take a break after a tough first season (1-5 record) and likes that the site makes this easy to manage. He'd consider playing again in a future season if his motivation improves. Overall, Derek feels the site is working smoothly for his situation - no friction, clear communication, and easy navigation.

### Sofia Marin

#### Sofia's Friction Log - Checkpoint s2-start (10 Jan 2027)

##### Summary
Great news this week: Helen responded clearly to my concern about when to return. The site correctly shows my break status, my previous matches are preserved, and I'm not in any Spring 2027 divisions as expected. The interface is straightforward for someone taking a break. Overall, the site works well for injured/returning players.

---

##### Issues

###### 1. Helen's Response to Timing Question
- **Goal:** Get clarity on when to press "I am back" given that Spring 2027 draft happens now but I won't be fit until February
- **Action:** Helen responded to my voicemail/WhatsApp from last week via WhatsApp
- **Outcome:** She said "Don't press 'I am back' yet - Spring runs 11 Jan to 28 Mar and gentle tennis from February isn't league tennis, so I'm leaving you out of Spring. Stay on a break and press 'I am back' when you're properly fit, and I'll put you in for the summer season."
- **Confusion or annoyance:** None - this was exactly what I needed to hear. Very clear and supportive.
- **Severity:** Fine (resolved my concern)
- **URL:** WhatsApp message from Helen Marsh

###### 2. Break Status Display on Home Page
- **Goal:** Understand what the site shows to a player on break
- **Action:** Signed in and opened the Matches page
- **Outcome:** Shows "You are on a break" with explanation: "You are not in the draft for any season until you say you are back. Your matches this season still count, so keep reporting them." Also shows "You have no matches outstanding" and displays a clear "I am back" button.
- **Confusion or annoyance:** None - the messaging is clear and helpful
- **Severity:** Fine
- **URL:** http://localhost:8790/

###### 3. Spring 2027 Division Listings
- **Goal:** Check if I appear in any Spring 2027 divisions (I shouldn't since I'm on break)
- **Action:** Navigated to Tables > Women's Singles > Spring 2027 divisions
- **Outcome:** I am not listed in any Spring 2027 Women's Singles division, which is correct. The season shows 7-8 players per division (down from my memory of previous seasons), and Helen's announcement mentioned some reshuffling due to opt-outs.
- **Confusion or annoyance:** None - this is correct behavior
- **Severity:** Fine
- **URL:** http://localhost:8790/competitions/01a10715-9940-76bb-bab1-259d0dd5fe20 (Women's Singles)

###### 4. Autumn 2026 Match Preservation
- **Goal:** Verify that my Autumn 2026 matches still count and are visible in the standings
- **Action:** Clicked through to past season (Autumn 2026) and checked Women's Singles Division 2
- **Outcome:** Found myself listed as "Sofia Marin (withdrawn)" with 1 match played, 1 loss (Nina Wood 0-6, 1-6), 1 point. The record correctly shows all my attempted matches including walkovers. This confirms my past season's results are preserved even though I'm on break.
- **Confusion or annoyance:** None - exactly as expected
- **Severity:** Fine
- **URL:** http://localhost:8790/competitions/01a10688-bf18-7832-a61c-1521e5436dd5

###### 5. Break Status Clarity
- **Goal:** Understand the functionality and messaging around the "break" feature
- **Action:** Reviewed the home page and tried to understand when/how to use "I am back" button
- **Outcome:** The interface is simple: while on break, players see "You are on a break" with one button "I am back" to resume. Helen specifically instructed me to wait until I'm "properly fit" - which gives me flexibility to judge my recovery. The site leaves the decision to the player and coach communication.
- **Confusion or annoyance:** None - the interface is minimal and clear
- **Severity:** Fine
- **URL:** http://localhost:8790/

---

##### Overall Assessment

The site handles injured/break players well. Helen's coaching is excellent - she's being proactive about my recovery timeline and clear that she'll put me in the summer season when I'm ready. The interface correctly excludes me from the Spring draft while preserving my previous season results. I'm comfortable waiting for February when I can play league tennis again. No usability issues found this checkpoint.

### Hannah Cole

#### Friction Log - Checkpoint s2-start (Sunday 10 January 2027)

##### Issue 1: No Guidance on Match Coordination Process
- **Goal:** Understand how to arrange and schedule my first tennis match in the league
- **Action:** Logged into website, checked my division, reviewed rules and league structure
- **Outcome:** Website clearly shows opponents and their contact details, but no guidance on how to actually schedule matches or check court availability
- **Confusion or annoyance:** As a beginner joining the league, I expected the website or coach communications to explain the typical process for arranging matches (e.g., "message your opponent, agree a time, book a court"). Instead I had to guess and just start messaging people
- **Severity:** painful
- **URL:** http://localhost:8790 (matches page and division tables)

##### Issue 2: No Match Confirmations Yet Despite Outreach
- **Goal:** Arrange my first match to start the season
- **Action:** Reached out to three opponents (Paige Hayes, Nora Quill, Harriet Fleming) via WhatsApp with friendly requests to play
- **Outcome:** Got responses showing their match history from previous season, but no actual confirmation of match times or availability
- **Confusion or annoyance:** It's unclear whether people are confirming they want to play or just sharing context. After reaching out, I'm uncertain what the next step is - should I keep waiting, suggest a specific time, or move to someone else?
- **Severity:** painful
- **URL:** Match coordination (WhatsApp messages)

##### Issue 3: No Court Booking or Availability System Visible
- **Goal:** Find out when courts are available to book for league matches
- **Action:** Explored the league website thoroughly, checked match pages, division information
- **Outcome:** No calendar view, court booking system, or guidance on how to reserve courts for matches
- **Confusion or annoyance:** Helen's earlier messages mentioned "social sessions" at specific times (Tue/Thu 6:30-8:30pm, Sat 9-11am) but I don't see any system for booking courts for league matches. How do other players coordinate court availability?
- **Severity:** painful
- **URL:** http://localhost:8790

##### Issue 4: Timing Pressure - Season Starts Tomorrow
- **Goal:** Get my first match scheduled before the season officially starts
- **Action:** Checked in on Sunday (day before season start) to see my placement and arrange matches
- **Outcome:** My placement is ready, opponents are known, but no matches are confirmed just hours before the season begins
- **Confusion or annoyance:** It feels rushed. With the season starting tomorrow and no confirmed match yet, I'm worried I might fall behind or get a slow start. Should I have been more proactive earlier?
- **Severity:** painful
- **URL:** http://localhost:8790

##### Issue 5: Helen Unreachable at Key Time
- **Goal:** Get direct coaching guidance on match scheduling and social sessions this week
- **Action:** Called Helen Marsh to ask about match coordination process and social session availability; also sent WhatsApp message
- **Outcome:** Call went to voicemail; WhatsApp sent but no reply yet
- **Confusion or annoyance:** As a nervous new player, I wanted to check in with the coach before diving into match coordination. Being unable to reach her leaves me uncertain about the process
- **Severity:** minor
- **URL:** Phone/WhatsApp communication

##### Issue 6: No "Contact Player" Feature on Website
- **Goal:** Arrange matches in a coordinated way through the league website
- **Action:** Explored the league website to see if there's a messaging system between matched players
- **Outcome:** Contact information is shown but there's no built-in messaging or match-scheduling feature on the site itself
- **Confusion or annoyance:** It would be helpful if the website had a "request match" or "suggest times" feature rather than requiring players to find contact info and coordinate outside the site
- **Severity:** minor
- **URL:** http://localhost:8790 (match pages)

##### Issue 7: Unclear Match Confirmation and Entry Process
- **Goal:** Understand how to officially confirm and enter match results
- **Action:** Reviewed match pages and rules about entering scores
- **Outcome:** Clear instructions about entering scores AFTER playing, but no clear process for CONFIRMING a match is happening before you play it
- **Confusion or annoyance:** The website says "agree what happened outside the app, then each side enters the full result independently" - but it doesn't explain how to confirm you're actually playing before you show up at the court
- **Severity:** minor
- **URL:** http://localhost:8790/matches/[match-ids]

##### Issue 8: Overwhelming But Welcoming Introduction
- **Goal:** Feel confident and prepared to start my first league season
- **Action:** Signed in, explored division, reviewed rules and fixtures
- **Outcome:** The website is well-organized and clearly shows everything I need to know. The welcome announcement was friendly and inclusive
- **Confusion or annoyance:** none
- **Severity:** fine
- **URL:** http://localhost:8790

##### Issue 9: Contact Info Clearly Available
- **Goal:** Find opponents' contact information to reach out about matches
- **Action:** Clicked on opponents' names or went to individual match pages
- **Outcome:** Phone numbers and emails were readily visible with a note that "only the players in your matches see these"
- **Confusion or annoyance:** none
- **Severity:** fine
- **URL:** http://localhost:8790 (match pages)

##### Issue 10: Clear Explanation of League Rules and Format
- **Goal:** Understand how the points system and league structure works
- **Action:** Read the rules and format information on the division page
- **Outcome:** Very clear, detailed explanation of point scoring, tiebreak rules, division movement rules (2 up, 2 down), minimum match requirement (4 matches)
- **Confusion or annoyance:** none
- **Severity:** fine
- **URL:** http://localhost:8790/competitions/[competition-id]

---

##### Overall Reflection

The league website itself is well-designed and gives me everything I need to know about the format, my division, my opponents, and their contact details. The placement process worked smoothly and I was welcomed as a newcomer. However, there's a gap between finding your opponents and actually getting matches scheduled. As a nervous beginner, I found myself uncertain about the typical match-arranging process - there's no guidance on the website or in communications about how to coordinate court times or confirm match arrangements. I reached out to three opponents and the coach, but without immediate responses and no deadline visible, I'm not sure when my first actual match will happen. A simple calendar view or "request match" feature on the website would help new players like me feel more confident about getting matches scheduled quickly.

---

## Checkpoint s2-w5

### Helen Marsh (coach)

#### Friction log: coach (Helen Marsh), s2-w5, Sunday 14 Feb 2027

1. **Goal:** Settle the two disputes.
   **Action:** Results > dispute > "Use Nora Q.'s entry" / "Use Ali Lee / Arjun Farrell's entry" > reason "sides entered different results" > Review > Save. I phoned or emailed the players first.
   **Outcome:** Both were saved. The "same score reversed" hint on Nolan v Quill was exactly right: Megan had put her own games first. The review step showing points before and after is reassuring.
   **Confusion or annoyance:** Dominic Bennett has no phone on file, so I had to email him. Otherwise none.
   **Severity:** fine
   **URL:** /coach/results, /coach/matches/{id}

2. **Goal:** Clear 30 results waiting on the other side.
   **Action:** Opened each match from the Results page, then "Use X's entry", reason "One side has not responded", Review, Save, then back to the list. I repeated that 28 times, phoning the other side first whenever the winner had entered the score.
   **Outcome:** 28 cleared and 2 left waiting for Tomasz and Marcus. It's about 4 clicks per match, and the list renumbers after every save, so I had to re-read it each time to find the next one.
   **Confusion or annoyance:** There's no "confirm" tick-box for the easy ones, where the loser entered the score and nobody would argue. Every line says "has not answered in less than a day", even ones that have plainly waited weeks, so I can't tell who is genuinely slow. The second half of the list ("And 20 more") shows no scores, so I had to open each match. Ten of the 30 were singles where the loser had already entered the score. Why should those need me at all?
   **Severity:** painful
   **URL:** /coach/results

3. **Goal:** Take Nadia Carter (emigrating) and Hugo Collins (Achilles, out for the season) out of this season's competitions.
   **Action:** Members > Nadia > "Left the club…" > Yes. I then looked on the Season tab, Tables and Members for any way to withdraw someone from a running competition.
   **Outcome:** "Left the club" worked and its explanation was clear. There's still no way on the site to withdraw a player or pair mid-season, which is the same gap I hit in November. I had to ask the coding agent four times: Nadia from Women's Singles, Lily Patel/Nadia from Women's Doubles, Hugo from Men's Singles, and Ryan Young/Hugo from Men's Doubles. I also had to read pages of its technical output to find which entry was which.
   **Confusion or annoyance:** People leave and get injured every season. This should be a button next to the player in Tables or Members. Leaving the club even says "you can still decide the rest" of her matches, which suggests I'd have to settle each remaining fixture by hand.
   **Severity:** blocker (worked around with the coding agent)
   **URL:** /coach/members/{id}/left, /coach/season

4. **Goal:** Stop Hannah Cole's opponents saying "we're not drawn against each other".
   **Action:** Looked for a way to edit her name ("Hannah C.") on Members. There's none, so I used the coding agent to change Hannah, Ravi and Nora to their full names. I also messaged her four opponents.
   **Outcome:** Names fixed. This has bothered me since December, when the join form or approval shortened their names to an initial. This time I typed Owen Pryce's full name into the approval box myself.
   **Confusion or annoyance:** The site picks "Owen P." as the name by default, and afterwards you can't change a name at all. Members don't recognise "Hannah C." on a fixture list. Naomi Rees has no phone on file, so I had to email her.
   **Severity:** painful
   **URL:** /coach/members

5. **Goal:** Handle Owen Pryce's join request ("is it too late for this season?").
   **Action:** Members > Asking to join > typed full name and level 6 > "Approve and email sign-in link".
   **Outcome:** Approved. The page clearly says approval doesn't put someone in a running season. I told him he'll be placed for the summer.
   **Confusion or annoyance:** The "deleted 3 Nov 2026 if not decided" date is clearly nonsense in February, which is part of the site's date problem.
   **Severity:** minor
   **URL:** /coach/members

6. **Goal:** Malik Fox and Rhys Foster are splitting as a doubles pair next season.
   **Action:** Dashboard > "Next season's pairs".
   **Outcome:** Both had already put "wants you to find a partner" on the site, so nothing for me to do except suggest partners. This page is a big improvement on December's guesswork.
   **Confusion or annoyance:** The withdrawn pairs show as "Not playing next season". That's wrong for Ryan Young, who wants to carry on, and for Lily Patel. It's also wrong for Hugo, who wants to play next season once he's healed. I'll have to remember all that at draft time.
   **Severity:** minor
   **URL:** /coach/pairs

7. **Goal:** Make sure Hamza, Neil and Molly (social only) don't get drafted by mistake.
   **Action:** Members > each person > "Not playing next season".
   **Outcome:** They dropped off "Waiting to be placed", which is good. But the page reloaded with no message saying it had worked. I only knew because their names disappeared from the list.
   **Confusion or annoyance:** The Members page is enormous (5,500+ lines). Finding a person's buttons means scrolling past dozens of identical "Take a break / Not playing next season" blocks, and I was nervous about pressing the wrong person's button.
   **Severity:** painful
   **URL:** /coach/members

8. **Goal:** Fix contact details: Scott Thorne's wrong phone, Gavin Evans's phone, and the four players I can't reach.
   **Action:** Emailed Scott, and asked Phoebe, Alice, Dana and Elliot Khan.
   **Outcome:** Nothing new. Scott still has Dmitri's number on his record, and the site won't let me blank it. Gavin's "mobile" turns out to be the same number someone else gave me for Elliot Khan, so I'm glad the site wouldn't save it. Bella, Gavin, Kofi and Robbie still haven't signed in after four lots of links passed on through their partners.
   **Confusion or annoyance:** The site can't record "phone only" or clear a wrong phone number. This is people trouble more than website trouble.
   **Severity:** minor
   **URL:** /coach/members

9. **Goal:** Check the ex-members' results from inbox complaints (Ines v Lena Duffy, Lena Duffy v Vera Cross).
   **Action:** "Matches with no entries yet", then Tables > Women's Singles > Division 2.
   **Outcome:** Both were already confirmed. "Find a match" mixes in last autumn's fixtures and has no search by name, so it was no help. I had to read the table instead.
   **Confusion or annoyance:** Every result in the tables says "4 Oct" and the dashboard still says "Results close in 175 days". I've learned to ignore it, but players must be confused too.
   **Severity:** minor
   **URL:** /coach/matches?status=open, /coach/tables/{id}

10. **Goal:** Weather forecast for players.
    **Action:** Weather tab.
    **Outcome:** Still says "The forecast could not be fetched just now", four months on.
    **Confusion or annoyance:** I've given up on it.
    **Severity:** minor
    **URL:** /coach/weather

**Overall:** The results side is now good when it works. Disputes are clear, the review step is reassuring and the new "Next season's pairs" page saved me a lot of WhatsApps. But two everyday coach jobs still need the coding agent: taking someone out mid-season and correcting a member's name. This time that meant 7 agent jobs and pages of technical printout, and I'm a retired PE teacher, not a programmer. I'd tell the club it's worth keeping, but the waiting-results queue needs a quick "confirm" for uncontested scores, and someone needs to fix withdrawals and name edits before the summer.

### Grace Adeyemi

#### Friction Log - Checkpoint s2-w5 (Sunday 14 February 2027)

##### 1. Date Field Constraint Bug in Result Entry

- **Goal:** Enter Mixed Doubles results for matches played in week 3 and week 4 of season 2 (late January / early February)
- **Action:** Filled out result entry form for Gavin Evans/Phoebe Lane and Toby Duffy/Naomi Rees matches
- **Outcome:** Results entered and confirmed, but "played_on" date shows as 4 Oct 2026 (season 1 date) instead of actual date
- **Confusion or annoyance:** The date field showed "max 2026-10-04" which shouldn't apply to February 2027 matches. This is the same bug from last season that wasn't fixed. The results count but with wrong dates in the system.
- **Severity:** Painful - results are recorded with incorrect dates, making seasonal records inaccurate
- **URL:** /matches/01a10719-8c24-77a3-b9ee-bab7b4a756e7#report

##### 2. Persistent Messaging System - Template Responses

- **Goal:** Arrange upcoming matches by contacting opponents and partner with specific times and dates
- **Action:** Sent messages to 6 different people asking about match availability with specific times
- **Outcome:** All 6 players (Emily Hale, Robbie Edwards, Raj Wood, Toby Okafor, Kofi West, Dana Park) sent identical templated response: "Yes, let's do it — how about [time] at Hollins Park? I'll book a court." - but each person picked a different time than I asked for
- **Confusion or annoyance:** This is incredibly frustrating. The messaging system sends template responses instead of actual answers. When I asked Emily about Friday 7pm, she replied with "Saturday 3pm." When I asked Dana about Friday 7pm for Women's Doubles, she suggested Saturday 10am. It's impossible to have a real conversation or confirm times. This issue persisted from season 1 and is still broken.
- **Severity:** Blocker - makes scheduling impossible. Players appear to be receiving my messages but the system is replacing their replies with templates rather than their actual responses
- **URL:** (Messaging system - not a web page)

##### 3. Match Dates Display Wrong Season in Standings

- **Goal:** Check current Women's Doubles and Mixed Doubles standings to understand my position
- **Action:** Navigated to Women's Doubles and Mixed Doubles standings pages
- **Outcome:** All matches display as "4 Oct" (October 4, 2026) despite being from Spring 2027 season 2 matches played in January-February 2027
- **Confusion or annoyance:** The standings table shows all matches from the current season 2, but all of them are dated with last season's date (4 Oct 2026). This is misleading and makes it hard to track which week's matches were played.
- **Severity:** Minor - the standings and points calculations are correct, but the date display is wrong
- **URL:** /competitions/01a10715-bb9f-7113-848d-1fdde7980cb9 and /competitions/01a10715-bbb9-73d6-a941-d07dec838329

##### 4. Unable to Confirm Partner Understanding of Match Details

- **Goal:** Confirm with Women's Doubles partner Dana Park that she understands the Friday 7pm match I just arranged with Emily Hale/Lily Palmer
- **Action:** Sent message to Dana explaining the Friday 7pm match time at Hollins Park, asking if it works for her
- **Outcome:** Dana replied with "Yes, let's do it — how about Saturday morning at 10 at Hollins Park? I'll book a court." - suggesting a completely different time
- **Confusion or annoyance:** I can't tell if Dana actually understands that the match is Friday 7pm, or if she's suggesting an alternative time, or if this is just the template response system. As a nurse working shifts, I need clarity on exactly when I'm expected to play. This uncertainty is stressful.
- **Severity:** Painful - critical for coordination as my work shifts depend on knowing match times
- **URL:** (Messaging system)

##### 5. No Contact Details for Mixed Doubles Partner Robbie Edwards

- **Goal:** Coordinate strategy and confirm upcoming Mixed Doubles matches with partner Robbie Edwards
- **Action:** Tried to send message to Robbie about arranging matches
- **Outcome:** Message delivered but "No contact details" shown on match pages. Robbie is responsive via messaging but unreachable by phone.
- **Confusion or annoyance:** Robbie has no phone number or email on file. I can only reach him through the league website messaging (which gives templates), making it hard to have real coordination conversations about strategy or even confirm which specific match we're playing.
- **Severity:** Minor - coordination possible but limited to templated messaging
- **URL:** /competitions/01a10715-bbb9-73d6-a941-d07dec838329

##### 6. Partner Communication Clarity Issues With Dana Park

- **Goal:** Ensure Dana Park understands she's my Women's Doubles partner in season 2 (unlike last season)
- **Action:** Messaged Dana multiple times about our partnership and arranged match
- **Outcome:** Dana's responses are template-based and don't show clear understanding. In season 2 week 0, Dana sent "Happy to have a hit, but I don't think we're drawn against each other in the league?" multiple times despite being told she's my partner.
- **Confusion or annoyance:** It's unclear whether Dana actually understands we're partners or if she's just sending template responses. This is concerning for partnership reliability and makes me wonder if she'll actually show up to matches.
- **Severity:** Painful - partnership reliability is critical for me as a nurse with shift work
- **URL:** (Messaging system and partnership pages)

##### Summary

The league website has significant usability issues that have persisted from season 1. The most critical problems are:

1. **Messaging system is fundamentally broken** - It sends identical template responses regardless of what question is asked, making real scheduling coordination impossible. This is a blocker for organizing matches.

2. **Date constraints and displays are from last season** - The result entry form still has a max date from October 2026, and all standings display wrong dates. This isn't just cosmetic - it makes it hard to track seasonal records.

3. **Partner communication is unclear** - With the template messaging system, I can't confirm whether partners actually understand their role or preferred times. This is especially stressful for someone like me who works shifts and needs certainty.

Despite these frustrations, I'm managing to arrange matches (I've got 4 matches lined up), and the points system is working correctly. But if the messaging system isn't fixed, it will continue to be painful for coordinating doubles partnerships and opponent availability. I'd tell the club: "Fix the messaging system first - it's making it harder than it should be to play in your league. Everything else is working, but I need real two-way communication with my opponents and partner."

### Hannah Cole

#### Hannah Cole - Friction Log Checkpoint S2-W5
Sunday 14 February 2027 · Week 5 of Spring Season

##### 1. Fixture Season Confusion (Critical Blocker)

**Goal:** Arrange matches with my remaining 4 opponents (Paige Hayes, Harriet Fleming, Lily Patel, Naomi Rees)

**Action:** Messaged each opponent via WhatsApp suggesting times/dates, then called them, then emailed them with website link

**Outcome:** All 4 gave identical response: "Happy to have a hit, but I don't think we're drawn against each other in the league?" - indicating they're checking Autumn 2026 fixtures, not Spring 2027

**Confusion or annoyance:** VERY FRUSTRATED. This is a massive blocker. I successfully played 3 matches (Week 1, 2, and 4) and entered them on the website, but now can't arrange any new matches because every single opponent I contact thinks we're not playing each other. Helen warned about this in her announcement but the website isn't forcing people to check the right season. It feels like a broken system when the coach has to warn people but people still get confused.

**Severity:** Blocker - Cannot arrange new matches

**URL:** Messaging interface (via WhatsApp, email, phone calls) and http://localhost:8790/competitions/01a10715-9940-76bb-bab1-259d0dd5fe20

---

##### 2. Website Division Page Shows Autumn Match Dates

**Goal:** Check current season standings and fixtures

**Action:** Clicked through to Women's Singles Division 4 to see standings

**Outcome:** The page says "This season Spring 2027" but all match entries show "4 Oct" (Autumn start date) except for my two confirmed matches which show January/February dates. The historical data and new season data appear to be mixed together, making it look like the Autumn results are the current standings.

**Confusion or annoyance:** Confusing presentation. If I were an opponent looking at this page, I might also think these are old Autumn matches, not the current Spring season. The mix of dates (4 Oct vs Jan/Feb) should have been a clear signal that I was looking at old data, but the page label says "Spring 2027" which conflicts with the old dates.

**Severity:** Painful - Contributes to opponent confusion

**URL:** http://localhost:8790/competitions/01a10715-9940-76bb-bab1-259d0dd5fe20#mine

---

##### 3. No Visual Feedback About Season Change

**Goal:** Understand which season I should be focusing on

**Action:** Signed in and checked home page and fixtures

**Outcome:** Had to rely on Helen's announcement and my diary to remember that Spring started 11 January. The website doesn't visually highlight which season is "current" or "active" vs past seasons.

**Confusion or annoyance:** None for me (I knew it was Spring), but clearly an issue for my opponents. A visual indicator on every page (banner, highlight, "CURRENT SEASON" label) would help

**Severity:** Minor for experienced players, Painful for new/casual players

**URL:** http://localhost:8790/

---

##### 4. Results Entry Form Has Confusing Date Field

**Goal:** Enter match results with correct date

**Action:** Filled in scores and tried to enter date for matches (18 Jan for Nora, 1 Feb for Poppy, 11 Jan for Megan)

**Outcome:** The form showed `max 2026-10-04` which is in the past (old Autumn season). I was able to override it and enter correct Spring dates, but the form's default and validation seem stuck on Autumn season dates.

**Confusion or annoyance:** Minor confusion about whether I was entering the date correctly. The form seemed to expect old Autumn dates but I needed Spring dates. Not a blocker since I could enter the correct dates, but feels like a lingering Autumn configuration issue.

**Severity:** Minor - didn't prevent results from being entered correctly

**URL:** http://localhost:8790/matches/01a10719-798d-7d7d-9b75-4b5474453d2e

---

##### 5. No Way to Bulk-Message or Notify Opponents of Current Season

**Goal:** Inform all 4 opponents about Spring fixtures

**Action:** Sent individual messages (WhatsApp, email, phone) to each opponent

**Outcome:** Had to contact 4 people separately, 3+ times each (initial message, clarification, voicemail). No way to send a bulk announcement or have the website notify players of fixture changes.

**Confusion or annoyance:** Time-consuming and inefficient. Would be better if the website could send automated notifications when a new season starts, or if there was a way to message all opponents at once about a specific issue.

**Severity:** Painful - Takes extra time and effort

**URL:** Messaging system / http://localhost:8790/

---

##### 6. Results Entry Process Worked Well

**Goal:** Record my match results on the website

**Action:** Clicked "Enter result" for each match and filled in the forms

**Outcome:** Successfully entered 3 results (Nora Q - confirmed, Poppy Rhodes - confirmed, Megan Nolan - pending). The process was straightforward: select outcome, enter scores by set, submit. Got clear confirmation when both sides' results matched.

**Confusion or annoyance:** None - this part was smooth!

**Severity:** Fine

**URL:** http://localhost:8790/matches/*

---

##### 7. Division Table Shows My Progress Clearly

**Goal:** See where I stand in the league

**Action:** Viewed Division 4 standings showing 8 players with records and points

**Outcome:** Could see I'm 8th with 8 points after 2 confirmed matches (1 win vs Poppy Rhodes, 1 loss vs Nora Q). Points calculation was clear: win=4pts + sets won + bonus for close matches = 6pts for win, 2pts for close loss.

**Confusion or annoyance:** None - standings table is clear and well-formatted

**Severity:** Fine

**URL:** http://localhost:8790/competitions/01a10715-9940-76bb-bab1-259d0dd5fe20

---

##### 8. Coach Not Responsive to Questions About Fixture Confusion

**Goal:** Get Helen's help explaining the fixture confusion to opponents

**Action:** Called Helen (left voicemail), then messaged her on WhatsApp explaining the problem

**Outcome:** No response from Helen within this session. As the coach who warned about this problem in her announcement, she would be the logical person to help resolve it, but she wasn't available.

**Confusion or annoyance:** Somewhat annoying - there's a documented problem (fixture confusion) that the coach warned about, but when it happens, the coach isn't available to help resolve it. Makes me feel like there's no support.

**Severity:** Painful - Lack of support when blocked

**URL:** Phone/WhatsApp

---

##### Summary & Recommendations

**Overall Impression:** This is incredibly frustrating. I successfully entered 3 match results without any issues, which was great. But now I'm completely stuck trying to arrange my remaining matches because every single opponent thinks we're not playing each other in Spring. This is the exact problem Helen warned everyone about in her announcement ("a few people have been checking the old draw and telling opponents they're not drawn together - you are!"), but the website hasn't fixed it, and neither has the coach's announcement been clear enough to prevent it.

**What Would Help:**
1. Make the current season VERY obvious on every page (visual banner, color coding, "ACTIVE" label)
2. When a new season starts, automatically update the fixtures view so players can't accidentally view old seasons
3. Send automated email/SMS notifications to all players when a new season's fixtures are published
4. Add a "notify opponent" button so players can easily send opponent a link to their current fixture
5. Make sure the Division standings page only shows current season matches (the mix of April and Jan/Feb dates is confusing)
6. The coach needs better communication tools or faster response time for common issues like this

**If I had to recommend ONE fix:** Put a massive "SPRING 2027" banner at the top of every page and make the default fixture view only show Spring 2027 (with Autumn 2026 available as a "Past Season" toggle). The current state makes it too easy to accidentally view the wrong season.

This league website is almost usable, but this one UX issue (fixture season confusion) is completely blocking new/casual players like me from participating fully. It needs to be fixed ASAP.

---

## Checkpoint s2-end

### Helen Marsh (coach)

#### Friction log: coach (Helen Marsh), s2-end, Sunday 28 March 2027 (evening)

1. **Goal:** Settle the last three disputes before results closed.
   **Action:** Results > each dispute > phoned the players > "Use X's entry" > reason "The sides entered different results" > Review > Save.
   **Outcome:** All three settled. The "same score reversed" hint on Noah v Ali was right again, and so was the tiebreak-only difference on the mixed. The review step showing points and "requirement met" is reassuring.
   **Confusion or annoyance:** On Marcus v Callum, both entries have Callum winning but the set scores differ. The site treats that exactly like a "who won" dispute and gives no hint that the winner agrees.
   **Severity:** fine
   **URL:** /coach/results, /coach/matches/{id}

2. **Goal:** Clear 20 results waiting on the other side on the last night.
   **Action:** Opened each match from the Results list > Use entry > reason "One side has not responded" > Review > Save > back to the list, 20 times. I phoned players first whenever the winner had entered the score.
   **Outcome:** Cleared all 20, but it took me well over an hour. Eleven of them were the loser entering their own defeat, which nobody would ever argue with. Four were walkovers claimed against people who never answered.
   **Confusion or annoyance:** It's the same complaint as February: there's no one-click "confirm" for uncontested results, and every line still says "has not answered in less than a day" when they plainly waited weeks. Each save also dumps me back on the match page rather than the next one.
   **Severity:** painful
   **URL:** /coach/results

3. **Goal:** Make sure nobody gets dropped from the summer draft only because a played match was never entered.
   **Action:** Chase list > "Short of the minimum". I spotted Alice/Scott v Gavin Slater/Amara as unentered, found it under "Find a match" > "No entries yet" (page 2), and entered it myself with reason "Neither side has entered the result".
   **Outcome:** It worked, and both pairs went from "1 short" to "requirement met". The chase list warning ("left out of next season's draft") is exactly what I needed to see.
   **Confusion or annoyance:** "Find a match" still mixes autumn and spring fixtures, there's no search by name, and I had to page through 70 unplayed matches to find this one. Amara has no phone on file, so I had to ask her partner.
   **Severity:** minor
   **URL:** /coach/chase, /coach/matches?status=open

4. **Goal:** Act on James Hale's request to delete his personal details.
   **Action:** Members > "Former members" link > Erase… > typed the admin key > Erase.
   **Outcome:** Done in two minutes, and the page explained clearly what goes (name, contacts, notes) and what stays (scores, shown as "Erased member"). Asking for the admin key again made it feel suitably serious.
   **Confusion or annoyance:** The "Former members (2)" link at the top doesn't jump anywhere obvious. The section is right at the bottom of an enormous Members page, below 140-odd people's button blocks, so it took me a while to find.
   **Severity:** minor
   **URL:** /coach/members, /coach/members/{id}/erase

5. **Goal:** End Spring 2027.
   **Action:** Season > End season now > End Spring 2027.
   **Outcome:** It was clean. It listed who had opted out and the 30 unplayed matches, and afterwards said "Every result was agreed or decided".
   **Confusion or annoyance:** It says "Reporting closes now, before the deadline", which made me hesitate because it's the deadline evening. The dashboard still said "Results close in 175 days".
   **Severity:** fine
   **URL:** /coach/season/{id}/end

6. **Goal:** Prepare Summer 2027 with the right dates.
   **Action:** Season > Prepare next season's drafts. I changed the dates from the suggested 29 Mar–13 Jun to 3 May–25 Jul.
   **Outcome:** All five drafts appeared in one go this time. December's half-made season and blank page didn't happen again.
   **Confusion or annoyance:** The suggested dates start the day after Spring ends. Our club always has a break, so it's lucky I read the form before pressing the button.
   **Severity:** minor
   **URL:** /coach/season

7. **Goal:** Review the Men's Singles draft: two top players opted out, Hugo Collins was withdrawn, Derek is back and Owen is new.
   **Action:** Read each division's held/promoted/relegated labels and the "Not carried over" list, then used Move or Add to change them.
   **Outcome:** The labels ("Relegated · 6th in Division 1", "Withdrew last season") made reviewing easy. I kept Ali Lee in D1, promoted Gavin Evans as 3rd in D2, added back Hugo provisionally, and added Derek to D2 and Owen to D4.
   **Confusion or annoyance:** With two opt-outs at the top, the site still relegated two and left D1 with only 5. It doesn't suggest filling the gaps; I had to work that out myself. Derek, a returner who played in the autumn, is labelled "New". The "Not in Men's Singles last season" list holds every man in the club (about 60, mostly social players) with no sign of who has actually asked to play. Remembering who wants in is still all on me.
   **Severity:** minor
   **URL:** /coach/season/drafts/{id}

8. **Goal:** Fix the Men's Doubles draft.
   **Action:** Compared the draft with "What players said about partners", moved Marcus/Rory back to D1, added back Jamal Owen/Gavin Evans and Ryan Young/Hugo Collins.
   **Outcome:** The draft both relegated Marcus/Rory AND dropped the withdrawn Ryan/Hugo, so D1 lost two pairs under a "1 down" rule. I put that right. It did explain Jamal/Gavin clearly: "Short only because 1 match was never played (against Malik Fox / Rhys Foster)". That told me it was fair to add them back.
   **Confusion or annoyance:** A withdrawn pair should count as the relegated one. D2 still has only 4 pairs because Malik Fox and Rhys Foster both want partners and nobody has answered my suggestions.
   **Severity:** minor
   **URL:** /coach/season/drafts/{id}, /coach/pairs

9. **Goal:** Pair up the people left without a partner (Lily Patel, Hannah Cole, Jamal Morris, Amara Rhodes).
   **Action:** Used "Make a pair" at the bottom of the Women's and Mixed Doubles drafts, after placing the agreed new pair Gavin Slater/Tara Parry.
   **Outcome:** It worked first time. The "New pairs waiting" section and the reasons ("Tara Parry is playing with Gavin Slater") made it obvious that Jamal Morris and Amara had been left out by that swap.
   **Confusion or annoyance:** The partner drop-downs list every woman in the club, about 55 names, by level. That's fine once you know who you want.
   **Severity:** fine
   **URL:** /coach/season/drafts/{id}

10. **Goal:** Get the provisional divisions to the committee for 10 April, without starting the season.
    **Action:** Looked for a printable or shareable view of the drafts.
    **Outcome:** Players see nothing until I start, and I couldn't find any way to show or print the drafts for the committee. I'll have to type them out from my notes. The "Start Summer 2027…" link sits right under the drafts, and after December's accident I kept well away from it.
    **Confusion or annoyance:** A "print the divisions" or "share draft with committee" view would save me an evening. The dashboard says "No season is running", with no mention that a draft is waiting.
    **Severity:** painful
    **URL:** /coach/season

11. **Goal:** Get answers from players about partners, fitness and returns before the draft.
    **Action:** Phoned or messaged about 15 players: Hugo (Achilles), Owen, Ryan Young, Malik Fox, Rhys Foster, Sofia and others.
    **Outcome:** Most replied with a list of their old match scores and no actual answer ("I haven't played any league matches yet"). The draft is full of "pencilled in" decisions I'll have to chase before 10 April.
    **Confusion or annoyance:** This is people trouble, not website trouble, but it makes the draft much harder to finalise.
    **Severity:** minor
    **URL:** (phone)

**Overall:** This was the smoothest end of season yet. Ending Spring, preparing Summer and reviewing the drafts all worked on the website, and I didn't need the coding agent once. The draft pages explain why each person is where they are, and that's what I need when the committee asks "why is X in Division 2?". The big time sinks are still clicking through 20 uncontested results one at a time, and not being able to show the committee the draft. I'd also like the draft to handle opt-outs and withdrawn pairs more sensibly, rather than relegating as if nothing had happened. I'd tell the club the system is now good enough to keep, as long as someone adds a quick-confirm and a printable draft before the autumn.

### Marcus Bell

#### Friction Log - Marcus Bell - Season 2 End (s2-end) Checkpoint
##### Sunday 28 March 2027

###### 1. Date Field Default Error
**Goal:** Enter historical match results from earlier in the season
**Action:** Navigated to match result forms (Ryan Wood, Elliot Khan, Ali Lee/Arjun Farrell, Callum Hall singles matches)
**Outcome:** All forms showed "Played on: 2026-10-04" as the default date, which is incorrect for Spring 2027 matches
**Confusion or annoyance:** Confusing - the date field was locked to a past date from the 2026 season (autumn). The max date was capped at 2026-10-04, making it impossible to enter the correct match date from 2027. This makes me wonder if the date on match records is being recorded incorrectly for the entire spring season.
**Severity:** Minor (matches were still recorded correctly by both players despite wrong dates, though the date field UX is broken)
**URL:** /matches/01a10719-62b4-7af8-a0c0-b894ae0da521 and others

###### 2. Callum Hall Result Mismatch
**Goal:** Confirm my Callum Hall singles result (6-4, 5-7, 8-10 loss)
**Action:** Entered my score for the match on the result form
**Outcome:** Site shows "The entries do not match" - Callum entered different scores. The match now shows as pending with conflicting entries.
**Confusion or annoyance:** Mildly frustrating - I entered my result correctly but Callum has different scores recorded. The site says "Speak outside the app and enter the agreed result" but doesn't tell me what Callum entered, so I can't easily resolve it. I had to remember the exact score from my diary to enter it, but Callum might have different recollection.
**Severity:** Painful (result won't count until both sides agree, but I can't see Callum's entry to discuss the discrepancy)
**URL:** /matches/01a10719-62b4-7af8-a0c0-b894ae0da521

###### 3. Ryan Wood Win Confirmed Quickly
**Goal:** Enter my win vs Ryan Wood (6-4, 1-6, 10-5)
**Action:** Submitted the result form with the correct scores
**Outcome:** Result was immediately confirmed - "Both sides entered matching results. The result counts now." My ranking moved to 2nd in Singles (24 → 25 pts).
**Confusion or annoyance:** None - worked perfectly
**Severity:** Fine
**URL:** /matches/01a10719-62b4-7d60-9a29-3240d196aa82

###### 4. Ali Lee/Arjun Farrell Doubles Win Confirmed
**Goal:** Enter my doubles win vs Ali Lee/Arjun Farrell (6-4, 6-4)
**Action:** Submitted the result form with the scores
**Outcome:** Result was immediately confirmed. My doubles ranking jumped from 8 pts to 15 pts (win was worth 6 pts + turnout bonus).
**Confusion or annoyance:** None - quick confirmation
**Severity:** Fine
**URL:** /matches/01a10719-891d-705b-939f-f8495c40f0f9

###### 5. Elliot Khan Loss Confirmed
**Goal:** Enter my loss vs Elliot Khan (4-6, 0-6)
**Action:** Submitted the result form
**Outcome:** Result was confirmed immediately by Elliot
**Confusion or annoyance:** None - straightforward
**Severity:** Fine
**URL:** /matches/01a10719-62b4-7f43-a506-1bb66285f30c

###### 6. Summer Preferences Saved
**Goal:** Confirm my participation for next season - singles and doubles with Rory Kelly
**Action:** Navigated to Men's Doubles page, verified "Play with Rory Kelly again" was selected, clicked Save
**Outcome:** System confirmed "Saved. You are down to play with Rory Kelly again next season."
**Confusion or annoyance:** None - very clear
**Severity:** Fine
**URL:** /competitions/01a10715-9956-7624-b47c-67c147fbef9d

###### 7. Standings Display All Show Same Date
**Goal:** Verify final standings to understand season results
**Action:** Reviewed Men's Singles and Men's Doubles tables on the standings pages
**Outcome:** All matches show "4 Oct" as the played date, even though we just entered Spring 2027 matches. The entire standings table appears to be showing an old snapshot with incorrect dates.
**Confusion or annoyance:** Confusing - the dates on the standings don't match the actual season (Spring 2027 started 11 Jan 2027). This makes the standings look like they're from the previous season. However, the point totals and match results ARE correct - it's just the dates that are wrong.
**Severity:** Minor (results are correct but dates are wrong everywhere)
**URL:** /competitions/01a10715-9923-71f2-98b6-5d7293edaac6 and /competitions/01a10715-9956-7624-b47c-67c147fbef9d

###### 8. Doubles vs Singles - Rankings Asymmetry
**Goal:** Understand my final season position
**Action:** Compared my 2nd place in Singles vs 5th place in Doubles
**Outcome:** Ended season as 2nd in Singles (25 pts) but only 5th in Doubles (15 pts). Doubles shows "going down Division 1" indicator suggesting I'll be demoted next season.
**Confusion or annoyance:** Mildly annoying - I'm doing well in singles but struggling in doubles. The disparity is large (25 vs 15 pts) and the "going down" label is clear but unfortunate given how hard Rory and I have worked. It's clear I need to improve doubles performance with Rory next season.
**Severity:** Minor (this is just competitive reality, not a site problem)
**URL:** / (home page standings)

---

##### Overall Assessment

The league website mostly works well for entering results and tracking standings, but there are some quality-of-life issues:

1. **Date handling is broken** - all match forms default to a past date (2026-10-04) and the max date cap is incorrect for Spring 2027 season
2. **Result mismatches aren't transparent** - when Callum and I disagree on score, I can't see what he entered to resolve it
3. **Standings use stale dates** - all matches show "4 Oct" regardless of when they were actually played this season

These are minor usability annoyances rather than blockers. The core functionality (entering results, confirming matches, tracking points) works well. I'm satisfied with how the season was managed - the website made it easy to organize my matches and track my progress. I finished 2nd in singles, which is solid, and I'm looking forward to improving my doubles performance with Rory in the summer season.

**Key Takeaway:** The website gets the job done but needs better date handling and more transparency when result entries conflict. Overall positive experience - results were recorded correctly and the partnership confirmation for next season was smooth.

### Tomasz Nowak

#### Tomasz Friction Log - Checkpoint s2-end (28 March 2027)

##### 1. Countdown Timer Misleading on Deadline Day
**Goal:** Understand how much time I have left to submit results on the final day  
**Action:** Looked at homepage which shows "Spring 2027 · Results close in 175 days (Sun 28 Mar)"  
**Outcome:** Confusing countdown because it IS 28 March - the countdown should say "Results close TONIGHT" or "closes in a few hours"  
**Confusion or annoyance:** The big number (175 days) is misleading on the actual deadline. Makes you second-guess whether this really IS the final day  
**Severity:** minor  
**URL:** /

##### 2. Malik Rose Mystery Match
**Goal:** Confirm all my results before deadline  
**Action:** Checked homepage "Needs your answer" list and saw Malik Rose. Clicked to view  
**Outcome:** Malik Rose has entered a result, but I have no record of ever playing him. Homepage lists it as "enter your result independently"  
**Confusion or annoyance:** I never played Malik Rose according to my match history. Either (1) I forgot, (2) he's mistaken, or (3) the site is confused. With results closing tonight, I don't have time to sort this out or check with him  
**Severity:** painful  
**URL:** /matches/01a10719-62ce-7945-8afe-81b104cda2c6

##### 3. No Summer Season Information Available
**Goal:** Check what the site says about the summer season  
**Action:** Browsed homepage and tables for information about Summer 2027 schedule  
**Outcome:** Found nothing. No dates for when Summer 2027 starts, no fixtures, no sign-up information. Coach's messages mentioned summer would run May-July and new player Owen Pryce joining, but site has nothing  
**Confusion or annoyance:** I'm promoted to Division 2 now - I'd expect to see some information about next season preparation, summer schedule, or at least confirmation the promotion is real  
**Severity:** minor  
**URL:** /

##### 4. Scott Thorne Confirmation Smooth
**Goal:** Confirm Scott Thorne result that Helen asked about  
**Action:** Opened Scott Thorne match page which showed his entry already, filled in my score (1-6, 0-6), submitted  
**Outcome:** Immediate confirmation "Both sides entered matching results. The result counts now."  
**Confusion or annoyance:** none  
**Severity:** fine  
**URL:** /matches/01a10719-62ce-7f10-bff7-e28fd5f128f8

##### 5. Hugo Dale Entry Clear and Fast
**Goal:** Get my Hugo Dale result in before midnight  
**Action:** Opened Hugo Dale match, filled in sets (1-6, 6-2, 10-2), submitted with correct date  
**Outcome:** Instant confirmation with points breakdown (6 pts for the win)  
**Confusion or annoyance:** none  
**Severity:** fine  
**URL:** /matches/01a10719-62ce-71d7-8e26-38e9e07cdfdf

##### 6. Score Entry Form Date Field Confusing
**Goal:** Enter correct match dates when submitting results  
**Action:** Filled out score forms with date fields that defaulted to "2026-10-04" (from Autumn season)  
**Outcome:** Had to manually change dates. Form allows editing but doesn't auto-detect or suggest the correct season  
**Confusion or annoyance:** Minor - you have to remember what date your match actually was, form doesn't help  
**Severity:** minor  
**URL:** /matches/01a10719-62ce-7f10-bff7-e28fd5f128f8

##### 7. Session Interruption During Results Entry
**Goal:** Submit all results before deadline  
**Action:** Working through entering results when session was interrupted (technical fault)  
**Outcome:** Had to resume mid-checkpoint. Lost continuity but didn't lose data (results were saved)  
**Confusion or annoyance:** none - the site saved my results, so no harm done on resume  
**Severity:** fine  
**URL:** /

---

##### Summary

The site worked well overall for my final result submissions. I got Scott Thorne and Hugo Dale confirmed cleanly and quickly, bringing me from 5th place and going down to 2nd place and promoted to Division 2. That's a huge swing.

The main friction points are:
1. **Malik Rose mystery** - someone entered a result for a match I never played. This is blocking on the homepage and I have no way to resolve it with hours left before deadline
2. **Countdown timer** is misleading on the actual deadline day
3. **No summer information** published yet - confusing after being promoted

The site itself is solid for result entry/confirmation - smooth forms, clear layout, instant updates. But the data integrity question with Malik Rose is concerning. As for the summer season, they need to publish information soon or promoted players won't know when to expect fixtures or how to prepare for Division 2.

I'd tell the coach: (1) Fix the Malik Rose situation before results close, (2) Publish summer dates and Division 2 information for promoted players, (3) Maybe timestamp the countdown timer better on the final day so people know it's TONIGHT not in 6 months.

### Grace Adeyemi

#### Grace's Friction Log - Season 2 End (28 March 2027)

##### Session Overview
Checkpoint: s2-end, Sunday 28 March 2027. Results close tonight. Entered 4 outstanding match results, checked final league standings, and confirmed partner preferences for next season. All required tasks completed successfully.

---

##### Friction Points

###### 1. Date Field Shows Outdated Constraint (Persists from Season 1)
- **Goal:** Enter current match results (from late March 2027)
- **Action:** Opened score entry form to record wins and losses from Week 10
- **Outcome:** Form field "played_on" shows max date of "2026-10-04" in HTML, though form still accepts submission. After submission, all results display as "4 Oct" in standings view, not actual date of play
- **Confusion or annoyance:** Confusing and misleading - standings show wrong dates, makes it hard to verify when matches were actually played. I had to reference my diary to confirm which matches were which. For a real player, this would be problematic when reviewing past seasons
- **Severity:** Minor (doesn't prevent results entry but creates incorrect historical record)
- **URL:** /matches/01a10719-8943-7437-bac9-f5e0df454405#report

---

###### 2. Result Entry Form Works Well
- **Goal:** Submit final match results before close of season
- **Action:** Filled in score entry form with set scores for 4 matches
- **Outcome:** All 4 results submitted successfully and confirmed immediately (opponent had already entered matching scores for all matches)
- **Confusion or annoyance:** None - process was straightforward
- **Severity:** Fine
- **URL:** /matches/01a10719-8943-7437-bac9-f5e0df454405?done=confirmed

---

###### 3. Partner Contact Info Still Missing for Robbie Edwards
- **Goal:** Review contact details for Mixed Doubles partner before next season
- **Action:** Viewed match pages for Mixed Doubles matches with Robbie Edwards
- **Outcome:** "No contact details: ask the coach" appears for Robbie on all match pages. He remains unreachable except through Helen (the coach)
- **Confusion or annoyance:** Not ideal, but doesn't significantly impact this season. For next season, I'll need to go through Helen again to arrange matches. At least messaging via the site (despite previous issues) eventually reached him
- **Severity:** Minor (functional workaround exists: go through coach)
- **URL:** /matches/01a10719-8c24-7518-9973-3a8bd22943e0#report

---

###### 4. Partner Preferences Saved Successfully
- **Goal:** Confirm I want to stay with Dana Park and Robbie Edwards for summer season
- **Action:** Visited Women's Doubles and Mixed Doubles tables, left partner choice set to "Keep current partner", clicked Save
- **Outcome:** Both preferences saved successfully. Page showed "Saved. You are down to play with [partner] next season."
- **Confusion or annoyance:** None - very clear confirmation
- **Severity:** Fine
- **URL:** /competitions/01a10715-bb9f-7113-848d-1fdde7980cb9?saved=1#next-season

---

###### 5. Final Standings Clear and Complete
- **Goal:** Check where I finished in both competitions before season closes
- **Action:** Clicked Tables link to view full league standings
- **Outcome:** Complete Division 1 standings displayed with full match history for each pair, points breakdown, and games difference calculation. Clear that I'm 3rd in both Women's Doubles (22 pts) and Mixed Doubles (18 pts)
- **Confusion or annoyance:** None - standings are well-organized and easy to read
- **Severity:** Fine
- **URL:** /competitions/01a10715-bb9f-7113-848d-1fdde7980cb9 and /competitions/01a10715-bbb9-73d6-a941-d07dec838329

---

##### Summary

**Overall Experience:** This season-end process worked smoothly. All results entered successfully, standings are clear, and partner preferences confirmed easily. The main persistent issue remains the date field showing outdated constraints and displaying all matches as "4 Oct 2026" regardless of actual play date.

**What I'd tell the club:** The website is generally reliable for result entry and standings tracking. The date bug should be fixed in the field validation and database records. I'm satisfied with both my partners (Dana Park and Robbie Edwards) and looking forward to the summer season. The main usability improvement needed would be fixing the messaging system (from previous seasons) so confirmation messages actually respond to what I ask, rather than sending templated responses.

**Recommendation:** Fix the date field constraint to allow current/recent dates, not just old dates from previous season. This is a bug that affects data accuracy for all future seasons.

---

**Session Duration:** 5 tool calls (finishing early with efficiency)
**Task Completion:** 100% - all results entered, standings reviewed, preferences confirmed

### Derek Mills

#### Derek Mills - Friction Log - s2-end

##### Summary

Reopening for the summer season was straightforward and caused no friction. The website's interface made it clear what I needed to do, and the process took just a couple of minutes. I'm back in for the summer and looking forward to playing again.

---

##### Friction Log Items

###### 1. Come back to the league for summer season

- **Goal:** Signal to the league that I want to play in the summer 2027 season
- **Action:** Opened the website homepage, saw "You are on a break" status, found the "I am back" button in the resume form, clicked it
- **Outcome:** Button submission succeeded with "Welcome back" confirmation message. Page then instructed me to "Tell the coach if you want a place in the next season"
- **Confusion or annoyance:** None
- **Severity:** fine
- **URL:** http://localhost:8790/

###### 2. Notify coach of summer season interest

- **Goal:** Confirm with Helen Marsh (the coach) that I want to play in the summer season
- **Action:** Sent email to Helen Marsh saying "Hi Helen, I clicked the button on the site to say I'm back. I'd like to play in the summer season if there's a place for me. Cheers, Derek"
- **Outcome:** Email sent successfully
- **Confusion or annoyance:** None
- **Severity:** fine
- **URL:** N/A (email)

---

##### Overall Assessment

The league site is working well for me. Coming back after a spring break was simple and painless - the website clearly showed I was on a break, gave me an obvious button to click, and then told me what to do next (email the coach). I didn't have to hunt around for forms or links; everything was right there on the homepage. The site feels like it understands what players like me need. I'm quite happy with how the league is handling my return, and I'm ready to have another go at it for the summer.

### Sofia Marin

#### Sofia's Friction Log - s2-end (28 March 2027)

##### Overall Impression
The site worked smoothly for my return to active status. Pressing "I am back" was straightforward, and I was able to quickly confirm my partners wanted to continue playing with me. Helen's previous guidance about manual summer draft placement took the guesswork out of the binary break system. I feel the site serves returning players well, though there's no way to see summer fixtures yet—I'll need to wait for Helen to confirm the draft and times.

##### Detailed Friction Items

###### 1. Break/Resume Binary System
- **Goal:** Indicate I'm coming back from injury and want to play in summer season
- **Action:** Opened homepage and clicked "I am back" button on break status message
- **Outcome:** Button worked, page updated to "Welcome back. Tell the coach if you want a place in the next season"
- **Confusion or annoyance:** None. Helen's previous guidance made this clear. But I notice the site offers no way to indicate "available from date X" — it's purely on/off. This forced Helen to manually handle my summer placement, which worked fine but required out-of-band coordination.
- **Severity:** Minor (workaround exists via coach)
- **URL:** http://localhost:8790/

###### 2. No Summer Fixtures Visible Yet
- **Goal:** See what matches I'm scheduled for in summer 2027
- **Action:** Checked Tables section for Spring 2027 standings, looked for summer season links
- **Outcome:** Only Spring 2027 standings visible. No summer season tab or fixtures yet.
- **Confusion or annoyance:** None. Expected—Spring season just ended today. But I'd like to know if summer fixtures exist yet or when they'll appear.
- **Severity:** Fine (expected timeline)
- **URL:** http://localhost:8790/competitions/01a10715-9940-76bb-bab1-259d0dd5fe20

###### 3. Contact Information and Partner Coordination
- **Goal:** Confirm Women's Doubles (Dana) and Mixed Doubles (Arjun) partnerships for summer
- **Action:** Checked standings to see current partnerships; sent text messages to both partners
- **Outcome:** Dana and Arjun both responded immediately saying yes. Arjun even suggested a time (Monday 6pm).
- **Confusion or annoyance:** None. Text coordination worked perfectly. The site doesn't show who to contact about summer partnerships (no messaging feature visible to returning players), but I already had their numbers.
- **Severity:** Fine
- **URL:** http://localhost:8790/

###### 4. Standings Show Other Players but Not Return Status
- **Goal:** Understand current league standings and who I might play with/against
- **Action:** Navigated through Women's Singles, Women's Doubles, and Mixed Doubles standings
- **Outcome:** Found Dana still active in Women's Doubles and Mixed Doubles (with new partners); found Arjun in Mixed Doubles with Jade Mahmood. Clear picture of current state.
- **Confusion or annoyance:** None. Standings are well presented.
- **Severity:** Fine
- **URL:** http://localhost:8790/competitions/01a10715-9940-76bb-bab1-259d0dd5fe20

###### 5. Coach Voicemail
- **Goal:** Alert Helen that I'm back and confirm summer placement
- **Action:** Called Helen Marsh and left a voicemail message
- **Outcome:** Voicemail left successfully. No immediate response, but I expect she'll confirm via WhatsApp as before.
- **Confusion or annoyance:** None. Standard phone behaviour.
- **Severity:** Fine
- **URL:** (phone communication)

### Hannah Cole

#### Hannah Cole - Friction Log: Spring 2027 Season End (s2-end)

##### Overall Experience
My first full tennis league season has been really interesting! The website got me organized and playing matches, which was great. I managed to complete my spring season with 5 matches (1 win, 4 losses) and beat the 4-match minimum. I've definitely improved and learned a lot. I'm now very keen to try doubles in the summer season and keep the momentum going.

---

##### Friction Log Entries

###### 1. Website date field incorrect when entering match results
- **Goal:** Record my match results accurately on the website
- **Action:** Visited match result entry forms for Paige Hayes and Harriet Fleming
- **Outcome:** Date field pre-filled with "2026-10-04" (old autumn date) instead of current date (March 2027)
- **Confusion or annoyance:** The dates seemed way off, but the system accepted them anyway. I wasn't sure if this would cause confusion later or if results would be recorded correctly.
- **Severity:** minor
- **URL:** /matches/[match-id]#report

###### 2. Season end date still shows "175 days left" on final day of season
- **Goal:** Confirm that the season is ending today (28 March 2027)
- **Action:** Viewed my matches page on the final day of spring season
- **Outcome:** Status still says "Spring 2027 · Results close in 175 days (Sun 28 Mar)" which is technically accurate but confusing on the actual closing day
- **Confusion or annoyance:** The message makes it sound like there's lots of time left, when actually today is the deadline
- **Severity:** minor
- **URL:** /

###### 3. No in-app court booking system
- **Goal:** Book a court for my matches
- **Action:** Looked for a "book a court" button or feature on the league website
- **Outcome:** No court booking system on the website. Helen explained I need to use "the usual club way" and the league site doesn't handle bookings
- **Confusion or annoyance:** For a beginner like me who just joined, it wasn't obvious where or how to book courts. I had to ask Helen for clarification and felt a bit lost about the process.
- **Severity:** painful
- **URL:** / (feature doesn't exist)

###### 4. Website showed "Hannah C." at first, causing opponent confusion
- **Goal:** Arrange matches with my opponents
- **Action:** Reached out to opponents via WhatsApp to arrange matches
- **Outcome:** Multiple opponents (Paige Hayes, Harriet Fleming, Lily Patel, Naomi Rees) initially said they didn't think we were drawn together. Helen later explained that the site was showing me as "Hannah C." so they didn't recognize me. Helen had to manually change my display name to "Hannah Cole"
- **Confusion or annoyance:** Very frustrating - I had to contact four different players to try to arrange matches, they all gave me the same confusing response, and then I found out it was because the website was truncating my name. This cost me time and made me look a bit silly.
- **Severity:** painful
- **URL:** / (player profile)

###### 5. Unclear which season's fixtures are active
- **Goal:** Understand my league draw and opponents
- **Action:** Tried to arrange matches, but multiple opponents said they weren't drawn against me
- **Outcome:** The website's "Tables" section shows both past seasons and current season. Some opponents were still looking at the Autumn 2026 tables instead of Spring 2027, even after the announcement. The website could make it clearer which season is active.
- **Confusion or annoyance:** Confusing UX - having multiple seasons visible at once and not making the current season obvious enough. Helen had to send clarifications to the whole club.
- **Severity:** painful
- **URL:** /competitions/[division-id]

###### 6. Score entry requires specific name order (confusing instruction)
- **Goal:** Enter my match results correctly
- **Action:** Filled in score forms with my score and opponent's score
- **Outcome:** Helen's message said "remember the score boxes follow the order of the names, not my-score-first" and mentioned some players entered results backwards this week
- **Confusion or annoyance:** The instruction is correct but confusing. The score entry could be clearer - perhaps labels like "Your score / Opponent's score" instead of relying on name order. I had to re-read Helen's message a few times to make sure I got it right.
- **Severity:** minor
- **URL:** /matches/[match-id]#report

###### 7. No information on website about social sessions or social play
- **Goal:** Find when and where to practice with other players between matches
- **Action:** Checked website for info about social sessions (times, locations, booking)
- **Outcome:** No information on the league website. Had to contact Helen via WhatsApp to get details (Tuesday/Thursday 6:30-8:30pm, Saturday 9-11am at Hollins Park courts). Needed Helen to tell me "just turn up" - no sign-in or booking system.
- **Confusion or annoyance:** As a nervous beginner, I would have loved to see the social session schedule on the website itself. It would give new members confidence and reduce the need to contact the coach directly.
- **Severity:** minor
- **URL:** / (feature missing)

###### 8. No visibility of doubles opportunities or next season information
- **Goal:** Learn about summer season and possible doubles play
- **Action:** Checked website for information about summer league and doubles sign-up
- **Outcome:** Website mentions Women's Doubles, Men's Doubles, and Mixed Doubles competitions exist, but no information about summer season timing, format, or how to sign up for doubles. Found out about summer from Helen's announcements, not from website.
- **Confusion or annoyance:** I'm very keen to try doubles but don't have clear information about when to sign up, how to find a partner, or what the summer format is. Helen mentioned potentially finding me a doubles partner but hasn't confirmed anything yet.
- **Severity:** painful (for someone as keen as I am about doubles)
- **URL:** /competitions/[doubles-division-id]

###### 9. Unplayed matches with two opponents at season end
- **Goal:** Arrange matches with all my opponents
- **Action:** Attempted to reach Lily Patel and Naomi Rees to arrange matches
- **Outcome:** Never managed to connect with these two for actual matches. The website shows them as "Still to play" but since it's season end, those won't happen now.
- **Confusion or annoyance:** I'm a bit disappointed I didn't get to play everyone - would have been good to meet all my division opponents. The website could perhaps suggest "suggested match-up dates" a few weeks before the season ends.
- **Severity:** minor (just personal preference)
- **URL:** / (match scheduling)

###### 10. Match results confirmed quickly but some confusion about outcome
- **Goal:** Get my match results officially recorded
- **Action:** Entered all 5 match results on the website (3 were entered by me first, 2 had opponent enter first)
- **Outcome:** Results were confirmed quickly - opponents confirmed within 24-48 hours. All 5 matches now show as confirmed and counted.
- **Confusion or annoyance:** None really - the system worked smoothly once I understood the score entry order.
- **Severity:** fine
- **URL:** / 

---

##### Summary & Feedback

The Hollins Park league website successfully got me playing tennis and organizing matches with other beginners. The standings system is clear, results tracking is straightforward, and once I understood the workflow, it was easy to use. However, there are several pain points that would really help new members:

**What worked well:**
- Easy sign-in with email links
- Clear match fixture listings
- Straightforward results entry once I understood the score order
- Good point system that rewards consistency
- Helen's announcements were helpful (though voluminous!)

**What needs improvement:**
1. **Court booking integration** - even just a link to the club's booking system would help
2. **Player display names** - avoid truncation (Hannah C. → Hannah Cole) as it causes confusion when arranging matches
3. **Clearer season indicators** - make the current active season more obvious in the UI
4. **Next season visibility** - show summer league info, sign-up deadlines, and doubles partnership matching at least a month ahead
5. **Social session info** - add club social session times/locations to the website so new members don't need to contact the coach
6. **Better match scheduling** - perhaps a "suggested dates" feature or a way to propose multiple date options directly on the site
7. **Confirmation messaging** - clearer labels on score entry forms (like "Your score here" rather than relying on name order)

I'm genuinely excited about next season and hoping to play both singles and doubles. Very keen to hear from Helen about summer sign-ups!

---

<a id="harness-faults"></a>
## Harness faults and deviations

- s1-w0: the text browser's follow command turned the footer's external GitHub link into a local 404 (Hannah entry 5); fixed
- s1-w1: engine treated the approved joiner "Hannah C." (display name chosen by coach) as an engine member until persona mapping used roster flag; no engine actions were taken for her (she had no matches).
- s1-w1: engine replies ignored what the coach asked (e.g. a partner's phone number) and always recited match memory; from s1-w2 a member who has played with/against a no-phone member may give their number.
- s1-w1: the text browser's page header printed the full /login?token= address after opening a K-handle (Derek's log quoted one already-used token). Fixed to show token=<redacted>; persona files scrubbed. The token had been consumed by the sign-in, so it no longer worked.
- s1-w1: Callum Byrne (scripted to insist he won the tiebreak) recited the true score on the phone ('You lost … 8-10'), contradicting his own claim; Tomasz noticed. From s1-w2 his memory states his belief.
- s1-w1: engine members answered players' requests to arrange a match with a recital of their results (Sofia). From s1-w2 they propose a time and the engine brings that fixture forward.
- s1-w5: a player's phone call to the coach returned 'no answer' without leaving a voicemail (Hannah); from now calls to the coach leave a voicemail in her inbox. Hannah's WhatsApp did reach the coach.
- s1-w5: the session's API spend limit stopped the coach and Grace mid-checkpoint, and the container restart stopped the Worker. The Worker was restarted on the same local D1, and both personas were re-run to finish their checkpoint.
- s1-w7: a circular import deadlocked the engine at week 7 before any week-7 play; the week-7 events (tiebreak replay, a member's break) ran after week 9's play instead, with the clock set back to week 7 for them.
- s1-w9: players asking other members for a third player's phone number got 'Happy to have a hit…' (the scheduling reply took priority). Fixed: a number request gets a contact answer.
- s1-w9: engine members replied to scheduling messages that mentioned a result with a recital of their matches (Grace's 'messaging system is broken'). Not a product issue. From s1-w10 a message about a time or day gets a scheduling answer.
- s1-w9: following the Chase list's 'Email N players (BCC)' mailto link loaded a nonsense address in the text browser, and the coach ended up pressing Sign out and re-signing in. From s1-w10 a mailto link opens a draft the persona can send with msg send-mailto. Also from s1-w10, chasing messages from the coach make some members play outstanding matches sooner (before this, chasing had no effect on engine members).
- s1-end (significant): the text browser did not repeat a POST answered with 307. The coach site uses 307 deliberately to continue long season-turnover forms ("a 307 keeps the form"). The coach therefore saw blank pages, found only 3 of 5 drafts made and only one competition started per press, and pressed again each time. On the fifth press the button had become "End season now", and the coach (through her own helper loop) ended Spring 2027 a minute after starting it, then had the coding agent reopen it. The blank pages and partial progress are harness faults. The real product points that remain: End season has no undo on the site, and the Start/End button sits in the same place. Fixed for season 2.
- s1-w9/s1-end: two engine members (Dana Park, Jade Mahmood) "accepted" Helen's partner suggestions by message, but their site submission was refused. The engine still told the coach they had done it. The refusal itself is product behaviour, verified in packages/api/src/league/partner-choices.ts: only active entries' members count as "playing in this competition", and both their pairs had been withdrawn when Sofia was injured. Ryan Wood picked the wrong partner because the engine took the first name in Helen's message.
- s2-start: engine members told players arranging season-2 matches 'I don't think we're drawn against each other' until the engine had seen the new fixtures (Hannah's first opponents). Fixed partway through the checkpoint by loading the season-2 fixtures (engine week 0).
  (Marcus's s2-start 'fixture list mismatch' blocker is this harness fault; corrected in his and Hannah's diaries.)
- s2-start: engine members' canned replies (identical offers, match recitals) made Grace conclude 'the messaging system is broken' again. Replies now vary, accept a day the player proposes, and acknowledge non-score questions; not a product issue.
- s2-start: links the coach sent through partners were 'used' by the partner (already signed in) instead of being passed on, and late newcomers asked whether they want to play recited match history. From s2-start a partner passes the link on (most of the time) and a member with no entries answers yes or no. The fix was applied to Helen's s2-start messages afterwards.
- s2-w5: Grace again rated the 'messaging system' a blocker. The messages are the harness's stand-in for WhatsApp, not part of DeuceLeague; all such findings are excluded. Engine members now always accept a day the player proposes.
- s2-w5: Hannah's opponents still said 'not drawn against each other', because the engine matched her by 'Hannah Cole' while her entry is 'Hannah C.' (the display name the coach approved). Fixed. Hannah's 'fixture season confusion' blocker is this harness fault.
- s2-w5: the engine invented a missing member's phone number from the length of their name, so two members of the same name length (Gavin Evans, Elliot Khan) were given the same number. Helen noticed. Harness fault. Also, the coach's renaming of 'Hannah C.', 'Ravi M.' and 'Nora Q.' briefly orphaned those members in the engine; fixed by following renames by member ID.
- s2-w6..w10: after the rename, the engine's cookie jars were still filed under the old names, so Ravi Menon and Nora Quill could not enter results in weeks 6–10 (their opponents' entries waited). Fixed at season-2 end by copying the jars; their missing entries are a harness artefact.
- s2-end: the org's API spend limit stopped all six player personas mid-checkpoint, and a container restart stopped the Worker again. The Worker was restarted on the same D1, and the personas were resumed after the limit reset.
- verification: my stats script paged GET /v1/events?order=newest until next_cursor was null. The contract says the cursor is always present and reading ends at an empty page, so the script looped (a harness bug, not a product one). About 225,000 identical orchestrator requests were removed from the published request log; the unfiltered log is kept locally.

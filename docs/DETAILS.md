# Details and history

This is the technical background to the [README.md](../README.md): why every change exists, with the diagnoses that led to them
(nx3 through nx28: the project's build numbers). The example values (Wi-Fi `HomeWifi`, accessory `NiceIT4WIFIAABBCC`, user
`homeuser`) stand in for whatever is different in your case. The data in this document comes from one phone and one IT4WIFI module.

## What is new in nx28 (the page Extra buttons: a list that is always there, and a switch in the middle of its row)
On a phone that reached the accessory through the Nice cloud the page *Extra buttons* showed its heading and its two hints, and no commands to tick. The page of the app fills the list
only after a VERIFY that succeeds at that moment, and it says nothing when that fails with code 4. The choice of the extra buttons is kept on the phone, so the list does not need the
accessory: until the page has its own list it now shows what the app saved at the last INFO (`nxPickList`; for a user who is not the administrator: the commands that user may run), and
when there is nothing to offer it says so (an accessory that has just restarted can report no commands at all: `T4_allowed` 0 and type `unknown`, seen on the phone that showed this). And the switch *Show extra buttons* stood 9 dp below the middle of its row: Ionic hangs a switch at a fixed distance from the top of a row of
52 dp, and the rows of the skin are higher. Every switch in the app now stands in the middle of its row, 16 dp from the right edge. nx28 has version code 20201126.

## What is new in nx27 (one more password line masked in the Debug log)
The first Debug log of nx26 showed a line that the masking missed: `_updateDeviceData verify [..] user: homeuser, password <the pairing password>`, without a colon after the word, so
the rule for "password: ..." did not match. A long run of base64 after the word "password" is masked now. And the hook of nx26 says once per session and type that it saw an event
that the app reads completely (`event CHANGE: read by the app, no details in it`), so that a log without a DIAGNOSTIC line shows whether the hook saw events at all. nx27 has version code 20201125.

## What is new in nx26 (the events that the app does not read are written to the Debug log)
The current MyNice app of Nice (1.3.1, a new native app that speaks the same protocol to the IT4WIFI) listens to an event that the app of this kit throws away: next to `CHANGE` (the
state of the gate) the accessory sends events of the type `DIAGNOSTIC`, with `EventDetails`: a cause code (why a manoeuvre ended), the state of the photocells (`BlueBusErrStatus`),
the number of manoeuvres and the threshold for maintenance (`ManoeuvreCount`, `ManoeuvreThLimit`), the average motor current, the battery level. The old app knows six event types and
answers every other one with "Event type unknown!". Which of these fields a given gate controller really fills is not known, so nx26 is a first step that changes nothing on the
screen: `patch-22-diagnostic.py` passes the text of every event to `Nx.noteEvent` before the app parses it, and an event of a type the app does not know, or one with details the app
does not read, is written to the Debug log as one line (`event DIAGNOSTIC (not read by the app): <Event ...>`), with the addresses, the names, the serial number and the signature
replaced by dots. Use the gate for a while (open, close, stop it halfway, break the photocell beam) and send the Debug log. nx26 has version code 20201124.

## What is new in nx25 (everything on one left edge, and a backdrop if you want one)
nx24 still looked untidy, and measuring the screens showed why: things that should stand on one line did not. **The header.** The app writes the title of a page as plain text on one
page and as an element on the next, and the rule that makes room for the status chip under the title took a title of plain text for no title: on Settings, System, About and five more pages
the title stood 4 dp higher than on Favorites and on the page of an accessory. The script now says whether a title has text (`nx-chip-solo` on the chip of a bar that has none), so every
title is on the same line. The bar had 14 dp at the sides and a gap of 10 dp between its parts, and the app leaves empty parts in a bar, so a title started at 14, 24, 72 or 82 dp. Now
the bar has 16 dp at both sides like the page under it, no gap, the circle of the back button and of the buttons at the right starts and ends at 16 dp (the button at the right ended at 9),
and a title starts at 16 dp, or at 72 dp next to a back button. **The lists.** The label above a list started 8 dp left of the text in the cards under it; it starts at the same 36 dp now.
The first and the last card of a run have large corners and the ones between them small corners, and until nx24 the style rules told first from last by the markup, which differs from page
to page: on the page of an accessory no run had an end, on the page of a home the name was a square card, "Add Accessory…" ended a run without a round corner. The ends are now read from
the screen: cards that stand directly under each other are one run (`data-nx-g` = only, first, mid or last, set by nx-patch.js whenever the page changes), whatever the markup is. The list
of All events stood against the edges of the window and has the 16 dp of the others. **A backdrop.** Settings > Appearance > *Background*: *None* (as before), *Glow* (two soft fields of
color), *Shapes* (a large circle, a ring and a dot) or *Rings* (thin circles from the top corner). They are drawn with gradients in the colors of the palette you chose, so they follow the
palette and the theme, they lie behind the header and the cards, and they stay where they are from page to page. The choice is kept in `localStorage` (`nxBackdrop`) and applied before
the first paint, like the theme and the palette. nx25 has version code 20201123.

## What is new in nx24 (the accessory screen tidied up, and a failure line that the gate contradicts is withdrawn)
The first screenshot of nx23 on the phone showed two things. **It looked untidy.** Six shape treatments stood on one screen (a rounded rectangle for the status chip, a pill for the entry to
Activity, a bar with centred text and a glyph that hung on its first line, the two halves of a connected group for Open and Close with 12 dp between them, a whole pill for Stop), and three
different distances (8, 12 and 16 dp) between the line, Open | Close and Stop. Now there is one rule: **what can be pressed is a pill** (the status chip, the entry to Activity, Open, Close,
Stop, the extra buttons, the button of the line), and the line itself is a bar as wide as the pad whose content reads from the left: the glyph in the middle of its height, the words in one or
two balanced lines, the button at the end with the same 4 dp around it on three sides. What the screen says by itself at rest (the Blocked pill, a note, "Updated 12:03") stays in the middle.
The line is 12 dp from the pad, as the rows of the pad are from each other (8 dp on a screen lower than 700 dp), and never touches the entry to Activity (8 dp). Open and Close were the halves
of a connected group, which is right for a gap of 2 dp; nx23 widened the gap to 12 dp (two opposite commands should not share an edge) and left the halves. **It said something untrue.**
On mobile data, through the Nice cloud, the line said *No connection to the accessory. Open not sent.* while the state said *Opening* and the accessory had logged the Open. Two changes:
through the cloud a failed call is never "not sent" (nobody can know from here: the words are *No answer to Open. It may have arrived: check the gate.*, a refusal by the accessory stays a
refusal), and on any route a failure line is withdrawn as soon as the gate reports, after the tap, the state that the command asks for (and was not in before): the screen then shows what
happened, and the LOG keeps a line (`command: Open was reported as failed (notsent), but the gate reports opening: the line is withdrawn`). What exactly failed in that call is not known
yet: the Debug log of such a moment has the line `command: Open failed {...}` with the code. nx24 has version code 20201122.

## What is new in nx23 (a design pass: a gate screen that does not move, honest feedback, answers first)
nx23 is the result of a design review. Seven designers (visual and Material 3 Expressive, UX, safety of the gate, accessibility, wording, set-up, data screens) each looked at every screen of nx22, in light and dark, and measured what they said; a design lead merged their 59 findings into 40 changes for this release, 15 for later and 4 rejected; eight engineers built the changes at the same time, each in a copy of the code; the result was then checked again as a whole, by four more (the accessory screen and the command feedback, the chip and the dialogs, all other screens, and a read-only code review that tried to break the new code). The six principles that the lead gave every builder are the shortest summary of the release: **show how sure you are** (confirmed, unconfirmed and unknown look different; a state that is out of date says so); **nothing moves under the thumb** (the pad is bottom-anchored, nothing above it changes height, nothing modal opens over it, Stop is never delayed, dropped, dimmed or covered); **say what happened to the tap** (sent, not sent, no answer, and never a claim before it is true); **cause first, one word per thing**; **emphasis follows consequence** (Stop is solid red whenever it may be needed); **reachable by everyone, proven in the harness** (every control has a role, a name, a 48 dp hit area and a keyboard path). Only the CSS, the app's templates and the JavaScript layer were changed; the app's own logic is as it was, except for one narrow case that is described under *Stop* (it is the one change that needs your own test on the gate). Nothing leaves the phone.

The paragraphs below say what each part does and why. The numbers (heights, contrast ratios, counts) are measured in the harness (`harness/`), with the invented data of the harness; the phone can differ, and the last part of this section lists what only the phone can show.

**The accessory screen.** The accessory screen is now a stack of boxes that keep their height: the hero and the state word give way, the status line (always in the DOM) and the pad are anchored to the bottom, so a Blocked pill, a note, an obstruction or a late message never moves Open, Close or Stop (Open stays at the same y in every state at 412x915 and 360x640; with two extras, an obstruction and a pill Stop is still above the tab bar). Stop is solid red whenever it may be needed and only at confirmed rest the quieter container with a 2 dp outline. When the app does not know (Not usable, Checking, Connecting, an unknown state) the hero is neutral with a question mark and a plain gate; an obstruction is an error chip with the position of the gate as context; Blocked is a button that opens the history, "Maybe blocked" is the same pill dashed. Open and Close are momentary: nothing is "selected" and the hero turns only while something moves. The old row "Accessory:" is gone, "Home:" shows with several homes, and the history entry is a tonal chip ("Last: Close · yesterday 22:00 · Schedule") under the state. patch-18 makes the layout; patch-14 and 15 only copy the script and ask for the state.

**What is new in nx23 (every tap says what became of it, and a state says how old it is).** *Command feedback.* Until nx22 a tap was never acknowledged: the app's success handler is empty, the extra buttons said `<command>: sent` at the tap whether or not anything went out, and a failure raised a generic popup while the chip stayed green. Now every tap of Open, Close, Stop and of the extra buttons goes through `nxRun` (patch-12), which calls the app's own `runCommand` first and unchanged and notes what became of it. The service calls are wrapped (they only look along; every result goes on unchanged) and a ledger per accessory feeds one decision function, `lineOf(device)`, whose words appear in the status line above the pad: `Sending Open…`, `Open sent 12:03:41 · via cloud`, `No report from the gate yet. Check it.`, `No answer to Close. It may have arrived: check the gate.`, `No connection to the accessory. Close not sent.`, `Too soon after the last command. Close not sent: tap again.`. The words follow what is known: "sent" means the call came back (nobody can prove from here that the accessory accepted it); "not sent" is only said when nothing went out (the service could not connect, a refusal, the app's own guard); otherwise "No answer … it may have arrived". *Stop.* The app ignores every tap that comes within 500 ms of its previous command, Stop included. When (and only when) the app did not call the service for a Stop, the same call is now made from here, in the same tick (`STOP_BYPASS`, `'guard'`; `'always'` and `'off'` exist). *The accessory does not answer.* The line gives the cause and a `Reconnect` button (no modal sheet), Open, Close and the extras lose colour (`saturate(.3)`: opacity would fall to 2.8:1) but keep working, Stop is never touched, and a tap says `Waiting for the accessory. Open is not sent if it stays silent.` because the app starts a check with no failure branch. *Trust.* The accessory pushes changes only, so a state can be old. The ledger keeps when the state was last reported (status answer or event) and when anything was last heard (logs, pairings, checks, commands): `live` for 30 s, `checking` while it is asked for (the hero is the loading shape, the word is dimmer), `aging` (`Updated 12:03`) later, `stale` (`Last confirmed 12:03`, a `Refresh` button, the shape stands still) after 75 s of silence or a failed request. After a resume the app marks every accessory not reachable until its own check answers; that is held as "checking" for at most 8 s instead of a red `Not usable` and a red chip. `window.__nxTrust(device)` gives the chip and the lists the same answer. *Messages.* A toast never takes a tap any more and, on the accessory screen, sits under the header; failures stay 9 s. *Extra buttons.* One name everywhere (`Extra buttons`, link `Edit extra buttons`), an always visible hint and a line about Block and Release (`skin/copy/command.json`). Not known: how long a call takes to come back, whether it comes back on the accessory's answer, what the real failure codes are in each case; the LOG records the time of every call so that it can be seen. Tests: `test/nx23-command.test.js` (141 checks), `harness/steps-command.cjs` and `steps-trust.cjs`.

**The connection status is an answer now, not a report (nx23).** *What was reported.* Seven designers looked at nx22 and agreed on this part: the sheet came back by itself (a diagnosis that ended after the sheet had been dismissed slid it up again, six seconds later, over Open, Stop and Close), its text was a report (up to 104 words with TCP, TLS, "subnet routes", "exit node" and the likeliest cause last), and on a 360 dp phone the chip was cut ("Accessory not reachable · ot…") and was not a button (the real button was an invisible one-pixel element at the end of the page). *What is now.* The sheet opens only when you ask for it: the chip, Reconnect, or `NX.diagnose()`. Every measurement has a number and only the newest one may write its result, so dismissing the sheet while it says "Checking…" cancels nothing and brings nothing back; the result is kept for the next time and the chip shows it. The verdict is two sentences, the cause first and then what to do ("Your phone is on "GuestWifi", not "HomeWifi", and the accessory does not answer here. Switch to "HomeWifi", then tap Reconnect."), taken from one table (`COPY.v`, at the top of section 6 of `nx-patch.js`); what else to try is a short list under the diagram, the restart last and with what it costs, and every number, error name and VPN option that the short text leaves out is still under Technical details and in Copy. The chip is a real button in the header, 32 dp high in a hit area of 48 dp, with a chevron and a pressed state: the verdict word ("Accessory online", "Not reachable", "Connecting…", "Checking…") and at most one tag (no Wi-Fi, VPN, other Wi-Fi, mobile data, cloud) that gives way first; "Checking…" has a dashed outline and a hollow dot, so that it does not look confirmed. When the app is connected through the Nice cloud, the sheet no longer shows a red "failed" row under the green headline ("Direct connection: not available from here, the app uses the Nice cloud"), the phone is red only when it has no way out, a failed row has the warning mark and never the check mark, and the header symbol is the error mark when the accessory is the problem and "no Wi-Fi" only when the phone is. The diagram (three nodes of 64 dp, the carrier in the caption of the phone) and the verdict now fit above the footer at 360x640; a healthy sheet shows one line for what is routine. Done (it was Close) is the filled button of a healthy sheet and Reconnect of a failing one, in the same places; Reconnect clears the old verdict at once and says "Reconnecting…"; "Check requests" closes the sheet before the popup can open (a popup lay under the sheet, and one tap on the visible sheet could press an invisible "Allow"); "Debug log" and "Copy details" say what they do.

**Dialogs, the Debug log and the semantic layer (nx23).** Three overlays used to sit on the gate controls: the pairing popup (it opened over the accessory screen and, because Ionic switches off every touch behind a popup, froze Stop while the gate moved; "Later" came back at every opening of the app), the LOG panel (black and green, 60 % of the screen, no way to close it, Back left the page and left the panel open) and the small red LOG button over the content of 24 of 25 screens. Now a request for access never opens as a popup on the accessory screen or while another sheet is open: a snack says who wants access, with "Review", and the Settings tab gets a dot; the popup opens when you leave the screen, "Not now" (also Back and Escape) keeps the request quiet for 24 hours, and a check that you ask for yourself (the sheet's "New users", "Review") always shows it. The popup asks "Allow access?", names the person and their phone ("Home assistant (Pixel 7)") and the accessory as every other screen does ("AABBCC"), has two 48 dp buttons 16 dp apart, and the failure messages say who and why. The Debug log is a bottom sheet like the status sheet, half the screen high, with Clear (it asks again), Copy ("Copied 1,512 lines") and Done; Back, Escape, the scrim and a change of page close it. Its button is gone from every screen of an app that has an accessory: the ways in are the status sheet and Settings > Debug log; during the setup wizard, where there is no chip, a small bug button (32 dp, 48 dp to touch) sits in the header. Everything for screen readers and keyboards is added from outside by one layer in nx-patch.js: roles, names ("Open the gate", "Back", "More commands"), tab stops and focus rings on what only had a click handler, one level-1 heading per page, the current tab, the language of the page, the state of the gate and the connection status as live text that is spoken once when it really changes, and a dialog manager: a sheet or popup that opens takes the focus, the page behind it is inert, Escape and Back close it (Back no longer also leaves the page: Ionic runs only the back action with the highest priority, and the manager registers one while a dialog is open), and the focus goes back to where it was. Ionic stops every click it did not make itself, which also stopped a key press and TalkBack's double tap, so a click without a touch (detail 0) inside our own controls is let through; a real touch is not changed in any way. Nothing is inert unless a dialog is open now (a timer, the first touch, a change of page and the app coming back all clear it), so the gate can always be stopped.

**Lists, settings, Favorites and the Design page (nx23).** The home screen of a launch is now a card when there is one favorite: a neutral shape with the gate in it, the name, and one pill that says what we know about the accessory: *Online* (only when the app says it can be used and this session has checked it), *Checking…*, *Connecting…* or *Not reachable*. The state of the gate (Open, Closed…) is shown on the card only while the command feedback says it is confirmed (`window.__nxTrust`), and it goes away by itself when it is not any more. Tapping an accessory that cannot be reached used to do nothing; it now opens the status sheet, which knows why. The legacy buttons of the original app (the blue, green and red ones with their own colours) now use the colours of the theme and are 56 dp high; "New accessory" is the filled primary button. Section headers are capitals through CSS, "Select accessory" rows have their chevron on the right, hints in fields and the dark "Accessory ready" stage are readable, empty values in About say "Not reported" and switched-off schedule fields are dimmed. On "Other commands" the rows show a play glyph (a tap runs the command at once; there is deliberately no "tap again"), commands are grouped by what they do, and the button on the accessory screen that opens the page shows the tune glyph instead of an eye. The Design page is a demo, not a setting: a plain row "Design reference" at the end of OTHER, a banner that says nothing on it controls the gate, buttons that look like Open and Close say "(demo)", neutral example names, and the class names behind a switch "Developer notes". A row "Debug log" at the end of OTHER opens the LOG panel. Tests: `test/nx23-lists.test.js` (75 checks).

**The setup explains itself (nx23).** The first run and the pairing used to be a row of nearly empty pages and four full-screen waits with a spinner and no words, and the commonest failures ended in a sentence without a cause. Now each wait says what it waits for: the search, the identification (Android will ask to connect to the accessory's Wi-Fi network: tap Connect; the phone may leave the home Wi-Fi for a minute and returns by itself), the configuration (keep the app open, up to 2½ minutes; after a minute: the usual causes are the password and the 2.4 GHz band) and the pairing request (the app gives up after 5 minutes), each with the wavy progress indicator; the same heads-up stands on Welcome, "Turn on the accessory" and "Accessories detected", before the dialog appears. A cancel button waits for a phone test. "Accessory not found", the general network error and the configuration timeout name their cause and one action; Location off, a VPN and mobile data are added only when the phone says they are on. The password step is titled "Home Wi-Fi password" and says the password must be exact; the Wi-Fi step says the accessory only works on 2.4 GHz and warns when the phone is on the accessory's own network. A full accessory used to end on a missing template (and, in Settings, on a state the app names wrongly): both pages exist and the wrong name is redirected. The text of the waits was black on the dark theme (1.1:1) and is readable now; the camera button of the code page, which draws nothing, is hidden. The wording rule: the cause first, then one action, at most two sentences, detail behind "Technical details".

**Activity, answers first (nx23).** The Activity sheet used to open with a card that said what is *not* the case ("Not blocked, as far as the log shows") and ran 2,700 px, with every block counting another period. It now opens with what happened: a quiet line for the block state (an amber card only when the gate is blocked), a strip that appears only when the accessory restarted, lost Wi-Fi, lost the gate controller or reported an error in the last 24 hours, four tiles (last opened and closed with the time as the value, the commands of today and of the week, the obstructions of the week) and the six latest events; the rest of the history is behind "Show all N events". The charts count one period, which every heading names: the last 7 days (today and the six days before) or the whole log, which is as long as the accessory has kept it (it forgets the log when it restarts), with a switch when the log is older than a week; in that period the tile, the bars, "Who" and the hours add up to the same number. A day from before the log began is a dashed empty box, never a zero; the day it begins shows a minimum ("9+"). Every bar has its number, the busiest hours are named only when there are at least ten commands (all tied hours are marked, neighbours merged), and Open is solid, Close hollow and Other hatched, so the chart reads in greyscale; the quiet bars are 3:1 on the card. Amber and red mean "in the last 24 hours" (or a block that still holds): older events show their counts in a calm tone. The sheet is a column, so "Done" stays at the bottom in the empty, error and loading states; an error says the cause in one sentence, offers "Try again" and "Open connection status", and keeps the codes under "Technical details"; a slow reading says so after 3.5 seconds. The statistics (`analyze`) were not changed; the words are: "At the gate" is the gate controller moving the gate without a command from the app (a remote, a wall switch, the gate closing by itself), "Another phone" a controller that is not in the list of users. Tests: `test/nx23-activity.test.js` (142), `test/activity.test.js` (295); the harness script `steps-activity.cjs` renders the states.

**The English of the original app, and the titles of its pages.** The text the patches add is plain English; the English of the original app is a translation from Italian and reads like one: *Enter Username e Description*, *Users management*, *Historian of events*, *Waiting for confirm*, *Go ahead*, *Central is unreachable*, and *Not usable* next to a status chip that said *not reachable*. Three setup pages were titled with the name of their template (*add_new_device*, *add_device_setup_name*, *start*), and the System and Settings tabs were both titled *Nice*. **Only English text is changed**: the other 16 languages, the old translation archive and the logic of the app are what the original has (`verify-apk.py` compares them with the original APK). `patch-21-copy.py` reads `skin/copy/`: the `*.json` files give new text for keys of `locale-en.json` (a key has to exist, a typo stops the build; a key written `+KEY` is added, used once, for the error code 11), and `templates.json` is a list of edits of templates, each an `old` text that has to occur exactly once (a title that is a raw id gets the existing translation key of its page, or a single space like its neighbours; a divider that only repeats the title is taken out). The script runs after all the other patches and writes nothing unless every text and every edit matched; if another patch changed a text that an edit wants, the build stops and names the entry.

**What a failed command says.** After a failed Open, Close or Stop the app shows an *Attention* alert with the explanation of the error code. The original said *Connection error with the Accessory*, *Central is unreachable*, *Sign not valid*, or, for a code it never translated, the raw key *NHK_ERROR-12*; none of them said whether the gate had got the command. Now each says what is known and what to do: no answer: *it may not have arrived*; the connection was lost: *it was not confirmed*; the accessory answered with an error (`4`, `007`): *it was not carried out*; and all but one end with *look at the gate, then try again*. A code without any text reads *The accessory reported error 12. Check the gate.* That sentence comes from a small wrapper around `$translate.instant` (`nx-patch.js`, section `nx23 copy`), installed by a decorator when the app boots and, as a safety net, through the injector. It acts only for the call right behind the title of the app's own alert, because the helpers of the patch ask for the same keys and use "the key came back" to mean "the app has no explanation"; the app's logic and its alert function are not touched.

**What the second round found.** Checking the merged result found things that no builder could see alone, and they are fixed: after any sheet closed (the status sheet, Activity, the Debug log) the page swallowed taps on Open, Close and Stop for about 0.4 s (real touch taps at 60, 200 and 350 ms sent nothing, at 600 ms one command; the cause, an invisible scrim that stayed clickable while it faded, is as old as nx22), so those layers take no touch while they are closed; the entry to Activity, the line's button and the chip are native buttons and did not pass Ionic's tap gate for a key press or TalkBack's double tap; the line of the accessory screen was never an assertive live region for a failure although the function for it existed; a double tap said "not sent" although it was sent; a stale tap could take the answer of a later one; a status request that never answered left last session's state on screen as live after 45 s; the words of the alert of a failed command and of the line above the pad said the opposite about whether the command may have arrived; "If you just sent a command" leaked into the Activity error card and into two toasts; the settings cog of "More commands" was white on pale (1.2:1) in the light theme; and the chip, the Debug log and the line each had an `aria-live` of their own, so one change could be spoken twice.

**Known limits and what was put off.** A status sheet that you open yourself still covers the pad on the accessory screen (one tap on the scrim closes it; it was left as it is: you asked for it). The app's own failure alert (a modal) still lands on the pad after a failed command, because wrapping the app's alert function was put off; its text now says whether the command may have arrived. The chip speaks for all accessories at once (as in nx22). The line on a clock that was set back keeps a state "live" for too long. At heights around 500 dp a second row of extra buttons lies under the tab bar, and with three or more extras on a 320x568 screen Open and Close cover the Activity entry. Put off on purpose (see the review): opening the only accessory at the start of the app, a chip per accessory, a way out of the Attention page for an owner whose old app is dead (it needs the reset procedure of the accessory), the Next button of the Wi-Fi step, the heavy hero slabs of the wizard, the colour of the hero in the light theme (to be tested outdoors), the palette-dependent state colours, a line that says that the gate moves out of sight when you are away, 48 dp palette swatches, the wizard navigation, a confirmation before granting admin rights, grouping of the history, and text that follows the font size of the phone. Rejected: a second tap to confirm Block commands (a daily one-handed action), hiding the chip when it is healthy (red must always have one place), and redesigning the two-tile start page.

**What only the phone can show.** (1) *Stop*: when the app itself did not send a Stop (it ignores everything within 500 ms of the previous command), the same service call is now made from here (`STOP_BYPASS = 'guard'` in section 9 of `nx-patch.js`; `'always'` would also skip the app's own check on an accessory that it calls "not usable" and send at once; `'off'` restores the app's behaviour). Try it on the gate with the LOG open (Open, then Stop at once) and look at how long the app's own check takes after a cold start before deciding on `'always'`. (2) What the accessory really answers to a command (the line says "sent" when the call came back; nobody can prove from the app that the accessory accepted it) and what the codes 4 and 007 mean (the texts say "not carried out"; that is an inference from the names). (3) The set-up with TalkBack (the waits have a live region), the Cancel button of the waits, the claim that the accessory works only on 2.4 GHz (from a snippet of the Nice manual; check it on the printed manual) and the restart advice ("disconnect its power for 30 s"). (4) The hardware Back button with the status sheet, Activity, the Design page and the Debug log open (the back action has priority 350). (5) The legacy buttons of the remote-control, sensor and automation pages (measured on copies only), and the Favorites card at a cold start.

**Tests (nx23).** `test/nx23-gate.test.js`, `nx23-command.test.js`, `nx23-status.test.js`, `nx23-dialogs.test.js`, `nx23-lists.test.js`, `nx23-wizard.test.js`, `nx23-activity.test.js`, `nx23-copy.test.js`, `nx23-qa-chrome.test.js`, `nx23-qa-gate.test.js` and `nx23-qa-screens.test.js`, `test/debuglog.test.js` (the Debug log sheet in jsdom) and `test/copy.test.js` (the script of the English wording on an invented app tree); about twenty existing assertions were changed because a text or a structure changed on purpose, never weakened. The harness has a guard script per area (`harness/steps-*.cjs`: gate, command, trust, sheet, a11y, dialogs, log, approve-pad, lists, wizard, copy, activity; `audit-a11y.cjs` audits 25 routes) and `qa-gate.sh` runs the checks of the accessory screen again. Measured on the 25 routes at 360 and 412 dp: controls under 48 dp 21 → 0, buttons without a name 26 → 0, targets without a keyboard path 67 → 0, pages without a level-1 heading 25 → 0, legacy buttons 1.2–2.8:1 → 6.2–13.9:1, Open, Close and Stop moved 0 px in 26 scenarios.

## What is new in nx22 (Material 3 Expressive as a library, and an example page in the app)

nx22 has version code 20201120 and installs over nx21 when it is signed with the same key. Nothing changed in the network layer (the native layer only reports `nx-22`). What changed is the skin (a library of the
components of Material 3 Expressive, `skin/src/m3e.css`, and the real screens now use it), one new script (`nx-gallery.js`: the page Settings > Design), a few lines in `nx-patch.js` and `patch-17-gallery.py`.

**What was reported.** *"I now want more Material 3 Expressive elements in it. I really want an example app for the use of M3E."* I took that as two things at once: the real screens should be made of the expressive parts,
and there should be a place in the app that shows every part, working, with the numbers, so that someone who wants to use M3E in a web view can see how it is done. Both are in nx22.

**Where the numbers come from.** The design site (m3.material.io) cannot be fetched from where this is built, so the numbers are taken from Google's source: the token files of `androidx.compose.material3`
(`ButtonXSmallTokens` to `ButtonXLargeTokens`, `ConnectedButtonGroupSmallTokens`, `SplitButton*Tokens`, `Fab*Tokens`, `FabMenuBaselineTokens`, `LoadingIndicatorTokens`, `LinearProgressIndicatorTokens`, `SliderTokens`,
`SwitchTokens`, `FloatingToolbarTokens`, `ListTokens`, `AssistChipTokens`, `TypeScaleTokens`, `ShapeTokens`, `ExpressiveMotionTokens`), `MaterialShapes` with `androidx.graphics.shapes`, the sources of the loading indicator and
the wavy progress indicator, and the component documents of Material Components for Android. Compose is not used and no Kotlin is included: only the numbers, written down as CSS (Apache License 2.0, see
[NOTICE.md](../NOTICE.md)). `test/skin.test.js` has them as a table (81 checks, most of them about these numbers), so changing one is a decision and not an accident.

**The principles of the expressive update, and where to see them**

| Principle | What it is here |
|---|---|
| **Shape** | Corners that morph, with a spring: a button is round or square; pressed it gets a smaller corner (8, 8, 12, 16, 16 dp for XS to XL); a toggle changes shape when it is selected (round becomes square and the other way around); in a connected group the inner corners are 8 dp (4 dp pressed) and a selected button is round all over; a list item is 4 dp inside the list, 16 dp at its ends and when it is pressed or selected. And the 35 shapes as content: the hero of the accessory screen, the avatars, the swatch of the palette in use. |
| **Size** | Five sizes of buttons (XS 32, S 40, M 56, L 96, XL 136 dp), icon buttons in three widths each, FABs of 40, 56, 80 and 96 dp, sliders with a track of 16, 24, 40, 56 and 96 dp. Open and Close on the accessory screen are size L (XL on a screen of 840 dp or more). |
| **Motion** | Springs instead of curves. Six of them (below). The loading indicator and the wavy progress indicator are the two moving parts of M3E. |
| **Color** | The seven palettes of nx21 (dynamic color, tonal), light and dark; the roles are shown on the page. |
| **Type** | The 15 roles of the scale and the emphasized styles (one weight heavier: 400 to 500, 500 to 700). |

**The 35 shapes.** `skin/src/tools/build-shapes.py` is an independent port to Python of `MaterialShapes` and the parts of `androidx.graphics.shapes` that it needs (the vertices with their rounding and smoothing, the
way a rounded corner is built, the star, circle, rectangle and pill builders, the repeat and mirror helpers and `normalized()`); the sampling of the finished outline into the points of a `clip-path` is new. It writes
`skin/src/shapes.json`, 144 points per shape (about 2.1 KB each; the CSS has them as `--nx-v-<name>`). Because every shape has the same number of points, `clip-path` can morph from any shape to any other: 33 shapes are sampled at equal angles
around the center (point *i* of every such shape lies on the same ray, so an interpolation is a pure radial blend); two (*puffy* and *pixel triangle*) are not star-shaped about the center and are sampled at equal arc length.
The first point is at 3 o'clock and every polygon runs clockwise. Every vertex, rounding value and rotation was compared mechanically against `MaterialShapes.kt` (0 mismatches); what could not be compared is the numerical
output of Google's code (there was no Android runtime), so the rest was checked analytically (tangents continuous at every junction inside a rounded corner, the circle's radial error about 1e-6, mirror and rotation symmetry)
and by eye on a contact sheet. How close the 144 points are to the exact outline: at most 0.13 % of the box for 27 shapes; burst 0.30 %, soft burst 0.18 %, puffy diamond 0.6 %, puffy 0.78 %, pixel triangle 0.85 %, pixel circle 0.93 %
(its steps are chamfered), boom 1.8 % (15 teeth do not divide 144, some tips are a little short) and soft boom 10.8 % at the hairline slits between its petals (the area differs 0.2 %). Of the 595 pairs of shapes only one, boom to pixel triangle, has an
intermediate state that crosses itself. As in Google's sources, the shapes sit slightly inside the box (`normalized()` uses the control-point hull). *Very sunny* has 8 rays, as in the source.

**The motion scheme.** Six springs (damping ratio / stiffness): spatial *fast* 0.6 / 800, *default* 0.8 / 380, *slow* 0.8 / 200, which move things and overshoot a little (the fast one most), and effects *fast* 1.0 / 3800, *default* 1.0 / 1600,
*slow* 1.0 / 800, which change color and opacity and do not overshoot. `build-tokens.mjs` turns each into a CSS `linear()` easing of 41 points and a duration (the time after which the spring stays within 0.2 % of its end):
`--nx-spatial-fast` 350 ms, `--nx-spatial` 420 ms, `--nx-spatial-slow` 570 ms, `--nx-effects-fast` 140 ms, `--nx-effects` 220 ms, `--nx-effects-slow` 300 ms (`-ms` has the duration). They replace the two springs of nx9 (`--nx-spring*`). The loading
indicator has its own spring (0.6 / 200, cut off at the 650 ms between two shapes: `--nx-loader-spring`). The page Settings > Design has a part *Motion* in which six balls run each their own spring.

**The components** (`skin/src/m3e.css`; the classes are the same in the app and on the page).
- *Buttons* `.m3e-btn` + a size (`.m3e-xs` to `.m3e-xl`) + a style (`.m3e-filled`, `.m3e-tonal`, `.m3e-elevated`, `.m3e-outlined`, `.m3e-text`, `.m3e-error`); `.m3e-square`; `[aria-pressed]` for a toggle. The size is a set of variables
  (`--_h`, `--_pad`, `--_gap`, `--_icon`, `--_sq`, `--_pr`, `--_fs`, `--_lh`) taken from the tokens; the corners are `--_rl` and `--_rr` (left and right), so that a group and a split button can give the inner ones another value. The state layer
  (10 % of the text color) is an inset shadow, not a pseudo-element: the buttons of the app use `:before` for their icons. *Icon buttons* `.m3e-icon-btn` (sizes, `.m3e-narrow`, `.m3e-wide`, the same styles plus `.m3e-standard`).
- *Groups* `.m3e-group` (12 dp apart, 18 for XS; the pressed button gets wider), `.m3e-group.m3e-connected` (2 dp, 8 dp inside, 4 dp pressed, the selected one round, the pressed one takes room from its neighbours), `.m3e-fill` (share the width).
  *Split button* `.m3e-split` (2 dp apart, the menu button turns its chevron and becomes round while the menu is open) with `.m3e-menu`.
- *FAB* `.m3e-fab` (+ `.m3e-fab-s`, `.m3e-fab-m`, `.m3e-fab-l`, `.m3e-ext` for the extended one, `.m3e-secondary`, `.m3e-tertiary`) and the *FAB menu* `.m3e-fabm` (the items unfold from the button one after the other, 32 ms apart).
- *Loading indicator* `.m3e-loader` (+ `.m3e-contained`): 48 dp, the shape 38 dp, a different one of seven (soft burst, cookie 9, pentagon, pill, sunny, cookie 4, oval) every 650 ms with a spring, a quarter turn at a time (28 steps, 18.2 s, so it ends where
  it began), and the whole shape turns once in 4.666 s. The step keyframes come from `build-css.py` (`LOADER_SEQ`) and the turn is the individual property `rotate`, which adds to the `transform` of the steps. `.m3e-morphing` is any element with that animation.
- *Wavy progress* `.m3e-progress` (`--p` 0 to 1; `.m3e-flat`; `.m3e-indet` with two lines): 10 dp high (4 dp thick, an amplitude of 3 dp), a track of 4 dp that stops 4 dp from the wave and a dot at its end, the wave moves one wavelength per second (40 dp, 20 dp when
  indeterminate). The wave is an SVG mask of cubic half-waves (`wave_uri` in `build-css.py`) on a layer that slides under a box that clips it (a transform, so that it runs on the compositor); the two lines of the indeterminate one are clipped with registered
  custom properties (`@property`) that run the cycle of 1750 ms (head 0 to 1000 ms and tail 250 to 1250 ms; head 650 to 1500 ms and tail 900 to 1750 ms, on the emphasized accelerate curve), and the track leaves a gap of 4 dp around each line.
- *Slider* `.m3e-slider` (`--v` 0 to 1; `.m3e-s` to `.m3e-xl`): a thick track, a handle that is a bar of 4 dp (2 dp while it is held) with a gap of 6 dp around it, a stop at the end and a bubble with the value while you drag.
- *Switch* `.m3e-switch[aria-checked]`, and the same for the `ion-toggle` of the app (`.toggle .track .handle`): 52 x 32 dp, the thumb 16 dp off, 24 dp on, 28 dp pressed, a check in it when it is on.
- *Chips* `.m3e-chip` (32 dp, 8 dp corners; assist, filter, input, suggestion), *toolbars* `.m3e-toolbar` (floating, `.m3e-vibrant`) and `.m3e-docked` (64 dp), *segmented list* `.m3e-list > .m3e-li`, *type* `.m3e-display-l` to `.m3e-label-s` and `.m3e-emph`, *shapes* `.m3e-shape`.

**How the elements of the app get a button.** The screens of the app are not written by me: their buttons are `a.command` in a template, `.button` of Ionic, a `button` in a sheet. They get the behavior of an M3E button (the state layer, the corners that
morph, the springs) by selector: `BUTTONS` in `build-css.py` is the list, and `m3e.css` writes its base rule once for `.m3e-btn` and all of them, inside `:where()` (specificity zero, so that the variants and the app's own rules always win). `skin.css` then gives each its size, shape and
colors with the same variables. A test checks that every element in that list declares its size. One thing to know when you add to it: the app's own `style.css` has rules of three classes (`.setup-wifi-bridge .conferma .button { height: 92px }`) that beat the
prefix `html:root body[data-ng-app]` (two classes and two elements), so the generic `.button` says `height: var(--_h) !important`.

**What changed on the screens of the app**

| Where | What |
|---|---|
| Accessory screen, the hero | The shape is a shape of M3E that changes with the state with a spring: *cookie 9* closed, *flower* open, *clover 4* stopped, *burst* obstructed. While the gate moves (opening, closing) **and while the app says "Connecting..." or "Checking..."** it is the loading indicator (the CSS asks for the label *that is shown*: `strong.nx-checking-text:not(.ng-hide)`, because the template always contains the text, hidden by `ng-hide`). |
| Accessory screen, the buttons | Open and Close: a connected button group of size L (96 dp), 2 dp apart, round outside and 8 dp inside; the button of the state the gate is in is selected (round all over), the pressed one gets 4 dp inside corners and takes room from the other; XL (136 dp, the icon 40, the label 32 sp) when the screen is 840 dp high or more. Stop: size L, error container. The extra buttons: size M, tonal; *Choose commands*: a text button of size S with an icon. |
| The top bar | The round buttons are icon buttons of size S (40 dp, round, pressed 8 dp) in a hit area of 48 dp (a transparent border of 4 dp around them); *Next* and *Help* are filled buttons of size S. The chip under the title has the corner of an assist chip (8 dp). |
| Lists | Segmented as M3E has it: 2 dp apart, 4 dp inside, 16 dp at the ends and when pressed or selected (was 3, 8, 28 and 16). No scale on press, only the shape. |
| The navigation bar | The indicator is 56 x 32 dp (was 64). |
| Switches | Every `ion-toggle` (the optional command, IFTTT, scenes ...) is an M3E switch. |
| Settings | *Theme* is a connected button group (Auto, Light, Dark) of size S; the swatches of *Colors* are circles and the one in use is a cookie, a little larger (the shape morphs with a spring); a row *Design* with an avatar that is a cookie (a circle while it is pressed) opens the page. |
| Spinners | Every `ion-spinner` (the search for accessories, "Loading...") is the loading indicator: the svg of the spinner stays, invisible, so that the box keeps the size the app gave it. |
| The status and activity sheets | The buttons are M3E buttons (size S, the footer size M); while the sheet is busy the wavy progress indicator runs along its top edge and the shape in the header is the loading indicator. |
| Other buttons | Generic `.button`: size M (56 dp, round, pressed 12 dp), the buttons of the popups: text buttons of size S, the buttons of the wizard: size M (they were 92 dp), the tiles of the start page: corners of 48 dp (16 dp pressed), the LOG button: a small FAB (40 dp, corners of 12 dp). |

**Settings > Design (`nx-gallery.js`, `skin/src/gallery.css`, `patch-17-gallery.py`).** A page in the app (an overlay on `<body>`, built the first time it is opened, `window.NxGallery.open()`; `nx-patch.js` offers `$rootScope.nxGallery()` to the settings page
only when the script is there, and the row is not shown without it). Fourteen parts, each with a short explanation and, under every example, the class names and the numbers of the tokens: *Shapes* (the 35; tap one and the big shape morphs into it, with a Play button that goes through all of them), *Motion*
(six balls, each with its own spring), *Buttons* (five sizes, six styles, round and square, toggles), *Icon buttons*, *Groups* (standard, connected with one or several selected, and the large one of the accessory screen), *Split button* (with its menu), *FAB* (sizes, extended, the
menu that unfolds), *Loading and progress* (the indicator contained and not, determinate wavy progress driven by a slider, flat, indeterminate), *Sliders* (five sizes, with the value bubble), *Switches and chips*, *Toolbars* (floating, vibrant, docked), *Lists* (a segmented list: the selected
item is 16 dp all over and its avatar becomes a cookie), *Type* (the 15 roles, a switch for the emphasized styles) and *Color* (the 16 roles of the chosen palette). At the top: the hero (the loading indicator), the theme and the palette (the same choices as in Settings: it goes through `NX.theme` and `NX.palette`,
and without `nx-patch.js` it sets the attributes on `<html>` itself) and chips that jump to a part. Two things that took thought: the page takes no touches for 450 ms after it opens (the finger that opened it is still down, and Ionic can send a second click to the same place; in the harness that click
landed on a palette swatch and changed the palette), and the page is `data-tap-disabled` so that Ionic leaves its taps alone. The back button of the phone closes it first (the capture phase). Menus close when you tap somewhere else. The animations only run while the page is open.

**Build.** `build-css.py` has new placeholders: `{{SHAPES}}` (all `--nx-v-*`, from `shapes.json`; the old names `cookie`, `sun` and `star` in that file are copies and are not repeated), `{{WAVE}}` (the two masks of the wavy progress), `{{LOADER}}` (the keyframes of the loading indicator) and the list `BUTTONS`; it
adds `m3e.css` and `gallery.css`; it stops when a placeholder is left. The CSS grew from 150 KB to about 290 KB (the 35 shapes are 75 KB of it). `verify-apk.py` checks the 35 shapes, the components, the page and its row in the built APK.

**Not seen on a phone.** Everything was looked at in the harness (headless Chromium: the real app with a simulated bridge), light and dark: the accessory screen in its states, the lists, the wizard, the sheets, the popups and every part of the page, with the springs, the menus, the sliders and the toggles used
(and the loading indicator paused at the end of each of its first steps to check the sequence). What I cannot know without a phone: how smooth the morphing is on your WebView (a `clip-path` of 144 points is repainted at every frame while a shape morphs, which is fine for one or two loading indicators; it is the reason the
hero and the spinners stop with *reduce motion*), and how the page feels under a thumb. Parts that the app has no use for (the FAB, the split button, toolbars, chips, the slider) exist in the library and on the page only. Not included: the circular progress indicators (flat and wavy), the carousel, the search bar, the date and time pickers.

Tests: `test/skin.test.js` 81 checks (the sizes, corners, spaces and labels of the buttons and icon buttons, the groups, split button, FAB and FAB menu, the loading indicator (29 keyframes, the order of the seven shapes, the turn), the wave (amplitude, wavelength, thickness), the indeterminate cycle,
the slider, the switch, chips, toolbars, lists, the navigation bar, the six springs (the spatial ones overshoot and the effects ones do not), the type scale, the emphasized styles, reduced motion, the hero, the buttons of the app, every class and icon of the page, and the 35 shapes with 144 points each, made by `build-shapes.py`),
`test/gallery.test.js` 101 checks (new: the page in jsdom: every part, every interaction, the theme and the palette with and without `NX`, the guard against the second click, the back button, and `patch-17-gallery.py` on an invented app tree: where the row and the script go, idempotent, all or nothing),
`test/nxpatch.test.js` 295 (4 new: `nxGallery` only with the module), `test/activity.test.js` 291 and `test/brand.test.js` 46 as before. About 70 deliberate breaks of the CSS, the scripts, the patch and `build.sh` were tried on a copy; six of them were first not caught, and the tests were tightened until each was (for example:
the loading indicator is also run by the hero, the spinners and the sheet, so a wrong speed in one place has to be seen in all of them).

## What is new in nx21 (new color palettes, and a choice of seven)

nx21 has version code 20201119 and installs over nx20 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-21` as its version); in the app only the colors of the skin changed, and the settings have a row *Colors* next to *Theme*.

**What was reported.** *"I want nicer color palettes. I don't like the current one."* (with a screenshot of the accessory screen in the dark theme: *Not usable*, the red chip, the big red *Stop*.)
It was the second palette that did not please (nx9: the "vibrant" scheme, electric blue next to lavender and pink; nx11 to nx20: a petrol). What is wrong with the petrol, seen on that screenshot:
- the seed color #1E6A8A has hue 233 and chroma 36 (in HCT, Material's color space): gray and a little green. The big shape behind the state was #004D67 on a near-black with a green cast
  (#0F1417): about 2:1, a muddy teal;
- Material's error container in the dark theme is a saturated deep red (#93000A). The skin uses it for *Stop*, the red chip and the star of a gate that cannot be used, so a screen with a
  problem had three reds at once (also the salmon *Not usable*), and the biggest one was a bar across the whole width;
- *Open* was a pale sky blue next to a slate *Close*;
- and the app now has the logo of Nice as its icon, a different blue (hue 256, chroma 50, the gradient of the logo goes from #195592 to #3789DC): the app did not fit its own icon.

**What it is now.** A palette is no longer one seed color run through the "tonal spot" scheme. Each is a few tonal palettes of its own (hue and chroma for the primary, the secondary and the tertiary
palette, and for the neutral palette that the surfaces come from), and Material's own tone logic turns them into the roles, so the pairs of text and background keep their contrast.
`skin/src/tools/build-tokens.mjs` has the table (`node build-tokens.bundle.mjs --only ember` shows one palette on its own). The seven, and why:

| palette | primary | surfaces | what for |
|---|---|---|---|
| **Midnight** (the default) | the blue of the Nice logo, a little more vivid (hue 262) | cool white; navy in the dark theme (#0C1321) | fits the icon and the splash screen; the most depth in the dark theme |
| **Nice blue** | the blue of the logo itself (hue 257) | cool white; charcoal in the dark theme | the same blue on neutral surfaces |
| **Graphite** | one vivid azure | gray, without a tint | the quietest |
| **Paper** | the blue again | warm paper in the light theme, warm charcoal in the dark | a blue accent on a warm base |
| **Violet** | violet (hue 296) | a hint of lilac | the Material baseline look |
| **Pine** | deep green-teal (hue 172) | a hint of green | a gate in a garden; its status green is a little yellower than the button green |
| **Ember** | terracotta (hue 38) | warm cream and brown-black | warm and different |

**The error color.** In the dark themes the error container is a wine red (hue 14, chroma 52, tone 24; in the light themes a pale rose, as before). Tried on the screenshot of the report: hue 24 was a rusty
brown, hue 4 and 350 went to burgundy and plum, hue 12 to 14 is a red with depth that does not shout. The salmon *Not usable* and the red chip are made from it, so that the red of a problem is one red.

**The choice** (Settings > Appearance > Colors; `patch-13-theme.py`, `nxSetPalette` in `nx-patch.js`, `nx-theme.js`): seven round swatches (the primary color of the palette against its dark surface), the one in
use with a ring and its name above. The choice is in localStorage (`nxPalette`) and on `<html>` as `data-nx-palette`; the early script puts it there before the first paint, like the theme. The first palette is
what the tokens have without an attribute, so for it nothing is saved and nothing is set. The status bar of Android follows at once. Every other palette has its three blocks in `tokens.css` (light, dark as the
WebView reports it, dark chosen), each more specific than any default block, so the order does not matter; the theme (Auto, Light, Dark) and the palette are independent. To add a palette: the table in
`build-tokens.mjs`, `PALETTES` in `nx-patch.js`, the pattern in `nx-theme.js` and a swatch rule in `skin.css`; `test/skin.test.js` says what is missing.

**What does not follow the choice.** The native splash screen and the window behind the app have the colors of the default palette (Midnight): the native side cannot know the choice, and the splash screen is
generated from the surface of the first palette (`brand/assets.py`; `test/brand.test.js` checks that). With another palette the app opens in Midnight's colors for a moment and then changes. The icon, the logo on
the splash screen and the icon of the notifications do not depend on the palette (the notifications are tinted with the blue of the logo).

**Not seen on a phone.** The palettes were looked at in the harness (headless Chromium: the real app with a simulated bridge), light and dark, on the accessory screen in the state of the report, the status sheet and
the settings, and the swatches were tapped in the real Angular app (what jsdom cannot check: the template of the row). How they look on your screen, next to your own icons and in daylight, is for you to say.

Tests: `test/skin.test.js` has 38 checks (10 new: every palette has its three blocks, the same 43 color properties as the default and plain #rrggbb, the two dark blocks are the same, 22 pairs of text and background
in 7 palettes and 2 themes (the lowest is 4.8:1), the error container is not Material's deep red, the swatches, and that the lists in `nx-patch.js` and `nx-theme.js` agree with `tokens.css`),
`test/nxpatch.test.js` 291 (19 new: the list, the default, saving, junk, the status bar, theme and palette independent, the early script), `test/brand.test.js` 46 (the splash colors come from the default palette in
`tokens.css`). Five deliberate breaks of the CSS and five of the scripts were each caught.

## What is new in nx20 (the logo of Nice: icon, notification icon and splash screen)

nx20 has version code 20201118 and installs over nx19 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-20` as its version); the app's code only changes in one place (the color of the notification icon, below).

**What was asked.** *"I want a logo that is made from the official Nice logo."* So the marks of nx18 (a cookie with a gate in it) and nx19 (an arched picket gate) are gone, and so are the generator that
drew them (`brand/build-brand.py`, with Node and Chromium) and the pictures it wrote: the app has the logo of Nice again, the blue house with the white N, but used the way Android wants it.

**Where the logo comes from.** Not from this repository, which has no Nice artwork, and not redrawn by hand: `patch-16-brand.py` reads the launcher icon that is in the APK you patch
(`res/mipmap-xxxhdpi/ic_launcher.png`, 192 x 192 px: a blue gradient, the shape of a house, a white N, a transparent rest). The launcher icons for Android 7 and older (`res/mipmap-*/ic_launcher.png`)
are not touched at all; `verify-apk.py <apk> <original apk>` compares them with the original byte for byte. If the file is not what is expected (another app, another version) the script says so and writes nothing.

**Why it is not simply scaled.** The icon is a raster of 192 px at the most, and a splash screen or the splash icon of Android 12 needs the logo 2 to 3 times bigger. Plain resampling then gives soft edges, and
the file has its own faults: a light fringe along the edge (the shape was anti-aliased against white) and a dark line just inside it (ringing). So `brand/logo.py` takes the icon apart into three things that are
easy to draw at any size, and draws those:
- **the gradient**: one smooth blue, a straight diagonal at 45 degrees (dark at the lower left, light at the upper right). It is fitted with a polynomial of degree 2 per color channel, on pixels that are well
  inside the house (3 px away from every edge and from the N): the fit is within 2 levels of the source there;
- **the house**: how much of each pixel the shape covers (the alpha channel);
- **the N**: how white a pixel is, measured against the gradient. The N is open at the bottom (white on white: it reaches the lower edge of the house), so where the house ends the N is carried on to the edge.
Drawing at another size: sample the two coverages with a Catmull-Rom filter. Enlarging: steepen the edge around the 50 % line by the factor of the enlargement, so that an edge is one pixel wide and not a smear.
Reducing: several samples per pixel, averaged. The color comes straight from the gradient, so there is no fringe and no ringing. At the scale of the source the drawing reproduces it (mean difference 1.2 levels
on the opaque pixels; what differs is the fringe and the ringing). It is pure Python 3 (zlib and struct for the PNG files): no Pillow, nothing to install.
The script also stops when the icon does not fit this model (the N is not between 5 and 60 % of the house, the house covers less than a quarter or more than 90 % of the picture, the gradient is not smooth:
rms above 4 levels), which is what a different app would give.

**What is made** (`brand/assets.py`). The logo is placed by the smallest circle around it (the roof and the two lower corners lie on it), so that it keeps the same distance to the edge of any mask:

| file | what | how big |
|---|---|---|
| `res/mipmap-*/ic_launcher_foreground.png`, `mipmap-anydpi-v26/ic_launcher.xml` | the adaptive icon (Android 8 and up) on a white background | 108 dp canvas, circle of 31 dp (the safe zone has 33, a circular mask shows 36) |
| `res/mipmap-*/ic_launcher_monochrome.png` | the layer for the themed icons of Android 13: the house with the N cut out, one color | same place |
| `res/drawable-*/nx_stat.png` | the small icon of the notifications: the same silhouette, white | 24 dp, the house 20 dp high |
| `res/drawable-*/nx_splash_icon.png` | the icon of the splash screen that Android 12 and up show first (`values-v31`) | 288 dp, circle of 76 dp (Android shows a circle of 96) |
| `res/drawable-{port,land}[-night]-*/screen.png` | the splash screen of the Cordova plugin: the logo on the surface color of the skin | the 12 sizes of the original, the logo 27 % of the shorter side high; 24 files with the night ones |
| `res/values/`, `values-night/`, `values-v31/` `nx_brand.xml` | the colors and the theme `NxTheme` | |

The background of the icon is white because the logo is made for it (the N is white and reaches the lower edge: on white it reads as a cut-out, which is how the original icon looks on a launcher).

**Light and dark splash.** The surface color of the skin: `#F6FAFE` (light) and `#0F1417` (dark; `values-night`, and `drawable-*-night-*` for the pictures), so that the app does not open with a white flash
when the phone is in the dark mode, and the splash goes over into the app without a jump in color. On the dark field the N is still white, as in the official logo.

**The notification icon again.** As in nx19: the push plugin takes the launcher icon as the small icon of a notification when there is no `icon` option, and Android shows only the alpha channel of a small icon,
so an adaptive icon (an opaque background) would give a white blot. `app.min.js` still gives the plugin `icon:"nx_stat"`; `iconColor` is now the blue of the logo (the gradient in the middle of it,
`#2871B9` for the real file) instead of the primary color of the skin. Also still one anchor in `patch-16-brand.py` that must occur exactly once.

**Not seen on a phone.** The launcher icon behind a circle, a squircle and a rounded square, the themed icon, the status bar icon and the splash screens were rendered and looked at (and the APK is checked for the
names and sizes that Android resolves), but there is no launcher, no Android 12 splash screen and no push message in the harness. Nothing in the repository shows the logo, on purpose.

Tests: `test/brand.test.js` has 46 checks. It makes a tree of its own with an *invented* logo (another shape, another color and another N, with the same properties and the light fringe of the real file), runs
`patch-16-brand.py` on it and decodes the result with a PNG decoder of its own: the 36 files that are added and the 15 that change, the originals that must stay, the sizes, the safe zone, the N as a cut-out,
how sharp an edge is after an enlargement of 2.8 times (at most 4 partly covered pixels in a row across two walls), no halo, the proportions (a stem of the N is 17 % of the width of the house, and the test
measures 17.0 %), the N white up to the lower edge, the colors against `skin/src/tokens.css`, a second run, an icon of noise, a house without an N, a missing anchor and a folder with another name (all refused,
nothing written), and the same bytes from the same input. Ten deliberate breaks of the scripts (the radius, the height of the small icon, no steepening, no cut-out, the wrong field for the night, no
`iconColor`, a flat color, a wrong circle, a logo too high, the N not carried to the lower edge) were each caught.

## What is new in nx19 (a new mark: strict, on a grid, and a small icon for the notifications)

*Replaced in nx20: the logo of Nice is the icon again. What is described here about the arched gate, its grid and its files is history; the fault that was found (the notification icon) is solved the same way.*

nx19 has version code 20201117 and installs over nx18 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-19` as its version); the app's code only changes in one place (the icon of the notifications, below).

**What was reported.** *"Very ugly logo, AI slop. It must be much sleeker and pixel perfect."* That was right. The mark of nx18 was a *cookie* (a polygon of the skin, smoothed into a wavy,
lopsided blob) with a gate in it of thin pickets in four thicknesses, in a mid blue on a dark field: three nested shapes, details that vanish at 48 px, little contrast. It looked
generated because it was a stack of defaults. Redone from nothing, on a grid.

**The mark** (`brand/build-brand.py`): an arched picket gate. Six boards under one arch, a gap between the two leaves, one rail. White on one plain field (#003547, tone 20 of the ramp of the
skin); two colors, no gradient, no shadow, no outline. It comes from five numbers and one circle: a board is 5, a gap between boards 3, the gap between the leaves 6, three boards per leaf, so
it is 2 x (3 x 5 + 2 x 3) + 6 = 48 wide; the arch is the top of one circle of radius 24, and every board ends on it (an exact semicircle, not a smoothed polygon); the rail is 3. On the 108 grid of
the adaptive icon every vertical edge lies on a whole unit (boards at x = 30, 38, 46 and 57, 65, 73), and the mark is centered on (54, 54) and stays inside the safe zone (its corners are 32.9 from the
center, the limit is 33).
- **What was tried and why it is not it:** the cookie with a gate in it (the blob is the sloppy part); horizontal slats next to a post (reads as a menu button); a solid arch with grooves (doors, a
  wardrobe); boards without a rail (organ pipes); two rails (window panes); the mark in a disc (the mark gets small and the disc says nothing); a leaf between two posts (a selection frame). One rail
  across six boards under an arch is the least that still says *gate*, also at 48 px.

**Pixel perfect, as far as it can be.** The adaptive icon is a vector and the system draws it at any size, so there it means exact geometry on a grid. The PNG files have grids of their own, so that
the vertical edges fall on whole pixels (decoded and checked in `test/brand.test.js`, not only looked at):
- the icon for Android 7 and older: a grid of 48 (board 3, gap 1, between the leaves 2, rail 2), at 48, 96, 144 and 192 px = 1 to 4 pixels per unit;
- the small icon of the notifications: a grid of 24 (board 2, gap 1, between the leaves 2, rail 1), at 24, 48, 72 and 96 px; white on transparent and nothing else; no half-transparent pixel on any vertical edge
  (the row through the boards at 48 px reads `......####..####..####....####..####..####......`);
- the splash screen: the mark at a whole, even number of pixels per unit (2, 4, 6, ...), so that the edges at half a unit are whole pixels too, exactly in the middle.
Only the arch is anti-aliased: a curve cannot be otherwise. (hdpi, 72 px, and ldpi, 36 px, are 1.5 and 0.75 pixels per unit and cannot have whole-pixel edges.)

**The icon of the notifications.** Found while redoing the icon, and it was a fault of nx18: the push plugin that the app uses takes the *launcher icon* as the small icon of a notification when the
notification has no `icon` (`FCMService.setNotificationSmallIcon`: "no icon resource found - using application icon"). Android shows only the shape (the alpha channel) of a small icon. The icon of
the original app had a transparent background, so the status bar showed the white *N in a house*; an adaptive icon has an opaque background, so the status bar would show a white blot. Now there is a
small icon of its own, `res/drawable-*/nx_stat.png`, and `app.min.js` gives the plugin the options for it: `PushNotification.init({android:{senderID:PUSH_SENDER_ID,icon:"nx_stat",iconColor:"#196585"},...})`
(`patch-16-brand.py`, one anchor that must occur exactly once; the plugin keeps the options and uses them for every notification, also when the app is closed; the color is the primary color of the skin).

**Not seen on a phone.** The adaptive icon, the themed icon of Android 13, the splash screen of Android 12 and the notification were drawn and rendered in Chromium (the same geometry as the vector
drawables), and the APK was checked for what Android will use (the launcher icon resolves to the adaptive icon, the main activity to `NxTheme`, the option for the small icon is in `app.min.js`), but
there is no launcher in the harness and no push message. If the small icon in the status bar still shows the old *N* or a blot, the LOG of the app (`Push_FCMService`) says which icon it used.

Tests: `test/brand.test.js` has 25 checks (the geometry in the vector drawables, the safe zone, the colors against `skin/src/tokens.css`, the decoded PNG files: sizes, whole pixels, white on transparent,
the mark in the middle at an even number of pixels per unit, the agreement with the patch script); ten deliberate breaks of the files and the scripts were each caught.

## What is new in nx18 ("Connecting…", a new icon and splash screen)

nx18 has version code 20201116 and installs over nx17 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-18` as its version).

**"Connecting…" while the app tries again.** What was reported: the accessory screen said *Not usable* in red (and the chip *Accessory not reachable ·
other Wi-Fi, VPN, ...*) while the app was, behind the screen, trying to connect. The cause was a choice of nx11: `nxCheck(device)` only said `'checking'`
when this session had no result yet. After a failed check (three attempts), every later attempt (the app checks again when a screen is entered or the app
resumes; the automatic recovery; the diagnosis and the *Reconnect* of the status sheet) ran without a sign: the label did not change, "so as not to
flicker between *Not usable* and *Checking…*". That is turned around, as asked:
- `nxCheck` has a new value, `'retry'`: the last result was "not reachable" and a new attempt to connect is running. It is `'retry'` while the app's own check runs
  (`busy[mac]`), and while one of the attempts that this patch makes runs: the automatic recovery (`heal.busy`: the probe, the reconnect, the new check) and the diagnosis or
  reconnect of the status sheet (`busyDiag`). The first check of a session is still `'checking'` ("Checking…"), as before.
- The accessory screen and the lists (the six templates of patch-11) have a label *Connecting…* next to *Checking…*: in the primary colors, with the same
  pulsing as *Checking…* (it stands still with reduced motion). When the attempt fails, the label goes back to *Not usable*; when it works, to the state.
- The chip under the title says *Connecting to the accessory…* (level `connecting`, the dot beats; `@property --nx-dot-r`, so that the dot can be animated; without
  that support it stands still) instead of the verdict of the attempt before it.
- The flags change outside Angular's digest (timers, the native layer), so the patch asks for a digest after every refresh of the chip, when the recovery starts and
  ends (`setHeal`) and when the diagnosis starts and ends (`setBusy`). `nx-activity.js` does not read the log while an attempt runs (`'checking'` or `'retry'`).
- Run in the harness (`harness/steps-connecting.cjs`, the real app, a check that fails and takes a moment): *Checking…* → three failures → *Not usable* → the screen is
  entered again: *Connecting…* → *Not usable* → *Connecting…* → the state; each with the chip.
- The nx11 tests that required the opposite (`a new check does not turn "Not usable" back into "Checking…"`) are now tests of this.

**The chip under the title** ran under the eye button on the accessory screen (the title box of the header runs under the buttons on the right, and the chip is as wide
as its text): *Accessory not reachable · other Wi-Fi, VPN, m...* was cut off by the button. On a header with buttons on the right the chip now stops 48 px before the end
of the title box and ends in an ellipsis (`.bar:has(.right-buttons > *) .title::after`; a WebView without `:has` keeps the old behavior).

**The icon and the splash screen.** (The mark described here, a cookie with a gate in it, was replaced in nx19 and that one by the logo of Nice in nx20; the generator and the preview picture that are mentioned are gone. What still holds: the adaptive icon, the theme, `SplashMaintainAspectRatio` and the Android 12 splash screen.) `brand/build-brand.py` draws them from what the skin already has (seed color #1E6A8A and its tones, the *cookie* shape of the state
icon) and a gate that is drawn there (an arched double gate with pickets); `patch-16-brand.py` puts the result in the app. The blue *N in a house* of Nice is gone from the
launcher and the splash screen (the name of the app, the package and the permissions are as they were):
- **Adaptive icon** (Android 8 and up; `res/mipmap-anydpi-v26/ic_launcher.xml`): a plain field of tone 20 (#003547) as the background, the cookie in the primary color (#196585)
  and the white gate as the foreground, and a *monochrome* layer (the gate alone) for the themed icons of Android 13. Vector drawables, only the path commands M, L, H, V, C, A and Z.
  **Older Android** (7 and older, no adaptive icons): the same picture as PNG on a rounded square (36 to 192 px).
- **Splash screen** (the Cordova plugin; `res/drawable-{port,land}-*/screen.png`, the names and sizes of the original): the same field, the icon exactly in the middle and *MyNice
  Welcome* under it (in Roboto Flex, the font of the skin). The original pictures were stretched to the screen (the plugin's default, `FIT_XY`); `SplashMaintainAspectRatio` makes it
  `CENTER_CROP`, so that the logo keeps its shape on any screen, and the pictures are made for that (everything that matters is in the middle). Each is 6 to 40 KB.
- **Android 12 and up** show a splash screen of their own first (the icon on a colored field). The activity now has the theme `NxTheme` (the old one,
  `Theme.DeviceDefault.NoActionBar`, with one color as the window background; `values-v31` also sets `windowSplashScreenBackground` and `windowSplashScreenAnimatedIcon`),
  so that the system splash screen has the same field and icon, and the change to the picture of the app is not a jump in color. Older versions show that field as the window
  from the first frame.
- `brand/preview.png` (also in the README) shows the icon behind a circle, a squircle and a rounded square on a light and a dark wallpaper, at 48 dp, as the themed icon, and the
  splash screen. `test/brand.test.js` checks the generated files (the sizes of all 24, the colors against `skin/src/tokens.css`, the layers, the theme, the agreement with the patch
  script); `verify-apk.py` checks that the APK has the adaptive icon, its layers, `NxTheme` and `SplashMaintainAspectRatio` (and that the APK's launcher icon is the adaptive one).
- **Not seen on a phone.** The icon and the splash screen were drawn and rendered in Chromium (the same shapes as the vector drawables), and the APK was checked for what Android will
  use (the launcher icon resolves to the adaptive icon, the main activity to `NxTheme`), but there is no launcher or Android 12 splash screen in the harness. If a launcher cuts the
  cookie in a way that is not liked, the size of the cookie (`BADGE`, 78 of 108) is one number in the generator.

Tests: `test/nxpatch.test.js` has 272 checks (256 in nx17; new: *Connecting…* in the chip and in the labels, the recovery, the diagnosis, the digests), `test/activity.test.js` 291 (not
reading while an attempt runs), `test/skin.test.js` 28 (the chip level, the labels, the ellipsis rule, `@property`), the new `test/brand.test.js` 18.

## What is new in nx17 (a gate that moves is not blocked)

nx17 has version code 20201115 and installs over nx16 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-17` as its version). Only `nx-activity.js` changed in the app (and the test harness).

**What was reported.** On nx16 the screen said *Closing*, the line *Close · just now · Gate controller* and the pill *Blocked? · since 12:00*, after Home
Assistant had opened the gate and the gate had closed by itself (as it should). Nobody had blocked it "this time": the Block of 12:00 was a test with
*Open and Block* in this app, released two minutes later with the official app.

**Why.** Two things came together, and both were reproduced in the harness (`harness/steps-stale.cjs`) with the nx16 build:
- This phone's record of the Block (`nxBlock` in `localStorage`, from nx15, which survives an update) was never corrected: the Release of the official
  app was only ever going to show in the accessory's log, and the accessory had restarted since (hence the question mark), which empties its log. With
  no Release in the log, the old record held for good.
- Nothing used what the gate itself says. The pill and the movement contradicted each other on the same screen.

**A gate that moves is not blocked.** A blocked automation ignores every command until a Release (that is why there are commands such as *Release and
Close*). So when the gate controller reports a movement after a Block, the Block was lifted since, whoever lifted it, and also when the Release is
not in the log (forgotten at a restart, or given by an app that the log does not show):
- `analyze()` has `drive`: the newest movement that the gate controller itself reported (`busT4`: open, close or a step; the repeat of a phone command
  is the gate moving too). A command that the controller did not repeat is not a movement (a blocked gate would ignore it), nor are a stop, an
  obstruction or a Block, nor what the controller says in the two minutes after the accessory started (that is its state; it reports a `stop` then).
- `blockInfo()` turns "blocked" into "not blocked" when `drive` is more than 150 seconds (the travel time) after the Block: the movement that
  *Open and Block* itself starts must not lift it. The result is marked `inferred`, with the time of the Block it lifted. The pill is gone, the line says
  what happened last, and the sheet says *Not blocked, as far as the log shows · the gate moved today 13:54 · Close · Gate controller, after the Block of
  today 12:00*, with the reason.
- The sheet's note for the question mark says what it means: the accessory restarted after the Block and forgot its log, so a Release since then would
  not show; it goes away as soon as the gate moves.

**What is known about blocking is kept** (`remember()`, after every reading): the newest answer of `blockInfo()` (a command of this phone, a Block or Release in the
log, or the lifting by a movement) is written to `nxBlock` when it differs from what is there. So an old record can no longer come back when the accessory
restarts and forgets its log: with the Release of the official app seen once, or the movement seen once, the next restart leaves it as it is. A Block of
another phone is kept too (after a restart it shows as *Blocked?*). The LOG says `block: kept not blocked (the gate moved after the Block)` or `... (from the log)`, once.

**What is not known.** That a blocked automation ignores every command is what the commands (*Release and Close*, *Release and Open*) imply, and what the Nice
documentation says of the Block; it was not tried on the accessory. If a blocked gate does move for some command, the pill would be hidden wrongly for
the time of that movement. A Block that nobody released and that nothing has moved since still shows (with a question mark after a restart). It
was run in the harness (`harness/steps-stale.cjs`: the record of 3 hours ago, a restart an hour ago, Home Assistant opening and the gate closing by itself) and in the tests.

Tests: `test/activity.test.js` has 288 checks (256 in nx16; new: `drive`, the lifting by a movement with its margins, the start-up window, what is kept, the
texts); the changes were also checked by breaking the code on purpose (eleven changes, each seen by a test).

## What is new in nx16 (the pill and the line follow what other apps do with the gate)

nx16 has version code 20201114 and installs over nx15 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-16` as its version). Only `nx-activity.js` changed in the app (and the test harness).

**What was reported.** "Open and Block" in this app, then "Release and Close" in the official MyNice app: the state showed *Closed* (the app asks
the accessory when the screen is shown or resumed), but the pill still said *Blocked · since 12:00* and the line on the screen still said
*Open and Block · just now* two minutes later. Reproduced in the harness with the nx15 file: after the report `closing` of the accessory the
log was not read again (1 reading, pill and line unchanged).

**Why.** The accessory has no state for "blocked", so the only place where a Block or Release shows is its event log, and nx15 read the log only when the
accessory screen was entered (and then only if the last reading was more than 10 minutes old), 3 seconds after a command of this phone, and when
the state was `opening` or `closing`. A report of the state that ends in a final state (`closed`, `open`) planned nothing, and a plain Block or
Release (`MDBm`, `MDEw`) moves nothing, so the accessory reports nothing at all. The line "just now" was also worked out when the log was read and
stayed on the screen as it was.

**What is read now, and when** (all in the background, read-only, the same request as the history page of the app; the times can be set with
`window.__nxActivityPollMs`, `...EventMs`, `...StatusMs`, `...ResumeMs`, `...RetryMs`, `...BackoffMs`, `...MinGapMs`, `...UsersAge`, `...MaxAge`, which the tests use):
- **After a report of the state** (`newDeviceState`, any state): 4 seconds later. The gate moves, so someone gave a command, and the log has it, with a
  Block or Release that came with it ("Release and Close"). Several reports in a row (closing, closed) are one reading. Not while the app is in the background.
- **When the app is asked for the state** (the app does that when the screen is entered, when you swipe to another accessory and when the app
  comes back): 1.5 seconds later, if the last reading is 30 seconds old or older, and only for the accessory whose screen is open.
- **When the app comes back to the front** (Cordova `resume`, or the page becoming visible again): 2 seconds later, unless a reading is less than
  2 seconds old. This is the case of the report: you leave for the official app and come back. When the activity sheet was open it is read again
  instead (it would show what it showed when you left).
- **On a timer, as long as the accessory screen is open:** every 30 seconds. This is the only way to see a plain Block or Release by another
  app or phone while you look at the screen. It is not done while the app is in the background, while the activity sheet is open (it has its own
  *Refresh*), for an accessory that is not reachable, or while the app is still checking the accessory. It stops when the screen is left.
- A reading younger than 5 seconds (2 for coming back) is as good as a new one and is not repeated.
- **Failures** are logged once per run (`activity: could not read the log (poll) {...}`), the reading is tried once more 5 seconds later when it was
  planned by a report, a state request or the return of the app, and the timer waits 2 minutes after a failure; `activity: the log can be read
  again` says when it works. A reading in the background asks for the users (for the names) only when it does not have them from the last 10
  minutes. The LOG gets lines for a reading in the background only when the log has changed (the newest event, the last Block or Release, the health of the module),
  with the reason in brackets: `activity: 85 device events, ... (event)`. A reading that someone asked for (the sheet) always says what it found.
  The line `state: "opening" is out of date ...` is said once per decision (the same movement and the same report), not at every reading.

**Which says it: this phone or the log.** The command that this phone gave is written down at once (the pill must not wait for the log), but the log wins
as soon as it can know better: when it has a newer Block or Release, and also when it was read at least 2 seconds after the command and has a Block or
Release from at most 60 seconds before it or later. The accessory writes a command in its log at once, so such a reading has the command of this
phone in it and the newest Block or Release is the one that counts, also when the clock of the accessory is a few seconds behind the phone's (a Release
from another phone just after the Block would be dated before it). A reading from the same second cannot have the command yet, and a Block or
Release from long before the command (more than a minute) is not the answer to it: this phone counts then. This rests on the accessory logging
every Block and Release (the app has texts for `MDBm` "Block" and `MDEw` "Release" for its history page, and `MDBk` and `MDFh` were seen in a real log); a
plain Block that was never logged would not show.

**The line on the screen** ("Open and Block · just now · Anna") is worked out when it is shown, not when the log was read, so "just now" becomes
"today 12:00" after a minute (at the next screen update, at most 30 seconds later because of the timer).

**What is not known.** All of this was run in the harness (headless Chromium, the real app, a simulated accessory whose log is changed by a script:
`harness/steps-follow.cjs`) and in the tests, not on a real accessory. How quickly the official app's command reaches the log, and whether the
accessory reports a state change for every command of another app, was not measured; the timer is the safety net for that. The timer reads the log
every 30 seconds while you look at the accessory screen: if that ever disturbs the accessory (a slow or unreachable answer), the LOG shows it and
the interval is one number (`POLL_MS`).

Tests: `test/activity.test.js` has 256 checks (196 in nx15; new: a report, the timer, coming back, a state request, failures and the retry, the users,
the LOG lines, and the precedence of this phone and the log, with the case of the report as the first test); the changes were also checked by breaking the
code on purpose (twenty-one changes, each seen by a test). `test/nxpatch.test.js` is unchanged (256).

## What is new in nx15 (blocked, a state that is out of date, and the first corrections from a real log)

nx15 has version code 20201113 and installs over nx14 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-15` as its version).

**What a log from a real accessory showed** (copied from the activity sheet; the names and IDs are left out here):
- The events of the module are written `Power ON`, `T4 device not found` and `T4 device found`, with the source `boot`; an entry has no `idx`.
  nx14 only knew `device not found`, so the row "Gate controller not found" said 0 although the log had one. The app's own history page
  matches a part of the text (`indexOf`), and so does this now.
- The log begins with the start of the accessory (the oldest entry is `Power ON`, some hours before): events are forgotten at a restart.
  The note under the history says so when the oldest entry is a start.
- Every command of a phone is followed within a second by the same movement from `busT4`: `MDFh` ("Release and Close") at 11:40:20 and `close` at
  11:40:21, `MDBk` ("Open and Block") at 10:15:02 and `open` at 10:15:03 (example times). `busT4` is the gate controller on the bus reporting what it does, for
  whatever reason it does it. nx14 counted both and called the second "Automation". Now a movement that `busT4` reports within 5 seconds of a command
  of the same kind (a phone, the schedule, an input) is folded into that command, one repeat per command. What is left of `busT4` is shown as
  "Gate controller": a remote control, a switch, the gate closing by itself, or the controller telling its state when the accessory starts
  (a `stop` right after "T4 device found"). So the line on the screen, the tiles and "who" now name the phone and count once.
- While the accessory starts it cannot see the gate controller yet (`T4 device not found`, a moment later `found`). That is not a fault: a "not found"
  within two minutes after a start is not counted in "Gate controller lost" (the row says "only while the accessory was starting").
- The T4 commands of the phones are in the log, with the phone's controller ID: the Block and Release commands below are built on that.

**Blocked.** The accessory has no property for it (`DoorStatus` and `Obstruct` only; `T4Action` is write-only), so no Nice app shows it. What is
known is the last Block command (`MDBk` Open and Block, `MDBl` Close and Block, `MDBm` Block) or Release command (`MDEw` Release, `MDE5` Release and
Open, `MDFh` Release and Close):
- Commands that this phone gives are written down when they succeed (`nx-patch.js` wraps `executePrimaryCommand` and `executeSecondaryCommand` of the
  app's service and tells `nx-activity.js`; kept in `localStorage` under `nxBlock`, apart from the app's data). The commands of every phone and of
  the schedule are in the log. The newer of the two counts.
- A pill "Blocked · since 09:37" under the state, and a card in the activity sheet (amber, with the command and who). With a question mark
  ("Blocked?") when the accessory has restarted after the last Block command: whether a block survives that is not known. After a Release the
  pill is gone, and the sheet says "Not blocked, as far as the log shows". Without any Block or Release command it says nothing.
- It is the last command and not a measurement, and it does not see a block that was lifted at the gate controller itself (a key switch, another
  device on the bus), or commands that were forgotten at a restart of the accessory. It must not be used as security; the card says so.

**A state that is out of date.** The accessory screen reads the state when it is shown or resumed (`status`) and after that only gets events
(`newDeviceState`); nothing in between (no polling). On a real gate that had been opened with "Open and Block" the screen showed "Opening" while the
gate was open, and the official app showed "Opened". Whether the accessory itself reports "opening" on a status request or the final event went
missing is not known yet, so the LOG now records what it says: `state: status of <mac> says [DoorStatus=..., Obstruct=...]` for every status request,
`state: event <mac> <state>, obstruct <n>` for every event, and once per session what the accessory declares
(`state: the accessory declares services [...] properties [...]`, to see whether there is more than the state and the obstruction).
The safety net, in `nx-activity.js` (`nxState`, `nxIcon`, `nxSettled`, used by `patch-15-state.py` in `device_detail.html`):
- A report of "opening" (or "closing") is shown as open (closed) when the newest event in the log that can have moved or stopped the gate (open, close, stop,
  step by step, block, obstruction; a repeat of the gate controller is folded) is an opening (closing) that is more than 150 seconds old, and the
  log was read after the latest event or command and less than two minutes ago. A stop, a block or an obstruction after it, or a closing after an
  opening, means that nothing is settled.
- The icon follows (the app's own class, `icon-i_gat005 open status-0`), and a small note says what was reported ("reported: Opening").
- The decision is only valid while the report stays the same. An event of the accessory, a command of this phone and a new look at the screen clear it.
  The log is read again 3 seconds after a command (it has the command and the movement within a second, which also makes the line on the screen
  right: in nx14 it stayed on the previous command until the screen was entered again), when the screen is entered with "opening" or "closing", and
  once more after the travel time plus 8 seconds when the gate is still said to move.
- Not tested on a real accessory: how often the accessory reports a stale "opening", and why.

**Small screens.** The extra lines (activity line, note, pill) cost height. The gate icon and the state text shrink in steps below 780, 720, 660 and
620 pixels of height; checked with the harness (`harness/steps-state.cjs`, the worst case: blocked, note, line) at heights from 568 to 915, with
Stop completely in view from 600 pixels up (below that the commands area scrolls).

Tests: `test/activity.test.js` (196 checks, with a log in the structure of the real one, with made-up names and IDs; also in five time zones) and the
wrappers in `test/nxpatch.test.js` (256); the tests were also checked by breaking the code on purpose (five changes, each seen by a test).

## What is new in nx14 (Activity: the history of the accessory)

nx14 has version code 20201112 and installs over nx13 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-14` as its version).

**What the accessory can tell, and what it cannot.** This was read from the app's own code (the model classes `Interface`, `Device`,
`Property`, `EventLog`, the response parsers in `protocol/commands`, the event parser) and not measured on an accessory:
- The status is `DoorStatus` (open, closed, opening, closing, stopped) and `Obstruct`. The event parser knows no other property, and the
  app reads the first two positionally. Information about the interface and the automation: manufacturer, product, type, hardware and firmware
  versions, serial number, date, time zone and daylight saving time, schedules, services and the secondary commands.
- There are **no counters of maneuvers, no maintenance counter, no motor current, no temperature**. The app's texts for temperature, pulse counter,
  battery and signal strength belong to the wireless sensors of the CORE ecosystem.
- There is an **event log** (`logs`): `{ interfaceLogs, deviceLogs }`, every entry `{ deviceId, source, type, time, idx, id }` (the XML `Event`
  element; `time` is parsed from `yyyy-MM-dd'T'HH:mm:ss` in the phone's time zone, so it is the accessory's own clock). For the device log the
  `type` is the door action (`open`, `close`, `stop`) or the T4 code of a secondary command (`MDBk` is "Open and Block"), or something else
  (`obstruction`, which has a text in the app, `Output`, `Scena_Out`); the `source` is `busT4` (what the app calls "Autom."), `scheduler`, `input`
  or the controller ID of a phone (the app finds the user name in `pairings.activeUsers`, also for an ID that is shortened with a dash). The
  app's own history page ("Historian of events") shows the device log in four columns and filters out the interface events:
  `Power ON`, `boot`, `wifi loss`, `error`, `device found`, `device not found`, `connect`, `pair`, user and reset events.

**What Activity shows** (`nx-activity.js`; plain functions first, the sheet second):
- Four tiles: the last opening, the last closing, the commands of 7 days (and 24 hours), the obstructions.
- Commands per day for 14 days as stacked bars (opening, closing, the rest), who gave them (the app's own labels: a user, Automation, Schedule),
  the busy hours of the day.
- The **Wi-Fi module** from the interface events: restarts (a power-on and the boot right after it, within two minutes, count once), Wi-Fi drops,
  errors, and the gate controller that was not found. Green at zero, amber (red for errors) above zero.
- The history grouped by day (25 entries, a button for up to 300) and a note on how far back the log goes: the accessory keeps a limited number
  of events, so the sheet says how many there are and from when.
- Entries without a usable time (a clock that was never set reports 1970 or 2000; anything before 2015 or more than a day ahead) are left out
  and counted in that note. `Scena_Out` is left out like in the app's own page. At most 5000 events are read.
- *Copy the log* puts the raw log on the clipboard (times, types, sources, ids; no passwords are in it).

**On the accessory screen.** `patch-14-activity.py` adds a line under the chips: the last command ("Close · today 14:12 · Anna", in the app's
own words for the command) or "Activity" while nothing has been read, and a tap opens the sheet. On a screen that is lower than 720 pixels
(360x640) the gate icon and the state text are a little smaller, so that Open, Close and Stop stay in view with the extra line (checked with
the harness at six heights, Stop completely visible from 640 up).

**How it reads.** Opening the sheet asks for `NHKPluginService.logs` and `pairings`, the two requests the app's history page makes (each
preceded by the app's own `connect`, which checks the session first). Looking at the accessory screen for 2.5 seconds does it once by itself,
so that the line is there: only when the accessory is reachable and not being checked, not when the answer is less than ten minutes old,
and not when the screen has been left. A request that is not answered within 20 seconds is given up (the sheet says so; the line stays
empty). Failures are only written to the LOG, in which each reading leaves two lines: the numbers, and the kinds of events
(`activity: device [close x12, open x12, ...] sources [busT4 x5, phone x20] module [boot x1, ...]`, without names or IDs). That second line is
what is needed to adjust the labels to what a real accessory sends.

**What it cannot do.** It shows the commands that the accessory logged, not every movement of the gate: whether a remote control or a key
switch shows up depends on what the accessory logs (the source `busT4`). The times are the accessory's clock. It was written without the log
of a real accessory in hand, from the model in the app. `harness/shim.js` has a made-up log (`CFG.activity`, `CFG.logs`) and
`harness/steps-activity.cjs` taps through it; `test/activity.test.js` has 288 checks (the statistics without a browser, the sheet and the readings in the background in jsdom),
run in five time zones.

## What is new in nx13 (a log that keeps the lines that matter, and clearer messages when approving a user)

nx13 has version code 20201111 and installs over nx12 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-13` as its version).

**The log was full of the Nice app's own noise.** Someone who could not approve a user pasted the log, and all of it was the same four
lines over and over (`scene getHome`, `devices.forEach`, `getDevice scene home.device`, `scene getDevice`, with `ICONA` and the
`updateDevice`/`updateHome` lines in between), each with the whole home and accessory as JSON, all from the same second. The cause is in
the original app: `HomeService.getDevice` and `getHome` write debug lines on every call, `retrieveIconClass` writes `ICONA` on every call,
and the accessory screen calls them in every Angular digest (`isDeviceReachable` looks the accessory up in the home service). Opening
the accessory screen once writes about 180 lines in the original app, and the log panel kept 500 lines, so one visit to that screen pushed
out everything else. Measured in the harness (the real app with a simulated Cordova bridge), in the 6 seconds after opening the accessory
screen (the log panel also holds the lines from startup):

| Build | Console lines | Lines in the log panel |
|---|---|---|
| original app | 294 | |
| nx10 | 303 | |
| nx11, nx12 | 423 | 495 (of 500) |
| nx13 | 20 | 75 |

- `debuglog.js` no longer stores or passes on lines whose text starts with one of those labels (`NOISE`). It counts them and ends the log
  with "(N repetitive debug lines of the Nice app left out)". `window.__nxLogAll = true` brings them back for debugging the app itself.
  The log keeps 1500 lines instead of 500 and redraws at most four times a second, however many lines come in. The masking is unchanged
  and now runs only on lines that are kept (the noise lines were the biggest strings, run through four regular expressions each).
- **A mistake of mine in nx11.** The state line at the top of the accessory screen evaluated `isDeviceReachable` twice (for "Checking…" and
  for "Not usable"), next to the original's own use for "usable": three times instead of two per digest, so that screen wrote about 40% more
  lines (91 lookups instead of 61 in the table above). `patch-11-checking-state.py` now puts `nxCheck` first in both expressions, so
  `isDeviceReachable` runs once in each state and at most as often as in the original app. `verify-apk.py` checks the order.

**Approving a user.** The popup itself did not change (it worked in the harness in all cases: allow, "maximum number of users" and another
error, with real taps). What changed is what you see and what is logged:
- Tapping *Allow* shows "Allowing "X"…" at once (and "Still waiting for the accessory…" after 15 seconds), because the accessory can take
  its time or not answer. Only one message is on screen at a time now, so the progress message does not stay under the result.
- When it fails the message carries the app's own explanation of the error code (`NHK_ERROR-n` in the app's translations), for example
  "Could not allow the user: Sign not valid (4)." or "The connection with the Accessory is not valid (3)." Before it said "(4)" only. The
  same goes for a failed check in the status sheet's *New users* button ("Check failed: ... (code).").
- The log has the steps: `newUser`, `waiting users <mac> <number>`, `new user: asking whether to allow X`, `new user: allowing X`, then
  `new user: allowed X` or `new user: could not allow X {"code":4}`. The app's own screen for approving (*Users*) logs its failures too
  (`userApproved ERROR ...`, `pairings ERROR ...`), and those lines are not noise, so they survive.
- The harness can simulate a waiting user (`CFG.waiting`) and a failing approval (`CFG.approveError`); `harness/steps-approve.cjs` taps through
  it. The native action behind the app's `userApproved` is called `userNew`.

## What is new in nx12 (more buttons on the accessory screen, and a choice of theme)

nx12 has version code 20201110 and installs over nx11 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-12` as its version).

**More than one optional command.** The accessory screen of the original app has Open, Close and Stop, and one optional "fourth button"
(page *Optional command*: a radio list of the accessory's secondary commands, one choice). All other secondary commands (*Open and Block*,
*Release and Close*, ...) are behind the eye icon. Now any number of them can be ticked, and each becomes a button under Open, Close and
Stop:
- `nx-patch.js` (section 8) keeps the choice per accessory in `localStorage` under `nxQuick`: `{ "<mac>": ["<code>", ...] }`, in the
  order in which the commands were ticked. It is kept apart from the app's own data on purpose: no flow of the app (discovery, updating
  the accessory from the module) can overwrite it. Until the list has been touched, the app's own optional command counts as the first
  choice, so an accessory that was set up with nx11 or earlier keeps its button. The first ticked command is also written to the app's own
  optional command (`fourthButton`), so that the app's own check ("select an optional command") still holds; the other ones live only in
  `nxQuick`.
- The buttons only show while the app's own switch "enable the optional command" is on, so that switch keeps its meaning. The *Choose
  commands* link on the accessory screen turns it on and goes to the page where the commands are ticked.
- `patch-12-extra-commands.py` changes two templates: `system/device_detail.html` (the buttons, run by the app's own `runCommand`, so they use
  the same `executeSecondaryCommand` as the old optional button; the link) and `settings/device_4th_button.html` (the radio list becomes a
  list with a tick per command). Where `nxExtra` / `nxQuickToggle` do not exist (when `nx-patch.js` did not load), the old fourth button
  stays visible and the radio list stays in place.
- Lists the templates get must be arrays of strings: `ng-repeat` over fresh objects on every call would re-render on every digest, and
  Ionic ignores clicks that are not real taps (a synthetic `click()` in a test does nothing; the harness uses `tap()`).
- Limits: the buttons run the command at once, without a confirmation, as the optional button always did; many buttons make the commands
  area of the screen scroll on a small phone (checked with 8 buttons at 360x640); the order is the order of ticking.

**Theme.** The skin has a light and a dark palette (`tokens.css`) and picked one with the WebView's `prefers-color-scheme`. Android derives
that value from the Android theme of the app, and the theme of the Nice app is `Theme.DeviceDefault.NoActionBar`, a dark base theme. So the
app does not necessarily follow the phone's setting (it could not be verified on the phone this was developed on), and there was no setting
to choose. The earlier statement "light and dark follow the system" was an assumption, not something that was measured. Now:
- `nx-theme.js` (new, loaded in `<head>` before the stylesheets) puts `data-nx-theme="light"` or `"dark"` on `<html>` from
  `localStorage.nxTheme` before the first paint; with nothing saved (Auto) it sets nothing and the WebView decides, as before. An unreadable
  storage also means Auto.
- The color tokens answer to the attribute (`:root[data-nx-theme="dark"]`, and the media query for a dark WebView is switched off by
  `data-nx-theme="light"`), and the whole file still has one set of properties for each palette (a test checks that both dark blocks define
  the same ones).
- `patch-13-theme.py` adds the script to `index.html` and a row *Appearance > Theme* (Auto | Light | Dark) to `settings/settings.html`.
  `nx-patch.js` saves the choice, applies it at once and gives the status bar icons the matching color.
- `NX.theme('light' | 'dark' | 'auto')` sets the theme from a script and `NX.theme()` returns the current choice (for tests and the harness, for example `PRE="NX.theme('dark')"`).

## What is new in nx11 (no status before it is confirmed, and a calmer palette)

nx11 has version code 20201109 and installs over nx10 when it is signed with the same key.

**"Checking…" instead of a premature "Not usable".** The app marks an accessory "Not usable" as soon as the *first* attempt of its
reachability check fails, while `nx-patch.js` still makes a second and a third attempt (since nx3). Right after startup the lists and the
chip also showed what the last session had left in storage. So a healthy accessory regularly showed a red "Not usable" and a red
chip for a few seconds, and a chip that said "online" before anything had been checked. Now no status is shown before it is confirmed:
- `nx-patch.js` keeps, per accessory, whether a check is running and the result of the last check of this session that really
  finished (after its new attempts). `$rootScope.nxCheck(device)` answers `'checking'` (no result yet), `'hold'` (the last result was
  "reachable" and the check that is running now has not failed for good, so the list keeps showing "usable") or `''` (nothing to add:
  the app's own flag is the confirmed state). A check that takes longer than 45 s is no longer waited for, and an accessory that has not
  been checked is only "being checked" for the first 9 s after startup.
- `patch-11-checking-state.py` makes the lists ask that: the label under an accessory in the favorites, the list of accessories of a
  home, the add-favorites and settings lists, and the state line at the top of the accessory screen. Where nothing is confirmed they show
  a neutral "Checking…" (grey pill with a pulsing dot; it stands still with reduced motion) instead of the red "Not usable". Where
  `nxCheck` does not exist (when `nx-patch.js` did not load) every expression falls back to what the app did before.
- The status chip says "Accessory: checking…" (grey) as long as a result is missing, also without Wi-Fi: with mobile data the Nice
  cloud may still work, so "No Wi-Fi" is not a verdict yet. Only the accessory's own Wi-Fi (setup) is known at once.
- An accessory that nobody checks (the app only checks the ones on the screen) is checked by the patch 2.5 s after startup, with the
  same new attempts, but not while the phone is on the accessory's own Wi-Fi.

**Palette.** (Replaced in nx21 by seven palettes, see above; what follows is how it was from nx11 to nx20.) The scheme is now a calm petrol blue: seed color #1E6A8A in the Material scheme "tonal spot" (before: the "vibrant" scheme
with seed #3A6FF7: electric blue next to lavender and pink). Surfaces, *Open*, *Close* and the sheet now come from one color family:
*Close* is a soft tint of it (secondary container) instead of a third hue, and the green, amber and red of the statuses stand out
because the rest is calm. The wizard screens follow too: the dark "stage" for Nice's light-gray icons and the brand surface of the welcome
screen are derived from the scheme (`--nx-stage`, `--nx-brand`, in `tokens.css`) instead of being fixed colors. Contrast of the
main pairs (text on surface, on primary, on the containers, white on the brand surface): 4.8:1 at the lowest (dark theme, white on the
brand surface), 6.5:1 and more everywhere else. (Then `skin/src/tools/build-tokens.mjs` took `--seed` and `--scheme` to try another palette;
now it has the table of palettes and `--only`.) The harness shows the result.

## What is new in nx10 (everything in English)

Only texts and names changed: no function and nothing in the network layer. Every text the patch adds (the status chip and sheet, the
diagnosis, the popups, the error messages, the log lines) is English now, and so are the code comments, the tests, the scripts, the file
and folder names and this documentation. The quotes in this document show the English wording; builds before nx10 showed these texts in
Dutch ("Module online", "Opnieuw verbinden", ...). The app's own screens still follow the phone's language. Names inside the code changed
too (for example the plugin action `versie` is `version` now, the JSON key `gebonden` is `bound`, the error code `GEEN_WIFI` is `NO_WIFI`), so names you
find in older notes or logs may differ.
nx10 has version code 20201108 and installs over nx9 when it is signed with the same key.

## Where does the app work? (nx21)

The app talks to the accessory in two ways: directly at its address on your home network (discovery via mDNS, then TLS on port 443;
if mDNS fails, the IP safety net tries the saved address), and through the Nice cloud (`it4wifi.cloud.nice.niceappdomain.com`, port 7890)
when there is no local route. The cloud works: on 5G without a VPN, nx5 connected to the accessory this way (diagnosis: "App connection
with the accessory: ok", status "Closed"). In nx3 and nx4 the app never got round to the cloud when away from home, because the IP
safety net came before it.

| Situation | Works? |
|---|---|
| At home, on the Wi-Fi network the accessory was set up on (HomeWifi) | Yes. |
| At home, another Wi-Fi network of the same router (HomeWifi-5G, 5 GHz, etc.) | Yes, as long as that Wi-Fi reaches the accessory (same home network). When you operate the gate, the original app does not look at the Wi-Fi name; only the setup wizard does. |
| At home, guest network or Wi-Fi with client isolation | Not locally (the phone cannot see the accessory); since nx6 the app then falls back to the cloud. |
| Away from home (4G/5G, someone else's Wi-Fi), without VPN | Yes, through the Nice cloud. The status chip then says "Accessory online · cloud". |
| Tailscale (or another VPN) on | Yes, since nx7 (see below). Before that, every connection failed with EPERM. |

### Tailscale always on
**The cause (from the diagnosis with Tailscale on):** `Binding socket to network 376 failed: EPERM (Operation not permitted)`. A VPN
that cannot be bypassed (Tailscale does not call `allowBypass()`) does not allow an app it covers to bind its socket to another
network. The original app does that on EVERY connection (`Network.getSocketFactory().createSocket()` in `ConnectionsManager._openSocket`,
for Wi-Fi and for mobile, for the accessory and for the cloud). So with Tailscale on, everything failed, even when the VPN did not touch
the accessory's address at all (the diagnosis said: "VPN route to the accessory: none"). My earlier suspicions (a subnet route catching
the traffic, Tailscale's DNS) were wrong: name resolution simply worked (13 ms). nx3 through nx6 could not fix this, because the bug is
in the original code.

**nx7:** `Nx.socketFor(network)` replaces that call in both places. If binding succeeds, everything is as before; if Android refuses it,
a plain socket comes out instead. That socket follows the default route: addresses in the home network go over the Wi-Fi, the internet
goes over the underlying network, and a VPN only catches traffic for which it has a route. In addition, the app no longer binds the whole
process to a Wi-Fi network without internet while a VPN is on (all new sockets, including those for DNS, would then fail with EPERM).

**If it still does not work (plan B):** exclude MyNice Welcome in Tailscale. Tailscale has a setting for this, which you can find in the
Tailscale app as **App split tunneling** (excluded apps, "Excluded apps"; the name comes from the source code of the Android app, your
version may differ). Tailscale then stays on for your other apps and this app goes around it.

Known limitation: on another network that uses the same address range as at home (for example 192.168.1.x at someone else's house) the
app tries the home address first, and the cloud never gets a turn. A check that tells the two apart could wrongly reject the home
address at home when the accessory is briefly slow to answer; that risk is worse than this limitation.

## What is new in nx9 (new look and a better connection status)

Only the look and the way the connection is shown; no function of the app and nothing in the network layer has changed
(the native layer only reports `nx-9` as its version).

**Look (Material 3 Expressive).** The same design language everywhere: color roles from the Material "vibrant" scheme with seed
color #3A6FF7 (replaced in nx11 by a calmer petrol palette and in nx21 by seven palettes; light and dark, with the choice in the settings since nx12; Android's status bar gets the same color as the header), the Roboto Flex
typeface (OFL, bundled), lists as cards with large corner radii at the ends, a navigation bar with a pill indicator, tonal round
buttons in the header, popups as dialogs, and on the accessory screen a large shape that changes with the state (closed, open, moving,
stopped, obstruction), with Open and Close side by side below it and Stop beneath them. The wizard screens keep their light-gray icons
on a dark podium. It is a layer of CSS (`skin/nx-expressive.css`, 86 KB) that is loaded after `style.css`.

**Connection status.** The green dot at the bottom right, which sat on top of the tab bar, is gone. Instead, under the title of every
page there is a chip with a colored dot: "Accessory online", "Accessory online · cloud", "Accessory not reachable · VPN, mobile", and
so on (the same texts as before; the chip turns red for a fault, orange for a warning). A tap on the chip (or the title) opens a sheet
from the bottom with:

- a shape that shows the state (cookie with Wi-Fi = online locally, flower with a cloud = via the cloud, star = fault, sun = checking or a warning),
- the outcome of the diagnosis as a plain sentence,
- the route: phone - accessory, or phone - Nice cloud - accessory, each link green (succeeded), red dashed (failed) or dotted
  (not known yet), with the measurement alongside (TCP in ms),
- the facts as list rows: Wi-Fi or mobile, VPN, which route the app chose, the measurement to the accessory, to the cloud, and whether the app has a session,
- "Technical details" (expandable): the same text as before, for Copy and for sharing,
- New users, Copy and Log, and, fixed at the bottom, Close and Reconnect.

You can close the sheet with the button, by tapping the dark area, by dragging it down, or with Android's back button (which then does
not also go back to the previous page). The sheet measures again as soon as it opens, as the old button did. The red LOG button has
become a small round icon above the tab bar, on the left, and is now also in the sheet. The chip only appears while the app has an accessory.

**What I could and could not see.** The look was checked in a real browser (Chromium, 412 x 915, light and dark) with the app files from
this APK and a simulated Cordova bridge, on some 25 screens, not on your phone. The skin uses `:has()`, `:where()` and a spring curve
written as `linear()`; these exist in Android System WebView from version 113 (the WebView updates itself through Google Play). On an
older WebView the app loses some of the shapes and animations, but not its function. Firefox and iOS play no part here. If something
looks odd, send a screenshot and say on which page.

## What came in nx8 (hung accessory, honest diagnosis)

Confirmed with nx7 and Tailscale on: the app connects through the Nice cloud ("Accessory online · cloud"). In the same diagnosis you could
see that TCP to the accessory did get through locally but the TLS handshake did not ("Read timed out"): in that case the accessory
itself has hung, and the network is fine.

| Change | What it does |
|---|---|
| **TCP and TLS reported separately** | "Accessory ...: TCP 14 ms, but no answer on TLS (...)" instead of just "no answer". That way you can see that the network works and the accessory has hung. |
| **Conclusion "the accessory has hung"** | In nx7 the conclusion then wrongly claimed that the VPN was in the way. Now: "the accessory accepts the connection but does not answer the handshake: it has hung. The network (and your VPN) are fine. Disconnect the accessory from power for half a minute." |
| **Local and cloud alternate on failure** | The app reports every outcome of a check to the native layer. If the local route failed (for example a hung accessory), the cloud takes precedence for 2 minutes (doubled with every further local failure, up to 15 minutes); if the cloud fails, local may be used again; if local succeeds, the precedence is gone. A working session is left alone. This way, with a hung accessory the app comes online through the cloud after one failed attempt. The diagnosis shows how much longer the cloud keeps precedence. |

## What came in nx7 (Tailscale on: the real cause)

| Change | What it does |
|---|---|
| **Plain socket when binding is not allowed** | See "Tailscale always on". In both places in `_openSocket` the app now calls `Nx.socketFor`. |
| **No process binding with a VPN** | `bindNiceWifi` (two copies) no longer binds the whole process to a Wi-Fi network without internet when a VPN is on. |
| **Honest measurements** | My probes and the cloud test now bind the same way the app does (with the same fallback) and report `bound: false`. The diagnosis then says: "The VPN does not allow the app to bind its connection to the Wi-Fi network (EPERM)" and calls the measurement "plain connection" instead of "over Wi-Fi". |
| **More careful about the VPN** | Earlier texts claimed that "the VPN is probably taking over the traffic"; that has been replaced by "try switching the VPN off briefly to see whether that is the cause". |

## What came in nx6 (fallback to the cloud)

| Change | What it does |
|---|---|
| **Fallback to the cloud** | `getActiveConnection` got a check: a local address (mDNS or saved) without a working session is only used if it fits the network. With a VPN that check is a measurement (TCP within 3 s, over the same route as the app); without a VPN it stays the ordinary rule (same subnet, or an answer within 3 s on another subnet). If the check fails, the app chooses the cloud. A working session and the cloud itself are left alone. |
| **Cloud name via the network itself** | If the ordinary name resolution fails or returns 0.0.0.0/loopback, and a VPN is on, the app looks up `it4wifi.cloud...` with the resolver of the Wi-Fi or the mobile network. Without a VPN nothing has changed. |
| **Status bar and diagnosis know about the cloud** | "Accessory online · cloud" when the app connects through the cloud; no more "Turn on Wi-Fi" when the connection simply works away from home (nx5 reported that wrongly). The diagnosis measures the cloud (name, TCP 7890), shows which route the app chose, and names App split tunneling when a VPN seems to be the cause. |
| **Automatic recovery with a VPN or without Wi-Fi** | Check again (the app then picks local or cloud itself) instead of a reconnect that fixes nothing. |
| **LOG with timestamps** | Every line now starts with hh:mm:ss, so that events (`newStateHandler ... obstruct ...`) can be matched to a time. |

## What came in nx5 (all networks)

| Change | What it does |
|---|---|
| **Status bar leads with reachability** | "Other Wi-Fi" and "No Wi-Fi" used to hide whether the accessory was reachable. Now what the app itself knows comes first; the network is only given as the reason ("Accessory not reachable · other Wi-Fi, VPN, mobile"). |
| **Diagnosis without assuming you are at home** | On another Wi-Fi network of the same router: "All fine, that makes no difference". No Wi-Fi but a VPN: the measurement runs over the default route (the VPN) and the explanation names the route to the home network. |
| **The IP safety net no longer blocks the cloud** | The app first chooses a local connection (mDNS), then the IP safety net from nx3, and only then the Nice cloud. As a result the safety net passed on the home address even away from home, after which the cloud was never tried again. Now the app only gets the address if it fits the network: the Wi-Fi is on the same subnet (the usual case), a VPN has a route to it, or the address answers within 3 s. Otherwise the app falls back to the cloud, like the original. |
| **10-minute cloud skip** | After a single failed HTTP call to `niceappdomain.com` (push and IFTTT, not the connection to the accessory), later calls were skipped for 24 hours. That is now 10 minutes, so that a failure on one network does not linger on another network. |
| **Recovery only where it can work** | Automatic recovery does not run without Wi-Fi, nor on a network with a completely different /24 than the accessory's address (at someone else's house there is nothing to recover). |

## What came in nx4 (VPN and mobile data)

What prompted it: "Not usable" while the accessory had 3 green LEDs, with 5G and a VPN (Tailscale) on; with both off it worked.
Two bugs in nx3 and a behavior of the original app turned out to play a part. Which of them was decisive in your case cannot be
determined without the phone; that is why nx4 measures it too (see "Diagnosis").

| Change | What it does |
|---|---|
| **A VPN is not Wi-Fi** | On modern Android versions, a VPN running over Wi-Fi itself also reports "Wi-Fi" (TRANSPORT_WIFI); I could not verify this on a phone, but the code is set up for it. My network choice in nx3 (the status measurement and the binding to Wi-Fi without internet) could therefore take the VPN network for "the Wi-Fi". Now VPN networks are skipped everywhere. |
| **No false "Wi-Fi gone"** | The app reports "wifi-disconnected" as soon as the *active* network is not Wi-Fi. With a VPN (or mobile data on a Wi-Fi without internet) that is the case, even when the phone is simply on the Wi-Fi; the app then set every accessory to "Not usable". Now the rule is: as long as a real Wi-Fi is connected, it counts as "Wi-Fi". |
| **Cold start** | The first check after startup ran before my helper layer (saved addresses, retries). Now there is a hook right after the definition of the check in the app, with the old poll as a safety net. |
| **Automatic recovery** | If the app reports "not reachable" while the accessory does answer on both TCP and TLS over Wi-Fi, nx4 rebuilds the connection itself (at most three times per fault, at least 45 s apart, never in the first 12 s after startup or while the app itself is running a check). If the accessory does not answer, it does nothing and the diagnosis says where the problem lies. |
| **Diagnosis** | Tap the status bar. Besides the old lines, there are now: what Android sees as the active network, whether the VPN has a route to the accessory's address (and which), the measurement over Wi-Fi and, with a VPN or mobile data, also over Android's default route. The conclusion names a VPN that sends the traffic to the accessory into the tunnel. The text is also in the LOG panel, and there is a **Copy** button. |
| **Status bar** | "Accessory not reachable · VPN, mobile" names what else is switched on. |
| **LOG** | The app's Wi-Fi reports and nx4's decisions are now in the LOG (lines with `Wi-Fi event`, `network report`, `auto-recovery`). |

### What nx4 could not do (and what has turned out since)
nx4 assumed that a VPN only catches the app's traffic for which it has a route, and that the app could keep binding its connection to the
Wi-Fi. The latter is not true: a VPN that cannot be bypassed does not let an app bind its socket to another network at all (EPERM), and the
original app did that on every connection. That has been handled since nx7 (see "Tailscale always on"). If a VPN does have the accessory's
address in its routes (a subnet route or exit node), that traffic still goes into the tunnel; the diagnosis reports the route, and the
solution is then in the VPN app (App split tunneling, or subnet routes/exit node off).

## What already came in nx3

| Change | What it does |
|---|---|
| **Connecting to the accessory Wi-Fi automatically** | In the wizard, tap the accessory: Android shows "Connect to device" (WifiNetworkSpecifier, the recommended way on Android 10+). Choose Connect. After configuring, the app releases that connection and the phone returns to your home network by itself. Manual connecting (first in the Wi-Fi settings, then tapping) keeps working as a fallback. |
| **Longer timeouts** | Connecting to the accessory: 12 s instead of 5 s. The TLS handshake now has a timeout of 15 s; an accessory that accepts TCP but no longer answers on TLS used to block the whole connection layer forever. |
| **Safety net for "Not usable"** | The app only knows accessories that mDNS finds. If mDNS did not find the accessory, it fell back to the (unreachable) Nice cloud and reported "Not usable". Now it tries the accessory's saved IP address next. After that come two extra attempts of the reachability check. |
| **Status bar** (bottom right) | Shows "Accessory online", "Accessory not reachable", "No Wi-Fi", "Other Wi-Fi" or "Accessory Wi-Fi". Tap it for a diagnosis (network, TCP and TLS time to the accessory, app session, and a conclusion), with buttons **Reconnect** and **New users**. |
| **Approving a new user** | The app did not listen for new users; you had to open the Users screen yourself. Now a popup "X asks for access, allow?" appears (on a new request, on resume, or via the button). |
| **Double tap on Next** | A second configuration within 2 minutes is ignored (a second one threw the wizard back three pages). |
| **Clear error messages** | Instead of "A network error occurred" the app says what is wrong and what you can do. |
| **Skipping a dead cloud** | After a single failed call to `niceappdomain.com`, later calls are skipped immediately (24 hours in nx3 and nx4, 10 minutes since nx5). |
| **LOG panel without secrets** | Passwords, setup codes and tokens are replaced by `***` the moment they are recorded. The little log line that showed Wi-Fi passwords has been removed. |

## If something does not work: what I need

Open the app and tap the chip under the title (the connection status), wait until the sheet has finished measuring, and choose
**Technical details** and **Copy**. For the app's log: tap the small bug icon (LOG) above the tab bar, then **clear**, do the thing that
goes wrong, tap LOG again and **copy**. Lines with `[nx]` come from the new layer and say what happened (for example "request to connect
to NiceIT4WIFI… sent" or "requestNetwork failed"). Passwords are masked, but check the text yourself before you share anything.

## What is and is not tested

**Tested** (without a phone): the build and signing; that every call between the new code and the app/Cordova exists with exactly the
same signature; the logic of the new code on a plain JVM (81 checks, among them the calculation rule for the network range); the JS in
a simulated environment (299 checks for `nx-patch.js`, 295 for `nx-activity.js` and its sheet, 103 for the page Settings > Design and 908 in the eleven test files of nx23,
in which the new behaviors were also checked with deliberately introduced faults), the masking (44 checks), the Debug log sheet (38 checks), the CSS itself (83
checks, among them every number of the Material 3 Expressive components against the tokens) and the icon and splash screens that
`patch-16-brand.py` makes from an invented logo (46 checks), and the script of the English wording on an invented app tree (60 checks); the decompiled result of the three patched places in the app; and that the patched
`app.min.js` is valid JavaScript.

**Not tested** (can only be tested on a phone):
- the automatic connecting itself (the Android dialog, `onAvailable`, binding to the network, mDNS on the accessory network) and the
  IP safety net in practice; if creating the connection request fails, the app falls back to the old manual route;
- the behavior under a real VPN or with real mobile data (the route check and the measurement over the default route only run on
  a phone);
- any Wi-Fi other than HomeWifi (for example HomeWifi-5G) and any use away from home, also with Tailscale on (the measurement, the
  fallback to the cloud and the name resolution via the network only run on a phone);
- the automatic recovery with a real accessory.

## Back to the original app

The accessory simply stays paired and online. After removing this app (and installing the official one) you select the accessory
again and enter the setup code on its back. Use the same user name as before (here `homeuser`) and it will probably work; with a
different name the accessory asks the administrator for permission, and that is you, with a lost password. Then all that remains
is a reset of the accessory.

## Building and the files

See [README.md](../README.md) for the steps (`./get-tools.sh`, then `./build.sh <original.apk>`). The script unpacks the original APK,
applies `patch-01-wifi-binding.py` through `patch-22-diagnostic.py` (`patch-21-copy.py` last), builds the Java layer (`java/src/com/nice/patch`) into `classes2.dex`,
adds it, aligns, signs with your key in `keys/` and checks the result (`verify-apk.py`, if `androguard` and `loguru` are installed).
Every patch checks that its anchor text occurs exactly once, so a different APK version is not silently patched wrongly.

| File | Contents |
|---|---|
| `patch-01-wifi-binding.py`, `patch-02-already-connected.py` | older hooks (binding to Wi-Fi without internet; skips the self-connect that Android refuses when the phone is already on the SSID, and then waits for the home network) |
| `patch-03-home-network-and-log.py`, `patch-04-continue-after-discovery.py` | fill in the home network when Android no longer provides the list of known networks; continue after the accessory has been found |
| `patch-05-native-hooks.py` | hooks into the new layer (WifiWizard, JmDNS, ConnectionsManager), manifest, `config.xml`, version number |
| `patch-06-js-layer.py` | `nx-patch.js` in the app and the patch points in `app.min.js` |
| `patch-10-skin.py` | nx9: the skin (`skin/nx-expressive.css`), the font (`skin/fonts-nx`) and the `<link>` in `index.html` |
| `patch-11-checking-state.py` | nx11: "Checking…" instead of a premature "Not usable" in the app's lists (six templates; they ask `nxCheck` from `nx-patch.js`) |
| `patch-12-extra-commands.py` | nx12: the ticked commands as buttons on the accessory screen and a list with ticks instead of the radio list (two templates; they ask `nxExtra` and `nxQuickToggle` from `nx-patch.js`) |
| `patch-13-theme.py` | nx12: `nx-theme.js` in `index.html` and the row *Appearance > Theme* in the settings (Auto, Light, Dark) |
| `patch-14-activity.py` | nx14: `nx-activity.js` in the app (loaded before `nx-patch.js`) and the line on the accessory screen that opens the activity sheet |
| `patch-15-state.py` | nx15: the state text and icon of the accessory screen ask `nxState` and `nxIcon` (the state settled from the log), a note under the state, and the pill of a blocked gate |
| `patch-16-brand.py`, `brand/` | nx18/nx20: the logo of Nice from the app's own launcher icon as an adaptive icon with a monochrome layer, the small icon of the notifications, the splash icon of Android 12 and the splash screens (light and dark); the theme `NxTheme` and `SplashMaintainAspectRatio`. `brand/logo.py` takes the icon apart (gradient, house, N) and draws it sharp at any size, `brand/assets.py` says what is drawn where; both are plain Python 3 and there is no picture in the repository |
| `patch-17-gallery.py`, `nx-gallery.js` | nx22: the page Settings > Design (the reference of Material 3 Expressive): the script in the app (loaded before `nx-patch.js`) and the row in the settings, behind the rows of Theme and Colors |
| `patch-18-accessory-layout.py` | nx23: the accessory screen: the state box, the obstruction chip, the Activity chip, the status line (always in the DOM) and the caption of the extra buttons, in one pass over `device_detail.html` after patches 11, 12, 14 and 15 |
| `patch-19-lists.py` | nx23: the Favorites card and its tap, the hint and the groups of Other commands, and the row Debug log in the settings |
| `patch-20-wizard.py` | nx23: the texts and states of the set-up (six templates) and the two pages of a full accessory |
| `patch-21-copy.py`, `skin/copy/` | nx23: the English wording of the original app: `*.json` give new text for keys of `locale-en.json`, `templates.json` lists exact edits of templates (every `old` text must occur once); nothing is written unless everything matched |
| `patch-22-diagnostic.py` | nx26: the events of the accessory that the app does not read (DIAGNOSTIC) go to the Debug log |
| `patch-09-socket-fallback.py` | nx7: `socketFor` in `_openSocket` (EPERM fallback) and the VPN guard in both `bindNiceWifi` copies |
| `patch-08-route-choice.py` | nx6: hooks in `ConnectionsManager`: `vetLocal` (vetting the local address), `noteRoute` (remembering the chosen route), `socketAddress` (name resolution with a fallback) |
| `patch-07-vpn-binding.py` | nx4: skipping VPN networks in the bind loop, `Nx.wifiType`/`Nx.ctx` in the Wi-Fi receiver, the `__nxWrapVerify` hook in `app.min.js` |
| `java/src/com/nice/patch` | `Nx` (helper functions), `NxWifi` (connecting via WifiNetworkSpecifier), `NxPlugin` (bridge to the JS) |
| `java/stubs` | only signatures of app and Cordova classes that the code is compiled against; they do not end up in the dex |
| `nx-patch.js`, `nx-theme.js`, `nx-activity.js`, `nx-gallery.js`, `debuglog.js` | the JS improvements (nx9: also the status chip and the status sheet; nx12: the extra buttons and the theme; nx14: the activity sheet; nx22: the page Settings > Design; nx23: command feedback and trust, the accessibility layer and its dialog manager, the pairing popup, the wizard waits) with the early theme script, and the Debug log sheet |
| `skin/` | `nx-expressive.css` (the result that goes into the app) and `fonts-nx/`; the source is in `skin/src/`: `skin.css` (the app), `status.css` (the status sheet), `activity.css` (the activity sheet and its line), `tokens.css` (the colors of the seven palettes and the spring curves, generated by `src/tools/build-tokens.mjs`), `m3e.css` (nx22: the components of Material 3 Expressive), `gallery.css` (the layout of the page Settings > Design), `shapes.json` (the 35 shapes as polygons of 144 points, made by `src/tools/build-shapes.py`), `build-css.py` assembles them. Edit the source and run `python3 skin/src/build-css.py`, never edit the result |
| `harness/` | `screens.cjs` runs the real app (unpacked from the APK: `unzip -o <apk> "assets/www/*"`, next to the script as a folder `www`) in headless Chromium with a simulated Cordova bridge (`shim.js`) and takes screenshots of every page (light, and with `COLOR_SCHEME=dark` also dark, `PRE=` for an action such as `NX.diagnose()`, `CFG=` for a different network state); `sweep.sh` does 25 screens and makes a contact sheet; `make-screenshots.py` redoes the pictures in `docs/screenshots`. Requires Node with `playwright` and Python with PIL |
| `get-tools.sh`, `test-all.sh` | downloading the tools with a SHA-256 check, and all tests in one go |
| `test/` and `java/test/` | the tests (jsdom: `NODE_PATH=<folder with node_modules/jsdom> node test/nxpatch.test.js`, 299 checks; `node test/masker.test.js`; `node test/activity.test.js`, 295 checks of the activity statistics, the state, the readings in the background and the sheet; `node test/skin.test.js` (81 checks) checks the CSS itself: no placeholders, braces, every variable defined, the 35 shapes with 144 points each, icons, font and prefix, the palettes (their blocks, the contrast of the text, the swatches) and every number of the Material 3 Expressive components against the tokens; `node test/gallery.test.js` (101 checks) builds the page Settings > Design in jsdom and runs `patch-17-gallery.py` on an invented app tree; `node test/brand.test.js`, 46 checks, runs `patch-16-brand.py` on an invented logo and checks the generated icon and splash files; it needs `python3`) |

## Signing key

The first build creates a key of its own in `keys/` (`mynice.jks`, alias `mynice`) with a random password in `keys/password.txt`.
**Keep that folder safe, never share it and do not put it in git** (`.gitignore` excludes it). Whoever has the key can make an APK that
installs as an update over your installed app and can get at that app's data, including the pairing with your accessory. Without the
same key a new version cannot be installed over the previous one and the app's data is lost. You use an existing key with
`KS=/path/to/key.jks KSPASS=password ./build.sh ...`.

## Security

- The measurement behind the status chip (TLS handshake to the accessory) accepts any certificate, just as the app itself does for the
  accessory, and sends no data. It is only a timing measurement.
- The app itself still keeps all Wi-Fi passwords and pairing passwords locally, unchanged from the original.

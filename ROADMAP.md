# CareSplit — Roadmap

Entry for the **PayPal AI Hackathon** on Devpost. Deadline **November 12, 2026, 22:00 Romania time**.
Work started October 3, 2026 — about 40 days, at 1–2 hours a day (roughly 50–60 working hours in total).

**CareSplit** helps siblings share the pharmacy costs of an elderly parent. Photograph a
pharmacy receipt, AI reads the items, amounts and date, the app splits the total by the
family's rule, sends each sibling a PayPal invoice for their share and shows who has paid.

> Read this file at the start of every work session. Update the phase status table after
> each finished phase, in the same commit as the phase.

## Hackathon requirements and where we meet them

| Requirement | How CareSplit meets it | Phase |
|---|---|---|
| PayPal central and meaningfully used | Invoicing API (one invoice per sibling), Orders/Checkout (pay in the app), webhooks (automatic status) | 1, 4, 5 |
| AI meaningfully used | Gemini reads receipts (vision, structured output); later: chat over the family's data, anomaly checks, reminders, report text | 1, 6, 7, 8, 9 |
| Working hosted demo | Google Cloud Run, project `core-invention-cvz43`, region `europe-west4`; pre-seeded demo family so judges need no setup | 0, 1 |
| Public GitHub repo, source, run instructions, visible open-source license | Public repo, MIT `LICENSE` at the root, README with run and deploy steps | 0, 3 |
| Public YouTube demo video under 3 minutes | Script written early, recorded twice (core version, final version) | 3, 10 |
| Description of the tools and how each was used | Devpost text plus a "How it is built" section in the README, kept current each phase | 3, 10 |

Re-read the official Devpost rules and judging criteria in Phase 0; if they differ from the
list above, this table wins over memory and the roadmap is corrected.

## Fixed constraints (every phase)

- **Amounts and dates only.** No medical advice, no treatment claims, no health data. The
  receipt prompt asks for merchant, date, items (name and amount) and totals only; patient
  names, prescriptions and doses are ignored and never stored. The chat assistant refuses
  medical questions.
- **Fictional demo data only.** All receipts are invented by us (generated images of made-up
  pharmacies), all family members are fictional, PayPal accounts are sandbox accounts.
- **English UI.**
- **Secrets never in the repo.** PayPal client ID and secret, PayPal webhook ID and the Gemini
  key live in a local `.env` (git-ignored from the first commit). The repo has `.env.example`
  with empty values. On Cloud Run the same values come from Secret Manager, not from the code
  or the container image. Check `git log -p` for leaks before the repo goes public.
- **Cloud Run:** project `core-invention-cvz43`, region `europe-west4`.
- **Every phase ends deployed and submittable** (from Phase 1 on): the app works end to end,
  the README is correct, the live demo is up. No phase leaves `main` broken.
- **Abuse protection on the public demo:** a daily cap on Gemini calls and a rate limit per IP,
  so a visitor cannot burn the key.

## Proposed stack (small, boring, quick to ship)

- TypeScript end to end. Node 20 + a small server (Fastify or Express) for the API and the PayPal
  and Gemini calls (keys stay on the server).
- A light front end: React + Vite, mobile-first (the receipt photo comes from a phone camera).
- **Firestore** (same GCP project) for data. Cloud Run containers are stateless, so SQLite on
  disk would be lost at every deploy and restart.
- Gemini via the Google AI Studio API with a JSON response schema (exact model name checked in
  Phase 0). PayPal REST APIs in the sandbox, called directly with `fetch` (no unmaintained SDKs).
- Tests: Vitest for logic and API wrappers, a few Playwright runs for the main flows.
- GitHub Actions: typecheck, tests, then deploy to Cloud Run on `main`.

## Calendar

| Dates | Phases |
|---|---|
| Oct 3 – Oct 8 | 0 Setup and spikes |
| Oct 9 – Oct 18 | 1 Walking skeleton, 2 Complete core |
| Oct 19 – Oct 21 | 3 First submission (submit early, edit later) |
| Oct 22 – Nov 1 | 4 Checkout, 5 Webhooks, 6 Chat assistant |
| Nov 2 – Nov 6 | 7 AI checks, 8 Reminders, 9 Monthly report (cut first if late) |
| Nov 7 – Nov 11 | 10 Final polish, video, submission |
| Nov 12 | Buffer only. Submit by Nov 11 at the latest. |

Cut order if time runs out: report (9), then reminders (8), then checks (7). Phases 1–6 and 10 are
the heart of the entry. Never cut phase 10.

## Phase status

| # | Phase | Status |
|---|-------|--------|
| 0 | Setup and spikes | done (the Orders/Checkout spike moves to the start of phase 4) |
| 1 | Walking skeleton: receipt → split → PayPal invoice → status | done, live on Cloud Run (Oct 3) |
| 2 | Complete core: family rules, receipts list, solid errors, demo data | built and **live** (Oct 3, Cloud Run revision `caresplit-00004-pxj`; the 7-day TTL policy on `expireAt` is created for `families` and `receipts`): a private demo family per visitor with sample history and "Reset demo"; an editable family (2 to 4 members, sandbox accounts from a list, equal or percentage split, per-receipt override); receipt filters with totals; cancel an invoice and mark a share as paid outside PayPal; friendly errors and empty states. 128 automated tests, 26 live checks. **Step 2d "Care credit" level 1 is built (not deployed yet)** |
| 3 | First submission package (submit early) | planned |
| 4 | Pay your share in the app (Checkout, Orders API) | planned, after the real-payment test of the webhooks |
| 5 | PayPal webhooks: automatic status | done and live (revision `caresplit-00006-vcd`): a payment recorded in PayPal updated the app by itself within about 30 s; a buyer's payment on Ben's invoice is still to try |
| 6 | AI chat assistant over the family's data | planned |
| 7 | AI checks: duplicates, high amounts, late payers | planned |
| 8 | AI-written payment reminders | planned |
| 9 | Monthly family report, downloadable | planned |
| 10 | Final polish, final video, final submission | planned |

## Phases

### 0. Setup and spikes (≈ 6–8 h) — not submittable yet, by design

**Delivers**
- Folder `caresplit`, git repo, public GitHub repo, MIT `LICENSE`, `.gitignore` (with `.env`
  first), `.env.example`, a short README stub.
- Empty app that deploys to Cloud Run and shows a "hello" page at a public URL.
- Three proven spikes, as small scripts kept in `spikes/`:
  1. **PayPal Invoicing**: create a draft invoice, send it, read its status, in the sandbox.
  2. **Gemini receipt reading**: one made-up receipt image in, structured JSON out (merchant,
     date, items, subtotal, tax, total).
  3. **PayPal Orders**: create an order and capture it with a sandbox buyer.
- PayPal sandbox set up: one Business (merchant) account and 3–4 Personal (sibling) accounts.
- A set of 5–6 invented receipt images (different layouts, one blurry, one duplicate, one with a
  very high amount) for tests and the demo.

**Tested by**
- Each spike run once end to end, output saved in the notes. Hello page reachable from a phone.
- `git log -p` and `git grep` show no secret anywhere.

**Risks and open questions**
- **Invoicing in the sandbox:** does a sandbox invoice send a real email, or must the recipient be
  a sandbox account? Where does a sibling see and pay it (sandbox invoice link)? Which fields are
  required (invoicer email, recipient email, currency, invoice number)?
- **Sandbox invoice payment:** can a sandbox Personal account pay an invoice through the link,
  or must payment be simulated (Invoicing "record payment" API)? This decides how phase 1 shows
  "paid" in the demo.
- **Findings so far (Oct 3):** the Invoicing scope only appeared on a new app linked to a **US**
  Business sandbox account (the first app, linked to the Romanian Business account, got 403
  `NOT_AUTHORIZED` even with Invoicing ticked), so keep USD and the US merchant. Create, send and
  read of a USD invoice work. The sandbox site is very slow and the first real payment by a
  sandbox buyer (Ben) did not complete, so the invoice stayed SENT. "Record payment"
  (`POST /v2/invoicing/invoices/{id}/payments`, method PAYPAL) worked and the status became
  **`MARKED_AS_PAID`**, not `PAID`: the app must treat both as paid. **To redo later for the
  demo:** a real payment through the PayPal invoice link or button as a sandbox buyer (retry
  when the sandbox is faster), to confirm that status becomes `PAID` and to feed the webhook
  tests in phase 5. Until then the demo can use "record payment" as a fallback.
- **Cloud Run (done Oct 3):** a hello page is live at https://caresplit-30747896454.europe-west4.run.app
  (service `caresplit`, runs as `caresplit-run`, public, max 2 instances, image in the Artifact
  Registry repo `caresplit`, europe-west4). Do not use `/healthz` as a health path: Cloud Run's front
  end swallows it with a 404; use `/health`. The three secrets and their per-secret access for
  `caresplit-run` are still to be created in phase 1.
- **Cloud Run needs (original note):** billing and APIs (Cloud Run, Artifact Registry, Firestore, Secret Manager)
  enabled on `core-invention-cvz43`; permission to deploy from GitHub Actions (workload identity
  or a service-account key kept in GitHub secrets, never in the repo).
- **Gemini:** *(spike done Oct 3: `gemini-3.8-flash` reads the fictional receipt correctly in
  about 6 s; `gemini-2.5-flash` is closed to new keys even though the model list still shows it,
  so do not trust the list.)* Six fictional demo receipts (`demo/receipts/`, with `expected.json`)
  were all read correctly (merchant, date, items, quantities, discount, tax, total; amounts add
  up) in 4–10 s. Gemini returned temporary **503 "high demand"** errors on several calls: the app
  needs retries with backoff and a second model as fallback (`gemini-3.7-flash` also reads them
  correctly). The duplicate and the very-high-amount receipts for phase 7 are still to be made.
  **Update (phase 1, receipt reading built):** besides 503s Gemini answers **429** (a model's
  request quota used up) and is sometimes slow (5 to 35 s per receipt). The server now tries
  `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash` in turn: 503 is retried on the same
  model, 429 and 404 move to the next model at once. All six demo receipts read correctly through
  the server (`node demo/verify-reading.mjs`). The screen says "Still reading" after 15 s, and the
  user can always enter a receipt by hand. Still open: the free-tier quota is small, so the public
  demo needs the per-visitor and daily limits (built, `READ_LIMIT_*`) and possibly a paid-tier key
  for judging week; check the real quota in AI Studio before November.
  **Quota finding (Oct 3, deploy day):** the free tier has a small *daily* quota per model
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`); a day of testing used up
  `gemini-3.8-flash`, `3.7-flash` and `3.6-flash`, and the live app answered "busy" until the
  quota resets. `gemini-3.5-flash-lite` has its own quota, read all six demo receipts correctly in
  about 1.4 s, and is now first in the chain. The 300/day app limit means little when a model's
  own free quota is far smaller: for judging week check the real per-model quotas in AI Studio
  and consider billing on the Gemini key or project (cost is cents at this size).
  Still open: image size limits. Decide the
  fallback if the key is rate limited during judging (cached sample result for the demo receipts).
- **Official rules:** confirm eligibility, whether specific PayPal APIs are required, and exact
  submission fields.

### 1. Walking skeleton (≈ 10–12 h)

The thinnest complete path, hosted and working: one hard-coded family of fictional siblings.

**Delivers**
- Upload or photograph a receipt → Gemini extracts merchant, date, items, amounts → the user
  sees and can correct the result before confirming.
- Equal split between the family members → one PayPal sandbox invoice per sibling is created and
  sent (the payer, who paid at the pharmacy, receives no invoice).
- Receipt page showing each sibling's share and invoice status (Draft / Sent / Paid), refreshed
  by a "Refresh status" button that reads the Invoicing API.
- A **"View as: Anna / Ben / Clara"** switcher (useful for the video). Anna, the organiser, sees
  everything. Ben and Clara see only their own share to pay and the link to their invoice.
  In phase 1 it is a plain switch with no login; real per-user data isolation stays phase 2.
- Look and feel (approved): React + Vite + TypeScript, Tailwind, mobile first; warm cream
  background, teal `#0F766E` as the main colour, amber for "Sent", green for "Paid", big
  touch targets; English UI. Logo: the word "CareSplit" with two overlapping circles in two
  teals (dark `#0F766E`, light `#5EEAD4`), no orange or yellow, so it does not look like a
  payment-card brand.
- Data saved in Firestore. Deployed to Cloud Run by hand (decided against GitHub Actions: the
  manual deploy is three commands and avoids setting up GitHub-to-Google identity).

**Built (finished Oct 3)** — live at https://caresplit-30747896454.europe-west4.run.app. React +
Vite + Tailwind front end and a Fastify server in one Cloud Run container; receipts in the
Firestore database `caresplit` (family `rowan`), secrets in Secret Manager, service account
`caresplit-run`. Flow: photo or built-in fictional sample → Gemini reading (lite model first, three
larger fallbacks, retries) → editable Review screen with the live "Amounts add up" check → equal
split (the organiser absorbs the odd cents) → confirmation dialog → one PayPal sandbox invoice per
sibling, each step saved so a retry or double click never makes a second invoice → receipt page with
invoice links and "Refresh status" (PayPal `MARKED_AS_PAID` counts as paid). Safety: photos are never
stored, a demo warning on Add receipt, per-visitor limits (read, write, PayPal) and per-day caps,
proxy-aware client address, sandbox only. 62 automated tests. Verified on the live link: reading,
saving, sending two invoices and refreshing. Known limits, all planned: no per-visitor data
(everyone shares the Rowan family: phase 2), no login, the "View as" switcher is not a security
boundary, free-tier Gemini quota is small (see the quota finding above).

**Tested by**
- Unit tests: the split maths (cents, rounding so shares always add up to the total), the
  Gemini response parser (valid, missing fields, garbage).
- An integration test against the sandbox: create and send an invoice, read its status.
- Manual run on a phone with two made-up receipts, from photo to "paid" in the sandbox.

**Risks and open questions**
- Receipt reading errors (wrong total, currency, date format). Mitigation: always show the
  extracted data for confirmation and check that the item amounts add up to the total.
- Rounding: 3 siblings and an amount in cents. The odd cent goes to a deterministic person.
- Currency: use one currency (EUR or USD) for the whole demo; decide in phase 0 against what the
  sandbox accounts support.
- A sandbox invoice failing halfway through a batch (2 of 3 sent). Needs a retry that does not
  create duplicates (store the invoice ID per share).

### 2. Complete core (≈ 10–12 h)

**Delivers**
- **Family setup:** members (name, sandbox PayPal email), who is the organiser who usually pays,
  and the split rule: equal, or custom percentages that must add up to 100 %. The rule can be
  changed per receipt before sending.
- **Receipts list** with filters (month, status), and a receipt detail page with its invoices.
- **Demo mode:** a "Sign in as Anna / Ben / Clara" switcher with a pre-seeded fictional family
  and history, plus a "Reset demo" button. No real accounts or passwords. The family is a
  separate Firestore document per visitor session so judges do not disturb each other.
- Solid errors and empty states (unreadable photo, Gemini down, PayPal error), cancel or void an
  invoice, mark a share as "paid outside PayPal" with a note.
- Mobile-first, accessible UI (labels, contrast, keyboard use), clear "amounts only, no medical
  advice" notice.

**Decisions (Oct 3):** invoice addresses are chosen from a fixed list of PayPal sandbox buyer
accounts, never typed (so no real person's address can be used); families have 2 to 4 members (a
fourth sandbox Personal US account is needed for that); each family is deleted automatically 7 days
after it is created (Firestore TTL on `expireAt`; the policy is a separate Google Cloud change that
needs the owner's OK).

**Step 1 built (Oct 3):** each browser makes up a random visitor id (kept in local storage and sent
as `X-Visitor-Id`) that names its own family in Firestore (`families/{visitorId}` with a `receipts`
subcollection). A new visitor gets the Rowan family with three sample receipts dated relative to
today, marked "Sample" and without invoices; "Reset demo" (Family screen, organiser only) removes
their receipts and restores the family. Creating new families has its own per-address limit. Every
saved document carries `expireAt`. 73 automated tests, including: visitors never see each other's
receipts (404), a missing or malformed id is refused, reset leaves other visitors alone. Honest
limit: the visitor id is a bearer secret in the browser, not a login.

**Step 2 built (Oct 3):** the Family screen is an editable form for the organiser (siblings see it
read-only): family name, 2 to 4 people (names, one organiser, each linked to a different PayPal
sandbox account from a fixed list of four; the addresses never leave the server), add and remove
people, and the family's default split: equal shares or custom percentages with a live "adds up to
100%" check and a "Share equally" button. The Split & send screen starts from that default and can
override it for one receipt; amounts update live. Percentages are stored as basis points so they
add up exactly; every sibling pays their percentage rounded down to the cent and the organiser takes
the rest (at most a few cents more), so nobody is billed too much. A person at 0 % gets no share and
no invoice; a split that leaves nothing to invoice is refused. Each share keeps the person's name
from when the receipt was made, so old receipts still read well after a rename or removal; the invoice
says which part of the total is theirs. The fourth sandbox account (buyer D) is in the list.
Cleaned the old Phase 1 test receipt out of Firestore (`families/rowan`, one document, checked first).
94 automated tests.

**Step 3a built (Oct 3):** the Receipts screen has Month and Status filters (kept in the address
bar so Back and links work), a totals card for just the selection (spent, open, paid back; a sibling
sees to pay and paid), a clear empty state with "Clear filters", and a retry button when loading
fails. Statuses: waiting for payment, paid, not sent, cancelled (a cancelled invoice counts as neither
owed nor paid).

**Step 3b built (Oct 3):** on a real receipt the organiser can **Cancel invoice** (PayPal
`POST /v2/invoicing/invoices/{id}/cancel`, recipient notified) and **Mark as paid** outside PayPal
(`POST .../payments`, method cash, bank transfer or other, optional 100-character note; the invoice
becomes `MARKED_AS_PAID`). Both only for a sent, unpaid invoice. Before acting, the server asks PayPal
for the invoice's real state: if the sibling paid a moment ago it refuses ("already paid"), brings the
receipt up to date and never cancels a paid invoice or records a second payment. If PayPal fails,
nothing changes. A sibling sees how it was paid but not the organiser's private note. **Verified on
the real PayPal sandbox** (one 0.30 USD receipt, two 0.10 USD invoices): Ben marked paid in cash with a
note, Clara's invoice cancelled, and "Refresh status" read the same states back from PayPal.
119 automated tests.

**Step 3c built (Oct 3):** errors and empty states. A crash inside a screen shows a calm "Your
receipts are safe" page with Reload and Go to the start (`ErrorBoundary`); loading errors say what
happened and offer "Try again" (the server's own friendly message, or "Couldn't reach the server");
an unknown receipt says it may be someone else's or removed by a reset; an unknown address has its own
page; empty lists invite instead of apologise (organiser: "Start your first receipt" with a button;
sibling: "Nothing to pay yet"); an offline banner appears when the browser loses its connection.
Accessibility: a "Skip to the content" link, focus moves to the content on each new screen, and the
tab title names the screen. Checked in the browser (server down then back up, offline event, missing
receipt, missing page) and with component tests in a simulated browser (`jsdom`). Not done: browser
automation with Playwright (it needs a browser download); the same flows were exercised by hand and
by the server and component tests instead.

**Deployed (Oct 3):** image `caresplit:phase2`, revision `caresplit-00004-pxj`, same settings as
before (Firestore, secrets, limits, at most 2 instances). The Firestore TTL policy was turned on for
the collection groups `families` and `receipts` (field `expireAt`, 7 days); it shows `CREATING` first and
becomes active within minutes, and Firestore deletes expired documents within about a day. Checked on
the live link with two made-up visitors (26 checks, no invoices sent): each visitor has their own family,
nobody sees anyone else's receipts, editing and reset work, no address leaves the server, one live Gemini
reading answered in 1.4 s. The test families were deleted afterwards. Other services untouched.

**Step 2d — "Care credit" (idea added Oct 3, for the Innovation criterion). Level 1 is built, not yet deployed; level 2 (care log) is not built.**

*Built (level 1):* the Family screen has a "Care credit" section (switch, main caregiver, credit %, and a
live preview of the split it produces); the family's care credit is saved with the family and applied on
top of the family's split (equal or percentages) to every new receipt. On Split & send an "Apply care credit
to this receipt" switch (on by default) shows the effect ("Ben pays $3.71 less than their normal share") and the
new percentages. The exact maths lives in `shared/care.ts`: whole basis points that always add up to 100 %, the
caregiver never pays more and the others never pay less than without the credit, and the organiser still
absorbs the odd cents. On the PayPal invoice the caregiver's item is the normal share with an **item discount**
for the credit (verified on the real sandbox: a $1.00 item with a $0.50 discount gives a $0.50 invoice);
the other siblings' invoices say their part includes the family's care credit; and the server refuses to send any
invoice whose total PayPal calculated differs from the share. The organiser sees the credit on the receipt and a
"Care credit" card on the dashboard; the caregiver sees a thank-you (receipt and dashboard); other siblings
see only their own share, and the agreement is visible to all on Family. A 100 % credit means no invoice for the
caregiver. 158 automated tests.
*Why:* money is not the only contribution. A sibling who makes the pharmacy runs, goes to appointments
and spends time with the parent gives time, and the family may agree that this sibling pays a smaller
part. Care credit turns that agreement into a visible, fair rule instead of an awkward conversation.
*Level 1, "care credit %" (build first, about 6–8 h):* in the Family screen the organiser picks the
main caregiver and a credit percentage c (for example 25 %). The caregiver pays their normal share
times (1 − c); the part released is shared between the others in proportion to their normal shares.
It produces an ordinary percentage rule in basis points, so the existing split, rounding (the organiser
absorbs odd cents) and invoice code are reused. Example: three people, equal shares of 33.33 %; Ben's
credit is 25 %, so Ben pays 25.00 % and Anna and Clara pay 37.50 % each.
*Level 2, "care log" (later, about 6 h):* members log care (date, kind such as pharmacy run, appointment or
time together, minutes); the family sets a symbolic value per hour. For a period, each person's credit is
hours times that value, and the split makes everyone reach the same level L of money plus time:
money owed by person i is max(0, L − credit_i), with L chosen so that the money owed adds up to the costs.
The app suggests the percentages and the organiser confirms them.
*What each person sees:* the organiser sees a "Care credit" card on Family (caregiver, credit, preview of
the effective split) and on Split & send a line such as "Care credit −$3.89 for Ben" with a switch
"Apply care credit to this receipt" (on by default); the dashboard gets a "Care credit this period" card.
The caregiver sees a thank-you with the credit; a sibling sees only their own share, and the care
agreement itself is visible to everyone on Family, so it stays transparent.
*On the PayPal invoice:* the item is the normal share and carries an item-level discount for the credit
(PayPal invoice items support a discount; verify in the sandbox), with the description saying "includes
a $X care credit for time spent helping".
*Risks:* amounts and time only, no health information or claims; time is self-reported, so keep it a
family agreement, visible to all, not an accounting system; cap c so no share goes below zero.
*Tested by:* unit tests for the effective rule and the level-L maths, rule and invoice text tests, and the
usual live check.

**Tested by**
- Unit tests for custom percentages (sum 100, rounding, one member at 0 %).
- Playwright flows: set up a family, upload a sample receipt, send invoices, see statuses.
- Failure drills: wrong PayPal secret, Gemini timeout, blurry receipt.

**Risks and open questions**
- Auth and multi-user: demo mode keeps this simple on purpose. Real login is out of scope; say
  so in the README.
- Per-session data isolation and cleanup (Firestore TTL or a cleanup job) so the database does
  not fill up after the hackathon.
- Judges and sandbox: how a judge pays a sandbox invoice (see phase 0). The testing instructions
  on Devpost will include fictional sandbox buyer logins, which are not secrets but must be
  clearly marked sandbox only.

### 3. First submission package (≈ 4–5 h)

Submit a complete, honest entry early. It can be edited until the deadline, so everything after
this phase is upside, not risk.

**Delivers**
- README: what it is, screenshots, architecture diagram, run locally, deploy to Cloud Run,
  environment variables, how each tool is used (PayPal Invoicing, Gemini, Cloud Run, Firestore).
- Demo video (under 3 minutes) uploaded to YouTube as public: problem, receipt photo, AI reading,
  split, invoices, paid status.
- Devpost entry filled in and submitted: description, tools, testing instructions, links.

**Tested by**
- A checklist run in a private window with no login: demo URL opens, a sample receipt goes through,
  repo is public, license visible on the repo page, video plays logged out, length under 3:00.
- A fresh clone follows the README and runs locally with a new `.env`.

**Risks and open questions**
- Video length and clarity (script and rehearse; no live narration surprises).
- Devpost wording about what is real: say plainly that PayPal runs in the sandbox and the data
  is fictional.

### 4. Pay your share in the app — PayPal Checkout, Orders API (≈ 8–10 h)

**Delivers**
- A **Pay now** button next to each of the signed-in sibling's open shares, using the PayPal
  JS SDK buttons with server-side create and capture through the Orders API.
- Capturing an order marks the share paid at once and also settles the matching invoice so the
  sibling is not asked to pay twice.
- Receipt detail shows the PayPal transaction ID and capture time.

**Tested by**
- Server tests for create/capture with mocked PayPal responses (including declined, cancelled,
  already captured, amount mismatch).
- Sandbox run: a sibling pays through the popup; the share, the invoice and the list all show
  paid. A second click on a paid share does nothing.

**Risks and open questions**
- **Invoice versus order for the same share.** Options: record the Checkout payment on the invoice
  (Invoicing "record payment") or cancel the invoice. Decide in this phase after trying both in
  the sandbox. Danger: double payment.
- The amount is always read from the server, never from the browser (anti-tamper).
- The merchant account that receives the money must be the organiser's sandbox business account.
- Popup blockers and mobile browsers with the PayPal buttons.

### 5. PayPal webhooks — automatic status (≈ 6–8 h)

**Built (done first, before Checkout; not deployed yet).** `POST /api/paypal/webhook` receives PayPal's
invoice events (paid, cancelled, refunded, updated). Order of work on each call: switch off with 503 unless
a webhook id is configured; a per-caller limit (each call costs a PayPal check); read the five signature
headers; ask PayPal's `verify-webhook-signature` API whether the call is genuine, sending the event **byte for
byte as received** (re-serialising could change what PayPal signed), and answer 401 if not; then, for a
handled event, find our share from the invoice id and **read the invoice's real status from PayPal** (the
event only says where to look, so a replayed, repeated or reordered event can never set a wrong status).
Our own payments recorded outside PayPal are kept. A temporary PayPal problem answers 502 so PayPal retries
(it retries for days). Unknown invoices and unused event types answer 200 and are ignored. The invoice id to
share lookup is a small top-level Firestore collection `invoices` (looked up by document id, so no index),
carrying `expireAt` like everything else; the receipt page shows "Updated automatically by PayPal at ...", and
the receipt, receipts and dashboard screens check again every 10 to 15 s while an invoice is unpaid, so a
payment shows up on screen without a click. Tested: 179 automated tests (a fake PayPal for the full
paths, including a forged call, a retried event, an event that lies, PayPal down, a bad body, an oversized body,
two families); and against the **real sandbox**: a forged call is answered 401 because PayPal does not confirm it.
**Registered and deployed.** The PayPal dashboard would not load for the owner, so the webhook was created through
the API (`spikes/webhook-register.mjs`: lists the app's webhooks first, reuses one with the same URL instead of
doubling it, creates it otherwise, and writes the id into the git-ignored `.env`; none existed, so it was
created with exactly the four invoice events). Image `caresplit:phase4`, revision `caresplit-00006-vcd`, with
`PAYPAL_WEBHOOK_ID` as a plain setting (an identifier, not a secret); TTL policy on the `invoices` collection
(`CREATING`, then active). Checked on the live link: a forged call is refused with 401 (so the webhook is on and
PayPal does the checking), a call without the headers or with a body that is not JSON with 400, a plain
visit with 404; the 26 earlier and 16 care-credit live checks still pass. Invoices sent *before* this deploy are
not in the invoice index, so only invoices sent from revision 00006 on update by themselves (older ones still
work with "Refresh status").

**Real webhook verified (Oct 4).** The owner's sandbox pages were too slow to pay as a buyer, so a payment was
recorded *directly in PayPal's API* (not through CareSplit) on Clara's 3.65 USD invoice of the CORNER CARE
PHARMACY receipt (9.74 USD). About 30 s later PayPal sent its real signed webhook call; the Cloud Run request log
shows it accepted (200, 3.8 s), and Clara's share changed from Sent to Paid **by itself** (the database marks the
source as `webhook`), while Ben's 2.43 USD share stayed Sent, also unpaid in PayPal. This proves the whole chain
with PayPal's real signature check. Still to do, nice to have: a payment by a sandbox buyer on Ben's invoice
(the same event type, so little new risk).

**Delivers**
- A public webhook endpoint on Cloud Run, registered in the sandbox app, for invoice paid,
  cancelled and refunded events and for payment capture completed.
- Signature verification with PayPal's verify-webhook-signature API, an idempotency record so a
  repeated event is applied once, and an event log page (for the demo and for debugging).
- The UI updates by itself (live listener on Firestore or short polling); the Refresh button stays
  as a fallback and as a safety net for missed events.

**Tested by**
- Unit tests: valid, invalid-signature and duplicate events; out-of-order events.
- Sandbox: pay an invoice with a sandbox buyer and watch the status change with no click. Also
  the PayPal Webhooks Simulator for event shapes that are hard to trigger.

**Risks and open questions**
- **Sandbox webhook reliability and delay:** events can arrive late or not at all; keep the
  Refresh/reconcile path and say so in the README.
- The simulator sends events with fake IDs that fail real verification; use real sandbox
  payments for the signature test.
- Which invoice events are delivered in the sandbox and with what payload; confirm in practice.
- Local development needs a public URL (a tunnel) or just test against the Cloud Run revision.
- Cloud Run scale-to-zero cold start versus PayPal's webhook timeout; set min instances to 1
  only for the demo period if needed (cost note).

### 6. AI chat assistant over the family's data (≈ 8–10 h)

**Delivers**
- A chat panel: "How much did each of us pay in September?", "Who still owes something?",
  "What was our biggest receipt?".
- Built with Gemini function calling over a small set of safe, read-only tools that query
  Firestore (totals by member and month, open shares, receipt search). The model gets the tool
  results, not the raw database, and always shows the figures it used.
- Scoped to the signed-in family only. Refuses medical questions and anything outside the
  family's own amounts and dates.

**Tested by**
- A fixed set of 20 questions with expected answers on the demo data (numbers checked against a
  plain SQL-style computation in a test, not by eye).
- Refusal tests (medical advice, other families' data, prompt injection inside a receipt item
  name such as "ignore your rules").

**Risks and open questions**
- Wrong arithmetic from the model: the tools return exact totals, the model only phrases them.
- Prompt injection through receipt text: item names are passed as data and never as instructions.
- Cost and rate limits of the public demo (per-session message cap).
- Time zones for "in September" (use the family's stored time zone).

### 7. AI checks — duplicates, high amounts, late payers (≈ 6–8 h)

**Delivers**
- **Duplicate receipt** warning on upload: same merchant, date and total, or a near-identical
  receipt (rule-based match first, Gemini only for the borderline cases).
- **Unusually high amount** flag compared with the family's history for that merchant or overall
  (simple statistics, with Gemini writing the one-sentence explanation).
- **Repeatedly late payer** insight: shares paid late or still open past the due date, shown to
  the organiser as a neutral note, never as a shaming label.
- A review inbox listing flags, each dismissible.

**Tested by**
- Unit tests with the demo set (duplicate receipt, one outlier, one chronic late payer) and with
  data that must not flag (new merchant with few records, one late payment only).
- Playwright: upload the duplicate receipt and see the warning before invoices go out.

**Risks and open questions**
- False positives annoy users: conservative thresholds, always dismissible, always explainable.
- Tone: wording is factual ("paid 6 days after the due date on 3 of the last 4 receipts").
- A flagged duplicate must never block sending without an explicit override.

### 8. AI-written payment reminders (≈ 5–6 h)

**Delivers**
- A **Draft reminder** button on an open share: Gemini writes a short, polite, warm message
  using only amount, receipt date, due date and the organiser's chosen tone (friendly, neutral).
- The organiser edits and approves it; it goes out through the invoice reminder in PayPal
  (Invoicing remind API) with the text as the note, or is copied if the API does not allow it.
- A reminder history per share. Nothing is ever sent without the organiser pressing send.

**Tested by**
- Output checks: contains the right amount and date, no medical content, under a length limit,
  English only. Playwright flow from draft to sent.
- Sandbox: the invoice shows the reminder.

**Risks and open questions**
- Does the sandbox Invoicing remind endpoint accept a custom note and actually deliver it?
- The model inventing details: the prompt gets structured facts only and the result is validated
  against them.

### 9. Monthly family report (≈ 5–6 h)

**Delivers**
- A report page and a **Download PDF** for any month: total spent, share per member, paid versus
  open, top receipts, comparison with the previous month, and a short AI-written summary that
  restates only the computed figures.
- Optional: a CSV export of the month for accounting.

**Tested by**
- The numbers in the report are checked against the same functions the chat assistant uses.
- PDF opens correctly on a phone and on desktop; empty-month case; a month with a cancelled
  invoice.

**Risks and open questions**
- PDF generation on Cloud Run (headless Chrome is heavy; prefer a light PDF library).
- Fonts and non-ASCII characters in the PDF.

### 10. Final polish, final video and submission (≈ 8–10 h)

**Delivers**
- Feature freeze on **November 1** for phases 4–6 and **November 6** for the rest. After that only
  fixes.
- Performance and safety pass: input limits (image size and type), rate limits, error pages,
  secret scan of the full git history, dependency audit, Cloud Run limits and a cost cap.
- A scripted, rehearsed demo path and a re-recorded video, under 3 minutes, showing the whole
  loop: receipt photo → AI → split → invoices → in-app payment → webhook update → chat question →
  a flag or a report. Upload as public to YouTube.
- Updated README, architecture diagram, Devpost text and testing instructions. Final submission
  on **November 11**, with November 12 only as a safety buffer.

**Tested by**
- The phase 3 checklist again on the live URL in a private window, on a phone and a desktop.
- A cold deploy from a fresh clone. Judge walkthrough by a second person if possible.

**Risks and open questions**
- Sandbox outage or slow responses on demo day: keep a recorded video as the primary proof and
  seeded data so the app is explorable even if PayPal is slow.
- Gemini quota exhausted: demo receipts fall back to cached sample extractions.
- Feature creep. Anything not on this list after November 1 is written in "Future work".

## Ideas parked for later phases

**An AI assistant that acts through PayPal's own tools, always with confirmation (idea added Oct 3;
a later phase, after the chat assistant of phase 6 and the reminders of phase 8).** Today the chat
assistant of phase 6 only answers questions. This idea lets the family ask in plain words, for example
"invoice Ben and Clara for the September 28 receipt and remind whoever is late", and have the assistant
do it through PayPal's official Agent Toolkit / MCP server instead of our own invoice code.
- *What exists (checked Oct 3 by a quick search, to verify properly before building):* PayPal publishes an
  Agent Toolkit (`@paypal/agent-toolkit`, TypeScript and Python) and an MCP server (`@paypal/mcp`, plus
  hosted endpoints for the sandbox and for production). Its invoicing tools include create, list and get
  an invoice, send it, send a reminder and cancel a sent invoice; it has a sandbox mode.
- *Rules for us:* sandbox only; the assistant never sends, cancels or reminds on its own: it first shows
  the exact action (who, how much, which receipt) and waits for the organiser's "Confirm" (the toolkit
  does not ask for confirmation by itself, so the confirmation step is ours); only the family's own
  receipts and members are reachable; every action is written to a visible log; text on a receipt is data,
  never instructions to the assistant (prompt injection); the same per-visitor and daily limits apply.
- *To verify first:* how the toolkit authenticates (a short-lived access token from our client ID and
  secret), that the sandbox endpoint covers invoicing end to end, and whether invoices it creates carry
  the same status and links our own code reads. Our own PayPal client stays the source of truth for the app
  screens; the assistant is an additional way to trigger the same actions.
- *Why it helps the entry:* it makes PayPal central in a second, visible way (not only our code calling
  the API, but an AI agent using PayPal's agent tools) and shows responsible agent design (human in the
  loop, scoped tools, audit log). Cut it first if time is short; the demo works without it.

## Open decisions to settle in Phase 0

1. Currency for the demo (EUR or USD).
2. Firestore versus another store (default: Firestore).
3. License (default: MIT).
4. Whether sandbox buyer logins go in the public README and the Devpost testing instructions
   (default: yes, clearly marked sandbox only).
5. Whether the receipt images used for the demo are generated by us as images (default: yes,
   invented pharmacies and items, no real patient or pharmacy data).

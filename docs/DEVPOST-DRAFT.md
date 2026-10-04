# CareSplit: Devpost submission draft

> **Draft, not submitted.** Ready-to-paste texts for the Devpost form, written Oct 3, 2026. Fields in
> `[brackets]` still need a value from the owner. "Care credit" level 1 is now built (not yet deployed), so it is
> described under "What it does", "How PayPal is used" and "Innovation"; deploy before you submit. The demo video
> is recorded last, with Care credit in it.

## Project name

CareSplit

## Tagline (60 characters at most)

Split a parent's pharmacy costs with PayPal invoices

## Short description (200 characters at most)

Photograph a pharmacy receipt: AI reads it, the family splits it, and each sibling gets their share as a PayPal invoice. See who has paid. Fictional data, PayPal sandbox.

## Inspiration

When a parent needs regular medicines, one sibling usually pays at the pharmacy and the others "will pay
their part later". Later becomes a notes app, a spreadsheet and a few awkward messages: who owes what,
was it paid, which receipt was that? The amounts are small, but the friction is not, and it falls on the
sibling who is already doing the most. We wanted to make the money part boring, fair and finished in a minute.

## What it does

CareSplit turns a pharmacy receipt into paid-back money.

1. The organiser (the sibling who paid) photographs a receipt, or picks a built-in fictional sample.
2. AI reads the pharmacy, date, items, discounts, tax and total.
3. An editable review screen shows what was read, with a live **"Amounts add up"** check so a misread number is caught before it costs anyone money.
4. The family splits it: equal shares or custom percentages, set once for the family and adjustable for one receipt. Odd cents stay with the organiser, so no sibling is ever billed a cent too much. And there is a **care credit**: the sibling who gives time (pharmacy runs, appointments, time with the parent) can pay a smaller share, and the others share the difference.
5. After a confirmation, **one PayPal invoice per sibling** is created and sent.
6. The receipt page shows each share's status straight from PayPal. The organiser can cancel an invoice or record a payment made in cash or by bank transfer. Each sibling sees only their own share and their invoice.

Every visitor gets a private demo family with sample history, 2 to 4 editable members, filters by month and
status with totals, and a one-tap reset. It handles amounts and dates only: no medical advice, no health data.

## How PayPal is used

PayPal is the engine of the money flow, not a button at the end. We call the **PayPal Invoicing API v2**
from the server (sandbox, OAuth2): create a draft and send it for each sibling's exact share, read each
invoice back to show who paid, cancel an invoice, and record a payment made outside PayPal so the invoice
and the family's books agree. Details that make it trustworthy: an idempotency key and a saved draft id mean a
retry or a double click can never create a second invoice; before cancelling or recording a payment the app
asks PayPal for the invoice's real state, so it never cancels a paid invoice or records a payment twice; invoices can
only go to a fixed list of fictional sandbox buyer accounts; and the app refuses to talk to live PayPal.

## Innovation: care credit

Splitting costs is usually just arithmetic, but caring for a parent is also time. CareSplit lets a family agree that the
sibling who gives time pays a smaller part, and turns that agreement into a visible rule instead of an awkward conversation.
The family picks the main caregiver and a credit percentage; the caregiver pays their normal share less that credit, and the others
share the difference. The maths uses whole cents and always adds up to the total. On PayPal the credit is not hidden: the caregiver's
invoice shows their normal share with an **item discount** for the credit, and the app refuses to send any invoice whose total
is not exactly the agreed share. The caregiver sees a thank-you, the organiser sees the credit on every receipt and on the dashboard,
and the agreement is visible to everyone in the family. It records amounts and time only: no health information and no medical claims.

## How AI is used

**Gemini** reads the receipt photo with a JSON schema, so the answer is structured data. The model is told to
ignore patient names, prescriptions and doses, and to treat text on the receipt as data, never as instructions.
The AI is never trusted blindly: the app re-checks the arithmetic in whole cents and the human confirms every
receipt. The server tries a fast model first and falls back through three larger ones, retrying temporary
overloads, so reading takes about a second and degrades gracefully; manual entry always works. The photo exists
only in memory for one request and is never stored. All six demo receipts, including a tilted, grainy phone photo,
are read correctly by an automated check.

**An assistant for the organiser** (Gemini function calling, its own model so receipt reading keeps its quota) answers questions about
receipts, who owes what and care credit, with every number worked out in code. It can only *propose* a reminder, a payment note,
a cancellation or sending the unsent invoices: the proposal is a card, and nothing happens until the organiser presses Confirm.
The server re-checks the real state, runs it once, and receipt text it reads is treated as data, never as instructions.

**PayPal Agent Toolkit: evaluated, not used.** We tried `@paypal/agent-toolkit` in the sandbox for reminders and cancellations.
Cancel worked, but the reminder call returns an empty answer (no success signal), both tools accept free-typed extra recipient
addresses, it knows nothing about families or confirmation, and it brings a large dependency tree (high-severity advisories in a
scratch install) for two REST calls we already make, test and scope to the family. So the assistant uses our own tools.

## How we built it (tools and how each was used)

- **PayPal Invoicing API v2 (sandbox):** create, send, read, cancel and settle one invoice per sibling.
- **Gemini API (vision, structured output):** receipt reading, with model fallback and retries.
- **Google Cloud Run:** one container serves the web app and the API; scales to zero; at most 2 instances.
- **Cloud Build and Artifact Registry:** build and keep the container image.
- **Firestore (with TTL):** each visitor's private family and receipts, deleted automatically after 7 days.
- **Secret Manager and IAM:** the PayPal and Gemini keys; a dedicated service account that can read only those three secrets and only our database.
- **React 19, Vite, Tailwind CSS, TypeScript:** a mobile-first interface with accessibility basics (labels, focus, contrast, keyboard use).
- **Fastify 5 on Node 24:** the API: validation, per-visitor limits, PayPal and Gemini calls.
- **Vitest and jsdom:** 249 automated tests, including a fake PayPal that can fail halfway.
- **Claude Code (Anthropic):** pair-programmed the whole project. The author set the goals and rules, approved each step and every cloud change, and tested on the live app; Claude Code planned, wrote and tested the code and ran the deployments only after approval. Every commit carries its `Co-Authored-By` line.

## Challenges we ran into

- **PayPal's Invoicing permission** only appeared on a sandbox app linked to a **US** Business account; the same setting on an app linked to a Romanian Business account kept answering `403 NOT_AUTHORIZED`. We found it by reading the token's scopes.
- **AI quotas are per model.** The free tier gave each model a small daily quota, and a day of testing used up three of them. A fast "lite" model first, plus a fallback chain that skips an exhausted model at once, fixed it.
- **Never billing twice.** Sending is several steps against a remote service. Every step is saved before the next one starts, and tests simulate a failure halfway and a double click.
- **Fair cents.** Splitting money into thirds leaves odd cents. We use whole cents everywhere and let the organiser absorb the remainder, so a sibling never pays more than their share.
- **A public demo that stays safe.** Private per-visitor families, rate limits that cannot be dodged with a fake header, photos never stored, fictional data only, and automatic deletion.

## Accomplishments we are proud of

A complete, hosted, working loop (photo to paid invoice) that a stranger can try in three minutes; AI used where
it helps and checked where it matters; PayPal used for real, with the failure cases handled; and a codebase with 249
tests and an honest list of limitations.

## What we learned

Read the permissions in the token, not just the settings page. Make every remote step safe to repeat. Show the human
what the AI read and let them correct it. And a calm, boring screen is the right design for money between family members.

## What's next

**A care log** that suggests the care credit from the hours each person gives (the next level of care credit), then paying inside the app with PayPal Checkout,
(PayPal webhooks and the assistant are already built), 
through PayPal's agent tools, always with confirmation), checks for duplicate or unusual receipts, and a downloadable monthly report.

## Built with (tags)

paypal, paypal-invoicing-api, gemini-api, google-cloud-run, cloud-build, artifact-registry, firestore, secret-manager,
react, typescript, vite, tailwindcss, fastify, node.js, vitest, claude-code

## Links

- Try it: https://caresplit-30747896454.europe-west4.run.app
- Code (public, MIT): https://github.com/iancuileana83-lab/caresplit
- Demo video (YouTube, under 3 minutes): `[add the link after recording]`

## Testing instructions (for the Devpost "testing" field)

No account is needed. Opening the link creates a private demo family (Anna, Ben, Clara) with sample receipts, visible only to your browser.

1. **Add receipt** → **Try a sample** → choose one (the tilted phone photo is a good test) and wait a few seconds.
2. On **Review**, change an amount and watch **"Amounts add up"** turn into a warning, then fix it. **Continue**.
3. On **Split & send**, try **Custom percentages** (for example 50 / 30 / 20), then **Send PayPal invoices** and confirm. Real invoices are created in the PayPal **sandbox**.
4. On the receipt: **View invoice** opens the PayPal sandbox invoice page; **Mark as paid** (cash) or **Cancel invoice** change the invoice in PayPal; **Refresh status** reads PayPal's state back.
5. **View as Ben / Clara** (top of the page) shows what a sibling sees: only their own share and invoice.
6. **Family** lets you rename people, add a fourth, change the split, or **Reset demo**. Tick **Care credit**, pick Ben and 25 %, save, then add a receipt: **Split & send** shows Ben's share dropping and the others' rising, and Ben's invoice carries the credit as a discount.

To pay an invoice yourself, sign in at https://sandbox.paypal.com with a fictional buyer account:
`[add the four sandbox buyer logins here: Ben's and Clara's are the ones invoices go to by default]`.
These are test accounts only; please do not use real PayPal accounts. Please upload only the sample or made-up receipts.
If the AI is busy, choose "Enter it by hand". Demo limits: 6 receipt readings and 6 PayPal actions per minute per visitor.

## Data and privacy note

All data is fictional and PayPal runs in the sandbox. Receipt photos are processed in memory for one request and never stored.
No health information is kept and no medical advice is given. Each demo family is private to its browser and deleted after 7 days.

## Requirement checklist

| Requirement | Where it is met |
|---|---|
| PayPal central and meaningfully used | Invoicing API v2: one invoice per sibling, status read back, cancel, record external payment |
| AI meaningfully used | Gemini reads receipts into structured data, checked by arithmetic and by the user |
| Working hosted demo | https://caresplit-30747896454.europe-west4.run.app (Google Cloud Run) |
| Public repository, source, run instructions, visible open-source license | https://github.com/iancuileana83-lab/caresplit, README "Run it locally" and "Deploy", MIT `LICENSE` |
| Public YouTube video under 3 minutes | `[to record after Care credit]` |
| Description of the tools and how each was used | "How we built it" above and the README table |

## Before you submit

- [ ] Record the video (script: the 6 steps above, plus Care credit) and add the link.
- [ ] Add the sandbox buyer logins to the testing field (and nowhere in the repo).
- [ ] Take 3 to 4 screenshots (Dashboard, Review with "Amounts add up", Split with percentages, Receipt with invoices) for the Devpost gallery and the README.
- [ ] Re-read the official rules for eligibility, categories and exact required fields.
- [ ] Open the live link in a private window and run the testing steps once more; check the repo shows the license.

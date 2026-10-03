# Demo receipts

**All data here is fictional.** The pharmacies, addresses, phone numbers, products, card
digits and amounts were invented for CareSplit. Any resemblance to a real shop is
accidental. There are no people's names, no prescriptions and no health data on them.

| File | What it tests |
|---|---|
| `01-simple.png` | Two items, no tax |
| `02-many-items.png` | Twelve items, one with a quantity, long list |
| `03-discount.png` | Member discount and a coupon, `$` instead of `USD` |
| `04-tax.png` | Sales tax line (8.25 %) |
| `05-phone-photo.png` | Tilted, soft, grainy, like a quick phone photo; two-digit year |
| `06-non-drug.png` | Non-medicine items (card, bottle, chocolate) on the same receipt |

`expected.json` holds the exact values printed on each receipt (ground truth for tests).
Regenerate everything with `powershell -NoProfile -File demo/make-demo-receipts.ps1`.

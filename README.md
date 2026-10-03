# CareSplit

Siblings who share the pharmacy costs of an elderly parent: photograph a receipt, AI reads
the amounts, the app splits the total and sends each sibling a PayPal invoice.

Built for the PayPal AI Hackathon. Work in progress. Amounts and dates only, no medical
advice. All demo data is fictional and PayPal runs in the sandbox.

Status: runs locally. You can photograph a receipt (or pick a built-in fictional sample), let
Gemini read it, correct the result on the Review screen, see the equal split, and send one
PayPal sandbox invoice to each sibling after a confirmation. Receipts are saved (in memory, or in
Firestore with `DATA_STORE=firestore`), and "Refresh status" reads the invoices' status from PayPal.
See [ROADMAP.md](ROADMAP.md) for what comes next.

## Run it locally

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev` starts the API (port 3001) and the web app
(port 5173) together; the web app reloads when you save a file. (In Windows PowerShell, if
scripts are blocked, use `npm.cmd` instead of `npm`.)

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the tests |
| `npm run typecheck` | Checks the TypeScript types |
| `npm run build` | Builds the web app and the server into `dist/` |
| `npm start` | Runs the built app on http://localhost:3001 |

Keys (PayPal sandbox, Gemini) go in a local `.env` file, copied from `.env.example`. The file is
git-ignored and is never committed. Sending invoices needs the PayPal sandbox Client ID and Secret
of a Business sandbox account with the Invoicing feature (a US account worked; a Romanian one did
not). Reading receipts needs `GEMINI_API_KEY` (a free key from
https://aistudio.google.com/apikey); without it you can still type a receipt in by hand. With the
server running, `node demo/verify-reading.mjs` checks the six sample receipts against their known values.

## License

MIT, see [LICENSE](LICENSE).

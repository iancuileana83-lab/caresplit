# CareSplit

Siblings who share the pharmacy costs of an elderly parent: photograph a receipt, AI reads
the amounts, the app splits the total and sends each sibling a PayPal invoice.

Built for the PayPal AI Hackathon. Work in progress. Amounts and dates only, no medical
advice. All demo data is fictional and PayPal runs in the sandbox.

Status: the app skeleton runs locally with demo data (family, receipts, a "View as" switcher).
Receipt reading with Gemini and PayPal invoices are being added next; see [ROADMAP.md](ROADMAP.md).

## Run it locally

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev` starts the API (port 3001) and the web app
(port 5173) together; the web app reloads when you save a file.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the tests |
| `npm run typecheck` | Checks the TypeScript types |
| `npm run build` | Builds the web app and the server into `dist/` |
| `npm start` | Runs the built app on http://localhost:3001 |

Keys (PayPal sandbox, Gemini) will go in a local `.env` file, copied from `.env.example`. The
file is git-ignored and is never committed. The skeleton needs no keys yet.

## License

MIT, see [LICENSE](LICENSE).

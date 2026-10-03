// Phase 0 placeholder: a tiny "hello" server for the first Cloud Run deploy.
// Phase 1 replaces it with the real TypeScript app. No secrets are read here.
import { createServer } from 'node:http';

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CareSplit</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 34rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; color: #1d2b2a; }
  h1 { margin-bottom: .25rem; }
  .muted { color: #55635f; }
</style>
</head>
<body>
<h1>CareSplit</h1>
<p>Siblings who share the pharmacy costs of an elderly parent: photograph a receipt, AI reads
the amounts, the app splits the total and sends each sibling a PayPal invoice.</p>
<p class="muted">Work in progress for the PayPal AI Hackathon. Amounts and dates only, no medical
advice. All demo data is fictional and PayPal runs in the sandbox.</p>
</body>
</html>`;

const server = createServer((req, res) => {
  // Not /healthz: Cloud Run's front end answers that path itself with a 404.
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
});

server.listen(Number(process.env.PORT) || 8080, () => console.log('caresplit hello listening'));

// Lists Gemini models that support generateContent (names only; never prints the key).
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY missing in .env');
const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
  headers: { 'x-goog-api-key': key },
});
const json = await res.json();
if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json.error ?? json)}`);
for (const m of json.models) {
  if (m.supportedGenerationMethods?.includes('generateContent')) console.log(m.name.replace('models/', ''));
}

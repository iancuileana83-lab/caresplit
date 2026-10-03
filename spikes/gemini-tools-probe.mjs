// Spike: do our Gemini models support function calling, and what daily quota does each model have?
// Sends one tiny request per model asking it to call a made-up tool. Prints status, whether it called the tool,
// whether the answer carries a thought signature, and the quota numbers Google reports when a model is out of quota.
// Usage: node --env-file=.env spikes/gemini-tools-probe.mjs model1 model2 ...
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY missing in .env');

const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_total_spent',
        description: 'Returns the total spent by the family in a month.',
        parameters: { type: 'OBJECT', properties: { month: { type: 'STRING', description: 'YYYY-MM' } }, required: ['month'] },
      },
    ],
  },
];

for (const model of process.argv.slice(2)) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'You help a family with pharmacy costs. Use the tools to answer.' }] },
      contents: [{ role: 'user', parts: [{ text: 'How much did we spend in September 2026?' }] }],
      tools,
      generationConfig: { temperature: 0 },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    const quota = JSON.stringify(json.error?.details ?? []).match(/"quotaValue":"?(\d+)"?/g) ?? [];
    const ids = JSON.stringify(json.error?.details ?? []).match(/"quotaId":"([^"]+)"/g) ?? [];
    console.log(model.padEnd(24), res.status, String(json.error?.message ?? '').slice(0, 60).replace(/\n/g, ' '), '|', ids.join(' '), quota.join(' '));
    continue;
  }
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const call = parts.find((p) => p.functionCall);
  console.log(
    model.padEnd(24),
    res.status,
    call ? `called ${call.functionCall.name}(${JSON.stringify(call.functionCall.args)})` : `no tool call, text: ${parts.map((p) => p.text).join('').slice(0, 60)}`,
    '| thoughtSignature:', parts.some((p) => p.thoughtSignature) ? 'yes' : 'no',
    '| tokens:', json.usageMetadata?.totalTokenCount,
  );
}

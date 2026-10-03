// Talks to Gemini with function calling. Same care as the receipt reader: a chain of models, 503s are retried,
// a used-up quota (429) or a missing model (404) moves on to the next model. The key stays on the server.

/** A piece of a message. Kept exactly as Gemini sent it (it may carry a thought signature that must be sent back). */
export type Part = Record<string, unknown>;
export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export type ChatErrorCode = 'not_configured' | 'busy' | 'service';
export class ChatError extends Error {
  constructor(
    public code: ChatErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ModelRequest {
  system: string;
  contents: Content[];
  tools: unknown[];
}

export interface ModelReply {
  /** Exactly what the model said, to put back into the conversation before the next call. */
  content: Content;
  text: string;
  calls: { name: string; args: unknown }[];
  model: string;
}

export interface ChatModel {
  generate(request: ModelRequest): Promise<ModelReply>;
}

export interface ChatModelConfig {
  apiKey?: string;
  models: string[];
  attemptsPerModel?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Called for every request sent to Gemini (to count the quota used). */
  onRequest?: (model: string) => void;
}

/** Fast model first (own quota), then a second lite model, then a larger one. */
export const DEFAULT_CHAT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'];

const RETRYABLE = new Set([500, 502, 503, 504]);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createChatModel(config: ChatModelConfig): ChatModel {
  const attemptsPerModel = config.attemptsPerModel ?? 2;
  const timeoutMs = config.timeoutMs ?? 30_000;
  const doFetch = config.fetchFn ?? fetch;
  const sleep = config.sleep ?? defaultSleep;

  return {
    async generate(request) {
      if (!config.apiKey) throw new ChatError('not_configured', 'The assistant is not set up on this server');
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: request.contents,
        tools: request.tools,
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      });

      for (const model of config.models) {
        for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
          let res: Response;
          try {
            config.onRequest?.(model);
            res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
              method: 'POST',
              headers: { 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' },
              body,
              signal: AbortSignal.timeout(timeoutMs),
            });
          } catch {
            if (attempt < attemptsPerModel) await sleep(800 * attempt);
            continue;
          }

          if (res.ok) {
            const json = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
            const parts = json.candidates?.[0]?.content?.parts ?? [];
            const calls = parts.flatMap((p) => {
              const fc = p.functionCall as { name?: unknown; args?: unknown } | undefined;
              return fc && typeof fc.name === 'string' ? [{ name: fc.name, args: fc.args ?? {} }] : [];
            });
            const text = parts
              .filter((p) => typeof p.text === 'string' && p.thought !== true)
              .map((p) => p.text as string)
              .join('');
            return { content: { role: 'model', parts }, text, calls, model };
          }

          if (res.status === 404 || res.status === 429) break; // gone, or its quota is used up: next model
          if (RETRYABLE.has(res.status)) {
            if (attempt < attemptsPerModel) await sleep(800 * attempt);
            continue;
          }
          throw new ChatError('service', `The AI service refused the request (${res.status})`);
        }
      }
      throw new ChatError('busy', 'The AI service is busy right now');
    },
  };
}

export function chatModelFromEnv(env: NodeJS.ProcessEnv, onRequest?: (model: string) => void): ChatModel {
  const fromEnv = env.GEMINI_CHAT_MODELS?.split(',').map((m) => m.trim()).filter(Boolean);
  return createChatModel({ apiKey: env.GEMINI_API_KEY || undefined, models: fromEnv?.length ? fromEnv : DEFAULT_CHAT_MODELS, onRequest });
}

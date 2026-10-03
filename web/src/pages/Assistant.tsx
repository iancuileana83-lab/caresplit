import { CircleAlert, CircleCheck, LoaderCircle, SendHorizontal, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AssistantAction, AssistantReply, AssistantTurn } from '../../../shared/types';
import { Card, ErrorNote, LoadingNote } from '../components/Card';
import { postJson, useApi } from '../lib/api';
import { useViewAs } from '../lib/view-as';

const SUGGESTIONS = ['Who hasn\'t paid yet?', 'How much did we spend this month?', 'What was the biggest receipt?', 'How much care credit has been given?'];
const MAX_CHARS = 500;
const SENT_TURNS = 10;

interface Message extends AssistantTurn {
  id: number;
  /** Ids of the cards the assistant made with this answer. */
  cardIds?: string[];
}

/** A card nobody confirmed in time counts as expired, even before the server is asked. */
export function effectiveStatus(action: AssistantAction, now: number): AssistantAction['status'] {
  return action.status === 'pending' && Date.parse(action.confirmBy) <= now ? 'expired' : action.status;
}

const STATUS_TEXT: Record<AssistantAction['status'], string> = {
  pending: 'Waiting for you',
  running: 'Working on it…',
  done: 'Done',
  failed: 'Did not work',
  dismissed: 'Dismissed',
  expired: 'Expired. Ask again if you still want it.',
};

function ActionCard({ action, now, busy, onConfirm, onDismiss }: { action: AssistantAction; now: number; busy: boolean; onConfirm: () => void; onDismiss: () => void }) {
  const status = effectiveStatus(action, now);
  const pending = status === 'pending';
  return (
    <section aria-label={action.title} className={`rounded-xl border px-3 py-3 ${pending ? 'border-teal-600 bg-teal-50' : 'border-line bg-stone-50'}`}>
      <h3 className="text-sm font-semibold text-ink">{action.title}</h3>
      <ul className="mt-1.5 space-y-0.5 text-sm text-quiet">
        {action.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {pending ? (
        <>
          <p className="mt-2 text-xs text-quiet">Nothing happens until you press Confirm. This card expires in a few minutes.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={onConfirm} className="min-h-11 flex-1 rounded-xl bg-teal-700 px-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60">
              {busy ? 'Working…' : 'Confirm'}
            </button>
            <button type="button" disabled={busy} onClick={onDismiss} className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-medium hover:bg-stone-50 disabled:opacity-60">
              Dismiss
            </button>
          </div>
        </>
      ) : (
        <p role="status" className={`mt-2 flex items-start gap-1.5 text-sm font-medium ${status === 'done' ? 'text-green-700' : status === 'failed' ? 'text-red-700' : 'text-quiet'}`}>
          {status === 'done' && <CircleCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          {status === 'failed' && <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span>{action.result && (status === 'done' || status === 'failed') ? action.result : STATUS_TEXT[status]}</span>
        </p>
      )}
    </section>
  );
}

export function Assistant() {
  const { viewer } = useViewAs();
  if (viewer.role !== 'organiser') {
    return (
      <Card>
        <h1 className="text-lg font-semibold">Assistant</h1>
        <p className="mt-1 text-sm text-quiet">The assistant works for the organiser. Switch to the organiser in "View as" to use it.</p>
      </Card>
    );
  }
  return <Chat viewerId={viewer.id} />;
}

function Chat({ viewerId }: { viewerId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [cards, setCards] = useState<Record<string, AssistantAction>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [logVersion, setLogVersion] = useState(0);
  const nextId = useRef(1);
  const end = useRef<HTMLDivElement>(null);
  const log = useApi<AssistantAction[]>(`/api/assistant/actions?as=${viewerId}&v=${logVersion}`);

  // Cards that wait for a Confirm are checked against the clock every few seconds.
  const waiting = Object.values(cards).some((a) => a.status === 'pending');
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, sending]);

  const remember = (action: AssistantAction) => setCards((prev) => ({ ...prev, [action.id]: action }));

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean || sending) return;
    const mine: Message = { id: nextId.current++, role: 'user', text: clean };
    const history = [...messages, mine];
    setMessages(history);
    setDraft('');
    setError(null);
    setSending(true);
    try {
      const answer = await postJson<AssistantReply>(`/api/assistant/chat?as=${viewerId}`, { messages: history.slice(-SENT_TURNS).map(({ role, text: t }) => ({ role, text: t })) });
      answer.actions.forEach(remember);
      setNow(Date.now());
      setMessages((prev) => [...prev, { id: nextId.current++, role: 'assistant', text: answer.reply, cardIds: answer.actions.map((a) => a.id) }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  async function step(card: AssistantAction, what: 'confirm' | 'dismiss') {
    setBusyCard(card.id);
    try {
      const result = await postJson<{ action: AssistantAction }>(`/api/assistant/actions/${encodeURIComponent(card.id)}/${what}?as=${viewerId}`);
      remember(result.action);
    } catch (err) {
      // the server's reason is shown on the card (for example "took too long to confirm")
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      remember({ ...card, status: 'failed', result: `${message} Nothing was changed.` });
    } finally {
      setBusyCard(null);
      setLogVersion((n) => n + 1);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  const shownIds = new Set(Object.keys(cards));
  const older = log.status === 'ready' ? log.data.filter((a) => !shownIds.has(a.id) && effectiveStatus(a, now) !== 'pending') : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Assistant</h1>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-quiet">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
          <span>Ask about your receipts, who owes what and care credit. It can prepare a reminder, a payment note or a cancellation, but nothing happens until you press Confirm. Amounts and dates only. It can make mistakes.</span>
        </p>
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Try asking">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" disabled={sending} onClick={() => void ask(s)} className="min-h-11 rounded-full border border-line bg-white px-3.5 text-sm hover:bg-stone-50 disabled:opacity-60">
              {s}
            </button>
          ))}
        </div>
      )}

      <div role="log" aria-live="polite" aria-label="Conversation" className="space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'space-y-2'}>
            <p className={m.role === 'user' ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl bg-teal-700 px-3.5 py-2 text-[15px] text-white' : 'whitespace-pre-wrap rounded-2xl border border-line bg-white px-3.5 py-2 text-[15px]'}>
              <span className="sr-only">{m.role === 'user' ? 'You: ' : 'Assistant: '}</span>
              {m.text}
            </p>
            {m.cardIds?.map((id) => {
              const card = cards[id];
              return card ? <ActionCard key={id} action={card} now={now} busy={busyCard === id} onConfirm={() => void step(card, 'confirm')} onDismiss={() => void step(card, 'dismiss')} /> : null;
            })}
          </div>
        ))}
        {sending && (
          <p role="status" className="flex items-center gap-2 text-sm text-quiet">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Thinking…
          </p>
        )}
        <div ref={end} />
      </div>

      {error && <ErrorNote message={error} />}

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label className="flex-1">
          <span className="sr-only">Your question</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(draft);
              }
            }}
            maxLength={MAX_CHARS}
            rows={2}
            placeholder="Ask about your receipts…"
            className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-base"
          />
        </label>
        <button type="submit" disabled={sending || draft.trim() === ''} aria-label="Send" className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50">
          <SendHorizontal size={20} aria-hidden="true" />
        </button>
      </form>

      <section aria-labelledby="recent-actions">
        <h2 id="recent-actions" className="mb-2 text-sm font-semibold text-quiet">
          Recent actions
        </h2>
        {log.status === 'loading' && <LoadingNote />}
        {log.status === 'error' && <p className="text-sm text-quiet">The list of recent actions is not available right now.</p>}
        {log.status === 'ready' && older.length === 0 && <p className="text-sm text-quiet">Nothing yet. Actions you confirm or dismiss appear here.</p>}
        <ul className="space-y-2">
          {older.map((a) => (
            <li key={a.id}>
              <ActionCard action={a} now={now} busy={false} onConfirm={() => {}} onDismiss={() => {}} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

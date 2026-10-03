// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantAction, FamilyView } from '../../../shared/types';
import { ViewAsProvider } from '../lib/view-as';
import { Assistant, effectiveStatus } from './Assistant';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const family: FamilyView = {
  name: 'Rowan family',
  members: [
    { id: 'anna', name: 'Anna', role: 'organiser', accountId: 'buyer-a' },
    { id: 'ben', name: 'Ben', role: 'member', accountId: 'buyer-b' },
  ],
  splitRule: { type: 'equal' },
  careCredit: null,
  accounts: [],
};

const card = (over: Partial<AssistantAction> = {}): AssistantAction => ({
  id: 'card-1',
  kind: 'reminder',
  title: 'Send Ben a reminder',
  lines: ['Receipt: Green Leaf Pharmacy, 2026-10-02', 'Amount: $3.24'],
  status: 'pending',
  confirmBy: new Date(Date.now() + 5 * 60_000).toISOString(),
  ...over,
});

let container: HTMLDivElement;
let root: Root;
let calls: { url: string; method: string; body?: string }[];
let routes: Record<string, (body?: string) => { status?: number; json: unknown }>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  calls = [];
  localStorage.clear();
  routes = { '/api/family': () => ({ json: family }), '/api/assistant/actions': () => ({ json: [] }) };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.split('?')[0];
      calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined });
      const route = routes[path] ?? Object.entries(routes).find(([k]) => path.startsWith(k))?.[1];
      if (!route) return new Response(JSON.stringify({ error: 'no route' }), { status: 404 });
      const out = route(init.body as string | undefined);
      return new Response(JSON.stringify(out.json), { status: out.status ?? 200 });
    }),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const text = () => container.textContent ?? '';
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label || b.getAttribute('aria-label') === label)!;

async function open(viewer = 'anna') {
  localStorage.setItem('caresplit:view-as', viewer);
  await act(async () => root.render(<MemoryRouter><ViewAsProvider><Assistant /></ViewAsProvider></MemoryRouter>));
  await settle();
}

async function type(value: string) {
  const area = container.querySelector('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(area, value);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Assistant page', () => {
  it('is for the organiser: a sibling sees an explanation and no chat', async () => {
    await open('ben');
    expect(text()).toContain('works for the organiser');
    expect(container.querySelector('textarea')).toBeNull();
    expect(calls.some((c) => c.url.startsWith('/api/assistant'))).toBe(false);
  });

  it('offers suggestions, sends a question and shows the answer', async () => {
    routes['/api/assistant/chat'] = () => ({ json: { reply: 'Ben owes $3.24.', actions: [] } });
    await open();
    expect(text()).toContain("Who hasn't paid yet?");
    await act(async () => button("Who hasn't paid yet?").click());
    await settle();
    expect(text()).toContain('Ben owes $3.24.');
    const chat = calls.find((c) => c.url.startsWith('/api/assistant/chat'))!;
    expect(chat.url).toContain('as=anna');
    expect(JSON.parse(chat.body!)).toEqual({ messages: [{ role: 'user', text: "Who hasn't paid yet?" }] });
    expect(text()).not.toContain('How much care credit'); // suggestions go once a conversation starts
  });

  it('sends the earlier turns too, and keeps the Send button off for an empty box', async () => {
    routes['/api/assistant/chat'] = () => ({ json: { reply: 'Answer', actions: [] } });
    await open();
    expect((button('Send') as HTMLButtonElement).disabled).toBe(true);
    await type('first');
    await act(async () => button('Send').click());
    await settle();
    await type('second');
    await act(async () => button('Send').click());
    await settle();
    const last = JSON.parse(calls.filter((c) => c.url.startsWith('/api/assistant/chat')).at(-1)!.body!);
    expect(last.messages.map((m: { text: string }) => m.text)).toEqual(['first', 'Answer', 'second']);
  });

  it('shows a card, and nothing is sent to the confirm endpoint until Confirm is pressed (then once)', async () => {
    routes['/api/assistant/chat'] = () => ({ json: { reply: 'A card for Ben is ready.', actions: [card()] } });
    routes['/api/assistant/actions/card-1/confirm'] = () => ({ json: { action: card({ status: 'done', result: 'Reminder sent to Ben through PayPal.' }) } });
    await open();
    await type('Remind Ben');
    await act(async () => button('Send').click());
    await settle();
    expect(text()).toContain('Send Ben a reminder');
    expect(text()).toContain('Nothing happens until you press Confirm');
    expect(calls.some((c) => c.url.includes('/confirm'))).toBe(false);

    await act(async () => button('Confirm').click());
    await settle();
    expect(calls.filter((c) => c.url.includes('/confirm'))).toHaveLength(1);
    expect(text()).toContain('Reminder sent to Ben through PayPal.');
    expect(button('Confirm')).toBeUndefined(); // no second chance on a finished card
  });

  it('Dismiss closes a card without confirming', async () => {
    routes['/api/assistant/chat'] = () => ({ json: { reply: 'Ready.', actions: [card()] } });
    routes['/api/assistant/actions/card-1/dismiss'] = () => ({ json: { action: card({ status: 'dismissed', result: 'Dismissed.' }) } });
    await open();
    await type('Remind Ben');
    await act(async () => button('Send').click());
    await settle();
    await act(async () => button('Dismiss').click());
    await settle();
    expect(text()).toContain('Dismissed');
    expect(calls.some((c) => c.url.includes('/confirm'))).toBe(false);
  });

  it('shows the server reason on the card when Confirm is refused (for example, too late)', async () => {
    routes['/api/assistant/chat'] = () => ({ json: { reply: 'Ready.', actions: [card()] } });
    routes['/api/assistant/actions/card-1/confirm'] = () => ({ status: 410, json: { error: 'That action took too long to confirm. Ask again.' } });
    await open();
    await type('Remind Ben');
    await act(async () => button('Send').click());
    await settle();
    await act(async () => button('Confirm').click());
    await settle();
    expect(text()).toContain('took too long to confirm');
    expect(text()).toContain('Nothing was changed');
  });

  it('shows a calm message when the assistant is unavailable', async () => {
    routes['/api/assistant/chat'] = () => ({ status: 503, json: { error: 'The AI service is busy right now. Try again in a moment, or use the buttons in the app.' } });
    await open();
    await type('hello');
    await act(async () => button('Send').click());
    await settle();
    expect(container.querySelector('[role=alert]')!.textContent).toContain('busy right now');
  });

  it('lists earlier actions from the server under Recent actions', async () => {
    routes['/api/assistant/actions'] = () => ({ json: [card({ id: 'old', status: 'done', result: 'Reminder sent to Ben through PayPal.' })] });
    await open();
    expect(text()).toContain('Recent actions');
    expect(text()).toContain('Reminder sent to Ben through PayPal.');
  });
});

describe('effectiveStatus', () => {
  it('turns an unconfirmed card into expired once its time is up, and leaves other states alone', () => {
    const pending = card({ confirmBy: '2026-10-04T10:05:00Z' });
    expect(effectiveStatus(pending, Date.parse('2026-10-04T10:04:59Z'))).toBe('pending');
    expect(effectiveStatus(pending, Date.parse('2026-10-04T10:05:00Z'))).toBe('expired');
    expect(effectiveStatus({ ...pending, status: 'done' }, Date.parse('2026-10-05T00:00:00Z'))).toBe('done');
  });
});

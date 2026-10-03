// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member, ReceiptView } from '../../../shared/types';
import { ErrorNote } from './Card';
import { EmptyState } from './EmptyState';
import { ErrorBoundary } from './ErrorBoundary';
import { ReceiptList } from './ReceiptList';
import { Receipt } from 'lucide-react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const render = (node: ReactNode) => act(() => root.render(<MemoryRouter>{node}</MemoryRouter>));
const text = () => container.textContent ?? '';

function Boom(): ReactNode {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('shows the children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>All fine</p>
      </ErrorBoundary>,
    );
    expect(text()).toBe('All fine');
  });

  it('replaces a crashing screen with a calm message and two ways out', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const alert = container.querySelector('[role=alert]')!;
    expect(alert.textContent).toContain('Something went wrong on this screen');
    expect(alert.textContent).toContain('Your receipts are safe');
    expect([...container.querySelectorAll('button, a')].map((e) => e.textContent)).toEqual(['Reload the page', 'Go to the start']);
    expect(text()).not.toContain('kaboom'); // the technical detail is not shown to the visitor
  });
});

describe('ErrorNote', () => {
  it('offers a retry button that works', () => {
    const retry = vi.fn();
    render(<ErrorNote message="Couldn't reach the server" onRetry={retry} />);
    expect(container.querySelector('[role=alert]')!.textContent).toContain("Couldn't reach the server.");
    act(() => container.querySelector('button')!.click());
    expect(retry).toHaveBeenCalledOnce();
  });

  it('asks for a reload when there is no retry, and does not double the full stop', () => {
    render(<ErrorNote message="Something broke." />);
    expect(text()).toContain('Something broke.');
    expect(text()).not.toContain('..');
    expect(text()).toContain('Reload the page to try again.');
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('invites with a title, a sentence and one action', () => {
    render(
      <EmptyState icon={Receipt} title="Start your first receipt" action={{ to: '/add', label: 'Add receipt' }}>
        Photograph a receipt.
      </EmptyState>,
    );
    expect(text()).toContain('Start your first receipt');
    expect(text()).toContain('Photograph a receipt.');
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/add');
  });
});

describe('ReceiptList empty states', () => {
  const organiser: Member = { id: 'anna', name: 'Anna', role: 'organiser' };
  const sibling: Member = { id: 'ben', name: 'Ben', role: 'member' };

  it('invites the organiser to add the first receipt', () => {
    render(<ReceiptList receipts={[]} viewer={organiser} />);
    expect(text()).toContain('Start your first receipt');
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/add');
  });

  it('tells a sibling there is nothing to pay, without offering to add receipts', () => {
    render(<ReceiptList receipts={[]} viewer={sibling} />);
    expect(text()).toContain('Nothing to pay yet');
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows a custom message when a filter hides everything', () => {
    render(<ReceiptList receipts={[]} viewer={organiser} empty={<p>No receipts match these filters.</p>} />);
    expect(text()).toBe('No receipts match these filters.');
  });

  it('lists receipts with a text status, not just a colour', () => {
    const receipts: ReceiptView[] = [{ id: 'r1', merchant: 'Green Leaf', date: '2026-10-02', payerId: 'anna', totalCents: 1000, shares: [{ memberId: 'ben', amountCents: 500, status: 'SENT' }] }];
    render(<ReceiptList receipts={receipts} viewer={organiser} />);
    expect(text()).toContain('Green Leaf');
    expect(text()).toContain('0 of 1 paid');
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/receipts/r1');
  });
});

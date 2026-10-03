import { Home, Receipt, Users, WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOnline } from '../lib/online';
import { useViewAs } from '../lib/view-as';
import { Logo } from './Logo';
import { ViewAsSwitch } from './ViewAsSwitch';

const tabs = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/receipts', label: 'Receipts', icon: Receipt, end: false },
  { to: '/family', label: 'Family', icon: Users, end: false },
];

/** The tab title for the page being shown. */
function titleFor(pathname: string): string {
  if (pathname === '/') return 'Home';
  if (pathname.startsWith('/receipts/')) return 'Receipt';
  if (pathname === '/receipts') return 'Receipts';
  if (pathname === '/family') return 'Family';
  if (pathname === '/add') return 'Add receipt';
  if (pathname === '/add/split') return 'Split and send';
  return 'Page not found';
}

export function Layout() {
  const { family } = useViewAs();
  const online = useOnline();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // A new screen starts at the top and is announced to screen readers: move focus to the content.
  useEffect(() => {
    document.title = `${titleFor(pathname)} · CareSplit`;
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <a
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-teal-800 focus:shadow"
      >
        Skip to the content
      </a>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <Logo />
          <span className="text-xs text-quiet">{family.name}</span>
        </header>
        {!online && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-xl bg-amber-100 px-3 py-2.5 text-sm text-amber-900">
            <WifiOff size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            You're offline. Nothing can be saved or sent until you're back online.
          </div>
        )}
        <div className="mb-5">
          <ViewAsSwitch />
        </div>
        <main id="content" ref={main} tabIndex={-1} className="flex-1 outline-none">
          <Outlet />
        </main>
        <p className="mt-8 text-center text-xs text-quiet">Amounts and dates only. No medical advice. Demo data is fictional.</p>
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t border-line bg-white">
        <ul className="mx-auto flex max-w-md justify-around">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'font-medium text-teal-700' : 'text-quiet'}`
                }
              >
                <Icon size={22} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

import { Home, Receipt, Users } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useViewAs } from '../lib/view-as';
import { Logo } from './Logo';
import { ViewAsSwitch } from './ViewAsSwitch';

const tabs = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/receipts', label: 'Receipts', icon: Receipt, end: false },
  { to: '/family', label: 'Family', icon: Users, end: false },
];

export function Layout() {
  const { family } = useViewAs();
  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <Logo />
          <span className="text-xs text-quiet">{family.name}</span>
        </header>
        <div className="mb-5">
          <ViewAsSwitch />
        </div>
        <main className="flex-1">
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

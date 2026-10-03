import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useApi } from './api';
import type { FamilyView, Member } from '../../../shared/types';

const STORAGE_KEY = 'caresplit:view-as';

interface ViewAs {
  family: FamilyView;
  /** The member the app is currently shown as (demo switcher, no login). */
  viewer: Member;
  setViewerId: (id: string) => void;
  /** Use a family the server just saved, so every screen shows it without reloading. */
  updateFamily: (family: FamilyView) => void;
}

const Ctx = createContext<ViewAs | null>(null);

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const familyState = useApi<FamilyView>('/api/family');
  const [savedId, setSavedId] = useState<string | null>(readSaved);
  const [updated, setUpdated] = useState<FamilyView | null>(null);

  const setViewerId = useCallback((id: string) => {
    setSavedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, []);

  if (familyState.status === 'loading') {
    return <p className="p-8 text-center text-quiet">Loading…</p>;
  }
  if (familyState.status === 'error') {
    return (
      <div role="alert" className="mx-auto max-w-md space-y-3 p-8 text-center">
        <p className="text-red-700">Couldn't load your family. {familyState.message.replace(/[.!]?$/, '.')}</p>
        <button type="button" onClick={familyState.retry} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium hover:bg-stone-50">
          Try again
        </button>
      </div>
    );
  }

  const family = updated ?? familyState.data;
  const viewer = family.members.find((m) => m.id === savedId) ?? family.members.find((m) => m.role === 'organiser') ?? family.members[0];
  return <Ctx.Provider value={{ family, viewer, setViewerId, updateFamily: setUpdated }}>{children}</Ctx.Provider>;
}

export function useViewAs(): ViewAs {
  const value = useContext(Ctx);
  if (!value) throw new Error('useViewAs must be used inside ViewAsProvider');
  return value;
}

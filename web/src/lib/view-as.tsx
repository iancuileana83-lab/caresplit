import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useApi } from './api';
import type { FamilyView, Member } from '../../../shared/types';

const STORAGE_KEY = 'caresplit:view-as';

interface ViewAs {
  family: FamilyView;
  /** The member the app is currently shown as (demo switcher, no login). */
  viewer: Member;
  setViewerId: (id: string) => void;
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
      <p className="p-8 text-center text-red-700" role="alert">
        Couldn't load your family. Reload the page to try again.
      </p>
    );
  }

  const family = familyState.data;
  const viewer = family.members.find((m) => m.id === savedId) ?? family.members.find((m) => m.role === 'organiser') ?? family.members[0];
  return <Ctx.Provider value={{ family, viewer, setViewerId }}>{children}</Ctx.Provider>;
}

export function useViewAs(): ViewAs {
  const value = useContext(Ctx);
  if (!value) throw new Error('useViewAs must be used inside ViewAsProvider');
  return value;
}

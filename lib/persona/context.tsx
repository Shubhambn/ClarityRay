'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';

/* ── Types ── */
export type Persona = 'researcher' | 'doctor' | 'patient' | null;

interface PersonaContextValue {
  persona: Persona;
  setPersona: (p: Persona) => void;
  isSet: boolean;
}

/* ── Storage key ── */
const STORAGE_KEY = 'clarityray_persona_v1';

/* ── Context ── */
const PersonaContext = createContext<PersonaContextValue | null>(null);

/* ── Provider ── */
export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersonaState] = useState<Persona>(null);

  /* Hydrate from localStorage on mount */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (
        stored === 'researcher' ||
        stored === 'doctor' ||
        stored === 'patient'
      ) {
        setPersonaState(stored);
      }
    } catch {
      /* localStorage unavailable in some SSR/iframe contexts — silently ignore */
    }
  }, []);

  const setPersona = useCallback((p: Persona) => {
    setPersonaState(p);
    try {
      if (p === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, p);
      }
    } catch {
      /* silently ignore write failures */
    }
  }, []);

  const value: PersonaContextValue = {
    persona,
    setPersona,
    isSet: persona !== null,
  };

  return (
    <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>
  );
}

/* ── Hook ── */
export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (ctx === null) {
    throw new Error('usePersona must be used within a PersonaProvider');
  }
  return ctx;
}

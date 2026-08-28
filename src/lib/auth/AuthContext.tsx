import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';

export type ProfileRole = 'super_admin' | 'admin' | 'operador' | 'auditor';

export interface Profile {
  id: string;
  full_name: string;
  role: ProfileRole;
  active: boolean;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, role, active')
          .eq('id', userId)
          .single();
        if (cancelled) return;
        if (error) {
          // Un perfil ausente (PGRST116) es un caso legítimo: usuario de
          // auth sin fila en profiles → se trata como "sin perfil".
          // Cualquier otro error (red, permisos) NO debe dejar la app
          // colgada en "Cargando…" — se registra y se sale del loading.
          if (error.code !== 'PGRST116') console.error('No se pudo cargar el perfil:', error);
          setProfile(null);
        } else {
          setProfile((data as Profile) ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Fallo inesperado al cargar el perfil:', err);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}

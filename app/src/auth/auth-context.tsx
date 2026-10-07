import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { api, type Session } from '@/api';
import { storage } from '@/lib/storage';

const SESSION_KEY = 'tulgagch.session';

type AuthState =
  | { status: 'loading'; session: null }
  | {
      status: 'signedOut';
      session: null;
      /** Set when the server rejected the saved session (401). */
      expired?: boolean;
    }
  | { status: 'signedIn'; session: Session };

type AuthContextValue = AuthState & {
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null });

  // A 401 on any authenticated request means the token expired or was revoked.
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      api.setToken(null);
      storage.remove(SESSION_KEY);
      setState({ status: 'signedOut', session: null, expired: true });
    });
    return () => api.setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    storage.get(SESSION_KEY).then((raw) => {
      const session = raw ? parseSession(raw) : null;
      if (session) {
        api.setToken(session.token);
        setState({ status: 'signedIn', session });
      } else {
        setState({ status: 'signedOut', session: null });
      }
    });
  }, []);

  const signIn = async (phone: string, password: string) => {
    const session = await api.login(phone, password);
    api.setToken(session.token);
    await storage.set(SESSION_KEY, JSON.stringify(session));
    setState({ status: 'signedIn', session });
  };

  const signOut = async () => {
    await api.logout().catch(() => {});
    api.setToken(null);
    await storage.remove(SESSION_KEY);
    setState({ status: 'signedOut', session: null });
  };

  return <AuthContext value={{ ...state, signIn, signOut }}>{children}</AuthContext>;
}

function parseSession(raw: string): Session | null {
  try {
    const value = JSON.parse(raw) as Session;
    return value?.token && value.user ? value : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The signed-in user. Only call from screens behind the auth guard. */
export function useUser() {
  const { session } = useAuth();
  if (!session) throw new Error('useUser called while signed out');
  return session.user;
}

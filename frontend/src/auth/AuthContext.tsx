import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, setAuthToken } from '../api/client';
import { AuthUser } from '../api/types';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = '4thestate_auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from localStorage on first load, so a page refresh
  // doesn't kick the user back to the login screen.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { token: string; user: AuthUser };
        setToken(parsed.token);
        setUser(parsed.user);
        setAuthToken(parsed.token);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  // Called by AuthCallbackPage once the backend has redirected back from
  // Google with a JWT in the URL: store the token, then fetch the user
  // profile it belongs to (the callback URL only carries the token itself).
  async function loginWithToken(newToken: string) {
    setAuthToken(newToken);
    const authUser = await api.get<AuthUser>('/auth/me');
    setToken(newToken);
    setUser(authUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: newToken, user: authUser }));
  }

  function logout() {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  const value = useMemo(() => ({ user, token, loading, loginWithToken, logout }), [user, token, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

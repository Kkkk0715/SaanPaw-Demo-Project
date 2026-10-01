import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Role } from '@saanpaw/shared';
import { apiRequest } from '../services/api';
import { registerForPushNotificationsAsync } from '../services/pushNotifications';
import { tokenStorage } from '../services/tokenStorage';

const SESSION_KEY = 'saanpaw.session';
const TOKEN_KEY = 'saanpaw.token';

/**
 * The static GitHub Pages build has no backend. With this set, sign-in checks the demo
 * accounts below and the app runs on its built-in sample data instead of calling the API.
 */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

export type MobileRole = Extract<Role, 'user' | 'shelter_admin'>;

export const DEMO_ACCOUNTS: Record<MobileRole, { email: string; password: string; label: string }> = {
  user: { email: 'user@saanpaw.ph', password: 'saanpaw123', label: 'Pet owner / community member' },
  shelter_admin: {
    email: 'shelter@saanpaw.ph',
    password: 'saanpaw123',
    label: 'SJDM City Animal Care Center',
  },
};

interface AuthState {
  role: MobileRole | null;
  /** Bearer token for the signed-in role, used by the data store. */
  token: string | null;
  loading: boolean;
  signIn: (role: MobileRole, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<MobileRole | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(SESSION_KEY), tokenStorage.get(TOKEN_KEY)])
      .then(([stored, storedToken]) => {
        // A session without a token (from before sign-in used the API) cannot call the server,
        // except in demo mode where there is no server.
        const valid = (stored === 'user' || stored === 'shelter_admin') && (storedToken || DEMO_MODE);
        setRole(valid ? (stored as MobileRole) : null);
        setToken(valid && !DEMO_MODE ? storedToken : null);
      })
      .catch(() => {
        setRole(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Fires once a session is live - covers both a fresh sign-in and the app relaunching into an
  // already-signed-in session (e.g. permission was only just granted after an earlier denial).
  useEffect(() => {
    if (DEMO_MODE || !role || !token) return;
    let cancelled = false;
    void registerForPushNotificationsAsync().then((pushToken) => {
      if (cancelled || !pushToken) return;
      const path = role === 'user' ? '/user/push-token' : '/shelter/push-token';
      void apiRequest(path, { method: 'PUT', body: JSON.stringify({ token: pushToken }) }, token).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [role, token]);

  const value = useMemo<AuthState>(
    () => ({
      role,
      token,
      loading,
      signIn: async (r, email, password) => {
        if (DEMO_MODE) {
          const account = DEMO_ACCOUNTS[r];
          if (email.trim().toLowerCase() !== account.email || password !== account.password) {
            throw new Error('Incorrect email or password for this module.');
          }
          await AsyncStorage.setItem(SESSION_KEY, r);
          setRole(r);
          return;
        }

        const response = await apiRequest<{ token: string }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ role: r, email, password }),
        });

        await AsyncStorage.setItem(SESSION_KEY, r);
        await tokenStorage.set(TOKEN_KEY, response.token);
        setToken(response.token);
        setRole(r);
      },
      signOut: async () => {
        await AsyncStorage.removeItem(SESSION_KEY);
        await tokenStorage.remove(TOKEN_KEY);
        setToken(null);
        setRole(null);
      },
    }),
    [role, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

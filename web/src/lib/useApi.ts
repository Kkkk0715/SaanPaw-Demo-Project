import { useCallback } from 'react';
import { useAuth } from '@/auth';
import { apiRequest } from './api';

/**
 * Signed-in requests for console pages that talk to the API directly (tickets, analytics, admins,
 * versions, backups) instead of through the shared data store. An expired session signs out.
 */
export function useApi() {
  const { token, signOut } = useAuth();
  return useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
      const { json, ...rest } = init;
      const headers = new Headers(rest.headers ?? {});
      if (token) headers.set('Authorization', `Bearer ${token}`);
      try {
        return await apiRequest<T>(path, { ...rest, headers, ...(json !== undefined ? { body: JSON.stringify(json) } : {}) });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (/invalid or expired token|unauthori[sz]ed/i.test(message)) signOut();
        throw e;
      }
    },
    [token, signOut],
  );
}

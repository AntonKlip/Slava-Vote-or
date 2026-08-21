import { createContext } from 'react';
import type { ApiClient } from '../api/client';

export interface AuthUser {
  id: string;
  role: string;
}

export type AuthStatus = 'loading' | 'ready' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  api: ApiClient;
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

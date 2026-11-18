import { createContext, useContext } from 'react';
import type { AuthAccess, AuthConfiguration, AuthProfile, AuthUser } from '../types';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  activeProfile: AuthProfile | null;
  availableProfiles: AuthProfile[];
  access: AuthAccess | null;
  configuration: AuthConfiguration | null;
  errorCode: string | null;
  errorTraceId?: string | null;
  refresh: () => Promise<void>;
  devLogin: () => Promise<void>;
  loadPendingProfiles: () => Promise<AuthProfile[]>;
  selectPendingProfile: (profileId: string) => Promise<void>;
  switchProfile: (profileId: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthApiError, authApi } from '../services/authApi';
import type { AuthConfiguration, AuthMeResponse } from '../types';
import { AuthContext } from './authContext';
import { registerRoleCapabilities } from './roles';
import type { AuthContextValue, AuthStatus } from './authContext';

const anonymousState: Pick<AuthContextValue, 'user' | 'activeProfile' | 'availableProfiles' | 'access'> = {
  user: null,
  activeProfile: null,
  availableProfiles: [],
  access: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState(anonymousState);
  const [configuration, setConfiguration] = useState<AuthConfiguration | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorTraceId, setErrorTraceId] = useState<string | null>(null);

  const applyAuthenticatedSession = useCallback(async (response: AuthMeResponse) => {
    setErrorCode(null);
    setErrorTraceId(null);
    if (!response.authenticated || !response.user || !response.activeProfile) {
      setSession(anonymousState);
      setStatus('anonymous');
      return;
    }

    const access = await authApi.access();
    registerRoleCapabilities(response.availableProfiles);
    setSession({
      user: response.user,
      activeProfile: response.activeProfile,
      availableProfiles: response.availableProfiles,
      access,
    });
    setStatus('authenticated');
    setErrorCode(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [config, response] = await Promise.all([authApi.configuration(), authApi.me()]);
      setConfiguration(config);
      await applyAuthenticatedSession(response);
    } catch (error) {
      setSession(anonymousState);
      setErrorCode(error instanceof AuthApiError ? error.errorCode : 'AUTH_REQUEST_FAILED');
      setErrorTraceId(error instanceof AuthApiError ? error.traceId : null);
      setStatus('error');
    }
  }, [applyAuthenticatedSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    ...session,
    configuration,
    errorCode,
    errorTraceId,
    refresh,
    devLogin: async () => {
      const response = await authApi.devLogin();
      if ('profileSelectionRequired' in response) {
        setSession(anonymousState);
        setStatus('anonymous');
        window.location.replace('/select-profile');
        return;
      }
      await applyAuthenticatedSession(response);
    },
    loadPendingProfiles: () => authApi.pendingProfiles(),
    selectPendingProfile: async (profileId) => {
      const response = await authApi.selectProfile(profileId);
      await applyAuthenticatedSession(response);
      window.location.replace('/');
    },
    switchProfile: async (profileId) => {
      try {
        const response = await authApi.switchProfile(profileId);
        await applyAuthenticatedSession(response);
      } catch (error) {
        if (error instanceof AuthApiError && error.status === 401) {
          setSession(anonymousState);
          setStatus('anonymous');
          window.history.replaceState(null, '', '/login');
        }
        throw error;
      }
    },
    logout: async () => {
      try {
        await authApi.logout();
      } finally {
        setSession(anonymousState);
        setStatus('anonymous');
        window.history.replaceState(null, '', '/login');
      }
    },
  }), [applyAuthenticatedSession, configuration, errorCode, errorTraceId, refresh, session, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

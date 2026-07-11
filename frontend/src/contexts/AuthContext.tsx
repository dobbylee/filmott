'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { isAxiosError } from 'axios';
import { refreshApi } from '@/lib/api';
import {
  AUTH_SESSION_CLEARED_EVENT,
  AUTH_SESSION_ESTABLISHED_EVENT,
  clearServerSession,
  initializeAuthSessionChannel,
  notifySessionEstablished,
  refreshSession,
} from '@/lib/auth-session';
import { clearLegacyAuthStorage } from '@/lib/auth-storage';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';
import type { User, AuthResponse } from '@/types/auth';

export type AuthModalReason = 'want_to_watch' | 'watched' | null;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  logoutError: string | null;
  handleAuthSuccess: (data: AuthResponse) => void;
  logout: () => Promise<boolean>;
  updateUser: (user: User) => void;
  authModal: { isOpen: boolean; reason: AuthModalReason };
  openAuthModal: (reason?: AuthModalReason) => void;
  closeAuthModal: () => void;
  clearLogoutError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModal, setAuthModal] = useState<{
    isOpen: boolean;
    reason: AuthModalReason;
  }>({
    isOpen: false,
    reason: null,
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const sessionGenerationRef = useRef(0);

  // 401 응답 시 모달 열기
  useEffect(() => {
    let isActive = true;
    const handleAuthRequired = () => {
      sessionGenerationRef.current += 1;
      setUser(null);
      setIsLoading(false);
      setLogoutError(null);
      setAuthModal({ isOpen: true, reason: null });
    };
    const handleSessionCleared = () => {
      sessionGenerationRef.current += 1;
      setUser(null);
      setIsLoading(false);
      setLogoutError(null);
      setAuthModal({ isOpen: false, reason: null });
    };
    const handleSessionEstablished = () => {
      sessionGenerationRef.current += 1;
      const generation = sessionGenerationRef.current;
      void refreshApi
        .get<User>('/users/me')
        .then(({ data }) => {
          if (isActive && sessionGenerationRef.current === generation) {
            setUser(data);
            setLogoutError(null);
            setAuthModal({ isOpen: false, reason: null });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (isActive && sessionGenerationRef.current === generation) {
            setIsLoading(false);
          }
        });
    };
    initializeAuthSessionChannel();
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    window.addEventListener(
      AUTH_SESSION_ESTABLISHED_EVENT,
      handleSessionEstablished,
    );
    return () => {
      isActive = false;
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
      window.removeEventListener(
        AUTH_SESSION_CLEARED_EVENT,
        handleSessionCleared,
      );
      window.removeEventListener(
        AUTH_SESSION_ESTABLISHED_EVENT,
        handleSessionEstablished,
      );
    };
  }, []);

  useEffect(() => {
    clearLegacyAuthStorage();

    let isMounted = true;
    const generation = sessionGenerationRef.current;
    const canApplyResult = () =>
      isMounted && sessionGenerationRef.current === generation;

    const restoreSession = async () => {
      try {
        const { data } = await refreshApi.get<User>('/users/me');
        if (canApplyResult()) {
          setUser(data);
        }
        return;
      } catch (error) {
        if (!isAxiosError(error) || error.response?.status !== 401) {
          if (canApplyResult()) {
            setUser(null);
          }
          return;
        }

        try {
          await refreshSession();
          const { data } = await refreshApi.get<User>('/users/me');
          if (canApplyResult()) {
            setUser(data);
          }
        } catch {
          if (canApplyResult()) {
            setUser(null);
          }
        }
      } finally {
        if (canApplyResult()) {
          setIsLoading(false);
        }
      }
    };

    restoreSession().catch(() => {
      if (canApplyResult()) {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAuthSuccess = useCallback((response: AuthResponse) => {
    sessionGenerationRef.current += 1;
    setUser(response.user);
    setIsLoading(false);
    setLogoutError(null);
    setAuthModal({ isOpen: false, reason: null });
    notifySessionEstablished();
  }, []);

  const logout = useCallback(async (): Promise<boolean> => {
    sessionGenerationRef.current += 1;
    setIsLoggingOut(true);
    setLogoutError(null);
    setUser(null);
    setAuthModal({ isOpen: false, reason: null });
    try {
      await clearServerSession();
      return true;
    } catch {
      setLogoutError(
        '로그아웃에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.',
      );
      return false;
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  const openAuthModal = useCallback((reason: AuthModalReason = null) => {
    setAuthModal({ isOpen: true, reason });
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModal({ isOpen: false, reason: null });
  }, []);

  const clearLogoutError = useCallback(() => {
    setLogoutError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggingOut,
        logoutError,
        handleAuthSuccess,
        logout,
        updateUser,
        authModal,
        openAuthModal,
        closeAuthModal,
        clearLogoutError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

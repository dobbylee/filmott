'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { isAxiosError } from 'axios';
import { refreshApi } from '@/lib/api';
import { clearLegacyAuthStorage } from '@/lib/auth-storage';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';
import type { User, AuthResponse } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  handleAuthSuccess: (data: AuthResponse) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  authModal: { isOpen: boolean };
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean }>({
    isOpen: false,
  });

  // 401 응답 시 모달 열기
  useEffect(() => {
    const handleAuthRequired = () => {
      clearLegacyAuthStorage();
      setUser(null);
      setAuthModal({ isOpen: true });
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  useEffect(() => {
    clearLegacyAuthStorage();

    let isMounted = true;

    const restoreSession = async () => {
      try {
        const { data } = await refreshApi.get<User>('/users/me');
        if (isMounted) {
          setUser(data);
        }
        return;
      } catch (error) {
        if (!isAxiosError(error) || error.response?.status !== 401) {
          if (isMounted) {
            setUser(null);
          }
          return;
        }

        try {
          await refreshApi.post('/auth/refresh');
          const { data } = await refreshApi.get<User>('/users/me');
          if (isMounted) {
            setUser(data);
          }
        } catch {
          if (isMounted) {
            setUser(null);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession().catch(() => {
      if (isMounted) {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAuthSuccess = useCallback((response: AuthResponse) => {
    setUser(response.user);
    setAuthModal({ isOpen: false });
  }, []);

  const logout = useCallback(() => {
    refreshApi.post('/auth/logout').catch(() => {});
    setUser(null);
    clearLegacyAuthStorage();
    setAuthModal({ isOpen: false });
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  const openAuthModal = useCallback(() => {
    setAuthModal({ isOpen: true });
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModal({ isOpen: false });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token: null,
        isLoading,
        handleAuthSuccess,
        logout,
        updateUser,
        authModal,
        openAuthModal,
        closeAuthModal,
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

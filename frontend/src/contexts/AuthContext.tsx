'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import api from '@/lib/api';
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
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean }>({
    isOpen: false,
  });

  // 401 응답 시 모달 열기
  useEffect(() => {
    const handleAuthRequired = () => {
      // api.ts 인터셉터에서 이미 제거하지만, 방어적으로 여기서도 클리어
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      setUser(null);
      setToken(null);
      setAuthModal({ isOpen: true });
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);

  const handleAuthSuccess = useCallback((response: AuthResponse) => {
    const { access_token, refresh_token, user: userData } = response;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('user', JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      // fire-and-forget: 서버 요청 실패해도 클라이언트 로그아웃 진행
      api.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  }, []);

  const openAuthModal = useCallback(() => {
    setAuthModal({ isOpen: true });
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModal({ isOpen: false });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, handleAuthSuccess, logout, updateUser, authModal, openAuthModal, closeAuthModal }}
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

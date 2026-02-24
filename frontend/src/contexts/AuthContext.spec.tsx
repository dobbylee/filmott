import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { api } from '../api';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the API module
vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it('should initialize with no user and unauthenticated', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should set user and token on successful login', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    act(() => {
      result.current.login('fake-jwt-token', { id: 1, username: 'testuser', email: 'test@example.com' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.username).toBe('testuser');
    expect(window.localStorage.getItem('access_token')).toBe('fake-jwt-token');
  });

  it('should clear state and token on logout', () => {
    window.localStorage.setItem('access_token', 'fake-jwt-token');
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(window.localStorage.getItem('access_token')).toBeNull();
  });

  it('should restore authentication state via checkAuth API call', async () => {
    window.localStorage.setItem('access_token', 'existing-token');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 1, username: 'restoreduser', email: 'test@example.com' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
    
    expect(result.current.user?.username).toBe('restoreduser');
    expect(api.get).toHaveBeenCalledWith('/users/me');
  });

  it('should fail checkAuth and clear token if API fails', async () => {
    window.localStorage.setItem('access_token', 'invalid-token');
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(window.localStorage.getItem('access_token')).toBeNull();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });
});

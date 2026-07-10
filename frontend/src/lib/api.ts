import axios, { type AxiosRequestConfig } from 'axios';
import {
  notifyAuthRequired,
  refreshSession,
  sessionApi,
} from '@/lib/auth-session';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (typeof window === 'undefined' || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // refresh 요청 자체가 실패한 경우 -> 바로 로그인 모달
    if (originalRequest.url === '/auth/refresh') {
      notifyAuthRequired();
      return Promise.reject(error);
    }

    // 이미 재시도한 요청이면 더 이상 재시도하지 않음
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await refreshSession({ notifyOnFailure: true });
      return api(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);

export { sessionApi as refreshApi };
export default api;

import axios, { type AxiosRequestConfig } from 'axios';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';
import { clearLegacyAuthStorage } from '@/lib/auth-storage';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// refresh 요청 전용 인스턴스 — 인터셉터를 우회하여 무한 루프 방지
const refreshApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
      return;
    }

    prom.resolve();
  });
  failedQueue = [];
};

const clearAuthAndNotify = () => {
  clearLegacyAuthStorage();
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (typeof window === 'undefined' || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // refresh 요청 자체가 실패한 경우 -> 바로 로그인 모달
    if (originalRequest.url === '/auth/refresh') {
      clearAuthAndNotify();
      return Promise.reject(error);
    }

    // 이미 재시도한 요청이면 더 이상 재시도하지 않음
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    // 이미 refresh 진행 중이면 큐에 추가
    if (isRefreshing) {
      return new Promise<void>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => {
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      await refreshApi.post('/auth/refresh');
      processQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      clearAuthAndNotify();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export { refreshApi };
export default api;

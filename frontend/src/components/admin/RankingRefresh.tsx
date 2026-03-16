'use client';

import { useState } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { getErrorMessage } from '@/utils/error';
import { revalidateMainPageAction } from '@/app/admin/actions';

interface CategoryConfig {
  key: string;
  label: string;
}

const CATEGORIES: CategoryConfig[] = [
  { key: 'daily-box-office', label: '일별 박스오피스' },
  { key: 'weekly-box-office', label: '주간 박스오피스' },
  { key: 'trending-all-day', label: '트렌딩 일간' },
  { key: 'trending-all-week', label: '트렌딩 주간' },
];

type ButtonStatus = 'idle' | 'loading' | 'success' | 'error';

interface CategoryState {
  status: ButtonStatus;
  message: string;
}

export default function RankingRefresh() {
  const [states, setStates] = useState<Record<string, CategoryState>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.key, { status: 'idle' as ButtonStatus, message: '' }]))
  );

  const handleRefresh = async (category: string) => {
    setStates((prev) => ({
      ...prev,
      [category]: { status: 'loading', message: '' },
    }));

    try {
      await api.post(`/rankings/refresh/${category}`);
      // 메인 페이지 캐시 즉시 갱신 (Server Action으로 서버사이드 호출)
      try {
        await revalidateMainPageAction();
      } catch {
        // revalidation 실패해도 갱신 자체는 성공
      }
      setStates((prev) => ({
        ...prev,
        [category]: { status: 'success', message: '갱신 완료' },
      }));
      // 3초 후 idle로 복원
      setTimeout(() => {
        setStates((prev) => ({
          ...prev,
          [category]: { status: 'idle', message: '' },
        }));
      }, 3000);
    } catch (err) {
      const message = getErrorMessage(err);
      setStates((prev) => ({
        ...prev,
        [category]: { status: 'error', message },
      }));
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-4 text-lg font-bold text-white">랭킹 갱신</h2>
      <p className="mb-5 text-sm text-white/40">
        각 카테고리의 랭킹 데이터를 수동으로 갱신합니다.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CATEGORIES.map((category) => {
          const state = states[category.key];
          return (
            <div key={category.key} className="flex flex-col gap-2">
              <button
                onClick={() => handleRefresh(category.key)}
                disabled={state.status === 'loading'}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {state.status === 'loading' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : state.status === 'success' ? (
                  <Check className="h-4 w-4" />
                ) : state.status === 'error' ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {category.label}
              </button>
              {state.message && (
                <p
                  className={`text-center text-xs ${
                    state.status === 'success' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {state.message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

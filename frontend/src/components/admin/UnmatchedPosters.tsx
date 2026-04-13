'use client';

import { useState, useEffect, useCallback } from 'react';
import { ImageOff, Save, Check, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { getErrorMessage } from '@/utils/error';

interface UnmatchedRanking {
  id: number;
  rank: number;
  title?: string;
  category: string;
  source: string;
  posterUrl?: string;
}

type SaveStatus = 'idle' | 'loading' | 'success' | 'error';

interface ItemState {
  posterUrl: string;
  status: SaveStatus;
  message: string;
}

export default function UnmatchedPosters() {
  const [rankings, setRankings] = useState<UnmatchedRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [states, setStates] = useState<Record<number, ItemState>>({});

  const fetchUnmatched = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<UnmatchedRanking[]>('/rankings/unmatched');
      setRankings(data);
      const initialStates: Record<number, ItemState> = {};
      for (const item of data) {
        initialStates[item.id] = {
          posterUrl: item.posterUrl ?? '',
          status: 'idle',
          message: '',
        };
      }
      setStates(initialStates);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnmatched();
  }, [fetchUnmatched]);

  const handlePosterUrlChange = (id: number, value: string) => {
    setStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], posterUrl: value, status: 'idle', message: '' },
    }));
  };

  const handleSave = async (id: number) => {
    const state = states[id];
    if (!state || !state.posterUrl.trim()) return;

    setStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], status: 'loading', message: '' },
    }));

    try {
      await api.patch(`/rankings/${id}/poster`, { posterUrl: state.posterUrl.trim() });
      setStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], status: 'success', message: '저장 완료' },
      }));
      setTimeout(() => {
        setStates((prev) => ({
          ...prev,
          [id]: { ...prev[id], status: 'idle', message: '' },
        }));
      }, 3000);
    } catch (err) {
      const message = getErrorMessage(err);
      setStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], status: 'error', message },
      }));
    }
  };

  const categoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      'daily-box-office': '일별 박스오피스',
      'weekly-box-office': '주간 박스오피스',
      'trending-all-day': '트렌딩 일간',
      'trending-all-week': '트렌딩 주간',
    };
    return labels[category] ?? category;
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center gap-2">
        <ImageOff className="h-5 w-5 text-white/60" />
        <h2 className="text-lg font-bold text-white">매칭 실패 포스터 관리</h2>
      </div>
      <p className="mb-5 text-sm text-white/40">
        TMDB 매칭에 실패한 랭킹 항목의 포스터 URL을 수동으로 설정합니다.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : error ? (
        <p className="text-center text-sm text-red-400">{error}</p>
      ) : rankings.length === 0 ? (
        <p className="text-center text-sm text-white/40 py-4">
          매칭 실패 항목이 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {rankings.map((item) => {
            const state = states[item.id];
            if (!state) return null;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-white/5 bg-white/[0.03] p-4"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-700 to-indigo-600 text-xs font-bold text-white">
                    {item.rank}
                  </span>
                  <span className="font-semibold text-white">
                    {item.title ?? '제목 없음'}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
                    {categoryLabel(item.category)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={state.posterUrl}
                    onChange={(e) => handlePosterUrlChange(item.id, e.target.value)}
                    placeholder="포스터 URL을 입력하세요"
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-fuchsia-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleSave(item.id)}
                    disabled={state.status === 'loading' || !state.posterUrl.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {state.status === 'loading' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : state.status === 'success' ? (
                      <Check className="h-4 w-4" />
                    ) : state.status === 'error' ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    저장
                  </button>
                </div>
                {state.message && (
                  <p
                    className={`mt-2 text-xs ${
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
      )}
    </section>
  );
}

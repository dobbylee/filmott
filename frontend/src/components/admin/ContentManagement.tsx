'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldOff } from 'lucide-react';
import api from '@/lib/api';
import { getErrorMessage } from '@/utils/error';

type ContentType = 'movie' | 'tv';

interface AdultContent {
  id: number;
  tmdbId: number;
  contentType: string;
  title: string;
  posterUrl?: string;
}

interface ConfirmModal {
  isOpen: boolean;
  action: 'block' | 'unblock';
}

export default function ContentManagement() {
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [tmdbId, setTmdbId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [adultList, setAdultList] = useState<AdultContent[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const fetchAdultList = useCallback(async () => {
    try {
      const { data } = await api.get<AdultContent[]>('/contents/adult-list');
      setAdultList(data);
    } catch {
      // 목록 로드 실패 시 빈 배열 유지
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdultList();
  }, [fetchAdultList]);

  const handleAction = (action: 'block' | 'unblock') => {
    if (!tmdbId.trim()) {
      setResult({ type: 'error', message: 'TMDB ID를 입력해주세요.' });
      return;
    }
    setResult(null);
    setConfirmModal({ isOpen: true, action });
  };

  const confirmAction = async () => {
    if (!confirmModal) return;
    setLoading(true);
    setResult(null);

    try {
      const adult = confirmModal.action === 'block';
      await api.patch('/contents/adult', {
        tmdbId: Number(tmdbId),
        contentType,
        adult,
      });
      setResult({
        type: 'success',
        message: adult
          ? `${contentType === 'movie' ? '영화' : 'TV'} #${tmdbId} 성인물 차단 완료`
          : `${contentType === 'movie' ? '영화' : 'TV'} #${tmdbId} 차단 해제 완료`,
      });
      setTmdbId('');
      await fetchAdultList();
    } catch (err) {
      setResult({ type: 'error', message: getErrorMessage(err) });
    } finally {
      setLoading(false);
      setConfirmModal(null);
    }
  };

  const handleUnblock = async (item: AdultContent) => {
    const confirmed = window.confirm(
      `"${item.title}" (${item.contentType === 'movie' ? '영화' : 'TV'} #${item.tmdbId})의 차단을 해제하시겠습니까?`,
    );
    if (!confirmed) return;

    try {
      await api.patch('/contents/adult', {
        tmdbId: item.tmdbId,
        contentType: item.contentType,
        adult: false,
      });
      await fetchAdultList();
      setResult({
        type: 'success',
        message: `"${item.title}" 차단 해제 완료`,
      });
    } catch (err) {
      setResult({ type: 'error', message: getErrorMessage(err) });
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-4 text-lg font-bold text-white">콘텐츠 관리</h2>
      <p className="mb-5 text-sm text-white/40">
        TMDB ID와 타입을 입력하여 성인물 차단/해제를 설정합니다.
      </p>

      {/* 입력 폼 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="content-type" className="text-xs text-white/50">타입</label>
          <select
            id="content-type"
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          >
            <option value="movie">Movie</option>
            <option value="tv">TV</option>
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="tmdb-id" className="text-xs text-white/50">TMDB ID</label>
          <input
            id="tmdb-id"
            type="number"
            value={tmdbId}
            onChange={(e) => {
              setTmdbId(e.target.value);
              setResult(null);
            }}
            placeholder="TMDB ID 입력"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('block')}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Shield className="h-4 w-4" />
            차단
          </button>
          <button
            onClick={() => handleAction('unblock')}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <ShieldOff className="h-4 w-4" />
            해제
          </button>
        </div>
      </div>

      {/* 결과 메시지 */}
      {result && (
        <p className={`text-sm ${result.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {result.message}
        </p>
      )}

      {/* 차단 목록 */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <h3 className="mb-3 text-sm font-semibold text-white/70">차단된 콘텐츠</h3>
        {listLoading ? (
          <p className="text-sm text-white/30">불러오는 중...</p>
        ) : adultList.length === 0 ? (
          <p className="text-sm text-white/30">차단된 콘텐츠가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {adultList.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50 uppercase">
                    {item.contentType}
                  </span>
                  <span className="text-xs text-white/40">#{item.tmdbId}</span>
                  <span className="truncate text-sm text-white/80">{item.title}</span>
                </div>
                <button
                  onClick={() => handleUnblock(item)}
                  className="shrink-0 ml-2 rounded-md border border-green-500/30 px-2.5 py-1 text-xs font-medium text-green-300 transition-colors hover:bg-green-500/10"
                >
                  해제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 확인 모달 */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6">
            <h3 className="mb-3 text-base font-bold text-white">
              {confirmModal.action === 'block' ? '성인물 차단' : '차단 해제'}
            </h3>
            <p className="mb-5 text-sm text-white/60">
              {confirmModal.action === 'block'
                ? `${contentType === 'movie' ? '영화' : 'TV'} #${tmdbId}을(를) 성인물로 차단하시겠습니까?`
                : `${contentType === 'movie' ? '영화' : 'TV'} #${tmdbId}의 성인물 차단을 해제하시겠습니까?`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={confirmAction}
                disabled={loading}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 ${
                  confirmModal.action === 'block'
                    ? 'bg-red-600 hover:opacity-90'
                    : 'bg-green-600 hover:opacity-90'
                }`}
              >
                {loading ? '처리 중...' : '확인'}
              </button>
              <button
                onClick={() => setConfirmModal(null)}
                disabled={loading}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

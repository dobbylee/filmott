'use client';

import { useState } from 'react';
import { Shield, ShieldOff } from 'lucide-react';
import api from '@/lib/api';
import { getErrorMessage } from '@/utils/error';

type ContentType = 'movie' | 'tv';

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
    } catch (err) {
      setResult({ type: 'error', message: getErrorMessage(err) });
    } finally {
      setLoading(false);
      setConfirmModal(null);
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

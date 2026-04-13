'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldOff, UserX, ChevronLeft, ChevronRight } from 'lucide-react';
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

interface AdultListResponse {
  data: AdultContent[];
  total: number;
  page: number;
  totalPages: number;
}

interface ConfirmModal {
  isOpen: boolean;
  action: 'block' | 'unblock' | 'block-person';
  item?: AdultContent;
  personId?: number;
}

export default function ContentManagement() {
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [tmdbId, setTmdbId] = useState('');
  const [personId, setPersonId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [adultList, setAdultList] = useState<AdultContent[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchAdultList = useCallback(async (p = 1) => {
    try {
      const { data } = await api.get<AdultListResponse>(`/contents/adult-list?page=${p}&limit=20`);
      setAdultList(data.data);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotal(data.total);
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

  const handleBlockPerson = () => {
    if (!personId.trim()) {
      setResult({ type: 'error', message: 'Person ID를 입력해주세요.' });
      return;
    }
    setResult(null);
    setConfirmModal({ isOpen: true, action: 'block-person', personId: Number(personId) });
  };

  const confirmAction = async () => {
    if (!confirmModal) return;
    setLoading(true);
    setResult(null);

    try {
      if (confirmModal.action === 'block-person') {
        const { data } = await api.post<{
          blocked: number;
          failed: number;
          total: number;
          blockedContents: { tmdbId: number; contentType: string }[];
        }>(`/contents/adult/block-person/${confirmModal.personId}`);
        setResult({
          type: 'success',
          message: `인물 #${confirmModal.personId}의 작품 ${data.blocked}개 차단 완료`,
        });
        setPersonId('');
        await fetchAdultList(1);
        return;
      }

      const isListUnblock = !!confirmModal.item;
      const targetTmdbId = isListUnblock ? confirmModal.item!.tmdbId : Number(tmdbId);
      const targetType = isListUnblock ? confirmModal.item!.contentType : contentType;
      const adult = confirmModal.action === 'block';

      await api.patch('/contents/adult', {
        tmdbId: targetTmdbId,
        contentType: targetType,
        adult,
      });
      const label = targetType === 'movie' ? '영화' : 'TV';
      setResult({
        type: 'success',
        message: isListUnblock
          ? `"${confirmModal.item!.title}" 차단 해제 완료`
          : adult
            ? `${label} #${tmdbId} 성인물 차단 완료`
            : `${label} #${tmdbId} 차단 해제 완료`,
      });
      if (!isListUnblock) setTmdbId('');
      await fetchAdultList(page);
    } catch (err) {
      setResult({ type: 'error', message: getErrorMessage(err) });
    } finally {
      setLoading(false);
      setConfirmModal(null);
    }
  };

  const handleUnblock = (item: AdultContent) => {
    setResult(null);
    setConfirmModal({ isOpen: true, action: 'unblock', item });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-4 text-lg font-bold text-white">콘텐츠 관리</h2>

      {/* 개별 차단 폼 */}
      <p className="mb-3 text-sm text-white/40">
        TMDB ID와 타입을 입력하여 성인물 차단/해제를 설정합니다.
      </p>
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

      {/* 인물 일괄 차단 폼 */}
      <div className="mb-4 flex flex-col gap-3 border-t border-white/5 pt-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="person-id" className="text-xs text-white/50">인물 일괄 차단 (TMDB Person ID)</label>
          <input
            id="person-id"
            type="number"
            value={personId}
            onChange={(e) => {
              setPersonId(e.target.value);
              setResult(null);
            }}
            placeholder="Person ID 입력"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
          />
        </div>
        <button
          onClick={handleBlockPerson}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <UserX className="h-4 w-4" />
          전체 작품 차단
        </button>
      </div>

      {/* 결과 메시지 */}
      {result && (
        <p className={`text-sm ${result.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {result.message}
        </p>
      )}

      {/* 차단 목록 */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/70">
            차단된 콘텐츠 {total > 0 && <span className="text-white/40">({total})</span>}
          </h3>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAdultList(page - 1)}
                disabled={page <= 1}
                className="rounded p-1 text-white/40 hover:text-white/70 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-white/40">{page} / {totalPages}</span>
              <button
                onClick={() => fetchAdultList(page + 1)}
                disabled={page >= totalPages}
                className="rounded p-1 text-white/40 hover:text-white/70 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
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
              {confirmModal.action === 'block-person'
                ? '인물 전체 작품 차단'
                : confirmModal.action === 'block' ? '성인물 차단' : '차단 해제'}
            </h3>
            <p className="mb-5 text-sm text-white/60">
              {confirmModal.action === 'block-person'
                ? `인물 #${confirmModal.personId}의 전체 작품을 차단하시겠습니까?`
                : confirmModal.item
                  ? `"${confirmModal.item.title}" (${confirmModal.item.contentType === 'movie' ? '영화' : 'TV'} #${confirmModal.item.tmdbId})의 차단을 해제하시겠습니까?`
                  : confirmModal.action === 'block'
                    ? `${contentType === 'movie' ? '영화' : 'TV'} #${tmdbId}을(를) 성인물로 차단하시겠습니까?`
                    : `${contentType === 'movie' ? '영화' : 'TV'} #${tmdbId}의 성인물 차단을 해제하시겠습니까?`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={confirmAction}
                disabled={loading}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 ${
                  confirmModal.action === 'unblock'
                    ? 'bg-green-600 hover:opacity-90'
                    : 'bg-red-600 hover:opacity-90'
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

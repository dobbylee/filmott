'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { getErrorMessage } from '@/utils/error';

interface AdminUser {
  id: number;
  nickname: string;
  email: string | null;
  provider: string;
  status: string;
  role: string;
  createdAt: string;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  totalPages: number;
}

type StatusFilter = '' | 'ACTIVE' | 'SUSPENDED';

export default function UserManagement() {
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');

  // 확인 모달 상태
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    userId: number;
    nickname: string;
    action: 'SUSPENDED' | 'ACTIVE';
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const { data: responseData } = await api.get<AdminUsersResponse>(
        `/users/admin?${params.toString()}`
      );
      setData(responseData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleStatusFilterChange = (value: StatusFilter) => {
    setPage(1);
    setStatusFilter(value);
  };

  const handleStatusChange = (userId: number, nickname: string, newStatus: 'SUSPENDED' | 'ACTIVE') => {
    setActionError('');
    setConfirmModal({ isOpen: true, userId, nickname, action: newStatus });
  };

  const confirmStatusChange = async () => {
    if (!confirmModal) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/users/admin/${confirmModal.userId}/status`, {
        status: confirmModal.action,
      });
      setConfirmModal(null);
      await fetchUsers();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const providerLabel = (provider: string) => {
    const map: Record<string, string> = {
      local: '이메일',
      kakao: '카카오',
      naver: '네이버',
      google: '구글',
    };
    return map[provider] || provider;
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-4 text-lg font-bold text-white">유저 관리</h2>

      {/* 검색 + 필터 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="닉네임 또는 이메일 검색"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            검색
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value as StatusFilter)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
        >
          <option value="">전체</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
        </select>
      </div>

      {/* 에러 */}
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-white/50">
              <th className="px-3 py-2.5 font-medium">ID</th>
              <th className="px-3 py-2.5 font-medium">닉네임</th>
              <th className="px-3 py-2.5 font-medium">이메일</th>
              <th className="px-3 py-2.5 font-medium">가입 방식</th>
              <th className="px-3 py-2.5 font-medium">상태</th>
              <th className="px-3 py-2.5 font-medium">가입일</th>
              <th className="px-3 py-2.5 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-4 w-full rounded bg-white/5 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data && data.users.length > 0 ? (
              data.users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="px-3 py-3 text-white/60">{user.id}</td>
                  <td className="px-3 py-3 text-white">{user.nickname}</td>
                  <td className="px-3 py-3 text-white/60">{user.email || '-'}</td>
                  <td className="px-3 py-3 text-white/60">{providerLabel(user.provider)}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.status === 'ACTIVE'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-white/60 whitespace-nowrap">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    {user.role === 'ADMIN' ? (
                      <span className="text-xs text-white/30">관리자</span>
                    ) : user.status === 'ACTIVE' ? (
                      <button
                        onClick={() => handleStatusChange(user.id, user.nickname, 'SUSPENDED')}
                        className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        정지
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(user.id, user.nickname, 'ACTIVE')}
                        className="rounded-md border border-green-500/30 px-2.5 py-1 text-xs font-medium text-green-400 hover:bg-green-500/10 transition-colors"
                      >
                        해제
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-white/30">
                  검색 결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/20 transition-all disabled:opacity-30"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-white/50">
            {data.page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/20 transition-all disabled:opacity-30"
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 확인 모달 */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6">
            <h3 className="mb-3 text-base font-bold text-white">
              {confirmModal.action === 'SUSPENDED' ? '유저 정지' : '정지 해제'}
            </h3>
            <p className="mb-5 text-sm text-white/60">
              {confirmModal.action === 'SUSPENDED'
                ? `정말 "${confirmModal.nickname}" 유저를 정지하시겠습니까?`
                : `정말 "${confirmModal.nickname}" 유저의 정지를 해제하시겠습니까?`}
            </p>
            {actionError && (
              <p className="mb-3 text-sm text-red-400">{actionError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={actionLoading}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={actionLoading}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 ${
                  confirmModal.action === 'SUSPENDED'
                    ? 'bg-red-600 hover:opacity-90'
                    : 'bg-green-600 hover:opacity-90'
                }`}
              >
                {actionLoading
                  ? '처리 중...'
                  : confirmModal.action === 'SUSPENDED'
                    ? '정지'
                    : '해제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

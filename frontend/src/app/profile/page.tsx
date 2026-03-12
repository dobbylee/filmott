'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Check, X, AlertCircle, Eye, Bookmark, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { getErrorMessage } from '@/utils/error';
import type { User } from '@/types/auth';
import type { WatchlistCounts } from '@/types/watchlist';

// 닉네임 바이트 길이 계산 (한글 2바이트, 영문/숫자 1바이트)
function getNicknameByteLength(str: string): number {
  let len = 0;
  for (const ch of str) {
    len += /[\u3131-\uD79D]/.test(ch) ? 2 : 1;
  }
  return len;
}

const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9_]+$/;
const NICKNAME_MAX_BYTES = 16;
const NICKNAME_RESERVED = ['admin', 'filmott', 'deleted'];

function validateNickname(value: string): string | null {
  if (value.length < 2) return '닉네임은 2자 이상이어야 합니다.';
  if (!NICKNAME_REGEX.test(value)) return '한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.';
  if (getNicknameByteLength(value) > NICKNAME_MAX_BYTES) return '닉네임이 너무 깁니다. (한글 8자 / 영문 16자 이내)';
  if (NICKNAME_RESERVED.some((w) => value.toLowerCase().startsWith(w))) return '사용할 수 없는 닉네임입니다.';
  if (/\s/.test(value)) return '공백은 사용할 수 없습니다.';
  return null;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, updateUser, logout, openAuthModal } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      openAuthModal('login');
      router.replace('/');
    }
  }, [user, isLoading, router, openAuthModal]);

  // 닉네임 섹션
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [nicknameMessage, setNicknameMessage] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const nicknameTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nicknameInputRef = useRef<HTMLInputElement>(null);

  // 비밀번호 변경 모달
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwStep, setPwStep] = useState<'verify' | 'change'>('verify');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');
  const [isSubmittingPw, setIsSubmittingPw] = useState(false);

  // 워치리스트 카운트
  const [watchlistCounts, setWatchlistCounts] = useState<WatchlistCounts | null>(null);

  // 계정 삭제
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // user 로드 후 닉네임 동기화
  useEffect(() => {
    if (user) setNickname(user.nickname);
  }, [user]);

  // 워치리스트 카운트 로드
  useEffect(() => {
    if (!user) return;
    const fetchCounts = async () => {
      try {
        const res = await api.get<WatchlistCounts>('/watchlist/me/counts');
        setWatchlistCounts(res.data);
      } catch {
        // ignore
      }
    };
    fetchCounts();
  }, [user]);

  // 닉네임 편집 모드 진입 시 input 포커스
  useEffect(() => {
    if (isEditingNickname) {
      nicknameInputRef.current?.focus();
    }
  }, [isEditingNickname]);

  // 닉네임 중복 체크 (디바운스)
  const checkNickname = useCallback((value: string) => {
    if (nicknameTimerRef.current) clearTimeout(nicknameTimerRef.current);
    if (value === user?.nickname) {
      setNicknameStatus('idle');
      return;
    }
    const validationErr = validateNickname(value);
    if (validationErr) {
      setNicknameStatus('idle');
      return;
    }
    setNicknameStatus('checking');
    nicknameTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean }>(`/users/check-nickname/${encodeURIComponent(value)}`);
        setNicknameStatus(res.data.available ? 'available' : 'taken');
      } catch {
        setNicknameStatus('idle');
      }
    }, 400);
  }, [user?.nickname]);

  const handleNicknameChange = (value: string) => {
    setNickname(value);
    setNicknameMessage('');
    setNicknameError('');
    checkNickname(value);
  };

  const handleSaveNickname = async () => {
    setNicknameError('');
    setNicknameMessage('');

    if (!nickname || nickname === user?.nickname) {
      setIsEditingNickname(false);
      return;
    }
    const validationErr = validateNickname(nickname);
    if (validationErr) {
      setNicknameError(validationErr);
      return;
    }
    if (nicknameStatus === 'taken') {
      setNicknameError('이미 사용 중인 닉네임입니다.');
      return;
    }

    setIsSavingNickname(true);
    try {
      const response = await api.patch<User>('/users/me', { nickname });
      updateUser(response.data);
      setNicknameMessage('닉네임이 변경되었습니다.');
      setNicknameStatus('idle');
      setIsEditingNickname(false);
    } catch (err) {
      setNicknameError(getErrorMessage(err));
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleCancelNicknameEdit = () => {
    setNickname(user?.nickname ?? '');
    setNicknameError('');
    setNicknameMessage('');
    setNicknameStatus('idle');
    setIsEditingNickname(false);
  };

  // 비밀번호 모달 열기/닫기
  const openPwModal = () => {
    setShowPwModal(true);
    setPwStep('verify');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPwError('');
    setPwMessage('');
  };

  const closePwModal = () => {
    setShowPwModal(false);
    setPwStep('verify');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPwError('');
    setPwMessage('');
  };

  // 비밀번호 변경: 1단계 -- 서버에서 현재 비밀번호 확인
  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');

    if (!currentPassword) {
      setPwError('현재 비밀번호를 입력해주세요.');
      return;
    }
    if (currentPassword.length < 8) {
      setPwError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    setIsSubmittingPw(true);
    try {
      await api.post('/users/me/verify-password', { password: currentPassword });
      setPwStep('change');
      setPwError('');
    } catch (err) {
      setPwError(getErrorMessage(err));
    } finally {
      setIsSubmittingPw(false);
    }
  };

  // 비밀번호 변경: 2단계 -- 새 비밀번호 설정
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwMessage('');

    if (newPassword.length < 8) {
      setPwError('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPwError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsSubmittingPw(true);
    try {
      await api.patch('/users/me', {
        currentPassword,
        newPassword,
      });
      setPwMessage('비밀번호가 변경되었습니다.');
      setTimeout(() => closePwModal(), 1500);
    } catch (err) {
      setPwError(getErrorMessage(err));
    } finally {
      setIsSubmittingPw(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleDeleteAccount = async () => {
    try {
      await api.delete('/users/me');
      logout();
      router.push('/');
    } catch (err) {
      setNicknameError(getErrorMessage(err));
    }
  };

  if (isLoading || !user) {
    return (
      <div className="mx-auto max-w-lg px-4">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-20 w-20 rounded-full bg-white/5 animate-pulse" />
          <div className="h-6 w-32 rounded bg-white/5 animate-pulse" />
          <div className="h-4 w-48 rounded bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  const nicknameValidationErr = nickname !== user.nickname ? validateNickname(nickname) : null;
  const inputClass = 'w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 placeholder-white/30';

  return (
    <div className="mx-auto max-w-lg px-4 pb-12">
      {/* 프로필 헤더 */}
      <div className="flex flex-col items-center pt-4 pb-6">
        {/* 아바타 */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-600 to-blue-500 text-3xl font-bold text-white shadow-lg shadow-fuchsia-500/20">
          {user.nickname.charAt(0).toUpperCase()}
        </div>

        {/* 닉네임 */}
        <div className="mt-4 flex items-center gap-2">
          {isEditingNickname ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <input
                  ref={nicknameInputRef}
                  type="text"
                  value={nickname}
                  onChange={(e) => handleNicknameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNickname();
                    if (e.key === 'Escape') handleCancelNicknameEdit();
                  }}
                  className="w-40 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-center text-sm text-white outline-none focus:border-fuchsia-500/50"
                  maxLength={16}
                />
                <button
                  onClick={handleSaveNickname}
                  disabled={isSavingNickname || nicknameStatus === 'taken' || !!nicknameValidationErr}
                  className="rounded-full p-1.5 text-green-400 hover:bg-green-500/10 transition-colors disabled:text-white/20"
                  title="저장"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={handleCancelNicknameEdit}
                  className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                  title="취소"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {nicknameValidationErr && nickname !== user.nickname && (
                <p className="text-xs text-red-400">{nicknameValidationErr}</p>
              )}
              {!nicknameValidationErr && nicknameStatus === 'taken' && (
                <p className="text-xs text-red-400">이미 사용 중인 닉네임입니다.</p>
              )}
              {!nicknameValidationErr && nicknameStatus === 'available' && (
                <p className="text-xs text-green-400">사용 가능한 닉네임입니다.</p>
              )}
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white">{user.nickname}</h1>
              <button
                onClick={() => setIsEditingNickname(true)}
                className="rounded-full p-1.5 text-white/30 hover:bg-white/10 hover:text-white transition-colors"
                title="닉네임 수정"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {nicknameMessage && (
          <p className="mt-2 text-sm text-green-400">{nicknameMessage}</p>
        )}
        {nicknameError && (
          <p className="mt-2 text-sm text-red-400">{nicknameError}</p>
        )}

        <p className="mt-1 text-sm text-white/40">{user.email}</p>
      </div>

      {/* 비밀번호 변경 */}
      <div className="mb-4">
        <button
          onClick={openPwModal}
          className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white transition-all text-left"
        >
          비밀번호 변경
        </button>
      </div>

      {/* 워치리스트 통계 */}
      <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/profile/watchlist?status=watched"
            className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 transition-colors group"
          >
            <Eye className="h-5 w-5 text-green-400" />
            <span className="text-2xl font-bold text-white group-hover:text-green-400 transition-colors">
              {watchlistCounts?.watchedCount ?? 0}
            </span>
            <span className="text-xs text-white/50">감상한 작품</span>
          </Link>
          <Link
            href="/profile/watchlist?status=want_to_watch"
            className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 transition-colors group"
          >
            <Bookmark className="h-5 w-5 text-yellow-400" />
            <span className="text-2xl font-bold text-white group-hover:text-yellow-400 transition-colors">
              {watchlistCounts?.wantToWatchCount ?? 0}
            </span>
            <span className="text-xs text-white/50">감상할 작품</span>
          </Link>
        </div>
      </div>

      {/* 로그아웃 */}
      <div className="mb-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white transition-all"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </button>
      </div>

      {/* 회원 탈퇴 */}
      <div className="rounded-xl border border-red-500/20 bg-white/[0.02] p-5">
        <h2 className="mb-2 text-sm font-semibold text-red-400">계정 삭제</h2>
        <p className="mb-4 text-xs text-white/40">
          계정을 삭제하면 복구할 수 없습니다. 모든 데이터가 영구적으로 삭제됩니다.
        </p>

        {showDeleteConfirm ? (
          <div className="flex gap-3">
            <button
              onClick={handleDeleteAccount}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              정말 삭제합니다
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 transition-colors"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            계정 삭제
          </button>
        )}
      </div>

      {/* 비밀번호 변경 모달 */}
      {showPwModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-[#111] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">비밀번호 변경</h3>
              <button
                onClick={closePwModal}
                className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {pwMessage && (
              <div className="mb-4 rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400">
                {pwMessage}
              </div>
            )}
            {pwError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {pwError}
              </div>
            )}

            {pwStep === 'verify' && (
              <form onSubmit={handleVerifyPassword} className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-white/60">
                    현재 비밀번호
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="현재 비밀번호를 입력하세요"
                    autoFocus
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmittingPw}
                    className="flex-1 rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSubmittingPw ? '확인 중...' : '확인'}
                  </button>
                  <button
                    type="button"
                    onClick={closePwModal}
                    className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all"
                  >
                    취소
                  </button>
                </div>
              </form>
            )}

            {pwStep === 'change' && (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-white/60">
                    새 비밀번호
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    placeholder="8자 이상"
                    autoFocus
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="confirmNewPassword" className="mb-1 block text-sm font-medium text-white/60">
                    새 비밀번호 확인
                  </label>
                  <input
                    id="confirmNewPassword"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    minLength={8}
                    placeholder="새 비밀번호를 다시 입력하세요"
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmittingPw}
                    className="flex-1 rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSubmittingPw ? '변경 중...' : '비밀번호 변경'}
                  </button>
                  <button
                    type="button"
                    onClick={closePwModal}
                    className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all"
                  >
                    취소
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

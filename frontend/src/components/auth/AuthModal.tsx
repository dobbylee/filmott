'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/error';
import api from '@/lib/api';

const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9_]+$/;
const NICKNAME_MAX_BYTES = 16;
const NICKNAME_RESERVED = ['admin', 'filmott', 'deleted'];

function getNicknameByteLength(str: string): number {
  let len = 0;
  for (const ch of str) {
    len += /[\u3131-\uD79D]/.test(ch) ? 2 : 1;
  }
  return len;
}

function validateNickname(value: string): string | null {
  if (value.length < 2) return '닉네임은 2자 이상이어야 합니다.';
  if (!NICKNAME_REGEX.test(value)) return '한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.';
  if (getNicknameByteLength(value) > NICKNAME_MAX_BYTES) return '닉네임이 너무 깁니다. (한글 8자 / 영문 16자 이내)';
  if (NICKNAME_RESERVED.some((w) => value.toLowerCase().startsWith(w))) return '사용할 수 없는 닉네임입니다.';
  if (/\s/.test(value)) return '공백은 사용할 수 없습니다.';
  return null;
}

export default function AuthModal() {
  const { login, signup, authModal, openAuthModal, closeAuthModal } = useAuth();
  const { isOpen, mode } = authModal;

  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const backdropRef = useRef<HTMLDivElement>(null);
  const nicknameTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 폼 초기화
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setNickname('');
      setPassword('');
      setConfirmPassword('');
      setError('');
      setIsSubmitting(false);
      setNicknameStatus('idle');
    }
  }, [isOpen, mode]);

  // ESC 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuthModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeAuthModal]);

  // 닉네임 중복 체크 (디바운스, 유효성 통과 시만)
  const checkNickname = useCallback((value: string) => {
    if (nicknameTimerRef.current) clearTimeout(nicknameTimerRef.current);
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
  }, []);

  const handleNicknameChange = (value: string) => {
    setNickname(value);
    checkNickname(value);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) closeAuthModal();
  };

  const switchMode = () => {
    setError('');
    openAuthModal(mode === 'login' ? 'signup' : 'login');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login({ email, password });
      closeAuthModal();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const nicknameErr = validateNickname(nickname);
    if (nicknameErr) {
      setError(nicknameErr);
      return;
    }
    if (nicknameStatus === 'taken') {
      setError('이미 사용 중인 닉네임입니다.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signup({ email, nickname, password });
      closeAuthModal();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = 'w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 placeholder-white/30';

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-white/10 bg-[#111] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <button
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-full p-1 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-6 text-center text-xl font-bold text-white">
          {mode === 'login' ? '로그인' : '회원가입'}
        </h2>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-white/60">
                이메일
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="example@email.com"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-white/60">
                비밀번호
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="비밀번호를 입력하세요"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? '로그인 중...' : '로그인'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-white/60">
                이메일
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="example@email.com"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="auth-nickname" className="mb-1 block text-sm font-medium text-white/60">
                닉네임
                <span className="ml-1.5 text-xs text-white/30">한글 8자 / 영문 16자</span>
              </label>
              <div className="relative">
                <input
                  id="auth-nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => handleNicknameChange(e.target.value)}
                  required
                  minLength={2}
                  placeholder="2자 이상 닉네임"
                  className={`${inputClass} pr-9`}
                />
                {!validateNickname(nickname) && nicknameStatus === 'available' && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400" />
                )}
                {(nicknameStatus === 'taken' || (nickname.length >= 2 && validateNickname(nickname))) && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
                )}
              </div>
              {nickname.length >= 2 && validateNickname(nickname) && (
                <p className="mt-1 text-xs text-red-400">{validateNickname(nickname)}</p>
              )}
              {!validateNickname(nickname) && nicknameStatus === 'taken' && (
                <p className="mt-1 text-xs text-red-400">이미 사용 중인 닉네임입니다.</p>
              )}
              {!validateNickname(nickname) && nicknameStatus === 'available' && (
                <p className="mt-1 text-xs text-green-400">사용 가능한 닉네임입니다.</p>
              )}
            </div>
            <div>
              <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-white/60">
                비밀번호
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="8자 이상 비밀번호"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="auth-confirm" className="mb-1 block text-sm font-medium text-white/60">
                비밀번호 확인
              </label>
              <input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="비밀번호를 다시 입력하세요"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || nicknameStatus === 'taken'}
              className="w-full rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? '가입 중...' : '회원가입'}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-white/40">
          {mode === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}{' '}
          <button
            type="button"
            onClick={switchMode}
            className="font-medium text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
          >
            {mode === 'login' ? '회원가입' : '로그인'}
          </button>
        </p>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, AlertCircle, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { validateNickname } from '@/utils/nickname';
import { getErrorMessage } from '@/utils/error';
import { OTT_PROVIDERS } from '@/lib/ott-providers';
import api from '@/lib/api';
import type { AuthResponse } from '@/types/auth';

interface NicknameSetupModalProps {
  tempToken: string;
}

type Step = 'nickname' | 'ott';

export default function NicknameSetupModal({ tempToken }: NicknameSetupModalProps) {
  const { handleAuthSuccess } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('nickname');
  const [nickname, setNickname] = useState('');
  const [selectedOtts, setSelectedOtts] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const nicknameTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

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
    setError('');
    checkNickname(value);
  };

  const handleNextStep = () => {
    const nicknameErr = validateNickname(nickname);
    if (nicknameErr) {
      setError(nicknameErr);
      return;
    }
    if (nicknameStatus === 'taken') {
      setError('이미 사용 중인 닉네임입니다.');
      return;
    }
    if (nicknameStatus !== 'available') {
      return;
    }
    setError('');
    setStep('ott');
  };

  const handleToggleOtt = (ottId: string) => {
    setSelectedOtts((prev) =>
      prev.includes(ottId)
        ? prev.filter((id) => id !== ottId)
        : [...prev, ottId]
    );
  };

  const handleSubmit = async (skipOtts = false) => {
    setError('');
    setIsSubmitting(true);
    try {
      const response = await api.post<AuthResponse>('/auth/social/complete-signup', {
        tempToken,
        nickname,
        subscribedOtts: skipOtts ? [] : selectedOtts,
      });
      handleAuthSuccess(response.data);
      router.replace('/');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 placeholder-white/30';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-white/10 bg-[#111] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {step === 'nickname' ? (
          <>
            <h2 className="mb-2 text-center text-xl font-bold text-white">
              닉네임 설정
            </h2>
            <p className="mb-6 text-center text-sm text-white/50">
              서비스에서 사용할 닉네임을 설정해주세요
            </p>

            {error && (
              <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleNextStep(); }} className="space-y-4">
              <div>
                <label htmlFor="nickname-input" className="mb-1 block text-sm font-medium text-white/60">
                  닉네임
                  <span className="ml-1.5 text-xs text-white/30">한글 8자 / 영문 16자</span>
                </label>
                <div className="relative">
                  <input
                    id="nickname-input"
                    type="text"
                    value={nickname}
                    onChange={(e) => handleNicknameChange(e.target.value)}
                    required
                    minLength={2}
                    placeholder="2자 이상 닉네임"
                    className={`${inputClass} pr-9`}
                    autoFocus
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
              <button
                type="submit"
                disabled={nicknameStatus !== 'available' || !!validateNickname(nickname)}
                className="w-full rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                다음
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center mb-2">
              <button
                onClick={() => { setStep('nickname'); setError(''); }}
                className="mr-2 rounded-lg p-1 text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="이전 단계"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="flex-1 text-center text-xl font-bold text-white pr-7">
                OTT 구독 선택
              </h2>
            </div>
            <p className="mb-6 text-center text-sm text-white/50">
              구독 중인 OTT를 선택해주세요
            </p>

            {error && (
              <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-4">
              {OTT_PROVIDERS.map((ott) => {
                const isSelected = selectedOtts.includes(ott.id);
                return (
                  <button
                    key={ott.id}
                    type="button"
                    onClick={() => handleToggleOtt(ott.id)}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                      isSelected
                        ? 'border-fuchsia-500 bg-fuchsia-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                    }`}
                  >
                    <div className="relative h-10 w-10 overflow-hidden rounded-lg">
                      <Image
                        src={ott.logoUrl}
                        alt={ott.name}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    </div>
                    <span className={`text-xs font-medium ${isSelected ? 'text-fuchsia-400' : 'text-white/60'}`}>
                      {ott.name}
                    </span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-fuchsia-400" />
                    )}
                  </button>
                );
              })}
            </div>

            <p className="mb-4 text-center text-xs text-white/30">
              나중에 프로필에서 변경할 수 있어요
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="w-full rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? '설정 중...' : '시작하기'}
              </button>
              <button
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
                className="w-full rounded-lg px-4 py-2 text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                건너뛰기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

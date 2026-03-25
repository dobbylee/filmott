'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import SocialLoginButton from '@/components/auth/SocialLoginButton';

export default function AuthModal() {
  const { authModal, closeAuthModal } = useAuth();
  const { isOpen } = authModal;
  const backdropRef = useRef<HTMLDivElement>(null);

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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) closeAuthModal();
  };

  if (!isOpen) return null;

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

        <div className="mb-6">
          <p className="text-sm text-center text-white/50">로그인하면 취향에 맞는 추천을 받을 수 있어요</p>
        </div>

        <div className="space-y-3">
          <SocialLoginButton provider="google" />
          <SocialLoginButton provider="kakao" />
          <SocialLoginButton provider="naver" />
        </div>
      </div>
    </div>
  );
}

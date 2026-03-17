'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProfileImageUploader from '@/components/profile/ProfileImageUploader';
import NicknameEditor from '@/components/profile/NicknameEditor';
import WatchlistStats from '@/components/profile/WatchlistStats';
import DeleteAccountSection from '@/components/profile/DeleteAccountSection';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, updateUser, logout, openAuthModal } = useAuth();
  useEffect(() => {
    if (!isLoading && !user) {
      openAuthModal();
      router.replace('/');
    }
  }, [user, isLoading, router, openAuthModal]);

  const handleLogout = () => {
    logout();
    router.push('/');
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

  return (
    <div className="mx-auto max-w-lg px-4 pb-12">
      {/* 프로필 헤더 */}
      <div className="flex flex-col items-center pt-4 pb-6">
        {/* 아바타 */}
        <ProfileImageUploader user={user} updateUser={updateUser} />

        {/* 닉네임 */}
        <NicknameEditor user={user} updateUser={updateUser} />

        <p className="mt-1 text-sm text-white/40">{user.email}</p>
      </div>

      {/* 워치리스트 통계 */}
      <WatchlistStats userId={user.id} />

      {/* 로그아웃 */}
      <div className="mt-8 mb-8">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white transition-all"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </button>
      </div>

      {/* 회원 탈퇴 */}
      <DeleteAccountSection />

    </div>
  );
}

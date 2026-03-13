'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function SignupPage() {
  const router = useRouter();
  const { user, openAuthModal } = useAuth();

  useEffect(() => {
    if (user) {
      router.replace('/');
    } else {
      openAuthModal('signup');
      router.replace('/');
    }
  }, [user, openAuthModal, router]);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
    </div>
  );
}

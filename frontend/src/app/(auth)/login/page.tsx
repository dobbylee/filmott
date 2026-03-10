'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { user, openAuthModal } = useAuth();

  useEffect(() => {
    if (user) {
      router.replace('/');
    } else {
      openAuthModal('login');
      router.replace('/');
    }
  }, [user, openAuthModal, router]);

  return null;
}

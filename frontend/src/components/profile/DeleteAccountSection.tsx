'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { getErrorMessage } from '@/utils/error';

export default function DeleteAccountSection() {
  const router = useRouter();
  const { logout } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    try {
      await api.delete('/users/me');
      logout();
      router.push('/');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="rounded-xl border border-red-500/20 bg-white/[0.02] p-5">
      <h2 className="mb-2 text-sm font-semibold text-red-400">계정 삭제</h2>
      <p className="mb-4 text-xs text-white/40">
        계정을 삭제하면 복구할 수 없습니다. 모든 데이터가 영구적으로 삭제됩니다.
      </p>

      {error && (
        <p className="mb-3 text-sm text-red-400">{error}</p>
      )}

      {showConfirm ? (
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            정말 삭제합니다
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 transition-colors"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowConfirm(true)}
          className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
        >
          계정 삭제
        </button>
      )}
    </div>
  );
}

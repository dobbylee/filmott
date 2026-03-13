'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import api from '@/lib/api';
import { getErrorMessage } from '@/utils/error';
import { validateNickname } from '@/utils/nickname';
import type { User } from '@/types/auth';

interface NicknameEditorProps {
  user: User;
  updateUser: (user: User) => void;
}

export default function NicknameEditor({ user, updateUser }: NicknameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState(user.nickname);
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNickname(user.nickname);
  }, [user]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const checkNickname = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value === user.nickname) {
      setStatus('idle');
      return;
    }
    const validationErr = validateNickname(value);
    if (validationErr) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean }>(`/users/check-nickname/${encodeURIComponent(value)}`);
        setStatus(res.data.available ? 'available' : 'taken');
      } catch {
        setStatus('idle');
      }
    }, 400);
  }, [user.nickname]);

  const handleChange = (value: string) => {
    setNickname(value);
    setMessage('');
    setError('');
    checkNickname(value);
  };

  const handleSave = async () => {
    setError('');
    setMessage('');

    if (!nickname || nickname === user.nickname) {
      setIsEditing(false);
      return;
    }
    const validationErr = validateNickname(nickname);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    if (status === 'taken') {
      setError('이미 사용 중인 닉네임입니다.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.patch<User>('/users/me', { nickname });
      updateUser(response.data);
      setMessage('닉네임이 변경되었습니다.');
      setStatus('idle');
      setIsEditing(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setNickname(user.nickname);
    setError('');
    setMessage('');
    setStatus('idle');
    setIsEditing(false);
  };

  const validationErr = nickname !== user.nickname ? validateNickname(nickname) : null;

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        {isEditing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={nickname}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
                className="w-40 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-center text-sm text-white outline-none focus:border-fuchsia-500/50"
                maxLength={16}
              />
              <button
                onClick={handleSave}
                disabled={isSaving || status === 'taken' || !!validationErr}
                className="rounded-full p-1.5 text-green-400 hover:bg-green-500/10 transition-colors disabled:text-white/20"
                title="저장"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={handleCancel}
                className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                title="취소"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {validationErr && nickname !== user.nickname && (
              <p className="text-xs text-red-400">{validationErr}</p>
            )}
            {!validationErr && status === 'taken' && (
              <p className="text-xs text-red-400">이미 사용 중인 닉네임입니다.</p>
            )}
            {!validationErr && status === 'available' && (
              <p className="text-xs text-green-400">사용 가능한 닉네임입니다.</p>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-white">{user.nickname}</h1>
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-full p-1.5 text-white/30 hover:bg-white/10 hover:text-white transition-colors"
              title="닉네임 수정"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {message && (
        <p className="mt-2 text-sm text-green-400">{message}</p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
    </>
  );
}

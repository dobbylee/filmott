'use client';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import TmdbImage from '@/components/common/TmdbImage';
import { useAuth } from '@/contexts/AuthContext';
import { OTT_PROVIDERS } from '@/lib/ott-providers';
import { getErrorMessage } from '@/utils/error';
import api from '@/lib/api';
import type { User } from '@/types/auth';

export default function OttSubscriptions() {
  const { user, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const subscribedOtts = user.subscribedOtts ?? [];

  const handleStartEdit = () => {
    setSelected([...subscribedOtts]);
    setIsEditing(true);
    setError('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setError('');
  };

  const handleToggle = (ottId: string) => {
    setSelected((prev) =>
      prev.includes(ottId)
        ? prev.filter((id) => id !== ottId)
        : [...prev, ottId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const response = await api.patch<User>('/users/me/otts', { otts: selected });
      updateUser(response.data);
      setIsEditing(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const subscribedProviders = OTT_PROVIDERS.filter((p) => subscribedOtts.includes(p.id));

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white/80">구독 중인 OTT</h3>
        {!isEditing ? (
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            변경
          </button>
        ) : (
          <button
            onClick={handleCancelEdit}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            <X className="h-3 w-3" />
            취소
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {isEditing ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {OTT_PROVIDERS.map((ott) => {
              const isSelected = selected.includes(ott.id);
              return (
                <button
                  key={ott.id}
                  type="button"
                  onClick={() => handleToggle(ott.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all ${
                    isSelected
                      ? 'border-fuchsia-500 bg-fuchsia-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                  }`}
                >
                  <div className="relative h-8 w-8 overflow-hidden rounded-lg">
                    <TmdbImage
                      src={ott.logoUrl}
                      alt={ott.name}
                      fill
                      className="object-cover"
                      sizes="32px"
                    />
                  </div>
                  <span className={`text-[10px] font-medium ${isSelected ? 'text-fuchsia-400' : 'text-white/50'}`}>
                    {ott.name}
                  </span>
                  {isSelected && (
                    <Check className="h-3 w-3 text-fuchsia-400" />
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-3 py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </>
      ) : (
        <>
          {subscribedProviders.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {subscribedProviders.map((ott) => (
                <div
                  key={ott.id}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"
                >
                  <div className="relative h-5 w-5 overflow-hidden rounded">
                    <TmdbImage
                      src={ott.logoUrl}
                      alt={ott.name}
                      fill
                      className="object-cover"
                      sizes="20px"
                    />
                  </div>
                  <span className="text-xs text-white/60">{ott.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/30">구독 중인 OTT가 없습니다</p>
          )}
        </>
      )}
    </div>
  );
}

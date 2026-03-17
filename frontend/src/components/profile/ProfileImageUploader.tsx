'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, X, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import type { User } from '@/types/auth';

interface ProfileImageUploaderProps {
  user: User;
  updateUser: (user: User) => void;
}

export default function ProfileImageUploader({ user, updateUser }: ProfileImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 입력 리셋 (같은 파일 재선택 가능)
    e.target.value = '';

    setIsUploading(true);
    setImgError(false);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await api.post<User>('/users/me/profile-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser(data);
    } catch {
      // 에러는 무시 (toast 등 추가 가능)
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUploading) return;

    setIsUploading(true);
    try {
      const { data } = await api.delete<User>('/users/me/profile-image');
      updateUser(data);
      setImgError(false);
    } catch {
      // 에러는 무시
    } finally {
      setIsUploading(false);
    }
  };

  const showImage = user.profileImage && !imgError;
  const initial = user.nickname.charAt(0).toUpperCase();

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={handleClick}
        className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-700 to-indigo-600 text-3xl font-bold text-white shadow-lg shadow-fuchsia-500/20 overflow-hidden focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all"
        aria-label="프로필 이미지 변경"
      >
        {showImage ? (
          <Image
            src={user.profileImage!}
            alt={user.nickname}
            width={80}
            height={80}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          initial
        )}

        {/* 호버 오버레이 */}
        {!isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="h-6 w-6 text-white" />
          </div>
        )}

        {/* 업로드 중 오버레이 */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
      </button>

      {/* 삭제 버튼 (이미지가 있을 때만) */}
      {showImage && !isUploading && (
        <button
          type="button"
          onClick={handleDelete}
          className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
          aria-label="프로필 이미지 삭제"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

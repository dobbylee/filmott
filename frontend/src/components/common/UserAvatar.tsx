'use client';

import { useState } from 'react';
import Image from 'next/image';
import { isDeletedUser } from '@/utils/user';

interface UserAvatarProps {
  user?: { nickname: string; status?: string; profileImage?: string } | null;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-7 w-7 text-xs',
  lg: 'h-8 w-8 text-sm',
};

const pixelSizeMap = {
  sm: 24,
  md: 28,
  lg: 32,
};

export default function UserAvatar({ user, size = 'md' }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const deleted = isDeletedUser(user);
  const initial = deleted ? '?' : (user?.nickname?.charAt(0)?.toUpperCase() ?? '?');
  const profileImage = deleted ? undefined : user?.profileImage;
  const showImage = profileImage && !imgError;

  return (
    <div className={`relative flex items-center justify-center rounded-full font-medium flex-shrink-0 overflow-hidden ${sizeMap[size]} ${
      deleted ? 'bg-muted text-muted-foreground' : 'bg-gradient-to-tr from-fuchsia-700 to-indigo-600 text-white'
    }`}>
      {showImage ? (
        <Image
          src={profileImage}
          alt={user?.nickname ?? ''}
          width={pixelSizeMap[size]}
          height={pixelSizeMap[size]}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initial
      )}
    </div>
  );
}

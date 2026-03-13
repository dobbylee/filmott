import { isDeletedUser } from '@/utils/user';

interface UserAvatarProps {
  user?: { nickname: string; status?: string; } | null;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-7 w-7 text-xs',
  lg: 'h-8 w-8 text-sm',
};

export default function UserAvatar({ user, size = 'md' }: UserAvatarProps) {
  const deleted = isDeletedUser(user);
  const initial = deleted ? '?' : (user?.nickname?.charAt(0)?.toUpperCase() ?? '?');
  return (
    <div className={`flex items-center justify-center rounded-full font-medium flex-shrink-0 ${sizeMap[size]} ${
      deleted ? 'bg-muted text-muted-foreground' : 'bg-gradient-to-tr from-fuchsia-700 to-indigo-600 text-white'
    }`}>
      {initial}
    </div>
  );
}

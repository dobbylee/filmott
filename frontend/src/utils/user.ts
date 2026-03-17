export function getDisplayNickname(user: { nickname?: string; status?: string } | null | undefined): string {
  if (!user) return '알 수 없음';
  if (user.status === 'DELETED') return '탈퇴한 사용자';
  if (user.status === 'SUSPENDED') return '정지된 사용자';
  return user.nickname ?? '알 수 없음';
}

export function isDeletedUser(user: { status?: string } | null | undefined): boolean {
  return user?.status === 'DELETED';
}

/** 탈퇴 또는 정지된 유저 — 프로필 링크 비활성용 */
export function isInactiveUser(user: { status?: string } | null | undefined): boolean {
  return user?.status === 'DELETED' || user?.status === 'SUSPENDED';
}

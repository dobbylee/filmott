export function getLastWeekDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    .replace(/-/g, '');
}

export function getLastWeekTargetDate(): string {
  return formatDateWithDashes(getLastWeekDate());
}

export function getYesterdayDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  // Asia/Seoul 기준 YYYYMMDD
  return date
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    .replace(/-/g, '');
}

export function getYesterdayTargetDate(): string {
  return formatDateWithDashes(getYesterdayDate());
}

export function getTodayDate(): string {
  // Asia/Seoul 기준 YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

/**
 * YYYYMMDD -> YYYY-MM-DD 변환
 */
export function formatDateWithDashes(dateStr: string): string {
  return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

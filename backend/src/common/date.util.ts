export function getKoreaDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  }

  return `${year}-${month}-${day}`;
}

export function normalizeKoreaDateInput(date: string | undefined): string {
  if (!date) return getKoreaDateString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return getKoreaDateString();
  return getKoreaDateString(parsed);
}

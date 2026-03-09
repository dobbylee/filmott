const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const KOBIS_BASE_URL = 'http://www.kobis.or.kr/kobisopenapi/webservice/rest';
const TIMEOUT_MS = 10_000;

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return fetchJson<T>(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
}

export async function kobisFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const apiKey = process.env.KOBIS_API_KEY;
  if (!apiKey) {
    throw new Error('KOBIS_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const url = new URL(`${KOBIS_BASE_URL}${path}`);
  url.searchParams.set('key', apiKey);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return fetchJson<T>(url.toString());
}

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { ContentsService } from '../contents/contents.service';

interface DiscoverResult {
  id: number;
  title?: string;
  name?: string;
}

interface DiscoverResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: DiscoverResult[];
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDiscoverPage(
  apiKey: string,
  params: Record<string, string | number>,
): Promise<DiscoverResponse> {
  const url = new URL(`${TMDB_BASE_URL}/discover/movie`);
  url.searchParams.set('language', 'ko-KR');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB API 오류: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<DiscoverResponse>;
}

async function collectTmdbIds(
  apiKey: string,
  label: string,
  params: Record<string, string | number>,
  maxPages: number,
): Promise<Set<number>> {
  const ids = new Set<number>();

  // 첫 페이지를 가져와서 총 페이지 수 확인
  const firstPage = await fetchDiscoverPage(apiKey, { ...params, page: 1 });
  const totalPages = Math.min(firstPage.total_pages, maxPages);

  console.log(`[${label}] 총 ${firstPage.total_results}개 작품, ${totalPages}페이지 수집 시작`);

  for (const item of firstPage.results) {
    ids.add(item.id);
  }

  for (let page = 2; page <= totalPages; page++) {
    await sleep(100); // Rate limit: 100ms 딜레이

    try {
      const data = await fetchDiscoverPage(apiKey, { ...params, page });
      for (const item of data.results) {
        ids.add(item.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  페이지 ${page} 실패: ${message}`);
    }

    if (page % 10 === 0) {
      console.log(`  [${label}] ${page}/${totalPages} 페이지 완료 (${ids.size}개 수집)`);
    }
  }

  console.log(`[${label}] 수집 완료: ${ids.size}개`);
  return ids;
}

async function main() {
  const startTime = Date.now();

  const app = await NestFactory.createApplicationContext(AppModule);
  const configService = app.get(ConfigService);
  const contentsService = app.get(ContentsService);

  const apiKey = configService.get<string>('TMDB_API_KEY');
  if (!apiKey) {
    console.error('TMDB_API_KEY 환경변수가 설정되지 않았습니다.');
    await app.close();
    process.exit(1);
  }

  console.log('=== TMDB 콘텐츠 벌크 수집 시작 ===\n');

  // 1. 인기 영화 수집 (vote_count >= 1000, 최대 200페이지)
  const popularIds = await collectTmdbIds(
    apiKey,
    '인기 영화',
    {
      sort_by: 'vote_count.desc',
      'vote_count.gte': 1000,
    },
    200,
  );

  // 2. 최신 영화 수집 (2년 이내, vote_count >= 50, 최대 50페이지)
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
  const releaseDateGte = twoYearsAgo.toISOString().split('T')[0];

  const recentIds = await collectTmdbIds(
    apiKey,
    '최신 영화',
    {
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
      'release_date.gte': releaseDateGte,
    },
    50,
  );

  // 3. 중복 제거
  const allIds = new Set<number>([...popularIds, ...recentIds]);
  console.log(`\n중복 제거 후 총 ${allIds.size}개 작품 (인기 ${popularIds.size} + 최신 ${recentIds.size})`);

  // 4. DB 저장
  console.log('\n=== DB 저장 시작 ===\n');
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const total = allIds.size;
  const idArray = Array.from(allIds);

  for (let i = 0; i < idArray.length; i++) {
    const tmdbId = idArray[i];

    try {
      await contentsService.findOrFetchByTmdbId(tmdbId, 'movie');
      saved++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  tmdbId=${tmdbId} 저장 실패: ${message}`);
      failed++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  진행: ${i + 1}/${total} (저장=${saved}, 스킵 포함, 실패=${failed})`);
    }

    // findOrFetchByTmdbId가 이미 DB에 있으면 TMDB API를 호출하지 않으므로
    // 신규 저장 시에만 TMDB API 호출이 발생함. 안전하게 50ms 딜레이
    await sleep(50);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== TMDB 콘텐츠 벌크 수집 완료 ===');
  console.log(`총 처리: ${total}개 (저장/스킵=${saved}, 실패=${failed})`);
  console.log(`소요 시간: ${elapsed}초`);

  await app.close();
}

main().catch((error) => {
  console.error('벌크 수집 스크립트 실행 실패:', error);
  process.exit(1);
});

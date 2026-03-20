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
  mediaType: 'movie' | 'tv',
  params: Record<string, string | number>,
): Promise<DiscoverResponse> {
  const url = new URL(`${TMDB_BASE_URL}/discover/${mediaType}`);
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
  mediaType: 'movie' | 'tv',
  params: Record<string, string | number>,
  maxPages: number,
): Promise<Set<number>> {
  const ids = new Set<number>();

  // 첫 페이지를 가져와서 총 페이지 수 확인
  const firstPage = await fetchDiscoverPage(apiKey, mediaType, { ...params, page: 1 });
  const totalPages = Math.min(firstPage.total_pages, maxPages);

  console.log(`[${label}] 총 ${firstPage.total_results}개 작품, ${totalPages}페이지 수집 시작`);

  for (const item of firstPage.results) {
    ids.add(item.id);
  }

  for (let page = 2; page <= totalPages; page++) {
    await sleep(100); // Rate limit: 100ms 딜레이

    try {
      const data = await fetchDiscoverPage(apiKey, mediaType, { ...params, page });
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
  const popularMovieIds = await collectTmdbIds(
    apiKey,
    '인기 영화',
    'movie',
    {
      sort_by: 'vote_count.desc',
      'vote_count.gte': 1000,
    },
    200,
  );

  // 2. 최신 영화 수집 (2년 이내, vote_count >= 50, 최대 50페이지)
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
  const releaseDateGte = twoYearsAgo.toISOString().split('T')[0];

  const recentMovieIds = await collectTmdbIds(
    apiKey,
    '최신 영화',
    'movie',
    {
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
      'release_date.gte': releaseDateGte,
    },
    50,
  );

  // 3. 인기 TV 시리즈 수집 (vote_count >= 500, 최대 50페이지)
  const popularTvIds = await collectTmdbIds(
    apiKey,
    '인기 TV 시리즈',
    'tv',
    {
      sort_by: 'vote_count.desc',
      'vote_count.gte': 500,
    },
    50,
  );

  // 4. 영화 중복 제거
  const allMovieIds = new Set<number>([...popularMovieIds, ...recentMovieIds]);
  console.log(`\n영화 중복 제거 후 ${allMovieIds.size}개 (인기 ${popularMovieIds.size} + 최신 ${recentMovieIds.size})`);
  console.log(`TV 시리즈: ${popularTvIds.size}개`);
  console.log(`총 ${allMovieIds.size + popularTvIds.size}개 작품`);

  // 5. DB 저장 — 영화
  console.log('\n=== DB 저장 시작 (영화) ===\n');
  let saved = 0;
  let failed = 0;
  const movieIdArray = Array.from(allMovieIds);

  for (let i = 0; i < movieIdArray.length; i++) {
    const tmdbId = movieIdArray[i];

    try {
      await contentsService.findOrFetchByTmdbId(tmdbId, 'movie');
      saved++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  [movie] tmdbId=${tmdbId} 저장 실패: ${message}`);
      failed++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  [영화] ${i + 1}/${movieIdArray.length} (저장=${saved}, 실패=${failed})`);
    }

    await sleep(50);
  }

  // 6. DB 저장 — TV 시리즈
  console.log('\n=== DB 저장 시작 (TV 시리즈) ===\n');
  let tvSaved = 0;
  let tvFailed = 0;
  const tvIdArray = Array.from(popularTvIds);

  for (let i = 0; i < tvIdArray.length; i++) {
    const tmdbId = tvIdArray[i];

    try {
      await contentsService.findOrFetchByTmdbId(tmdbId, 'tv');
      tvSaved++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  [tv] tmdbId=${tmdbId} 저장 실패: ${message}`);
      tvFailed++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  [TV] ${i + 1}/${tvIdArray.length} (저장=${tvSaved}, 실패=${tvFailed})`);
    }

    await sleep(50);
  }

  const total = allMovieIds.size + popularTvIds.size;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== TMDB 콘텐츠 벌크 수집 완료 ===');
  console.log(`영화: ${allMovieIds.size}개 (저장=${saved}, 실패=${failed})`);
  console.log(`TV: ${popularTvIds.size}개 (저장=${tvSaved}, 실패=${tvFailed})`);
  console.log(`총 처리: ${total}개`);
  console.log(`소요 시간: ${elapsed}초`);

  await app.close();
}

main().catch((error) => {
  console.error('벌크 수집 스크립트 실행 실패:', error);
  process.exit(1);
});

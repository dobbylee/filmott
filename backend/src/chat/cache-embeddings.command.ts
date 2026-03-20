import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { ContentsService } from '../contents/contents.service';
import { EmbeddingService } from './embedding.service';

interface DiscoverResult {
  id: number;
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
    throw new Error(`TMDB API 오류: ${response.status}`);
  }

  return response.json() as Promise<DiscoverResponse>;
}

async function collectTmdbIds(
  apiKey: string,
  label: string,
  mediaType: 'movie' | 'tv',
  params: Record<string, string | number>,
  maxPages: number,
): Promise<{ id: number; type: 'movie' | 'tv' }[]> {
  const items: { id: number; type: 'movie' | 'tv' }[] = [];
  const seen = new Set<string>();

  const firstPage = await fetchDiscoverPage(apiKey, mediaType, { ...params, page: 1 });
  const totalPages = Math.min(firstPage.total_pages, maxPages);
  console.log(`[${label}] ${firstPage.total_results}개 중 ${totalPages}페이지 수집`);

  for (const item of firstPage.results) {
    const key = `${mediaType}:${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ id: item.id, type: mediaType });
    }
  }

  for (let page = 2; page <= totalPages; page++) {
    await sleep(100);
    try {
      const data = await fetchDiscoverPage(apiKey, mediaType, { ...params, page });
      for (const item of data.results) {
        const key = `${mediaType}:${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ id: item.id, type: mediaType });
        }
      }
    } catch (error) {
      console.error(`  페이지 ${page} 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (page % 10 === 0) {
      console.log(`  [${label}] ${page}/${totalPages}페이지 (${items.length}개)`);
    }
  }

  console.log(`[${label}] 수집 완료: ${items.length}개`);
  return items;
}

async function main() {
  const startTime = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule);
  const configService = app.get(ConfigService);
  const contentsService = app.get(ContentsService);
  const embeddingService = app.get(EmbeddingService);

  const apiKey = configService.get<string>('TMDB_API_KEY');
  if (!apiKey) {
    console.error('TMDB_API_KEY 환경변수가 필요합니다.');
    await app.close();
    process.exit(1);
  }

  console.log('=== 임베딩 캐싱 배치 시작 ===\n');

  // 1. TMDB discover로 대상 수집
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const allItems: { id: number; type: 'movie' | 'tv' }[] = [];

  const popularMovies = await collectTmdbIds(apiKey, '인기 영화', 'movie', {
    sort_by: 'vote_count.desc',
    'vote_count.gte': 1000,
  }, 200);
  allItems.push(...popularMovies);

  const recentMovies = await collectTmdbIds(apiKey, '최신 영화', 'movie', {
    sort_by: 'popularity.desc',
    'vote_count.gte': 50,
    'release_date.gte': twoYearsAgo,
  }, 50);
  // 중복 제거
  const movieSeen = new Set(popularMovies.map((i) => i.id));
  for (const item of recentMovies) {
    if (!movieSeen.has(item.id)) {
      allItems.push(item);
    }
  }

  const popularTv = await collectTmdbIds(apiKey, '인기 TV', 'tv', {
    sort_by: 'vote_count.desc',
    'vote_count.gte': 500,
  }, 50);
  allItems.push(...popularTv);

  console.log(`\n총 ${allItems.length}개 작품 대상\n`);

  // 2. 각 작품: getContentDetail(메타데이터 갱신) → cacheContentMetadata(임베딩)
  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < allItems.length; i++) {
    const { id: tmdbId, type } = allItems[i];

    try {
      // getContentDetail로 최신 메타데이터 갱신 (director, originCountry, watchProviders, voteCount)
      await contentsService.getContentDetail(tmdbId, type);
      await sleep(50);

      // DB에서 content ID 조회
      const content = await contentsService.findOrFetchByTmdbId(tmdbId, type);

      // 임베딩 캐싱 (이미 있으면 스킵)
      const result = await embeddingService.cacheContentMetadata(content.id);
      if (result) {
        cached++;
      } else {
        skipped++;
      }
    } catch (error) {
      failed++;
      if (failed <= 10) {
        console.error(`  [${type}/${tmdbId}] 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ${i + 1}/${allItems.length} (캐싱=${cached}, 스킵=${skipped}, 실패=${failed}) [${elapsed}초]`);
    }

    await sleep(100); // OpenAI rate limit
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=== 임베딩 캐싱 배치 완료 ===');
  console.log(`총 ${allItems.length}개 처리: 캐싱=${cached}, 스킵=${skipped}, 실패=${failed}`);
  console.log(`소요 시간: ${elapsed}초`);

  await app.close();
}

main().catch((error) => {
  console.error('배치 실패:', error);
  process.exit(1);
});

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
const CONCURRENCY = 5;

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

interface CacheItemResult {
  status: 'cached' | 'skipped' | 'failed';
}

async function processItem(
  item: { id: number; type: 'movie' | 'tv' },
  contentsService: ContentsService,
  embeddingService: EmbeddingService,
  existingContentIds: Set<number>,
  tmdbToContentId: Map<string, number>,
): Promise<CacheItemResult> {
  const { id: tmdbId, type } = item;

  const contentId = tmdbToContentId.get(`${type}:${tmdbId}`);
  if (contentId && existingContentIds.has(contentId)) {
    return { status: 'skipped' };
  }

  try {
    await contentsService.getContentDetail(tmdbId, type);
    await sleep(50);

    const content = await contentsService.findOrFetchByTmdbId(tmdbId, type);

    const result = await embeddingService.cacheContentMetadata(content.id);
    return { status: result ? 'cached' : 'skipped' };
  } catch {
    return { status: 'failed' };
  }
}

async function processBatchParallel(
  items: { id: number; type: 'movie' | 'tv' }[],
  contentsService: ContentsService,
  embeddingService: EmbeddingService,
  existingContentIds: Set<number>,
  tmdbToContentId: Map<string, number>,
  startTime: number,
): Promise<{ cached: number; skipped: number; failed: number }> {
  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map((item) =>
        processItem(item, contentsService, embeddingService, existingContentIds, tmdbToContentId),
      ),
    );

    for (const r of results) {
      if (r.status === 'cached') cached++;
      else if (r.status === 'skipped') skipped++;
      else failed++;
    }

    const processed = Math.min(i + CONCURRENCY, items.length);
    if (processed % 50 < CONCURRENCY || processed === items.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ${processed}/${items.length} (캐싱=${cached}, 스킵=${skipped}, 실패=${failed}) [${elapsed}초]`);
    }
  }

  return { cached, skipped, failed };
}

async function main() {
  const mode = process.argv[2];
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

  console.log(`=== 임베딩 캐싱 배치 시작 (동시 ${CONCURRENCY}개) ===\n`);

  const allItems: { id: number; type: 'movie' | 'tv' }[] = [];
  const globalSeen = new Set<string>();

  function addItems(items: { id: number; type: 'movie' | 'tv' }[]) {
    for (const item of items) {
      const key = `${item.type}:${item.id}`;
      if (!globalSeen.has(key)) {
        globalSeen.add(key);
        allItems.push(item);
      }
    }
  }

  if (mode === 'kr') {
    // 한국 작품만 캐싱
    console.log('[모드] 한국 작품 (vote_count >= 5)\n');

    const krMovies = await collectTmdbIds(apiKey, '한국 영화', 'movie', {
      with_origin_country: 'KR',
      sort_by: 'vote_count.desc',
      'vote_count.gte': 5,
    }, 500);
    addItems(krMovies);

    const krTv = await collectTmdbIds(apiKey, '한국 TV', 'tv', {
      with_origin_country: 'KR',
      sort_by: 'vote_count.desc',
      'vote_count.gte': 5,
    }, 500);
    addItems(krTv);
  } else {
    // 기존 글로벌 캐싱
    console.log('[모드] 글로벌\n');

    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const popularMovies = await collectTmdbIds(apiKey, '인기 영화', 'movie', {
      sort_by: 'vote_count.desc',
      'vote_count.gte': 1000,
    }, 200);
    addItems(popularMovies);

    const recentMovies = await collectTmdbIds(apiKey, '최신 영화', 'movie', {
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
      'release_date.gte': twoYearsAgo,
    }, 50);
    addItems(recentMovies);

    const popularTv = await collectTmdbIds(apiKey, '인기 TV', 'tv', {
      sort_by: 'vote_count.desc',
      'vote_count.gte': 500,
    }, 50);
    addItems(popularTv);

    const fourYearsAgo = new Date(Date.now() - 4 * 365 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const recentTv = await collectTmdbIds(apiKey, '최신 TV (KR)', 'tv', {
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
      'first_air_date.gte': fourYearsAgo,
      watch_region: 'KR',
    }, 25);
    addItems(recentTv);
  }

  console.log(`\n총 ${allItems.length}개 작품 대상\n`);

  // 이미 캐싱된 content_id 조회 (skip용)
  const { DataSource } = require('typeorm');
  const ds = app.get(DataSource);
  const existingRows: { content_id: number }[] = await ds.query(
    'SELECT content_id FROM content_metadata',
  );
  const existingContentIds = new Set(existingRows.map((r: { content_id: number }) => r.content_id));

  const tmdbToContentId = new Map<string, number>();
  const contentRows: { id: number; tmdb_id: number; content_type: string }[] = await ds.query(
    'SELECT id, tmdb_id, content_type FROM contents',
  );
  for (const r of contentRows) {
    tmdbToContentId.set(`${r.content_type}:${r.tmdb_id}`, r.id);
  }

  console.log(`이미 캐싱됨: ${existingContentIds.size}개 (skip 대상)\n`);

  const { cached, skipped, failed } = await processBatchParallel(
    allItems,
    contentsService,
    embeddingService,
    existingContentIds,
    tmdbToContentId,
    startTime,
  );

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

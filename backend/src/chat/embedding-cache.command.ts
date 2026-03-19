import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EmbeddingService } from './embedding.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const embeddingService = app.get(EmbeddingService);

  console.log('=== 임베딩 캐싱 배치 시작 ===');

  // 1. 인기 작품 (vote_count >= 1000)
  console.log('\n[1/2] 인기 작품 캐싱 (vote_count >= 1000)...');
  const popularResult = await embeddingService.batchCacheMetadata({
    minVoteCount: 1000,
    minReleaseDate: null,
  });
  console.log(`인기 작품: cached=${popularResult.cached}, skipped=${popularResult.skipped}, failed=${popularResult.failed}`);

  // 2. 최신 작품 (2년 이내, vote_count >= 50)
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
  console.log(`\n[2/2] 최신 작품 캐싱 (2년 이내, vote_count >= 50)...`);
  const recentResult = await embeddingService.batchCacheMetadata({
    minVoteCount: 50,
    minReleaseDate: twoYearsAgo,
  });
  console.log(`최신 작품: cached=${recentResult.cached}, skipped=${recentResult.skipped}, failed=${recentResult.failed}`);

  console.log('\n=== 임베딩 캐싱 배치 완료 ===');
  console.log(`총 결과: cached=${popularResult.cached + recentResult.cached}, skipped=${popularResult.skipped + recentResult.skipped}, failed=${popularResult.failed + recentResult.failed}`);

  await app.close();
}

main().catch((error) => {
  console.error('배치 스크립트 실행 실패:', error);
  process.exit(1);
});

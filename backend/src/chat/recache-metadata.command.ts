import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { EmbeddingService } from './embedding.service';

const CONCURRENCY = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startTime = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule);
  const embeddingService = app.get(EmbeddingService);
  const ds = app.get(DataSource);

  const rows: { content_id: number }[] = await ds.query(
    'SELECT content_id FROM content_metadata ORDER BY content_id',
  );

  console.log(`=== metadata 재캐싱 시작 (${rows.length}건, 동시 ${CONCURRENCY}개) ===\n`);

  let cached = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((row) => embeddingService.cacheContentMetadata(row.content_id, true)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) cached++;
      else failed++;
    }

    const processed = Math.min(i + CONCURRENCY, rows.length);
    if (processed % 50 < CONCURRENCY || processed === rows.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ${processed}/${rows.length} (캐싱=${cached}, 실패=${failed}) [${elapsed}초]`);
    }

    await sleep(100);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== 재캐싱 완료: ${cached}건 성공, ${failed}건 실패 (${elapsed}초) ===`);

  await app.close();
}

main().catch((error) => {
  console.error('재캐싱 실패:', error);
  process.exit(1);
});

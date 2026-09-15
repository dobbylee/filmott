import { ModulesContainer } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ContentCatalogService } from '../src/contents/services/content-catalog.service';
import { ContentIndexingService } from '../src/contents/services/content-indexing.service';
import { AdultContentService } from '../src/contents/services/adult-content.service';
import { ContentDiscoveryService } from '../src/contents/services/content-discovery.service';
import { PersonCatalogService } from '../src/contents/services/person-catalog.service';
import { RelatedContentService } from '../src/recommendation/related-content.service';
import { RankingsQueryService } from '../src/rankings/services/rankings-query.service';
import { RankingsManagementService } from '../src/rankings/services/rankings-management.service';
import { ChatService } from '../src/chat/chat.service';
import { IntentAnalyzerService } from '../src/chat/intent-analyzer';
import { INTEGRATION_ENTITIES } from './integration/helpers/database';
import { createContractApp } from './contracts/contract-app';
import {
  assertProviderOwnership,
  assertEntityOwnership,
} from './architecture/runtime-ownership';

describe('최종 앱의 업무 provider·entity 소유권', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  beforeAll(async () => {
    harness = await createContractApp();
  });
  afterAll(async () => {
    try {
      expect(harness.unexpected).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('기존 singleton 검사 외 콘텐츠·조회·대화 소유자도 단일 instance여야 한다', () => {
    const tokens = [
      ContentCatalogService,
      ContentIndexingService,
      AdultContentService,
      ContentDiscoveryService,
      PersonCatalogService,
      RelatedContentService,
      RankingsQueryService,
      RankingsManagementService,
      ChatService,
      IntentAnalyzerService,
    ];
    const registrations = [
      ...harness.app.get(ModulesContainer).values(),
    ].flatMap((module) => [...module.providers.values()]);
    const expected = tokens.map((token) => ({
      token,
      instance: harness.app.get(token),
    }));
    expect(() =>
      assertProviderOwnership(registrations, expected),
    ).not.toThrow();
  });

  it('실제 DB metadata는 application entity 집합과 같은 class를 테이블별로 한 번만 사용해야 한다', () => {
    const metadata = harness.app.get(DataSource).entityMetadatas;
    expect(() =>
      assertEntityOwnership(metadata, INTEGRATION_ENTITIES),
    ).not.toThrow();
  });
});

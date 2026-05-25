import { describe, expect, it } from 'vitest';
import { metadata as homeMetadata } from '@/app/page';
import { metadata as discoverMetadata } from '@/app/discover/page';
import { metadata as privacyMetadata } from '@/app/privacy/page';
import { metadata as termsMetadata } from '@/app/terms/page';

describe('SEO metadata', () => {
  it('색인 대상 정적 페이지는 각자의 canonical을 가져야 한다', () => {
    expect(homeMetadata.alternates?.canonical).toBe('/');
    expect(discoverMetadata.alternates?.canonical).toBe('/discover');
    expect(privacyMetadata.alternates?.canonical).toBe('/privacy');
    expect(termsMetadata.alternates?.canonical).toBe('/terms');
  });
});

import { User } from '../../src/users/user.entity';
import { Content } from '../../src/contents/content.entity';
import { INTEGRATION_ENTITIES } from './helpers/database';
import { createVectorLiteral } from './helpers/fixtures';

describe('integration test helpers', () => {
  it('통합 테스트 엔티티 목록과 벡터 fixture를 제공해야 한다', () => {
    expect(INTEGRATION_ENTITIES).toEqual(
      expect.arrayContaining([User, Content]),
    );
    expect(createVectorLiteral(3, 0.2)).toBe('[0.2,0.2,0.2]');
  });
});

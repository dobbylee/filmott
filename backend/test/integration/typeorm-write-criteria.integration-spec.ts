import { DataSource, type FindOptionsWhere, IsNull } from 'typeorm';
import { User } from '../../src/users/user.entity';
import { UserStatus } from '../../src/users/enums/user-status.enum';
import {
  createIntegrationDataSource,
  hasIntegrationDatabaseConfig,
  resetIntegrationDatabase,
} from './helpers/database';
import { createIntegrationFixtures } from './helpers/fixtures';

const describeWithDb = hasIntegrationDatabaseConfig()
  ? describe
  : describe.skip;

describeWithDb('TypeORM 쓰기 조건 DB 계약', () => {
  let dataSource: DataSource;
  let target: User;
  let other: User;

  beforeAll(async () => {
    dataSource = await createIntegrationDataSource();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(dataSource);
    const fixtures = createIntegrationFixtures(dataSource);
    target = await fixtures.user({ email: null });
    other = await fixtures.user();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  async function expectUnchangedUsers(): Promise<void> {
    const rows = await dataSource
      .getRepository(User)
      .find({ order: { id: 'ASC' } });
    expect(rows).toEqual([target, other]);
  }

  describe.each(['update', 'delete'] as const)('%s', (operation) => {
    it.each([
      ['빈 객체', {}, /Empty criteria/],
      ['빈 OR 분기', [{ nickname: '없는 사용자' }, {}], /Empty criteria/],
    ] as const)(
      'repository의 %s 조건은 전체 행을 변경하지 않고 거부해야 한다',
      async (_label, criteria, message) => {
        const repo = dataSource.getRepository(User);
        // 런타임 경계의 잘못된 입력을 의도적으로 전달한다.
        const where = criteria as unknown as
          | FindOptionsWhere<User>
          | FindOptionsWhere<User>[];
        await expect(
          (async () => {
            if (operation === 'update') {
              await repo.update(where, { status: UserStatus.SUSPENDED });
            } else {
              await repo.delete(where);
            }
          })(),
        ).rejects.toThrow(message);
        await expectUnchangedUsers();
      },
    );

    it.each([{}, []])(
      'QueryBuilder의 빈 조건 %j는 전체 행을 변경하지 않고 거부해야 한다',
      async (where) => {
        await expect(
          (async () => {
            const query = dataSource.getRepository(User).createQueryBuilder();
            if (operation === 'update') {
              await query
                .update()
                .set({ status: UserStatus.SUSPENDED })
                .where(where)
                .execute();
            } else {
              await query.delete().where(where).execute();
            }
          })(),
        ).rejects.toThrow(/Empty criteria/);
        await expectUnchangedUsers();
      },
    );

    it.each([
      ['null', { email: null }],
      ['undefined', { nickname: undefined }],
    ] as const)(
      '기본 설정의 %s 속성 조건은 SQL에서 일치하는 행이 없어야 한다',
      async (_label, criteria) => {
        const repo = dataSource.getRepository(User);
        // 0.3.31 배포 패키지는 옵션 미지정 시 기존 SQL NULL 비교를 유지한다.
        const where = criteria as unknown as FindOptionsWhere<User>;
        const result =
          operation === 'update'
            ? await repo.update(where, { status: UserStatus.SUSPENDED })
            : await repo.delete(where);
        expect(result.affected).toBe(0);
        await expectUnchangedUsers();
      },
    );
  });

  it('명시적인 IsNull 수정과 ID 삭제는 선택한 사용자만 변경해야 한다', async () => {
    const repo = dataSource.getRepository(User);
    const updated = await repo.update(
      { email: IsNull() },
      { status: UserStatus.SUSPENDED },
    );
    expect(updated.affected).toBe(1);
    expect(await repo.findOneByOrFail({ id: target.id })).toEqual({
      ...target,
      status: UserStatus.SUSPENDED,
    });
    expect(await repo.findOneByOrFail({ id: other.id })).toEqual(other);

    const deleted = await repo.delete({ id: target.id });
    expect(deleted.affected).toBe(1);
    expect(await repo.find()).toEqual([other]);
  });
});

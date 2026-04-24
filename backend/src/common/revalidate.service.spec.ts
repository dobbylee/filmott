import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RevalidateService } from './revalidate.service';

describe('RevalidateService', () => {
  const makeResponse = (options: { ok?: boolean; status?: number } = {}) =>
    ({
      ok: options.ok ?? true,
      status: options.status ?? 200,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as Response;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('secret 미설정 시', () => {
    let service: RevalidateService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RevalidateService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(''),
            },
          },
        ],
      }).compile();

      service = module.get<RevalidateService>(RevalidateService);
    });

    it('fetch를 호출하지 않고 즉시 반환해야 한다', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(makeResponse());

      await service.revalidatePath('/');

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('secret 설정 시', () => {
    let service: RevalidateService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RevalidateService,
          {
            provide: ConfigService,
            useValue: {
              get: jest
                .fn()
                .mockImplementation((key: string, defaultValue?: string) => {
                  if (key === 'REVALIDATE_SECRET') return 'test-secret';
                  if (key === 'FRONTEND_URL') return 'https://filmott.kr';
                  if (key === 'FRONTEND_INTERNAL_URL')
                    return 'http://frontend:3000';
                  return defaultValue;
                }),
            },
          },
        ],
      }).compile();

      service = module.get<RevalidateService>(RevalidateService);
    });

    it('올바른 URL과 body로 fetch를 호출해야 한다', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(makeResponse());

      await service.revalidatePath('/');

      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        'http://frontend:3000/internal/revalidate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-secret',
          }),
          body: JSON.stringify({ path: '/' }),
        }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        'https://filmott.kr/',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-filmott-cache-warmup': '1',
          }),
          redirect: 'follow',
        }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        3,
        'https://filmott.kr/',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('커스텀 path를 전달할 수 있어야 한다', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(makeResponse());

      await service.revalidatePath('/contents/123');

      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        'http://frontend:3000/internal/revalidate',
        expect.objectContaining({
          body: JSON.stringify({ path: '/contents/123' }),
        }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        'https://filmott.kr/contents/123',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        3,
        'https://filmott.kr/contents/123',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('워밍 대상이 아닌 path는 revalidate만 호출해야 한다', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(makeResponse());

      await service.revalidatePath('/person/17419');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('fetch 실패 시 에러를 throw하지 않고 warn 로깅해야 한다', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.revalidatePath('/')).resolves.not.toThrow();
    });

    it('fetch 응답이 non-ok일 때 에러를 throw하지 않아야 한다', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(makeResponse({ ok: false, status: 500 }));

      await expect(service.revalidatePath('/')).resolves.not.toThrow();
    });

    it('워밍 fetch 실패 시에도 에러를 throw하지 않아야 한다', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(makeResponse())
        .mockRejectedValueOnce(new Error('warmup failed'));

      await expect(service.revalidatePath('/')).resolves.not.toThrow();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RevalidateService } from './revalidate.service';

describe('RevalidateService', () => {
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
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

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
              get: jest.fn().mockReturnValue('test-secret'),
            },
          },
        ],
      }).compile();

      service = module.get<RevalidateService>(RevalidateService);
    });

    it('올바른 URL과 body로 fetch를 호출해야 한다', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      await service.revalidatePath('/');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://frontend:3000/internal/revalidate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-secret',
          }),
          body: JSON.stringify({ path: '/' }),
        }),
      );
    });

    it('커스텀 path를 전달할 수 있어야 한다', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      await service.revalidatePath('/contents/123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://frontend:3000/internal/revalidate',
        expect.objectContaining({
          body: JSON.stringify({ path: '/contents/123' }),
        }),
      );
    });

    it('fetch 실패 시 에러를 throw하지 않고 warn 로깅해야 한다', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.revalidatePath('/')).resolves.not.toThrow();
    });

    it('fetch 응답이 non-ok일 때 에러를 throw하지 않아야 한다', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await expect(service.revalidatePath('/')).resolves.not.toThrow();
    });
  });
});

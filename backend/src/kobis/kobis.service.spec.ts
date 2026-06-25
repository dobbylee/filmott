import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { KobisService } from './kobis.service';
import { AxiosError, AxiosResponse, AxiosHeaders } from 'axios';

describe('KobisService', () => {
  let service: KobisService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KobisService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<KobisService>(KobisService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getDailyBoxOffice', () => {
    it('일일 박스오피스 목록을 반환해야 한다', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation();
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1_000)
        .mockReturnValueOnce(1_242);
      const mockItems = [
        {
          rank: '1',
          movieNm: 'Test Movie',
          movieCd: '12345',
          openDt: '2026-03-01',
          audiCnt: '100000',
          audiAcc: '500000',
          salesAmt: '1000000',
          salesAcc: '5000000',
        },
      ];

      const response: AxiosResponse = {
        data: {
          boxOfficeResult: {
            boxofficeType: 'Daily',
            showRange: '20260309~20260309',
            dailyBoxOfficeList: mockItems,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.get.mockReturnValue(of(response));

      const result = await service.getDailyBoxOffice('20260309');

      expect(result).toEqual(mockItems);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        '/boxoffice/searchDailyBoxOfficeList.json',
        { params: { targetDt: '20260309' } },
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        'KOBIS daily box office request succeeded',
        {
          targetDt: '20260309',
          durationMs: 242,
          itemCount: 1,
        },
      );
    });

    it('데이터가 없을 때 빈 배열을 반환해야 한다', async () => {
      const response: AxiosResponse = {
        data: {
          boxOfficeResult: {
            boxofficeType: 'Daily',
            showRange: '20260309~20260309',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.get.mockReturnValue(of(response));

      const result = await service.getDailyBoxOffice('20260309');

      expect(result).toEqual([]);
    });

    it('API 실패 시 에러를 던져야 한다', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('API Error')),
      );

      await expect(service.getDailyBoxOffice('20260309')).rejects.toThrow(
        'API Error',
      );
    });

    it('API 실패 로그에 key와 Authorization을 포함하지 않아야 한다', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(2_000)
        .mockReturnValueOnce(2_510);
      const error = new AxiosError(
        'Request failed with status code 401',
        '401',
        {
          headers: new AxiosHeaders({
            Authorization: 'Bearer kobis-auth-token',
          }),
          url: '/boxoffice/searchDailyBoxOfficeList.json?key=kobis-query-key',
          params: { key: 'kobis-param-key', targetDt: '20260309' },
        },
      );
      mockHttpService.get.mockReturnValue(throwError(() => error));

      await expect(service.getDailyBoxOffice('20260309')).rejects.toThrow();

      const payload = JSON.stringify(loggerSpy.mock.calls);
      expect(payload).not.toContain('kobis-auth-token');
      expect(payload).not.toContain('kobis-query-key');
      expect(payload).not.toContain('kobis-param-key');
      expect(payload).not.toContain('Authorization');
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to fetch daily box office for 20260309',
        expect.objectContaining({
          service: 'KOBIS',
          endpointPath: '/boxoffice/searchDailyBoxOfficeList.json',
          targetDt: '20260309',
          durationMs: 510,
        }),
      );
    });
  });

  describe('getWeeklyBoxOffice', () => {
    it('주간 박스오피스 목록을 반환해야 한다', async () => {
      const mockItems = [
        {
          rank: '1',
          movieNm: 'Weekly Movie',
          movieCd: '67890',
          openDt: '2026-02-28',
          audiCnt: '200000',
          audiAcc: '1000000',
          salesAmt: '2000000',
          salesAcc: '10000000',
        },
      ];

      const response: AxiosResponse = {
        data: {
          boxOfficeResult: {
            boxofficeType: 'Weekly',
            showRange: '20260303~20260309',
            weeklyBoxOfficeList: mockItems,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.get.mockReturnValue(of(response));

      const result = await service.getWeeklyBoxOffice('20260309', '0');

      expect(result).toEqual(mockItems);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        '/boxoffice/searchWeeklyBoxOfficeList.json',
        { params: { targetDt: '20260309', weekGb: '0' } },
      );
    });
  });
});

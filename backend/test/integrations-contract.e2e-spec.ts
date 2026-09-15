import { ModulesContainer } from '@nestjs/core';
import { TmdbService } from '../src/integrations/tmdb/tmdb.service';
import { KobisService } from '../src/integrations/kobis/kobis.service';
import { createContractApp } from './contracts/contract-app';

describe('외부 연동 실제 module 설정 계약', () => {
  it('TMDB 설정과 singleton은 KOBIS client와 분리되어야 한다', async () => {
    const harness = await createContractApp({
      http: (config) => {
        if (config.url === '/movie/101') return { id: 101, title: '고정 작품' };
        throw new Error(`미등록 fixture: ${config.url}`);
      },
    });
    try {
      const tmdb = harness.app.get(TmdbService);
      const kobis = harness.app.get(KobisService);
      const modules = harness.app.get(ModulesContainer);
      const providers = [...modules.values()].flatMap((module) =>
        [...module.providers.values()].filter(
          (provider) => provider.token === TmdbService,
        ),
      );
      expect(providers).toHaveLength(1);
      expect(providers[0].instance).toBe(tmdb);
      expect(Reflect.get(tmdb, 'httpService')).not.toBe(
        Reflect.get(kobis, 'httpService'),
      );
      await expect(tmdb.getDetails(101, 'movie')).resolves.toEqual({
        id: 101,
        title: '고정 작품',
      });
      expect(harness.httpCalls).toHaveLength(1);
      const call = harness.httpCalls[0];
      expect(call.baseURL).toBe('https://api.themoviedb.org/3');
      expect(call.timeout).toBe(10000);
      expect(call.headers.get('Authorization')).toBe(
        'Bearer contract-tmdb-key',
      );
      expect(call.headers.get('Accept')).toBe('application/json');
      expect(call.params).toEqual({
        language: 'ko-KR',
        append_to_response: 'credits,watch/providers',
      });
      expect(harness.unexpected).toEqual([]);
    } finally {
      await harness.close();
    }
  });
  it('KOBIS 설정과 singleton은 TMDB 인증을 섞지 않고 daily/weekly params를 유지해야 한다', async () => {
    const harness = await createContractApp({
      http: (config) => {
        if (config.url === '/boxoffice/searchDailyBoxOfficeList.json')
          return { boxOfficeResult: { dailyBoxOfficeList: [] } };
        if (config.url === '/boxoffice/searchWeeklyBoxOfficeList.json')
          return { boxOfficeResult: { weeklyBoxOfficeList: [] } };
        throw new Error(`미등록 fixture: ${config.url}`);
      },
    });
    try {
      const kobis = harness.app.get(KobisService);
      const providers = [...harness.app.get(ModulesContainer).values()].flatMap(
        (module) =>
          [...module.providers.values()].filter(
            (provider) => provider.token === KobisService,
          ),
      );
      expect(providers).toHaveLength(1);
      expect(providers[0].instance).toBe(kobis);
      await expect(kobis.getDailyBoxOffice('20260914')).resolves.toEqual([]);
      await expect(kobis.getWeeklyBoxOffice('20260907', '2')).resolves.toEqual(
        [],
      );
      expect(harness.httpCalls).toHaveLength(2);
      for (const call of harness.httpCalls) {
        expect(call.baseURL).toBe(
          'https://www.kobis.or.kr/kobisopenapi/webservice/rest',
        );
        expect(call.timeout).toBe(15000);
        expect(call.headers.get('Authorization')).toBeUndefined();
      }
      expect(harness.httpCalls.map((call) => call.params)).toEqual([
        { key: 'contract-kobis-key', targetDt: '20260914' },
        { key: 'contract-kobis-key', targetDt: '20260907', weekGb: '2' },
      ]);
      expect(harness.unexpected).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});

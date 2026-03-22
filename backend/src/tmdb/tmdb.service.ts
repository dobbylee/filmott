import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface TmdbSearchResult {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbItem[];
}

export interface TmdbItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  adult?: boolean;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  origin_country?: string[];
  original_language?: string;
  production_countries?: { iso_3166_1: string; name: string }[];
  credits?: {
    cast: TmdbCast[];
    crew?: TmdbCrew[];
  };
  ['watch/providers']?: {
    results?: {
      KR?: TmdbWatchProviderCountry;
    };
  };
}

export interface TmdbCast {
  id: number;
  name: string;
  character: string;
  profile_path?: string;
  order: number;
}

export interface TmdbCrew {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path?: string;
}

export interface TmdbWatchProviderCountry {
  link?: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
}

export interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface TmdbPersonDetail {
  id: number;
  name: string;
  profile_path: string | null;
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
}

export interface TmdbPersonCredit {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  character?: string;
  job?: string;
  episode_count?: number;
}

export interface TmdbPersonCreditsResult {
  cast: TmdbPersonCredit[];
  crew: TmdbPersonCredit[];
}

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);

  constructor(private readonly httpService: HttpService) {}

  async searchMulti(query: string, page = 1): Promise<TmdbSearchResult> {
    const { data } = await firstValueFrom(
      this.httpService.get<TmdbSearchResult>('/search/multi', {
        params: { query, page, language: 'ko-KR', region: 'KR' },
      }),
    );
    // movie/tv/person 필터링 (기타 media_type 제외)
    data.results = data.results.filter(
      (item) =>
        item.media_type === 'movie' ||
        item.media_type === 'tv' ||
        item.media_type === 'person',
    );
    return data;
  }

  async searchByType(
    query: string,
    type: 'movie' | 'tv' | 'person',
    page = 1,
  ): Promise<TmdbSearchResult> {
    const { data } = await firstValueFrom(
      this.httpService.get<TmdbSearchResult>(`/search/${type}`, {
        params: { query, page, language: 'ko-KR', region: 'KR' },
      }),
    );
    // media_type 주입 (search/{type}은 media_type을 반환하지 않음)
    data.results = data.results.map((item) => ({
      ...item,
      media_type: type,
    }));
    return data;
  }

  async getDetails(tmdbId: number, type: 'movie' | 'tv'): Promise<TmdbItem> {
    const { data } = await firstValueFrom(
      this.httpService.get<TmdbItem>(`/${type}/${tmdbId}`, {
        params: {
          language: 'ko-KR',
          append_to_response: 'credits,watch/providers',
        },
      }),
    );
    return data;
  }

  async getPopular(
    type: 'movie' | 'tv',
    page = 1,
  ): Promise<TmdbSearchResult> {
    const { data } = await firstValueFrom(
      this.httpService.get<TmdbSearchResult>(`/${type}/popular`, {
        params: { page, language: 'ko-KR', region: 'KR' },
      }),
    );
    return data;
  }

  async getNowPlaying(page = 1): Promise<TmdbSearchResult> {
    const { data } = await firstValueFrom(
      this.httpService.get<TmdbSearchResult>('/movie/now_playing', {
        params: { page, language: 'ko-KR', region: 'KR' },
      }),
    );
    return data;
  }

  async getTrending(
    type: 'movie' | 'tv' | 'all',
    timeWindow: 'day' | 'week' = 'day',
  ): Promise<TmdbSearchResult> {
    const { data } = await firstValueFrom(
      this.httpService.get<TmdbSearchResult>(
        `/trending/${type}/${timeWindow}`,
        {
          params: { language: 'ko-KR' },
        },
      ),
    );
    return data;
  }

  async getWatchProviders(
    tmdbId: number,
    type: 'movie' | 'tv',
  ): Promise<TmdbWatchProviderCountry | null> {
    const { data } = await firstValueFrom(
      this.httpService.get<{ results?: { KR?: TmdbWatchProviderCountry } }>(
        `/${type}/${tmdbId}/watch/providers`,
      ),
    );
    return data.results?.KR ?? null;
  }

  async getPersonDetail(personId: number): Promise<TmdbPersonDetail> {
    const { data } = await firstValueFrom(
      this.httpService.get<TmdbPersonDetail>(`/person/${personId}`, {
        params: { language: 'ko-KR' },
      }),
    );
    return data;
  }

  async getPersonCredits(
    personId: number,
  ): Promise<TmdbPersonCreditsResult> {
    const { data } = await firstValueFrom(
      this.httpService.get<TmdbPersonCreditsResult>(
        `/person/${personId}/combined_credits`,
        {
          params: { language: 'ko-KR' },
        },
      ),
    );
    return data;
  }

  async discoverByFilters(
    type: 'movie' | 'tv',
    options: {
      genres?: string;
      watchProviders?: string;
      year?: number;
      sort?: string;
      region?: string;
      page?: number;
    } = {},
  ): Promise<TmdbSearchResult> {
    let sortBy = options.sort ?? 'popularity.desc';
    if (type === 'tv' && sortBy === 'primary_release_date.desc') {
      sortBy = 'first_air_date.desc';
    }

    const params: Record<string, string | number> = {
      language: 'ko-KR',
      watch_region: options.region ?? 'KR',
      with_watch_monetization_types: 'flatrate|rent|buy|free|ads',
      page: options.page ?? 1,
      sort_by: sortBy,
    };

    if (options.sort === 'vote_average.desc') {
      params['vote_count.gte'] = 50;
    }

    if (options.genres) {
      params.with_genres = options.genres;
    }
    if (options.watchProviders) {
      params.with_watch_providers = options.watchProviders;
    }
    if (options.year) {
      if (type === 'movie') {
        params.primary_release_year = options.year;
      } else {
        params.first_air_date_year = options.year;
      }
    }

    const { data } = await firstValueFrom(
      this.httpService.get<TmdbSearchResult>(`/discover/${type}`, { params }),
    );
    return data;
  }
}

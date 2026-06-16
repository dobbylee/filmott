import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import {
  FavoriteContent,
  GenreStat,
  UserContext,
  WantToWatchContent,
} from './prompts/system-prompt';

interface RawFavoriteRow {
  title: string;
  releaseDate: string | null;
  genres: string;
  rating: number;
  originCountry: string | null;
  director?: string | null;
}

interface RawGenreStatRow {
  genre: string;
  avgRating: string;
  count: string;
}

interface RawWantToWatchRow {
  title: string;
  releaseDate: string | null;
  genres: string;
  originCountry: string | null;
}

interface RawWatchedTmdbIdRow {
  tmdbId: number;
}

@Injectable()
export class ChatContextService {
  constructor(
    @InjectRepository(Watchlist)
    private readonly watchlistRepo: Repository<Watchlist>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  async buildUserContext(userId: number): Promise<UserContext> {
    const [
      favorites,
      disliked,
      genreStats,
      watchedTmdbIds,
      wantToWatch,
      watchedGenres,
    ] = await Promise.all([
      this.getFavorites(userId),
      this.getDisliked(userId),
      this.getGenreStats(userId),
      this.getWatchedTmdbIds(userId),
      this.getWantToWatch(userId),
      this.getWatchedGenres(userId),
    ]);

    return {
      favorites,
      disliked,
      genreStats,
      watchedTmdbIds,
      wantToWatch,
      watchedGenres,
    };
  }

  private async getFavorites(userId: number): Promise<FavoriteContent[]> {
    const rows: RawFavoriteRow[] = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.content', 'c')
      .select([
        'c.title AS "title"',
        'c.release_date AS "releaseDate"',
        "array_to_string(ARRAY(SELECT jsonb_array_elements(c.genres) ->> 'name'), ', ') AS \"genres\"",
        'r.rating AS "rating"',
        'c.origin_country AS "originCountry"',
      ])
      .where('r.userId = :userId', { userId })
      .andWhere('r.rating >= 8')
      .orderBy('r.rating', 'DESC')
      .addOrderBy('r.updatedAt', 'DESC')
      .limit(20)
      .getRawMany();

    return rows.map((row) => ({
      title: row.title,
      year: row.releaseDate
        ? new Date(row.releaseDate).getFullYear().toString()
        : '',
      genres: row.genres || '',
      rating: row.rating,
      originCountry: row.originCountry ?? null,
    }));
  }

  private async getDisliked(userId: number): Promise<FavoriteContent[]> {
    const rows: RawFavoriteRow[] = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.content', 'c')
      .select([
        'c.title AS "title"',
        'c.release_date AS "releaseDate"',
        "array_to_string(ARRAY(SELECT jsonb_array_elements(c.genres) ->> 'name'), ', ') AS \"genres\"",
        'r.rating AS "rating"',
        'c.origin_country AS "originCountry"',
        'c.director AS "director"',
      ])
      .where('r.userId = :userId', { userId })
      .andWhere('r.rating <= 4')
      .orderBy('r.rating', 'ASC')
      .addOrderBy('r.updatedAt', 'DESC')
      .limit(10)
      .getRawMany();

    return rows.map((row) => ({
      title: row.title,
      year: row.releaseDate
        ? new Date(row.releaseDate).getFullYear().toString()
        : '',
      genres: row.genres || '',
      rating: row.rating,
      originCountry: row.originCountry ?? null,
      director: row.director ?? null,
    }));
  }

  private async getGenreStats(userId: number): Promise<GenreStat[]> {
    const rows: RawGenreStatRow[] = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.content', 'c')
      .select([
        'jsonb_array_elements(c.genres) ->> \'name\' AS "genre"',
        'ROUND(AVG(r.rating), 1) AS "avgRating"',
        'COUNT(*) AS "count"',
      ])
      .where('r.userId = :userId', { userId })
      .andWhere('r.rating IS NOT NULL')
      .groupBy('"genre"')
      .orderBy('"count"', 'DESC')
      .getRawMany();

    return rows.map((row) => ({
      genre: row.genre,
      avgRating: row.avgRating,
      count: parseInt(row.count, 10),
    }));
  }

  private async getWatchedTmdbIds(userId: number): Promise<number[]> {
    const rows: RawWatchedTmdbIdRow[] = await this.watchlistRepo
      .createQueryBuilder('w')
      .innerJoin('w.content', 'c')
      .select('c.tmdb_id AS "tmdbId"')
      .where('w.userId = :userId', { userId })
      .andWhere("w.status = 'watched'")
      .getRawMany();

    return rows.map((row) => row.tmdbId);
  }

  private async getWantToWatch(userId: number): Promise<WantToWatchContent[]> {
    const rows: RawWantToWatchRow[] = await this.watchlistRepo
      .createQueryBuilder('w')
      .innerJoin('w.content', 'c')
      .select([
        'c.title AS "title"',
        'c.release_date AS "releaseDate"',
        "array_to_string(ARRAY(SELECT jsonb_array_elements(c.genres) ->> 'name'), ', ') AS \"genres\"",
        'c.origin_country AS "originCountry"',
      ])
      .where('w.userId = :userId', { userId })
      .andWhere("w.status = 'want_to_watch'")
      .orderBy('w.createdAt', 'DESC')
      .limit(20)
      .getRawMany();

    return rows.map((row) => ({
      title: row.title,
      year: row.releaseDate
        ? new Date(row.releaseDate).getFullYear().toString()
        : '',
      genres: row.genres || '',
      originCountry: row.originCountry ?? null,
    }));
  }

  private async getWatchedGenres(userId: number): Promise<GenreStat[]> {
    const rows: RawGenreStatRow[] = await this.watchlistRepo
      .createQueryBuilder('w')
      .innerJoin('w.content', 'c')
      .leftJoin(
        Review,
        'r',
        'r.userId = w.userId AND r.contentId = w.contentId',
      )
      .select([
        'jsonb_array_elements(c.genres) ->> \'name\' AS "genre"',
        '\'0\' AS "avgRating"',
        'COUNT(*) AS "count"',
      ])
      .where('w.userId = :userId', { userId })
      .andWhere("w.status = 'watched'")
      .andWhere('r.id IS NULL')
      .groupBy('"genre"')
      .orderBy('"count"', 'DESC')
      .getRawMany();

    return rows.map((row) => ({
      genre: row.genre,
      avgRating: row.avgRating,
      count: parseInt(row.count, 10),
    }));
  }
}

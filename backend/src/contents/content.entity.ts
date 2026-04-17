import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

export interface ContentProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface ContentWatchProviders {
  link?: string;
  flatrate?: ContentProvider[];
  rent?: ContentProvider[];
  buy?: ContentProvider[];
}

export interface ContentCredit {
  id: number;
  name: string;
  character: string;
  profile_path?: string;
  order: number;
}

@Entity('contents')
@Unique(['tmdbId', 'contentType'])
@Index('idx_contents_content_type', ['contentType'])
@Index('idx_contents_release_date', ['releaseDate'])
@Index('idx_contents_origin_country', ['originCountry'])
export class Content {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'tmdb_id' })
  tmdbId!: number;

  @Column({ name: 'content_type', length: 10 })
  contentType!: string;

  @Column({ length: 500 })
  title!: string;

  @Column({ name: 'original_title', length: 500, nullable: true })
  originalTitle?: string;

  @Column({ name: 'poster_url', length: 1000, nullable: true })
  posterUrl?: string;

  @Column({ name: 'backdrop_url', length: 1000, nullable: true })
  backdropUrl?: string;

  @Column({ type: 'text', nullable: true })
  overview?: string;

  @Column({ name: 'release_date', type: 'date', nullable: true })
  releaseDate?: Date;

  @Column({
    name: 'vote_average',
    type: 'numeric',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  voteAverage?: number;

  @Column({ name: 'vote_count', type: 'integer', default: 0 })
  voteCount!: number;

  @Column({ type: 'jsonb', default: '[]' })
  genres!: { id: number; name: string }[];

  @Column({ type: 'integer', nullable: true })
  runtime?: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  director!: string | null;

  @Column({
    name: 'origin_country',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  originCountry!: string | null;

  @Column({ name: 'watch_providers', type: 'jsonb', nullable: true })
  watchProviders?: ContentWatchProviders | null;

  @Column({ type: 'jsonb', nullable: true })
  credits?: ContentCredit[] | null;

  @Column({ type: 'boolean', default: false })
  adult!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

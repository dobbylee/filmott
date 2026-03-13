import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('contents')
@Unique(['tmdbId', 'contentType'])
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

  @Column({ name: 'vote_average', type: 'numeric', precision: 3, scale: 1, nullable: true })
  voteAverage?: number;

  @Column({ type: 'jsonb', default: '[]' })
  genres!: { id: number; name: string }[];

  @Column({ type: 'integer', nullable: true })
  runtime?: number;

  @Column({ name: 'watch_providers', type: 'jsonb', nullable: true })
  watchProviders?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  credits?: Record<string, unknown>[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

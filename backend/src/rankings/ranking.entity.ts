import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Content } from '../contents/content.entity';

@Entity('rankings')
@Index('idx_rankings_source_category', ['source', 'category', 'fetchedAt'])
@Unique('uq_rankings_source_category_rank_target_date', [
  'source',
  'category',
  'rank',
  'targetDate',
])
export class Ranking {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 20 })
  source!: string;

  @Column({ length: 50 })
  category!: string;

  @Column({ type: 'integer' })
  rank!: number;

  @Column({ name: 'target_date', type: 'date' })
  targetDate!: string;

  @Column({ length: 500, nullable: true })
  title?: string;

  @Column({ name: 'poster_url', length: 1000, nullable: true })
  posterUrl?: string;

  @Column({ name: 'content_id', type: 'integer', nullable: true })
  contentId?: number;

  @ManyToOne(() => Content, { nullable: true, eager: false })
  @JoinColumn({ name: 'content_id' })
  content?: Content;

  @Column({ name: 'audience_count', type: 'bigint', nullable: true })
  audienceCount?: number;

  @Column({ name: 'fetched_at', type: 'timestamptz', default: () => 'now()' })
  fetchedAt!: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Content } from '../contents/content.entity';

@Entity('rankings')
@Index('idx_rankings_source_category', ['source', 'category', 'fetchedAt'])
export class Ranking {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 20 })
  source!: string;

  @Column({ length: 50 })
  category!: string;

  @Column({ type: 'integer' })
  rank!: number;

  @Column({ length: 500, nullable: true })
  title?: string;

  @Column({ name: 'poster_url', length: 1000, nullable: true })
  posterUrl?: string;

  @Column({ name: 'content_id', type: 'integer', nullable: true })
  contentId?: number;

  @ManyToOne(() => Content, { nullable: true, eager: false })
  @JoinColumn({ name: 'content_id' })
  content?: Content;

  @Column({ name: 'fetched_at', type: 'timestamptz', default: () => 'now()' })
  fetchedAt!: Date;
}

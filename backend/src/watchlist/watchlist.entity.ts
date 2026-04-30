import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Content } from '../contents/content.entity';
import { Review } from '../reviews/review.entity';

@Entity('watchlist')
@Unique(['userId', 'contentId'])
@Index('IDX_watchlist_user_status', ['userId', 'status'])
export class Watchlist {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'content_id' })
  contentId!: number;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_id' })
  content!: Content;

  @Column({ length: 20, default: 'want_to_watch' })
  status!: 'want_to_watch' | 'watched';

  @Column({ name: 'watched_at', type: 'date', nullable: true })
  watchedAt!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** leftJoinAndMapOne으로 매핑되는 리뷰 (데코레이터 없음, 비영속 프로퍼티) */
  review?: Review;
}

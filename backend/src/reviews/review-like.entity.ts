import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Review } from './review.entity';
import { User } from '../users/user.entity';

@Entity('review_likes')
@Unique(['reviewId', 'userId'])
export class ReviewLike {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'review_id' })
  reviewId!: number;

  @ManyToOne(() => Review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review!: Review;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

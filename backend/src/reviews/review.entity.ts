import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Content } from '../contents/content.entity';
import { ReviewComment } from './review-comment.entity';

@Entity('reviews')
@Unique(['userId', 'contentId'])
export class Review {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'content_id' })
  contentId!: number;

  @ManyToOne(() => Content)
  @JoinColumn({ name: 'content_id' })
  content!: Content;

  @Column({ type: 'smallint', nullable: true })
  rating?: number;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ name: 'likes_count', default: 0 })
  likesCount!: number;

  @OneToMany(() => ReviewComment, (comment) => comment.review)
  comments!: ReviewComment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

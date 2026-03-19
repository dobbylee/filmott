import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Content } from '../../contents/content.entity';

@Entity('content_metadata')
export class ContentMetadata {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'content_id', unique: true })
  contentId!: number;

  @ManyToOne(() => Content)
  @JoinColumn({ name: 'content_id' })
  content!: Content;

  @Column({ type: 'text' })
  description!: string;

  // pgvector 컬럼은 TypeORM에서 string으로 취급하고 raw query로 조회
  @Column({ type: 'varchar' })
  embedding!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

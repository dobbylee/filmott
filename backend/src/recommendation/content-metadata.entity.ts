import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Content } from '../contents/content.entity';

@Entity('content_metadata')
export class ContentMetadata {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'content_id', unique: true })
  contentId!: number;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_id' })
  content!: Content;

  @Column({ type: 'text' })
  description!: string;

  // TypeORM vector 조회는 숫자 배열이며 기존 fixture/raw 저장은 문자열도 사용한다.
  @Column({ type: 'vector', length: 1536 })
  embedding!: number[] | string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

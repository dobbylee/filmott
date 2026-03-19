import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

export interface ChatRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
  reason: string;
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'session_id' })
  sessionId!: number;

  @ManyToOne(() => ChatSession, (session) => session.messages)
  @JoinColumn({ name: 'session_id' })
  session!: ChatSession;

  @Column({ length: 10 })
  role!: 'user' | 'assistant';

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', nullable: true })
  recommendations!: ChatRecommendation[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

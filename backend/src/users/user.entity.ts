import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { AuthProvider } from './enums/auth-provider.enum';
import { UserStatus } from './enums/user-status.enum';
import { UserRole } from './enums/user-role.enum';

@Entity('users')
@Unique('UQ_users_provider_provider_id', ['provider', 'providerId'])
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  nickname!: string;

  @Column({ nullable: true, type: 'varchar' })
  email!: string | null;

  @Exclude()
  @Column({ nullable: true, type: 'varchar' })
  password!: string | null;

  @Column({ type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  provider!: AuthProvider;

  @Column({ name: 'provider_id', nullable: true, type: 'varchar' })
  providerId!: string | null;

  @Column({ name: 'profile_image', nullable: true, type: 'varchar' })
  profileImage?: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

// User without password - safe to return to client
export type SafeUser = Omit<User, 'password'>;

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  DeleteDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  username!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt?: Date;
}

// User without password - safe to return to client
export type SafeUser = Omit<User, 'password'>;

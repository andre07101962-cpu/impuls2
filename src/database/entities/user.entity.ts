import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { UserBot } from './user-bot.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', unique: true, name: 'telegram_id' })
  telegramId: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ name: 'subscription_tier', nullable: true })
  subscriptionTier: string;

  // 🚀 PERF: Index required for fast AuthGuard lookups
  @Column({ name: 'access_token_hash', nullable: true, select: false }) 
  @Index('idx_users_token_hash') 
  accessTokenHash: string; 

  @OneToMany(() => UserBot, (bot) => bot.user)
  bots: UserBot[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
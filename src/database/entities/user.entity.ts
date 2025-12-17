
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

  // === NEW FIELDS START ===
  @Column({ nullable: true, name: 'first_name' })
  firstName: string;

  @Column({ nullable: true, name: 'last_name' })
  lastName: string;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true, name: 'language_code' })
  languageCode: string;

  @Column({ name: 'is_premium', default: false })
  isPremium: boolean;

  @Column({ name: 'photo_url', nullable: true })
  photoUrl: string;

  // Store the raw Telegram JSON response here for 100% data retention
  @Column({ type: 'jsonb', name: 'raw_data', default: {} })
  rawData: any;
  // === NEW FIELDS END ===

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

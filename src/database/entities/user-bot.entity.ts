import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Channel } from './channel.entity';

export enum BotStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  FLOOD_WAIT = 'flood_wait',
}

@Entity('user_bots')
@Index('idx_user_bots_user', ['userId'])
export class UserBot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', unique: true, name: 'telegram_bot_id' })
  telegramBotId: string;

  @Column({ nullable: true })
  username: string;

  @Column({ name: 'token_encrypted' })
  tokenEncrypted: string;

  @Column({ type: 'enum', enum: BotStatus, default: BotStatus.ACTIVE })
  status: BotStatus;

  @Column({ type: 'jsonb', default: {} })
  config: any;

  @Column({ type: 'jsonb', default: {} })
  stats: any;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.bots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Channel, (channel) => channel.bot)
  channels: Channel[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
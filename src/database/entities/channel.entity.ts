import { Entity, Column, PrimaryColumn, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserBot } from './user-bot.entity';
import { AdSlot } from './ad-slot.entity';
import { ScheduledPublication } from './scheduled-publication.entity';
import { ForumTopic } from './forum-topic.entity';

export enum ChannelType {
  CHANNEL = 'channel',
  SUPERGROUP = 'supergroup',
  GROUP = 'group',
  PRIVATE = 'private',
}

@Entity('channels')
export class Channel {
  // Telegram Channel ID is BigInt and static, so we don't use UUID here
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  username: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ChannelType, default: ChannelType.CHANNEL })
  type: ChannelType;

  @Column({ name: 'is_forum', default: false })
  isForum: boolean;

  @Column({ name: 'photo_url', nullable: true })
  photoUrl: string;

  @Column({ name: 'members_count', type: 'int', default: 0 })
  membersCount: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // ID of the linked discussion group (Supergroup)
  @Column({ name: 'linked_chat_id', type: 'bigint', nullable: true })
  linkedChatId: string;

  @Column({ type: 'jsonb', default: {} })
  settings: any;

  @Column({ name: 'owner_bot_id', type: 'uuid' })
  ownerBotId: string;

  @ManyToOne(() => UserBot, (bot) => bot.channels)
  @JoinColumn({ name: 'owner_bot_id' })
  bot: UserBot;

  @OneToMany(() => AdSlot, (slot) => slot.channel)
  adSlots: AdSlot[];

  @OneToMany(() => ScheduledPublication, (pub) => pub.channel)
  scheduledPublications: ScheduledPublication[];

  @OneToMany(() => ForumTopic, (topic) => topic.channel)
  topics: ForumTopic[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
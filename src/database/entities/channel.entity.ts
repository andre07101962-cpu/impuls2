import { Entity, Column, PrimaryColumn, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserBot } from './user-bot.entity';
import { AdSlot } from './ad-slot.entity';
import { ScheduledPublication } from './scheduled-publication.entity';

@Entity('channels')
export class Channel {
  // Telegram Channel ID is BigInt and static, so we don't use UUID here
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  @Column({ nullable: true })
  title: string;

  @Column({ name: 'photo_url', nullable: true })
  photoUrl: string;

  @Column({ name: 'members_count', type: 'int', default: 0 })
  membersCount: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
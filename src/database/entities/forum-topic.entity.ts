import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Channel } from './channel.entity';

@Entity('forum_topics')
export class ForumTopic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'telegram_topic_id', type: 'int' })
  telegramTopicId: number;

  @Column()
  name: string;

  @Column({ name: 'icon_color', type: 'int', nullable: true })
  iconColor: number;

  @Column({ name: 'icon_custom_emoji_id', nullable: true })
  iconCustomEmojiId: string;

  @Column({ name: 'is_closed', default: false })
  isClosed: boolean;

  @Column({ name: 'channel_id', type: 'bigint' })
  channelId: string;

  @ManyToOne(() => Channel, (channel) => channel.topics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Channel } from './channel.entity';
import { Post } from './post.entity';

export enum PublicationStatus {
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

@Entity('scheduled_publications')
@Index('idx_schedule_publish_status', ['publishAt', 'status'])
export class ScheduledPublication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'publish_at', type: 'timestamptz' })
  publishAt: Date;

  @Column({ name: 'delete_at', type: 'timestamptz', nullable: true })
  deleteAt: Date;

  @Column({ name: 'tg_message_id', type: 'bigint', nullable: true })
  tgMessageId: string;

  @Column({ type: 'enum', enum: PublicationStatus, default: PublicationStatus.SCHEDULED })
  status: PublicationStatus;

  // New field to track the BullMQ Job ID
  @Column({ name: 'job_id', nullable: true })
  jobId: string;

  @Column({ name: 'channel_id', type: 'bigint' })
  channelId: string;

  @ManyToOne(() => Channel, (channel) => channel.scheduledPublications)
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => Post, (post) => post.publications)
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ScheduledPublication } from './scheduled-publication.entity';

export enum PostType {
  POST = 'post',             // Standard Feed Post
  STORY = 'story',           // Telegram Story
  PAID_MEDIA = 'paid_media', // Hidden behind Stars
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PostType, default: PostType.POST })
  type: PostType;

  /**
   * Payload Structure:
   * {
   *   text: string,
   *   media: string | string[] | { type: 'photo'|'video', url: string }[],
   *   buttons: InlineButton[][],
   *   options: {
   *     disable_notification: boolean,
   *     protect_content: boolean,
   *     has_spoiler: boolean
   *   },
   *   paid_config: {
   *     star_count: number
   *   },
   *   story_config: {
   *     period: number // hours
   *   }
   * }
   */
  @Column({ name: 'content_payload', type: 'jsonb' })
  contentPayload: any;

  @Column({ nullable: true })
  name: string;

  @OneToMany(() => ScheduledPublication, (pub) => pub.post)
  publications: ScheduledPublication[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
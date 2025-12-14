import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ScheduledPublication } from './scheduled-publication.entity';

export enum PostType {
  POST = 'post',             // Standard Feed Post (Text/Image/Video)
  STORY = 'story',           // Telegram Story
  PAID_MEDIA = 'paid_media', // Hidden behind Stars
  POLL = 'poll',             // Quiz or Regular Poll
  DOCUMENT = 'document',     // Files (PDF, ZIP, etc)
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PostType, default: PostType.POST })
  type: PostType;

  /**
   * Payload Structure:
   * 
   * Common Options:
   *   options: {
   *     disable_notification: boolean,
   *     protect_content: boolean,
   *     has_spoiler: boolean,
   *     pin: boolean // <--- NEW: Pin after posting
   *   }
   * 
   * Type: POLL
   *   content: {
   *     question: string,
   *     poll_options: string[], // ["Yes", "No"] (Renamed from options to avoid collision)
   *     poll_config: {
   *       is_anonymous: boolean,
   *       allows_multiple_answers: boolean,
   *       type: 'regular' | 'quiz',
   *       correct_option_id: number // if quiz
   *     }
   *   }
   * 
   * Type: DOCUMENT
   *   content: {
   *     media: string, // URL to file
   *     text: string // Caption
   *   }
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
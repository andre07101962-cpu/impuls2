
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ScheduledPublication } from './scheduled-publication.entity';

export enum PostType {
  POST = 'post',             // Standard Feed Post (Text/Image/Video/Album)
  STORY = 'story',           // Telegram Story
  PAID_MEDIA = 'paid_media', // Hidden behind Stars
  POLL = 'poll',             // Quiz or Regular Poll
  DOCUMENT = 'document',     // Files (PDF, ZIP, etc)
  
  // 🆕 NEW TYPES
  AUDIO = 'audio',           // Music/Podcast
  VOICE = 'voice',           // Voice Note (.ogg)
  VIDEO_NOTE = 'video_note', // Circle Video
  LOCATION = 'location',     // Geo Point
  CONTACT = 'contact',       // vCard
  STICKER = 'sticker',       // Static/Animated Sticker
  COPY = 'copy',             // copyMessage (Content Stealer)
  FORWARD = 'forward',       // forwardMessage (Repost with credit)
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PostType, default: PostType.POST })
  type: PostType;

  /**
   * Payload Structure Updates:
   * 
   * Common Options:
   *   options: {
   *     disable_notification: boolean,
   *     protect_content: boolean,
   *     has_spoiler: boolean,
   *     show_caption_above_media: boolean, // <--- NEW
   *     message_effect_id: string, // <--- NEW (Premium effects)
   *     pin: boolean
   *   }
   * 
   * Type: AUDIO
   *   content: { media: url, performer: string, title: string, thumbnail: url }
   * 
   * Type: LOCATION
   *   content: { latitude: float, longitude: float, address?: string }
   * 
   * Type: CONTACT
   *   content: { phone_number: string, first_name: string, last_name?: string }
   * 
   * Type: COPY / FORWARD
   *   content: { from_chat_id: string, message_id: number }
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

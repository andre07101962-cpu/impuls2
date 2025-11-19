import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ScheduledPublication } from './scheduled-publication.entity';

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
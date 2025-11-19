import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Campaign } from './campaign.entity';

@Entity('participants')
@Index('idx_participants_check', ['campaignId', 'userId'], { unique: true })
export class Participant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'completed_tasks', type: 'jsonb', default: [] })
  completedTasks: any;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => Campaign, (c) => c.participants)
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
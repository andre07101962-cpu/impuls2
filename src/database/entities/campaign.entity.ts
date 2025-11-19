import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Participant } from './participant.entity';

export enum CampaignType {
  QUEST = 'quest',
  GIVEAWAY = 'giveaway',
}

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: CampaignType })
  type: CampaignType;

  @Column({ type: 'jsonb' })
  config: any;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Participant, (p) => p.campaign)
  participants: Participant[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Channel } from './channel.entity';

export enum AdSlotStatus {
  AVAILABLE = 'available',
  BOOKED = 'booked',
  LOCKED = 'locked',
}

@Entity('ad_slots')
@Index('idx_ad_slots_channel', ['channelId'])
export class AdSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'float' })
  price: number;

  @Column({ type: 'int', comment: 'Duration in seconds/hours' })
  duration: number;

  @Column({ type: 'enum', enum: AdSlotStatus, default: AdSlotStatus.AVAILABLE })
  status: AdSlotStatus;

  @Column({ name: 'channel_id', type: 'bigint' })
  channelId: string;

  @ManyToOne(() => Channel, (channel) => channel.adSlots)
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
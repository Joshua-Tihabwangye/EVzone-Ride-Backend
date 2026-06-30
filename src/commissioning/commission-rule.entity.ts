import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ServiceType } from '../common/enums';
import { numberTransformer } from '../common/utils/money';

@Entity('commission_rules')
export class CommissionRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Index()
  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column({ nullable: true })
  marketId?: string;

  @Index()
  @Column({ nullable: true })
  organizationId?: string;

  @Index()
  @Column({ nullable: true })
  fleetId?: string;

  @Column({ nullable: true })
  vehicleType?: string;

  @Column({ default: 0 })
  priority!: number;

  @Column()
  effectiveFrom!: Date;

  @Column({ nullable: true })
  effectiveUntil?: Date;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 85.0, transformer: numberTransformer })
  driverSharePercent!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 15.0, transformer: numberTransformer })
  platformFeePercent!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  fixedPlatformFee!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: numberTransformer })
  taxPercent!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100.0, transformer: numberTransformer })
  tipPayoutPercent!: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

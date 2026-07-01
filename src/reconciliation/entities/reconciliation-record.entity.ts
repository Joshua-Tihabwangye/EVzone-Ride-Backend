import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ReconciliationStatus } from '../../common/enums';
import { numberTransformer } from '../../common/utils/money';

@Entity('reconciliation_records')
export class ReconciliationRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  runId!: string;

  @Column()
  internalRecordType!: string;

  @Index()
  @Column()
  internalRecordId!: string;

  @Index()
  @Column({ nullable: true })
  providerReference?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  expectedAmount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  settledAmount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  variance!: number;

  @Column({ type: 'simple-enum', enum: ReconciliationStatus, default: ReconciliationStatus.OPEN })
  status!: ReconciliationStatus;

  @Column({ nullable: true, type: 'text' })
  resolution?: string;

  @Column({ nullable: true })
  resolvedByUserId?: string;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @Column({ nullable: true })
  provider?: string;

  @Column({ nullable: true })
  statementDate?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ReconciliationRunStatus } from '../../common/enums';

@Entity('reconciliation_runs')
export class ReconciliationRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  type!: string;

  @Index()
  @Column()
  periodStart!: Date;

  @Index()
  @Column()
  periodEnd!: Date;

  @Column({ type: 'simple-enum', enum: ReconciliationRunStatus, default: ReconciliationRunStatus.OPEN })
  status!: ReconciliationRunStatus;

  @Column({ type: 'simple-json', nullable: true })
  summary?: Record<string, unknown>;

  @Column({ nullable: true })
  createdByUserId?: string;

  @Column({ nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

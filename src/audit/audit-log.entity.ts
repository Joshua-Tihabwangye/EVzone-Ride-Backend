import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Append-only audit log. Rows are protected from UPDATE and DELETE by a
 * PostgreSQL trigger in production. The checksum column stores an HMAC of the
 * canonical row content for tamper detection.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Index()
  @Column({ nullable: true })
  actorUserId?: string;

  @Column()
  action!: string;

  @Column()
  entityType!: string;

  @Index()
  @Column({ nullable: true })
  entityId?: string;

  @Column({ nullable: true })
  route?: string;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ type: 'simple-json', nullable: true })
  before?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  after?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  changedFields?: string[];

  @Column({ nullable: true })
  reason?: string;

  @Column({ nullable: true })
  requestId?: string;

  @Column({ nullable: true })
  checksum?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

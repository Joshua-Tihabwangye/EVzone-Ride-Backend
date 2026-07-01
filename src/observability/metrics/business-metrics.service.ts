import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { MetricsService } from './metrics.service';

@Injectable()
export class BusinessMetricsService {
  private readonly httpDuration: Histogram<'method' | 'route' | 'status'>;
  private readonly httpTotal: Counter<'method' | 'route' | 'status'>;

  private readonly ridesCreated: Counter<string>;
  private readonly ridesCompleted: Counter<string>;

  private readonly deliveriesCreated: Counter<string>;
  private readonly deliveriesCompleted: Counter<string>;

  private readonly paymentsConfirmed: Counter<string>;
  private readonly paymentsRefunded: Counter<string>;

  private readonly cashoutsRequested: Counter<string>;
  private readonly cashoutsApproved: Counter<string>;
  private readonly cashoutsRejected: Counter<string>;

  private readonly payoutsCompleted: Counter<string>;
  private readonly payoutsFailed: Counter<string>;

  private readonly dispatchOffersCreated: Counter<string>;
  private readonly dispatchOffersAccepted: Counter<string>;
  private readonly dispatchMatchesRun: Counter<string>;

  private readonly webhookEvents: Counter<'provider' | 'status'>;
  private readonly webhookRetries: Counter<string>;

  private readonly domainEvents: Counter<'topic' | 'status'>;

  private readonly auditLogs: Counter<string>;

  private readonly operationsAlerts: Counter<'severity' | 'status'>;

  private readonly operationsInterventions: Counter<'action'>;

  private readonly providerDuration: Histogram<'provider' | 'operation'>;
  private readonly providerTotal: Counter<'provider' | 'operation' | 'status'>;

  private readonly queueJobs: Counter<'queue' | 'event'>;

  private readonly walletMovements: Counter<'direction' | 'type'>;

  private readonly driversOnline: Gauge<string>;
  private readonly activeServices: Gauge<'service_type'>;
  private readonly pendingCashouts: Gauge<string>;
  private readonly failedWebhooks: Gauge<string>;
  private readonly outboxBacklog: Gauge<'outbox_type'>;

  constructor(private readonly metrics: MetricsService) {
    this.httpDuration = this.metrics.getHistogram(
      'evzone_http_request_duration_seconds',
      'HTTP request duration in seconds',
      ['method', 'route', 'status'],
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    );
    this.httpTotal = this.metrics.getCounter('evzone_http_requests_total', 'Total HTTP requests', [
      'method',
      'route',
      'status',
    ]);

    this.ridesCreated = this.metrics.getCounter('evzone_rides_created_total', 'Total rides created');
    this.ridesCompleted = this.metrics.getCounter('evzone_rides_completed_total', 'Total rides completed');

    this.deliveriesCreated = this.metrics.getCounter(
      'evzone_deliveries_created_total',
      'Total deliveries created',
    );
    this.deliveriesCompleted = this.metrics.getCounter(
      'evzone_deliveries_completed_total',
      'Total deliveries completed',
    );

    this.paymentsConfirmed = this.metrics.getCounter(
      'evzone_payments_confirmed_total',
      'Total confirmed payments',
    );
    this.paymentsRefunded = this.metrics.getCounter(
      'evzone_payments_refunded_total',
      'Total refunded payments',
    );

    this.cashoutsRequested = this.metrics.getCounter(
      'evzone_cashouts_requested_total',
      'Total cashout requests',
    );
    this.cashoutsApproved = this.metrics.getCounter(
      'evzone_cashouts_approved_total',
      'Total approved cashouts',
    );
    this.cashoutsRejected = this.metrics.getCounter(
      'evzone_cashouts_rejected_total',
      'Total rejected cashouts',
    );

    this.payoutsCompleted = this.metrics.getCounter(
      'evzone_payouts_completed_total',
      'Total completed payouts',
    );
    this.payoutsFailed = this.metrics.getCounter('evzone_payouts_failed_total', 'Total failed payouts');

    this.dispatchOffersCreated = this.metrics.getCounter(
      'evzone_dispatch_offers_created_total',
      'Total dispatch offers created',
    );
    this.dispatchOffersAccepted = this.metrics.getCounter(
      'evzone_dispatch_offers_accepted_total',
      'Total dispatch offers accepted',
    );
    this.dispatchMatchesRun = this.metrics.getCounter(
      'evzone_dispatch_matches_run_total',
      'Total dispatch match runs',
    );

    this.webhookEvents = this.metrics.getCounter(
      'evzone_webhook_events_total',
      'Total webhook events received',
      ['provider', 'status'],
    );
    this.webhookRetries = this.metrics.getCounter(
      'evzone_webhook_retries_total',
      'Total webhook retry attempts',
    );

    this.domainEvents = this.metrics.getCounter(
      'evzone_domain_events_total',
      'Total domain events processed',
      ['topic', 'status'],
    );

    this.auditLogs = this.metrics.getCounter('evzone_audit_logs_total', 'Total audit log entries');

    this.operationsAlerts = this.metrics.getCounter(
      'evzone_operations_alerts_total',
      'Total operational alerts',
      ['severity', 'status'],
    );

    this.operationsInterventions = this.metrics.getCounter(
      'evzone_operations_interventions_total',
      'Total operations interventions',
      ['action'],
    );

    this.providerDuration = this.metrics.getHistogram(
      'evzone_provider_request_duration_seconds',
      'External provider request duration in seconds',
      ['provider', 'operation'],
      [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    );
    this.providerTotal = this.metrics.getCounter(
      'evzone_provider_request_total',
      'Total external provider requests',
      ['provider', 'operation', 'status'],
    );

    this.queueJobs = this.metrics.getCounter('evzone_queue_jobs_total', 'Total queue job events', [
      'queue',
      'event',
    ]);

    this.walletMovements = this.metrics.getCounter(
      'evzone_wallet_movements_total',
      'Total wallet movements',
      ['direction', 'type'],
    );

    this.driversOnline = this.metrics.getGauge('evzone_drivers_online', 'Number of online drivers');
    this.activeServices = this.metrics.getGauge('evzone_active_services', 'Number of active services', [
      'service_type',
    ]);
    this.pendingCashouts = this.metrics.getGauge('evzone_pending_cashouts', 'Number of pending cashouts');
    this.failedWebhooks = this.metrics.getGauge(
      'evzone_failed_webhooks',
      'Number of failed webhooks awaiting retry',
    );
    this.outboxBacklog = this.metrics.getGauge(
      'evzone_outbox_backlog',
      'Number of items in the outbox backlog',
      ['outbox_type'],
    );
  }

  recordHttpRequest(method: string, route: string, status: number, durationSeconds: number): void {
    const statusLabel = String(status);
    this.httpDuration.observe({ method, route, status: statusLabel }, durationSeconds);
    this.httpTotal.inc({ method, route, status: statusLabel });
  }

  recordRideCreated(): void {
    this.ridesCreated.inc();
  }

  recordRideCompleted(): void {
    this.ridesCompleted.inc();
  }

  recordDeliveryCreated(): void {
    this.deliveriesCreated.inc();
  }

  recordDeliveryCompleted(): void {
    this.deliveriesCompleted.inc();
  }

  recordPaymentConfirmed(): void {
    this.paymentsConfirmed.inc();
  }

  recordPaymentRefunded(): void {
    this.paymentsRefunded.inc();
  }

  recordCashoutRequested(): void {
    this.cashoutsRequested.inc();
  }

  recordCashoutApproved(): void {
    this.cashoutsApproved.inc();
  }

  recordCashoutRejected(): void {
    this.cashoutsRejected.inc();
  }

  recordPayoutCompleted(): void {
    this.payoutsCompleted.inc();
  }

  recordPayoutFailed(): void {
    this.payoutsFailed.inc();
  }

  recordDispatchOfferCreated(): void {
    this.dispatchOffersCreated.inc();
  }

  recordDispatchOfferAccepted(): void {
    this.dispatchOffersAccepted.inc();
  }

  recordDispatchMatchRun(): void {
    this.dispatchMatchesRun.inc();
  }

  recordWebhookEvent(provider: string, status: string): void {
    this.webhookEvents.inc({ provider: provider.toUpperCase(), status });
  }

  recordWebhookRetryAttempt(): void {
    this.webhookRetries.inc();
  }

  recordDomainEvent(topic: string, status: string): void {
    this.domainEvents.inc({ topic, status });
  }

  recordAuditLog(): void {
    this.auditLogs.inc();
  }

  recordOperationsAlert(severity: string, status: string): void {
    this.operationsAlerts.inc({ severity: severity.toUpperCase(), status: status.toUpperCase() });
  }

  recordOperationsIntervention(action: string): void {
    this.operationsInterventions.inc({ action });
  }

  recordProviderRequest(provider: string, operation: string, status: string, durationSeconds: number): void {
    this.providerDuration.observe({ provider, operation }, durationSeconds);
    this.providerTotal.inc({ provider, operation, status });
  }

  recordQueueJob(queue: string, event: string): void {
    this.queueJobs.inc({ queue, event });
  }

  recordWalletMovement(direction: string, type: string): void {
    this.walletMovements.inc({ direction, type });
  }

  setDriversOnline(value: number): void {
    this.driversOnline.set(value);
  }

  setActiveServices(serviceType: string, value: number): void {
    this.activeServices.set({ service_type: serviceType }, value);
  }

  setPendingCashouts(value: number): void {
    this.pendingCashouts.set(value);
  }

  setFailedWebhooks(value: number): void {
    this.failedWebhooks.set(value);
  }

  setOutboxBacklog(outboxType: string, value: number): void {
    this.outboxBacklog.set({ outbox_type: outboxType }, value);
  }
}

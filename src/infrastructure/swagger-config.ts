import { DocumentBuilder } from '@nestjs/swagger';
import { BRAND } from '../common/constants';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('EVzone Ride – Rides & Logistics API')
    .setDescription(
      'Unified EVzone Ride and Logistics backend for ride-hailing, deliveries, tourist vehicles, ambulances, car rental, Fleet Partner, Agent/Dispatcher, Admin, school-fleet synchronization and CorporatePay integration. Version 10 adds the universal dispatch-unit domain, policy engine, auditable decision data, concurrency-safe assignment models and transactional dispatch outbox foundations.',
    )
    .setVersion('10.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addServer('/api/v1', 'Version 1')
    .addTag('Authentication')
    .addTag('Ride Hailing')
    .addTag('Deliveries')
    .addTag('Tourist Vehicles')
    .addTag('Ambulance')
    .addTag('Car Rental')
    .addTag('Organizations')
    .addTag('Fleet Partner')
    .addTag('Fleet Partner Portal')
    .addTag('Agent & Dispatcher')
    .addTag('Agent Portal v7')
    .addTag('Admin Portal v8')
    .addTag('CorporatePay Partner API v9')
    .addTag('CorporatePay Integration')
    .addTag('Administration')
    .addTag('Infrastructure')
    .addTag('Operations')
    .addTag('Governance & Risk')
    .addTag('Health')
    .addTag('Matching & Job Offers')
    .addTag('Universal Dispatch v10')
    .addTag('Mobile App Contracts')
    .addTag('Driver Jobs')
    .addTag('Rider Places')
    .addTag('Reviews & Ratings')
    .addTag('Driver Preferences & Learning')
    .addTag('Accounting & Double-Entry Ledger')
    .addTag('Delivery Routes')
    .build();
}

export const SWAGGER_UI_PATH = 'docs';
export const SWAGGER_SITE_TITLE = `${BRAND.name} API Documentation`;

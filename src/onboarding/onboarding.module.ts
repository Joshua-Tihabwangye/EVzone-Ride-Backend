import { Module } from '@nestjs/common';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { UserDocumentsController } from './user-documents.controller';

@Module({
  controllers: [OnboardingController, UserDocumentsController, EmergencyContactsController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}

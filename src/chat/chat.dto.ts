import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateThreadDto {
  @IsString() contextType!: string;
  @IsString() contextId!: string;
  @IsArray() participantUserIds!: string[];
}

export class SendMessageDto {
  @IsString() body!: string;
  @IsOptional() @IsArray() attachments?: string[];
}

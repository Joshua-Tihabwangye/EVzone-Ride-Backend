import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import { ChatService } from './chat.service';
import { CreateThreadDto, SendMessageDto } from './chat.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Post('threads')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateThreadDto) {
    return this.service.createThread(user.id, dto);
  }

  @Get('threads')
  list(@CurrentUser() user: AuthUser) {
    return this.service.listThreads(user.id);
  }

  @Get('threads/:id')
  thread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getThread(user.id, id);
  }

  @Get('threads/:id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.service.listMessages(user.id, id, Number(page), Math.min(Number(limit), 100));
  }

  @Post('threads/:id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.service.send(user.id, id, dto);
  }

  @Post('threads/:id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markRead(user.id, id);
  }
}

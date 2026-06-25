import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChatMessage, ChatParticipant, ChatThread, User } from '../database/entities';
import { CreateThreadDto, SendMessageDto } from './chat.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatThread) private readonly threads: Repository<ChatThread>,
    @InjectRepository(ChatParticipant) private readonly participants: Repository<ChatParticipant>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly events: EventEmitter2,
  ) {}

  async createThread(userId: string, dto: CreateThreadDto) {
    let thread = await this.threads.findOne({
      where: { contextType: dto.contextType, contextId: dto.contextId },
    });
    if (!thread) {
      thread = await this.threads.save(
        this.threads.create({
          contextType: dto.contextType,
          contextId: dto.contextId,
          createdByUserId: userId,
        }),
      );
    }
    const ids = [...new Set([userId, ...dto.participantUserIds])];
    const validUsers = await this.users.find({ where: { id: In(ids) } });
    if (validUsers.length !== ids.length)
      throw new NotFoundException('One or more chat participants do not exist');
    const existing = await this.participants.find({ where: { threadId: thread.id } });
    const existingIds = new Set(existing.map((item) => item.userId));
    await this.participants.save(
      ids
        .filter((id) => !existingIds.has(id))
        .map((id) => this.participants.create({ threadId: thread.id, userId: id })),
    );
    return this.getThread(userId, thread.id);
  }

  async listThreads(userId: string) {
    const memberships = await this.participants.find({ where: { userId } });
    if (!memberships.length) return [];
    const threads = await this.threads.find({
      where: { id: In(memberships.map((item) => item.threadId)) },
      order: { lastMessageAt: 'DESC', createdAt: 'DESC' },
    });
    const allParticipants = await this.participants.find({
      where: { threadId: In(threads.map((item) => item.id)) },
    });
    const users = await this.users.find({
      where: { id: In([...new Set(allParticipants.map((item) => item.userId))]) },
    });
    return Promise.all(
      threads.map(async (thread) => ({
        thread,
        participants: allParticipants
          .filter((item) => item.threadId === thread.id)
          .map((item) => ({ ...item, user: users.find((user) => user.id === item.userId) })),
        lastMessage: await this.messages.findOne({
          where: { threadId: thread.id },
          order: { createdAt: 'DESC' },
        }),
      })),
    );
  }

  async getThread(userId: string, threadId: string) {
    await this.assertMember(userId, threadId);
    const thread = await this.threads.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Chat thread not found');
    const participants = await this.participants.find({ where: { threadId } });
    const users = participants.length
      ? await this.users.find({ where: { id: In(participants.map((item) => item.userId)) } })
      : [];
    return {
      thread,
      participants: participants.map((item) => ({
        ...item,
        user: users.find((user) => user.id === item.userId),
      })),
    };
  }

  async listMessages(userId: string, threadId: string, page = 1, limit = 50) {
    await this.assertMember(userId, threadId);
    const [items, total] = await this.messages.findAndCount({
      where: { threadId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: items.reverse(), meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async send(userId: string, threadId: string, dto: SendMessageDto) {
    await this.assertMember(userId, threadId);
    const message = await this.messages.save(
      this.messages.create({ threadId, senderUserId: userId, body: dto.body, attachments: dto.attachments }),
    );
    await this.threads.update(threadId, { lastMessageAt: message.createdAt });
    const recipients = await this.participants.find({ where: { threadId } });
    this.events.emit('service.updated', {
      serviceType: 'CHAT',
      serviceId: threadId,
      data: { event: 'chat.message', message },
    });
    for (const recipient of recipients.filter((item) => item.userId !== userId)) {
      this.events.emit('user.event', { userId: recipient.userId, event: 'chat.message', data: message });
    }
    return message;
  }

  async markRead(userId: string, threadId: string) {
    const participant = await this.assertMember(userId, threadId);
    participant.lastReadAt = new Date();
    await this.participants.save(participant);
    return { read: true, at: participant.lastReadAt };
  }

  private async assertMember(userId: string, threadId: string) {
    const participant = await this.participants.findOne({ where: { threadId, userId } });
    if (!participant) throw new ForbiddenException('You are not a participant in this chat');
    return participant;
  }
}

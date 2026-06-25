import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedContact, User, UserAddress, UserPreference, Wallet } from '../database/entities';
import {
  CreateAddressDto,
  CreateContactDto,
  UpdateAddressDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
} from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserAddress) private readonly addresses: Repository<UserAddress>,
    @InjectRepository(SavedContact) private readonly contacts: Repository<SavedContact>,
    @InjectRepository(UserPreference) private readonly preferences: Repository<UserPreference>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findForAuthentication(identifier: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:identifier)', { identifier })
      .orWhere('user.phone = :identifier', { identifier })
      .getOne();
  }

  async assertEmailPhoneAvailable(email?: string, phone?: string, exceptId?: string): Promise<void> {
    if (email) {
      const query = this.users
        .createQueryBuilder('user')
        .where('LOWER(user.email) = LOWER(:email)', { email });
      if (exceptId) query.andWhere('user.id != :exceptId', { exceptId });
      if (await query.getOne()) throw new ConflictException('Email is already registered');
    }
    if (phone) {
      const query = this.users.createQueryBuilder('user').where('user.phone = :phone', { phone });
      if (exceptId) query.andWhere('user.id != :exceptId', { exceptId });
      if (await query.getOne()) throw new ConflictException('Phone is already registered');
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    await this.assertEmailPhoneAvailable(dto.email, dto.phone, userId);
    const user = await this.findById(userId);
    Object.assign(user, dto);
    return this.users.save(user);
  }

  async profile(userId: string) {
    const [user, addresses, preferences, wallet] = await Promise.all([
      this.findById(userId),
      this.addresses.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } }),
      this.preferences.findOne({ where: { userId } }),
      this.wallets.findOne({ where: { userId } }),
    ]);
    return { user, addresses, preferences, wallet };
  }

  listAddresses(userId: string) {
    return this.addresses.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });
  }

  async createAddress(userId: string, dto: CreateAddressDto): Promise<UserAddress> {
    if (dto.isDefault) await this.addresses.update({ userId }, { isDefault: false });
    return this.addresses.save(this.addresses.create({ ...dto, userId }));
  }

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto): Promise<UserAddress> {
    const address = await this.addresses.findOne({ where: { id, userId } });
    if (!address) throw new NotFoundException('Address not found');
    if (dto.isDefault) await this.addresses.update({ userId }, { isDefault: false });
    Object.assign(address, dto);
    return this.addresses.save(address);
  }

  async deleteAddress(userId: string, id: string): Promise<{ deleted: true }> {
    const result = await this.addresses.softDelete({ id, userId });
    if (!result.affected) throw new NotFoundException('Address not found');
    return { deleted: true };
  }

  listContacts(userId: string) {
    return this.contacts.find({ where: { ownerUserId: userId }, order: { createdAt: 'DESC' } });
  }

  createContact(userId: string, dto: CreateContactDto) {
    return this.contacts.save(this.contacts.create({ ...dto, ownerUserId: userId }));
  }

  async updateContact(userId: string, id: string, dto: Partial<CreateContactDto>) {
    const contact = await this.contacts.findOne({ where: { id, ownerUserId: userId } });
    if (!contact) throw new NotFoundException('Contact not found');
    Object.assign(contact, dto);
    return this.contacts.save(contact);
  }

  async deleteContact(userId: string, id: string) {
    const result = await this.contacts.softDelete({ id, ownerUserId: userId });
    if (!result.affected) throw new NotFoundException('Contact not found');
    return { deleted: true };
  }

  async getPreferences(userId: string): Promise<UserPreference> {
    let preference = await this.preferences.findOne({ where: { userId } });
    if (!preference) preference = await this.preferences.save(this.preferences.create({ userId }));
    return preference;
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<UserPreference> {
    const preference = await this.getPreferences(userId);
    Object.assign(preference, dto);
    return this.preferences.save(preference);
  }
}

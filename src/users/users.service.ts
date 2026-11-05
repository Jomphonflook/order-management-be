import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { isValidObjectId, Model } from 'mongoose';
import { CreateAdminDto } from './dto/create-admin.dto.js';
import { UpdateAdminDto } from './dto/update-admin.dto.js';
import { User, UserDocument, UserRole } from './user.schema.js';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: Date;
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialOwner();
  }

  async ensureInitialOwner(): Promise<void> {
    await this.userModel.init();
    if (await this.userModel.exists({ role: UserRole.OWNER })) {
      return;
    }

    const email = this.config
      .getOrThrow<string>('OWNER_EMAIL')
      .trim()
      .toLowerCase();
    const password = this.config.getOrThrow<string>('OWNER_PASSWORD');
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await this.userModel.create({
        name: 'Owner',
        email,
        passwordHash,
        role: UserRole.OWNER,
        isActive: true,
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000 &&
        (await this.userModel.exists({ role: UserRole.OWNER }))
      ) {
        return;
      }
      throw error;
    }
  }

  async listAdmins(): Promise<SafeUser[]> {
    const users = await this.userModel
      .find({ role: UserRole.ADMIN })
      .sort({ createdAt: -1 })
      .exec();
    return users.map((user) => this.toSafeUser(user));
  }

  async createAdmin(dto: CreateAdminDto): Promise<SafeUser> {
    this.validateBcryptPassword(dto.password);
    try {
      const user = await this.userModel.create({
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: UserRole.ADMIN,
        isActive: true,
      });
      return this.toSafeUser(user);
    } catch (error) {
      this.throwForDuplicateEmail(error);
      throw error;
    }
  }

  async updateAdmin(id: string, dto: UpdateAdminDto): Promise<SafeUser> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid user id');
    }

    const update: Partial<User> = {};
    if (dto.name !== undefined) update.name = dto.name.trim();
    if (dto.email !== undefined) update.email = dto.email.trim().toLowerCase();
    if (dto.isActive !== undefined) update.isActive = dto.isActive;
    if (dto.password !== undefined) {
      this.validateBcryptPassword(dto.password);
      update.passwordHash = await bcrypt.hash(dto.password, 12);
    }
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('At least one update field is required');
    }

    try {
      const user = await this.userModel
        .findOneAndUpdate({ _id: id, role: UserRole.ADMIN }, update, {
          new: true,
          runValidators: true,
        })
        .exec();

      if (!user) {
        throw new NotFoundException('Admin account not found');
      }
      return this.toSafeUser(user);
    } catch (error) {
      this.throwForDuplicateEmail(error);
      throw error;
    }
  }

  private validateBcryptPassword(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Password must be at most 72 bytes');
    }
  }

  private throwForDuplicateEmail(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException('An account with this email already exists');
    }
  }

  private toSafeUser(user: UserDocument): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.get('createdAt') as Date | undefined,
    };
  }
}

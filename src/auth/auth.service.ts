import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from '../users/user.schema.js';
import { SafeUser } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ user: SafeUser; token: string }> {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const user = (await this.userModel
      .findOne({ email: dto.email.trim().toLowerCase() })
      .select('+passwordHash')
      .exec()) as UserDocument | null;
    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const safeUser: SafeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.get('createdAt') as Date | undefined,
    };
    const token = await this.jwtService.signAsync({
      sub: safeUser.id,
      email: safeUser.email,
      role: safeUser.role,
    });
    return { user: safeUser, token };
  }

  async authenticateToken(token: string): Promise<SafeUser> {
    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication');
    }

    if (
      typeof payload.sub !== 'string' ||
      !Object.values(UserRole).includes(payload.role)
    ) {
      throw new UnauthorizedException('Invalid authentication');
    }

    const user = await this.userModel
      .findOne({ _id: payload.sub, isActive: true })
      .exec();
    if (!user || user.role !== payload.role) {
      throw new UnauthorizedException('Invalid or expired authentication');
    }
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

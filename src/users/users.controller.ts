import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateAdminDto } from './dto/create-admin.dto.js';
import { UpdateAdminDto } from './dto/update-admin.dto.js';
import { SafeUser, UsersService } from './users.service.js';
import { UserRole } from './user.schema.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listAdmins(): Promise<SafeUser[]> {
    return this.usersService.listAdmins();
  }

  @Post()
  createAdmin(@Body() dto: CreateAdminDto): Promise<SafeUser> {
    return this.usersService.createAdmin(dto);
  }

  @Patch(':id')
  updateAdmin(
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ): Promise<SafeUser> {
    return this.usersService.updateAdmin(id, dto);
  }
}

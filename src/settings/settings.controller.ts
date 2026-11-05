import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from '../users/user.schema.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { SettingDocument } from './setting.schema.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(): Promise<SettingDocument> {
    return this.settingsService.get();
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  update(@Body() dto: UpdateSettingsDto): Promise<SettingDocument> {
    return this.settingsService.update(dto);
  }
}

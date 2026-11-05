import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { Setting, SettingDocument } from './setting.schema.js';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name)
    private readonly settingModel: Model<Setting>,
  ) {}

  async get(): Promise<SettingDocument> {
    return this.settingModel
      .findOneAndUpdate(
        { key: 'store' },
        { $setOnInsert: { key: 'store' } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async update(dto: UpdateSettingsDto): Promise<SettingDocument> {
    return this.settingModel
      .findOneAndUpdate(
        { key: 'store' },
        {
          $set: {
            storeName: dto.storeName.trim(),
            senderName: dto.senderName.trim(),
            senderPhone: dto.senderPhone.trim(),
            senderAddress: dto.senderAddress.trim(),
            labelPaperSize: dto.labelPaperSize,
          },
          $setOnInsert: { key: 'store' },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();
  }
}

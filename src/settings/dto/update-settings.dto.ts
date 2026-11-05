import {
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LabelPaperSize } from '../setting.schema.js';

export class UpdateSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/)
  storeName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/)
  senderName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/\S/)
  senderPhone: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/)
  senderAddress: string;

  @IsEnum(LabelPaperSize)
  labelPaperSize: LabelPaperSize;
}

import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const toNumber = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || typeof value !== 'string') {
    return value;
  }
  return value.trim() === '' ? Number.NaN : Number(value);
};

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  sku: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  category: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice: number;

  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice: number;

  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionPercent: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}

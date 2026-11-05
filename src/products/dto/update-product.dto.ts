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

const isProvided = (_object: object, value: unknown) => value !== undefined;
const toNumber = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || typeof value !== 'string') {
    return value;
  }
  return value.trim() === '' ? Number.NaN : Number(value);
};

export class UpdateProductDto {
  @ValidateIf(isProvided)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/)
  name?: string;

  @ValidateIf(isProvided)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  sku?: string;

  @ValidateIf(isProvided)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  category?: string;

  @ValidateIf(isProvided)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ValidateIf(isProvided)
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @ValidateIf(isProvided)
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @ValidateIf(isProvided)
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @ValidateIf(isProvided)
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}

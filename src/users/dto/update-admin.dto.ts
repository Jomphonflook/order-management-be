import {
  IsBoolean,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateAdminDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

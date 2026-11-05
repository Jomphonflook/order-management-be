import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAdminDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password: string;
}

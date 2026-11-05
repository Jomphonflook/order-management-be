import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderStatus, PaymentStatus } from '../order.schema.js';

export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @IsOptional()
  @IsIn(Object.values(OrderStatus))
  orderStatus?: OrderStatus;

  @IsOptional()
  @IsIn(Object.values(PaymentStatus))
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(50)
  limit = 10;

  @IsOptional()
  @IsIn(['createdAt', 'orderNumber', 'customer.name', 'totalCents'])
  sortBy: 'createdAt' | 'orderNumber' | 'customer.name' | 'totalCents' =
    'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsIn(['day', 'month', 'year'])
  interval: 'day' | 'month' | 'year' = 'day';
}

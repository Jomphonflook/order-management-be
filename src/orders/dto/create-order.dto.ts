import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CommissionStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../order.schema.js';

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() === '' ? Number.NaN : Number(value);
};

export class OrderAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/)
  addressLine: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  subdistrict: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  district: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  province: string;

  @IsString()
  @Matches(/^\d{5}$/)
  postalCode: string;
}

export class OrderCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/\S/)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  facebookName?: string;

  @ValidateNested()
  @Type(() => OrderAddressDto)
  address: OrderAddressDto;
}

export class OrderItemDto {
  @IsString()
  @Matches(/^[a-f\d]{24}$/i)
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity: number;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => OrderCustomerDto)
  customer: OrderCustomerDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingCost?: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentNote?: string;
}

export class UpdateOrderDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderCustomerDto)
  customer?: OrderCustomerDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCompany?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string;

  @IsOptional()
  @IsEnum(CommissionStatus)
  commissionStatus?: CommissionStatus;
}

export class BulkUpdateOrderStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^[a-f\d]{24}$/i, { each: true })
  orderIds: string[];

  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsEnum(CommissionStatus)
  commissionStatus?: CommissionStatus;
}

export class ListOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;
}

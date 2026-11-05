import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PENDING_VERIFICATION = 'pending_verification',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

export enum ShippingStatus {
  NOT_SHIPPED = 'not_shipped',
  PREPARING = 'preparing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  RETURNED = 'returned',
}

export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  COD = 'cod',
}

export enum CommissionStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

@Schema({ _id: false })
export class OrderAddress {
  @Prop({ required: true, trim: true, maxlength: 500 })
  addressLine: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  subdistrict: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  district: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  province: string;

  @Prop({ required: true, trim: true, maxlength: 10 })
  postalCode: string;
}

export const OrderAddressSchema = SchemaFactory.createForClass(OrderAddress);

@Schema({ _id: false })
export class OrderCustomer {
  @Prop({ required: true, trim: true, maxlength: 150 })
  name: string;

  @Prop({ required: true, trim: true, maxlength: 30 })
  phone: string;

  @Prop({ default: '', trim: true, maxlength: 150 })
  facebookName: string;

  @Prop({ type: OrderAddressSchema, required: true })
  address: OrderAddress;
}

export const OrderCustomerSchema = SchemaFactory.createForClass(OrderCustomer);

@Schema({ _id: false })
export class OrderItem {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Product',
    required: true,
  })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, uppercase: true })
  sku: string;

  @Prop({ required: true, min: 0 })
  sellingPriceCents: number;

  @Prop({ required: true, min: 0 })
  costPriceCents: number;

  @Prop({ required: true, min: 0, max: 100 })
  commissionPercent: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  subtotalCents: number;

  @Prop({ required: true, min: 0 })
  costTotalCents: number;

  @Prop({ required: true, min: 0 })
  commissionCents: number;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class PaymentSlip {
  @Prop({ required: true })
  filename: string;

  @Prop({
    required: true,
    type: String,
    enum: ['image/jpeg', 'image/png', 'image/webp'],
  })
  contentType: string;

  @Prop({ required: true })
  uploadedAt: Date;
}

export const PaymentSlipSchema = SchemaFactory.createForClass(PaymentSlip);

@Schema({ timestamps: true, versionKey: false })
export class Order {
  @Prop({ required: true, unique: true })
  orderNumber: string;

  @Prop({ type: OrderCustomerSchema, required: true })
  customer: OrderCustomer;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  subtotalCents: number;

  @Prop({ required: true, min: 0 })
  discountCents: number;

  @Prop({ required: true, min: 0 })
  shippingChargeCents: number;

  @Prop({ required: true, min: 0, default: 0 })
  shippingCostCents: number;

  @Prop({ required: true, min: 0 })
  totalCents: number;

  @Prop({ required: true, min: 0 })
  productCostCents: number;

  @Prop({ required: true })
  grossProfitCents: number;

  @Prop({ required: true, min: 0 })
  commissionCents: number;

  @Prop({ required: true, min: 0 })
  otherExpensesCents: number;

  @Prop({ required: true })
  netProfitCents: number;

  @Prop({ required: true, type: String, enum: Object.values(OrderStatus) })
  orderStatus: OrderStatus;

  @Prop({ required: true, type: String, enum: Object.values(PaymentStatus) })
  paymentStatus: PaymentStatus;

  @Prop({ required: true, type: String, enum: Object.values(PaymentMethod) })
  paymentMethod: PaymentMethod;

  @Prop({ required: true, min: 0, default: 0 })
  amountPaidCents: number;

  @Prop()
  paidAt?: Date;

  @Prop({ default: '', maxlength: 1000 })
  paymentNote: string;

  @Prop({ type: PaymentSlipSchema, default: null })
  paymentSlip?: PaymentSlip | null;

  @Prop({ required: true, type: String, enum: Object.values(ShippingStatus) })
  shippingStatus: ShippingStatus;

  @Prop({ default: '', trim: true, maxlength: 100 })
  shippingCompany: string;

  @Prop({ default: '', trim: true, maxlength: 100 })
  trackingNumber: string;

  @Prop()
  shippedAt?: Date;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  createdBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  createdByName: string;

  @Prop({ required: true, lowercase: true, trim: true })
  createdByEmail: string;

  @Prop({ required: true, type: String, enum: Object.values(CommissionStatus) })
  commissionStatus: CommissionStatus;

  @Prop()
  commissionPaidAt?: Date;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ orderStatus: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, createdAt: -1 });

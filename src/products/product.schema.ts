import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: true, versionKey: false })
export class ProductImage {
  id: string;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  contentType: string;
}

export const ProductImageSchema = SchemaFactory.createForClass(ProductImage);

@Schema({ timestamps: true, versionKey: false })
export class Product {
  @Prop({ required: true, trim: true, maxlength: 150 })
  name: string;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  sku: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  category: string;

  @Prop({ default: '', maxlength: 5000 })
  description: string;

  @Prop({ required: true, min: 0 })
  sellingPrice: number;

  @Prop({ required: true, min: 0 })
  costPrice: number;

  @Prop({ required: true, min: 0 })
  profitPerUnit: number;

  @Prop({ required: true, min: 0, max: 100 })
  commissionPercent: number;

  @Prop({ type: [ProductImageSchema], default: [] })
  images: ProductImage[];

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);

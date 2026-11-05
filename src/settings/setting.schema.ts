import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum LabelPaperSize {
  A4 = 'A4',
  A5 = 'A5',
  LABEL_100X150 = '100x150mm',
}

@Schema({ timestamps: true, versionKey: false })
export class Setting {
  @Prop({ required: true, unique: true, default: 'store' })
  key: string;

  @Prop({ required: true, default: 'LEKTAE', trim: true, maxlength: 150 })
  storeName: string;

  @Prop({ required: true, default: '', trim: true, maxlength: 150 })
  senderName: string;

  @Prop({ required: true, default: '', trim: true, maxlength: 30 })
  senderPhone: string;

  @Prop({ required: true, default: '', trim: true, maxlength: 500 })
  senderAddress: string;

  @Prop({
    required: true,
    default: LabelPaperSize.A4,
    type: String,
    enum: Object.values(LabelPaperSize),
  })
  labelPaperSize: LabelPaperSize;
}

export type SettingDocument = HydratedDocument<Setting>;
export const SettingSchema = SchemaFactory.createForClass(Setting);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
}

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, type: String, enum: Object.values(UserRole) })
  role: UserRole;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: UserRole.OWNER } },
);

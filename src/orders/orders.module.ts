import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { Product, ProductSchema } from '../products/product.schema.js';
import { User, UserSchema } from '../users/user.schema.js';
import {
  Order,
  OrderCounter,
  OrderCounterSchema,
  OrderSchema,
} from './order.schema.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { PaymentSlipStorageService } from './payment-slip-storage.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderCounter.name, schema: OrderCounterSchema },
      { name: Product.name, schema: ProductSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    CloudinaryModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaymentSlipStorageService],
})
export class OrdersModule {}

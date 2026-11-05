import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { Product, ProductSchema } from '../products/product.schema.js';
import { Order, OrderSchema } from './order.schema.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { PaymentSlipStorageService } from './payment-slip-storage.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    AuthModule,
    CloudinaryModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaymentSlipStorageService],
})
export class OrdersModule {}

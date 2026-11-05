import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { Product, ProductSchema } from './product.schema.js';
import { ProductImageStorageService } from './product-image-storage.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    AuthModule,
    CloudinaryModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductImageStorageService],
})
export class ProductsModule {}

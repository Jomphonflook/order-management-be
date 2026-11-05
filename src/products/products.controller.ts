import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductDocument } from './product.schema.js';
import { ProductImageUpload } from './product-image-storage.service.js';
import { ProductsService } from './products.service.js';

const MAX_PRODUCT_IMAGES = 8;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const productImageInterceptor = () =>
  UseInterceptors(
    FilesInterceptor('images', MAX_PRODUCT_IMAGES, {
      limits: { fileSize: MAX_IMAGE_SIZE },
      fileFilter: (_request, file, callback) => {
        if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException('Images must be JPEG, PNG, or WebP files'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  );

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @productImageInterceptor()
  create(
    @Body() dto: CreateProductDto,
    @UploadedFiles() files: ProductImageUpload[] = [],
  ): Promise<ProductDocument> {
    return this.productsService.create(dto, files);
  }

  @Get()
  findAll(@Query('isActive') isActive?: string): Promise<ProductDocument[]> {
    return this.productsService.findAll(isActive);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ProductDocument> {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @productImageInterceptor()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles() files: ProductImageUpload[] = [],
  ): Promise<ProductDocument> {
    return this.productsService.update(id, dto, files);
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ): Promise<ProductDocument> {
    return this.productsService.removeImage(id, imageId);
  }
}

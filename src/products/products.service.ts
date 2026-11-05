import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { Product, ProductDocument } from './product.schema.js';
import {
  ProductImageStorageService,
  ProductImageUpload,
} from './product-image-storage.service.js';

const MAX_PRODUCT_IMAGES = 8;

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    private readonly imageStorage: ProductImageStorageService,
  ) {}

  async create(
    dto: CreateProductDto,
    files: ProductImageUpload[],
  ): Promise<ProductDocument> {
    await this.productModel.init();
    const images = await this.imageStorage.save(files);

    try {
      return await this.productModel.create({
        name: dto.name.trim(),
        sku: dto.sku.trim().toUpperCase(),
        category: dto.category.trim(),
        description: dto.description?.trim() ?? '',
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice,
        profitPerUnit: this.calculateProfit(dto.sellingPrice, dto.costPrice),
        commissionPercent: dto.commissionPercent,
        isActive: dto.isActive ?? true,
        images,
      });
    } catch (error) {
      await this.imageStorage.remove(images);
      this.throwForDuplicateSku(error);
      throw error;
    }
  }

  async findAll(isActive?: string): Promise<ProductDocument[]> {
    const filter: { isActive?: boolean } = {};
    if (isActive !== undefined) {
      if (isActive !== 'true' && isActive !== 'false') {
        throw new BadRequestException('isActive must be true or false');
      }
      filter.isActive = isActive === 'true';
    }
    return this.productModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<ProductDocument> {
    this.validateId(id);
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    files: ProductImageUpload[],
  ): Promise<ProductDocument> {
    const product = await this.findOne(id);
    if (product.images.length + files.length > MAX_PRODUCT_IMAGES) {
      throw new BadRequestException(
        `A product can have at most ${MAX_PRODUCT_IMAGES} images`,
      );
    }
    const hasFields = Object.values(dto).some((value) => value !== undefined);
    if (!hasFields && files.length === 0) {
      throw new BadRequestException('Provide at least one product update');
    }

    const newImages = await this.imageStorage.save(files);
    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.sku !== undefined) product.sku = dto.sku.trim().toUpperCase();
    if (dto.category !== undefined) product.category = dto.category.trim();
    if (dto.description !== undefined) {
      product.description = dto.description.trim();
    }
    if (dto.sellingPrice !== undefined) product.sellingPrice = dto.sellingPrice;
    if (dto.costPrice !== undefined) product.costPrice = dto.costPrice;
    if (dto.commissionPercent !== undefined) {
      product.commissionPercent = dto.commissionPercent;
    }
    if (dto.isActive !== undefined) product.isActive = dto.isActive;
    if (newImages.length > 0) product.images.push(...newImages);
    product.profitPerUnit = this.calculateProfit(
      product.sellingPrice,
      product.costPrice,
    );

    try {
      return await product.save();
    } catch (error) {
      await this.imageStorage.remove(newImages);
      this.throwForDuplicateSku(error);
      throw error;
    }
  }

  async removeImage(id: string, imageId: string): Promise<ProductDocument> {
    const product = await this.findOne(id);
    const image = product.images.find(
      (productImage) => productImage.id === imageId,
    );
    if (!image) throw new NotFoundException('Product image not found');

    product.images = product.images.filter(
      (productImage) => productImage.id !== imageId,
    );
    const updatedProduct = await product.save();
    await this.imageStorage.remove([image]);
    return updatedProduct;
  }

  private calculateProfit(sellingPrice: number, costPrice: number): number {
    return Math.round((sellingPrice - costPrice + Number.EPSILON) * 100) / 100;
  }

  private validateId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid product id');
    }
  }

  private throwForDuplicateSku(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException('A product with this SKU already exists');
    }
  }
}

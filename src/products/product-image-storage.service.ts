import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { ProductImage } from './product.schema.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_DIRECTORY = resolve(process.cwd(), 'uploads', 'products');

type ImageFormat = {
  extension: 'jpg' | 'png' | 'webp';
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
};

export interface ProductImageUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class ProductImageStorageService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async save(files: ProductImageUpload[]): Promise<ProductImage[]> {
    if (files.length === 0) return [];

    const validated = files.map((file) => ({
      file,
      format: this.getImageFormat(file),
    }));
    const saved: ProductImage[] = [];
    try {
      for (const { file, format } of validated) {
        const uploaded = await this.cloudinary.upload(
          file.buffer,
          {
            folder: 'products',
            public_id: randomUUID(),
            resource_type: 'image',
            type: 'upload',
            overwrite: false,
            unique_filename: false,
          },
          'Could not upload product images to Cloudinary',
        );
        saved.push({
          filename: uploaded.public_id,
          url: uploaded.secure_url,
          contentType: format.contentType,
        } as ProductImage);
      }
      return saved;
    } catch (error) {
      await this.remove(saved);
      throw new InternalServerErrorException('Could not save product images', {
        cause: error,
      });
    }
  }

  async remove(images: ProductImage[]): Promise<void> {
    const results = await Promise.allSettled(
      images.map(async (image) => {
        if (image.filename.includes('/')) {
          await this.cloudinary.remove(
            image.filename,
            'upload',
            'Could not remove product image from Cloudinary',
          );
          return;
        }
        try {
          await unlink(join(PRODUCT_IMAGE_DIRECTORY, image.filename));
        } catch (error) {
          if (
            typeof error !== 'object' ||
            error === null ||
            !('code' in error) ||
            error.code !== 'ENOENT'
          ) {
            throw error;
          }
        }
      }),
    );
    const failures = results.filter(
      (result) =>
        result.status === 'rejected' &&
        !(
          typeof result.reason === 'object' &&
          result.reason !== null &&
          'code' in result.reason &&
          result.reason.code === 'ENOENT'
        ),
    );
    if (failures.length > 0) {
      throw new InternalServerErrorException(
        'Could not remove one or more product images',
      );
    }
  }

  private getImageFormat(file: ProductImageUpload): ImageFormat {
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Each image must be 5 MB or smaller');
    }

    const bytes = file.buffer;
    let format: ImageFormat | undefined;

    if (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      format = { extension: 'png', contentType: 'image/png' };
    } else if (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      format = { extension: 'jpg', contentType: 'image/jpeg' };
    } else if (
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    ) {
      format = { extension: 'webp', contentType: 'image/webp' };
    }

    if (!format || file.mimetype !== format.contentType) {
      throw new BadRequestException(
        'Images must be valid JPEG, PNG, or WebP files',
      );
    }

    return format;
  }
}

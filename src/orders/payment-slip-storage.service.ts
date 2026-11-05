import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PaymentSlip } from './order.schema.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PAYMENT_SLIP_DIRECTORY = resolve(
  process.cwd(),
  'uploads',
  'payment-slips',
);

export interface PaymentSlipUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class PaymentSlipStorageService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async save(file: PaymentSlipUpload): Promise<PaymentSlip> {
    const contentType = this.getContentType(file);
    const uploaded = await this.cloudinary.upload(
      file.buffer,
      {
        folder: 'payment-slips',
        public_id: randomUUID(),
        resource_type: 'image',
        type: 'authenticated',
        access_mode: 'authenticated',
        overwrite: false,
        unique_filename: false,
      },
      'Could not upload the payment slip to Cloudinary',
    );
    return {
      filename: uploaded.public_id,
      contentType,
      uploadedAt: new Date(),
    };
  }

  async read(
    filename: string,
    contentType: PaymentSlip['contentType'],
  ): Promise<Buffer> {
    if (filename.includes('/')) {
      return this.cloudinary.readPrivateImage(filename, contentType);
    }
    try {
      return await readFile(join(PAYMENT_SLIP_DIRECTORY, filename));
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new NotFoundException('Payment slip file not found');
      }
      throw new InternalServerErrorException(
        'Could not read the payment slip',
        { cause: error },
      );
    }
  }

  async remove(filename: string): Promise<void> {
    if (filename.includes('/')) {
      await this.cloudinary.remove(
        filename,
        'authenticated',
        'Could not remove the previous payment slip from Cloudinary',
      );
      return;
    }
    try {
      await unlink(join(PAYMENT_SLIP_DIRECTORY, filename));
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw new InternalServerErrorException(
        'Could not remove the previous payment slip',
        { cause: error },
      );
    }
  }

  private getContentType(file: PaymentSlipUpload): PaymentSlip['contentType'] {
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Payment slips must be 5 MB or smaller');
    }

    const bytes = file.buffer;
    let contentType: PaymentSlip['contentType'] | undefined;
    if (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      contentType = 'image/png';
    } else if (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      contentType = 'image/jpeg';
    } else if (
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    ) {
      contentType = 'image/webp';
    }

    if (!contentType || file.mimetype !== contentType) {
      throw new BadRequestException(
        'Payment slips must be valid JPEG, PNG, or WebP images',
      );
    }
    return contentType;
  }
}

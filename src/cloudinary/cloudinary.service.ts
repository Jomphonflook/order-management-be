import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { Readable } from 'node:stream';

@Injectable()
export class CloudinaryService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  async upload(
    buffer: Buffer,
    options: UploadApiOptions,
    errorMessage: string,
  ): Promise<UploadApiResponse> {
    try {
      return await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          options,
          (error, result) => {
            if (error) {
              reject(error);
            } else if (result) {
              resolve(result);
            } else {
              reject(new Error('Cloudinary returned no upload result'));
            }
          },
        );
        Readable.from(buffer).pipe(stream);
      });
    } catch (error) {
      throw new InternalServerErrorException(errorMessage, { cause: error });
    }
  }

  async remove(
    publicId: string,
    type: 'upload' | 'authenticated',
    errorMessage: string,
  ): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        type,
        invalidate: true,
      });
      if (result.result === 'error') {
        throw new Error('Cloudinary could not delete the image');
      }
    } catch (error) {
      throw new InternalServerErrorException(errorMessage, { cause: error });
    }
  }

  async readPrivateImage(
    publicId: string,
    contentType: string,
  ): Promise<Buffer> {
    try {
      const format =
        contentType === 'image/png'
          ? 'png'
          : contentType === 'image/webp'
            ? 'webp'
            : 'jpg';
      const url = cloudinary.utils.private_download_url(publicId, format, {
        resource_type: 'image',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 60,
      });
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Cloudinary download failed with ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new InternalServerErrorException(
        'Could not read the payment slip from Cloudinary',
        { cause: error },
      );
    }
  }
}

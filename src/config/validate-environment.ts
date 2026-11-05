import { Logger } from '@nestjs/common';

const logger = new Logger('Configuration');

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const required = [
    'DB_URL',
    'JWT_SECRET',
    'FRONTEND_ORIGINS',
    'OWNER_EMAIL',
    'OWNER_PASSWORD',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];

  for (const key of required) {
    if (typeof config[key] !== 'string' || !config[key]?.trim()) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  if (!/^mongodb(?:\+srv)?:\/\//.test(config.DB_URL as string)) {
    throw new Error('DB_URL must be a MongoDB connection string');
  }

  if ((config.JWT_SECRET as string).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  if ((config.OWNER_PASSWORD as string).length < 12) {
    throw new Error('OWNER_PASSWORD must be at least 12 characters long');
  }
  if (Buffer.byteLength(config.OWNER_PASSWORD as string, 'utf8') > 72) {
    throw new Error('OWNER_PASSWORD must be at most 72 bytes');
  }

  const origins = (config.FRONTEND_ORIGINS as string)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('FRONTEND_ORIGINS must contain at least one origin');
  }

  for (const origin of origins) {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(`Invalid frontend origin: ${origin}`);
    }
    if (
      parsedOrigin.origin !== origin ||
      (parsedOrigin.protocol !== 'https:' &&
        parsedOrigin.hostname !== 'localhost' &&
        parsedOrigin.hostname !== '127.0.0.1')
    ) {
      throw new Error(`FRONTEND_ORIGINS must contain valid origins: ${origin}`);
    }
  }

  if (
    typeof config.OWNER_EMAIL !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.OWNER_EMAIL)
  ) {
    throw new Error('OWNER_EMAIL must be a valid email address');
  }

  logger.log('Environment configuration validated');
  return config;
}

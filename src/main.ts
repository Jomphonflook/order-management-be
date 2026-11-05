// import cookieParser from 'cookie-parser';
// import { ValidationPipe } from '@nestjs/common';
// import { NestFactory } from '@nestjs/core';
// import express from 'express';
// import { resolve } from 'node:path';
// import { AppModule } from './app.module.js';


// import * as dns from 'node:dns';

// // กำหนด DNS ก่อนเริ่มเชื่อมต่อ MongoDB
// // dns.setServers([
// //   '8.8.8.8',
// //   '8.8.4.4'
// // ]);

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.use(cookieParser());
//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//     }),
//   );
//   const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? '')
//     .split(',')
//     .map((origin) => origin.trim())
//     .filter(Boolean);
//   app.use((request, response, next) => {
//     const origin = request.get('origin');
//     if (origin && !allowedOrigins.includes(origin)) {
//       response
//         .status(403)
//         .json({ statusCode: 403, message: 'Origin not allowed' });
//       return;
//     }
//     next();
//   });
//   app.enableCors({
//     origin: (origin, callback) => {
//       callback(null, !origin || allowedOrigins.includes(origin));
//     },
//     credentials: true,
//   });
//   app.use(
//     '/uploads/products',
//     express.static(resolve(process.cwd(), 'uploads', 'products'), {
//       dotfiles: 'deny',
//       index: false,
//       maxAge: '1d',
//     }),
//   );
//   await app.listen(process.env.PORT ?? 3000);
// }
// await bootstrap();

import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {

  @Get()
  healthCheck() {
    return {
      status: 'OK',
      message: 'Order Management API is running',
      timestamp: new Date().toISOString(),
    };
  }
}

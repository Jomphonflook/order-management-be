import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';
import {
  CreateOrderDto,
  ListOrdersQueryDto,
  UpdateOrderDto,
} from './dto/create-order.dto.js';
import { OrderDocument } from './order.schema.js';
import { OrderListResult, OrdersService } from './orders.service.js';
import type { PaymentSlipUpload } from './payment-slip-storage.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('commission-summary')
  getCommissionSummary(@Req() request: AuthenticatedRequest) {
    return this.ordersService.getCommissionSummary(request.user.id);
  }

  @Get('dashboard')
  getDashboard(@Query() query: DashboardQueryDto) {
    return this.ordersService.getDashboard(query);
  }

  @Post()
  create(
    @Body() dto: CreateOrderDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDocument> {
    return this.ordersService.create(dto, request.user);
  }

  @Get()
  findAll(@Query() query: ListOrdersQueryDto): Promise<OrderListResult> {
    return this.ordersService.findAll(query);
  }

  @Post(':id/payment-slip')
  @UseInterceptors(
    FileInterceptor('slip', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        ) {
          callback(
            new BadRequestException(
              'Payment slips must be JPEG, PNG, or WebP images',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadPaymentSlip(
    @Param('id') id: string,
    @UploadedFile() file: PaymentSlipUpload | undefined,
  ): Promise<OrderDocument> {
    if (!file) throw new BadRequestException('Payment slip file is required');
    return this.ordersService.uploadPaymentSlip(id, file);
  }

  @Get(':id/payment-slip')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async getPaymentSlip(@Param('id') id: string): Promise<StreamableFile> {
    const { slip, buffer } = await this.ordersService.readPaymentSlip(id);
    return new StreamableFile(buffer, {
      type: slip.contentType,
      disposition: 'inline',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OrderDocument> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<OrderDocument> {
    return this.ordersService.update(id, dto);
  }
}

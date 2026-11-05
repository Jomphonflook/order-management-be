import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Product } from '../products/product.schema.js';
import { UserRole } from '../users/user.schema.js';
import { SafeUser } from '../users/users.service.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';
import {
  CreateOrderDto,
  ListOrdersQueryDto,
  UpdateOrderDto,
} from './dto/create-order.dto.js';
import {
  CommissionStatus,
  Order,
  OrderDocument,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentSlip,
  PaymentStatus,
  ShippingStatus,
} from './order.schema.js';
import {
  PaymentSlipStorageService,
  PaymentSlipUpload,
} from './payment-slip-storage.service.js';

export interface OrderListResult {
  items: OrderDocument[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface DashboardData {
  summary: {
    totalOrders: number;
    pendingOrders: number;
    unpaidOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    returnedOrders: number;
    salesCents: number;
    receivedCents: number;
    paidCommissionCents: number;
    productCostCents: number;
    shippingCostCents: number;
    otherExpensesCents: number;
    grossProfitCents: number;
    netProfitCents: number;
  };
  dailySales: Array<{ date: string; salesCents: number }>;
  salesByAdmin: Array<{
    adminId: string;
    adminName: string;
    orders: number;
    salesCents: number;
    commissionCents: number;
    paidCommissionCents: number;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    salesCents: number;
  }>;
  recentOrders: OrderDocument[];
  range: { from: string; to: string };
  page: number;
  limit: number;
  pages: number;
}

type DashboardSummaryRow = DashboardData['summary'];
type DashboardAdminRow = DashboardData['salesByAdmin'][number];
type DashboardProductRow = DashboardData['topProducts'][number];
type DashboardDailyRow = DashboardData['dailySales'][number];

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly paymentSlipStorage: PaymentSlipStorageService,
  ) {}

  async create(dto: CreateOrderDto, user: SafeUser): Promise<OrderDocument> {
    const items = await this.createItemSnapshots(dto.items);
    const financials = this.calculateFinancials(
      items,
      dto.discount,
      dto.shippingCharge,
      dto.shippingCost ?? 0,
      dto.otherExpenses,
    );

    return this.orderModel.create({
      orderNumber: this.createOrderNumber(),
      customer: this.normalizeCustomer(dto.customer),
      items,
      ...financials,
      orderStatus: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: dto.paymentMethod,
      amountPaidCents: 0,
      paymentNote: dto.paymentNote?.trim() ?? '',
      shippingStatus: ShippingStatus.NOT_SHIPPED,
      shippingCompany: '',
      trackingNumber: '',
      createdBy: new Types.ObjectId(user.id),
      createdByName: user.name,
      createdByEmail: user.email,
      commissionStatus: CommissionStatus.PENDING,
    });
  }

  async findAll(query: ListOrdersQueryDto): Promise<OrderListResult> {
    const filter: Record<string, unknown> = {};
    if (query.orderStatus) filter.orderStatus = query.orderStatus;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(escaped, 'i');
      filter.$or = [
        { orderNumber: expression },
        { 'customer.name': expression },
        { 'customer.phone': expression },
        { 'customer.facebookName': expression },
        { createdByName: expression },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getCommissionSummary(
    userId: string,
    role: UserRole,
  ): Promise<{
    totalCents: number;
    pendingCents: number;
    paidCents: number;
  }> {
    if (role !== UserRole.ADMIN) {
      return { totalCents: 0, pendingCents: 0, paidCents: 0 };
    }

    const records = await this.orderModel
      .find({
        createdBy: new Types.ObjectId(userId),
        orderStatus: { $nin: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
        paymentStatus: PaymentStatus.PAID,
      })
      .select('commissionCents commissionStatus')
      .lean()
      .exec();
    const summary = records.reduce(
      (totals, order) => {
        if (order.commissionStatus === CommissionStatus.PAID) {
          totals.paidCents += order.commissionCents;
        } else {
          totals.pendingCents += order.commissionCents;
        }
        return totals;
      },
      { pendingCents: 0, paidCents: 0 },
    );
    return {
      ...summary,
      totalCents: summary.paidCents,
    };
  }

  async getDashboard(query: DashboardQueryDto): Promise<DashboardData> {
    const { filter, from, to } = this.createDashboardFilter(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDirection = query.sortOrder === 'asc' ? 1 : -1;
    const dateFormat =
      query.interval === 'year'
        ? '%Y'
        : query.interval === 'month'
          ? '%Y-%m'
          : '%Y-%m-%d';
    const eligibleSales = {
      $and: [
        {
          $not: [
            {
              $in: [
                '$orderStatus',
                [OrderStatus.CANCELLED, OrderStatus.RETURNED],
              ],
            },
          ],
        },
        { $ne: ['$paymentStatus', PaymentStatus.REFUNDED] },
        {
          $or: [
            { $eq: ['$paymentMethod', PaymentMethod.COD] },
            { $eq: ['$paymentStatus', PaymentStatus.PAID] },
          ],
        },
      ],
    };
    const eligibleStage = { $match: { $expr: eligibleSales } };
    const [summaryRows, dailySales, salesByAdmin, topProducts, recentOrders] =
      await Promise.all([
        this.orderModel
          .aggregate<DashboardSummaryRow>([
            { $match: filter },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                pendingOrders: {
                  $sum: {
                    $cond: [
                      { $eq: ['$orderStatus', OrderStatus.PENDING] },
                      1,
                      0,
                    ],
                  },
                },
                unpaidOrders: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          '$paymentStatus',
                          [
                            PaymentStatus.UNPAID,
                            PaymentStatus.PENDING_VERIFICATION,
                          ],
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                completedOrders: {
                  $sum: {
                    $cond: [
                      { $eq: ['$orderStatus', OrderStatus.DELIVERED] },
                      1,
                      0,
                    ],
                  },
                },
                cancelledOrders: {
                  $sum: {
                    $cond: [
                      { $eq: ['$orderStatus', OrderStatus.CANCELLED] },
                      1,
                      0,
                    ],
                  },
                },
                returnedOrders: {
                  $sum: {
                    $cond: [
                      { $eq: ['$orderStatus', OrderStatus.RETURNED] },
                      1,
                      0,
                    ],
                  },
                },
                salesCents: {
                  $sum: { $cond: [eligibleSales, '$totalCents', 0] },
                },
                receivedCents: {
                  $sum: {
                    $cond: [
                      { $ne: ['$paymentStatus', PaymentStatus.REFUNDED] },
                      '$amountPaidCents',
                      0,
                    ],
                  },
                },
                paidCommissionCents: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          eligibleSales,
                          { $eq: ['$commissionStatus', CommissionStatus.PAID] },
                        ],
                      },
                      '$commissionCents',
                      0,
                    ],
                  },
                },
                productCostCents: {
                  $sum: { $cond: [eligibleSales, '$productCostCents', 0] },
                },
                shippingCostCents: {
                  $sum: { $cond: [eligibleSales, '$shippingCostCents', 0] },
                },
                otherExpensesCents: {
                  $sum: { $cond: [eligibleSales, '$otherExpensesCents', 0] },
                },
                grossProfitCents: {
                  $sum: { $cond: [eligibleSales, '$grossProfitCents', 0] },
                },
                netProfitCents: {
                  $sum: { $cond: [eligibleSales, '$netProfitCents', 0] },
                },
              },
            },
            { $project: { _id: 0 } },
          ])
          .exec(),
        this.orderModel
          .aggregate<DashboardDailyRow>([
            { $match: filter },
            eligibleStage,
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: dateFormat,
                    date: '$createdAt',
                    timezone: 'Asia/Bangkok',
                  },
                },
                salesCents: { $sum: '$totalCents' },
              },
            },
            { $project: { _id: 0, date: '$_id', salesCents: 1 } },
            { $sort: { date: 1 } },
          ])
          .exec(),
        this.orderModel
          .aggregate<DashboardAdminRow>([
            { $match: filter },
            eligibleStage,
            {
              $group: {
                _id: '$createdBy',
                adminName: { $first: '$createdByName' },
                orders: { $sum: 1 },
                salesCents: { $sum: '$totalCents' },
                commissionCents: { $sum: '$commissionCents' },
                paidCommissionCents: {
                  $sum: {
                    $cond: [
                      { $eq: ['$commissionStatus', CommissionStatus.PAID] },
                      '$commissionCents',
                      0,
                    ],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                adminId: { $toString: '$_id' },
                adminName: 1,
                orders: 1,
                salesCents: 1,
                commissionCents: 1,
                paidCommissionCents: 1,
              },
            },
            { $sort: { salesCents: -1 } },
          ])
          .exec(),
        this.orderModel
          .aggregate<DashboardProductRow>([
            { $match: filter },
            eligibleStage,
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.productId',
                name: { $first: '$items.name' },
                sku: { $first: '$items.sku' },
                quantity: { $sum: '$items.quantity' },
                salesCents: { $sum: '$items.subtotalCents' },
              },
            },
            {
              $project: {
                _id: 0,
                productId: { $toString: '$_id' },
                name: 1,
                sku: 1,
                quantity: 1,
                salesCents: 1,
              },
            },
            { $sort: { quantity: -1, salesCents: -1 } },
            { $limit: 5 },
          ])
          .exec(),
        this.orderModel
          .find(filter)
          .sort({ [sortBy]: sortDirection })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
      ]);

    const totalOrders = summaryRows[0]?.totalOrders ?? 0;
    return {
      summary: summaryRows[0] ?? this.emptyDashboardSummary(),
      dailySales,
      salesByAdmin,
      topProducts,
      recentOrders,
      range: { from, to },
      page,
      limit,
      pages: Math.ceil(totalOrders / limit),
    };
  }

  async uploadPaymentSlip(
    id: string,
    file: PaymentSlipUpload,
  ): Promise<OrderDocument> {
    const order = await this.findOne(id);
    const previousSlip = order.paymentSlip;
    const newSlip = await this.paymentSlipStorage.save(file);
    order.paymentSlip = newSlip;
    try {
      await order.save();
    } catch (error) {
      await this.paymentSlipStorage.remove(newSlip.filename);
      throw error;
    }
    if (previousSlip) {
      await this.paymentSlipStorage.remove(previousSlip.filename);
    }
    return order;
  }

  async readPaymentSlip(
    id: string,
  ): Promise<{ slip: PaymentSlip; buffer: Buffer }> {
    const order = await this.findOne(id);
    if (!order.paymentSlip) {
      throw new NotFoundException('Payment slip not found');
    }
    return {
      slip: order.paymentSlip,
      buffer: await this.paymentSlipStorage.read(
        order.paymentSlip.filename,
        order.paymentSlip.contentType,
      ),
    };
  }

  async findOne(id: string): Promise<OrderDocument> {
    this.validateId(id);
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderDocument> {
    const order = await this.findOne(id);
    const hasFields = Object.values(dto).some((value) => value !== undefined);
    if (!hasFields)
      throw new BadRequestException('Provide at least one order update');

    const items = dto.items
      ? await this.createItemSnapshots(dto.items, order.items)
      : order.items;
    const discount = dto.discount ?? order.discountCents / 100;
    const shippingCharge =
      dto.shippingCharge ?? order.shippingChargeCents / 100;
    const shippingCost =
      dto.shippingCost ?? (order.shippingCostCents ?? 0) / 100;
    const otherExpenses = dto.otherExpenses ?? order.otherExpensesCents / 100;
    if (dto.customer) order.customer = this.normalizeCustomer(dto.customer);
    if (dto.items) order.items = items;
    if (dto.discount !== undefined)
      order.discountCents = this.toCents(dto.discount);
    if (dto.shippingCharge !== undefined) {
      order.shippingChargeCents = this.toCents(dto.shippingCharge);
    }
    if (dto.shippingCost !== undefined) {
      order.shippingCostCents = this.toCents(dto.shippingCost);
    }
    if (dto.otherExpenses !== undefined) {
      order.otherExpensesCents = this.toCents(dto.otherExpenses);
    }
    if (dto.paymentMethod !== undefined)
      order.paymentMethod = dto.paymentMethod;
    if (dto.orderStatus !== undefined) order.orderStatus = dto.orderStatus;
    const markingPaid =
      dto.paymentStatus === PaymentStatus.PAID &&
      order.paymentStatus !== PaymentStatus.PAID;
    if (dto.paymentStatus !== undefined) {
      const wasPaid = order.paymentStatus === PaymentStatus.PAID;
      order.paymentStatus = dto.paymentStatus;
      if (dto.paymentStatus === PaymentStatus.PAID && !wasPaid) {
        order.paidAt = new Date();
      } else if (
        dto.paymentStatus === PaymentStatus.UNPAID ||
        dto.paymentStatus === PaymentStatus.PENDING_VERIFICATION
      ) {
        order.paidAt = undefined;
      }
    }
    if (dto.amountPaid !== undefined) {
      order.amountPaidCents = this.toCents(dto.amountPaid);
    }
    if (dto.paymentNote !== undefined)
      order.paymentNote = dto.paymentNote.trim();
    if (dto.shippingStatus !== undefined) {
      order.shippingStatus = dto.shippingStatus;
      if (dto.shippingStatus === ShippingStatus.SHIPPED && !order.shippedAt) {
        order.shippedAt = new Date();
      }
    }
    if (dto.shippingCompany !== undefined) {
      order.shippingCompany = dto.shippingCompany.trim();
    }
    if (dto.trackingNumber !== undefined) {
      order.trackingNumber = dto.trackingNumber.trim();
    }
    if (dto.commissionStatus !== undefined) {
      const wasCommissionPaid =
        order.commissionStatus === CommissionStatus.PAID;
      order.commissionStatus = dto.commissionStatus;
      if (
        dto.commissionStatus === CommissionStatus.PAID &&
        !wasCommissionPaid
      ) {
        order.commissionPaidAt = new Date();
      } else if (dto.commissionStatus !== CommissionStatus.PAID) {
        order.commissionPaidAt = undefined;
      }
    }

    const financials = this.calculateFinancials(
      items,
      discount,
      shippingCharge,
      shippingCost,
      otherExpenses,
    );
    if (order.amountPaidCents > financials.totalCents) {
      throw new BadRequestException(
        'Amount paid cannot exceed the order total',
      );
    }
    if (
      order.paymentStatus === PaymentStatus.UNPAID &&
      order.amountPaidCents !== 0
    ) {
      throw new BadRequestException(
        'An unpaid order cannot have an amount paid',
      );
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      if (
        markingPaid &&
        dto.amountPaid === undefined &&
        order.amountPaidCents === 0
      ) {
        order.amountPaidCents = financials.totalCents;
      } else if (order.amountPaidCents !== financials.totalCents) {
        throw new BadRequestException(
          'A paid order must have an amount paid equal to its total',
        );
      }
    }
    Object.assign(order, financials);
    return order.save();
  }

  private async createItemSnapshots(
    requestedItems: CreateOrderDto['items'],
    existingItems: OrderItem[] = [],
  ): Promise<OrderItem[]> {
    const productIds = requestedItems.map((item) => item.productId);
    const products = await this.productModel
      .find({ _id: { $in: productIds } })
      .exec();
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const existingById = new Map(
      existingItems.map((item) => [item.productId.toString(), item]),
    );
    return requestedItems.map((requested) => {
      const existing = existingById.get(requested.productId);
      if (existing) {
        return this.resizeItemSnapshot(existing, requested.quantity);
      }
      const product = productsById.get(requested.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException(
          `Product ${requested.productId} was not found or is inactive`,
        );
      }
      const sellingPriceCents = this.toCents(product.sellingPrice);
      const costPriceCents = this.toCents(product.costPrice);
      const subtotalCents = sellingPriceCents * requested.quantity;
      const costTotalCents = costPriceCents * requested.quantity;
      this.assertSafeCents(subtotalCents);
      this.assertSafeCents(costTotalCents);
      const commissionBasisPoints = Math.round(product.commissionPercent * 100);
      const commissionCents = Number(
        (BigInt(subtotalCents) * BigInt(commissionBasisPoints) + 5000n) /
          10000n,
      );
      this.assertSafeCents(commissionCents);
      return {
        productId: product._id,
        name: product.name,
        sku: product.sku,
        sellingPriceCents,
        costPriceCents,
        commissionPercent: product.commissionPercent,
        quantity: requested.quantity,
        subtotalCents,
        costTotalCents,
        commissionCents,
      } as OrderItem;
    });
  }

  private resizeItemSnapshot(item: OrderItem, quantity: number): OrderItem {
    const subtotalCents = item.sellingPriceCents * quantity;
    const costTotalCents = item.costPriceCents * quantity;
    const commissionBasisPoints = Math.round(item.commissionPercent * 100);
    const commissionCents = Number(
      (BigInt(subtotalCents) * BigInt(commissionBasisPoints) + 5000n) / 10000n,
    );
    for (const amount of [subtotalCents, costTotalCents, commissionCents]) {
      this.assertSafeCents(amount);
    }
    return {
      ...item,
      quantity,
      subtotalCents,
      costTotalCents,
      commissionCents,
    } as OrderItem;
  }

  private createDashboardFilter(query: DashboardQueryDto): {
    filter: Record<string, unknown>;
    from: string;
    to: string;
  } {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const from = query.from ?? `${today.slice(0, 7)}-01`;
    const to = query.to ?? today;
    if (from > to) {
      throw new BadRequestException(
        'The start date must be on or before the end date',
      );
    }

    const start = this.bangkokDateStart(from);
    const end = new Date(
      this.bangkokDateStart(to).getTime() + 24 * 60 * 60 * 1000,
    );
    const filter: Record<string, unknown> = {
      createdAt: { $gte: start, $lt: end },
    };
    if (query.orderStatus) filter.orderStatus = query.orderStatus;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(escaped, 'i');
      filter.$or = [
        { orderNumber: expression },
        { 'customer.name': expression },
        { 'customer.phone': expression },
        { 'customer.facebookName': expression },
        { createdByName: expression },
      ];
    }
    return { filter, from, to };
  }

  private bangkokDateStart(date: string): Date {
    const parsed = new Date(`${date}T00:00:00+07:00`);
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
    if (!Number.isFinite(parsed.getTime()) || formatted !== date) {
      throw new BadRequestException('Date must be a valid calendar date');
    }
    return parsed;
  }

  private emptyDashboardSummary(): DashboardData['summary'] {
    return {
      totalOrders: 0,
      pendingOrders: 0,
      unpaidOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      returnedOrders: 0,
      salesCents: 0,
      receivedCents: 0,
      paidCommissionCents: 0,
      productCostCents: 0,
      shippingCostCents: 0,
      otherExpensesCents: 0,
      grossProfitCents: 0,
      netProfitCents: 0,
    };
  }

  private calculateFinancials(
    items: OrderItem[],
    discount: number,
    shippingCharge: number,
    shippingCost: number,
    otherExpenses: number,
  ) {
    const subtotalCents = items.reduce(
      (sum, item) => sum + item.subtotalCents,
      0,
    );
    const discountCents = this.toCents(discount);
    const shippingChargeCents = this.toCents(shippingCharge);
    const shippingCostCents = this.toCents(shippingCost);
    const otherExpensesCents = this.toCents(otherExpenses);
    if (discountCents > subtotalCents) {
      throw new BadRequestException(
        'Discount cannot exceed the order subtotal',
      );
    }
    const productCostCents = items.reduce(
      (sum, item) => sum + item.costTotalCents,
      0,
    );
    const commissionCents = items.reduce(
      (sum, item) => sum + item.commissionCents,
      0,
    );
    const totalCents = subtotalCents - discountCents + shippingChargeCents;
    const grossProfitCents = subtotalCents - productCostCents;
    const netProfitCents =
      grossProfitCents -
      commissionCents -
      shippingCostCents -
      otherExpensesCents;
    for (const amount of [
      subtotalCents,
      discountCents,
      shippingChargeCents,
      shippingCostCents,
      otherExpensesCents,
      productCostCents,
      commissionCents,
      totalCents,
      grossProfitCents,
      netProfitCents,
    ]) {
      this.assertSafeCents(amount);
    }

    return {
      subtotalCents,
      discountCents,
      shippingChargeCents,
      shippingCostCents,
      totalCents,
      productCostCents,
      grossProfitCents,
      commissionCents,
      otherExpensesCents,
      netProfitCents,
    };
  }

  private normalizeCustomer(customer: CreateOrderDto['customer']) {
    return {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      facebookName: customer.facebookName?.trim() ?? '',
      address: {
        addressLine: customer.address.addressLine.trim(),
        subdistrict: customer.address.subdistrict.trim(),
        district: customer.address.district.trim(),
        province: customer.address.province.trim(),
        postalCode: customer.address.postalCode.trim(),
      },
    };
  }

  private toCents(amount: number): number {
    const cents = Math.round((amount + Number.EPSILON) * 100);
    this.assertSafeCents(cents);
    return cents;
  }

  private assertSafeCents(amount: number): void {
    if (!Number.isSafeInteger(amount)) {
      throw new BadRequestException('Money amount is too large');
    }
  }

  private createOrderNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `ORD-${date}-${randomUUID().replace(/-/g, '').toUpperCase()}`;
  }

  private validateId(id: string): void {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid order id');
  }
}

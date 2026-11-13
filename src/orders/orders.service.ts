import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Product } from '../products/product.schema.js';
import { User, UserRole } from '../users/user.schema.js';
import { SafeUser } from '../users/users.service.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';
import {
  BulkUpdateOrderStatusDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  UpdateOrderDto,
} from './dto/create-order.dto.js';
import {
  CommissionStatus,
  Order,
  OrderCounter,
  OrderDocument,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentSlip,
  PaymentStatus,
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
    awaitingShipmentOrders: number;
    inTransitOrders: number;
    unpaidOrders: number;
    completedOrders: number;
    returnedOrders: number;
    exchangedOrders: number;
    salesCents: number;
    receivedCents: number;
    paidCommissionCents: number;
    commissionTotalCents: number;
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
    dueCommissionCents: number;
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
export class OrdersService implements OnModuleInit {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(OrderCounter.name)
    private readonly orderCounterModel: Model<OrderCounter>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly paymentSlipStorage: PaymentSlipStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.migrateLegacyOrders();
  }

  private async migrateLegacyOrders(): Promise<void> {
    const currentOrderNumber = /^\d{6}-\d{4,}$/;
    const legacyStatuses: OrderStatus[] = [
      'pending' as OrderStatus,
      'confirmed' as OrderStatus,
      'processing' as OrderStatus,
      'shipped' as OrderStatus,
      'delivered' as OrderStatus,
      'cancelled' as OrderStatus,
    ];
    const hasLegacyOrders = await this.orderModel.exists({
      $or: [
        { orderStatus: { $in: legacyStatuses } },
        { orderNumber: { $not: currentOrderNumber } },
        { shippingStatus: { $exists: true } },
        { orderDate: { $exists: false } },
        { createdByRole: { $exists: false } },
      ],
    });
    if (!hasLegacyOrders) return;

    const statusMappings: Array<[OrderStatus, OrderStatus]> = [
      ['pending' as OrderStatus, OrderStatus.AWAITING_SHIPMENT],
      ['confirmed' as OrderStatus, OrderStatus.AWAITING_SHIPMENT],
      ['processing' as OrderStatus, OrderStatus.AWAITING_SHIPMENT],
      ['shipped' as OrderStatus, OrderStatus.IN_TRANSIT],
      ['delivered' as OrderStatus, OrderStatus.COMPLETED],
      ['cancelled' as OrderStatus, OrderStatus.RETURNED],
    ];
    for (const [legacyStatus, currentStatus] of statusMappings) {
      await this.orderModel
        .updateMany(
          { orderStatus: legacyStatus },
          { $set: { orderStatus: currentStatus } },
          { timestamps: false },
        )
        .exec();
    }

    await this.orderModel
      .updateMany(
        { shippingStatus: { $exists: true } },
        { $unset: { shippingStatus: 1 } },
        { timestamps: false },
      )
      .exec();

    const ordersWithoutOrderDate = await this.orderModel
      .find({ orderDate: { $exists: false } })
      .select('_id createdAt')
      .lean()
      .exec();
    for (const order of ordersWithoutOrderDate) {
      await this.orderModel
        .updateOne(
          { _id: order._id, orderDate: { $exists: false } },
          { $set: { orderDate: order.createdAt } },
          { timestamps: false },
        )
        .exec();
    }

    const ordersToRenumber = await this.orderModel
      .find({ orderNumber: { $not: currentOrderNumber } })
      .select('_id orderNumber createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();
    for (const order of ordersToRenumber) {
      const number = await this.nextOrderNumberForPeriod(
        this.orderPeriod(order.createdAt),
      );
      await this.orderModel
        .updateOne(
          { _id: order._id, orderNumber: order.orderNumber },
          { $set: { orderNumber: number } },
          { timestamps: false },
        )
        .exec();
    }

    await this.migrateCreatorRolesAndOwnerCommissions();
  }

  private async migrateCreatorRolesAndOwnerCommissions(): Promise<void> {
    const users = await this.userModel.find().select('_id role').lean().exec();
    const ownerIds = users
      .filter((user) => user.role === UserRole.OWNER)
      .map((user) => user._id);
    const adminIds = users
      .filter((user) => user.role === UserRole.ADMIN)
      .map((user) => user._id);

    if (ownerIds.length > 0) {
      await this.orderModel
        .updateMany(
          {
            createdBy: { $in: ownerIds },
            createdByRole: { $exists: false },
          },
          [
            {
              $set: {
                createdByRole: UserRole.OWNER,
                items: {
                  $map: {
                    input: '$items',
                    as: 'item',
                    in: {
                      $mergeObjects: [
                        '$$item',
                        { commissionCents: 0 },
                      ],
                    },
                  },
                },
                netProfitCents: {
                  $add: ['$netProfitCents', '$commissionCents'],
                },
                commissionCents: 0,
              },
            },
          ],
          { timestamps: false, updatePipeline: true },
        )
        .exec();
    }

    if (adminIds.length > 0) {
      await this.orderModel
        .updateMany(
          {
            createdBy: { $in: adminIds },
            createdByRole: { $exists: false },
          },
          { $set: { createdByRole: UserRole.ADMIN } },
          { timestamps: false },
        )
        .exec();
    }
  }

  async create(dto: CreateOrderDto, user: SafeUser): Promise<OrderDocument> {
    const items = this.withCommission(
      await this.createItemSnapshots(dto.items),
      user.role === UserRole.ADMIN,
    );
    const createdAt = new Date();
    const financials = this.calculateFinancials(
      items,
      dto.discount,
      0,
      dto.shippingCost ?? 0,
      0,
    );
    const orderNumber = await this.nextOrderNumberForPeriod(
      this.orderPeriod(createdAt),
    );

    return this.orderModel.create({
      orderNumber,
      orderDate: createdAt,
      createdAt,
      customer: this.normalizeCustomer(dto.customer),
      items,
      ...financials,
      orderStatus: OrderStatus.AWAITING_SHIPMENT,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: dto.paymentMethod,
      amountPaidCents: 0,
      paymentNote: dto.paymentNote?.trim() ?? '',
      shippingCompany: '',
      trackingNumber: '',
      createdBy: new Types.ObjectId(user.id),
      createdByName: user.name,
      createdByEmail: user.email,
      createdByRole: user.role,
      commissionStatus: CommissionStatus.PENDING,
    });
  }

  async findAll(query: ListOrdersQueryDto): Promise<OrderListResult> {
    const filter: Record<string, unknown> = {};
    if (query.orderStatus) filter.orderStatus = query.orderStatus;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.dateFrom || query.dateTo) {
      const start = query.dateFrom
        ? this.bangkokDateStart(query.dateFrom)
        : undefined;
      const end = query.dateTo
        ? new Date(
            this.bangkokDateStart(query.dateTo).getTime() +
              24 * 60 * 60 * 1000,
          )
        : undefined;
      if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
        throw new BadRequestException(
          'The start date must be on or before the end date',
        );
      }
      filter.orderDate = {
        ...(start ? { $gte: start } : {}),
        ...(end ? { $lt: end } : {}),
      };
    }
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
        .sort({ orderDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async bulkUpdateStatuses(
    dto: BulkUpdateOrderStatusDto,
    role: UserRole,
  ): Promise<OrderDocument[]> {
    const hasStatus =
      dto.orderStatus !== undefined ||
      dto.paymentStatus !== undefined ||
      dto.commissionStatus !== undefined;
    if (!hasStatus) {
      throw new BadRequestException('Select at least one status to update');
    }
    if (dto.commissionStatus !== undefined && role !== UserRole.OWNER) {
      throw new ForbiddenException(
        'Only the owner can update commission status',
      );
    }

    const uniqueIds = [...new Set(dto.orderIds)];
    const orders = await this.orderModel
      .find({ _id: { $in: uniqueIds } })
      .exec();
    if (orders.length !== uniqueIds.length) {
      throw new NotFoundException('One or more selected orders were not found');
    }

    for (const order of orders) {
      if (dto.orderStatus !== undefined) {
        order.orderStatus = dto.orderStatus;
      }
      if (dto.paymentStatus !== undefined) {
        const wasPaid = order.paymentStatus === PaymentStatus.PAID;
        order.paymentStatus = dto.paymentStatus;
        if (dto.paymentStatus === PaymentStatus.PAID) {
          order.amountPaidCents = order.totalCents;
          if (!wasPaid) order.paidAt = new Date();
        } else if (dto.paymentStatus === PaymentStatus.UNPAID) {
          order.amountPaidCents = 0;
          order.paidAt = undefined;
        } else if (dto.paymentStatus === PaymentStatus.PENDING_VERIFICATION) {
          order.paidAt = undefined;
        }
      }
      if (dto.commissionStatus !== undefined) {
        const wasPaid = order.commissionStatus === CommissionStatus.PAID;
        order.commissionStatus = dto.commissionStatus;
        if (
          dto.commissionStatus === CommissionStatus.PAID &&
          !wasPaid
        ) {
          order.commissionPaidAt = new Date();
        } else if (dto.commissionStatus === CommissionStatus.PENDING) {
          order.commissionPaidAt = undefined;
        }
      }
    }

    return Promise.all(orders.map((order) => order.save()));
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
      createdByRole: UserRole.ADMIN,
      orderStatus: {
        $nin: [OrderStatus.RETURNED, OrderStatus.EXCHANGED],
      },
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
    const sortBy = query.sortBy ?? 'orderDate';
    const sortDirection = query.sortOrder === 'asc' ? 1 : -1;
    const dateFormat =
      query.interval === 'year'
        ? '%Y'
        : query.interval === 'month'
          ? '%Y-%m'
          : '%Y-%m-%d';
    const eligibleOrder = {
      $not: [
        {
          $in: [
            '$orderStatus',
            [OrderStatus.RETURNED, OrderStatus.EXCHANGED],
          ],
        },
      ],
    };
    const eligibleOrderStage = { $match: { $expr: eligibleOrder } };
    const [summaryRows, dailySales, salesByAdmin, topProducts, recentOrders] =
      await Promise.all([
        this.orderModel
          .aggregate<DashboardSummaryRow>([
            { $match: filter },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                awaitingShipmentOrders: {
                  $sum: {
                    $cond: [
                      {
                        $eq: ['$orderStatus', OrderStatus.AWAITING_SHIPMENT],
                      },
                      1,
                      0,
                    ],
                  },
                },
                inTransitOrders: {
                  $sum: {
                    $cond: [
                      { $eq: ['$orderStatus', OrderStatus.IN_TRANSIT] },
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
                      { $eq: ['$orderStatus', OrderStatus.COMPLETED] },
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
                exchangedOrders: {
                  $sum: {
                    $cond: [
                      { $eq: ['$orderStatus', OrderStatus.EXCHANGED] },
                      1,
                      0,
                    ],
                  },
                },
                salesCents: { $sum: { $cond: [eligibleOrder, '$totalCents', 0] } },
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
                          eligibleOrder,
                          { $eq: ['$createdByRole', UserRole.ADMIN] },
                          { $eq: ['$commissionStatus', CommissionStatus.PAID] },
                        ],
                      },
                      '$commissionCents',
                      0,
                    ],
                  },
                },
                commissionTotalCents: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          eligibleOrder,
                          { $eq: ['$createdByRole', UserRole.ADMIN] },
                        ],
                      },
                      '$commissionCents',
                      0,
                    ],
                  },
                },
                productCostCents: {
                  $sum: { $cond: [eligibleOrder, '$productCostCents', 0] },
                },
                shippingCostCents: {
                  $sum: { $cond: [eligibleOrder, '$shippingCostCents', 0] },
                },
                otherExpensesCents: {
                  $sum: { $cond: [eligibleOrder, '$otherExpensesCents', 0] },
                },
                grossProfitCents: {
                  $sum: {
                    $cond: [
                      eligibleOrder,
                      {
                        $subtract: [
                          '$totalCents',
                          { $ifNull: ['$productCostCents', 0] },
                        ],
                      },
                      0,
                    ],
                  },
                },
                netProfitCents: {
                  $sum: {
                    $cond: [
                      eligibleOrder,
                      {
                        $subtract: [
                          '$totalCents',
                          {
                            $add: [
                              { $ifNull: ['$productCostCents', 0] },
                              { $ifNull: ['$commissionCents', 0] },
                              { $ifNull: ['$shippingCostCents', 0] },
                              { $ifNull: ['$otherExpensesCents', 0] },
                            ],
                          },
                        ],
                      },
                      0,
                    ],
                  },
                },
              },
            },
            { $project: { _id: 0 } },
          ])
          .exec(),
        this.orderModel
          .aggregate<DashboardDailyRow>([
            { $match: filter },
            eligibleOrderStage,
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: dateFormat,
                    date: '$orderDate',
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
            eligibleOrderStage,
            { $match: { createdByRole: UserRole.ADMIN } },
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
                dueCommissionCents: {
                  $sum: {
                    $cond: [
                      {
                        $ne: [
                          '$commissionStatus',
                          CommissionStatus.PAID,
                        ],
                      },
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
                dueCommissionCents: 1,
              },
            },
            { $sort: { salesCents: -1 } },
          ])
          .exec(),
        this.orderModel
          .aggregate<DashboardProductRow>([
            { $match: filter },
            eligibleOrderStage,
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

  async update(
    id: string,
    dto: UpdateOrderDto,
    role: UserRole,
  ): Promise<OrderDocument> {
    if (dto.commissionStatus !== undefined && role !== UserRole.OWNER) {
      throw new ForbiddenException(
        'Only the owner can update commission status',
      );
    }

    const order = await this.findOne(id);
    const hasFields = Object.values(dto).some((value) => value !== undefined);
    if (!hasFields)
      throw new BadRequestException('Provide at least one order update');
    const orderDate =
      dto.orderDate === undefined ? undefined : new Date(dto.orderDate);
    if (orderDate && !Number.isFinite(orderDate.getTime())) {
      throw new BadRequestException('Order date must be valid');
    }

    const items = this.withCommission(
      dto.items
        ? await this.createItemSnapshots(dto.items, order.items)
        : order.items,
      order.createdByRole === UserRole.ADMIN,
    );
    const discount = dto.discount ?? order.discountCents / 100;
    const shippingCharge = order.shippingChargeCents / 100;
    const shippingCost =
      dto.shippingCost ?? (order.shippingCostCents ?? 0) / 100;
    const otherExpenses = order.otherExpensesCents / 100;
    if (dto.customer) order.customer = this.normalizeCustomer(dto.customer);
    if (dto.items) order.items = items;
    if (dto.discount !== undefined)
      order.discountCents = this.toCents(dto.discount);
    if (dto.shippingCost !== undefined) {
      order.shippingCostCents = this.toCents(dto.shippingCost);
    }
    if (dto.paymentMethod !== undefined)
      order.paymentMethod = dto.paymentMethod;
    if (dto.orderStatus !== undefined) order.orderStatus = dto.orderStatus;
    if (orderDate) order.orderDate = orderDate;
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

  private withCommission(items: OrderItem[], enabled: boolean): OrderItem[] {
    if (enabled) return items;
    return items.map((item) => ({ ...item, commissionCents: 0 }));
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
      orderDate: { $gte: start, $lt: end },
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
      awaitingShipmentOrders: 0,
      inTransitOrders: 0,
      unpaidOrders: 0,
      completedOrders: 0,
      returnedOrders: 0,
      exchangedOrders: 0,
      salesCents: 0,
      receivedCents: 0,
      paidCommissionCents: 0,
      commissionTotalCents: 0,
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

  private orderPeriod(date: Date): string {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (!year || !month) {
      throw new InternalServerErrorException('Could not determine order month');
    }
    return `${year}${month}`;
  }

  private async nextOrderNumberForPeriod(period: string): Promise<string> {
    let counter: OrderCounter | null;
    try {
      counter = await this.orderCounterModel
        .findOneAndUpdate(
          { period },
          { $inc: { sequence: 1 } },
          { new: true, upsert: true },
        )
        .exec();
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 11000
      ) {
        throw error;
      }
      counter = await this.orderCounterModel
        .findOneAndUpdate(
          { period },
          { $inc: { sequence: 1 } },
          { new: true },
        )
        .exec();
    }
    if (!counter) {
      throw new InternalServerErrorException(
        'Could not allocate an order number',
      );
    }
    return `${period}-${counter.sequence.toString().padStart(4, '0')}`;
  }

  private validateId(id: string): void {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid order id');
  }
}

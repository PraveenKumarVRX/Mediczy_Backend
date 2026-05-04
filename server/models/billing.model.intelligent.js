import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

// Order Model - Main billing entity
const OrderModel = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  orderNumber: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  orderType: {
    type: DataTypes.ENUM('membership', 'appointment', 'prescription', 'lab_test', 'medicine', 'consultation', 'other'),
    allowNull: false
  },
  itemId: {
    type: DataTypes.INTEGER,
    comment: 'Reference to membership_plan_id, appointment_id, etc.'
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'),
    defaultValue: 'pending'
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR'
  },
  billingAddress: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  shippingAddress: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  notes: {
    type: DataTypes.TEXT
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'doctorId'
  }
}, {
  tableName: 'orders',
  timestamps: true
});

// Invoice Model
const InvoiceModel = sequelize.define('Invoice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoiceNumber: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  issueDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  dueDate: {
    type: DataTypes.DATEONLY
  },
  status: {
    type: DataTypes.ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled'),
    defaultValue: 'draft'
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR'
  },
  pdfUrl: {
    type: DataTypes.STRING(500)
  },
  lineItems: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  customerDetails: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  companyDetails: {
    type: DataTypes.JSONB,
    defaultValue: {
      name: 'Mediczy Healthcare',
      address: 'Mumbai, Maharashtra, India',
      gstin: 'GSTIN123456789',
      email: 'billing@mediczy.com',
      phone: '+91-1800-123-4567'
    }
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'invoices',
  timestamps: true
});

// Payment Model
const PaymentModel = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  paymentId: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR'
  },
  gateway: {
    type: DataTypes.ENUM('razorpay', 'paytm', 'phonepe', 'manual'),
    allowNull: false
  },
  gatewayOrderId: {
    type: DataTypes.STRING(100),
    comment: 'Gateway-specific order ID'
  },
  gatewayPaymentId: {
    type: DataTypes.STRING(100),
    comment: 'Gateway-specific payment ID'
  },
  gatewaySignature: {
    type: DataTypes.STRING(200),
    comment: 'Payment signature for verification'
  },
  status: {
    type: DataTypes.ENUM('initiated', 'pending', 'authorized', 'captured', 'success', 'failed', 'refunded', 'cancelled'),
    defaultValue: 'initiated'
  },
  method: {
    type: DataTypes.STRING(50),
    comment: 'card, netbanking, upi, wallet, etc.'
  },
  cardLast4: {
    type: DataTypes.STRING(4)
  },
  cardBrand: {
    type: DataTypes.STRING(20)
  },
  email: {
    type: DataTypes.STRING(100)
  },
  phone: {
    type: DataTypes.STRING(20)
  },
  gatewayResponse: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  errorCode: {
    type: DataTypes.STRING(50)
  },
  errorMessage: {
    type: DataTypes.TEXT
  },
  refundedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'payments',
  timestamps: true
});

// Transaction Model - Wallet/Ledger entries
const TransactionModel = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  transactionId: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  orderId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  paymentId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'payments',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('credit', 'debit', 'refund', 'adjustment'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR'
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'reversed'),
    defaultValue: 'pending'
  },
  description: {
    type: DataTypes.STRING(500)
  },
  balanceBefore: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  balanceAfter: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'transactions',
  timestamps: true
});

// Refund Model
const RefundModel = sequelize.define('Refund', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  refundId: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  paymentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'payments',
      key: 'id'
    }
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR'
  },
  reason: {
    type: DataTypes.STRING(500)
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  gatewayRefundId: {
    type: DataTypes.STRING(100)
  },
  processedAt: {
    type: DataTypes.DATE
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'refunds',
  timestamps: true
});

// Define associations
OrderModel.hasMany(PaymentModel, { foreignKey: 'orderId', as: 'payments' });
OrderModel.hasOne(InvoiceModel, { foreignKey: 'orderId', as: 'invoice' });
PaymentModel.belongsTo(OrderModel, { foreignKey: 'orderId', as: 'order' });
PaymentModel.hasMany(RefundModel, { foreignKey: 'paymentId', as: 'refunds' });
InvoiceModel.belongsTo(OrderModel, { foreignKey: 'orderId', as: 'order' });
RefundModel.belongsTo(PaymentModel, { foreignKey: 'paymentId', as: 'payment' });

// Export models
export const Order = OrderModel;
export const Invoice = InvoiceModel;
export const Payment = PaymentModel;
export const Transaction = TransactionModel;
export const Refund = RefundModel;

export default {
  Order,
  Invoice,
  Payment,
  Transaction,
  Refund
};

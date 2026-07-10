/**
 * Upsert standard promotional coupons (USG, CT, MRI, pharmacy, membership).
 */

import { Coupon } from '../models/index.js';

export const PROMO_COUPON_DEFINITIONS = [
  {
    code: 'USG',
    type: 'PERCENTAGE',
    value: 1000,
    minPurchase: 0,
    maxUsage: 100000,
    maxUsagePerUser: 5,
    description: 'Book USG scan at ₹1000',
    corporateName: 'Mediqzy Diagnostics',
    metadata: {
      scopes: ['USG_SCAN'],
      grantType: 'FIXED_BOOKING_PRICE',
      bookingPrice: 1000
    }
  },
  {
    code: 'CTSCAN',
    type: 'PERCENTAGE',
    value: 2000,
    minPurchase: 0,
    maxUsage: 100000,
    maxUsagePerUser: 5,
    description: 'Book CT scan at ₹2000',
    corporateName: 'Mediqzy Diagnostics',
    metadata: {
      scopes: ['CT_SCAN'],
      grantType: 'FIXED_BOOKING_PRICE',
      bookingPrice: 2000
    }
  },
  {
    code: 'MRI',
    type: 'PERCENTAGE',
    value: 3000,
    minPurchase: 0,
    maxUsage: 100000,
    maxUsagePerUser: 5,
    description: 'Book MRI scan at ₹3000',
    corporateName: 'Mediqzy Diagnostics',
    metadata: {
      scopes: ['MRI_SCAN'],
      grantType: 'FIXED_BOOKING_PRICE',
      bookingPrice: 3000
    }
  },
  {
    code: 'MED500',
    type: 'PERCENTAGE',
    value: 500,
    minPurchase: 500,
    maxUsage: 100000,
    maxUsagePerUser: 5,
    description: '₹500 off online medicine orders of ₹500+',
    corporateName: 'Mediqzy Pharmacy',
    metadata: {
      scopes: ['PHARMACY_PURCHASE'],
      grantType: 'FIXED_INR',
      discountInr: 500
    }
  },
  {
    code: 'CORP6FREE',
    type: 'PERCENTAGE',
    value: 6,
    minPurchase: 0,
    maxUsage: 100000,
    maxUsagePerUser: 1,
    description: '6 months free membership',
    corporateName: 'Mediqzy Corporate',
    metadata: {
      scopes: ['GYM_MEMBERSHIP', 'MEMBERSHIP'],
      grantType: 'FREE_MEMBERSHIP',
      freeMonths: 6
    }
  }
];

export async function seedPromoCoupons({ execute = false, createdBy = null } = {}) {
  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);

  const results = [];

  for (const definition of PROMO_COUPON_DEFINITIONS) {
    try {
      const existing = await Coupon.findOne({ where: { code: definition.code } });

      if (existing) {
        const next = {
          type: definition.type,
          value: definition.value,
          minPurchase: definition.minPurchase,
          maxUsage: definition.maxUsage,
          maxUsagePerUser: definition.maxUsagePerUser,
          validUntil,
          isActive: true,
          corporateName: definition.corporateName,
          description: definition.description,
          ...(createdBy ? { createdBy } : {}),
          metadata: {
            ...(existing.metadata || {}),
            ...definition.metadata
          }
        };

        results.push({ code: definition.code, action: 'update', next });

        if (execute) {
          await existing.update(next);
        }
        continue;
      }

      const payload = {
        code: definition.code,
        type: definition.type,
        value: definition.value,
        minPurchase: definition.minPurchase,
        maxUsage: definition.maxUsage,
        maxUsagePerUser: definition.maxUsagePerUser,
        usageCount: 0,
        validFrom: new Date(),
        validUntil,
        isActive: true,
        corporateName: definition.corporateName,
        description: definition.description,
        ...(createdBy ? { createdBy } : {}),
        metadata: definition.metadata
      };

      results.push({ code: definition.code, action: 'create', next: payload });

      if (execute) {
        await Coupon.create(payload);
      }
    } catch (error) {
      results.push({
        code: definition.code,
        action: 'error',
        error: error.message
      });
      if (execute) throw error;
    }
  }

  return {
    mode: execute ? 'execute' : 'dry-run',
    validUntil: validUntil.toISOString(),
    coupons: results.map((row) => ({
      code: row.code,
      action: row.action,
      value: row.next.value,
      grantType: row.next.metadata?.grantType,
      scopes: row.next.metadata?.scopes
    }))
  };
}

import { Op } from 'sequelize';
import { Coupon, CouponUsage } from '../models/index.js';

export const COUPON_SCOPES = {
  COINS_PURCHASE: 'COINS_PURCHASE',
  HEALTH_CHECKUP: 'HEALTH_CHECKUP',
  PHARMACY_PURCHASE: 'PHARMACY_PURCHASE',
  CONSULTATION: 'CONSULTATION',
  GYM_MEMBERSHIP: 'GYM_MEMBERSHIP',
  MEMBERSHIP: 'MEMBERSHIP'
};

const DEFAULT_COUPON_SCOPE = COUPON_SCOPES.COINS_PURCHASE;

export const parseAssignedUserIds = (coupon) => {
  const metadata = coupon?.metadata || {};
  const ids = metadata.assignedUserIds;

  if (!ids) return [];

  if (Array.isArray(ids)) {
    return ids
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  if (typeof ids === 'string') {
    return ids
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  return [];
};

export const parseCouponScopes = (coupon) => {
  const rawScopes = coupon?.metadata?.scopes;

  if (!rawScopes) {
    return [DEFAULT_COUPON_SCOPE];
  }

  const scopes = Array.isArray(rawScopes)
    ? rawScopes
    : String(rawScopes)
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);

  const allowed = new Set(Object.values(COUPON_SCOPES));
  const normalized = scopes.filter((scope) => allowed.has(scope));

  return normalized.length ? normalized : [DEFAULT_COUPON_SCOPE];
};

export const normalizeRequestedScope = (scope) => {
  const value = String(scope || DEFAULT_COUPON_SCOPE).toUpperCase();
  const allowed = new Set(Object.values(COUPON_SCOPES));
  return allowed.has(value) ? value : null;
};

export const isCouponEligibleForUser = (coupon, userId) => {
  const assignedUserIds = parseAssignedUserIds(coupon);
  if (!assignedUserIds.length) return true;
  return assignedUserIds.includes(parseInt(userId, 10));
};

export const isCouponEligibleForScope = (coupon, scope) => parseCouponScopes(coupon).includes(scope);

export const isFixedInrCoupon = (coupon) => coupon?.metadata?.grantType === 'FIXED_INR';

export const isFreeMembershipCoupon = (coupon) => coupon?.metadata?.grantType === 'FREE_MEMBERSHIP';

export const findActiveCoupon = async (code) => {
  const coupon = await Coupon.findOne({
    where: {
      code: String(code).trim().toUpperCase(),
      isActive: true,
      validFrom: { [Op.lte]: new Date() },
      validUntil: { [Op.gte]: new Date() }
    }
  });

  if (!coupon) {
    throw new Error('Invalid or expired coupon code');
  }

  return coupon;
};

export const assertCouponUsageLimits = async (coupon, userId) => {
  if (coupon.usageCount >= coupon.maxUsage) {
    throw new Error('Coupon usage limit exceeded');
  }

  const userUsage = await CouponUsage.count({
    where: {
      couponId: coupon.id,
      userId
    }
  });

  if (userUsage >= coupon.maxUsagePerUser) {
    throw new Error('You have already used this coupon the maximum number of times');
  }
};

export const calculateCouponPricing = ({
  coupon,
  scope,
  orderAmount = 0,
  packagePrice = 0
}) => {
  const baseAmount = packagePrice > 0 ? packagePrice : Math.max(0, Number(orderAmount) || 0);
  let discount = 0;
  let bonusHC = 0;
  let finalPrice = baseAmount;

  if (isFreeMembershipCoupon(coupon)) {
    throw new Error('Use the free membership coupon redemption flow for this code');
  }

  if (isFixedInrCoupon(coupon)) {
    if (coupon.type !== 'PERCENTAGE') {
      throw new Error('Invalid fixed-amount coupon configuration');
    }

    const minPurchase = Number(coupon.minPurchase || 0);
    if (baseAmount > 0 && baseAmount < minPurchase) {
      throw new Error(`Minimum order of ₹${minPurchase} required for this coupon`);
    }

    discount = Math.min(baseAmount, Number(coupon.value || 0));
    finalPrice = Math.max(0, baseAmount - discount);
  } else if (coupon.type === 'PERCENTAGE' && baseAmount > 0) {
    const minPurchase = Number(coupon.minPurchase || 0);
    if (baseAmount < minPurchase) {
      throw new Error(`Minimum order of ₹${minPurchase} required for this coupon`);
    }

    discount = (baseAmount * Number(coupon.value || 0)) / 100;
    finalPrice = Math.max(0, baseAmount - discount);
  } else if (coupon.type === 'FIXED_HC') {
    bonusHC = Number(coupon.value || 0);
  } else if (coupon.type === 'FREE_HC') {
    bonusHC = Number(coupon.value || 0);
    finalPrice = 0;
  } else if (scope !== COUPON_SCOPES.COINS_PURCHASE && coupon.type !== 'PERCENTAGE') {
    throw new Error('This coupon type is not supported for this order');
  }

  return {
    baseAmount,
    discount: Number(discount.toFixed(2)),
    bonusHC,
    finalPrice: Number(Math.max(0, finalPrice).toFixed(2))
  };
};

export const validateOrderCoupon = async ({
  code,
  userId,
  scope,
  orderAmount = 0,
  packagePrice = 0
}) => {
  if (!code) return null;

  const normalizedScope = normalizeRequestedScope(scope);
  if (!normalizedScope) {
    throw new Error('Invalid coupon scope');
  }

  const coupon = await findActiveCoupon(code);

  if (!isCouponEligibleForUser(coupon, userId)) {
    throw new Error('This coupon is not assigned to your account');
  }

  if (!isCouponEligibleForScope(coupon, normalizedScope)) {
    throw new Error(`This coupon is not valid for ${normalizedScope}`);
  }

  await assertCouponUsageLimits(coupon, userId);

  const pricing = calculateCouponPricing({
    coupon,
    scope: normalizedScope,
    orderAmount,
    packagePrice
  });

  return {
    coupon,
    scope: normalizedScope,
    scopes: parseCouponScopes(coupon),
    grantType: coupon.metadata?.grantType || null,
    ...pricing
  };
};

export const recordCouponUsage = async ({
  coupon,
  userId,
  discountAmount = 0,
  amountPaid = 0,
  hcPurchased = 0,
  hcBonus = 0,
  paymentId = null
}) => {
  await CouponUsage.create({
    couponId: coupon.id,
    couponCode: coupon.code,
    userId,
    hcPurchased,
    hcBonus,
    discountAmount,
    amountPaid,
    paymentId
  });

  await coupon.update({
    usageCount: Number(coupon.usageCount || 0) + 1
  });
};

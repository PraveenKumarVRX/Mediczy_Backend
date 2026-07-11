export const COUPON_GROUPS = [
  {
    id: 'coins',
    label: 'Health Coins',
    description: 'Wallet top-ups and bonus credits',
    icon: 'Coins',
    accent: 'amber',
  },
  {
    id: 'membership',
    label: 'Membership',
    description: 'Plan discounts and free months',
    icon: 'Crown',
    accent: 'rose',
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    description: 'Medicine order discounts',
    icon: 'Pill',
    accent: 'cyan',
  },
  {
    id: 'diagnostics',
    label: 'Imaging & Scans',
    description: 'USG, CT, MRI fixed booking prices',
    icon: 'Scan',
    accent: 'teal',
  },
] as const;

export type CouponGroupId = (typeof COUPON_GROUPS)[number]['id'];

export const COUPON_CATEGORIES = {
  FIXED_HC: {
    group: 'coins' as CouponGroupId,
    label: 'Bonus HC',
    shortLabel: 'Bonus',
    type: 'FIXED_HC',
    scopes: ['COINS_PURCHASE'],
    valueLabel: 'Bonus amount',
    valueHint: 'Health Coins credited on redemption',
    valueSuffix: 'HC',
    minPurchaseLabel: 'Min purchase',
    minPurchaseHint: 'Minimum HC purchase to qualify',
    showMinPurchase: false,
    example: 'CORP100 → 100 bonus HC on next wallet top-up',
  },
  FREE_HC: {
    group: 'coins' as CouponGroupId,
    label: 'Free HC',
    shortLabel: 'Free',
    type: 'FREE_HC',
    scopes: ['COINS_PURCHASE'],
    valueLabel: 'Free amount',
    valueHint: 'Health Coins granted without purchase',
    valueSuffix: 'HC',
    minPurchaseLabel: 'Min purchase',
    minPurchaseHint: 'Not used for free HC coupons',
    showMinPurchase: false,
    example: 'WELCOME50 → 50 free HC for new users',
  },
  PERCENTAGE_HC: {
    group: 'coins' as CouponGroupId,
    label: 'HC discount %',
    shortLabel: '% off',
    type: 'PERCENTAGE',
    scopes: ['COINS_PURCHASE'],
    valueLabel: 'Discount',
    valueHint: 'Percentage off Health Coins purchase',
    valueSuffix: '%',
    minPurchaseLabel: 'Min HC purchase',
    minPurchaseHint: 'Minimum HC cart size to apply discount',
    showMinPurchase: true,
    example: 'COIN20 → 20% off wallet top-ups above 100 HC',
  },
  MEMBERSHIP: {
    group: 'membership' as CouponGroupId,
    label: 'Plan discount %',
    shortLabel: '% off plan',
    type: 'PERCENTAGE',
    scopes: ['GYM_MEMBERSHIP', 'MEMBERSHIP'],
    valueLabel: 'Discount',
    valueHint: 'Percentage off membership plan price',
    valueSuffix: '%',
    minPurchaseLabel: 'Min order (₹)',
    minPurchaseHint: 'Minimum plan price in INR',
    showMinPurchase: true,
    example: 'MEMBER20 → 20% off any membership plan',
  },
  MEMBERSHIP_FREE: {
    group: 'membership' as CouponGroupId,
    label: 'Free months',
    shortLabel: 'Free',
    type: 'PERCENTAGE',
    scopes: ['GYM_MEMBERSHIP', 'MEMBERSHIP'],
    grantType: 'FREE_MEMBERSHIP',
    valueLabel: 'Free months',
    valueHint: 'Number of months at zero cost',
    valueSuffix: 'mo',
    minPurchaseLabel: 'Min order (₹)',
    minPurchaseHint: 'Not used for free membership',
    showMinPurchase: false,
    example: 'FREE6MO → 6 months membership free',
  },
  PHARMACY_FIXED: {
    group: 'pharmacy' as CouponGroupId,
    label: 'Flat ₹ off',
    shortLabel: '₹ off',
    type: 'PERCENTAGE',
    scopes: ['PHARMACY_PURCHASE'],
    grantType: 'FIXED_INR',
    valueLabel: 'Discount amount',
    valueHint: 'Flat INR off medicine subtotal',
    valueSuffix: '₹',
    minPurchaseLabel: 'Min order (₹)',
    minPurchaseHint: 'Minimum cart value before discount',
    showMinPurchase: true,
    example: 'MED500 → ₹500 off orders of ₹500+',
  },
  PHARMACY_PERCENT: {
    group: 'pharmacy' as CouponGroupId,
    label: 'Order discount %',
    shortLabel: '% off',
    type: 'PERCENTAGE',
    scopes: ['PHARMACY_PURCHASE'],
    valueLabel: 'Discount',
    valueHint: 'Percentage off medicine subtotal',
    valueSuffix: '%',
    minPurchaseLabel: 'Min order (₹)',
    minPurchaseHint: 'Minimum cart value in INR',
    showMinPurchase: true,
    example: 'PHARM10 → 10% off pharmacy orders above ₹299',
  },
  USG_SCAN: {
    group: 'diagnostics' as CouponGroupId,
    label: 'USG fixed price',
    shortLabel: 'USG',
    type: 'PERCENTAGE',
    scopes: ['USG_SCAN'],
    grantType: 'FIXED_BOOKING_PRICE',
    valueLabel: 'Booking price',
    valueHint: 'Patient pays this fixed INR for ultrasound',
    valueSuffix: '₹',
    minPurchaseLabel: 'Min order (₹)',
    minPurchaseHint: 'Not used for scan pricing',
    showMinPurchase: false,
    example: 'USG → ultrasound booked at ₹1000',
  },
  CT_SCAN: {
    group: 'diagnostics' as CouponGroupId,
    label: 'CT fixed price',
    shortLabel: 'CT',
    type: 'PERCENTAGE',
    scopes: ['CT_SCAN'],
    grantType: 'FIXED_BOOKING_PRICE',
    valueLabel: 'Booking price',
    valueHint: 'Patient pays this fixed INR for CT scan',
    valueSuffix: '₹',
    minPurchaseLabel: 'Min order (₹)',
    minPurchaseHint: 'Not used for scan pricing',
    showMinPurchase: false,
    example: 'CTSCAN → CT scan booked at ₹2000',
  },
  MRI_SCAN: {
    group: 'diagnostics' as CouponGroupId,
    label: 'MRI fixed price',
    shortLabel: 'MRI',
    type: 'PERCENTAGE',
    scopes: ['MRI_SCAN'],
    grantType: 'FIXED_BOOKING_PRICE',
    valueLabel: 'Booking price',
    valueHint: 'Patient pays this fixed INR for MRI',
    valueSuffix: '₹',
    minPurchaseLabel: 'Min order (₹)',
    minPurchaseHint: 'Not used for scan pricing',
    showMinPurchase: false,
    example: 'MRI → MRI scan booked at ₹3000',
  },
} as const;

export type CouponCategory = keyof typeof COUPON_CATEGORIES;

export type CouponFormState = {
  code: string;
  category: CouponCategory;
  value: string;
  minPurchase: string;
  maxUsage: string;
  maxUsagePerUser: string;
  validUntil: string;
  corporateName: string;
  assignedUserIds: string;
  planId: string;
  description: string;
  termsAndConditions: string;
  audience: 'all' | 'specific';
};

export const DEFAULT_FORM: CouponFormState = {
  code: '',
  category: 'PHARMACY_FIXED',
  value: '',
  minPurchase: '0',
  maxUsage: '10000',
  maxUsagePerUser: '1',
  validUntil: '',
  corporateName: '',
  assignedUserIds: '',
  planId: '',
  description: '',
  termsAndConditions: '',
  audience: 'all',
};

export const PROMO_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  group: CouponGroupId;
  patch: Partial<CouponFormState>;
}> = [
  {
    id: 'usg-1000',
    name: 'USG @ ₹1,000',
    description: 'Standard ultrasound promo',
    group: 'diagnostics',
    patch: { code: 'USG', category: 'USG_SCAN', value: '1000', description: 'Book USG scan at ₹1000' },
  },
  {
    id: 'ct-2000',
    name: 'CT @ ₹2,000',
    description: 'Standard CT scan promo',
    group: 'diagnostics',
    patch: { code: 'CTSCAN', category: 'CT_SCAN', value: '2000', description: 'Book CT scan at ₹2000' },
  },
  {
    id: 'mri-3000',
    name: 'MRI @ ₹3,000',
    description: 'Standard MRI promo',
    group: 'diagnostics',
    patch: { code: 'MRI', category: 'MRI_SCAN', value: '3000', description: 'Book MRI scan at ₹3000' },
  },
  {
    id: 'med500',
    name: '₹500 off pharmacy',
    description: 'Medicine orders ₹500+',
    group: 'pharmacy',
    patch: {
      code: 'MED500',
      category: 'PHARMACY_FIXED',
      value: '500',
      minPurchase: '500',
      description: '₹500 off online medicine orders of ₹500+',
    },
  },
  {
    id: 'free6mo',
    name: '6 months free',
    description: 'Free membership trial',
    group: 'membership',
    patch: {
      code: 'FREE6MO',
      category: 'MEMBERSHIP_FREE',
      value: '6',
      maxUsagePerUser: '1',
      description: '6 months free membership',
    },
  },
  {
    id: 'bonus-hc',
    name: '100 bonus HC',
    description: 'Wallet credit coupon',
    group: 'coins',
    patch: { code: 'CORP100', category: 'FIXED_HC', value: '100', description: '100 bonus Health Coins' },
  },
];

const MEMBERSHIP_SCOPES = new Set(['GYM_MEMBERSHIP', 'MEMBERSHIP']);
const PHARMACY_SCOPES = new Set(['PHARMACY_PURCHASE']);
const DIAGNOSTIC_SCOPES = new Set(['USG_SCAN', 'CT_SCAN', 'MRI_SCAN']);

export const categoryFromCoupon = (coupon: any): CouponCategory => {
  if (coupon?.metadata?.grantType === 'FREE_MEMBERSHIP') return 'MEMBERSHIP_FREE';
  if (coupon?.metadata?.grantType === 'FIXED_INR') return 'PHARMACY_FIXED';

  const scopes = Array.isArray(coupon?.metadata?.scopes) ? coupon.metadata.scopes : [];

  if (coupon?.metadata?.grantType === 'FIXED_BOOKING_PRICE') {
    if (scopes.includes('USG_SCAN')) return 'USG_SCAN';
    if (scopes.includes('CT_SCAN')) return 'CT_SCAN';
    if (scopes.includes('MRI_SCAN')) return 'MRI_SCAN';
  }

  if (coupon?.type === 'PERCENTAGE' && scopes.some((scope: string) => DIAGNOSTIC_SCOPES.has(scope))) {
    if (scopes.includes('USG_SCAN')) return 'USG_SCAN';
    if (scopes.includes('CT_SCAN')) return 'CT_SCAN';
    return 'MRI_SCAN';
  }

  if (coupon?.type === 'PERCENTAGE' && scopes.some((scope: string) => PHARMACY_SCOPES.has(scope))) {
    return 'PHARMACY_PERCENT';
  }
  if (coupon?.type === 'PERCENTAGE' && scopes.some((scope: string) => MEMBERSHIP_SCOPES.has(scope))) {
    return 'MEMBERSHIP';
  }
  if (coupon?.type === 'PERCENTAGE') return 'PERCENTAGE_HC';
  if (coupon?.type === 'FREE_HC') return 'FREE_HC';
  return 'FIXED_HC';
};

export const buildCouponPayload = (formData: CouponFormState) => {
  const category = COUPON_CATEGORIES[formData.category];
  const parsedPlanId = formData.planId.trim() ? parseInt(formData.planId.trim(), 10) : undefined;
  const skipMinPurchase = ['MEMBERSHIP_FREE', 'USG_SCAN', 'CT_SCAN', 'MRI_SCAN', 'FIXED_HC', 'FREE_HC'].includes(
    formData.category
  );

  return {
    code: formData.code.trim().toUpperCase(),
    type: category.type,
    scopes: category.scopes,
    ...(category.grantType ? { grantType: category.grantType } : {}),
    ...(parsedPlanId ? { planId: parsedPlanId } : {}),
    value: formData.value,
    minPurchase: skipMinPurchase ? '0' : formData.minPurchase,
    maxUsage: formData.maxUsage,
    maxUsagePerUser: formData.maxUsagePerUser,
    validUntil: formData.validUntil,
    corporateName: formData.corporateName,
    description: formData.description,
    termsAndConditions: formData.termsAndConditions,
    assignedUserIds:
      formData.audience === 'specific'
        ? formData.assignedUserIds
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        : [],
  };
};

export const formatCouponValue = (coupon: any) => {
  const category = categoryFromCoupon(coupon);
  if (category === 'MEMBERSHIP_FREE') {
    const months = coupon.metadata?.freeMonths ?? coupon.value;
    return `${months} month${Number(months) === 1 ? '' : 's'} free`;
  }
  if (category === 'PHARMACY_FIXED') return `₹${coupon.value} off`;
  if (['USG_SCAN', 'CT_SCAN', 'MRI_SCAN'].includes(category)) {
    return `₹${coupon.metadata?.bookingPrice ?? coupon.value}`;
  }
  if (['PERCENTAGE_HC', 'MEMBERSHIP', 'PHARMACY_PERCENT'].includes(category)) return `${coupon.value}% off`;
  if (category === 'FREE_HC') return `${coupon.value} HC free`;
  return `${coupon.value} HC bonus`;
};

export const getCouponTypeDisplay = (coupon: any) => {
  const category = categoryFromCoupon(coupon);
  const meta = COUPON_CATEGORIES[category];
  const colors: Record<CouponGroupId, string> = {
    coins: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
    membership: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
    pharmacy: 'bg-cyan-500/15 text-cyan-700 border-cyan-500/30',
    diagnostics: 'bg-teal-500/15 text-teal-700 border-teal-500/30',
  };
  return {
    label: meta.label,
    group: meta.group,
    color: colors[meta.group],
  };
};

export const buildPreviewHeadline = (form: CouponFormState) => {
  const category = COUPON_CATEGORIES[form.category];
  const value = form.value || '—';

  switch (form.category) {
    case 'MEMBERSHIP_FREE':
      return `${value} month${Number(value) === 1 ? '' : 's'} membership free`;
    case 'PHARMACY_FIXED':
      return `₹${value} off your medicine order`;
    case 'PHARMACY_PERCENT':
      return `${value}% off pharmacy order`;
    case 'USG_SCAN':
    case 'CT_SCAN':
    case 'MRI_SCAN':
      return `Book ${category.shortLabel} at ₹${value}`;
    case 'PERCENTAGE_HC':
      return `${value}% off Health Coins`;
    case 'FREE_HC':
      return `${value} Health Coins free`;
    case 'MEMBERSHIP':
      return `${value}% off membership plan`;
    default:
      return `${value} bonus Health Coins`;
  }
};

export const addDaysToDateInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

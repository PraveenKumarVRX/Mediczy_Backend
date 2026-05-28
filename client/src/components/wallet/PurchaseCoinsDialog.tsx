import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import { Coins, Check, Sparkles, Loader2, Ticket, Clock } from "lucide-react";

// Declare Razorpay type
declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Package {
  coins: number;
  price: number;
  discount: number;
  popular: boolean;
}

interface PurchaseCoinsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  prefillCouponCode?: string;
}

interface AvailableCoupon {
  id: number;
  code: string;
  type: 'PERCENTAGE' | 'FIXED_HC' | 'FREE_HC';
  value: number;
  minPurchase: number;
  description?: string;
  corporateName?: string;
  validUntil: string;
  remainingForUser: number;
  isPersonalized: boolean;
}

// Fallback packages matching server's health-coins.config.js
const FALLBACK_PACKAGES: Package[] = [
  { coins: 100, price: 99, discount: 0, popular: false },
  { coins: 250, price: 199, discount: 20, popular: true },
  { coins: 500, price: 349, discount: 30, popular: false },
  { coins: 1000, price: 599, discount: 40, popular: false },
  { coins: 2500, price: 1299, discount: 48, popular: false }
];

export function PurchaseCoinsDialog({ open, onOpenChange, onSuccess, prefillCouponCode }: PurchaseCoinsDialogProps) {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [packages, setPackages] = useState<Package[]>(FALLBACK_PACKAGES);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCoupon[]>([]);
  const [loadingAvailableCoupons, setLoadingAvailableCoupons] = useState(false);

  // Fetch packages from server when dialog opens
  useEffect(() => {
    if (open) {
      fetchPackages();
      fetchAvailableCoupons();
      if (prefillCouponCode) {
        setCouponCode(prefillCouponCode.toUpperCase());
      }
    } else {
      setSelectedPackage(null);
      setCouponCode('');
      setAppliedCoupon(null);
      setAvailableCoupons([]);
    }
  }, [open, prefillCouponCode]);

  const fetchPackages = async () => {
    setLoadingPackages(true);
    try {
      const response = await api.get('/wallet/rewards');
      if (response.data?.success && response.data?.data?.pricing?.packages) {
        setPackages(response.data.data.pricing.packages);
      }
    } catch (error) {
      console.error('Failed to fetch packages, using fallback:', error);
    } finally {
      setLoadingPackages(false);
    }
  };

  const fetchAvailableCoupons = async () => {
    setLoadingAvailableCoupons(true);
    try {
      const response = await api.get('/wallet/my-coupons');
      if (response.data?.success) {
        setAvailableCoupons(response.data.coupons || []);
      }
    } catch (error) {
      setAvailableCoupons([]);
      console.error('Failed to fetch available coupons:', error);
    } finally {
      setLoadingAvailableCoupons(false);
    }
  };

  const couponLabel = (coupon: AvailableCoupon) => {
    if (coupon.type === 'PERCENTAGE') return `${coupon.value}% off`;
    if (coupon.type === 'FREE_HC') return `+${coupon.value} free HC`;
    return `+${coupon.value} bonus HC`;
  };

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      toast({ title: "Error", description: "Please enter a coupon code", variant: "destructive" });
      return;
    }

    setValidatingCoupon(true);
    try {
      const response = await api.post('/wallet/validate-coupon', {
        code: couponCode,
        packageId: selectedPackage
      });

      if (response.data.success) {
        setAppliedCoupon(response.data.coupon);
        toast({ title: "✅ Coupon Applied!", description: response.data.message });
      }
    } catch (error: any) {
      setAppliedCoupon(null);
      toast({
        title: "Invalid Coupon",
        description: error.response?.data?.message || "Coupon validation failed",
        variant: "destructive",
      });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handlePurchase = async () => {
    if (selectedPackage === null) {
      toast({ title: "Error", description: "Please select a package", variant: "destructive" });
      return;
    }

    setProcessing(true);

    try {
      const pkg = packages[selectedPackage];

      // Step 1: Create order on backend
      const orderResponse = await api.post('/wallet/create-order', {
        packageId: selectedPackage,
        couponCode: appliedCoupon ? couponCode : undefined
      });

      if (!orderResponse.data.success) {
        throw new Error(orderResponse.data.message || 'Failed to create order');
      }

      const { order, coupon: couponResult } = orderResponse.data;

      // Handle free coupon (no payment required)
      if (!order && couponResult?.finalAmount === 0) {
        try {
          const verifyResponse = await api.post('/wallet/redeem-free-coupon', {
            packageId: selectedPackage,
            couponCode: couponCode
          });

          if (verifyResponse.data.success) {
            toast({
              title: "🎉 Free Health Coins!",
              description: verifyResponse.data.message || `${pkg.coins} health coins added to your wallet`,
            });
            onSuccess();
            onOpenChange(false);
          } else {
            throw new Error(verifyResponse.data.message || 'Failed to redeem coupon');
          }
        } catch (error: any) {
          toast({
            title: "Error",
            description: error.response?.data?.message || error.message || "Failed to redeem free coupon",
            variant: "destructive",
          });
        }
        setProcessing(false);
        return;
      }

      if (!order) {
        throw new Error('No payment order created');
      }

      // Step 2: Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      // Step 3: Open Razorpay checkout
      // Build prefill from user context / localStorage
      const prefillName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : (localStorage.getItem('userName') || '');
      const prefillEmail = currentUser?.email || localStorage.getItem('userEmail') || '';
      const prefillContact = currentUser?.phoneNumber || localStorage.getItem('userPhone') || '';

      const options: Record<string, any> = {
        key: order.key,
        amount: order.amountInPaise || (order.amount * 100), // Razorpay expects amount in paise
        currency: order.currency || 'INR',
        name: 'Mediqzy Healthcare',
        description: `Purchase ${pkg.coins} Health Coins`,
        order_id: order.orderId,
        handler: async function (response: any) {
          try {
            const verifyResponse = await api.post('/wallet/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              packageId: selectedPackage,
              couponCode: appliedCoupon ? couponCode : undefined
            });

            if (verifyResponse.data.success) {
              toast({
                title: "🎉 Purchase Successful!",
                description: `${verifyResponse.data.totalCoins || pkg.coins} health coins added to your wallet`,
              });
              onSuccess();
              onOpenChange(false);
            } else {
              throw new Error(verifyResponse.data.message || 'Payment verification failed');
            }
          } catch (error: any) {
            toast({
              title: "Verification Error",
              description: error.response?.data?.message || error.message || "Failed to verify payment",
              variant: "destructive",
            });
          } finally {
            setProcessing(false);
          }
        },
        prefill: {
          ...(prefillName ? { name: prefillName } : {}),
          ...(prefillEmail ? { email: prefillEmail } : {}),
          ...(prefillContact ? { contact: prefillContact } : {}),
        },
        theme: { color: '#14b8a6' },
        modal: {
          ondismiss: function () {
            setProcessing(false);
            toast({ title: "Payment Cancelled", description: "You cancelled the payment", variant: "default" });
          }
        }
      };

      console.log('🔑 Razorpay checkout options:', {
        key: options.key,
        amount: options.amount,
        currency: options.currency,
        order_id: options.order_id,
        prefill: options.prefill,
      });

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function (response: any) {
        console.error('❌ Razorpay payment failed:', response.error);
        setProcessing(false);
        toast({
          title: "Payment Failed",
          description: response.error?.description || response.error?.reason || "Payment could not be processed",
          variant: "destructive",
        });
      });
      razorpay.open();

    } catch (error: any) {
      setProcessing(false);
      toast({
        title: "Error",
        description: error.response?.data?.message || error.message || "Failed to initiate payment",
        variant: "destructive",
      });
    }
  };

  const getDisplayPrice = () => {
    if (selectedPackage === null) return null;
    const pkg = packages[selectedPackage];
    if (appliedCoupon?.finalPrice !== undefined && appliedCoupon.finalPrice === 0) return 'Free';
    if (appliedCoupon?.discount > 0) return `₹${(pkg.price - appliedCoupon.discount).toFixed(0)}`;
    return `₹${pkg.price}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Coins className="h-6 w-6 text-primary" />
            Purchase Health Coins
          </DialogTitle>
          <DialogDescription>
            Choose a package to add health coins to your wallet
          </DialogDescription>
        </DialogHeader>

        {loadingPackages ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading packages...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
            {packages.map((pkg, index) => (
              <div
                key={index}
                onClick={() => {
                  setSelectedPackage(index);
                  setAppliedCoupon(null);
                }}
                className={`relative cursor-pointer rounded-xl border-2 p-3 transition-all ${
                  selectedPackage === index
                    ? 'border-primary bg-primary/5 shadow-lg scale-[1.02]'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary/50 hover:shadow-md'
                } ${pkg.popular ? 'ring-2 ring-primary ring-offset-2' : ''}`}
              >
                {pkg.popular && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary flex items-center gap-1 text-[10px] px-2 py-0.5">
                    <Sparkles className="h-2.5 w-2.5" />
                    Best Value
                  </Badge>
                )}

                <div className="text-center space-y-2 pt-1">
                  <div className="flex items-center justify-center gap-1">
                    <Coins className="h-5 w-5 text-primary" />
                    <span className="text-2xl font-bold">{pkg.coins}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Health Coins</p>

                  <div>
                    <p className="text-lg font-bold text-primary">₹{pkg.price}</p>
                    {pkg.discount > 0 && (
                      <p className="text-[10px] text-green-600 font-medium">
                        Save {pkg.discount}%
                      </p>
                    )}
                  </div>

                  {selectedPackage === index && (
                    <div className="flex items-center justify-center text-primary">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coupon Code Section */}
        {selectedPackage !== null && (
          <div className="mt-4 p-4 border rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
            <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-purple-600" />
              Have a Coupon Code?
            </h4>
            <div className="flex gap-2">
              <Input
                placeholder="Enter coupon code"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  if (appliedCoupon) setAppliedCoupon(null);
                }}
                className="flex-1"
                disabled={processing}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={validateCoupon}
                disabled={!couponCode.trim() || validatingCoupon}
              >
                {validatingCoupon ? 'Validating...' : 'Apply'}
              </Button>
            </div>

            {appliedCoupon && (
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded">
                <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                  ✅ Coupon Applied: {appliedCoupon.code}
                </p>
                {appliedCoupon.bonusHC > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    +{appliedCoupon.bonusHC} Bonus HC
                  </p>
                )}
                {appliedCoupon.discount > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    ₹{appliedCoupon.discount.toFixed(2)} Discount
                  </p>
                )}
                {appliedCoupon.finalPrice === 0 && (
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1 font-bold">
                    🎉 Free HC! No payment required
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Personalized Offers */}
        <div className="mt-4 rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 p-4 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-orange-950/20">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Ticket className="h-4 w-4 text-amber-600" />
              Offers For You
            </h4>
            {loadingAvailableCoupons && <Loader2 className="h-4 w-4 animate-spin text-amber-600" />}
          </div>

          {!loadingAvailableCoupons && availableCoupons.length === 0 && (
            <p className="text-xs text-muted-foreground">No active coupon offers are assigned to your account right now.</p>
          )}

          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {availableCoupons.map((coupon) => (
              <div
                key={coupon.id}
                className="rounded-md border border-amber-200/70 bg-white/70 p-2.5 dark:border-amber-900/50 dark:bg-slate-900/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tracking-wide text-sm">{coupon.code}</span>
                      <Badge variant="secondary" className="text-[10px]">{couponLabel(coupon)}</Badge>
                      {coupon.isPersonalized && (
                        <Badge className="bg-amber-600 text-white text-[10px]">Personal</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {coupon.description || 'Apply this code during checkout'}
                    </p>
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Valid till {new Date(coupon.validUntil).toLocaleDateString()}</span>
                      <span>Uses left: {coupon.remainingForUser}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCouponCode(coupon.code);
                      setAppliedCoupon(null);
                    }}
                    disabled={processing}
                  >
                    Use
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 bg-muted/50 p-4 rounded-lg">
          <h4 className="font-semibold mb-2 text-sm">What you can do with Health Coins:</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>✓ Get discounts on consultations</li>
            <li>✓ Save on lab tests and diagnostics</li>
            <li>✓ Redeem for medication discounts</li>
            <li>✓ Unlock premium health features</li>
          </ul>
        </div>

        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePurchase}
            className="flex-1"
            disabled={selectedPackage === null || processing || loadingPackages}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : selectedPackage !== null ? (
              appliedCoupon?.finalPrice === 0
                ? `Get ${packages[selectedPackage].coins} HC Free`
                : `Buy ${packages[selectedPackage].coins} HC for ${getDisplayPrice()}`
            ) : (
              'Select a Package'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

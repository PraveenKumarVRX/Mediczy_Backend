import { useState } from "react";
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
import api from "@/utils/api";
import { Coins, Check, Sparkles } from "lucide-react";

// Declare Razorpay type
declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PurchaseCoinsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const PACKAGES = [
  { coins: 100, price: 100, discount: 0, popular: false },
  { coins: 200, price: 190, discount: 5, popular: false },
  { coins: 500, price: 450, discount: 10, popular: true },
  { coins: 1000, price: 850, discount: 15, popular: false },
  { coins: 2000, price: 1600, discount: 20, popular: false }
];

export function PurchaseCoinsDialog({ open, onOpenChange, onSuccess }: PurchaseCoinsDialogProps) {
  const { toast } = useToast();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  
  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter a coupon code",
        variant: "destructive",
      });
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
        toast({
          title: "✅ Coupon Applied!",
          description: response.data.message,
        });
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
      toast({
        title: "Error",
        description: "Please select a package",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    
    try {
      const pkg = PACKAGES[selectedPackage];
      
      // Step 1: Create Razorpay order
      const orderResponse = await api.post('/wallet/create-order', {
        packageId: selectedPackage,
        couponCode: appliedCoupon ? couponCode : undefined
      });

      if (!orderResponse.data.success) {
        throw new Error(orderResponse.data.message || 'Failed to create order');
      }

      const { order } = orderResponse.data;

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
      const options = {
        key: order.key,
        // Razorpay will use amount from the order when order_id is provided
        currency: order.currency,
        name: 'Mediqzy Healthcare',
        description: `Purchase ${pkg.coins} Health Coins`,
        order_id: order.orderId,
        image: 'https://mediqzy.com/logo/Mediqzy_logo.jpeg',
        handler: async function (response: any) {
          try {
            // Step 4: Verify payment on backend
            const verifyResponse = await api.post('/wallet/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              packageId: selectedPackage,
              couponCode: appliedCoupon ? couponCode : undefined
            });

            if (verifyResponse.data.success) {
              toast({
                title: "Success!",
                description: `${pkg.coins} health coins added to your wallet`,
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
          name: '',
          email: '',
          contact: ''
        },
        theme: {
          color: '#14b8a6' // Teal color
        },
        modal: {
          ondismiss: function() {
            setProcessing(false);
            toast({
              title: "Payment Cancelled",
              description: "You cancelled the payment",
              variant: "default",
            });
          }
        }
      };

      const razorpay = new window.Razorpay(options);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Coins className="h-6 w-6 text-primary" />
            Purchase Health Coins
          </DialogTitle>
          <DialogDescription>
            Choose a package to add health coins to your wallet
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {PACKAGES.map((pkg, index) => (
            <div
              key={index}
              onClick={() => setSelectedPackage(index)}
              className={`relative cursor-pointer rounded-lg border-2 p-4 transition-all ${
                selectedPackage === index
                  ? 'border-primary bg-primary/5 shadow-lg'
                  : 'border-gray-200 hover:border-primary/50'
              } ${pkg.popular ? 'ring-2 ring-primary ring-offset-2' : ''}`}
            >
              {pkg.popular && (
                <Badge className="absolute -top-2 -right-2 bg-primary flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Popular
                </Badge>
              )}
              
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Coins className="h-8 w-8 text-primary" />
                  <span className="text-3xl font-bold">{pkg.coins}</span>
                </div>
                
                <div>
                  <p className="text-2xl font-bold text-primary">₹{pkg.price}</p>
                  {pkg.discount > 0 && (
                    <p className="text-xs text-green-600 font-medium mt-1">
                      Save {pkg.discount}%
                    </p>
                  )}
                </div>

                {selectedPackage === index && (
                  <div className="flex items-center justify-center text-primary">
                    <Check className="h-5 w-5" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Coupon Code Section */}
        <div className="mt-6 p-4 border rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            Have a Coupon Code?
          </h4>
          <div className="flex gap-2">
            <Input
              placeholder="Enter coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              className="flex-1"
              disabled={processing}
            />
            <Button
              type="button"
              variant="outline"
              onClick={validateCoupon}
              disabled={!couponCode.trim() || validatingCoupon || !selectedPackage}
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

        <div className="mt-6 bg-muted/50 p-4 rounded-lg">
          <h4 className="font-semibold mb-2">What you can do with Health Coins:</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>✓ Get discounts on consultations</li>
            <li>✓ Save on lab tests and diagnostics</li>
            <li>✓ Redeem for medication discounts</li>
            <li>✓ Unlock premium health features</li>
          </ul>
        </div>

        <div className="flex gap-3 mt-6">
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
            disabled={selectedPackage === null || processing}
          >
            {processing ? 'Processing...' : selectedPackage !== null ? `Buy ${PACKAGES[selectedPackage].coins} HC for ₹${PACKAGES[selectedPackage].price}` : 'Select a Package'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

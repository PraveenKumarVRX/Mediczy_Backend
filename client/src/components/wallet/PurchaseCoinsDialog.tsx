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
  { coins: 100, price: 99, discount: 0, popular: false },
  { coins: 250, price: 199, discount: 20, popular: true },
  { coins: 500, price: 349, discount: 30, popular: false },
  { coins: 1000, price: 599, discount: 40, popular: false },
  { coins: 2500, price: 1299, discount: 48, popular: false }
];

export function PurchaseCoinsDialog({ open, onOpenChange, onSuccess }: PurchaseCoinsDialogProps) {
  const { toast } = useToast();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

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
        packageId: selectedPackage
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
              packageId: selectedPackage
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

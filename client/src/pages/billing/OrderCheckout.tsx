import type { Variants } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  CreditCard, ShieldCheck, Loader2, CheckCircle2, Lock, ArrowLeft,
  MapPin, Wallet, Tag, IndianRupee, Package, Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

declare global { interface Window { Razorpay: any; } }

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

interface OrderItem { name: string; description: string; quantity: number; price: number; amount: number; }
interface CheckoutData { orderType: string; itemId?: string; subtotal: number; tax?: number; discount?: number; currency?: string; lineItems?: OrderItem[]; billingAddress?: any; notes?: string; }

const OrderCheckout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const checkoutData = location.state as CheckoutData;

  const [loading, setLoading] = useState(false);
  const [paymentGateway, setPaymentGateway] = useState('razorpay');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [billingAddress, setBillingAddress] = useState({ street: '', city: '', state: '', pincode: '', country: 'India' });

  useEffect(() => {
    if (!checkoutData) { toast({ title: 'Error', description: 'No checkout data found', variant: 'destructive' }); navigate('/billing/orders'); return; }
    createOrder();
  }, []);

  useEffect(() => {
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true; document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  const createOrder = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/billing/orders/create`, { ...checkoutData, billingAddress: checkoutData.billingAddress || billingAddress }, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) { setOrderId(response.data.data.order.id); setOrder(response.data.data.order); } else throw new Error(response.data.message);
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to create order', variant: 'destructive' });
      navigate('/billing/orders');
    } finally { setLoading(false); }
  };

  const handleRazorpayPayment = async () => {
    try {
      if (!orderId) { toast({ title: 'Error', description: 'Order not created yet', variant: 'destructive' }); return; }
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/billing/payments/razorpay/create`, { orderId, amount: order.total, currency: order.currency }, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.data.success) throw new Error(response.data.message);
      const { orderId: razorpayOrderId, amount, currency, key } = response.data.data;
      const options = {
        key, amount, currency, name: 'MEDICZY', description: `Payment for ${order.orderType}`, order_id: razorpayOrderId,
        handler: async function (res: any) { await verifyRazorpayPayment(res); },
        prefill: { email: localStorage.getItem('userEmail') || '', contact: localStorage.getItem('userPhone') || '' },
        theme: { color: '#4f46e5' },
        modal: { ondismiss: () => { setLoading(false); toast({ title: 'Payment cancelled' }); } }
      };
      const razorpay = new window.Razorpay(options); razorpay.open();
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.message || 'Payment failed', variant: 'destructive' }); setLoading(false);
    }
  };

  const verifyRazorpayPayment = async (response: any) => {
    try {
      const token = localStorage.getItem('token');
      const verifyResponse = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/billing/payments/razorpay/verify`, { orderId, razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }, { headers: { Authorization: `Bearer ${token}` } });
      if (verifyResponse.data.success) { toast({ title: 'Payment successful!' }); navigate('/billing/orders', { state: { paymentSuccess: true, orderId } }); } else throw new Error(verifyResponse.data.message);
    } catch { toast({ title: 'Error', description: 'Payment verification failed', variant: 'destructive' }); } finally { setLoading(false); }
  };

  const handleProceedToPayment = () => {
    if (paymentGateway === 'razorpay') handleRazorpayPayment();
    else toast({ title: 'Stripe coming soon' });
  };

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-full bg-indigo-100 dark:bg-indigo-900/50 animate-ping" />
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600"><Loader2 className="w-7 h-7 text-white animate-spin" /></div>
          </div>
          <p className="text-lg font-medium text-gray-700 dark:text-slate-300">Creating your order...</p>
          <p className="text-sm text-gray-500 dark:text-slate-400">This won't take long</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <motion.div variants={container as unknown as Variants} initial="hidden" animate="show" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Back + Title */}
        <motion.div variants={item as unknown as Variants} className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/billing/orders')} className="rounded-full h-10 w-10 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Secure Checkout</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">Complete your purchase securely</p>
          </div>
        </motion.div>

        {/* Checkout Progress */}
        <motion.div variants={item as unknown as Variants} className="flex items-center justify-center gap-3 py-2">
          {['Cart', 'Checkout', 'Payment', 'Confirmation'].map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 ${i <= 1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-slate-600'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i <= 1 ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'}`}>{i + 1}</div>
                <span className="text-sm font-medium hidden sm:block">{step}</span>
              </div>
              {i < 3 && <div className={`w-12 h-0.5 ${i < 1 ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-700'}`} />}
            </div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Left: Order + Address */}
          <div className="md:col-span-3 space-y-6">
            {/* Order Summary */}
            <motion.div variants={item as unknown as Variants}>
              <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-500 to-blue-500" />
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Package className="w-4 h-4 text-indigo-600" /> Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {checkoutData.lineItems?.map((li, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-100 dark:border-slate-700/50">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{li.name}</p>
                        {li.description && <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{li.description}</p>}
                        {li.quantity > 1 && <p className="text-xs text-gray-400 mt-0.5">Qty: {li.quantity}</p>}
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">₹{li.amount.toFixed(2)}</p>
                    </div>
                  ))}

                  <Separator />

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Subtotal</span><span className="font-medium text-gray-900 dark:text-white">₹{order.subtotal?.toFixed(2)}</span></div>
                    {order.tax > 0 && <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Tax (18% GST)</span><span className="font-medium text-gray-900 dark:text-white">₹{order.tax?.toFixed(2)}</span></div>}
                    {order.discount > 0 && <div className="flex justify-between"><span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Tag className="w-3 h-3" /> Discount</span><span className="font-medium text-emerald-600 dark:text-emerald-400">-₹{order.discount?.toFixed(2)}</span></div>}
                  </div>

                  <Separator />

                  <div className="flex justify-between items-center pt-1">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">Total</span>
                    <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">₹{order.total?.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Billing Address */}
            <motion.div variants={item as unknown as Variants}>
              <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50 overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><MapPin className="w-4 h-4 text-blue-600" /> Billing Address</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-gray-500 dark:text-slate-400">Street Address</Label>
                    <Input value={billingAddress.street} onChange={(e) => setBillingAddress({ ...billingAddress, street: e.target.value })} className="mt-1 dark:bg-slate-900 dark:border-slate-700" placeholder="123 Main Street" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500 dark:text-slate-400">City</Label>
                      <Input value={billingAddress.city} onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })} className="mt-1 dark:bg-slate-900 dark:border-slate-700" placeholder="Mumbai" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 dark:text-slate-400">State</Label>
                      <Input value={billingAddress.state} onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })} className="mt-1 dark:bg-slate-900 dark:border-slate-700" placeholder="Maharashtra" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500 dark:text-slate-400">Pincode</Label>
                      <Input value={billingAddress.pincode} onChange={(e) => setBillingAddress({ ...billingAddress, pincode: e.target.value })} className="mt-1 dark:bg-slate-900 dark:border-slate-700" placeholder="400001" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 dark:text-slate-400">Country</Label>
                      <Input value={billingAddress.country} onChange={(e) => setBillingAddress({ ...billingAddress, country: e.target.value })} className="mt-1 dark:bg-slate-900 dark:border-slate-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: Payment */}
          <div className="md:col-span-2 space-y-6">
            <motion.div variants={item as unknown as Variants}>
              <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Wallet className="w-4 h-4 text-emerald-600" /> Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Razorpay Option */}
                  <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${paymentGateway === 'razorpay' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-500' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                    <input type="radio" name="gateway" value="razorpay" checked={paymentGateway === 'razorpay'} onChange={(e) => setPaymentGateway(e.target.value)} className="sr-only" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentGateway === 'razorpay' ? 'border-indigo-600' : 'border-gray-300 dark:border-slate-600'}`}>
                      {paymentGateway === 'razorpay' && <div className="w-3 h-3 rounded-full bg-indigo-600" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">Razorpay</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">UPI, Cards, Net Banking, Wallets</p>
                    </div>
                    <CreditCard className="w-5 h-5 text-indigo-500" />
                  </label>

                  {/* Stripe Option */}
                  <label className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-slate-700 opacity-50 cursor-not-allowed">
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-slate-600" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">Stripe</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">International Cards (Coming soon)</p>
                    </div>
                    <CreditCard className="w-5 h-5 text-gray-400" />
                  </label>

                  <Separator />

                  {/* Pay Button */}
                  <Button
                    className="w-full h-12 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-base font-semibold shadow-lg shadow-indigo-500/25 transition-all"
                    onClick={handleProceedToPayment}
                    disabled={loading}
                  >
                    {loading ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      <><Lock className="w-4 h-4 mr-2" /> Pay ₹{order.total?.toFixed(2)}</>
                    )}
                  </Button>

                  <Button variant="outline" className="w-full dark:border-slate-700 dark:text-slate-300" onClick={() => navigate('/billing/orders')} disabled={loading}>
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Security badges */}
            <motion.div variants={item as unknown as Variants}>
              <Card className="border-0 shadow-sm dark:bg-slate-800/40 dark:border-slate-700/50 overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {[
                    { icon: Lock, text: '256-bit SSL Encryption', color: 'text-emerald-600 dark:text-emerald-400' },
                    { icon: ShieldCheck, text: 'PCI DSS Compliant Gateway', color: 'text-blue-600 dark:text-blue-400' },
                    { icon: Sparkles, text: 'Instant Refund Guarantee', color: 'text-violet-600 dark:text-violet-400' },
                  ].map((b) => (
                    <div key={b.text} className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-slate-800"><b.icon className={`w-4 h-4 ${b.color}`} /></div>
                      <p className="text-xs font-medium text-gray-600 dark:text-slate-400">{b.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default OrderCheckout;

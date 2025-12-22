import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  TextField,
  Divider,
  CircularProgress,
  Alert,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  CreditCard,
  Payment,
  CheckCircle,
  Error
} from '@mui/icons-material';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface OrderItem {
  name: string;
  description: string;
  quantity: number;
  price: number;
  amount: number;
}

interface CheckoutData {
  orderType: string;
  itemId?: string;
  subtotal: number;
  tax?: number;
  discount?: number;
  currency?: string;
  lineItems?: OrderItem[];
  billingAddress?: any;
  notes?: string;
}

const OrderCheckout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const checkoutData = location.state as CheckoutData;

  const [loading, setLoading] = useState(false);
  const [paymentGateway, setPaymentGateway] = useState('razorpay');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [billingAddress, setBillingAddress] = useState({
    street: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India'
  });

  useEffect(() => {
    if (!checkoutData) {
      toast({ title: 'Error', description: 'No checkout data found', variant: 'destructive' });
      navigate('/billing/orders');
      return;
    }
    createOrder();
  }, []);

  useEffect(() => {
    // Load Razorpay SDK
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const createOrder = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/orders/create`,
        {
          ...checkoutData,
          billingAddress: checkoutData.billingAddress || billingAddress
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setOrderId(response.data.data.order.id);
        setOrder(response.data.data.order);
      } else {
        throw new Error(response.data.message);
      }
    } catch (error: any) {
      console.error('Create order error:', error);
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to create order', variant: 'destructive' });
      navigate('/billing/orders');
    } finally {
      setLoading(false);
    }
  };

  const handleRazorpayPayment = async () => {
    try {
      if (!orderId) {
        toast({ title: 'Error', description: 'Order not created yet', variant: 'destructive' });
        return;
      }

      setLoading(true);
      const token = localStorage.getItem('token');

      // Create Razorpay order
      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/payments/razorpay/create`,
        {
          orderId: orderId,
          amount: order.total,
          currency: order.currency
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.message);
      }

      const { orderId: razorpayOrderId, amount, currency, key } = response.data.data;

      // Open Razorpay checkout
      const options = {
        key: key,
        amount: amount,
        currency: currency,
        name: 'MEDICZY',
        description: `Payment for ${order.orderType}`,
        order_id: razorpayOrderId,
        handler: async function (response: any) {
          await verifyRazorpayPayment(response);
        },
        prefill: {
          email: localStorage.getItem('userEmail') || '',
          contact: localStorage.getItem('userPhone') || ''
        },
        theme: {
          color: '#3f51b5'
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            toast({ title: 'Info', description: 'Payment cancelled' });
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error: any) {
      console.error('Razorpay payment error:', error);
      toast({ title: 'Error', description: error.response?.data?.message || 'Payment failed', variant: 'destructive' });
      setLoading(false);
    }
  };

  const verifyRazorpayPayment = async (response: any) => {
    try {
      const token = localStorage.getItem('token');

      const verifyResponse = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/payments/razorpay/verify`,
        {
          orderId: orderId,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (verifyResponse.data.success) {
        toast({ title: 'Success', description: 'Payment successful!' });
        navigate('/billing/orders', {
          state: { paymentSuccess: true, orderId: orderId }
        });
      } else {
        throw new Error(verifyResponse.data.message);
      }
    } catch (error: any) {
      console.error('Payment verification error:', error);
      toast({ title: 'Error', description: 'Payment verification failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleStripePayment = async () => {
    // TODO: Implement Stripe checkout flow
    toast({ title: 'Info', description: 'Stripe integration coming soon' });
  };

  const handleProceedToPayment = () => {
    if (paymentGateway === 'razorpay') {
      handleRazorpayPayment();
    } else if (paymentGateway === 'stripe') {
      handleStripePayment();
    }
  };

  if (loading || !order) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        Checkout
      </Typography>

      <Grid container spacing={3}>
        {/* Order Summary */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Order Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <List>
                {checkoutData.lineItems?.map((item, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={item.name}
                      secondary={item.description}
                    />
                    <Typography variant="body1">
                      ₹{item.amount.toFixed(2)}
                    </Typography>
                  </ListItem>
                ))}
              </List>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography>Subtotal:</Typography>
                <Typography>₹{order.subtotal.toFixed(2)}</Typography>
              </Box>

              {order.tax > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Tax (18% GST):</Typography>
                  <Typography>₹{order.tax.toFixed(2)}</Typography>
                </Box>
              )}

              {order.discount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography color="success.main">Discount:</Typography>
                  <Typography color="success.main">-₹{order.discount.toFixed(2)}</Typography>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="h6">Total:</Typography>
                <Typography variant="h6" color="primary">
                  ₹{order.total.toFixed(2)}
                </Typography>
              </Box>
            </CardContent>
          </Card>

          {/* Billing Address */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Billing Address
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Street Address"
                    value={billingAddress.street}
                    onChange={(e) => setBillingAddress({ ...billingAddress, street: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="City"
                    value={billingAddress.city}
                    onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="State"
                    value={billingAddress.state}
                    onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Pincode"
                    value={billingAddress.pincode}
                    onChange={(e) => setBillingAddress({ ...billingAddress, pincode: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Country"
                    value={billingAddress.country}
                    onChange={(e) => setBillingAddress({ ...billingAddress, country: e.target.value })}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Payment Method */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Payment Method
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <FormControl component="fieldset">
                <RadioGroup
                  value={paymentGateway}
                  onChange={(e) => setPaymentGateway(e.target.value)}
                >
                  <FormControlLabel
                    value="razorpay"
                    control={<Radio />}
                    label={
                      <Box display="flex" alignItems="center">
                        <Payment sx={{ mr: 1 }} />
                        Razorpay (UPI, Cards, Net Banking)
                      </Box>
                    }
                  />
                  <FormControlLabel
                    value="stripe"
                    control={<Radio />}
                    label={
                      <Box display="flex" alignItems="center">
                        <CreditCard sx={{ mr: 1 }} />
                        Stripe (International Cards)
                      </Box>
                    }
                    disabled
                  />
                </RadioGroup>
              </FormControl>

              <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                Your payment information is secure and encrypted.
              </Alert>

              <Button
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                onClick={handleProceedToPayment}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : <CheckCircle />}
              >
                {loading ? 'Processing...' : `Pay ₹${order.total.toFixed(2)}`}
              </Button>

              <Button
                variant="outlined"
                fullWidth
                sx={{ mt: 1 }}
                onClick={() => navigate('/billing/orders')}
                disabled={loading}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>

          {/* Security Info */}
          <Paper sx={{ p: 2, mt: 2, bgcolor: 'success.lighter' }}>
            <Typography variant="body2" color="success.dark">
              <CheckCircle fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Secure SSL encrypted payment
            </Typography>
            <Typography variant="body2" color="success.dark" sx={{ mt: 0.5 }}>
              <CheckCircle fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              PCI DSS compliant payment gateway
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default OrderCheckout;

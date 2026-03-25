import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Divider,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ArrowBack,
  Download,
  Receipt,
  CheckCircle,
  Payment as PaymentIcon,
  Info
} from '@mui/icons-material';
import { format } from 'date-fns';

const OrderDetails: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/orders/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setOrder(response.data.data.order);
      }
    } catch (error: any) {
      console.error('Fetch order error:', error);
      toast({ title: 'Error', description: 'Failed to load order details', variant: 'destructive' });
      navigate('/billing/orders');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!order?.invoice) return;

    try {
      setDownloadingInvoice(true);
      const token = localStorage.getItem('token');

      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/invoices/${order.invoice.id}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice_${order.invoice.invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast({ title: 'Success', description: 'Invoice downloaded successfully' });
    } catch (error: any) {
      console.error('Download error:', error);
      toast({ title: 'Error', description: 'Failed to download invoice', variant: 'destructive' });
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const getStatusColor = (status: string): any => {
    switch (status) {
      case 'completed':
      case 'success':
        return 'success';
      case 'failed':
      case 'cancelled':
        return 'error';
      case 'pending':
        return 'warning';
      case 'processing':
        return 'info';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!order) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Order not found</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate('/billing/orders')} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4">
          Order Details
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Order Information */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  Order #{order.orderNumber}
                </Typography>
                <Chip
                  label={order.status}
                  color={getStatusColor(order.status)}
                  icon={order.status === 'completed' ? <CheckCircle /> : undefined}
                />
              </Box>

              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Order Type
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {order.orderType}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Order Date
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {format(new Date(order.createdAt), 'dd MMM yyyy, hh:mm a')}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Currency
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {order.currency}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Status
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {order.status}
                  </Typography>
                </Grid>
              </Grid>

              {/* Pricing Breakdown */}
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Pricing Breakdown
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>Subtotal:</Typography>
                  <Typography>{order.currency} {order.subtotal.toFixed(2)}</Typography>
                </Box>

                {order.tax > 0 && (
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography>Tax (GST):</Typography>
                    <Typography>{order.currency} {order.tax.toFixed(2)}</Typography>
                  </Box>
                )}

                {order.discount > 0 && (
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography color="success.main">Discount:</Typography>
                    <Typography color="success.main">-{order.currency} {order.discount.toFixed(2)}</Typography>
                  </Box>
                )}

                <Divider sx={{ my: 2 }} />

                <Box display="flex" justifyContent="space-between">
                  <Typography variant="h6">Total:</Typography>
                  <Typography variant="h6" color="primary">
                    {order.currency} {order.total.toFixed(2)}
                  </Typography>
                </Box>
              </Box>

              {/* Billing Address */}
              {order.billingAddress && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Billing Address
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Typography variant="body2">
                    {order.billingAddress.street && `${order.billingAddress.street}, `}
                    {order.billingAddress.city && `${order.billingAddress.city}, `}
                    {order.billingAddress.state && `${order.billingAddress.state} - `}
                    {order.billingAddress.pincode && order.billingAddress.pincode}
                  </Typography>
                  {order.billingAddress.country && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {order.billingAddress.country}
                    </Typography>
                  )}
                </Box>
              )}

              {/* Notes */}
              {order.notes && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Notes
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Typography variant="body2" color="textSecondary">
                    {order.notes}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          {/* Invoice Card */}
          {order.invoice && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Invoice
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" color="textSecondary">
                    Invoice Number
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {order.invoice.invoiceNumber}
                  </Typography>
                </Box>

                <Box display="flex" justifyContent="space-between" mb={2}>
                  <Typography variant="body2" color="textSecondary">
                    Status
                  </Typography>
                  <Chip
                    label={order.invoice.status}
                    size="small"
                    color={getStatusColor(order.invoice.status)}
                  />
                </Box>

                <Button
                  variant="contained"
                  fullWidth
                  startIcon={downloadingInvoice ? <CircularProgress size={20} /> : <Download />}
                  onClick={handleDownloadInvoice}
                  disabled={downloadingInvoice}
                >
                  Download Invoice
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Payment Information */}
          {order.payments && order.payments.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Payment Information
                </Typography>
                <Divider sx={{ mb: 2 }} />

                {order.payments.map((payment: any, index: number) => (
                  <Paper key={payment.id} sx={{ p: 2, mb: index < order.payments.length - 1 ? 2 : 0 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="body2" fontWeight="medium">
                        Payment #{index + 1}
                      </Typography>
                      <Chip
                        label={payment.status}
                        size="small"
                        color={getStatusColor(payment.status)}
                      />
                    </Box>

                    <Box display="flex" justifyContent="space-between" mb={0.5}>
                      <Typography variant="caption" color="textSecondary">
                        Gateway
                      </Typography>
                      <Typography variant="caption">
                        {payment.gateway}
                      </Typography>
                    </Box>

                    {payment.method && (
                      <Box display="flex" justifyContent="space-between" mb={0.5}>
                        <Typography variant="caption" color="textSecondary">
                          Method
                        </Typography>
                        <Typography variant="caption">
                          {payment.method}
                        </Typography>
                      </Box>
                    )}

                    <Box display="flex" justifyContent="space-between" mb={0.5}>
                      <Typography variant="caption" color="textSecondary">
                        Amount
                      </Typography>
                      <Typography variant="caption" fontWeight="medium">
                        {payment.currency} {payment.amount.toFixed(2)}
                      </Typography>
                    </Box>

                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="caption" color="textSecondary">
                        Date
                      </Typography>
                      <Typography variant="caption">
                        {format(new Date(payment.createdAt), 'dd MMM yyyy, hh:mm a')}
                      </Typography>
                    </Box>
                  </Paper>
                ))}
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default OrderDetails;
